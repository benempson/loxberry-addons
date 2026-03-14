# Project Research Summary

**Project:** Zigbee Device Watchdog — Loxberry Addon
**Domain:** Loxberry addon — Zigbee device monitoring
**Researched:** 2026-03-14
**Confidence:** MEDIUM

## Executive Summary

This project is a cron-scheduled Loxberry plugin that monitors Zigbee devices via the zigbee2mqtt MQTT broker, alerts on offline devices and low batteries, and provides a web config UI. Experts build this class of plugin with a strict separation of concerns: a short-lived Node.js script handles MQTT collection and alerting (invoked by Loxberry's cron system), a flat JSON file persists device state between cron runs, and a PHP page serves the config UI through Loxberry's Apache/authentication layer. This is not a daemon — it is a cron-executed process that must connect, collect, evaluate, alert, and exit cleanly every run. The MQTT drain-window pattern (connect, wait 2–5 seconds for retained messages, disconnect, process) is the correct model for this architecture.

The recommended stack is purpose-built for the constraints of the Loxberry host: Node.js 24 (pinned by host), `mqtt` 5.x for MQTT client, `nodemailer` 6.x for SMTP alerts, and `ini` 4.x for reading Loxberry's INI-format config files. The web UI must be PHP — not Node — because Loxberry serves plugin UIs through Apache and has no mechanism for plugin-managed HTTP servers. State is a single JSON file keyed on IEEE device addresses (not friendly names), stored in Loxberry's `/data/plugins/` directory, written atomically on every run. Notification delivery uses a layered strategy: Loxberry's built-in notify helper (`loxberry_notify.pl`) as primary, direct SMTP email via nodemailer as secondary.

The primary risks in this project are Loxberry-specific: plugin directory structure must follow Loxberry conventions exactly or the plugin silently breaks, and several Loxberry-specific integration points (cron registration, notification API path, plugin.cfg field names) cannot be fully verified from training data and require live verification on the target host before implementation. The secondary risk is behavioral: without alert deduplication and an IEEE-address-keyed state file from day one, the plugin will generate alert fatigue and lose state continuity on device renames. Both are architectural decisions that must be made in Phase 1, before any logic is built.

---

## Key Findings

### Recommended Stack

The runtime is fixed: Node.js 24.3.0 and yarn 1.22.22 are pinned by the Loxberry host. The MQTT client is `mqtt` 5.x (the canonical Node.js MQTT package, actively maintained, supports MQTT 3.1.1 and 5.0). Config files use INI format via the `ini` 4.x package because Loxberry stores all plugin config as INI and PHP can read the same files with `parse_ini_file()`. Email alerts use `nodemailer` 6.x (battle-tested, zero native deps, good TLS support). The web UI is plain PHP — no Express or Fastify, which would require a non-standard port and break Loxberry plugin conventions. State persistence is a flat JSON file — SQLite would require native build tools that may not be present on the Loxberry host.

**Core technologies:**
- `mqtt` 5.x: MQTT client for subscribing to zigbee2mqtt topics — canonical Node.js choice, no runtime daemon
- `nodemailer` 6.x: SMTP email alerts — self-contained, no Loxberry dependency, reliable fallback
- `ini` 4.x: Read/write Loxberry INI config files — matches Loxberry's native config format
- `fs` (built-in): Atomic JSON state file reads/writes — no external database needed at this scale
- PHP (plain): Web config UI — required by Loxberry's Apache-based plugin UI convention
- System cron (Loxberry cron UI): Scheduling — correct Loxberry pattern; never use node-cron or setInterval

**What not to use:** Express.js/Fastify for UI, node-cron for scheduling, sqlite3 (native deps), direct Zigbee libraries (zigbee2mqtt already handles the Zigbee layer), `dotenv` (use INI not .env).

### Expected Features

The full device registry must be sourced from `zigbee2mqtt/bridge/devices` (published on startup, contains all devices with `power_source`, `ieee_address`, `friendly_name`). Device state is sourced from per-device retained messages on `zigbee2mqtt/#`. The `availability` subtopic is optional and only present when the user has enabled zigbee2mqtt's availability feature — the plugin must function correctly without it.

**Must have (table stakes):**
- Track `last_seen` per device (from payload or message receipt time) and alert when silent beyond configurable threshold
- Track `battery` field per device and alert when below configurable percentage threshold
- Suppress duplicate alerts: do not re-alert for the same device on every cron run while it remains in a bad state
- Persist device state between cron runs (JSON file — cron model has no in-memory state)
- Device exclusion list: skip monitoring for listed devices
- Configurable MQTT connection: host, port, base topic, username, password
- Configurable thresholds: offline hours (default 24h), battery percentage (default 20–25%)
- Distinguish battery-powered vs mains-powered devices — skip battery checks on mains devices
- Notification delivery: Loxberry notification system and/or SMTP email
- Web config UI: MQTT settings, thresholds, exclusions, notification preferences, device status table
- Handle `zigbee2mqtt/bridge/devices` on startup to build device registry with power source classification

**Should have (differentiators):**
- Support both availability-topic mode AND last_seen inference mode (many users have not enabled zigbee2mqtt availability)
- Bridge offline detection: alert if `zigbee2mqtt/bridge/state` goes offline (distinguishes bridge failure from device failure)
- "Device back online" recovery alert: close the loop when a device recovers
- Configurable base MQTT topic (do not hardcode `zigbee2mqtt`)
- Dashboard / device status page (read-only view of all device states, battery, last-seen age)
- Per-device offline threshold override (some devices legitimately report rarely)

**Defer (v2+):**
- Per-device threshold overrides (adds config complexity)
- Link quality warnings (requires multi-reading history; adds noise if not tuned)
- Alert snooze/acknowledgement (requires web UI interaction, complex state)
- Separate alert channels per severity

**Never build (anti-features):**
- Persistent daemon process, automatic device rejoining, Zigbee network topology maps, mobile push (Pushover/Telegram), zigbee2mqtt REST API usage, historical trending/graphing, device configuration write commands.

### Architecture Approach

The plugin follows a strict 7-step cron flow on each invocation: read config → connect to MQTT and drain retained messages for ~5 seconds → merge received device state into state.json → evaluate thresholds against state → deduplicate alerts (skip already-alerting devices) → send new alerts → write updated alert flags back to state.json. The MQTT session is short-lived; the client must be explicitly terminated with `client.end()` and a hard 30-second process.exit timeout must be set as a safety net to prevent zombie processes. State is keyed on IEEE address, not friendly name, to survive device renames.

**Major components:**
1. `bin/watchdog.js` — MQTT listener + threshold checker + alert deduplication + alert dispatch (cron target)
2. `data/state.json` — flat JSON store for last_seen, battery, alert_sent flags, keyed by IEEE address
3. `config/plugin.cfg` — INI config (MQTT, thresholds, cron interval, notification settings, exclusions)
4. `webfrontend/htmlauth/index.php` + `ajax.php` — PHP config UI (reads/writes plugin.cfg, reads state.json)
5. Loxberry notify helper (`loxberry_notify.pl`) — primary in-platform notification channel
6. `nodemailer` (inline in watchdog.js) — secondary SMTP email notification channel
7. Cron fragment in Loxberry's cron system — triggers watchdog.js on configured interval

### Critical Pitfalls

1. **MQTT async connection race** — the Node.js MQTT client is event-driven; the script will exit before receiving any messages if you do not implement a timed drain window. Fix: connect, wait for `connect` event, then wait a fixed 2–5 seconds for retained messages, then call `client.end()` and process. Must be solved in Phase 1 before anything else.

2. **Zombie Node.js processes from missing `client.end()`** — if the MQTT client TCP socket is not explicitly closed, the Node.js event loop stays alive indefinitely. Hourly cron spawns accumulate into dozens of zombie processes. Fix: always call `client.end(false, () => process.exit(0))` as final step; set `reconnectPeriod: 0`; add a hard 30-second `setTimeout(() => process.exit(1))` safety net; use a pidfile lock to skip runs if a previous instance is still running.

3. **State keyed on friendly_name breaks on device rename** — if state.json uses friendly_name as the primary key, renaming a device in zigbee2mqtt creates a phantom "offline" entry for the old name and an immediately-alerting entry for the new name. Fix: key all state on `ieee_address` from day one. Use friendly_name only for display.

4. **Alert fatigue with 50+ devices** — a naive "last_seen > threshold" check fires an alert on every cron run while a device remains offline. With 50+ devices, this becomes a torrent of duplicate emails. Fix: implement `alert_sent_at` cooldown per device in state.json from Phase 1. Only alert on transition from "ok" to "alert" state. Clear on recovery.

5. **Loxberry plugin directory non-compliance** — files in wrong paths cause silent failures: 404 on config UI, cron never runs, user config reset on upgrade. The Loxberry plugin directory layout is rigid and convention-driven. Fix: verify directory structure against an existing plugin on the live system before writing any business logic. Specifically verify: cron fragment path, notification API path, plugin.cfg field names, PHP header/footer include paths. Make `postinstall.sh` idempotent (check before writing default config).

---

## Implications for Roadmap

Based on combined research, the architecture's dependency graph drives a clear 6-phase build order. All foundational decisions — IEEE address keying, alert deduplication schema, atomic writes, MQTT drain window, hard process exit — must be made in Phase 1. Retrofitting any of these later is painful.

### Phase 1: Plugin Scaffolding and MQTT Foundation

**Rationale:** Loxberry plugin structure must be verified and correct before any business logic is written. The MQTT connection pattern (drain window, clean exit) is the riskiest technical problem and must be solved first. All state schema decisions (IEEE address keys, alert_sent_at flags) made here propagate through every subsequent phase.

**Delivers:** Working plugin skeleton installable on Loxberry; MQTT connection that subscribes to `zigbee2mqtt/#`, collects retained messages for a fixed window, and exits cleanly; state.json read/write with atomic writes and parse-error recovery; plugin.cfg INI read in Node.js; correct Loxberry directory layout verified against live system.

**Addresses features:** Configurable MQTT connection; configurable base topic; device registry from `bridge/devices`; state persistence between cron runs.

**Avoids pitfalls:** MQTT async race (Pitfall 1), zombie processes (Pitfall 2), state key choice (Pitfall 3), Loxberry directory non-compliance (Pitfall 6), config credential storage (Pitfall 7).

**Research flag:** VERIFY on live Loxberry host before implementing — cron fragment path, notification API path, plugin.cfg field names, PHP include paths. Inspect an existing plugin as reference.

### Phase 2: Device Classification and Threshold Evaluation

**Rationale:** With the MQTT layer and state store working, add the monitoring logic. Power-source classification must precede battery alerting. Alert deduplication schema is already in state.json from Phase 1; here it is used.

**Delivers:** Last_seen tracking per device; battery level tracking (battery-powered devices only); offline threshold evaluation; low battery threshold evaluation; alert deduplication (alert only on new conditions; clear on recovery).

**Addresses features:** Track last_seen; offline alerts; battery level tracking; low battery alerts; distinguish battery vs mains devices; suppress duplicate alerts.

**Avoids pitfalls:** Battery check on mains-powered devices (Pitfall 10), alert fatigue (Pitfall 5), `last_seen` vs `availability` confusion (Pitfall 8).

**Research flag:** Standard monitoring logic — no additional research needed. Verify `last_seen` config key name in zigbee2mqtt docs before implementing the "missing last_seen" fallback.

### Phase 3: Alert Delivery

**Rationale:** Alerting is a dependency of the threshold logic — but delivery channels are independent of each other and can be layered. Loxberry notification must be tested in isolation on the live system before integration. Email via nodemailer is self-contained and lower risk.

**Delivers:** Loxberry in-platform notifications via `loxberry_notify.pl` (or verified equivalent); SMTP email via nodemailer; layered fallback (email if Loxberry notify fails); bridge offline detection (subscribe to `bridge/state`).

**Addresses features:** Notification delivery; Loxberry notification system; email alerts; bridge offline detection (differentiator).

**Avoids pitfalls:** MQTT topic structure assumptions (Pitfall 3 — filter bridge topics correctly).

**Research flag:** VERIFY Loxberry notification API on live system before implementing. The exact path and arguments for `loxberry_notify.pl` (or its equivalent) must be confirmed. Test notification integration in isolation before wiring it to the MQTT loop.

### Phase 4: Web Config UI

**Rationale:** UI depends on stable config schema and state schema — both are settled by Phase 3. PHP UI reads/writes the same `plugin.cfg` that Node.js reads. Device status table reads `state.json` directly. Cron interval management rewrites the cron fragment when the user changes the interval setting.

**Delivers:** PHP config page (MQTT settings, thresholds, exclusion list, notification preferences, cron interval); device status table (all tracked devices, last-seen age, battery, alert state); AJAX save handler; cron fragment rewrite on interval change.

**Addresses features:** Web config UI; device exclusion list; device status dashboard (differentiator).

**Avoids pitfalls:** Loxberry directory non-compliance (htmlauth path, PHP include for standard header/footer).

**Research flag:** VERIFY PHP version on Loxberry host (`php -v`) before writing UI code. Verify Loxberry's standard PHP header/footer include path for UI consistency. Stick to PHP 5.6-compatible syntax unless PHP version is confirmed modern.

### Phase 5: Differentiators and Recovery Alerts

**Rationale:** Once the core watchdog loop is stable and the UI is in place, add the features that elevate the plugin from functional to polished. These are lower-risk additions because the foundational layer is proven.

**Delivers:** "Device back online" recovery alert; dual-mode availability detection (availability-topic mode when zigbee2mqtt availability feature is enabled, last_seen inference when it is not); per-device threshold overrides (if in scope).

**Addresses features:** Recovery alert; availability-topic AND last_seen dual-mode support; per-device offline threshold override.

**Research flag:** Standard logic additions — no additional research needed.

### Phase 6: Packaging and Release

**Rationale:** Package for distribution only when all functional phases are proven. The install/uninstall scripts must be idempotent and tested end-to-end.

**Delivers:** `.tar.gz` plugin archive; idempotent `postinstall.sh` (preserves user config on upgrade); `uninstall.sh` (clean removal); `plugin.cfg` template with safe defaults; `README.md` covering zigbee2mqtt prerequisites (`last_seen` config, availability feature); version-stamped release.

**Avoids pitfalls:** Upgrade overwrites user config (Pitfall 6); plugin name length/format constraints (Pitfall — Loxberry plugin name must be short, lowercase, underscores only).

**Research flag:** No additional research needed. Follow Loxberry plugin template conventions verified in Phase 1.

### Phase Ordering Rationale

- Phases 1–3 are strictly sequential: MQTT layer must exist before state, state must exist before threshold logic, threshold logic must exist before alert delivery.
- Phase 4 (web UI) depends on stable config and state schemas (Phases 1–3) but is otherwise independent of alert logic — it could overlap with Phase 3 if needed.
- Phase 5 additions are backward-compatible extensions; they do not require restructuring earlier phases if IEEE address keying and dual-mode detection are anticipated in Phase 1's state schema.
- Phase 6 wraps what works. Do not package early.
- The single most important architectural constraint from research: **every schema decision in Phase 1 (IEEE address key, alert_sent_at field, atomic writes, drain window) saves significant rework if done correctly from the start.**

### Research Flags

Phases needing live verification on the Loxberry host before implementing:

- **Phase 1:** Verify Loxberry plugin directory layout against an existing installed plugin. Verify cron fragment path. Confirm `plugin.cfg` field names match current Loxberry version. Run `cat /opt/loxberry/data/system/plugindatabase/*.json | head -40` to understand plugin registration format.
- **Phase 3:** Verify Loxberry notification API before integrating. Run `ls /opt/loxberry/sbin/` to find the notification helper. Confirm exact CLI arguments. Test in isolation.
- **Phase 4:** Verify PHP version (`php -v`). Find standard Loxberry PHP header/footer include path by inspecting an existing plugin's UI file.

Phases with standard, well-documented patterns (skip additional research):
- **Phase 2:** MQTT message parsing and threshold logic are straightforward Node.js. No Loxberry-specific unknowns.
- **Phase 5:** Recovery alerts and dual-mode detection are logic extensions on top of the stable Phase 1–3 foundation.
- **Phase 6:** Plugin packaging follows Loxberry conventions verified in Phase 1.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | mqtt 5.x and nodemailer 6.x are HIGH — confirmed stable. ini 4.x is MEDIUM — verify version on npm. Loxberry `loxberry_notify.pl` path is LOW — must verify on live system. Overall MEDIUM due to Loxberry unknowns. |
| Features | MEDIUM | zigbee2mqtt MQTT topic structure is HIGH — stable since v1.x. Feature categorization is MEDIUM — domain knowledge of home automation monitoring tools. `last_seen` config key name and availability timeout defaults need live verification. |
| Architecture | MEDIUM | Node.js patterns (drain window, atomic writes, event loop) are HIGH. Loxberry directory layout, cron path, notification API endpoint are MEDIUM — training data only, must verify on live system. |
| Pitfalls | HIGH | MQTT protocol pitfalls (async connection, QoS 0, retained messages, `clean` flag) are HIGH — protocol-level facts. Alert fatigue and IEEE address keying are HIGH — universal monitoring system patterns. Loxberry-specific pitfalls (plugin structure, installer idempotency) are MEDIUM. |

**Overall confidence:** MEDIUM

### Gaps to Address

The following must be resolved by inspecting the live Loxberry host in Phase 1 before committing to implementation details:

- **Loxberry notification API:** Exact path and CLI signature of the notification helper (likely `loxberry_notify.pl` or a CGI endpoint). Cannot be verified from training data. Fallback is direct SMTP email if Loxberry notify is unreachable.
- **Cron fragment path:** `/opt/loxberry/cron/cron.d/` is the expected path but may differ. Verify with `ls /opt/loxberry/cron/`.
- **plugin.cfg field names:** Confirm the exact field names Loxberry's plugin manager reads (NAME, FOLDER, VERSION, AUTHOR, LOXBERRY_MIN_VERSION) against the current Loxberry version on the host.
- **PHP header/footer include:** Find the standard Loxberry PHP include that provides the admin UI chrome. Inspect an existing plugin under `/opt/loxberry/webfrontend/htmlauth/plugins/` for the pattern.
- **zigbee2mqtt `last_seen` config key:** Verify the exact YAML key name in zigbee2mqtt configuration that enables last_seen in device payloads. Training data says `advanced.last_seen: ISO_8601` — confirm this is current.
- **`loxberry` or `loxberry-js` npm package:** Check npm for an official Loxberry Node.js helper library before assuming it does not exist. If it exists, it may simplify config reading and notification. If not, use the direct INI + shell exec approach documented in STACK.md.

---

## Sources

### Primary (HIGH confidence)

- `mqtt` npm package (mqttjs) — MQTT client API, connection lifecycle, `client.end()`, `reconnectPeriod`, `connectTimeout` — https://github.com/mqttjs/MQTT.js
- zigbee2mqtt MQTT topics documentation — `bridge/devices` structure, `last_seen` field, `power_source` classification, topic naming conventions — https://www.zigbee2mqtt.io/guide/usage/mqtt_topics_and_messages.html
- MQTT protocol specification (OASIS) — wildcard semantics (`+` vs `#`), retain flag, QoS 0 behavior — https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/mqtt-v3.1.1.html
- `nodemailer` npm package — SMTP, TLS/STARTTLS — https://nodemailer.com/
- Node.js built-ins (`fs`, `path`, `child_process`) — atomic rename pattern, process exit — https://nodejs.org/en/docs/

### Secondary (MEDIUM confidence)

- Loxberry plugin development wiki — directory layout, plugin.cfg format, installer conventions — https://wiki.loxberry.de/developers/plugin_development/start (training data, cutoff Aug 2025)
- zigbee2mqtt availability feature — default timeout values, topic format — https://www.zigbee2mqtt.io/guide/configuration/device-availability.html (training data)
- `ini` npm package — version and API — https://www.npmjs.com/package/ini (training data; verify current major version)
- Loxberry plugin template repository — installer script conventions, REPLACEMENTS variables — https://github.com/mschlenstedt/LoxBerry (training data)

### Tertiary (LOW confidence — requires live verification)

- `loxberry_notify.pl` — notification helper path and CLI arguments — must be verified on target Loxberry host
- `loxberry` or `loxberry-js` npm package — may or may not exist; check npm registry before implementing
- Loxberry cron fragment directory — exact path must be verified on target host

---

*Research completed: 2026-03-14*
*Ready for roadmap: yes*
