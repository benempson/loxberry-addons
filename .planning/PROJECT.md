# Zigbee Device Watchdog — Loxberry Addon

## What This Is

A Loxberry plugin that monitors Zigbee devices via zigbee2mqtt's MQTT messages and alerts when devices go offline (not seen for a configurable period) or have low battery. Targets a 50+ device Zigbee network where devices regularly drop off and need rejoining or battery replacement.

## Core Value

Proactively alert when Zigbee devices are offline or low on battery so they can be fixed before the user notices missing functionality around the house.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Connect to local Mosquitto MQTT broker and subscribe to zigbee2mqtt topics
- [ ] Track last-seen timestamp for every device zigbee2mqtt knows about
- [ ] Track battery level for battery-powered devices
- [ ] Alert when a device has not been seen for longer than a configurable threshold (default 24 hours)
- [ ] Alert when a device's battery drops below a configurable threshold (default 25%)
- [ ] Send alerts via Loxberry's built-in notification system
- [ ] Send alerts via email (SMTP configuration in UI)
- [ ] Web-based config UI for MQTT connection settings (host, port, credentials)
- [ ] Web-based config UI for alert thresholds (offline hours, battery percentage)
- [ ] Web-based config UI for check interval (how often the watchdog runs)
- [ ] Web-based config UI for notification preferences (enable/disable email vs Loxberry notifications)
- [ ] Device exclusion list — configurable list of devices to skip monitoring
- [ ] Runs as a scheduled check (cron-style), not a persistent daemon
- [ ] Packaged as a proper Loxberry addon/plugin with standard plugin structure

### Out of Scope

- Real-time continuous monitoring daemon — using scheduled checks instead
- Mobile push notifications (Pushover, Telegram) — Loxberry notifications + email sufficient for v1
- Automatic device rejoining — alert only, user fixes manually
- Zigbee network health metrics beyond device presence and battery
- REST API for zigbee2mqtt — using MQTT as data source

## Context

- **Platform:** Loxberry home automation server
- **Zigbee stack:** zigbee2mqtt publishing to local Mosquitto MQTT broker
- **Base MQTT topic:** `zigbee2mqtt` (default)
- **Network size:** 50+ Zigbee devices
- **Problem:** Devices regularly drop off the network and need manual rejoining or battery replacement; currently no proactive alerting
- **Loxberry notifications:** Built-in notification system is configured and working
- **Email:** SMTP config status unknown — will need SMTP settings in plugin config UI
- **First Loxberry plugin:** User has not built a plugin before; need to follow standard Loxberry plugin conventions

## Constraints

- **Runtime:** Node.js 24.3.0, corepack 0.33.0, yarn 1.22.22
- **Plugin framework:** Must follow Loxberry addon/plugin conventions and directory structure
- **Data source:** MQTT only (Mosquitto broker, zigbee2mqtt topics)
- **Execution model:** Cron-scheduled, not long-running

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| MQTT over REST API | zigbee2mqtt reliably publishes device state to MQTT; Mosquitto is already running | — Pending |
| Cron-based over daemon | Simpler, lower resource usage, sufficient for hourly/periodic checks | — Pending |
| Loxberry addon over standalone script | Proper integration with config UI and notification system | — Pending |
| Configurable base topic | Default is `zigbee2mqtt` but should be configurable for non-default setups | — Pending |

---
*Last updated: 2026-03-14 after initialization*
