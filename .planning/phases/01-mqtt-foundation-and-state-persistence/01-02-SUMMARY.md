---
phase: 01-mqtt-foundation-and-state-persistence
plan: 02
subsystem: mqtt
tags: [mqtt, zigbee2mqtt, device-registry, tdd, jest]

# Dependency graph
requires:
  - "01-01: Project scaffold, config reader, test fixtures"
provides:
  - "MQTT collector module (collectMessages) with connect/subscribe/drain/disconnect lifecycle"
  - "Device registry module (buildDeviceRegistry) parsing bridge/devices into IEEE-keyed Map"
affects: [01-03, 01-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [mqtt-collector-drain-pattern, device-registry-map-pattern, jest-mock-factory-with-eventemitter]

key-files:
  created: [bin/lib/mqtt-collector.js, bin/lib/device-registry.js, tests/mqtt-collector.test.js, tests/device-registry.test.js]
  modified: []

key-decisions:
  - "Used jest.mock factory with require('events') inside to satisfy Jest scoping rules"
  - "collectMessages accepts drain_seconds directly; caller merges CRON config before calling"
  - "client.end(true) on error for immediate forced disconnect vs end(false) for clean drain"

patterns-established:
  - "MQTT collector pattern: connect, subscribe wildcard, collect into Map, drain timer, clean disconnect"
  - "Device registry pattern: filter payload by type and interview_completed, key Map on ieee_address"

requirements-completed: [MQTT-01, MQTT-02, MQTT-03, MQTT-04, DEVT-01]

# Metrics
duration: 2min
completed: 2026-03-14
---

# Phase 1 Plan 02: MQTT Collector and Device Registry Summary

**MQTT drain-window collector and bridge/devices registry parser with full mock-based test coverage**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-14T11:12:26Z
- **Completed:** 2026-03-14T11:14:41Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Device registry module that parses zigbee2mqtt bridge/devices payload into IEEE-keyed Map, filtering Coordinator and incomplete-interview devices
- MQTT collector module with configurable connect/subscribe/drain/disconnect lifecycle for cron-safe operation (reconnectPeriod: 0, clean: true)
- 17 new tests (9 device-registry + 8 mqtt-collector), all passing with full mock coverage

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing device-registry tests** - `dc2af8f` (test)
2. **Task 1 GREEN: Device registry implementation** - `fb7771c` (feat)
3. **Task 2 RED: Failing mqtt-collector tests** - `1a44c96` (test)
4. **Task 2 GREEN: MQTT collector implementation** - `e172929` (feat)

## Files Created/Modified
- `bin/lib/device-registry.js` - Exports buildDeviceRegistry() for parsing bridge/devices into IEEE-keyed Map
- `bin/lib/mqtt-collector.js` - Exports collectMessages() for MQTT connect/subscribe/drain/disconnect lifecycle
- `tests/device-registry.test.js` - 9 unit tests covering parsing, filtering, and edge cases
- `tests/mqtt-collector.test.js` - 8 unit tests with mocked mqtt client and fake timers

## Decisions Made
- Used jest.mock factory with require('events') inside to satisfy Jest out-of-scope variable restriction
- collectMessages accepts drain_seconds directly in mqttConfig rather than reading from CRON config internally; the caller (watchdog.js) will merge configs before calling
- On error, client.end(true) forces immediate disconnect; on drain completion, client.end(false) allows graceful shutdown

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed jest.mock scoping for EventEmitter**
- **Found during:** Task 2 GREEN (mqtt-collector tests)
- **Issue:** Jest does not allow jest.mock() factory to reference out-of-scope variables like EventEmitter
- **Fix:** Moved require('events') inside the jest.mock factory function using destructured import
- **Files modified:** tests/mqtt-collector.test.js
- **Verification:** All 8 mqtt-collector tests pass
- **Committed in:** e172929 (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary fix for Jest mock scoping rules. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both data-acquisition modules ready for integration by watchdog.js (plan 04)
- Device registry Map can be consumed by state store (plan 03) for device tracking
- All 26 tests across 3 test suites passing (config + device-registry + mqtt-collector)

---
*Phase: 01-mqtt-foundation-and-state-persistence*
*Completed: 2026-03-14*

## Self-Check: PASSED
- All 4 created files verified present on disk
- All 4 task commits verified in git log
