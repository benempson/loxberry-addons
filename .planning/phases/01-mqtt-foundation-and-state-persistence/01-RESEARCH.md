# Phase 1: MQTT Foundation and State Persistence - Research

**Researched:** 2026-03-14
**Domain:** MQTT client connection, zigbee2mqtt message collection, JSON state persistence, INI config parsing, process lifecycle management
**Confidence:** HIGH

## Summary

Phase 1 establishes the entire runtime foundation: connecting to Mosquitto via the mqtt.js 5.x client, collecting retained zigbee2mqtt messages during a timed drain window, parsing `bridge/devices` into an IEEE-address-keyed device registry, persisting device state atomically to a JSON file, reading configuration from a shared INI file, and preventing overlapping cron runs via a pidfile lock. Every subsequent phase depends on these primitives being correct.

The MQTT drain-window pattern is the riskiest technical element. The mqtt.js client is fully async -- the script must wait for the `connect` event, subscribe, hold a timer for retained message collection (2-5 seconds), then explicitly call `client.end()` and enforce a hard 30-second process timeout as a safety net. Without this, the process either exits before receiving messages or hangs indefinitely as a zombie. The state file must use IEEE address as the primary key from day one -- using friendly_name causes data loss on device renames. Atomic writes (write to temp file, rename) prevent corruption on crashes.

**Primary recommendation:** Build three clean modules -- config reader (INI), MQTT collector (connect/drain/disconnect with hard timeout), and state store (atomic JSON read/write with pidfile lock) -- each independently testable. Use `mqtt@5.x`, `ini@5.x` (latest stable before v6 breaking changes), and `proper-lockfile` for cross-process locking.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MQTT-01 | Plugin connects to local Mosquitto broker with configurable host, port, username, password | mqtt 5.x `mqtt.connect()` with options object; INI config reader provides connection params |
| MQTT-02 | Plugin subscribes to configurable base topic (default `zigbee2mqtt`) -- not hardcoded | Subscribe to `${baseTopic}/#`; base topic read from INI config `[MQTT].base_topic` |
| MQTT-03 | Plugin uses a timed drain window (2-5s) to collect retained messages, then disconnects cleanly with `client.end()` | Drain window pattern with setTimeout after `connect` event; `client.end(false, callback)` for clean disconnect |
| MQTT-04 | Plugin sets a hard process exit timeout (30s) as safety net against zombie processes | `setTimeout(() => process.exit(1), 30000).unref()` at script start; `reconnectPeriod: 0` to disable auto-reconnect |
| MQTT-05 | Plugin uses pidfile lock to prevent overlapping cron runs | `proper-lockfile` with stale detection or manual pidfile with `fs.writeFileSync` + process.pid check |
| DEVT-01 | Plugin parses `bridge/devices` to build device registry with IEEE address, friendly name, power source, and device type | Parse JSON array from `${baseTopic}/bridge/devices` topic; extract `ieee_address`, `friendly_name`, `power_source`, `type`; filter `interview_completed === true` and `type !== "Coordinator"` |
| DEVT-04 | Plugin persists device state to a JSON file between cron runs, keyed on IEEE address | State file at `data/plugins/<name>/state.json`; keyed on `ieee_address`; includes `friendly_name`, `power_source`, `type`, `last_seen`, `battery`, alert flags |
| DEVT-05 | State file writes are atomic (write to temp file, rename) to prevent corruption | Use `write-file-atomic` package or manual `fs.writeFileSync(tmpPath) + fs.renameSync(tmpPath, finalPath)` pattern |
| PLUG-05 | Config stored as INI file readable by both Node.js and PHP | `ini` npm package `parse()`; PHP reads same file with `parse_ini_file(path, true)` for sections |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mqtt | 5.15.x | MQTT client -- connect to Mosquitto, subscribe to zigbee2mqtt topics, collect retained messages | Canonical Node.js MQTT client; actively maintained; supports MQTT 3.1.1 and 5.0; TypeScript rewrite in v5 |
| ini | 5.x | Parse/write Loxberry INI config files | Loxberry stores all plugin config as INI; `ini` is the standard parser; v6.0.0 exists but v5.x is more stable for this use case |
| proper-lockfile | 4.x | Cross-process file locking for pidfile-style overlap prevention | Uses mkdir strategy (atomic on all filesystems); automatic stale lock detection; auto-cleanup on process exit |
| write-file-atomic | 7.x | Atomic file writes for state.json | Writes to temp file with PID in name, renames on success; handles cleanup on failure; supports Node 20+/22+ |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fs (built-in) | Node.js 24 | File reads, path operations | Always -- reading state, config |
| path (built-in) | Node.js 24 | Build cross-platform file paths | Always -- resolve plugin directory paths |
| process (built-in) | Node.js 24 | Exit codes, PID, env vars | Hard timeout safety net, exit handling |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| proper-lockfile | Manual pidfile (fs.writeFileSync + process.pid) | Manual pidfile is simpler but lacks stale detection; proper-lockfile handles stale locks from crashed processes automatically |
| write-file-atomic | Manual temp+rename (fs.writeFileSync + fs.renameSync) | Manual approach works but write-file-atomic handles edge cases (cleanup on error, PID-based temp naming, worker thread safety) |
| ini 5.x | ini 6.x | v6 is latest but released Oct 2025; v5 has more community usage data; either works for basic section parsing |

**Installation:**
```bash
yarn add mqtt@^5.15.0 ini@^5.0.0 proper-lockfile@^4.1.2 write-file-atomic@^7.0.0
```

## Architecture Patterns

### Recommended Project Structure
```
bin/
  watchdog.js          # Entry point -- cron target
  lib/
    config.js          # Read INI config, provide typed defaults
    mqtt-collector.js  # Connect, subscribe, drain, disconnect, return collected messages
    state-store.js     # Read/write state.json atomically with locking
    device-registry.js # Parse bridge/devices into device map keyed by IEEE address
```

### Pattern 1: Timed MQTT Drain Window
**What:** Connect to MQTT, subscribe to topics, wait a fixed duration for retained messages, then disconnect.
**When to use:** Every cron invocation -- this is the core collection pattern.
**Example:**
```javascript
// Source: mqtt.js README + zigbee2mqtt docs
const mqtt = require('mqtt');

async function collectMessages(config) {
  const messages = new Map();

  const client = mqtt.connect(`mqtt://${config.host}:${config.port}`, {
    username: config.username || undefined,
    password: config.password || undefined,
    connectTimeout: 5000,
    reconnectPeriod: 0,   // CRITICAL: disable reconnect for cron script
    clean: true,           // CRITICAL: no queued messages from prior sessions
  });

  return new Promise((resolve, reject) => {
    const drainMs = (config.drain_seconds || 3) * 1000;

    client.on('connect', () => {
      client.subscribe(`${config.base_topic}/#`, { qos: 0 }, (err) => {
        if (err) return reject(err);

        setTimeout(() => {
          client.end(false, () => resolve(messages));
        }, drainMs);
      });
    });

    client.on('message', (topic, payload) => {
      try {
        messages.set(topic, JSON.parse(payload.toString()));
      } catch {
        // Non-JSON payload -- skip
      }
    });

    client.on('error', (err) => {
      client.end(true);
      reject(err);
    });
  });
}
```

### Pattern 2: Hard Process Timeout
**What:** Set an unref'd timeout at script start that force-exits after 30 seconds.
**When to use:** Always -- safety net against any hang.
**Example:**
```javascript
// Source: Node.js process docs + MQTT pitfalls research
// Set at very top of watchdog.js, before any async work
const HARD_TIMEOUT_MS = 30000;
setTimeout(() => {
  console.error('FATAL: Hard timeout reached, forcing exit');
  process.exit(1);
}, HARD_TIMEOUT_MS).unref();
```

### Pattern 3: Atomic State File Write
**What:** Write state to a temp file, then atomically rename to the final path.
**When to use:** Every time state.json is updated.
**Example:**
```javascript
// Source: write-file-atomic npm docs
const writeFileAtomic = require('write-file-atomic');

async function writeState(statePath, state) {
  const json = JSON.stringify(state, null, 2);
  await writeFileAtomic(statePath, json, { encoding: 'utf8' });
}

function readState(statePath) {
  try {
    const raw = require('fs').readFileSync(statePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    // File missing or corrupt -- start fresh, do NOT crash
    console.warn(`State file unreadable (${err.code || err.message}), starting with empty state`);
    return { last_run: null, devices: {} };
  }
}
```

### Pattern 4: Pidfile Lock with Stale Detection
**What:** Acquire a file lock before running, release on exit. Skip run if lock already held.
**When to use:** At the very start of each cron invocation.
**Example:**
```javascript
// Source: proper-lockfile npm docs
const lockfile = require('proper-lockfile');
const path = require('path');

const LOCK_FILE = path.join(dataDir, 'watchdog.lock');

async function acquireLock() {
  try {
    // Ensure the lock target file exists
    const fs = require('fs');
    if (!fs.existsSync(LOCK_FILE)) {
      fs.writeFileSync(LOCK_FILE, '');
    }
    const release = await lockfile.lock(LOCK_FILE, {
      stale: 60000,  // Consider lock stale after 60s (longer than hard timeout)
      retries: 0,     // Don't retry -- just skip this run
    });
    return release;
  } catch (err) {
    if (err.code === 'ELOCKED') {
      console.log('Previous run still active, skipping');
      process.exit(0);
    }
    throw err;
  }
}
```

### Pattern 5: INI Config with Typed Defaults
**What:** Read INI file, merge with defaults, provide typed values.
**When to use:** At script start.
**Example:**
```javascript
// Source: ini npm docs + Loxberry plugin conventions
const ini = require('ini');
const fs = require('fs');

const DEFAULTS = {
  MQTT: { host: 'localhost', port: '1883', base_topic: 'zigbee2mqtt', username: '', password: '' },
  THRESHOLDS: { offline_hours: '24', battery_pct: '25' },
  CRON: { interval_minutes: '60', drain_seconds: '3' },
};

function readConfig(configPath) {
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = ini.parse(raw);
  // Merge with defaults (INI values are always strings)
  const config = {};
  for (const [section, defaults] of Object.entries(DEFAULTS)) {
    config[section] = { ...defaults, ...(parsed[section] || {}) };
  }
  return config;
}
```

### Pattern 6: Device Registry from bridge/devices
**What:** Parse the zigbee2mqtt bridge/devices JSON array into a Map keyed by IEEE address.
**When to use:** After MQTT collection, before state merge.
**Example:**
```javascript
// Source: zigbee2mqtt MQTT topics docs
function buildDeviceRegistry(bridgeDevicesPayload) {
  const registry = new Map();
  if (!Array.isArray(bridgeDevicesPayload)) return registry;

  for (const device of bridgeDevicesPayload) {
    // Skip coordinator and devices still being interviewed
    if (device.type === 'Coordinator') continue;
    if (!device.interview_completed) continue;

    registry.set(device.ieee_address, {
      friendly_name: device.friendly_name,
      power_source: device.power_source,  // "Battery", "Mains (single phase)", "DC Source"
      type: device.type,                   // "Router", "EndDevice"
      model_id: device.model_id || null,
      supported: device.supported !== false,
    });
  }
  return registry;
}
```

### Anti-Patterns to Avoid
- **Keying state on friendly_name:** Device renames in zigbee2mqtt create orphaned entries and false offline alerts. Always key on `ieee_address`.
- **Using `zigbee2mqtt/+` subscription:** Single-level wildcard misses devices with slashes in friendly_name. Use `zigbee2mqtt/#` and filter.
- **Missing `reconnectPeriod: 0`:** Default reconnect (1000ms) keeps the process alive after broker disconnect. Must disable for cron scripts.
- **Missing `clean: true`:** With `clean: false`, the broker queues messages from prior sessions and delivers a stale burst on reconnect.
- **Catching state parse errors by crashing:** A corrupt state.json must not crash the process. Fall back to empty state, log a warning, and continue.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic file writes | Manual fs.writeFile + hope | `write-file-atomic` 7.x | Handles temp file naming, cleanup on error, worker thread safety, rename atomicity |
| Cross-process file locking | Manual pidfile with fs.writeFileSync | `proper-lockfile` 4.x | Stale lock detection, automatic cleanup on process exit (except SIGKILL), mkdir strategy works on all filesystems |
| INI parsing | Custom regex parser | `ini` 5.x | Handles sections, nested keys, arrays, edge cases; matches PHP `parse_ini_file()` output |
| MQTT protocol handling | Raw TCP socket + MQTT framing | `mqtt` 5.x | Full MQTT 3.1.1/5.0 protocol, TLS, auto-reconnect (disabled here), keep-alive, QoS |

**Key insight:** The cron-script lifecycle (connect, collect, process, write, exit) is deceptively simple but has many failure modes (zombie processes, corrupt state, stale locks, missed messages). Using battle-tested libraries for each primitive avoids weeks of debugging edge cases.

## Common Pitfalls

### Pitfall 1: MQTT Async Connection Race
**What goes wrong:** Script exits before receiving any messages because MQTT connect is async.
**Why it happens:** `mqtt.connect()` returns immediately. Without waiting for the `connect` event and a drain window, the event loop drains and the process exits with zero messages.
**How to avoid:** Wrap the entire MQTT lifecycle in a Promise. Start the drain timer only after the `connect` event fires. Call `client.end()` only after the timer expires.
**Warning signs:** State file always empty after runs. Script exits in under 100ms.

### Pitfall 2: Zombie Processes from Missing client.end()
**What goes wrong:** Node.js process stays alive indefinitely because the MQTT TCP socket holds the event loop open.
**Why it happens:** `mqtt` client keeps a TCP connection open until `client.end()` is explicitly called. Cron spawns a new process each interval, accumulating zombies.
**How to avoid:** Always call `client.end(false, callback)`. Set `reconnectPeriod: 0`. Add a hard 30-second `setTimeout(() => process.exit(1))` safety net. Use pidfile lock to skip runs if previous instance is alive.
**Warning signs:** `ps aux | grep node` shows multiple watchdog processes.

### Pitfall 3: State Keyed on friendly_name
**What goes wrong:** Renaming a device in zigbee2mqtt creates a phantom "offline" entry for the old name and a fresh entry for the new name with no history.
**Why it happens:** `friendly_name` is mutable in zigbee2mqtt. `ieee_address` is the permanent hardware identifier.
**How to avoid:** Key all state on `ieee_address` from day one. Use `friendly_name` only for display.
**Warning signs:** Renamed devices appear twice. False offline alerts after renames.

### Pitfall 4: zigbee2mqtt Topic Structure -- Single-Level Wildcard Misses Grouped Devices
**What goes wrong:** Devices with slashes in friendly_name (e.g., `kitchen/floor_light`) are never collected.
**Why it happens:** MQTT `+` wildcard matches exactly one topic level. Slash-separated names span multiple levels.
**How to avoid:** Subscribe to `${baseTopic}/#` (multi-level wildcard). Filter out bridge topics (`bridge/state`, `bridge/devices`, `bridge/logging`, `bridge/config`, `bridge/groups`, `bridge/extensions`, `bridge/converters`, `bridge/info`). Match device topics against the device registry built from `bridge/devices`.
**Warning signs:** Device count in plugin differs from zigbee2mqtt UI count.

### Pitfall 5: State File Corruption on Crash
**What goes wrong:** A crash mid-write leaves a partial JSON file. Next run fails to parse, potentially resetting all timestamps.
**Why it happens:** `fs.writeFileSync()` is not atomic. Power loss or crash during write leaves a truncated file.
**How to avoid:** Use `write-file-atomic` or manual temp+rename. Wrap `JSON.parse()` in try/catch. On parse failure, treat as empty state (do NOT reset timestamps to "now").
**Warning signs:** Occasional empty state files. Spurious "all devices online" after system reboots.

### Pitfall 6: Coordinator Device in Registry
**What goes wrong:** The Zigbee coordinator appears in `bridge/devices` and gets tracked as a regular device.
**Why it happens:** zigbee2mqtt lists the coordinator in its device list with `type: "Coordinator"`.
**How to avoid:** Filter out devices where `type === "Coordinator"` when building the registry.

### Pitfall 7: Groups Mistaken for Devices
**What goes wrong:** zigbee2mqtt publishes group state at `zigbee2mqtt/<group_name>`, indistinguishable from device topics by name alone.
**Why it happens:** Groups and devices share the same topic namespace.
**How to avoid:** Build the device registry from `bridge/devices` only. Only process messages for topics whose friendly_name matches a known device in the registry.

## Code Examples

### Complete Cron Script Skeleton
```javascript
// bin/watchdog.js -- Source: synthesized from mqtt.js + project architecture research
'use strict';

// Hard timeout safety net -- FIRST thing in the script
const HARD_TIMEOUT_MS = 30000;
setTimeout(() => {
  console.error('FATAL: Hard timeout reached after 30s, forcing exit');
  process.exit(1);
}, HARD_TIMEOUT_MS).unref();

const path = require('path');
const lockfile = require('proper-lockfile');

// Loxberry plugin paths (will be configurable / use REPLACEMENTS in packaging phase)
const PLUGIN_NAME = 'zigbee_watchdog';
const BASE_DIR = process.env.LOXBERRY_DIR || '/opt/loxberry';
const CONFIG_PATH = path.join(BASE_DIR, 'config', 'plugins', PLUGIN_NAME, 'watchdog.cfg');
const DATA_DIR = path.join(BASE_DIR, 'data', 'plugins', PLUGIN_NAME);
const STATE_PATH = path.join(DATA_DIR, 'state.json');
const LOCK_FILE = path.join(DATA_DIR, 'watchdog.lock');

async function main() {
  // 1. Acquire lock (skip if previous run still active)
  let release;
  try {
    release = await acquireLock();
  } catch (err) {
    if (err.code === 'ELOCKED') {
      console.log('Previous run still active, skipping');
      process.exit(0);
    }
    throw err;
  }

  try {
    // 2. Read config
    const config = readConfig(CONFIG_PATH);

    // 3. Read existing state
    const state = readState(STATE_PATH);

    // 4. Collect MQTT messages
    const messages = await collectMessages(config.MQTT);

    // 5. Parse bridge/devices into device registry
    const bridgeTopic = `${config.MQTT.base_topic}/bridge/devices`;
    const registry = buildDeviceRegistry(messages.get(bridgeTopic));

    // 6. Merge collected device data into state
    mergeDeviceState(state, registry, messages, config.MQTT.base_topic);

    // 7. Write updated state atomically
    state.last_run = new Date().toISOString();
    await writeState(STATE_PATH, state);

    console.log(`Run complete. ${registry.size} devices tracked.`);
  } finally {
    if (release) await release();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FATAL:', err.message);
    process.exit(1);
  });
```

### State File Schema
```json
{
  "last_run": "2026-03-14T10:00:00.000Z",
  "devices": {
    "0x001234567890abcd": {
      "friendly_name": "Living Room Motion",
      "power_source": "Battery",
      "type": "EndDevice",
      "last_seen": "2026-03-14T09:45:00.000Z",
      "battery": 87,
      "alerts": {
        "offline": false,
        "offline_sent_at": null,
        "battery": false,
        "battery_sent_at": null
      }
    }
  }
}
```

### INI Config File Format
```ini
[MQTT]
host = localhost
port = 1883
base_topic = zigbee2mqtt
username =
password =

[THRESHOLDS]
offline_hours = 24
battery_pct = 25

[CRON]
interval_minutes = 60
drain_seconds = 3

[NOTIFICATIONS]
loxberry_enabled = 1
email_enabled = 0
smtp_host =
smtp_port = 587
smtp_user =
smtp_pass =
smtp_from =
smtp_to =

[EXCLUSIONS]
devices =
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| mqtt 4.x (callback-based) | mqtt 5.x (TypeScript rewrite, Promise support via endAsync) | July 2023 | Requires `new` for MqttClient; drops Node 12/14 support; better TypeScript types |
| ini 3.x | ini 5.x / 6.x | 2023-2025 | v5 stable; v6.0.0 released Oct 2025 with potential breaking changes; use v5 for stability |
| Manual pidfile | proper-lockfile 4.x | Stable | Stale detection, auto-cleanup; replaces ad-hoc PID file management |
| Manual temp+rename | write-file-atomic 7.x | 2025 | Requires Node >=20.17.0 or >=22.9.0; handles edge cases (worker threads, error cleanup) |

**Deprecated/outdated:**
- mqtt 3.x/4.x: Use 5.x. The v5 rewrite is TypeScript-native and drops EOL Node versions.
- Manual PID file management: Use proper-lockfile. Manual approaches miss stale lock detection.

## Open Questions

1. **zigbee2mqtt `bridge/devices` re-publish**
   - What we know: `bridge/devices` is published on zigbee2mqtt startup and is retained. It re-publishes when devices join, leave, or reconfigure.
   - What's unclear: Whether sending to `bridge/request/devices` triggers a re-publish during a cron run. The official docs do not confirm this endpoint clearly.
   - Recommendation: Rely on the retained `bridge/devices` message. It should be received during the drain window since it is retained. If not received, log a warning and skip registry rebuild (use cached state).

2. **`last_seen` disabled by default in zigbee2mqtt**
   - What we know: `last_seen` defaults to `"disable"`. The user must set `advanced.last_seen` to `epoch`, `ISO_8601`, or `ISO_8601_local` in zigbee2mqtt's configuration.yaml.
   - What's unclear: Whether the watchdog should fail loudly or silently fall back when `last_seen` is not in device payloads.
   - Recommendation: Document as a prerequisite. In Phase 1, gracefully handle missing `last_seen` by using message receipt time as fallback. Log a warning on first run if `last_seen` field is absent from all device payloads.

3. **ini package v5 vs v6**
   - What we know: v6.0.0 released Oct 2025. v5.x is widely deployed.
   - What's unclear: Breaking changes in v6 that might affect section parsing.
   - Recommendation: Use `ini@^5.0.0` for Phase 1. Upgrade to v6 only if specific features are needed.

4. **Loxberry plugin paths -- dev vs production**
   - What we know: Production paths are under `/opt/loxberry/`. Development happens on Windows.
   - What's unclear: How to structure the project for local development vs. Loxberry deployment.
   - Recommendation: Use environment variables (`LOXBERRY_DIR` or similar) to override base paths. Default to `/opt/loxberry/` for production. Allow overrides for local testing.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.x (or Node.js built-in test runner) |
| Config file | none -- Wave 0 |
| Quick run command | `yarn test` |
| Full suite command | `yarn test --coverage` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MQTT-01 | Connects to Mosquitto with configurable params | integration | `yarn test tests/mqtt-collector.test.js -t "connects"` | Wave 0 |
| MQTT-02 | Subscribes to configurable base topic | unit | `yarn test tests/mqtt-collector.test.js -t "subscribes"` | Wave 0 |
| MQTT-03 | Drain window collects messages then disconnects | unit | `yarn test tests/mqtt-collector.test.js -t "drain"` | Wave 0 |
| MQTT-04 | Hard timeout exits process | unit | `yarn test tests/watchdog.test.js -t "timeout"` | Wave 0 |
| MQTT-05 | Pidfile lock prevents overlapping runs | unit | `yarn test tests/lock.test.js -t "lock"` | Wave 0 |
| DEVT-01 | Parses bridge/devices to device registry | unit | `yarn test tests/device-registry.test.js` | Wave 0 |
| DEVT-04 | Persists state to JSON between runs | unit | `yarn test tests/state-store.test.js -t "persist"` | Wave 0 |
| DEVT-05 | Atomic writes prevent corruption | unit | `yarn test tests/state-store.test.js -t "atomic"` | Wave 0 |
| PLUG-05 | Config read from INI file | unit | `yarn test tests/config.test.js` | Wave 0 |

### Sampling Rate
- **Per task commit:** `yarn test`
- **Per wave merge:** `yarn test --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `package.json` -- project initialization with jest as dev dependency
- [ ] `jest.config.js` -- Jest configuration
- [ ] `tests/mqtt-collector.test.js` -- covers MQTT-01, MQTT-02, MQTT-03 (mock mqtt client)
- [ ] `tests/state-store.test.js` -- covers DEVT-04, DEVT-05
- [ ] `tests/device-registry.test.js` -- covers DEVT-01
- [ ] `tests/config.test.js` -- covers PLUG-05
- [ ] `tests/lock.test.js` -- covers MQTT-05
- [ ] `tests/fixtures/` -- sample bridge/devices JSON, sample INI config, sample state.json

## Sources

### Primary (HIGH confidence)
- [mqtt.js GitHub](https://github.com/mqttjs/MQTT.js) -- v5.15.x API: connect options, client.end() signature, reconnectPeriod, connectTimeout, event names
- [zigbee2mqtt MQTT Topics](https://www.zigbee2mqtt.io/guide/usage/mqtt_topics_and_messages.html) -- bridge/devices payload structure, bridge/state format, device topic patterns
- [zigbee2mqtt All Settings](https://www.zigbee2mqtt.io/guide/configuration/all-settings.html) -- `last_seen` config: disable (default), ISO_8601, ISO_8601_local, epoch
- [write-file-atomic npm](https://www.npmjs.com/package/write-file-atomic) -- v7.0.0 API, atomic write pattern, Node >=20.17.0/>=22.9.0
- [ini GitHub](https://github.com/npm/ini) -- v6.0.0 (latest), parse/stringify API, section handling

### Secondary (MEDIUM confidence)
- [proper-lockfile npm](https://www.npmjs.com/package/proper-lockfile) -- v4.x, mkdir-based locking, stale detection, auto-cleanup
- Loxberry plugin development wiki -- directory layout, plugin.cfg format (training data, cutoff Aug 2025)

### Tertiary (LOW confidence)
- Loxberry-specific paths (cron fragment, notification API) -- must verify on live host

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- mqtt 5.x, ini, write-file-atomic, proper-lockfile are all well-documented, actively maintained packages verified via npm and GitHub
- Architecture: HIGH -- drain-window pattern, atomic writes, pidfile locking are well-established systems patterns; zigbee2mqtt topic structure is stable and documented
- Pitfalls: HIGH -- MQTT async lifecycle, state corruption, friendly_name mutability are protocol/domain-level facts verified from multiple sources

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (30 days -- stable domain, no fast-moving dependencies)
