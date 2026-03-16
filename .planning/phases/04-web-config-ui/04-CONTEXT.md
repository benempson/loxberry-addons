# Phase 4: Web Config UI - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

PHP web interface integrated with Loxberry's admin UI for configuring all plugin settings (MQTT, thresholds, notifications, exclusions, cron interval) and viewing device status. Reads/writes the existing INI config file and reads state.json for status display. Does NOT add new monitoring capabilities or notification channels.

</domain>

<decisions>
## Implementation Decisions

### Page Structure
- Tabbed layout with three tabs: Settings | Exclusions | Device Status
- Settings tab contains all config sections (MQTT, Thresholds, Cron, Notifications) with a single Save button
- SMTP fields show/hide based on "Enable email" toggle (requires small JS)
- Save submits form, writes INI, reloads page with green "Settings saved" flash message
- Device Status tab has a "Refresh Data" button that triggers a one-off watchdog run via PHP `exec()`, then reloads with fresh data

### Device Status Table
- Columns: Device name, Last seen (human-readable age), Battery level, Alert status
- Default sort: alerts first (offline, then low battery), then OK devices alphabetically
- Clickable column headers for client-side re-sorting (requires JS sorting)
- Excluded devices appear in the table with an "Excluded" badge
- Data is a static snapshot from last cron run (state.json); "Last updated" timestamp shown
- No auto-refresh — user manually reloads or uses Refresh Data button

### Exclusion List Management
- Checkbox list of all discovered devices (from state.json), checked = excluded
- Shows friendly name in the UI but stores IEEE address as the matching key
- INI stores both IEEE and friendly name for readability (e.g., `0x00158d0001a2b3c4 # Kitchen motion sensor`)
- Unified list — no separate "currently excluded" section; toggle on/off in one place
- Text filter/search box above the list for finding devices in a 50+ device list

### Config Validation
- Client-side HTML5 validation (required, pattern) for instant feedback, plus PHP server-side validation as safety net
- "Test MQTT Connection" button — attempts connection with entered settings, reports success/failure
- "Send Test Email" button — sends test email using entered SMTP settings (fulfills Phase 3's deferred SMTP validation)
- Password fields (MQTT, SMTP) masked by default with eye icon reveal toggle; pre-filled from INI

### Claude's Discretion
- PHP file structure (single file vs includes)
- Loxberry header/footer integration (research needed — verify on live system)
- CSS styling approach within Loxberry's framework
- JS sorting library choice (or vanilla JS)
- Exact test connection/email implementation details
- Tab implementation (CSS tabs, JS tabs, or separate URL params)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bin/lib/config.js`: Defines the complete INI schema with DEFAULTS, NUMERIC_FIELDS, BOOLEAN_FIELDS — PHP must write INI that matches this exact format
- `bin/watchdog.js`: Main entry point that can be exec'd from PHP for the "Refresh Data" button; has 30s hard timeout built in
- `bin/lib/state-store.js`: state.json has all device data needed for the status table (last_seen, battery, alerts per device, bridge_online)
- `bin/lib/mqtt-collector.js`: Could be referenced for MQTT test connection logic

### Established Patterns
- INI sections: MQTT, THRESHOLDS, CRON, NOTIFICATIONS, EXCLUSIONS
- EXCLUSIONS.devices is comma-separated string in INI, parsed to array by Node.js
- State shape: `{ last_run, bridge_online, bridge_offline_since, devices: { [ieee]: { friendly_name, power_source, type, last_seen, battery, alerts } }, pending_notifications }`
- Boolean values in INI: '0'/'1' (coerced by config.js)

### Integration Points
- Config path: `/opt/loxberry/config/plugins/zigbee_watchdog/watchdog.cfg`
- State path: `/opt/loxberry/data/plugins/zigbee_watchdog/state.json`
- Watchdog binary: `node /opt/loxberry/bin/plugins/zigbee_watchdog/watchdog.js` (for exec)
- PHP must write INI that config.js can read unchanged — shared format is critical
- Loxberry admin UI header/footer includes (research flag: verify paths on live system)

</code_context>

<specifics>
## Specific Ideas

- Exclusion INI format includes both IEEE and friendly name: `0x00158d0001a2b3c4 # Kitchen motion sensor` for human readability
- "Refresh Data" button on Status tab gives immediate feedback without waiting for next cron run
- Test buttons (MQTT connection, test email) reduce setup friction — user verifies config before relying on it for alerting
- With 50+ devices, the search filter on the exclusion list and sortable status table are essential for usability

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-web-config-ui*
*Context gathered: 2026-03-16*
