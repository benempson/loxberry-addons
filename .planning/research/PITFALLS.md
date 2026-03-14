# Pitfalls Research

**Domain:** Loxberry addon — Zigbee device monitoring via zigbee2mqtt / MQTT
**Researched:** 2026-03-14
**Confidence:** MEDIUM (web tools unavailable; findings from deep domain knowledge of MQTT protocol, zigbee2mqtt conventions, Loxberry plugin structure, and Node.js cron-based architecture — flagged per-item)

---

## Critical Pitfalls

### Pitfall 1: MQTT Connection Race in Short-Lived Process

**What goes wrong:** A cron-invoked script connects to the MQTT broker and immediately subscribes and reads — but MQTT connection handshake and `CONNACK` are asynchronous. The script exits before any messages are delivered. Result: zero devices tracked, no errors reported, silent failure.

**Why it happens:** Node.js MQTT clients (`mqtt` npm package) are event-driven. `connect()` does not block. If the script exits after calling `subscribe()` but before the broker delivers retained messages, the event loop drains and the process exits cleanly with empty state.

**How to avoid:**
- Implement a timed collection window: connect, subscribe, then wait a fixed duration (e.g., 2–5 seconds) for retained messages to arrive before processing.
- Use `mqtt` client's `connect` event callback to start the timer only after connection is confirmed.
- Force-close the client with `client.end()` after the window expires — this is the only clean exit path.
- Set `clean: true` on connection options so broker does not queue undelivered messages across cron runs.

**Warning signs:**
- State file always empty after first run.
- Logs show "connected" but no device messages received.
- Script exits in under 100ms.

**Phase to address:** Phase 1 (MQTT connection layer). Must be solved before any other logic can work.

**Confidence:** HIGH — this is a fundamental property of async MQTT clients.

---

### Pitfall 2: Retained Messages vs. Live Messages — Wrong Collection Strategy

**What goes wrong:** The script subscribes to `zigbee2mqtt/+` expecting to receive current device state. For devices that have not published since the broker was last restarted, no retained message exists. The script concludes those devices are offline when they may be fine — just quiet.

**Why it happens:** zigbee2mqtt publishes device state messages with the MQTT `retain` flag. Mosquitto delivers retained messages immediately on subscription. BUT: if Mosquitto was restarted, or the retain store was wiped, no retained messages exist. Also, devices that only publish on state change (motion sensors, contact sensors) may have a retained message from weeks ago — which is actually stale but looks current.

**How to avoid:**
- Treat the `zigbee2mqtt/bridge/devices` topic as the authoritative device list. This topic is published on zigbee2mqtt startup and contains ALL known devices regardless of their last message.
- Use `last_seen` field from device state payloads, not the timestamp of MQTT message receipt, as the authoritative "last active" value.
- Configure zigbee2mqtt with `last_seen: epoch` or `last_seen: ISO_8601` in its config so the field is included in every state message.
- Understand that `last_seen` in the device state payload reflects when zigbee2mqtt last heard from the device at the Zigbee protocol level — more reliable than MQTT timestamp.

**Warning signs:**
- All motion/contact sensors show as "offline" even though they work.
- Devices with no state changes in days show as "online."
- Device count from MQTT differs from device count in zigbee2mqtt UI.

**Phase to address:** Phase 1 (device list sourcing), Phase 2 (last_seen logic).

**Confidence:** HIGH — zigbee2mqtt's `bridge/devices` pattern and `last_seen` field are well-established.

---

### Pitfall 3: zigbee2mqtt Topic Structure Assumptions

**What goes wrong:** Code assumes device topics are always `zigbee2mqtt/<friendly_name>` and that `friendly_name` contains no slashes. In practice, zigbee2mqtt allows grouping devices with slash-separated names (e.g., `zigbee2mqtt/living_room/ceiling_light`). The subscriber pattern `zigbee2mqtt/+` matches only one level — it misses nested names entirely.

**Why it happens:** MQTT wildcard `+` matches exactly one topic level. Multi-level names require `#` wildcard. But subscribing to `zigbee2mqtt/#` picks up all subtopics including `bridge/state`, `bridge/logging`, `bridge/devices`, `bridge/groups`, and system events — requiring careful filtering.

**How to avoid:**
- Subscribe to `zigbee2mqtt/#` (multi-level wildcard) not `zigbee2mqtt/+`.
- Filter out bridge topics: skip any message where topic segment after base is `bridge`, `bridge/state`, `bridge/logging`, `bridge/devices`, `bridge/config`, `bridge/groups`, `bridge/extensions`, `bridge/converters`.
- Use the `zigbee2mqtt/bridge/devices` payload as the device registry — match incoming device topics against the `friendly_name` field in that registry rather than inferring device identity from topic alone.
- Make the base topic (`zigbee2mqtt`) configurable, as some users change it.

**Warning signs:**
- Device count in plugin differs from zigbee2mqtt UI count.
- Bridge events appear in device list (entries named `bridge` or `bridge/state`).
- Any grouped device (slash in name) never appears in tracking.

**Phase to address:** Phase 1 (topic subscription and parsing).

**Confidence:** HIGH — MQTT wildcard semantics are protocol-level facts.

---

### Pitfall 4: State Persistence Fragility Between Cron Runs

**What goes wrong:** The watchdog runs every hour. Between runs, all device state exists only in a JSON file on disk. If the file is written mid-run during a crash, it is corrupted. On next run, the corrupted file causes a parse error and the process exits without sending alerts — or worse, resets all last-seen timestamps to "now," masking devices that have actually gone offline.

**Why it happens:** `fs.writeFileSync()` is not atomic on most filesystems. A crash or power loss mid-write leaves a partial file. JSON is not append-friendly — the entire file must be rewritten each run.

**How to avoid:**
- Use atomic writes: write to a temp file (`state.json.tmp`), then `fs.renameSync()` to the final path. `rename()` is atomic on POSIX and close-enough on Windows/ext4.
- On startup, always wrap `JSON.parse(fs.readFileSync(...))` in a try/catch. On parse failure, log a warning and treat state as empty (never crash).
- Never reset timestamps on parse failure — if state cannot be loaded, treat it as "no data" and skip alerting for that run, not "all devices just came online."
- Store state in Loxberry's plugin data directory (`/opt/loxberry/data/plugins/<pluginname>/`), not in a temp or working directory that may be cleaned.

**Warning signs:**
- Occasional cron runs that produce no output or alerts.
- State file is 0 bytes or truncated (readable by checking file size at run start).
- After system reboots, all devices reported as suddenly online.

**Phase to address:** Phase 1 (state file architecture), must be correct from the start.

**Confidence:** HIGH — atomic write pattern is well-established in systems programming.

---

### Pitfall 5: Alert Fatigue with 50+ Devices

**What goes wrong:** A device drops off the Zigbee network temporarily (common during Zigbee mesh re-routing, coordinator restart, or interference). The watchdog fires an alert. The device rejoins 30 minutes later. Next cron run fires another alert if the threshold check is naive. With 50+ devices and frequent transient drops, the user receives 10–20 spurious alerts per week and starts ignoring them.

**Why it happens:** A simple "last_seen > threshold" check without hysteresis or cooldown fires on every cron run while the condition is true, and also when a device briefly dips below threshold and recovers.

**How to avoid:**
- Implement a **cooldown period**: once an alert has been sent for a device, do not resend until either (a) the device recovers and goes offline again, or (b) a configurable escalation period elapses (e.g., 48 hours of no resolution).
- Track `alert_sent_at` timestamp per device in the state file alongside `last_seen`.
- Only send an alert when transitioning from "ok" to "alert" state — not on every run while in "alert" state.
- For battery alerts, add a **hysteresis band**: alert at <25%, do not re-alert until battery rises above 30% then drops below 25% again.
- Consider a **minimum offline duration before alerting**: if a device was last seen 25 hours ago but your threshold is 24 hours, that is likely a transient drop — consider a longer threshold or a "must be offline for 2 consecutive checks" rule.

**Warning signs:**
- User receives repeated emails for the same device over multiple days.
- Alert log grows continuously for the same device IDs.
- User adds devices to the exclusion list to stop noise rather than fixing the device.

**Phase to address:** Phase 2 (alert logic). The state schema must support cooldown from the start (Phase 1), even if the cooldown logic comes later.

**Confidence:** HIGH — alert fatigue is a universal monitoring system failure mode, well-documented in site reliability engineering literature.

---

### Pitfall 6: Loxberry Plugin Directory Structure Non-Compliance

**What goes wrong:** Plugin installs but Loxberry cannot find config UI, config file, or cron entries because files are in wrong paths. Or plugin uninstalls but leaves behind data files because the plugin manifest did not declare them. Or upgrade overwrites user config because the installer script did not check for existing config.

**Why it happens:** Loxberry has a strict, convention-based directory layout. Deviating from it — even by one directory level — breaks integration silently. First-time plugin authors commonly miss:
- Config files must live in `/opt/loxberry/config/plugins/<pluginname>/` — not in the plugin code directory.
- Web UI files must live in `/opt/loxberry/webfrontend/htmlauth/plugins/<pluginname>/` (authenticated) or `/opt/loxberry/webfrontend/html/plugins/<pluginname>/` (public).
- The plugin installer script (`preinstall.sh`, `postinstall.sh`) must be idempotent — the user may reinstall to upgrade.
- Cron jobs must be registered through Loxberry's cron system, not added to system crontab directly.
- The `plugin.cfg` manifest must declare name, version, and author exactly as Loxberry expects.

**How to avoid:**
- Study the official Loxberry plugin template repository before writing any code.
- Follow the `REPLACEMENTS` variable naming convention in installer scripts (Loxberry's installer replaces tokens like `REPLACELBDIR`, `REPLACELBHOMEDIR`).
- In `postinstall.sh`, check if config already exists before writing default config — use `[ -f "$configfile" ] || cp default.cfg "$configfile"` pattern.
- Register cron via `LBSysc::cron()` API (Perl) or equivalent, not by writing to `/etc/cron.d/` directly.
- Test install, uninstall, and reinstall before any other testing.

**Warning signs:**
- Config UI page returns 404.
- Plugin appears installed but cron never runs.
- After upgrade, user config is reset to defaults.
- Uninstall leaves orphan files in config or data directories.

**Phase to address:** Phase 1 (plugin scaffolding). Get structure right before writing any business logic.

**Confidence:** MEDIUM — based on Loxberry plugin development documentation knowledge. Loxberry is a niche platform; some specifics may have changed. Verify against current Loxberry plugin template repo before implementing.

---

### Pitfall 7: MQTT Credentials and Connection Config Hardcoded or Mis-Stored

**What goes wrong:** MQTT broker credentials (username, password) are stored in a config file with world-readable permissions, or hardcoded in the script, or stored in the plugin's code directory (which may be overwritten on upgrade).

**Why it happens:** Loxberry config directory is separate from plugin code directory specifically so upgrades don't overwrite user config. First-time authors store config in the wrong place.

**How to avoid:**
- Store all user-configurable values (MQTT host, port, username, password, thresholds) in `/opt/loxberry/config/plugins/<pluginname>/watchdog.cfg` (INI format — Loxberry's standard).
- Set file permissions to 640 (owner read/write, group read) in `postinstall.sh`.
- Never store credentials in environment variables in a cron script — other processes can read `/proc/<pid>/environ`.
- Use Loxberry's `LBWeb::plugindata()` or equivalent config reading helpers to load config, rather than parsing INI files manually.

**Warning signs:**
- Config file is world-readable (`-rw-r--r--`).
- MQTT password appears in process list (`ps aux`).
- After plugin upgrade, MQTT connection fails because config was overwritten.

**Phase to address:** Phase 1 (plugin scaffolding and config).

**Confidence:** MEDIUM — Loxberry config conventions are stable but verify current INI format and permissions convention.

---

### Pitfall 8: zigbee2mqtt `availability` vs. `last_seen` Confusion

**What goes wrong:** Developer reads the `availability` topic (`zigbee2mqtt/<device>/availability`) and treats `offline` payload as "device is broken." In fact, `availability` reflects whether zigbee2mqtt can reach the device right now — it can be `offline` for seconds during mesh re-routing and then recover. Using this as the sole signal generates extreme noise.

**Why it happens:** zigbee2mqtt publishes two distinct concepts:
1. `availability` — real-time reachability, changes rapidly during mesh events.
2. `last_seen` in the device state payload — last time the device sent any Zigbee message.

These are not the same. A device can be `availability: offline` for 5 minutes while the mesh heals, then come back. But `last_seen` from 3 days ago means the device is truly gone.

**How to avoid:**
- Use `last_seen` (from device state payloads or `bridge/devices`) as the primary staleness signal — not `availability`.
- If checking `availability`, use it only as a supplementary signal or ignore it entirely.
- Note that `availability` checking must be enabled in zigbee2mqtt config (`availability: true`) — it is off by default. Do not depend on it being present.

**Warning signs:**
- Alerts fire and resolve multiple times per hour for healthy devices.
- Alert timing correlates with coordinator restarts or permit-join events.

**Phase to address:** Phase 1 (device state data model).

**Confidence:** HIGH — this is a documented zigbee2mqtt behavior distinction.

---

### Pitfall 9: Node.js Process Does Not Exit Cleanly After MQTT Collection

**What goes wrong:** The MQTT client keeps the Node.js event loop alive indefinitely. The cron job starts a new process every hour. After days of operation, dozens of zombie Node.js processes accumulate, consuming memory and file descriptors until the Loxberry server becomes unresponsive.

**Why it happens:** The `mqtt` npm package opens a TCP socket and keeps it open until `client.end()` is called. If the script does not explicitly call `client.end()` — or calls it without waiting for the callback — the event loop stays alive and the process hangs. The cron job does not wait for the previous run to finish.

**How to avoid:**
- Always call `client.end(false, () => { process.exit(0); })` as the final step after processing.
- Add a hard timeout (`setTimeout(() => process.exit(1), 30000)`) as a safety net so the process never hangs longer than 30 seconds regardless of MQTT state.
- In `postinstall.sh` or the cron wrapper, check if a previous instance is still running (pidfile lock) and skip the run if so.
- Set the MQTT reconnect period to 0 or disable reconnect entirely (`reconnectPeriod: 0`) for a short-lived script — reconnection is useful for daemons, harmful here.

**Warning signs:**
- `ps aux | grep node` shows multiple watchdog processes running simultaneously.
- Server memory usage grows over days.
- Cron log shows runs starting but `client.end()` log line never appears.

**Phase to address:** Phase 1 (MQTT connection layer). The exit strategy must be designed upfront.

**Confidence:** HIGH — Node.js event loop lifecycle and MQTT TCP socket behavior are well-understood.

---

### Pitfall 10: Battery Percentage Missing on Mains-Powered Devices

**What goes wrong:** Code iterates all devices and checks `battery` field. Mains-powered devices (smart plugs, wired sensors) never publish a `battery` field. The code either crashes on undefined access or reports all mains-powered devices as "low battery."

**Why it happens:** zigbee2mqtt only publishes `battery` in state payloads for devices that expose the battery cluster. Mains-powered devices have no such field. The `bridge/devices` registry includes a `power_source` field per device that distinguishes `Battery`, `Mains (single phase)`, `DC Source`, etc.

**How to avoid:**
- Use `bridge/devices` registry to classify each device's `power_source` before any battery check.
- Skip battery alert logic entirely for devices where `power_source` is not `Battery`.
- Treat missing `battery` field as "no battery data" (skip), not "0% battery" (alert).
- Handle the case where `battery` is present but null or NaN — defensive parsing required.

**Warning signs:**
- Smart plugs and wired devices appear in low-battery alert list.
- Crash logs show `TypeError: Cannot read property 'battery' of undefined` or similar.

**Phase to address:** Phase 2 (device classification and battery logic).

**Confidence:** HIGH — zigbee2mqtt `power_source` field in `bridge/devices` is documented behavior.

---

### Pitfall 11: Friendly Name Changes Breaking State Continuity

**What goes wrong:** A device is renamed in zigbee2mqtt (friendly_name changed from `0x1234abc` to `Living Room Motion`). The watchdog's state file still has the old name. The old entry is never updated (device appears perpetually offline), and the new name starts fresh (cooldown history lost, alert fires immediately).

**Why it happens:** The state file keys on `friendly_name`. zigbee2mqtt allows renaming at any time. There is no migration hook.

**How to avoid:**
- Key state on device IEEE address (`ieee_address`), not `friendly_name`. The IEEE address is the permanent hardware identifier that never changes.
- Use `friendly_name` only for display in the UI and alert messages — fetch it fresh from `bridge/devices` each run.
- On each run, reconcile state file keys: any IEEE address in the state file not present in current `bridge/devices` is a removed device (clean up); any IEEE address in `bridge/devices` not in state file is new (initialize with empty history).

**Warning signs:**
- Renamed devices appear twice in device list (old name and new name).
- After rename, immediately receives "offline" alert for the new name.
- State file grows unbounded with orphaned entries for removed devices.

**Phase to address:** Phase 1 (state schema design). Must use IEEE address as primary key from the start — retrofitting this is painful.

**Confidence:** HIGH — IEEE address permanence is a Zigbee protocol property; friendly_name mutability is a zigbee2mqtt design choice.

---

## Technical Debt Patterns

| Pattern | How It Starts | Long-Term Consequence | Prevention |
|---------|---------------|----------------------|------------|
| Keying state on friendly_name | "It's readable in logs" | Rename = data loss + duplicate alerts | Use ieee_address from day 1 |
| Alert on every failing check | "Simpler to implement" | Alert fatigue, notifications ignored | Implement alert_sent_at cooldown in state schema from Phase 1 |
| Hardcoded MQTT topic prefix | "Always zigbee2mqtt anyway" | Breaks for users with custom topics | Config-driven base topic from Phase 1 |
| Fire-and-forget MQTT connection | "Works in testing" | Zombie processes after weeks | Hard timeout + pidfile lock from Phase 1 |
| Parse battery on all devices | "All devices have battery" | Crash on mains-powered devices | Check power_source before battery check |
| Monolithic cron script | "Only one file to maintain" | Impossible to unit test connection logic | Separate collection, state, alert into modules |
| Config in plugin code directory | "Easy to find" | Upgrade wipes user settings | Follow Loxberry config directory convention |

---

## Integration Gotchas

### MQTT / Mosquitto

| Gotcha | Detail | Mitigation |
|--------|--------|------------|
| Local broker auth may be disabled | Many home Mosquitto installs have no auth — config UI must handle empty username/password gracefully | Allow blank credentials in config; connect without auth if blank |
| Retained message delivery window | Retained messages arrive immediately after subscribe, but only within current TCP session | Collect for a fixed window (2–5s) after subscribe, not just "until first message" |
| QoS 0 message loss | zigbee2mqtt default publish QoS is 0 (fire-and-forget) — a message sent while disconnected is lost | Do not rely on receiving a message during connection window for all devices; rely on retained messages from prior publishes |
| Broker TLS | Some setups use TLS on port 8883 — config UI must expose TLS toggle | Add `tls` option to MQTT config schema even if not used in v1 |
| `clean: true` vs `clean: false` | With `clean: false`, broker queues missed messages — for a cron script this causes a burst of stale messages on reconnect | Always use `clean: true` for short-lived cron processes |
| Connection timeout | If broker is unreachable, default MQTT connect timeout can be 30s — cron run hangs | Set explicit `connectTimeout: 5000` on mqtt client options |

### zigbee2mqtt

| Gotcha | Detail | Mitigation |
|--------|--------|------------|
| `last_seen` disabled by default | zigbee2mqtt does not include `last_seen` unless configured (`last_seen: epoch` in z2m config) | Document this as a prerequisite; check for missing `last_seen` field gracefully |
| `bridge/devices` published only on startup | Not re-published on demand; must be captured during collection window or use `bridge/request/devices` to trigger re-publish | Subscribe before the collection window starts; send a `bridge/request/devices` get request to force re-publish |
| Device with `interview_completed: false` | Devices still being interviewed have incomplete metadata — do not alert on these | Filter devices where `interview_completed !== true` from monitoring |
| Group topics mimic device topics | zigbee2mqtt publishes groups at `zigbee2mqtt/<group_name>` — indistinguishable from device topics by name alone | Use `bridge/devices` + `bridge/groups` to build an explicit exclusion list of group names |
| `friendly_name` with special chars | Names with `#`, `+`, or `/` can break MQTT topic matching | Validate or sanitize names from bridge/devices; IEEE address key avoids this |
| Coordinator itself in device list | The Zigbee coordinator appears in `bridge/devices` but does not behave like a normal device | Filter by `type: "Coordinator"` from bridge/devices payload |

### Loxberry Plugin System

| Gotcha | Detail | Mitigation |
|--------|--------|------------|
| Plugin name length limit | Plugin technical name must be short (no spaces, lowercase) — used in file paths | Choose a name ≤20 chars, all lowercase, underscores only |
| Installer runs as root | `postinstall.sh` runs as root — file ownership must be explicitly set | `chown loxberry:loxberry` all created files in postinstall |
| CGI vs PHP UI | Loxberry UI can be CGI (Perl), PHP, or static — Node.js cannot serve Loxberry UI pages natively | Use PHP or Perl for the config UI page; call Node.js script for MQTT operations only |
| Loxberry notification API | LBSysc notification functions require correct plugin name registration | Test notification API in isolation before integrating with MQTT logic |
| Cron minimum interval | Loxberry cron system may enforce a minimum interval (typically 1 minute) | Design check interval config to accept minutes, not seconds |
| Version numbering | Plugin version must follow Loxberry's expected format (typically `x.y.z`) — non-conforming versions break the update checker | Use semver from day 1 |

---

## Sources

All findings are from training-data knowledge of the following authoritative sources. Web tools were unavailable during this research session; these sources should be verified directly before implementation.

- zigbee2mqtt MQTT topics and messages documentation: https://www.zigbee2mqtt.io/guide/usage/mqtt_topics_and_messages.html (MEDIUM confidence — verify current topic structure and `last_seen` config options)
- zigbee2mqtt configuration reference (`last_seen`, `availability`): https://www.zigbee2mqtt.io/guide/configuration/ (MEDIUM confidence)
- Loxberry plugin development documentation: https://www.loxberry.de/docs/ (MEDIUM confidence — niche platform, verify directory layout and installer conventions against current template)
- Loxberry plugin template repository: https://github.com/mschlenstedt/LoxBerry (MEDIUM confidence — confirm current template branch)
- MQTT protocol specification (OASIS): https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/mqtt-v3.1.1.html (HIGH confidence — wildcard semantics, retain flag, QoS behavior are protocol-level)
- npm `mqtt` package documentation: https://github.com/mqttjs/MQTT.js (HIGH confidence — `reconnectPeriod`, `connectTimeout`, `client.end()` behavior)
- Node.js event loop documentation: https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick (HIGH confidence — process exit behavior)
