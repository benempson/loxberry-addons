# Phase 2: Threshold Evaluation and Alert Logic - Research

**Researched:** 2026-03-14
**Domain:** State-machine alert evaluation (pure business logic, no new dependencies)
**Confidence:** HIGH

## Summary

Phase 2 is a pure logic module with no new library dependencies. The evaluator reads device state (already populated by Phase 1's `mergeDeviceState`), compares against configurable thresholds, and produces alert state transitions. The core complexity lies in correct state machine transitions (ok-to-alert, alert-to-ok) and preventing duplicate alerts across cron runs.

The existing codebase provides all infrastructure: config parsing with typed thresholds, atomic state persistence, and a device state shape with a scaffolded alerts object. The evaluator module slots cleanly between `mergeDeviceState()` and `writeState()` in the main lifecycle.

**Primary recommendation:** Build `bin/lib/evaluator.js` as a pure function that takes `(state, config)` and returns a transitions/summary object, mutating `state.devices[ieee].alerts` in place (consistent with `mergeDeviceState` pattern). No new npm dependencies needed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Match exclusion list against BOTH friendly_name and IEEE address (case-insensitive)
- No wildcard/glob patterns -- exact match only
- Log skipped devices at debug level for troubleshooting
- Devices with null last_seen are immediately flagged as offline (not ignored)
- Alert detail for never-seen devices uses a distinct "never seen" label (not "last seen X hours ago")
- Battery-powered devices with null battery do NOT trigger a battery alert -- only actual low readings trigger alerts
- Battery threshold comparison is less-than-or-equal (battery <= threshold triggers alert)
- Evaluator is a separate module (bin/lib/evaluator.js), consistent with existing modular pattern
- Returns both new state transitions (ok->alert, alert->ok) AND a full active-alerts summary
- Evaluation results are persisted in state.json (not just passed in-memory) so PHP web UI and external tools can read alert status
- Console output includes a summary line: "3 alerts (2 offline, 1 battery), 1 recovery, 5 excluded"
- Recovery events (alert->ok) are produced alongside alert events (ok->alert)
- State tracks recovered_at timestamps (offline_recovered_at, battery_recovered_at) in the per-device alerts object
- Single "seen again" = recovered -- no sustained/consecutive-run debounce required
- Battery alert clears with hysteresis: battery must exceed threshold + hysteresis band to clear (prevents toggling near boundary)
- Alert state object per device extends to: `{ offline, offline_sent_at, offline_recovered_at, battery, battery_sent_at, battery_recovered_at }`

### Claude's Discretion
- Exact hysteresis band size for battery recovery (suggest 5% but open to what makes sense)
- Internal data structures for the evaluation result object
- Error handling for edge cases (corrupt state, missing config fields)
- Test structure and fixture design

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEVT-02 | Plugin tracks last_seen per device from device payloads (falls back to message receipt time) | Already implemented by Phase 1 `mergeDeviceState`. Evaluator consumes `state.devices[ieee].last_seen` |
| DEVT-03 | Plugin tracks battery level for battery-powered devices only (identified via power_source) | Already implemented by Phase 1 `mergeDeviceState`. Evaluator consumes `state.devices[ieee].battery` |
| ALRT-01 | Plugin alerts when device not seen for longer than configurable threshold (default 24h) | Evaluator compares `last_seen` against `now - offline_hours`. Null last_seen = immediate offline flag |
| ALRT-02 | Plugin alerts when battery-powered device battery drops below configurable threshold (default 25%) | Evaluator checks `battery <= battery_pct` for Battery power_source devices only. Null battery = no alert |
| ALRT-03 | Plugin suppresses duplicate alerts -- only alerts on ok->alert transition | State machine: only emit transition event when `alerts.offline` changes false->true or `alerts.battery` changes false->true |
| ALRT-04 | Plugin clears alert state when device recovers | State machine: offline clears when device seen recently enough; battery clears when `battery > threshold + hysteresis` |
| ALRT-05 | Plugin skips monitoring for devices on the exclusion list | Match exclusion list against friendly_name and IEEE address (case-insensitive exact match) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none new) | - | Evaluator is pure business logic | No I/O, no parsing, no network -- just comparisons and state mutation |

### Already Available (from Phase 1)
| Library | Version | Purpose | Used By Evaluator |
|---------|---------|---------|-------------------|
| jest | ^29.0.0 | Unit testing | Test the evaluator's state transitions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom state machine | xstate/robot3 | Massive overkill for 2 boolean flags per device |
| External rules engine | json-rules-engine | Unnecessary abstraction for fixed threshold logic |

## Architecture Patterns

### Recommended Project Structure
```
bin/
  lib/
    evaluator.js       # NEW: threshold evaluation + alert state transitions
    config.js          # existing: reads thresholds + exclusions
    state-store.js     # existing: readState/writeState
    device-registry.js # existing: builds device registry
  watchdog.js          # existing: add evaluateDevices() call after mergeDeviceState()
tests/
  evaluator.test.js    # NEW: comprehensive state transition tests
  fixtures/
    state.json         # existing: extend with alert scenarios
```

### Pattern 1: Pure Evaluator Function
**What:** Single exported function `evaluateDevices(state, config, now)` that takes state (mutated in place), config, and optional `now` timestamp (for testability).
**When to use:** Always -- this is THE pattern for the evaluator.
**Why `now` parameter:** Allows deterministic testing without mocking `Date`. Phase 1 already showed the pain of mocking Date in `watchdog.test.js`.

```javascript
'use strict';

/**
 * Evaluate all devices against thresholds and produce transitions.
 * Mutates state.devices[ieee].alerts in place.
 *
 * @param {object} state - Full state object with state.devices
 * @param {object} config - Parsed config with THRESHOLDS and EXCLUSIONS
 * @param {Date} [now=new Date()] - Current time (injectable for testing)
 * @returns {{ transitions: Array, summary: object }}
 */
function evaluateDevices(state, config, now) {
  now = now || new Date();
  const thresholds = config.THRESHOLDS;
  const exclusions = config.EXCLUSIONS.devices || [];
  const offlineMs = thresholds.offline_hours * 3600000;
  const batteryPct = thresholds.battery_pct;
  const hysteresis = 5; // battery must exceed threshold + 5% to clear

  const transitions = [];
  let excludedCount = 0;

  for (const [ieee, device] of Object.entries(state.devices)) {
    // Exclusion check
    if (isExcluded(ieee, device.friendly_name, exclusions)) {
      excludedCount++;
      continue;
    }

    // Offline evaluation
    // ... threshold comparison logic
    // ... state transition detection

    // Battery evaluation (battery-powered only)
    // ... threshold comparison logic with hysteresis on recovery
  }

  // Build summary
  const activeAlerts = buildActiveSummary(state.devices, exclusions);

  // Persist evaluation metadata in state
  state.last_evaluation = now.toISOString();
  state.evaluation_summary = activeAlerts;

  return { transitions, summary: activeAlerts, excludedCount };
}
```

### Pattern 2: Exclusion Matching
**What:** Case-insensitive exact match against both IEEE address and friendly_name.
**Implementation:**

```javascript
function isExcluded(ieee, friendlyName, exclusions) {
  const lowerIeee = ieee.toLowerCase();
  const lowerName = (friendlyName || '').toLowerCase();
  return exclusions.some(ex => {
    const lowerEx = ex.toLowerCase();
    return lowerEx === lowerIeee || lowerEx === lowerName;
  });
}
```

### Pattern 3: State Machine Transitions
**What:** Each device has two independent boolean alert flags (offline, battery). Transitions are detected by comparing previous state to new evaluation.

```
offline state machine:
  ok -> alert:   last_seen is null OR (now - last_seen) > offline_hours
                 Set offline=true, offline_sent_at=now
                 Emit { type: 'offline', ieee, device, transition: 'alert' }

  alert -> ok:   last_seen is not null AND (now - last_seen) <= offline_hours
                 Set offline=false, offline_recovered_at=now
                 Emit { type: 'offline', ieee, device, transition: 'recovery' }

  ok -> ok:      No action
  alert -> alert: No action (duplicate suppression)

battery state machine:
  ok -> alert:   power_source=Battery AND battery is not null AND battery <= battery_pct
                 Set battery=true, battery_sent_at=now
                 Emit { type: 'battery', ieee, device, transition: 'alert' }

  alert -> ok:   battery is not null AND battery > battery_pct + hysteresis
                 Set battery=false, battery_recovered_at=now
                 Emit { type: 'battery', ieee, device, transition: 'recovery' }

  ok -> ok:      No action
  alert -> alert: No action (duplicate suppression)
```

### Pattern 4: Extended Alert State Shape
**What:** The alerts object per device extends from Phase 1's scaffold.

```javascript
// Phase 1 scaffold (existing):
alerts: { offline: false, offline_sent_at: null, battery: false, battery_sent_at: null }

// Phase 2 extended:
alerts: {
  offline: false,
  offline_sent_at: null,
  offline_recovered_at: null,
  battery: false,
  battery_sent_at: null,
  battery_recovered_at: null,
}
```

The evaluator must handle Phase 1 state files that lack `offline_recovered_at` and `battery_recovered_at` (treat as null).

### Pattern 5: Watchdog Integration
**What:** Add `evaluateDevices` call in `watchdog.js` main(), between `mergeDeviceState()` and `writeState()`.

```javascript
// In main():
mergeDeviceState(state, registry, messages, config.MQTT.base_topic);
const result = evaluateDevices(state, config);
// Console summary
console.log(formatSummary(result));
state.last_run = new Date().toISOString();
await writeState(STATE_PATH, state);
```

### Anti-Patterns to Avoid
- **Storing transitions in state.json permanently:** Only store current alert status and timestamps. Transitions are ephemeral (consumed by Phase 3 notification delivery). Store them in a `state.pending_notifications` array that Phase 3 will consume and clear.
- **Evaluating excluded devices then filtering:** Skip excluded devices entirely before evaluation. This ensures no alert state changes occur for excluded devices.
- **Using device.power_source !== 'Battery' to skip battery checks:** There may be other battery power_source values (e.g., "Battery" is the standard zigbee2mqtt value). Use exact match `power_source === 'Battery'` -- consistent with Phase 1's `mergeDeviceState`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ISO date parsing | Custom date parser | `new Date(isoString)` | ISO 8601 strings are natively parsed by JS Date constructor |
| Time difference calculation | Custom duration logic | `now.getTime() - new Date(last_seen).getTime()` | Simple millisecond arithmetic, no library needed |
| Deep clone for testing | Manual object copying | `JSON.parse(JSON.stringify(state))` | Test fixtures need fresh copies; structuredClone also works in Node 17+ |

**Key insight:** This phase is pure arithmetic and boolean logic. No libraries are needed. The only complexity is getting the state transitions right, which is a testing problem, not a library problem.

## Common Pitfalls

### Pitfall 1: Mutating Test Fixtures
**What goes wrong:** Tests share a fixture object, one test mutates it, subsequent tests get polluted state.
**Why it happens:** `evaluateDevices` mutates `state.devices[ieee].alerts` in place.
**How to avoid:** Each test creates a fresh deep copy of the fixture. Use factory functions that return new objects.
**Warning signs:** Tests pass individually but fail when run together.

### Pitfall 2: Hysteresis Creates Dead Zone
**What goes wrong:** Battery at exactly `threshold + hysteresis` never clears the alert.
**Why it happens:** Off-by-one in the comparison operator.
**How to avoid:** Use strict greater-than: `battery > threshold + hysteresis` for recovery. Alert triggers at `battery <= threshold`. This means battery at 25% triggers alert (threshold=25), and must rise above 30% to clear (hysteresis=5). Battery at exactly 30% stays in alert.
**Warning signs:** Devices oscillating between alert/recovery states.

### Pitfall 3: Null vs Missing Fields in Legacy State
**What goes wrong:** Evaluator crashes on `state.devices[ieee].alerts.offline_recovered_at` because old state files lack that field.
**Why it happens:** Phase 1 state files don't have `offline_recovered_at` / `battery_recovered_at`.
**How to avoid:** Defensive reads: `const recoveredAt = alerts.offline_recovered_at || null`. The evaluator should normalize the alerts object before evaluation.
**Warning signs:** Crash on first run after upgrade from Phase 1.

### Pitfall 4: Timezone/DST Issues in Duration Calculation
**What goes wrong:** Offline threshold miscalculated during DST transition.
**Why it happens:** Using hour arithmetic instead of millisecond arithmetic.
**How to avoid:** Always work in UTC milliseconds: `now.getTime() - new Date(lastSeen).getTime()`. All timestamps in state.json are ISO 8601 (which includes timezone info). `new Date()` handles this correctly.
**Warning signs:** Devices briefly flagged as offline during DST changes.

### Pitfall 5: Exclusion Check After Alert State Change
**What goes wrong:** Excluded device gets alert state changed, then the transition is suppressed. Device is now "stuck" in alert state.
**Why it happens:** Checking exclusion list after evaluating thresholds.
**How to avoid:** Check exclusion FIRST, skip the device entirely (including all state mutations).
**Warning signs:** Excluded device showing as alerting in web UI.

### Pitfall 6: Non-Battery Device with battery Field
**What goes wrong:** Mains-powered router device has a battery field from a previous state entry or payload quirk, gets evaluated for battery alerts.
**Why it happens:** Only checking `battery != null` without checking `power_source`.
**How to avoid:** Always gate battery evaluation on `power_source === 'Battery'`. Phase 1 already filters battery updates by power_source in `mergeDeviceState`, but the evaluator should also guard.
**Warning signs:** Router devices triggering low battery alerts.

## Code Examples

### Transition Event Object Shape
```javascript
// Recommended shape for transition events (consumed by Phase 3)
{
  type: 'offline',         // 'offline' | 'battery'
  transition: 'alert',     // 'alert' | 'recovery'
  ieee: '0x00158d0001a2b3c4',
  friendly_name: 'Kitchen Door',
  detail: 'not seen for 26.5 hours',  // or 'never seen' for null last_seen
  // For battery:
  // detail: 'battery at 12% (threshold: 25%)'
  // For recovery:
  // detail: 'seen again after 26.5 hours offline'
  // detail: 'battery recovered to 31% (was below 25%)'
  timestamp: '2026-03-14T12:00:00.000Z',
}
```

### Summary Object Shape
```javascript
// Returned by evaluateDevices and persisted in state.evaluation_summary
{
  total_devices: 15,
  excluded: 2,
  evaluated: 13,
  alerts: {
    offline: 3,
    battery: 1,
    total: 4,
  },
  transitions: {
    new_alerts: 2,
    recoveries: 1,
  },
}
```

### Console Summary Format
```javascript
function formatSummary(result) {
  const { summary, excludedCount } = result;
  const alerts = result.transitions.filter(t => t.transition === 'alert');
  const recoveries = result.transitions.filter(t => t.transition === 'recovery');
  const offlineAlerts = alerts.filter(t => t.type === 'offline').length;
  const batteryAlerts = alerts.filter(t => t.type === 'battery').length;

  const parts = [];
  if (alerts.length > 0) {
    const breakdown = [];
    if (offlineAlerts > 0) breakdown.push(`${offlineAlerts} offline`);
    if (batteryAlerts > 0) breakdown.push(`${batteryAlerts} battery`);
    parts.push(`${alerts.length} alerts (${breakdown.join(', ')})`);
  }
  if (recoveries.length > 0) parts.push(`${recoveries.length} recovery`);
  if (excludedCount > 0) parts.push(`${excludedCount} excluded`);

  return parts.length > 0 ? parts.join(', ') : 'No changes';
}
```

### Hysteresis Implementation
```javascript
// Battery recovery with hysteresis (recommended: 5%)
const BATTERY_HYSTERESIS = 5;

// Alert trigger: battery <= threshold
const isBatteryLow = (battery !== null && battery <= batteryPct);

// Recovery: battery must exceed threshold + hysteresis
const isBatteryRecovered = (battery !== null && battery > batteryPct + BATTERY_HYSTERESIS);

// State transitions:
if (!alerts.battery && isBatteryLow) {
  // ok -> alert
  alerts.battery = true;
  alerts.battery_sent_at = now.toISOString();
} else if (alerts.battery && isBatteryRecovered) {
  // alert -> ok
  alerts.battery = false;
  alerts.battery_recovered_at = now.toISOString();
}
// else: no transition (ok->ok or alert->alert)
```

### Pending Notifications Pattern
```javascript
// Store transitions for Phase 3 consumption
if (!state.pending_notifications) state.pending_notifications = [];
for (const transition of transitions) {
  state.pending_notifications.push(transition);
}
// Phase 3 will read state.pending_notifications, send them, then clear the array
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Store alert history | Store only current state + last transition timestamps | Always (for cron-based tools) | Prevents unbounded state growth |
| Global Date mocking | Injectable `now` parameter | Best practice | Deterministic tests without fragile mocks |

**Key design choice:** 5% hysteresis band for battery recovery is a well-established pattern in threshold-based monitoring. It prevents rapid toggling when a sensor battery hovers near the threshold (e.g., battery reads 24%, then 26%, then 24% on consecutive runs). A 5% band means: alert at 25%, recover only above 30%.

## Open Questions

1. **Pending notifications storage location**
   - What we know: Transitions need to be available for Phase 3 (notification delivery)
   - What's unclear: Should transitions go in `state.pending_notifications` array or a separate file?
   - Recommendation: Use `state.pending_notifications` array in state.json. Simple, atomic with state writes, and Phase 3 can clear it after sending. No need for a separate file.

2. **Evaluation of devices no longer in registry**
   - What we know: Phase 1 preserves devices not in current registry (device removed from zigbee2mqtt but still in state)
   - What's unclear: Should the evaluator flag these as offline too?
   - Recommendation: Yes -- evaluate ALL devices in state.devices (not just those in current registry). A device removed from zigbee2mqtt but still in state will naturally trigger the offline threshold since its last_seen won't update.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.x |
| Config file | package.json `scripts.test` (no separate config file) |
| Quick run command | `npx jest tests/evaluator.test.js` |
| Full suite command | `npx jest` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEVT-02 | last_seen consumed by evaluator for offline check | unit | `npx jest tests/evaluator.test.js -t "offline" -x` | No -- Wave 0 |
| DEVT-03 | battery consumed by evaluator for battery check | unit | `npx jest tests/evaluator.test.js -t "battery" -x` | No -- Wave 0 |
| ALRT-01 | Device not seen beyond threshold flagged offline | unit | `npx jest tests/evaluator.test.js -t "offline threshold" -x` | No -- Wave 0 |
| ALRT-02 | Battery below threshold flagged | unit | `npx jest tests/evaluator.test.js -t "battery threshold" -x` | No -- Wave 0 |
| ALRT-03 | Duplicate alert suppression (alert->alert = no transition) | unit | `npx jest tests/evaluator.test.js -t "duplicate" -x` | No -- Wave 0 |
| ALRT-04 | Alert clears on recovery (with hysteresis for battery) | unit | `npx jest tests/evaluator.test.js -t "recovery" -x` | No -- Wave 0 |
| ALRT-05 | Excluded devices skipped entirely | unit | `npx jest tests/evaluator.test.js -t "excluded" -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest tests/evaluator.test.js`
- **Per wave merge:** `npx jest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/evaluator.test.js` -- covers ALRT-01 through ALRT-05, DEVT-02, DEVT-03
- [ ] Test fixtures for various device states (online, offline, never-seen, low-battery, recovering, excluded)

## Sources

### Primary (HIGH confidence)
- Existing codebase: `bin/watchdog.js`, `bin/lib/config.js`, `bin/lib/state-store.js` -- reviewed directly
- Phase 1 test suite: `tests/watchdog.test.js` -- reviewed patterns and conventions
- CONTEXT.md decisions -- locked implementation choices

### Secondary (MEDIUM confidence)
- Hysteresis pattern for threshold monitoring: standard engineering practice, widely used in HVAC, battery monitoring, industrial control systems. 5% band is conservative and appropriate for battery percentage readings.

### Tertiary (LOW confidence)
- None -- this phase requires no external libraries or APIs to research

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, pure logic module
- Architecture: HIGH -- follows established project patterns exactly (CommonJS, single export, state mutation)
- Pitfalls: HIGH -- identified from direct code review and state machine analysis

**Research date:** 2026-03-14
**Valid until:** Indefinite (pure logic, no external dependencies to change)
