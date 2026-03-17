---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 06-01-PLAN.md
last_updated: "2026-03-17T15:45:59.360Z"
last_activity: 2026-03-17 - Completed 06-01 (Loxberry auto-update via release.cfg, GitHub Actions, enhanced release.js)
progress:
  total_phases: 11
  completed_phases: 10
  total_plans: 24
  completed_plans: 23
  percent: 96
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-14)

**Core value:** Proactively alert when Zigbee devices are offline or low on battery so they can be fixed before the user notices missing functionality around the house.
**Current focus:** Phase 6: Auto-update mechanism

## Current Position

Phase: 6 of 10 (Auto-update mechanism)
Plan: 1 of 1 in current phase -- Complete
Status: In Progress
Last activity: 2026-03-17 - Completed 06-01 (Loxberry auto-update via release.cfg, GitHub Actions, enhanced release.js)

Progress: [██████████] 96%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01 P01 | 3min | 2 tasks | 8 files |
| Phase 01 P02 | 2min | 2 tasks | 4 files |
| Phase 01 P03 | 3min | 2 tasks | 3 files |
| Phase 01 P04 | 3min | 1 tasks | 2 files |
| Phase 02 P01 | 4min | 2 tasks | 2 files |
| Phase 02 P02 | 3min | 1 tasks | 2 files |
| Phase 03 P01 | 3min | 2 tasks | 4 files |
| Phase 03 P02 | 3min | 2 tasks | 7 files |
| Phase 03 P03 | 3min | 2 tasks | 4 files |
| Phase 04 P01 | 4min | 2 tasks | 3 files |
| Phase 04 P02 | 3min | 2 tasks | 1 files |
| Phase 04 P03 | 2min | 2 tasks | 3 files |
| Phase 05 P01 | 3min | 2 tasks | 7 files |
| Phase 05 P02 | 2min | 2 tasks | 2 files |
| Phase 05.1 P01 | 4min | 1 tasks | 11 files |
| Phase 05.1 P02 | 3min | 2 tasks | 6 files |
| Phase 05.1 P03 | 4min | 1 tasks | 4 files |
| Phase 05.2 P01 | 1min | 2 tasks | 3 files |
| Phase 05.3 P01 | 1min | 2 tasks | 1 files |
| Phase quick P1 | 1min | 2 tasks | 3 files |
| Phase 05.4 P01 | 2min | 2 tasks | 2 files |
| Phase 05.4 P02 | 2min | 2 tasks | 1 files |
| Phase 05.5 P01 | 1min | 1 tasks | 1 files |
| Phase 06 P01 | 1min | 2 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 03]: Bridge monitor treats missing/malformed payloads as offline (safe default)
- [Phase 03]: First run defaults wasOnline=true so initial offline is detected as transition
- [Phase 03]: HTML email uses inline styles (email clients strip external CSS)
- [Phase 03]: Strict shell sanitization: replace quotes, strip backticks/dollar/backslash for Loxberry notify
- [Phase 03]: 10s Nodemailer timeouts (connection/greeting/socket) to stay within 30s hard timeout
- [Phase 02]: 5% battery hysteresis band; alert at <=25%, recover only above 30%
- [Phase 02]: Strict greater-than for offline threshold boundary (exactly 24h = not offline)
- [Phase 02]: normalizeAlerts handles legacy Phase 1 state missing recovered_at fields
- [Phase 02]: formatSummary is private helper in watchdog.js; console format locked as "N alerts (X offline, Y battery), N recovery, N excluded"
- [Phase 01]: Used ini@5.x over v6 for stability
- [Phase 01]: collectMessages accepts drain_seconds directly; caller merges CRON config
- [Phase 01]: client.end(true) on error for forced disconnect vs end(false) for clean drain
- [Phase 01]: Stale lock timeout 60s for pidfile locking; readState returns copy of empty state to prevent mutation
- [Phase 01]: Exported main() for testability; mergeDeviceState preserves devices not in current registry
- [Phase 03]: Bridge offline skips device evaluation entirely to avoid false positives from stale data
- [Phase 03]: State written twice per run: once after evaluation, once after notification delivery to clear pending
- [Phase 04]: PHP must double-quote INI values containing semicolons (ini@5.x treats unquoted ; as comment)
- [Phase 04]: SMTP fields use CSS display toggle to preserve jQuery Mobile widget enhancement
- [Phase 04]: Excluded status overrides OK but not active alerts (offline/battery shown for excluded devices)
- [Phase 04]: Test buttons save settings before running test scripts so latest form values are used
- [Phase 04]: Single form with JS onclick to switch hidden action field for test buttons (DRY over separate forms)
- [Phase 05]: intervalToCron defaults invalid/zero/negative to 60min (hourly) for safe fallback
- [Phase 05]: bin/package.json carries only production fields (no devDependencies, scripts, or main)
- [Phase 05]: postinstall.sh cron expression logic mirrors cron-helper.js with hours=1 special case
- [Phase 05]: PHP interval_to_cron mirrors Node.js intervalToCron with hours===1 special case
- [Phase 05.1]: database.db is newline-delimited JSON; reader splits lines and parses individually
- [Phase 05.1]: readZ2mState retries once on JSON parse error for z2m mid-write race
- [Phase 05.1]: Bridge health dual check: systemctl active + file freshness (10min default)
- [Phase 05.1]: mergeDeviceState looks up z2mState by friendly_name directly instead of constructing MQTT topics
- [Phase 05.1]: z2m path resolution: config priority then auto-detect, descriptive error if neither works
- [Phase 05.1]: Z2M status line computed server-side at page load using file_get_contents + filemtime
- [Phase 05.1]: Auto-detect search paths in PHP mirror z2m-reader.js SEARCH_PATHS for consistency
- [Phase 05.2]: Prune stale devices from state.json during mergeDeviceState to keep state clean
- [Phase 05.3]: Single shared jQuery Mobile popup with JS content swap for Z2M state tooltip
- [Phase 05.4]: Moved z2m state computation before first td so LQI and alert status share same lookup
- [Phase 05.4]: Blinds filter uses strpos on friendly_name prefix MS-108ZR
- [Phase 05.4]: get_status_data handler mirrors PHP table_rows logic for identical JSON structure
- [Phase 05.4]: Polling skips when Settings tab active (tab index 0) to avoid unnecessary requests
- [Phase 05.4]: innerHTML rebuild with applyFilters() re-applied after each update
- [Phase 05.5]: Position column uses num sort type; State and Motor Reversal use str sort type
- [Bugfix]: Z2M state tooltip lookup used friendly_name but state.json is keyed by IEEE address; fixed to use $row['ieee']
- [Bugfix]: preupgrade.sh was missing from git archive build command in README.md; settings still wiped because zip didn't include it
- [Bugfix]: AJAX table rebuild (30s poll) now re-applies active sort via reapplySort() using stored sortCol/sortAsc/sortType
- [Feature]: Z2M state tooltip fetches live data via get_device_state AJAX endpoint instead of reading cached data-z2m-state attribute
- [Feature]: "Data refreshed" timestamp shown above Device Status and Blinds tables, updated on each AJAX poll
- [Phase 06]: GitHub Actions workflow updates release.cfg and pushes to main after each release
- [Phase 06]: release.js also updates release.cfg locally for version consistency during manual bumps

### Pending Todos

None yet.

### Roadmap Evolution

- Phase 05.1 inserted after Phase 5: Replace MQTT dependency with direct zigbee2mqtt file reading (URGENT) — discovered during UAT that MQTT retained messages are unreliable for device state collection; reading z2m's state.json directly is simpler and more robust, also eliminates MQTT broker configuration from plugin settings
- Phase 05.2 inserted after Phase 5: UI improvements — discovered during UAT testing
- Phase 05.3 inserted after Phase 5: Display device state in tooltip on device status page (URGENT)
- Phase 05.4 inserted after Phase 5: Live monitoring of device state (URGENT)
- Phase 05.5 inserted after Phase 5: Blinds tab updates (URGENT)

### Blockers/Concerns

- Phase 1, 3, 4 require live Loxberry host verification before implementation (plugin directory layout, notification API, PHP version).

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Fix settings wiped on in-place install (preupgrade.sh) | 2026-03-17 | 1c7bf89 | [1-the-settings-are-still-being-wiped-when-](./quick/1-the-settings-are-still-being-wiped-when-/) |
| 2 | Fix icon installation error during plugin install | 2026-03-17 | 675d0d8 | [260317-ngg-fix-icon-installation-error-during-plugi](./quick/260317-ngg-fix-icon-installation-error-during-plugi/) |

## Session Continuity

Last session: 2026-03-17T15:57:00Z
Stopped at: Completed quick task 260317-ngg (fix icon installation error)
Resume file: None
