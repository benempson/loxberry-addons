---
phase: 06-auto-update-mechanism
plan: 01
subsystem: infra
tags: [loxberry, auto-update, github-actions, github-releases, ci-cd]

# Dependency graph
requires:
  - phase: 05-release-packaging
    provides: release.js version bumper and git archive zip build
provides:
  - Loxberry auto-update manifest (release.cfg)
  - GitHub Actions release workflow for automated zip build and upload
  - Enhanced release.js that keeps release.cfg in sync with version bumps
  - Export-ignore rules to keep dev files out of plugin zip
affects: []

# Tech tracking
tech-stack:
  added: [github-actions, softprops/action-gh-release@v2]
  patterns: [loxberry-autoupdate-via-release-cfg]

key-files:
  created: [release.cfg, .github/workflows/release.yml]
  modified: [plugin.cfg, release.js, .gitattributes]

key-decisions:
  - "GitHub Actions workflow updates release.cfg and pushes to main after each release"
  - "release.js also updates release.cfg locally for version consistency during manual bumps"

patterns-established:
  - "Release flow: node release.js patch -> git push -> gh release create -> Actions builds zip and updates release.cfg"

requirements-completed: [UPDT-01, UPDT-02, UPDT-03]

# Metrics
duration: 1min
completed: 2026-03-17
---

# Phase 6 Plan 1: Auto-Update Mechanism Summary

**Loxberry auto-update via release.cfg manifest, GitHub Actions release workflow, and enhanced release.js version syncing**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-17T15:40:33Z
- **Completed:** 2026-03-17T15:41:45Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Configured Loxberry built-in auto-update system with release.cfg manifest and plugin.cfg AUTOUPDATE section
- Created GitHub Actions workflow that builds plugin zip, uploads to release, and updates release.cfg on each release publish
- Enhanced release.js to keep release.cfg in sync during local version bumps
- Added .gitattributes export-ignore rules to exclude dev/CI files from plugin zip

## Task Commits

Each task was committed atomically:

1. **Task 1: Create release.cfg, update plugin.cfg, and enhance release.js** - `3028791` (feat)
2. **Task 2: Create GitHub Actions release workflow and update .gitattributes** - `18ae05d` (feat)

## Files Created/Modified
- `release.cfg` - Loxberry auto-update manifest with VERSION, ARCHIVEURL, INFOURL
- `plugin.cfg` - AUTOUPDATE section enabled with raw GitHub URLs for release.cfg
- `release.js` - Extended to write release.cfg and include it in git add
- `.github/workflows/release.yml` - GitHub Actions workflow: build zip, upload asset, update release.cfg
- `.gitattributes` - Export-ignore rules to exclude dev files from git archive zip

## Decisions Made
- GitHub Actions workflow updates release.cfg and pushes to main after each release, providing dual update paths (local via release.js, CI via Actions)
- release.js also updates release.cfg locally so version stays consistent even without CI

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing test failures in watchdog.test.js and device-registry.test.js (unrelated to this phase's changes -- likely from prior Phase 05.5 changes adding description field). Not addressed per scope boundary rules.

## User Setup Required

None - no external service configuration required. One manual plugin install needed to bootstrap auto-update (existing installations have AUTOUPDATE=false).

## Next Phase Readiness
- Auto-update system fully configured and ready for first release
- Developer workflow: `node release.js patch` -> `git push` -> `gh release create` (Actions handles the rest)

---
*Phase: 06-auto-update-mechanism*
*Completed: 2026-03-17*
