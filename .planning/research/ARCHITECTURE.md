# Architecture Research

**Domain:** Loxberry addon — Zigbee device monitoring
**Researched:** 2026-03-14
**Confidence:** MEDIUM — Loxberry plugin conventions drawn from training knowledge (cutoff Aug 2025). No live Loxberry system was accessible for verification. Flag items marked [VERIFY] before implementing.

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  LOXBERRY HOST                                                  │
│                                                                 │
│  ┌─────────────┐      MQTT subscribe       ┌─────────────────┐ │
│  │ Mosquitto   │◄──────────────────────────│                 │ │
│  │ MQTT Broker │                           │  watchdog.js    │ │
│  └─────────────┘                           │  (cron script)  │ │
│         │                                  │                 │ │
│         │ publishes                        └────────┬────────┘ │
│         ▼                                           │           │
│  zigbee2mqtt/                              read/write state     │
│  zigbee2mqtt/bridge/devices                         │           │
│  zigbee2mqtt/<device>                               ▼           │
│                                            ┌─────────────────┐ │
│                                            │  state.json     │ │
│                                            │  (flat JSON     │ │
│                                            │   store)        │ │
│                                            └────────┬────────┘ │
│                                                     │           │
│                                            evaluate thresholds  │
│                                                     │           │
│                              ┌──────────────────────┤           │
│                              │                      │           │
│                              ▼                      ▼           │
│                     ┌──────────────┐      ┌──────────────────┐ │
│                     │  Loxberry    │      │  SMTP mailer     │ │
│                     │  Notify API  │      │  (nodemailer)    │ │
│                     └──────────────┘      └──────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Web UI (CGI/PHP or Node HTTP)                          │   │
│  │  config.cgi  →  reads/writes  plugin.cfg                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────┐                                       │
│  │  Loxberry cron       │  triggers watchdog.js every N mins   │
│  │  (plugincron system) │◄─────────────────────────────────────│
│  └──────────────────────┘                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | File(s) | Responsibility | Boundary |
|-----------|---------|---------------|---------|
| MQTT Listener | `bin/watchdog.js` | Connects to Mosquitto, subscribes to `zigbee2mqtt/#`, collects current device state snapshot, disconnects | Owns MQTT session; runs to completion each cron tick |
| State Store | `data/state.json` | Persists last-seen timestamps and battery levels across cron runs | Simple flat JSON; no database needed at this scale (50+ devices) |
| Threshold Checker | `bin/watchdog.js` (inline) | Reads state.json, compares timestamps and battery vs configured thresholds, produces alert list | No I/O except reading state and config |
| Alerter — Loxberry | `bin/notify.js` or inline | Calls Loxberry notification API (`/plugins/loxberry-core/notify`) for in-platform alerts | Loxberry internal HTTP API |
| Alerter — Email | `bin/mailer.js` or inline | Sends SMTP email via nodemailer for offline/low-battery alerts | External SMTP; reads credentials from plugin.cfg |
| Config UI | `webfrontend/htmlauth/index.php` | Shows current device states, lets user set MQTT host/port/topic, thresholds, exclusions, notification prefs | Reads plugin.cfg and state.json; never writes to state.json |
| Plugin Config | `config/plugin.cfg` | INI-format config file: MQTT settings, thresholds, exclusions, notification flags | Read by both watchdog.js and the web UI; written by web UI |
| Cron Entry | `cron/cron.d/<pluginname>` | Defines how often watchdog.js runs (e.g., every 15 minutes) | Managed by Loxberry cron system |

---

## Loxberry Plugin Directory Structure

Loxberry plugins follow a rigid convention under `/opt/loxberry/`. Each plugin gets a namespace folder (the plugin's internal name, e.g., `zigbee-watchdog`) that mirrors across several top-level Loxberry directories.

```
/opt/loxberry/
│
├── bin/plugins/<PLUGINNAME>/          # Executable scripts (cron targets, helpers)
│   ├── watchdog.js                    # Main cron script — MQTT → state → alert
│   └── package.json                   # Node.js dependencies
│
├── config/plugins/<PLUGINNAME>/       # Plugin configuration
│   └── plugin.cfg                     # INI-format: MQTT, thresholds, exclusions
│
├── data/plugins/<PLUGINNAME>/         # Runtime data (writable at all times)
│   └── state.json                     # Persisted device state (timestamps, battery)
│
├── log/plugins/<PLUGINNAME>/          # Log output
│   └── watchdog.log                   # Rotating log; write via LoxBerry log API
│
├── templates/plugins/<PLUGINNAME>/    # Loxberry template engine files (if using Perl CGI)
│   └── (optional — only if using LoxBerry::Web)
│
├── webfrontend/htmlauth/plugins/<PLUGINNAME>/  # Password-protected web UI
│   ├── index.php                      # Main config page
│   └── ajax.php                       # AJAX endpoints for form save / device list
│
└── cron/cron.d/                       # [VERIFY exact path] Cron definitions
    └── <PLUGINNAME>                   # Standard crontab fragment, owned by plugin
```

### Directory Rationale

- `bin/plugins/` — Scripts placed here are accessible to cron and the shell. Node scripts live here. [VERIFY] whether Loxberry's cron system requires the full absolute path or resolves from `bin/plugins/`.
- `config/plugins/` — Loxberry expects plugin config here. The Perl/PHP helper libraries read from this path. Do not use a custom config location.
- `data/plugins/` — The only directory guaranteed writable at runtime. Use this for `state.json`. Do not write to `bin/` or `config/` at runtime.
- `log/plugins/` — Loxberry's log viewer reads from here. Writing here makes logs visible in the Loxberry admin UI. [VERIFY] whether there is a Loxberry logging API callable from Node or whether plain file writes suffice.
- `webfrontend/htmlauth/` — Pages here require Loxberry login. Use `htmlauth` (not `html`) so the config UI is not publicly accessible.
- `cron/cron.d/` — [VERIFY exact path] Loxberry merges cron fragments from this directory into the system crontab. The fragment should be a standard crontab line pointing at the absolute path to `watchdog.js`.

### Plugin Metadata Files

```
/opt/loxberry/data/system/plugindatabase/
└── <PLUGINNAME>.json                  # Plugin registry entry — name, version, author, URLs
```

An install script (`install.sh` or `preinstall.sh` / `postinstall.sh`) is expected in the plugin package root. It handles:
- Registering the plugin in the Loxberry plugin database
- Installing Node dependencies (`npm install` or `yarn install` in `bin/plugins/<PLUGINNAME>/`)
- Setting file permissions
- Installing the cron fragment

---

## Data Flow

```
Every N minutes (cron triggers watchdog.js)
         │
         ▼
1. READ config
   └── /opt/loxberry/config/plugins/<PLUGINNAME>/plugin.cfg
       → MQTT host, port, topic prefix, thresholds, exclusions, notification flags

         │
         ▼
2. CONNECT to MQTT broker (short-lived session)
   └── Subscribe to:
       ├── zigbee2mqtt/bridge/devices   (device list + metadata)
       └── zigbee2mqtt/+                (per-device state messages)
   └── Collect messages for ~5 seconds (configurable drain window)
   └── Disconnect

         │
         ▼
3. MERGE into state store
   └── Read /opt/loxberry/data/plugins/<PLUGINNAME>/state.json
   └── For each device message received:
       ├── Update last_seen = now (if message contains linkquality or any payload)
       └── Update battery = value (if payload contains battery field)
   └── Write updated state.json atomically (write to .tmp, rename)

         │
         ▼
4. EVALUATE thresholds
   └── For each tracked device (excluding exclusion list):
       ├── offline_alert = (now - last_seen) > offline_threshold_hours * 3600
       └── battery_alert = battery < battery_threshold_pct

         │
         ▼
5. DEDUPLICATE alerts
   └── Read state.json alert_sent flags
   └── Only alert if condition is NEW (not already alerted)
   └── Clear alert flag if device recovered

         │
         ▼
6. SEND alerts (for new conditions only)
   ├── Loxberry notification API  (if enabled in config)
   └── SMTP email via nodemailer  (if enabled + SMTP configured)

         │
         ▼
7. WRITE alert state back to state.json
   └── Mark which devices have been alerted (prevent repeat spam)
```

### State File Schema

```json
{
  "last_run": "2026-03-14T10:00:00.000Z",
  "devices": {
    "0x001234567890abcd": {
      "friendly_name": "Living Room Motion",
      "last_seen": "2026-03-14T09:45:00.000Z",
      "battery": 87,
      "alerts": {
        "offline": false,
        "offline_sent_at": null,
        "battery": false,
        "battery_sent_at": null
      }
    }
  }
}
```

The `alerts.offline_sent_at` and `alerts.battery_sent_at` fields prevent re-sending alerts every cron run while a device remains in a bad state. Clear them when the device recovers.

---

## Integration Points

### 1. Loxberry Notification System

Loxberry exposes an internal notification API. From Node.js, call it via HTTP:

```
POST http://localhost/admin/system/tools/notify.cgi
```

[VERIFY] The exact endpoint. Loxberry's notification system may also be callable via a Perl library (`LoxBerry::Log` or `LoxBerry::System`) that wraps a local socket or HTTP call. From Node.js, the safest path is:

- Option A: HTTP POST to Loxberry's CGI endpoint with plugin name and message.
- Option B: Write a notification entry to a known file path that Loxberry's dashboard reads.
- Option C: Execute the Loxberry notify command-line tool via `child_process.execFile`.

[VERIFY] which of these Loxberry actually supports for third-party plugin notifications in the current version (2.x / 3.x). The Loxberry wiki documents this under "Notifications" in the plugin development section.

### 2. Cron Scheduling

Loxberry manages cron via its plugin cron system. The plugin provides a cron fragment file:

```
# /opt/loxberry/cron/cron.d/<PLUGINNAME>  [VERIFY exact path]
*/15 * * * * root /usr/bin/node /opt/loxberry/bin/plugins/<PLUGINNAME>/watchdog.js >> /opt/loxberry/log/plugins/<PLUGINNAME>/watchdog.log 2>&1
```

Key points:
- The cron interval is stored in `plugin.cfg` and the web UI rewrites the cron file when the user changes it. [VERIFY] whether Loxberry has a helper API for this or whether the plugin must manage cron file rewriting itself.
- The script must exit cleanly (exit code 0) even when alerts are sent. Non-zero exit may trigger Loxberry error handling.
- Run as `root` is common for Loxberry plugin cron — [VERIFY] whether a dedicated user is preferred.
- A configurable check interval (e.g., 15 min, 30 min, 1 hour) means the cron file must be regenerated when the user changes the setting via the UI. Store the interval in `plugin.cfg` and have the save handler rewrite the cron fragment.

### 3. Web Config UI

The `webfrontend/htmlauth/plugins/<PLUGINNAME>/index.php` page:
- Is served through Loxberry's nginx reverse proxy
- Requires the user to be authenticated to Loxberry (handled by `htmlauth` path)
- Should use Loxberry's standard HTML template (Bootstrap-based, matching the Loxberry admin UI look) — [VERIFY] whether Loxberry provides a PHP include for standard header/footer

Recommended UI sections:
1. **Connection** — MQTT host, port, base topic, credentials
2. **Alert Thresholds** — offline hours, battery percentage
3. **Check Interval** — how often cron runs (dropdown: 15m, 30m, 1h, 4h)
4. **Notifications** — toggle Loxberry notifications on/off, toggle email on/off, SMTP settings
5. **Exclusions** — device list with checkboxes to exclude from monitoring
6. **Device Status** — read-only table showing all tracked devices, last seen, battery, alert state (read from `state.json`)

The "Device Status" section should read `state.json` directly in PHP (or via an AJAX call to `ajax.php`) — it is read-only and does not modify state.

### 4. Plugin Configuration File Format

Loxberry uses INI format for `plugin.cfg`:

```ini
[MQTT]
host = localhost
port = 1883
base_topic = zigbee2mqtt
username =
password =

[THRESHOLDS]
offline_hours = 24
battery_pct = 25

[CRON]
interval_minutes = 60

[NOTIFICATIONS]
loxberry_enabled = 1
email_enabled = 0
smtp_host =
smtp_port = 587
smtp_user =
smtp_pass =
smtp_from =
smtp_to =

[EXCLUSIONS]
# Comma-separated list of friendly names or IEEE addresses
devices =
```

Read from Node.js using the `ini` npm package. Read from PHP using `parse_ini_file()`.

---

## Component Build Order

Dependencies flow bottom-up. Build in this sequence:

```
Phase 1 — Foundation
  ├── Plugin directory scaffolding (install.sh, package.json, plugin.cfg template)
  └── Config file reader (Node: ini parser, PHP: parse_ini_file)
        ↓
Phase 2 — Data Layer
  ├── MQTT listener (connect, subscribe, drain, disconnect)
  └── State store (read/write state.json with atomic writes)
        ↓
Phase 3 — Logic Layer
  ├── Threshold checker (offline + battery evaluation)
  └── Alert deduplication (alert_sent flags in state.json)
        ↓
Phase 4 — Alert Delivery
  ├── Loxberry notification integration
  └── SMTP email via nodemailer
        ↓
Phase 5 — Web UI
  ├── Config form (read/write plugin.cfg)
  ├── Device status table (read state.json)
  └── Cron interval management (rewrite cron fragment on save)
        ↓
Phase 6 — Packaging
  └── install.sh, uninstall.sh, plugin metadata, release archive
```

Rationale for this order:
- The MQTT listener has no UI dependency — build and test it standalone first.
- State store must exist before threshold checker can run.
- Alert delivery depends on knowing which alerts to send — comes after checker.
- Web UI is last because it reads both config and state, and both must be stable before UI integration.
- Packaging last because it wraps everything that already works.

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Persistence | Flat JSON file | 50-100 devices is trivially small; no database overhead; atomic writes via rename are reliable |
| MQTT session style | Short-lived (drain window) | Cron-based model; connect, collect 5s of retained messages, disconnect; avoids daemon complexity |
| UI language | PHP (CGI) | Loxberry's native web UI language; Perl CGI also works but PHP is more maintainable for JS developers |
| Config format | INI (`plugin.cfg`) | Loxberry convention; readable by both Node (`ini` package) and PHP (`parse_ini_file`) |
| Alert dedup | Flag in state.json | Simplest approach; no separate alert log needed; survives restarts |
| Node package manager | yarn 1.22.22 | Matches runtime constraint in PROJECT.md |

---

## Key Risks and Constraints

| Risk | Severity | Mitigation |
|------|----------|------------|
| MQTT drain window too short to receive all retained messages | HIGH | zigbee2mqtt publishes retained state; a 3-5 second window after subscribe should capture all device topics; make configurable |
| Loxberry notification API endpoint not documented for Node.js | MEDIUM | Fall back to writing a notification file or shelling out to Loxberry CLI; [VERIFY] before Phase 4 |
| Cron fragment path differs between Loxberry versions | MEDIUM | [VERIFY] actual path on target Loxberry version before implementing cron management |
| PHP version on Loxberry may not support modern PHP features | LOW | Use basic PHP 5.6-compatible syntax for maximum compatibility; avoid modern PHP 8 features unless version is known |
| `state.json` corruption on concurrent cron runs | LOW | Atomic write (write to `.tmp`, rename); cron interval should be longer than script runtime |

---

## What Needs Verification on Target System

Items marked [VERIFY] above require checking on the actual Loxberry installation before implementation:

1. **Exact cron fragment directory** — `/opt/loxberry/cron/cron.d/` vs another path
2. **Loxberry notification API** — exact HTTP endpoint or CLI tool for plugin notifications
3. **Plugin database registration** — exact JSON format for `plugindatabase/<PLUGINNAME>.json`
4. **Loxberry web template includes** — PHP header/footer include paths for UI consistency
5. **Log API** — whether Loxberry has a Node-callable logging helper or plain file writes suffice
6. **PHP version** — run `php -v` on the Loxberry host before writing UI code

These can be verified in Phase 1 (scaffolding) by inspecting an existing plugin on the live system:
```bash
ls /opt/loxberry/bin/plugins/
ls /opt/loxberry/config/plugins/
ls /opt/loxberry/cron/
cat /opt/loxberry/data/system/plugindatabase/*.json | head -40
```

---

## Sources

- Loxberry plugin development conventions: training knowledge (cutoff Aug 2025) — MEDIUM confidence
- zigbee2mqtt MQTT topic structure (`zigbee2mqtt/#`, `zigbee2mqtt/bridge/devices`): training knowledge — HIGH confidence (stable API, unchanged since 1.x)
- Loxberry directory layout (`/opt/loxberry/{bin,config,data,log}/plugins/<name>/`): training knowledge — MEDIUM confidence; [VERIFY] on target system
- Node.js `ini` package for INI config parsing: well-established npm package — HIGH confidence
- nodemailer for SMTP: well-established npm package — HIGH confidence
- Atomic JSON write pattern (write to `.tmp`, rename): standard POSIX pattern — HIGH confidence
