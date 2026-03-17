---
status: testing
phase: 04-web-config-ui
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md]
started: 2026-03-16T11:00:00Z
updated: 2026-03-16T11:00:00Z
---

## Current Test

number: 1
name: Settings Tab Loads with Current Config
expected: |
  Navigate to the plugin config page. Three tabs visible: Settings, Exclusions, Device Status. Settings tab is active by default. MQTT fields (host, port, base topic, username, password) are pre-filled from watchdog.cfg. Threshold fields (offline hours, battery %) and cron interval are also pre-filled.
awaiting: user response

## Tests

### 1. Settings Tab Loads with Current Config
expected: Navigate to the plugin config page. Three tabs visible: Settings, Exclusions, Device Status. Settings tab is active by default. MQTT fields (host, port, base topic, username, password) are pre-filled from watchdog.cfg. Threshold fields (offline hours, battery %) and cron interval are also pre-filled.
result: [pending]

### 2. SMTP Fields Toggle Visibility
expected: On the Settings tab, the SMTP fields (host, port, user, password, from, to) are hidden when "Enable email" is off. Toggle "Enable email" on — SMTP fields appear. Toggle off — they hide again.
result: [pending]

### 3. Password Fields Masked with Reveal
expected: MQTT password and SMTP password fields show dots (masked). Clicking the eye icon next to each reveals the actual value. Clicking again re-masks it. Values are pre-filled from config.
result: [pending]

### 4. Save Settings Persists to INI
expected: Change a setting (e.g., offline hours from 24 to 12). Click Save. Page reloads with a green "Settings saved" flash message. The changed value is still showing the new value (12). Open watchdog.cfg on disk — the value is updated.
result: [pending]

### 5. Exclusions Tab Shows All Devices
expected: Click the Exclusions tab. A checkbox list of all discovered devices appears (from state.json), sorted alphabetically by friendly name. Previously excluded devices are pre-checked. A search/filter box is visible above the list.
result: [pending]

### 6. Exclusion Search Filter
expected: Type part of a device name in the search box. The checkbox list filters to show only matching devices. Clear the search — all devices reappear.
result: [pending]

### 7. Save Exclusions Updates INI
expected: Check/uncheck some devices on the Exclusions tab. Click Save. Page reloads confirming save. Open watchdog.cfg — EXCLUSIONS.devices contains the comma-separated IEEE addresses of checked devices.
result: [pending]

### 8. Device Status Table Display
expected: Click the Device Status tab. A table shows all tracked devices with columns: Device Name, Last Seen (human-readable age like "2h ago"), Battery (percentage or "Mains"), Status (color-coded badge: green OK, red Offline, orange Low Battery, grey Excluded). A "Last updated" timestamp is shown.
result: [pending]

### 9. Device Status Default Sort and Re-sort
expected: By default, devices with active alerts appear at top (offline first, then low battery), then excluded, then OK alphabetically. Clicking a column header re-sorts the table by that column. Clicking again toggles ascending/descending.
result: [pending]

### 10. Refresh Data Button
expected: On the Device Status tab, click "Refresh Data". The page waits briefly (watchdog runs via exec, up to 30s), then reloads with updated device data. The "Last updated" timestamp reflects the current time.
result: [pending]

### 11. Test MQTT Connection Button
expected: On the Settings tab, click "Test MQTT Connection". Settings are saved first, then the test runs. A result banner appears: green "Connection successful" if the broker is reachable, or red with an error message if it fails.
result: [pending]

### 12. Send Test Email Button
expected: On the Settings tab (with email enabled and SMTP settings filled), click "Send Test Email". Settings are saved first, then a test email is sent. A result banner shows success or error. Check inbox — test email received.
result: [pending]

## Summary

total: 12
passed: 0
issues: 0
pending: 12
skipped: 0

## Gaps

[none yet]
