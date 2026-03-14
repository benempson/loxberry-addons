# Phase 2: Threshold Evaluation and Alert Logic - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Evaluate device health against configurable thresholds (offline duration, battery level) and track alert state transitions to prevent duplicate alerts. Skip excluded devices. Produce structured evaluation results for Phase 3 (notification delivery) and Phase 4 (web UI status display). Does NOT deliver notifications — that's Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Exclusion Matching
- Match exclusion list against BOTH friendly_name and IEEE address (case-insensitive)
- No wildcard/glob patterns — exact match only
- Log skipped devices at debug level for troubleshooting

### Never-Seen Devices
- Devices with null last_seen are immediately flagged as offline (not ignored)
- Alert detail for never-seen devices uses a distinct "never seen" label (not "last seen X hours ago")
- Battery-powered devices with null battery do NOT trigger a battery alert — only actual low readings trigger alerts
- Battery threshold comparison is less-than-or-equal (battery <= threshold triggers alert)

### Alert Result Contract
- Evaluator is a separate module (bin/lib/evaluator.js), consistent with existing modular pattern
- Returns both new state transitions (ok→alert, alert→ok) AND a full active-alerts summary
- Evaluation results are persisted in state.json (not just passed in-memory) so PHP web UI and external tools can read alert status
- Console output includes a summary line: "3 alerts (2 offline, 1 battery), 1 recovery, 5 excluded"

### Recovery Behavior
- Recovery events (alert→ok) are produced alongside alert events (ok→alert)
- State tracks recovered_at timestamps (offline_recovered_at, battery_recovered_at) in the per-device alerts object
- Single "seen again" = recovered — no sustained/consecutive-run debounce required
- Battery alert clears with hysteresis: battery must exceed threshold + hysteresis band to clear (prevents toggling near boundary)

### Claude's Discretion
- Exact hysteresis band size for battery recovery (suggest 5% but open to what makes sense)
- Internal data structures for the evaluation result object
- Error handling for edge cases (corrupt state, missing config fields)
- Test structure and fixture design

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bin/lib/config.js`: Already reads THRESHOLDS (offline_hours, battery_pct) and EXCLUSIONS (devices as array) from INI
- `bin/lib/state-store.js`: readState/writeState with atomic writes — evaluator results persist through this
- `bin/lib/device-registry.js`: buildDeviceRegistry filters coordinators and incomplete interviews
- `bin/watchdog.js`: mergeDeviceState already populates last_seen, battery, and scaffolded alerts object per device

### Established Patterns
- CommonJS modules with 'use strict', single exported function per module
- State shape: `{ last_run, devices: { [ieee]: { friendly_name, power_source, type, last_seen, battery, alerts: {...} } } }`
- Config shape: `{ MQTT: {...}, THRESHOLDS: { offline_hours, battery_pct }, CRON: {...}, NOTIFICATIONS: {...}, EXCLUSIONS: { devices: [] } }`
- Tests use Jest with fixtures in tests/ directory

### Integration Points
- Evaluator slots into main() between mergeDeviceState() and writeState() calls
- Alert state structure in state.devices[ieee].alerts needs extending: add offline_recovered_at, battery_recovered_at
- Exclusion check uses config.EXCLUSIONS.devices array (already parsed as string[])
- Evaluation results stored in state.json for Phase 3 (notifications) and Phase 4 (web UI) to consume

</code_context>

<specifics>
## Specific Ideas

- Alert state object per device extends to: `{ offline, offline_sent_at, offline_recovered_at, battery, battery_sent_at, battery_recovered_at }`
- Evaluation result in state.json should include: transitions array (new alerts + recoveries) and active_alerts summary
- "Never seen" is a distinct status from "offline for N hours" — downstream notification formatting should differentiate

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-threshold-evaluation-and-alert-logic*
*Context gathered: 2026-03-14*
