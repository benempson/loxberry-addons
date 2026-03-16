# Phase 5: Plugin Packaging and Release - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Package the existing Zigbee Device Monitor plugin as a proper Loxberry addon that installs, upgrades, and uninstalls cleanly. Includes postinstall.sh, uninstall.sh, cron registration, plugin metadata, and directory structure. Does NOT add new monitoring capabilities or modify existing functionality.

</domain>

<decisions>
## Implementation Decisions

### Install Behavior
- postinstall.sh creates a default config file with sensible defaults (localhost:1883, 24h offline, 25% battery, notifications disabled) on first install
- On upgrade, postinstall.sh preserves existing config — only creates default if no config file exists
- Always run `npm install` on install/upgrade to ensure dependencies match shipped package.json
- postinstall.sh creates the data directory (mkdir -p) and sets permissions (chown to loxberry user) defensively
- Cron job enabled automatically on first install with default 60-minute interval

### Uninstall Cleanup
- Full cleanup: remove config file, state.json, data directory, cron job registration, logs
- Deregister cron job to prevent orphaned watchdog runs after uninstall
- Clear any pending Loxberry notifications from this plugin
- No option to preserve data — clean uninstall removes everything

### Cron Registration
- Web UI changes to cron interval automatically update the Loxberry cron registration (no manual steps)
- Preset dropdown for intervals: 5min, 15min, 30min, 60min (default), 2h, 4h, 6h, 12h, 24h
- Maps to Loxberry's cron system capabilities

### Plugin Metadata
- Plugin name: "Zigbee Device Monitor"
- Author: Ben Empson
- Version: 0.1.0 (pre-release, matches current package.json)
- Minimal README.md: what it does, prerequisites (zigbee2mqtt, Mosquitto), quick setup steps, configuration location

### Claude's Discretion
- Loxberry plugin.cfg format and required fields (research needed — verify on live system)
- Exact Loxberry cron API for registration/deregistration
- Plugin directory structure mapping (which files go where in the Loxberry tree)
- preinstall.sh / preuninstall.sh if needed
- Icon/logo for plugin manager (optional)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bin/watchdog.js`: Main entry point, already uses PLUGIN_NAME and BASE_DIR env vars for path resolution
- `bin/lib/config.js`: DEFAULTS object defines the exact INI structure — postinstall.sh default config must match
- `webfrontend/htmlauth/index.php`: Already uses Loxberry SDK globals ($lbsconfigdir, $lbpdatadir, etc.)
- `package.json`: Dependencies already declared, version 0.1.0
- `templates/lang/language_en.ini`: Language strings for web UI

### Established Patterns
- Config path: `/opt/loxberry/config/plugins/zigbee_watchdog/watchdog.cfg`
- Data path: `/opt/loxberry/data/plugins/zigbee_watchdog/`
- State file: `state.json` in data directory
- Lock file: `watchdog.lock` in data directory
- PLUGIN_NAME constant: `zigbee_watchdog` (used in watchdog.js)
- PHP uses Loxberry SDK: `LBWeb::lbheader()`, `LBWeb::lbfooter()`, `$lbsconfigdir`, `$lbpdatadir`

### Integration Points
- Cron job calls: `node /opt/loxberry/bin/plugins/zigbee_watchdog/watchdog.js`
- PHP web UI save handler needs to update cron registration when interval changes
- postinstall.sh must ensure node_modules are installed in the plugin bin directory
- Loxberry expects specific directory structure: bin/, config/, data/, webfrontend/htmlauth/, templates/

</code_context>

<specifics>
## Specific Ideas

- Plugin name "Zigbee Device Monitor" is more user-friendly than internal "zigbee_watchdog" — but internal PLUGIN_NAME stays as-is for path compatibility
- Version 0.1.0 signals "works but not battle-tested" — appropriate for first Loxberry plugin
- Default config on install means the plugin starts working immediately for common setups (localhost MQTT broker)
- Cron interval dropdown in web UI (Phase 4 backport: change free-text to dropdown) with automatic cron re-registration

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-plugin-packaging-and-release*
*Context gathered: 2026-03-16*
