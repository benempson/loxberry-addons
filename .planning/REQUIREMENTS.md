# Requirements: Zigbee Device Watchdog

**Defined:** 2026-03-14
**Core Value:** Proactively alert when Zigbee devices are offline or low on battery so they can be fixed before the user notices missing functionality around the house.

## v1 Requirements

### MQTT Connection (MQTT)

- [x] **MQTT-01**: Plugin connects to local Mosquitto broker with configurable host, port, username, password
- [x] **MQTT-02**: Plugin subscribes to configurable base topic (default `zigbee2mqtt`) — not hardcoded
- [x] **MQTT-03**: Plugin uses a timed drain window (2-5s) to collect retained messages, then disconnects cleanly with `client.end()`
- [x] **MQTT-04**: Plugin sets a hard process exit timeout (30s) as safety net against zombie processes
- [x] **MQTT-05**: Plugin uses pidfile lock to prevent overlapping cron runs

### Device Tracking (DEVT)

- [x] **DEVT-01**: Plugin parses `bridge/devices` to build device registry with IEEE address, friendly name, power source, and device type
- [x] **DEVT-02**: Plugin tracks `last_seen` per device from device payloads (falls back to message receipt time if `last_seen` not present)
- [x] **DEVT-03**: Plugin tracks `battery` level for battery-powered devices only (identified via `power_source` field)
- [x] **DEVT-04**: Plugin persists device state to a JSON file between cron runs, keyed on IEEE address (not friendly name)
- [x] **DEVT-05**: State file writes are atomic (write to temp file, rename) to prevent corruption

### Alerting Logic (ALRT)

- [x] **ALRT-01**: Plugin alerts when a device has not been seen for longer than a configurable threshold (default 24 hours)
- [x] **ALRT-02**: Plugin alerts when a battery-powered device's battery drops below a configurable threshold (default 25%)
- [x] **ALRT-03**: Plugin suppresses duplicate alerts — only alerts on transition from "ok" to "alert" state per device
- [x] **ALRT-04**: Plugin clears alert state when a device recovers (seen again / battery rises above threshold)
- [x] **ALRT-05**: Plugin skips monitoring for devices on the exclusion list
- [x] **ALRT-06**: Plugin detects bridge offline state via `bridge/state` topic and alerts separately

### Notification Delivery (NOTF)

- [x] **NOTF-01**: Plugin sends alerts via Loxberry's built-in notification system
- [x] **NOTF-02**: Plugin sends alerts via SMTP email using configurable SMTP settings
- [x] **NOTF-03**: Alert messages include device friendly name, status (offline/low battery), and relevant detail (last seen time / battery %)

### Web Config UI (CONF)

- [x] **CONF-01**: PHP config page for MQTT connection settings (host, port, base topic, username, password)
- [x] **CONF-02**: PHP config page for alert thresholds (offline hours, battery percentage)
- [x] **CONF-03**: PHP config page for notification preferences (enable/disable Loxberry notifications, enable/disable email, SMTP settings)
- [x] **CONF-04**: PHP config page for device exclusion list
- [x] **CONF-05**: PHP config page for cron interval setting
- [x] **CONF-06**: Device status table showing all tracked devices with last-seen age, battery level, and current alert state

### Plugin Packaging (PLUG)

- [x] **PLUG-01**: Plugin follows Loxberry addon directory structure conventions
- [x] **PLUG-02**: Plugin includes idempotent `postinstall.sh` that preserves user config on upgrade
- [x] **PLUG-03**: Plugin includes `uninstall.sh` for clean removal
- [x] **PLUG-04**: Plugin registers cron job via Loxberry's cron system
- [x] **PLUG-05**: Config stored as INI file readable by both Node.js and PHP

## v2 Requirements

### Enhanced Monitoring

- **ENHM-01**: Per-device offline threshold overrides (some devices legitimately report rarely)
- **ENHM-02**: Link quality warnings when LQI is persistently low
- **ENHM-03**: "Device back online" recovery notifications
- **ENHM-04**: Dual-mode detection: use zigbee2mqtt availability topics when enabled, fall back to last_seen inference

### Enhanced UX

- **ENUX-01**: Alert snooze/acknowledgement from web UI
- **ENUX-02**: Separate alert channels per severity (battery = email digest, offline = immediate)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Persistent daemon process | Cron model is simpler, lower resource, sufficient for periodic checks |
| Automatic device rejoining | zigbee2mqtt join is interactive/stateful; out of scope |
| Zigbee network topology map | Requires real-time processing + graph frontend; not a monitoring tool |
| Mobile push (Pushover, Telegram) | Loxberry notifications + email sufficient; avoids API key management |
| zigbee2mqtt REST API | MQTT is already in scope and more reliable |
| Historical trending / graphing | Requires time-series storage; out of scope for a watchdog |
| Device configuration writes | Read-only subscriber; no `zigbee2mqtt/<name>/set` commands |
| Multi-instance support | Single MQTT broker, single base topic |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MQTT-01 | Phase 1 | Complete |
| MQTT-02 | Phase 1 | Complete |
| MQTT-03 | Phase 1 | Complete |
| MQTT-04 | Phase 1 | Complete |
| MQTT-05 | Phase 1 | Complete |
| DEVT-01 | Phase 1 | Complete |
| DEVT-02 | Phase 2 | Complete |
| DEVT-03 | Phase 2 | Complete |
| DEVT-04 | Phase 1 | Complete |
| DEVT-05 | Phase 1 | Complete |
| ALRT-01 | Phase 2 | Complete |
| ALRT-02 | Phase 2 | Complete |
| ALRT-03 | Phase 2 | Complete |
| ALRT-04 | Phase 2 | Complete |
| ALRT-05 | Phase 2 | Complete |
| ALRT-06 | Phase 3 | Complete |
| NOTF-01 | Phase 3 | Complete |
| NOTF-02 | Phase 3 | Complete |
| NOTF-03 | Phase 3 | Complete |
| CONF-01 | Phase 4 | Complete |
| CONF-02 | Phase 4 | Complete |
| CONF-03 | Phase 4 | Complete |
| CONF-04 | Phase 4 | Complete |
| CONF-05 | Phase 4 | Complete |
| CONF-06 | Phase 4 | Complete |
| PLUG-01 | Phase 5 | Complete |
| PLUG-02 | Phase 5 | Complete |
| PLUG-03 | Phase 5 | Complete |
| PLUG-04 | Phase 5 | Complete |
| PLUG-05 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---
*Requirements defined: 2026-03-14*
*Last updated: 2026-03-14 after initial definition*
