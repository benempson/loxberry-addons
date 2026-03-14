---
phase: 01-mqtt-foundation-and-state-persistence
verified: 2026-03-14T12:00:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 1: MQTT Foundation and State Persistence Verification Report

**Phase Goal:** Plugin connects to the MQTT broker, collects device data from zigbee2mqtt retained messages, and persists device state reliably between cron runs
**Verified:** 2026-03-14T12:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | Plugin connects to a configurable Mosquitto broker, subscribes to zigbee2mqtt topics, collects retained messages for a timed window, and disconnects cleanly without leaving zombie processes | VERIFIED | `bin/lib/mqtt-collector.js` implements `collectMessages()` with `mqtt.connect()`, wildcard subscribe, drain timer, `client.end(false, cb)` on success, `client.end(true)` on error; `reconnectPeriod: 0` prevents reconnect loops; `connectTimeout: 5000`; hard 30s timeout in `bin/watchdog.js` via `setTimeout(...).unref()` as final safety net; 7 unit tests pass |
| 2   | Plugin parses bridge/devices and builds a device registry keyed on IEEE address with friendly name, power source, and device type | VERIFIED | `bin/lib/device-registry.js` exports `buildDeviceRegistry()` — filters Coordinator and `interview_completed !== true` devices, keys on `ieee_address`, stores `friendly_name`, `power_source`, `type`, `model_id`, `supported`; 5 unit tests pass using `tests/fixtures/bridge-devices.json` |
| 3   | Plugin reads config from an INI file that both Node.js and PHP can parse | VERIFIED | `bin/lib/config.js` uses the `ini` package (standard INI format); `tests/fixtures/watchdog.cfg` is plain INI with standard sections; types are coerced (numeric, boolean, array); `readConfig()` with nonexistent file throws descriptive error; 7 unit tests pass |
| 4   | Plugin writes device state to a JSON file atomically (temp file + rename) and reads it back on subsequent runs without data loss | VERIFIED | `bin/lib/state-store.js` uses `write-file-atomic` for `writeState()`; `readState()` returns `{ last_run: null, devices: {} }` on missing or corrupt file; round-trip test passes; `mkdirSync({ recursive: true })` creates parent dirs; 6 state-store tests pass |
| 5   | Plugin uses a pidfile lock to prevent overlapping cron runs | VERIFIED | `bin/lib/state-store.js` exports `acquireLock()` using `proper-lockfile` with `stale: 60000, retries: 0`; creates lock target file if missing; returns release function; ELOCKED throws on second acquire; `bin/watchdog.js` catches ELOCKED and exits 0; 4 lock tests pass |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `package.json` | Project manifest with mqtt, ini, proper-lockfile, write-file-atomic, jest | VERIFIED | All 4 runtime deps + jest devDep present; `main: bin/watchdog.js`; `test` and `test:coverage` scripts |
| `jest.config.js` | Jest configuration | VERIFIED | `testEnvironment: 'node'`, `testMatch: ['**/tests/**/*.test.js']` |
| `bin/lib/config.js` | INI config reader with typed defaults, exports `readConfig` | VERIFIED | 99 lines; DEFAULTS, NUMERIC_FIELDS, BOOLEAN_FIELDS coercion; EXCLUSIONS comma-split; clear error on missing file; exports `{ readConfig }` |
| `bin/lib/mqtt-collector.js` | MQTT connect/subscribe/drain/disconnect, exports `collectMessages` | VERIFIED | 80 lines; `mqtt.connect()`, wildcard subscribe, drain timer, settled-once pattern, JSON parse with skip-on-error; exports `{ collectMessages }` |
| `bin/lib/device-registry.js` | Parse bridge/devices into device Map, exports `buildDeviceRegistry` | VERIFIED | 41 lines; Array guard, Coordinator filter, interview_completed filter, ieee_address guard; exports `{ buildDeviceRegistry }` |
| `bin/lib/state-store.js` | Atomic JSON state read/write and pidfile locking, exports `readState`, `writeState`, `acquireLock` | VERIFIED | 58 lines; `writeFileAtomic`, `proper-lockfile`, empty-state fallback; exports `{ readState, writeState, acquireLock }` |
| `bin/watchdog.js` | Main cron entry point wiring all modules | VERIFIED | 114 lines; hard timeout first, lock -> config -> state -> collect -> registry -> merge -> write -> unlock -> exit; `require.main === module` guard; exports `{ mergeDeviceState, main }` |
| `tests/config.test.js` | Unit tests for config reader | VERIFIED | Exists, 7 tests pass |
| `tests/device-registry.test.js` | Unit tests for device registry parsing | VERIFIED | Exists, tests pass |
| `tests/mqtt-collector.test.js` | Unit tests for MQTT collector with mocked mqtt client | VERIFIED | Exists, tests pass |
| `tests/state-store.test.js` | Unit tests for state persistence | VERIFIED | Exists, tests pass |
| `tests/lock.test.js` | Unit tests for pidfile locking | VERIFIED | Exists, 4 tests pass |
| `tests/watchdog.test.js` | Integration tests for main entry point | VERIFIED | Exists, 12 tests pass |
| `tests/fixtures/watchdog.cfg` | Sample INI config file for tests | VERIFIED | Valid INI; all sections present (MQTT, THRESHOLDS, CRON, NOTIFICATIONS, EXCLUSIONS) |
| `tests/fixtures/bridge-devices.json` | Sample bridge/devices payload for tests | VERIFIED | 5 devices: 1 Coordinator, 1 Router, 2 EndDevice (battery), 1 incomplete-interview — correct filter targets |
| `tests/fixtures/state.json` | Sample state file for tests | VERIFIED | 2 devices with full schema including `alerts` object |

---

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `bin/lib/config.js` | `tests/fixtures/watchdog.cfg` | `ini.parse` reads INI sections | WIRED | `ini.parse(raw)` on line 61; fixture used in `tests/config.test.js` |
| `bin/lib/mqtt-collector.js` | `mqtt` package | `mqtt.connect()` with config options | WIRED | `mqtt.connect(...)` on line 21; `reconnectPeriod: 0`, `clean: true`, `connectTimeout: 5000` verified |
| `bin/lib/device-registry.js` | bridge/devices payload | Array filter and Map construction using `ieee_address` | WIRED | `ieee_address` referenced on lines 21, 29; Map keyed on `device.ieee_address` |
| `bin/lib/state-store.js` | `write-file-atomic` | `writeFileAtomic()` for atomic JSON writes | WIRED | `require('write-file-atomic')` line 5; `await writeFileAtomic(...)` line 35 |
| `bin/lib/state-store.js` | `proper-lockfile` | `lockfile.lock()` for pidfile-style locking | WIRED | `require('proper-lockfile')` line 6; `await lockfile.lock(...)` line 51 |
| `bin/watchdog.js` | `bin/lib/config.js` | `readConfig(configPath)` | WIRED | `require('./lib/config')` line 11; `readConfig(CONFIG_PATH)` line 88 |
| `bin/watchdog.js` | `bin/lib/mqtt-collector.js` | `collectMessages(mqttConfig)` | WIRED | `require('./lib/mqtt-collector')` line 12; `await collectMessages(mqttConfig)` line 91 |
| `bin/watchdog.js` | `bin/lib/device-registry.js` | `buildDeviceRegistry(bridgeDevicesPayload)` | WIRED | `require('./lib/device-registry')` line 13; `buildDeviceRegistry(messages.get(bridgeTopic))` line 93 |
| `bin/watchdog.js` | `bin/lib/state-store.js` | `readState`, `writeState`, `acquireLock` | WIRED | `require('./lib/state-store')` line 14; all three used in `main()` lines 78, 89, 96, 99 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| MQTT-01 | 01-02, 01-04 | Plugin connects to local Mosquitto broker with configurable host, port, username, password | SATISFIED | `mqtt.connect()` uses `host`, `port`, `username || undefined`, `password || undefined` from config |
| MQTT-02 | 01-02, 01-04 | Plugin subscribes to configurable base topic (default `zigbee2mqtt`) — not hardcoded | SATISFIED | Subscribe uses `${base_topic}/#`; `base_topic` read from INI with default `zigbee2mqtt` |
| MQTT-03 | 01-02, 01-04 | Plugin uses a timed drain window (2-5s) to collect retained messages, then disconnects cleanly with `client.end()` | SATISFIED | `drain_seconds * 1000` timer triggers `client.end(false, callback)` |
| MQTT-04 | 01-04 | Plugin sets a hard process exit timeout (30s) as safety net against zombie processes | SATISFIED | `setTimeout(() => process.exit(1), 30000).unref()` at top of `bin/watchdog.js` |
| MQTT-05 | 01-03, 01-04 | Plugin uses pidfile lock to prevent overlapping cron runs | SATISFIED | `acquireLock()` with `proper-lockfile`; ELOCKED -> `process.exit(0)`; `finally` releases lock |
| DEVT-01 | 01-02, 01-04 | Plugin parses `bridge/devices` to build device registry with IEEE address, friendly name, power source, and device type | SATISFIED | `buildDeviceRegistry()` builds Map with `ieee_address` key, `friendly_name`, `power_source`, `type` values |
| DEVT-04 | 01-03, 01-04 | Plugin persists device state to a JSON file between cron runs, keyed on IEEE address (not friendly name) | SATISFIED | `writeState()` serializes `state.devices` keyed on `ieee_address`; `readState()` reloads on subsequent runs |
| DEVT-05 | 01-03, 01-04 | State file writes are atomic (write to temp file, rename) to prevent corruption | SATISFIED | `write-file-atomic` performs temp write + rename internally |
| PLUG-05 | 01-01, 01-04 | Config stored as INI file readable by both Node.js and PHP | SATISFIED | `ini` package parses standard INI format; `tests/fixtures/watchdog.cfg` is plain INI compatible with PHP `parse_ini_file()` |

**All 9 Phase 1 requirements satisfied.** No orphaned requirements found — REQUIREMENTS.md traceability table maps each of these 9 IDs to Phase 1.

---

### Anti-Patterns Found

No anti-patterns detected in any source files under `bin/`. Full scan performed:

- No TODO, FIXME, XXX, HACK, PLACEHOLDER comments
- No `return null`, `return {}`, `return []` stubs in module implementations
- No console.log-only handlers
- No empty promise callbacks

---

### Human Verification Required

#### 1. Live Loxberry Host Paths

**Test:** Deploy to a real Loxberry instance. Verify `LOXBERRY_DIR=/opt/loxberry` matches actual installation path, `config/plugins/zigbee_watchdog/watchdog.cfg` is the correct config location, and `data/plugins/zigbee_watchdog/` is writeable by the cron user.
**Expected:** Plugin reads config and writes state without permission errors; paths resolve correctly.
**Why human:** Path constants are hardcoded to `/opt/loxberry` convention noted in research but not verified on a live host.

#### 2. Live MQTT Broker Connection

**Test:** Point `watchdog.cfg` at a real Mosquitto broker running zigbee2mqtt. Run `node bin/watchdog.js` manually. Observe log output.
**Expected:** "Run complete. N devices tracked." where N matches the number of non-Coordinator, interview-complete devices in zigbee2mqtt.
**Why human:** MQTT collector was tested against mocks only; real broker behaviour (TLS, auth edge cases, topic timing) cannot be verified programmatically.

#### 3. PHP INI Compatibility

**Test:** On the Loxberry host, run `php -r "print_r(parse_ini_file('tests/fixtures/watchdog.cfg', true));"` and compare section keys and values to Node.js output.
**Expected:** Identical section names and key names; values may differ in type (PHP returns strings) but keys must match exactly.
**Why human:** Cross-language INI compatibility requires a live PHP runtime. The ini package and PHP parse_ini_file() are generally compatible for this format, but edge cases (empty values, numeric keys) need confirmation.

---

### Test Suite Summary

All automated tests pass:

```
Test Suites: 6 passed, 6 total
Tests:       48 passed, 48 total
Time:        ~0.5s
```

Files covered: `config.test.js`, `device-registry.test.js`, `mqtt-collector.test.js`, `state-store.test.js`, `lock.test.js`, `watchdog.test.js`

---

### Gaps Summary

None. All 5 observable truths are verified, all artifacts exist and are substantive, all key links are wired, all 9 requirements are satisfied, and no anti-patterns were found. Three human verification items exist but are environmental concerns, not implementation gaps.

---

_Verified: 2026-03-14T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
