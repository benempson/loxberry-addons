---
phase: 01-mqtt-foundation-and-state-persistence
plan: 04
subsystem: integration
tags: [cron, watchdog, mqtt, state-merge, zigbee2mqtt]

requires:
  - phase: 01-mqtt-foundation-and-state-persistence
    provides: config reader, MQTT collector, device registry, state store
provides:
  - watchdog.js cron entry point wiring all Phase 1 modules
  - mergeDeviceState function for combining registry + MQTT data into persisted state
affects: [02-alert-engine-and-notification-system]

tech-stack:
  added: []
  patterns: [cron-lifecycle-with-lock, device-state-merge, hard-timeout-safety-net]

key-files:
  created: [bin/watchdog.js, tests/watchdog.test.js]
  modified: []

key-decisions:
  - "Exported main() for testability; require.main guard for cron execution"
  - "mergeDeviceState mutates state in place for simplicity; preserves devices not in current registry"
  - "process.exit test uses sentinel throw pattern to simulate exit behavior in Jest"

patterns-established:
  - "Cron lifecycle: lock -> config -> state -> collect -> registry -> merge -> write -> unlock -> exit"
  - "Hard timeout at script top (.unref()) before any async work"
  - "ELOCKED -> exit 0 (skip, not error)"

requirements-completed: [MQTT-04, DEVT-01, DEVT-04, DEVT-05, MQTT-05, MQTT-01, MQTT-02, MQTT-03, PLUG-05]

duration: 3min
completed: 2026-03-14
---

# Phase 1 Plan 4: Watchdog Entry Point Summary

**Cron entry point wiring config, MQTT collector, device registry, and state store with device state merge logic**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-14T11:26:48Z
- **Completed:** 2026-03-14T11:30:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Complete cron-ready watchdog.js entry point with hard 30s timeout safety net
- mergeDeviceState correctly handles new/existing devices, battery vs mains, last_seen fallback, alert preservation, slash-in-name topics
- 12 tests covering merge logic (9 cases), hard timeout, lifecycle ordering, and ELOCKED lock skip
- Full Phase 1 test suite (48 tests across 6 files) passes

## Task Commits

Each task was committed atomically:

1. **Task 1: mergeDeviceState function and watchdog.js entry point** - `44c3fc5` (feat)

## Files Created/Modified
- `bin/watchdog.js` - Main cron entry point with lifecycle, merge logic, and hard timeout
- `tests/watchdog.test.js` - 12 tests: merge logic, timeout, lifecycle, lock handling

## Decisions Made
- Exported `main()` for testability alongside `mergeDeviceState`; `require.main === module` guard prevents auto-run when required for tests
- mergeDeviceState preserves devices not in current registry (device might just not appear in bridge/devices this run)
- ELOCKED test uses sentinel-throw pattern: mock `process.exit` throws to halt execution, then assert exit code

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ELOCKED test assertion**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** `process.exit(0)` mock did not halt execution, causing test to continue into unmocked code
- **Fix:** Changed mock to throw sentinel error, then assert exitCode in catch block
- **Files modified:** tests/watchdog.test.js
- **Verification:** All 12 tests pass
- **Committed in:** 44c3fc5

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test fix necessary for correct test behavior. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Phase 1 modules complete: config, MQTT collector, device registry, state store, watchdog entry point
- 48 tests passing across 6 test files
- Ready for Phase 2: Alert Engine and Notification System
- mergeDeviceState provides the device state structure that alert evaluation will operate on

---
*Phase: 01-mqtt-foundation-and-state-persistence*
*Completed: 2026-03-14*
