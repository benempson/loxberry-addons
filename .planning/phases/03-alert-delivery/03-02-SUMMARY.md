---
phase: 03-alert-delivery
plan: 02
subsystem: notifications
tags: [nodemailer, smtp, loxberry, shell, child_process]

requires:
  - phase: 01-data-collection
    provides: config.js with NOTIFICATIONS section and boolean coercion
provides:
  - sendLoxberryNotification function for shell-based Loxberry notifications
  - sendEmailNotification function for SMTP email via Nodemailer
  - heartbeat_enabled config field
affects: [03-alert-delivery plan 03 dispatcher, 04-web-ui config form]

tech-stack:
  added: [nodemailer@8.0.2]
  patterns: [shell sanitization for dynamic content, Nodemailer TLS auto-detection by port]

key-files:
  created: [bin/lib/loxberry-notify.js, bin/lib/email-notify.js, tests/loxberry-notify.test.js, tests/email-notify.test.js]
  modified: [bin/lib/config.js, package.json, yarn.lock]

key-decisions:
  - "Strict sanitization for shell: replace double quotes with single, strip backticks/dollar/backslash"
  - "10s connection/greeting/socket timeouts for Nodemailer to stay within 30s hard timeout"

patterns-established:
  - "Shell sanitization: replace quotes, strip metacharacters before interpolating into bash commands"
  - "SMTP TLS: secure=true for port 465, secure=false otherwise (Nodemailer auto-upgrades STARTTLS)"

requirements-completed: [NOTF-01, NOTF-02]

duration: 3min
completed: 2026-03-16
---

# Phase 3 Plan 2: Notification Channels Summary

**Loxberry shell notification and SMTP email channels via Nodemailer with shell injection sanitization and TLS auto-detection**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-16T08:47:01Z
- **Completed:** 2026-03-16T08:50:01Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Loxberry notification channel that shells out to notify.sh with proper metacharacter sanitization
- SMTP email channel via Nodemailer with TLS auto-detection (465=direct, 587=STARTTLS, 25=plain)
- Config extended with heartbeat_enabled boolean field for future heartbeat support
- Nodemailer v8.0.2 installed as production dependency

## Task Commits

Each task was committed atomically:

1. **Task 1: Loxberry notification channel with TDD** - `f5bbb66` (feat)
2. **Task 2: SMTP email channel + config extension with TDD** - `583e209` (feat)

_TDD: Tests written first (RED), then implementation (GREEN), committed together per task._

## Files Created/Modified
- `bin/lib/loxberry-notify.js` - Loxberry notification via shell with sanitization
- `bin/lib/email-notify.js` - SMTP email via Nodemailer with TLS and timeout handling
- `tests/loxberry-notify.test.js` - 9 tests covering command construction, sanitization, options
- `tests/email-notify.test.js` - 8 tests covering transport, TLS, auth, timeouts, errors
- `bin/lib/config.js` - Added heartbeat_enabled to defaults and boolean coercion
- `package.json` - Added nodemailer dependency
- `yarn.lock` - Updated lockfile

## Decisions Made
- Strict shell sanitization: replace double quotes with single quotes, strip backticks, dollar signs, and backslashes (prevents injection while keeping messages readable)
- 10-second timeouts on all Nodemailer connections to avoid hitting the 30s hard timeout
- Auth object omitted entirely when smtp_user is empty (supports unauthenticated relays)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both channel modules ready for wiring into the notification dispatcher (Plan 03)
- heartbeat_enabled config field available for heartbeat logic in dispatcher
- Full test suite (128 tests) passes with zero regressions

---
*Phase: 03-alert-delivery*
*Completed: 2026-03-16*
