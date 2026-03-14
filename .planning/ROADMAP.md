# Roadmap: Zigbee Device Watchdog

## Overview

Build a Loxberry plugin that monitors 50+ Zigbee devices via zigbee2mqtt MQTT messages and alerts when devices go offline or have low battery. The build progresses from MQTT foundation and state persistence, through threshold evaluation and alert delivery, to web config UI, and finally plugin packaging. Phases 1-3 are strictly sequential (each layer builds on the last). Phase 4 depends on stable schemas from 1-3. Phase 5 wraps everything for distribution.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: MQTT Foundation and State Persistence** - Connect to MQTT broker, drain retained messages, build device registry, persist state with atomic writes
- [ ] **Phase 2: Threshold Evaluation and Alert Logic** - Track last-seen and battery, evaluate offline/low-battery thresholds, deduplicate alerts, handle exclusions
- [ ] **Phase 3: Alert Delivery** - Send alerts via Loxberry notifications and SMTP email, detect bridge offline state
- [ ] **Phase 4: Web Config UI** - PHP config pages for MQTT settings, thresholds, exclusions, notification preferences, and device status table
- [ ] **Phase 5: Plugin Packaging and Release** - Loxberry addon directory structure, install/uninstall scripts, cron registration

## Phase Details

### Phase 1: MQTT Foundation and State Persistence
**Goal**: Plugin connects to the MQTT broker, collects device data from zigbee2mqtt retained messages, and persists device state reliably between cron runs
**Depends on**: Nothing (first phase)
**Requirements**: MQTT-01, MQTT-02, MQTT-03, MQTT-04, MQTT-05, DEVT-01, DEVT-04, DEVT-05, PLUG-05
**Success Criteria** (what must be TRUE):
  1. Plugin connects to a configurable Mosquitto broker, subscribes to zigbee2mqtt topics, collects retained messages for a timed window, and disconnects cleanly without leaving zombie processes
  2. Plugin parses bridge/devices and builds a device registry keyed on IEEE address with friendly name, power source, and device type
  3. Plugin reads config from an INI file that both Node.js and PHP can parse
  4. Plugin writes device state to a JSON file atomically (temp file + rename) and reads it back on subsequent runs without data loss
  5. Plugin uses a pidfile lock to prevent overlapping cron runs
**Plans:** 4 plans

Plans:
- [ ] 01-01-PLAN.md — Project scaffold, test fixtures, and INI config reader
- [ ] 01-02-PLAN.md — MQTT collector and device registry modules
- [ ] 01-03-PLAN.md — State store (atomic JSON) and pidfile lock
- [ ] 01-04-PLAN.md — Main entry point wiring all modules together

**Research flag**: VERIFY on live Loxberry host -- cron fragment path, plugin.cfg field names, plugin directory layout. Inspect an existing installed plugin as reference.

### Phase 2: Threshold Evaluation and Alert Logic
**Goal**: Plugin evaluates device health against configurable thresholds and tracks alert state transitions to prevent duplicate alerts
**Depends on**: Phase 1
**Requirements**: DEVT-02, DEVT-03, ALRT-01, ALRT-02, ALRT-03, ALRT-04, ALRT-05
**Success Criteria** (what must be TRUE):
  1. Plugin tracks last-seen timestamp per device (from payload field or message receipt time as fallback) and flags devices not seen beyond a configurable threshold (default 24 hours)
  2. Plugin tracks battery level for battery-powered devices only (identified via power_source) and flags devices below a configurable threshold (default 25%)
  3. Plugin alerts only on transition from "ok" to "alert" state and clears alert state when a device recovers -- no duplicate alerts on consecutive runs
  4. Plugin skips all monitoring for devices on the exclusion list
**Plans**: TBD

Plans:
- [ ] 02-01: TBD

### Phase 3: Alert Delivery
**Goal**: Plugin delivers alert notifications through Loxberry's built-in system and SMTP email, with clear messages identifying the problem device and status
**Depends on**: Phase 2
**Requirements**: ALRT-06, NOTF-01, NOTF-02, NOTF-03
**Success Criteria** (what must be TRUE):
  1. Plugin sends alerts via Loxberry's built-in notification system when enabled
  2. Plugin sends alerts via SMTP email using configurable SMTP settings when enabled
  3. Alert messages include device friendly name, status (offline or low battery), and relevant detail (hours since last seen or battery percentage)
  4. Plugin detects bridge offline state via bridge/state topic and raises a separate alert
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

**Research flag**: VERIFY Loxberry notification API on live system -- exact path and CLI arguments for the notification helper. Test notification delivery in isolation before wiring to the alert pipeline.

### Phase 4: Web Config UI
**Goal**: User can configure all plugin settings and view device status through a PHP web interface integrated with Loxberry's admin UI
**Depends on**: Phase 3
**Requirements**: CONF-01, CONF-02, CONF-03, CONF-04, CONF-05, CONF-06
**Success Criteria** (what must be TRUE):
  1. User can configure MQTT connection settings (host, port, base topic, username, password) through the web UI
  2. User can configure alert thresholds (offline hours, battery percentage), cron interval, and notification preferences (enable/disable Loxberry notifications and email, SMTP settings)
  3. User can manage a device exclusion list through the web UI
  4. User can view a device status table showing all tracked devices with last-seen age, battery level, and current alert state
  5. Config changes persist to the INI file and are picked up by the next cron run without restart
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

**Research flag**: VERIFY PHP version on Loxberry host. Find standard Loxberry PHP header/footer include path by inspecting an existing plugin's UI file. Use PHP 5.6-compatible syntax unless confirmed modern.

### Phase 5: Plugin Packaging and Release
**Goal**: Plugin is packaged as a proper Loxberry addon that installs, upgrades, and uninstalls cleanly
**Depends on**: Phase 4
**Requirements**: PLUG-01, PLUG-02, PLUG-03, PLUG-04
**Success Criteria** (what must be TRUE):
  1. Plugin follows Loxberry addon directory structure conventions and installs without errors
  2. Plugin includes an idempotent postinstall.sh that preserves user config on upgrade
  3. Plugin includes an uninstall.sh that cleanly removes all plugin artifacts
  4. Plugin registers its cron job via Loxberry's cron system at the user-configured interval
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. MQTT Foundation and State Persistence | 0/4 | Planned | - |
| 2. Threshold Evaluation and Alert Logic | 0/? | Not started | - |
| 3. Alert Delivery | 0/? | Not started | - |
| 4. Web Config UI | 0/? | Not started | - |
| 5. Plugin Packaging and Release | 0/? | Not started | - |
