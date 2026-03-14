# Stack Research

**Domain:** Loxberry addon — Zigbee device monitoring via zigbee2mqtt/MQTT
**Researched:** 2026-03-14
**Confidence:** MEDIUM — Loxberry plugin conventions from training data (cutoff Aug 2025); npm packages well-verified. WebSearch and WebFetch were unavailable during research. Verify Loxberry wiki before implementing.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 24.3.0 (pinned by host) | Runtime | Already installed on the Loxberry host; do not choose, it is given |
| mqtt (npm) | 5.x (5.10.x latest as of Aug 2025) | MQTT client — connect to Mosquitto, subscribe to `zigbee2mqtt/#` | The canonical MQTT client for Node.js; actively maintained; supports MQTT 3.1.1 and 5.0; well-typed; no runtime daemon needed for cron-style runs |
| ini (npm) | 4.x | Read/write Loxberry `.cfg` config files | Loxberry stores plugin config as INI-format files; `ini` is the standard parser; lightweight, no deps |
| nodemailer (npm) | 6.x | SMTP email alerts | Battle-tested, zero native deps, supports TLS/STARTTLS, well-maintained through 2025 |
| node-cron (npm) | 3.x | Cron scheduling (if daemon mode needed) | NOTE: PROJECT.md specifies cron-scheduled, not daemon. Use system cron (Loxberry built-in cron job registration) rather than node-cron. Included here only as fallback if system cron is unavailable |

**Confidence:** HIGH for mqtt 5.x and nodemailer 6.x (confirmed stable major versions as of Aug 2025). MEDIUM for ini 4.x (verify current major version on npm). LOW for node-cron (not recommended — see note above).

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fs (built-in) | Node.js built-in | Read/write device state JSON file (last-seen timestamps, battery levels) | Always — persist state between cron runs |
| path (built-in) | Node.js built-in | Build paths to Loxberry plugin directories | Always |
| loxberry (npm) — UNVERIFIED | unknown | Official Loxberry Node.js helper library | LOW CONFIDENCE: may exist as `loxberry` or `loxberry-js` on npm; may not exist at all. Verify before assuming. Fall back to direct INI file reads and HTTP calls to Loxberry's internal API if no official package exists |
| axios (npm) | 1.x | HTTP calls to Loxberry's internal notification API (`/admin/system/tools/loxberry_log.php` style endpoints) | Only needed if Loxberry notification APIs are HTTP-based and no official Node helper exists |

**Confidence:** HIGH for built-ins. LOW for `loxberry` npm package (unverified). MEDIUM for axios (solid library, but may not be needed if direct shell exec or Perl helpers are used instead — see Notification System section).

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| yarn 1.22.22 (pinned by host) | Package management | Already installed; corepack 0.33.0 manages it |
| eslint 9.x | Linting | Flat config format (eslint.config.js) required for eslint 9 |
| prettier 3.x | Code formatting | |
| jest 29.x | Unit testing for watchdog logic | Test offline/battery detection logic without needing a live MQTT broker |

---

## Loxberry Plugin Structure

**Confidence:** MEDIUM — based on Loxberry 3.x/4.x documentation from training data. Verify against https://wiki.loxberry.de/developers/plugin_development/start before implementing.

Loxberry plugins follow a rigid directory convention. All plugin files live under `/opt/loxberry/` on the host. When a plugin is installed, Loxberry extracts its archive and places files into the correct locations.

### Plugin Archive Layout

The plugin is distributed as a `.tar.gz` archive containing the following directory structure. File paths inside the archive map directly to the Loxberry filesystem:

```
<plugin-name>/
├── plugin.cfg                  # REQUIRED: plugin metadata (name, version, author, etc.)
├── preinstall.sh               # Optional: runs before install (root)
├── postinstall.sh              # Optional: runs after install (loxberry user)
├── uninstall.sh                # Optional: cleanup on removal
├── README.md                   # Optional: shown in plugin manager
│
├── webfrontend/
│   └── htmlauth/               # Password-protected web UI pages (Apache-served)
│       └── index.php           # Main config page (PHP or HTML — PHP preferred for Loxberry integration)
│
├── bin/                        # Executable scripts
│   └── watchdog.js             # The Node.js watchdog script (called by cron)
│
├── config/
│   └── plugins/
│       └── <plugin-name>/
│           └── watchdog.cfg    # Default plugin config (INI format, copied on first install)
│
├── log/
│   └── plugins/
│       └── <plugin-name>/      # Log directory (Loxberry log framework writes here)
│
├── data/
│   └── plugins/
│       └── <plugin-name>/      # Plugin runtime data (device state JSON, etc.)
│
└── package.json                # npm/yarn dependencies (installed into bin/ or plugin root)
```

### Key Loxberry Filesystem Paths (on running system)

| Path | Purpose |
|------|---------|
| `/opt/loxberry/config/plugins/<name>/` | Plugin config files (INI format) |
| `/opt/loxberry/log/plugins/<name>/` | Plugin log files |
| `/opt/loxberry/data/plugins/<name>/` | Plugin runtime/state data |
| `/opt/loxberry/webfrontend/htmlauth/plugins/<name>/` | Web UI (Apache-served, auth required) |
| `/opt/loxberry/bin/plugins/<name>/` | Executables and Node scripts |
| `/opt/loxberry/templates/plugins/<name>/` | Optional: HTML templates |

### plugin.cfg — Required Metadata File

The `plugin.cfg` file is mandatory. It defines plugin identity for the Loxberry plugin manager:

```ini
[PLUGIN]
NAME = Zigbee Watchdog
FOLDER = zigbee-watchdog
VERSION = 0.1.0
AUTHOR = Arrayx
DESCRIPTION = Monitors zigbee2mqtt devices and alerts on offline or low-battery devices
LEVEL = 1
; LEVEL 1 = standard plugin; 2 = admin only

[SYSTEM]
; Minimum Loxberry version required
LOXBERRY_MIN_VERSION = 3.0
```

**Confidence:** MEDIUM — field names may vary slightly between Loxberry versions. Verify against an existing plugin's `plugin.cfg` as reference.

### Web Config UI Approach

Loxberry uses Apache and PHP on the host. The web UI for plugins is PHP files served from the `htmlauth/` directory. However, given the Node.js constraint:

**Recommended approach: PHP shell for config UI, Node.js for watchdog logic.**

- Use a minimal PHP config page that reads/writes the INI config file and displays device status from the JSON state file. PHP has built-in `parse_ini_file()` and `file_put_contents()`.
- Do NOT attempt to run an Express.js server as the web UI — Loxberry does not support plugin-managed HTTP servers on custom ports without significant workarounds, and it violates plugin conventions.
- The PHP page calls `bin/watchdog.js` via shell exec for on-demand actions if needed.

**Confidence:** MEDIUM — this is the established pattern for non-PHP plugin logic in Loxberry. Confirm by examining existing plugins that use Python or Node as backend with PHP frontend.

---

## Loxberry Notification System

**Confidence:** MEDIUM — based on Loxberry 3.x/4.x LoxBerry::Log and LoxBerry::System::Notify APIs from training data.

### How Loxberry Notifications Work

Loxberry provides a notification framework accessible from plugins. There are two mechanisms:

#### 1. LoxBerry Log (loxberry_log)

The logging system writes to `/opt/loxberry/log/plugins/<name>/`. From Node.js, write log entries as plain text to that directory. Loxberry's admin UI picks them up automatically.

From Node.js:
```javascript
const fs = require('fs');
const path = require('path');

const logDir = `/opt/loxberry/log/plugins/zigbee-watchdog`;
const logFile = path.join(logDir, `watchdog.log`);

function log(level, message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `${timestamp} [${level}] ${message}\n`);
}
```

#### 2. Loxberry Notify / Notify-Ext (Push Notifications)

Loxberry has a notification system that can push messages to configured notification services (email, push). It is invoked via a Perl helper script or via its internal HTTP API.

**From a Node.js script, use child_process to call the Loxberry notify helper:**

```javascript
const { execSync } = require('child_process');

function loxberryNotify(subject, message, severity) {
  // severity: 0=debug, 3=info, 4=warning, 6=error, 9=fatal
  const cmd = `/opt/loxberry/sbin/loxberry_notify.pl`
              + ` --package=zigbee-watchdog`
              + ` --name="Zigbee Watchdog"`
              + ` --severity=${severity}`
              + ` --subject="${subject.replace(/"/g, '\\"')}"`
              + ` --message="${message.replace(/"/g, '\\"')}"`;
  try {
    execSync(cmd);
  } catch (err) {
    log('ERROR', `Notify failed: ${err.message}`);
  }
}
```

**Confidence:** LOW — the exact path and arguments for `loxberry_notify.pl` must be verified on the target Loxberry installation. The script exists in Loxberry 3.x but its interface may differ.

#### 3. Alternative: HTTP API Endpoint

Loxberry exposes internal HTTP endpoints for some system functions. An alternative to shelling out is to POST to the Loxberry internal API. However, this requires authentication and the endpoint URL varies by version. The shell-exec approach is more reliable for local plugin scripts.

#### 4. For This Plugin — Notification Strategy

Given the complexity of Loxberry's notification API from Node.js, use this layered approach:
1. **Primary:** Direct SMTP email via `nodemailer` — fully self-contained, no Loxberry dependency
2. **Secondary:** Shell exec to `loxberry_notify.pl` for Loxberry's built-in notification (try, catch, log failure)
3. **Fallback:** Log to plugin log file always, regardless of notification success

---

## Installation

Using yarn 1.22.22 (pinned on host):

```bash
# In the plugin's bin/ or root directory
yarn init -y

# Core runtime dependencies
yarn add mqtt@^5.10.0
yarn add nodemailer@^6.9.0
yarn add ini@^4.1.0

# Dev dependencies
yarn add -D eslint@^9.0.0
yarn add -D prettier@^3.0.0
yarn add -D jest@^29.0.0
```

Do NOT run `yarn install` as root during plugin development. The Loxberry plugin postinstall script runs as the `loxberry` user.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| MQTT client | mqtt 5.x | aedes, mosca | aedes/mosca are brokers, not clients |
| MQTT client | mqtt 5.x | mqttjs (older name) | Same package — mqtt IS mqttjs, renamed |
| Config file format | INI (via `ini` package) | JSON, YAML | Loxberry uses INI for all plugin config; breaking from this creates friction with the Loxberry admin UI |
| Email | nodemailer 6.x | emailjs, sendmail | nodemailer is the community standard; better TLS support; more actively maintained |
| Web UI framework | PHP (plain) | Express.js, Fastify | Loxberry serves plugin UI via Apache/PHP; running a separate Node HTTP server requires non-standard port and breaks plugin conventions |
| State persistence | JSON file in `/data/plugins/` | SQLite, Redis | SQLite adds a native dep; Redis is overkill for 50-device state; a single JSON file is sufficient and requires no additional infra |
| Scheduling | System cron (Loxberry cron UI) | node-cron, setInterval | System cron is the correct Loxberry pattern for periodic tasks; keeps the Node process short-lived; no memory leak risk |

---

## What NOT to Use

| Library / Approach | Why Not |
|--------------------|---------|
| Express.js or Fastify for config UI | Loxberry serves plugin UIs via Apache. Running a separate HTTP server requires a custom port and manual Apache proxy config — non-standard, fragile, breaks plugin conventions. Use PHP for the UI layer. |
| node-cron or setInterval for scheduling | The plugin is designed as a short-lived cron-executed script. Running a persistent Node daemon is harder to manage, harder to restart, and uses more memory. Use Loxberry's built-in cron job registration instead. |
| sqlite3 or better-sqlite3 for state | Native addon — requires build tools on the host (python, make, gcc). Loxberry hosts may not have these. A JSON file is sufficient for 50-100 devices. |
| @abandonware/noble or zigbee-herdsman | Direct Zigbee libraries — not needed. zigbee2mqtt already handles the Zigbee layer and publishes to MQTT. Only consume MQTT. |
| MQTT 3.x (mqtt@3.x or mqtt@4.x) | Outdated. mqtt@5.x is the current stable major version with improved TypeScript types and MQTT 5.0 protocol support. |
| Loxberry's Perl LoxBerry::MQTT | Perl-native module — not usable from Node.js directly. Use the Node.js mqtt package instead. |
| dotenv for configuration | Loxberry config lives in INI files in `/opt/loxberry/config/plugins/<name>/`. Use INI, not .env files. |

---

## Loxberry-Specific Implementation Notes

### Cron Job Registration

Loxberry provides a cron UI in the admin panel. Register the watchdog cron job in `postinstall.sh`:

```bash
#!/bin/bash
# postinstall.sh — runs as loxberry user after plugin install
CRONTAB_ENTRY="0 * * * * /usr/bin/node /opt/loxberry/bin/plugins/zigbee-watchdog/watchdog.js >> /opt/loxberry/log/plugins/zigbee-watchdog/cron.log 2>&1"
(crontab -l 2>/dev/null; echo "$CRONTAB_ENTRY") | crontab -
```

**Confidence:** LOW — Loxberry may have its own cron registration API (e.g., `/opt/loxberry/sbin/loxcron.pl`) that is preferred over direct crontab manipulation. Verify on the target system.

### Reading Plugin Config in Node.js

```javascript
const ini = require('ini');
const fs = require('fs');

const configPath = '/opt/loxberry/config/plugins/zigbee-watchdog/watchdog.cfg';
const config = ini.parse(fs.readFileSync(configPath, 'utf-8'));

// Example config structure:
// [MQTT]
// host = localhost
// port = 1883
// username =
// password =
// base_topic = zigbee2mqtt
//
// [ALERTS]
// offline_hours = 24
// battery_threshold = 25
// check_enabled = true
//
// [EMAIL]
// enabled = false
// smtp_host =
// smtp_port = 587
// smtp_user =
// smtp_pass =
// from =
// to =
```

### State File (Persistent Between Cron Runs)

```javascript
const statePath = '/opt/loxberry/data/plugins/zigbee-watchdog/state.json';

// State structure:
// {
//   "devices": {
//     "0x1234567890abcdef": {
//       "friendly_name": "Kitchen Motion",
//       "last_seen": "2026-03-14T10:00:00.000Z",
//       "battery": 45,
//       "excluded": false
//     }
//   },
//   "last_check": "2026-03-14T11:00:00.000Z"
// }
```

---

## Sources

**Note:** WebSearch and WebFetch were both unavailable during this research session. All findings are from training data (cutoff August 2025). Confidence levels reflect this limitation.

| Source | Confidence | URL |
|--------|------------|-----|
| Loxberry plugin development wiki | MEDIUM — from training data | https://wiki.loxberry.de/developers/plugin_development/start |
| Loxberry plugin structure conventions | MEDIUM — from training data | https://wiki.loxberry.de/developers/plugin_structure |
| mqtt npm package (mqttjs) | HIGH — stable major version, well-known | https://www.npmjs.com/package/mqtt |
| nodemailer npm package | HIGH — stable major version, well-known | https://nodemailer.com/ |
| ini npm package | MEDIUM — version needs npm verification | https://www.npmjs.com/package/ini |
| zigbee2mqtt MQTT topics documentation | HIGH — well-documented protocol | https://www.zigbee2mqtt.io/guide/usage/mqtt_topics_and_messages.html |
| Loxberry LoxBerry::Log Perl module (reference for log format) | LOW — extrapolated to Node.js approach | https://wiki.loxberry.de/developers/perl_modules/loxberry_log |

**Items requiring verification on the target Loxberry host before implementation:**
1. Exact path and CLI interface of `loxberry_notify.pl` (or equivalent notification helper)
2. Whether a `loxberry` or `loxberry-js` npm package exists and is maintained
3. Loxberry's preferred cron registration method (direct crontab vs system API)
4. Current Loxberry version on the host (run `cat /opt/loxberry/config/system/version.cfg`)
5. Whether plugin.cfg field names match current Loxberry version
