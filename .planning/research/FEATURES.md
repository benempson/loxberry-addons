# Feature Research

**Domain:** Zigbee device monitoring addon (Loxberry + zigbee2mqtt)
**Researched:** 2026-03-14
**Confidence:** MEDIUM (web access denied; zigbee2mqtt topic structure from training data, stable since v1.x; feature categorization from domain knowledge of monitoring tools)

---

## zigbee2mqtt MQTT Topics

zigbee2mqtt publishes to a configurable base topic (default: `zigbee2mqtt`). All topics below use `zigbee2mqtt` as the base — substitute the configured base topic as needed.

### Device State Messages

**Topic:** `zigbee2mqtt/<friendly_name>`

Published whenever a device reports state. Payload is a JSON object whose keys depend on the device type (sensor, switch, etc.).

Common fields relevant to monitoring:

```json
{
  "battery": 42,
  "last_seen": "2026-03-14T10:00:00.000Z",
  "linkquality": 87,
  "voltage": 2900
}
```

- `battery` — integer, percentage (0–100). Present only on battery-powered devices.
- `last_seen` — ISO 8601 timestamp string (format depends on `advanced.last_seen` config). Can be `"ISO_8601"`, `"ISO_8601_local"`, `"epoch"` (unix ms), or disabled. Default is disabled in older versions; enabled as ISO_8601 in recent versions.
- `linkquality` — LQI value (0–255). Signal quality, not presence.
- `voltage` — raw battery voltage in mV, present on some devices alongside `battery`.

**Note:** `last_seen` in the device payload is only present if the zigbee2mqtt config has `advanced.last_seen` set to a value other than `"disable"`. Operators must have this enabled for reliable last-seen tracking via payload inspection.

### Bridge Device List

**Topic:** `zigbee2mqtt/bridge/devices`

Published on startup and whenever the device list changes. Contains a JSON array of all known devices. This is the authoritative device registry.

```json
[
  {
    "ieee_address": "0x00158d0001234567",
    "friendly_name": "living_room_sensor",
    "type": "EndDevice",
    "supported": true,
    "definition": {
      "model": "WSDCGQ11LM",
      "vendor": "Aqara",
      "description": "Temperature and humidity sensor"
    },
    "power_source": "Battery",
    "interviewing": false,
    "interview_completed": true
  }
]
```

Key fields for monitoring:
- `friendly_name` — used to construct device topic paths
- `power_source` — `"Battery"` vs `"Mains (single phase)"` etc. Use to filter which devices need battery monitoring.
- `ieee_address` — stable identifier even if friendly_name changes
- `type` — `"EndDevice"` (most sensors/switches), `"Router"` (mains-powered repeaters), `"Coordinator"`

**Confidence:** HIGH — this topic and payload structure has been stable since zigbee2mqtt 1.x.

### Bridge State

**Topic:** `zigbee2mqtt/bridge/state`

Payload: `{"state": "online"}` or `{"state": "offline"}` (older versions: plain string `"online"` / `"offline"`).

Indicates whether the zigbee2mqtt bridge itself is running. Useful to distinguish "bridge is down" from "device is offline".

### Availability (zigbee2mqtt Availability Feature)

**Topic:** `zigbee2mqtt/<friendly_name>/availability`

Only published when zigbee2mqtt's built-in availability feature is enabled (`availability: true` or `availability: {active: {timeout: N}, passive: {timeout: N}}` in zigbee2mqtt config).

Payload:
```json
{"state": "online"}
```
or
```json
{"state": "offline"}
```

Older zigbee2mqtt versions (pre-1.27 approximately) published plain string `"online"` / `"offline"`. Current versions publish JSON `{"state": "online"}`.

**When availability is enabled**, zigbee2mqtt actively pings devices and marks them offline after a timeout (default: active devices 10 min, passive/battery devices 1500 min = 25 hours). This is the most reliable real-time offline detection mechanism.

**When availability is disabled** (the default in many installations), the addon must infer offline status from the last message timestamp — the `last_seen` approach.

**Confidence:** HIGH for topic structure; MEDIUM for default timeout values (verify against current zigbee2mqtt docs).

### Bridge Log (supplementary)

**Topic:** `zigbee2mqtt/bridge/log`

Event stream including device join/leave events, interview results, error conditions. Not the primary monitoring source but useful for event-driven detection. Payload varies by log type.

### Summary: Topics to Subscribe

| Topic Pattern | Purpose | When Available |
|---------------|---------|----------------|
| `{base}/bridge/devices` | Full device list with power source | Always |
| `{base}/bridge/state` | Bridge up/down | Always |
| `{base}/+` | Device state updates (battery, last_seen) | Always |
| `{base}/+/availability` | Real-time device online/offline | Only if availability feature enabled |

**Monitoring strategy implication:** The addon cannot rely solely on the `/availability` topic because many users have not enabled the zigbee2mqtt availability feature. It must support both modes: availability-topic-based detection AND last_seen timestamp inference.

---

## Feature Landscape

### Table Stakes

Features users expect. Missing means the tool is not viable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Track last-seen per device | Core problem: knowing which devices have gone silent | Low | Read `last_seen` from device payloads or infer from message receipt time |
| Offline alert when device silent > threshold | Core value proposition | Low | Compare now() - last_seen vs configurable threshold |
| Battery level tracking | Core value proposition; battery replacement is the #1 Zigbee maintenance task | Low | Read `battery` field from device payloads |
| Low battery alert | Companion to tracking; useless to track without alerting | Low | Compare battery value vs configurable threshold |
| Configurable offline threshold | Every network is different; motion sensors are expected to be silent overnight | Low | Single value in minutes/hours, default 24h |
| Configurable battery threshold | Preference varies; 20% vs 30% is personal | Low | Integer percentage, default 20–25% |
| Device exclusion list | Dead devices, decorative fixtures, test devices that should never alert | Low | Array of friendly_names or IEEE addresses in config |
| Notification delivery | Alerts are useless without delivery | Medium | At minimum Loxberry notification system; email adds SMTP complexity |
| Web config UI | Loxberry addon standard; users expect UI not file editing | Medium | Must follow Loxberry plugin UI conventions |
| Persisted device state between runs | Cron-based: state cannot be held in memory | Medium | JSON file or SQLite on disk; required for last_seen inference |
| Configurable MQTT connection | Host, port, username, password — every install differs | Low | Standard MQTT client config |
| Handle bridge/devices on startup | Must know all devices to monitor them, including their power source | Low | Subscribe and wait for `bridge/devices` before processing |
| Distinguish battery vs mains devices | Mains-powered devices don't need battery alerts | Low | Use `power_source` from `bridge/devices` |
| Suppress duplicate alerts | Don't re-alert every cron run for the same already-offline device | Medium | Track "alert sent" state per device; clear when device comes back |

### Differentiators

Features that provide competitive advantage for this addon in its niche.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Support both availability-topic AND last_seen modes | Most monitoring scripts pick one; many users haven't enabled zigbee2mqtt availability feature | Medium | Auto-detect which mode is usable, or config flag |
| Alert on bridge going offline | The bridge going down silently is a common failure mode; most watchdogs only watch devices | Low | Subscribe to `bridge/state`; alert if offline |
| Per-device offline threshold override | Some devices legitimately report rarely (door sensors on unused doors, seasonal devices) | Medium | Per-device config map; fallback to global default |
| Alert suppression with snooze | User is replacing batteries all day; don't re-alert for 4 hours after acknowledgement | High | Requires web UI interaction to set snooze; more complex state |
| Link quality warning | LQI below threshold often predicts imminent offline; early warning | Medium | Track `linkquality`; warn when persistently low (not just one reading) |
| Dashboard / status page | Visual overview of all devices with status, battery, last-seen age | Medium | Read-only status page in Loxberry UI; no Loxberry standard for this but feasible |
| Configurable base MQTT topic | Default is `zigbee2mqtt` but some users change it | Low | Required for correctness but often missed by scripts |
| Alert when device comes back online | Confirm the fix worked; close the loop on the alert | Low | Detect transition from "alerting" to "seen again" |
| Separate alert channels per severity | Low battery vs offline may warrant different notification channels | Medium | Battery=email digest, offline=immediate Loxberry notification |

### Anti-Features

Things to deliberately NOT build in this addon.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Persistent daemon process | Cron model is already decided; daemon adds restart/watchdog complexity and Loxberry doesn't expect it | Use cron-scheduled script execution |
| Automatic device rejoining | zigbee2mqtt's join process is interactive and stateful; automating it is error-prone and outside scope | Alert only; user rejoins manually |
| Full Zigbee network map / topology | Network visualization requires real-time MQTT stream processing and a frontend graph; not a monitoring tool anymore | Link to zigbee2mqtt's own frontend |
| Mobile push (Pushover, Telegram, etc.) | Adds API key management, external dependencies, version churn; Loxberry notifications already reach user's phone via the Loxberry app | Use Loxberry notification system |
| zigbee2mqtt REST API usage | REST API requires additional port exposure and auth; MQTT is already in scope and more reliable | MQTT only |
| Historical trending / graphing | Long-term battery graphs require time-series storage (InfluxDB etc.); out of scope for a watchdog | Emit current state only; let external tools graph if needed |
| Device configuration via MQTT | Writing to `zigbee2mqtt/<name>/set` to change device settings is orthogonal to monitoring | Read-only subscriber |
| Custom notification templates (HTML email, etc.) | High complexity for marginal benefit | Plain-text notification with device name, status, last seen time |
| Multi-zigbee2mqtt-instance support | Coordinating two MQTT brokers/namespaces; uncommon need | Single MQTT broker, single base topic |

---

## Feature Dependencies

```
bridge/devices subscription
    └── Power source classification (battery vs mains)
            ├── Battery tracking
            │       └── Low battery alerts
            └── Offline tracking (all device types)
                    └── Offline alerts
                            └── Alert suppression (don't re-alert same device)
                                    └── "Device back online" recovery alert

MQTT connection config
    └── All of the above

Persisted state (disk)
    └── last_seen inference (cron model requires state between runs)
    └── Alert suppression ("already alerted" flag per device)
    └── Battery history (for trend detection, if built)

Notification delivery
    ├── Loxberry notification system (no config; always available)
    └── Email (requires SMTP config)

Web config UI
    ├── MQTT connection settings
    ├── Alert thresholds (offline hours, battery %)
    ├── Device exclusion list
    └── Notification preferences

Availability-topic mode (optional/detected)
    └── Real-time offline detection (replaces last_seen inference)
    └── Requires zigbee2mqtt availability feature to be enabled by user
```

---

## MVP Definition

### Launch with (table stakes, low complexity first)

1. Subscribe to `{base}/bridge/devices` — build device registry with power source
2. Subscribe to `{base}/+` — capture device payloads, record last_seen and battery
3. Persist device state to disk between cron runs (JSON file)
4. Cron-triggered check: compare now() - last_seen vs offline threshold; compare battery vs battery threshold
5. Alert suppression: track which devices are already in "alerting" state; skip re-alert; clear when device seen again
6. Send via Loxberry notification system
7. Send via email (SMTP)
8. Web config UI: MQTT settings, thresholds, exclusion list, notification preferences
9. Device exclusion list (skip monitoring for listed devices)
10. Configurable base MQTT topic (don't hardcode `zigbee2mqtt`)
11. Subscribe to `{base}/+/availability` if messages arrive — use as real-time offline signal; fall back to last_seen if no availability messages seen

### Defer to later milestones

- Per-device threshold overrides (good differentiator; adds config complexity)
- Bridge offline detection (low effort but non-core)
- Link quality warnings (requires multi-reading history; adds noise if not tuned)
- Status dashboard page (read-only UI; nice to have)
- Recovery alert ("device back online") — depends on alert suppression state; low effort add-on once suppression is built

### Never build (anti-features above)

- Daemon, push notifications, network maps, device write commands, REST API usage

---

## Sources

- zigbee2mqtt MQTT topics documentation: https://www.zigbee2mqtt.io/guide/usage/mqtt_topics_and_messages.html (not fetched — web access denied; content from training data, HIGH confidence for stable API)
- zigbee2mqtt availability feature: https://www.zigbee2mqtt.io/guide/configuration/device-availability.html (not fetched; training data, MEDIUM confidence on default timeout values)
- Feature categorization: domain knowledge of home automation monitoring tools, IoT watchdog patterns — MEDIUM confidence
- PROJECT.md requirements: F:/Arrayx/Clients/Arrayx/loxberry-addons/.planning/PROJECT.md — HIGH confidence (primary source)

**Note on web access:** WebSearch and WebFetch were denied during this research session. The zigbee2mqtt MQTT topic structure documented here is well-established (stable since v1.x, the project is at v2.x as of 2025) and sourced from training data. Verify `advanced.last_seen` config key name and availability timeout defaults against current zigbee2mqtt docs before implementation.
