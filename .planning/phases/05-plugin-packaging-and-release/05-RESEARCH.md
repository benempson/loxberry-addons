# Phase 5: Plugin Packaging and Release - Research

**Researched:** 2026-03-16
**Domain:** Loxberry addon packaging, install/uninstall lifecycle, cron registration
**Confidence:** HIGH

## Summary

Loxberry plugins follow a well-documented directory convention where source repository folders map directly to installed paths under `/opt/loxberry/`. The plugin ZIP contains top-level directories (`bin/`, `config/`, `webfrontend/`, `templates/`, `data/`, `cron/`, `uninstall/`, `icons/`) plus lifecycle scripts (`postinstall.sh`, `postroot.sh`, etc.) and a `plugin.cfg` metadata file. During installation, Loxberry copies each directory's contents into the corresponding system path, renaming cron scripts and uninstall files to the plugin's folder name.

Our plugin already has the correct runtime directory layout (`bin/`, `webfrontend/htmlauth/`, `templates/`) and uses the Loxberry PHP SDK constants (`LBPCONFIGDIR`, `LBPDATADIR`, `LBPBINDIR`). The remaining work is: creating `plugin.cfg`, writing `postinstall.sh` (create default config, `npm install`, register cron), writing `uninstall` script (remove cron, notifications, data), and implementing dynamic cron re-registration from the PHP web UI when the user changes the interval.

**Primary recommendation:** Use Loxberry's `cron.d` crontab approach (via `installcrontab.sh`) for dynamic interval changes rather than the fixed cron directory approach, since the user needs configurable intervals beyond the preset folders.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- postinstall.sh creates a default config file with sensible defaults (localhost:1883, 24h offline, 25% battery, notifications disabled) on first install
- On upgrade, postinstall.sh preserves existing config -- only creates default if no config file exists
- Always run `npm install` on install/upgrade to ensure dependencies match shipped package.json
- postinstall.sh creates the data directory (mkdir -p) and sets permissions (chown to loxberry user) defensively
- Cron job enabled automatically on first install with default 60-minute interval
- Full cleanup on uninstall: remove config file, state.json, data directory, cron job registration, logs
- Deregister cron job to prevent orphaned watchdog runs after uninstall
- Clear any pending Loxberry notifications from this plugin
- No option to preserve data -- clean uninstall removes everything
- Web UI changes to cron interval automatically update the Loxberry cron registration (no manual steps)
- Preset dropdown for intervals: 5min, 15min, 30min, 60min (default), 2h, 4h, 6h, 12h, 24h
- Plugin name: "Zigbee Device Monitor"
- Author: Ben Empson
- Version: 0.1.0
- Minimal README.md

### Claude's Discretion
- Loxberry plugin.cfg format and required fields
- Exact Loxberry cron API for registration/deregistration
- Plugin directory structure mapping
- preinstall.sh / preuninstall.sh if needed
- Icon/logo for plugin manager (optional)

### Deferred Ideas (OUT OF SCOPE)
None

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PLUG-01 | Plugin follows Loxberry addon directory structure conventions | Detailed directory mapping below; existing code already follows conventions |
| PLUG-02 | Plugin includes idempotent postinstall.sh that preserves user config on upgrade | postinstall.sh pattern documented with environment variables and exit codes |
| PLUG-03 | Plugin includes uninstall.sh for clean removal | uninstall script pattern documented; placed in `uninstall/` directory |
| PLUG-04 | Plugin registers cron job via Loxberry's cron system | Two approaches documented; `installcrontab.sh` recommended for dynamic intervals |

</phase_requirements>

## Standard Stack

### Core (Loxberry Plugin Infrastructure)

| Component | Purpose | Why Standard |
|-----------|---------|--------------|
| `plugin.cfg` | Plugin metadata (name, version, author, system requirements) | Required by Loxberry plugin manager for install/update/display |
| `postinstall.sh` | Post-install setup (config defaults, npm install, cron registration) | Standard Loxberry lifecycle hook; runs as user `loxberry` |
| `uninstall/uninstall` | Cleanup script (remove cron, notifications, data) | Runs as `root` during uninstall; renamed to plugin name on install |
| `installcrontab.sh` | System wrapper for cron registration | Located at `/opt/loxberry/sbin/installcrontab.sh`; allows dynamic cron changes |
| `notify.sh` | Loxberry notification bash library | Located at `$LBHOMEDIR/libs/bashlib/notify.sh`; used for clearing notifications |

### Supporting (Already In Place)

| Component | Purpose | Status |
|-----------|---------|--------|
| `bin/watchdog.js` | Main cron entry point | Existing; uses `LOXBERRY_DIR` env var |
| `webfrontend/htmlauth/index.php` | Config UI with cron interval setting | Existing; needs cron re-registration on save |
| `bin/lib/config.js` | Config DEFAULTS object | Existing; postinstall default config must match |
| `templates/lang/language_en.ini` | Language strings | Existing |

### No New npm Dependencies Required

All runtime dependencies are already declared in `package.json`. No additional libraries needed for packaging.

## Architecture Patterns

### Plugin Source Directory Structure (ZIP archive layout)

```
zigbee-watchdog/
  plugin.cfg                          # Plugin metadata
  postinstall.sh                      # Post-install hook (runs as loxberry)
  icons/                              # Plugin manager icon
    icon_64.png                       # 64x64 PNG (optional but recommended)
  bin/                                # -> /opt/loxberry/bin/plugins/zigbee_watchdog/
    watchdog.js
    test-mqtt.js
    test-email.js
    lib/
      bridge-monitor.js
      config.js
      device-registry.js
      email-notify.js
      email-template.js
      evaluator.js
      loxberry-notify.js
      mqtt-collector.js
      notify.js
      state-store.js
  config/                             # -> /opt/loxberry/config/plugins/zigbee_watchdog/
    (empty -- postinstall creates default config)
  data/                               # -> /opt/loxberry/data/plugins/zigbee_watchdog/
    (empty -- created by postinstall)
  templates/                          # -> /opt/loxberry/templates/plugins/zigbee_watchdog/
    lang/
      language_en.ini
  webfrontend/
    htmlauth/                         # -> /opt/loxberry/webfrontend/htmlauth/plugins/zigbee_watchdog/
      index.php
  uninstall/
    uninstall                         # Cleanup script (runs as root, no .sh extension)
  package.json                        # Shipped in bin/ after install for npm install
```

**Critical note:** Loxberry installs files from each top-level directory to the corresponding system path. The `bin/` directory contents go to `/opt/loxberry/bin/plugins/<FOLDER>/`. The `package.json` must be accessible from the `bin/` install path for `npm install` to work.

### Pattern 1: plugin.cfg Format

**What:** INI-format metadata file required by Loxberry plugin manager.
**Source:** Verified from LoxBerry-Plugin-SamplePlugin-V2-PHP and multiple real plugins.

```ini
[AUTHOR]
NAME=Ben Empson
EMAIL=

[PLUGIN]
VERSION=0.1.0
NAME=zigbee_watchdog
FOLDER=zigbee_watchdog
TITLE=Zigbee Device Monitor

[AUTOUPDATE]
AUTOMATIC_UPDATES=false
RELEASECFG=
PRERELEASECFG=

[SYSTEM]
REBOOT=false
LB_MINIMUM=2.0.0
LB_MAXIMUM=false
ARCHITECTURE=false
CUSTOM_LOGLEVELS=false
INTERFACE=2.0
```

**Key rules:**
- `NAME` and `FOLDER` must NEVER change across versions (breaks update detection)
- `NAME` must be lowercase, no spaces
- `FOLDER` is the plugin's subdirectory name in all Loxberry paths
- `TITLE` is the display name (max 25 characters) -- "Zigbee Device Monitor" is exactly 22 chars
- `INTERFACE=2.0` is required for modern Loxberry

### Pattern 2: postinstall.sh Environment Variables

**What:** Variables available to the postinstall script.
**Source:** Verified from LoxBerry-Plugin-SamplePlugin-V2-PHP and PhilipsAir plugin.

```bash
#!/bin/bash

# Arguments passed by Loxberry installer
ARGV0=$0        # Script path
ARGV1=$1        # Temp folder during install
ARGV2=$2        # Plugin short name (NAME from plugin.cfg)
ARGV3=$3        # Plugin folder (FOLDER from plugin.cfg)
ARGV4=$4        # Plugin version
ARGV5=$5        # Loxberry base folder

# Derived paths (LBHOMEDIR from /etc/environment)
PCONFIG=$LBHOMEDIR/config/plugins/$ARGV3
PDATA=$LBHOMEDIR/data/plugins/$ARGV3
PBIN=$LBHOMEDIR/bin/plugins/$ARGV3
PLOG=$LBHOMEDIR/log/plugins/$ARGV3

# Exit codes:
# 0 = success
# 1 = warning (installation continues)
# 2 = failure (installation cancels)
```

### Pattern 3: Dynamic Cron Registration via cron.d

**What:** Use `installcrontab.sh` to register a custom crontab that can be updated dynamically.
**Why:** The fixed cron directories (cron.01min, cron.05min, etc.) only support specific intervals. The user needs configurable intervals (5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 24h), and many of these (2h, 4h, 6h, 12h) have no matching cron directory.

```bash
# Create crontab file
CRON_FILE="/tmp/zigbee_watchdog_cron"
echo "*/60 * * * * loxberry /usr/bin/node $PBIN/watchdog.js > /dev/null 2>&1" > "$CRON_FILE"

# Install via Loxberry wrapper (replaces 'root' with 'loxberry' for security)
$LBHOMEDIR/sbin/installcrontab.sh $ARGV3 "$CRON_FILE"

# Cleanup
rm -f "$CRON_FILE"
```

**Installed location:** `/opt/loxberry/system/cron/cron.d/<pluginname>`

**Cron expression mapping for intervals:**

| Interval | Cron Expression |
|----------|-----------------|
| 5 min | `*/5 * * * *` |
| 15 min | `*/15 * * * *` |
| 30 min | `*/30 * * * *` |
| 60 min | `0 * * * *` |
| 2 hours | `0 */2 * * *` |
| 4 hours | `0 */4 * * *` |
| 6 hours | `0 */6 * * *` |
| 12 hours | `0 */12 * * *` |
| 24 hours | `0 3 * * *` |

### Pattern 4: Cron Re-registration from PHP Web UI

**What:** When the user saves settings with a new cron interval, PHP must update the cron registration.
**How:** Write a temporary crontab file and call `installcrontab.sh`.

```php
// After writing config, update cron
$interval = intval($new_config['CRON']['interval_minutes']);
$plugin_name = 'zigbee_watchdog';
$cron_expr = interval_to_cron($interval);
$cron_line = "$cron_expr loxberry /usr/bin/node " . LBPBINDIR . "/watchdog.js > /dev/null 2>&1";

$tmp_file = '/tmp/' . $plugin_name . '_cron';
file_put_contents($tmp_file, $cron_line . "\n");
exec(LBHOMEDIR . '/sbin/installcrontab.sh ' . $plugin_name . ' ' . $tmp_file . ' 2>&1', $output, $retval);
unlink($tmp_file);
```

**Helper function to convert minutes to cron expression:**

```php
function interval_to_cron($minutes) {
    if ($minutes < 60) return "*/$minutes * * * *";
    $hours = intval($minutes / 60);
    if ($hours < 24) return "0 */$hours * * *";
    return "0 3 * * *"; // daily at 3am
}
```

### Pattern 5: Uninstall Script

**What:** Script in `uninstall/uninstall` (no .sh extension) that runs as root during plugin removal.
**Source:** Verified from WU4Lox and sample plugins.

```bash
#!/bin/bash
# Runs as ROOT during uninstall (not during upgrade)

# Remove cron job
rm -f $LBHOMEDIR/system/cron/cron.d/$ARGV3 2>/dev/null

# Clear Loxberry notifications
. $LBHOMEDIR/libs/bashlib/notify.sh
delete_notifications $ARGV3 watchdog 2>/dev/null

# Note: Loxberry automatically removes:
# - config/plugins/<name>/
# - data/plugins/<name>/
# - bin/plugins/<name>/
# - webfrontend/htmlauth/plugins/<name>/
# - templates/plugins/<name>/
# - log/plugins/<name>/

exit 0
```

**Important:** Loxberry handles directory cleanup automatically. The uninstall script only needs to handle things outside the plugin directories (cron.d entries, notifications, etc.).

### Anti-Patterns to Avoid

- **Hardcoded paths:** Never hardcode `/opt/loxberry`. Always use `$LBHOMEDIR` (from `/etc/environment`) or PHP SDK constants (`LBHOMEDIR`, `LBPBINDIR`, etc.).
- **Changing NAME or FOLDER in plugin.cfg:** This breaks the update mechanism entirely. Once set, these are permanent.
- **File extensions on cron/uninstall scripts:** Loxberry cron scripts and uninstall scripts must NOT have file extensions.
- **Windows line endings:** All shell scripts MUST use Unix LF line endings. CRLF will cause silent failures.
- **Running npm install as root:** postinstall.sh runs as `loxberry` user. postroot.sh runs as root. npm install belongs in postinstall.sh (as loxberry user).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron scheduling | Custom crontab editing | `installcrontab.sh` wrapper | Handles permissions, user substitution, proper file location |
| Notification cleanup | Manual file deletion | `. notify.sh && delete_notifications` | Loxberry manages notification storage format |
| Plugin path resolution | Hardcoded paths | `$LBHOMEDIR` + plugin.cfg FOLDER | Paths may change across Loxberry versions |
| Directory cleanup | Manual rm -rf in uninstall | Loxberry's built-in removal | Loxberry automatically removes all plugin directories |

## Common Pitfalls

### Pitfall 1: package.json Location for npm install
**What goes wrong:** `npm install` fails because package.json is not in the expected location after Loxberry installs files.
**Why it happens:** Loxberry copies `bin/` contents to `/opt/loxberry/bin/plugins/zigbee_watchdog/`, but `package.json` is at the project root, not inside `bin/`.
**How to avoid:** Ship `package.json` and `yarn.lock` inside the `bin/` directory of the plugin ZIP so they end up in `LBPBINDIR`. The postinstall.sh then runs `cd $PBIN && npm install --production`.
**Warning signs:** `npm install` errors about missing package.json in postinstall output.

### Pitfall 2: Windows Line Endings in Shell Scripts
**What goes wrong:** Scripts fail silently or with cryptic errors like `\r: command not found`.
**Why it happens:** Developing on Windows creates CRLF line endings.
**How to avoid:** Use `.gitattributes` to force LF for `.sh` files and the `uninstall/uninstall` file. Verify with `file` command before packaging.
**Warning signs:** Scripts that work in local testing fail on the Loxberry host.

### Pitfall 3: postinstall.sh Exit Code 2 Cancels Install
**What goes wrong:** A non-critical error in postinstall causes the entire plugin installation to abort.
**Why it happens:** Exit code 2 means "cancel installation." Any uncaught error or `set -e` with a failing command can trigger this.
**How to avoid:** Use explicit error handling. Non-critical operations (like cron registration) should not cause exit 2. Only exit 2 for truly unrecoverable failures. Use exit 1 for warnings.

### Pitfall 4: npm install Without --production Flag
**What goes wrong:** Dev dependencies (jest, etc.) get installed on the Loxberry host, wasting disk space.
**How to avoid:** Always use `npm install --production` in postinstall.sh.

### Pitfall 5: Cron Job Runs During Upgrade
**What goes wrong:** The watchdog runs mid-upgrade when files are partially installed.
**How to avoid:** This is inherently handled by using `installcrontab.sh` (cron is re-registered at end of postinstall). No special action needed if cron is registered last.

### Pitfall 6: Forgetting to Clear Cron in Uninstall
**What goes wrong:** After uninstall, cron keeps firing and fails because the script is gone, generating cron error emails.
**How to avoid:** The uninstall script must explicitly `rm -f $LBHOMEDIR/system/cron/cron.d/$ARGV3`.

## Code Examples

### Complete postinstall.sh

```bash
#!/bin/bash
# postinstall.sh -- runs as user 'loxberry' after install/upgrade
# Exit codes: 0=success, 1=warning, 2=fatal

ARGV1=$1  # temp folder
ARGV2=$2  # plugin name
ARGV3=$3  # plugin folder
ARGV4=$4  # plugin version
ARGV5=$5  # loxberry base

PCONFIG=$LBHOMEDIR/config/plugins/$ARGV3
PDATA=$LBHOMEDIR/data/plugins/$ARGV3
PBIN=$LBHOMEDIR/bin/plugins/$ARGV3
PLOG=$LBHOMEDIR/log/plugins/$ARGV3

echo "<INFO> Zigbee Device Monitor v$ARGV4 - postinstall starting"

# 1. Create data directory
echo "<INFO> Creating data directory"
mkdir -p "$PDATA"
chown loxberry:loxberry "$PDATA"

# 2. Create default config if not present (preserves config on upgrade)
if [ ! -f "$PCONFIG/watchdog.cfg" ]; then
    echo "<INFO> Creating default configuration"
    cat > "$PCONFIG/watchdog.cfg" << 'CFGEOF'
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
drain_seconds = 3

[NOTIFICATIONS]
loxberry_enabled = 0
email_enabled = 0
smtp_host =
smtp_port = 587
smtp_user =
smtp_pass =
smtp_from =
smtp_to =
heartbeat_enabled = 0

[EXCLUSIONS]
devices =
CFGEOF
    chown loxberry:loxberry "$PCONFIG/watchdog.cfg"
else
    echo "<OK> Existing configuration preserved"
fi

# 3. Install Node.js dependencies
echo "<INFO> Installing Node.js dependencies"
cd "$PBIN" && npm install --production 2>&1
if [ $? -ne 0 ]; then
    echo "<WARNING> npm install had issues -- plugin may not work correctly"
fi

# 4. Register cron job (reads interval from config or uses default)
echo "<INFO> Registering cron job"
INTERVAL=60
if [ -f "$PCONFIG/watchdog.cfg" ]; then
    INTERVAL=$(grep -E "^interval_minutes" "$PCONFIG/watchdog.cfg" | sed 's/.*=\s*//' | tr -d '[:space:]')
    [ -z "$INTERVAL" ] && INTERVAL=60
fi

# Build cron expression from interval
if [ "$INTERVAL" -lt 60 ]; then
    CRON_EXPR="*/$INTERVAL * * * *"
elif [ "$INTERVAL" -lt 1440 ]; then
    HOURS=$((INTERVAL / 60))
    CRON_EXPR="0 */$HOURS * * *"
else
    CRON_EXPR="0 3 * * *"
fi

CRON_FILE="/tmp/${ARGV3}_cron"
echo "$CRON_EXPR loxberry /usr/bin/node $PBIN/watchdog.js > /dev/null 2>&1" > "$CRON_FILE"
$LBHOMEDIR/sbin/installcrontab.sh "$ARGV3" "$CRON_FILE" 2>&1
rm -f "$CRON_FILE"

echo "<OK> Zigbee Device Monitor postinstall complete"
exit 0
```

### Complete uninstall Script

```bash
#!/bin/bash
# uninstall -- runs as ROOT during plugin removal
# Loxberry automatically removes plugin directories; this handles extras

# Remove cron.d entry
rm -f "$LBHOMEDIR/system/cron/cron.d/$1" 2>/dev/null

# Clear pending notifications
if [ -f "$LBHOMEDIR/libs/bashlib/notify.sh" ]; then
    . "$LBHOMEDIR/libs/bashlib/notify.sh"
    delete_notifications "$1" watchdog 2>/dev/null
fi

exit 0
```

### PHP Cron Re-registration Helper

```php
/**
 * Convert interval in minutes to a cron expression.
 */
function interval_to_cron($minutes) {
    $minutes = intval($minutes);
    if ($minutes < 60) {
        return "*/$minutes * * * *";
    }
    $hours = intval($minutes / 60);
    if ($hours < 24) {
        return "0 */$hours * * *";
    }
    return "0 3 * * *"; // daily at 3am
}

/**
 * Update the Loxberry cron registration for this plugin.
 */
function update_cron($interval_minutes) {
    $plugin_name = 'zigbee_watchdog';
    $cron_expr = interval_to_cron($interval_minutes);
    $cron_line = "$cron_expr loxberry /usr/bin/node " . LBPBINDIR . "/watchdog.js > /dev/null 2>&1";

    $tmp_file = '/tmp/' . $plugin_name . '_cron';
    file_put_contents($tmp_file, $cron_line . "\n");
    exec(LBHOMEDIR . '/sbin/installcrontab.sh ' . escapeshellarg($plugin_name) . ' ' . escapeshellarg($tmp_file) . ' 2>&1', $output, $retval);
    unlink($tmp_file);
    return $retval === 0;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed cron directories only | `cron.d` + `installcrontab.sh` | Loxberry 1.x+ | Allows custom intervals beyond preset folders |
| Plugin interface 1.0 | Interface 2.0 | Loxberry 2.0 | Required in plugin.cfg `[SYSTEM]` section |
| PHP 5.6 on Loxberry | PHP 7.4 (production) / 8.2 (testing) on Loxberry 3.x | Loxberry 3.0 | Can use PHP 7+ syntax safely; null coalescing (??) is fine |

**PHP version confirmed:** Loxberry 3.x runs PHP 7.4+ (Debian Bullseye/Bookworm). The existing `index.php` already uses `??` (null coalescing) which requires PHP 7.0+. No need to restrict to PHP 5.6 syntax.

## Open Questions

1. **Node.js availability on Loxberry host**
   - What we know: Loxberry does not ship Node.js by default. The Zigbee2MQTT plugin installs its own Node.js.
   - What's unclear: Whether our plugin should declare a Node.js dependency or assume the user has it installed (since they need zigbee2mqtt).
   - Recommendation: Add a check in postinstall.sh for `node` availability. Print a warning if not found. Do NOT attempt to install Node.js -- it is a prerequisite. Document in README.md.

2. **Exact uninstall script argument format**
   - What we know: The uninstall script receives the plugin folder name. Some examples use `$1`, others use `REPLACELBPPLUGINDIR` placeholder.
   - What's unclear: Whether Loxberry passes arguments or uses environment variables for the uninstall script.
   - Recommendation: Use `$LBHOMEDIR` from environment and `$1` for plugin folder name. The WU4Lox example uses `REPLACELBPPLUGINDIR` which suggests Loxberry may do sed replacement during install. Test both approaches; fall back to hardcoded `zigbee_watchdog` if needed.

3. **package.json placement in ZIP**
   - What we know: `npm install` needs package.json in the working directory.
   - What's unclear: Whether Loxberry copies files from the root of the ZIP or only from named subdirectories.
   - Recommendation: Place a copy of `package.json` inside the `bin/` directory of the plugin source. The postinstall.sh does `cd $PBIN && npm install --production`.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.x |
| Config file | `jest.config.js` |
| Quick run command | `npx jest --testPathPattern=PATTERN -x` |
| Full suite command | `npx jest` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLUG-01 | Plugin follows Loxberry addon directory structure | manual-only | N/A -- verified by inspecting ZIP layout | N/A |
| PLUG-02 | Idempotent postinstall preserves config on upgrade | manual-only | N/A -- shell script tested on Loxberry host | N/A |
| PLUG-03 | Uninstall cleanly removes all artifacts | manual-only | N/A -- shell script tested on Loxberry host | N/A |
| PLUG-04 | Cron job registered via Loxberry cron system | unit | `npx jest --testPathPattern=cron -x` | No -- Wave 0 |

**Justification for manual-only:** PLUG-01, PLUG-02, PLUG-03 involve shell scripts that call Loxberry system utilities (`installcrontab.sh`, `notify.sh`) and require a live Loxberry host. These cannot be meaningfully unit tested. PLUG-04's PHP cron helper (`interval_to_cron`) can be tested via a simple Node.js equivalent test.

### Sampling Rate
- **Per task commit:** `npx jest -x`
- **Per wave merge:** `npx jest`
- **Phase gate:** Full suite green + manual install/uninstall test on Loxberry host

### Wave 0 Gaps
- [ ] `tests/cron-helper.test.js` -- covers interval-to-cron expression mapping (PLUG-04)
- No other test gaps -- the majority of this phase is shell scripts and configuration files that require live environment testing

## Sources

### Primary (HIGH confidence)
- [LoxBerry Wiki - Plugin Development Basics](https://wiki.loxberry.de/en/entwickler/grundlagen_zur_erstellung_eines_plugins) - Directory structure, plugin lifecycle
- [LoxBerry-Plugin-SamplePlugin-V2-PHP](https://github.com/christianTF/LoxBerry-Plugin-SamplePlugin-V2-PHP) - Reference plugin structure, all lifecycle scripts
- [LoxBerry Wiki - Cron Jobs](https://wiki.loxberry.de/loxberry_english/english_faq_and_knowledge_base/create_own_cronjob_on_loxberry) - Cron directories, installcrontab.sh usage
- [LoxBerry-Plugin-PhilipsAir postinstall.sh](https://github.com/nufke/LoxBerry-Plugin-PhilipsAir/blob/main/postinstall.sh) - Node.js plugin postinstall pattern with npm install
- [LoxBerry-Plugin-WU4Lox uninstall](https://github.com/mschlenstedt/LoxBerry-Plugin-WU4Lox/blob/master/uninstall/uninstall) - Uninstall script pattern

### Secondary (MEDIUM confidence)
- [LoxBerry-Plugin-Zigbee2Mqtt postroot.sh](https://github.com/romanlum/LoxBerry-Plugin-Zigbee2Mqtt/blob/master/postroot.sh) - Node.js plugin with architecture-aware install
- [LoxBerry Wiki - Notification Functions](https://wiki.loxberry.de/entwickler/perl_develop_plugins_with_perl/perl_loxberry_sdk_dokumentation/perlmodul_loxberrylog/usage_of_the_notification_functions) - delete_notifications API
- [LoxBerry PHP SDK loxberry_system.php](https://github.com/mschlenstedt/Loxberry/blob/master/libs/phplib/loxberry_system.php) - PHP constants LBPCONFIGDIR, LBPDATADIR, etc.

### Tertiary (LOW confidence)
- PHP version on Loxberry 3.x reported as PHP 7.4/8.2 -- needs verification on actual host but consistent across multiple sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- multiple verified real-world plugins follow the same patterns
- Architecture: HIGH -- directory structure well-documented in wiki and sample plugins
- Pitfalls: HIGH -- observed directly from real plugin examples and wiki documentation
- Cron dynamic registration: MEDIUM -- `installcrontab.sh` confirmed in wiki but exact behavior with PHP exec() not verified on live system

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (Loxberry plugin system is stable; changes are infrequent)
