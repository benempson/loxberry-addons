---
phase: quick-fix
plan: 1
subsystem: plugin-lifecycle
tags: [upgrade, config-persistence, data-persistence]
key-files:
  created:
    - preupgrade.sh
  modified:
    - preinstall.sh
    - postinstall.sh
decisions:
  - "Config+data backup moved from preinstall.sh to preupgrade.sh (runs before purge_installation)"
metrics:
  duration: 1min
  completed: "2026-03-17"
  tasks_completed: 2
  tasks_total: 2
---

# Quick Fix 1: Settings Wiped on Plugin Upgrade - Summary

Config and data backup moved to preupgrade.sh so it runs before Loxberry's purge_installation deletes plugin directories; postinstall.sh now restores both config and data.

## What Changed

### preupgrade.sh (NEW)
Backs up `watchdog.cfg` to `/tmp/zigbee_watchdog_cfg_backup` and the entire data directory (state.json, database.db) to `/tmp/zigbee_watchdog_data_backup/` before purge_installation runs.

### preinstall.sh (SIMPLIFIED)
Reduced to a no-op. Previously attempted config backup here, but preinstall runs after purge_installation has already deleted the config directory -- too late.

### postinstall.sh (UPDATED)
Added step 2b to restore data directory backup after file extraction. Config restore (step 2) was already present and remains unchanged. Fresh install path (elif branch creating default config) is unaffected.

## Root Cause

Loxberry's plugin upgrade sequence: preupgrade -> purge_installation -> preinstall -> extract -> postinstall. The old preinstall.sh tried to back up config after purge had already deleted it.

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 75826dd | Create preupgrade.sh, simplify preinstall.sh to no-op |
| 2 | 0557bb3 | Add data directory restore to postinstall.sh |

## Verification

All 7 checks passed:
1. preupgrade.sh syntax valid
2. preinstall.sh syntax valid
3. postinstall.sh syntax valid
4. Config backup reference in preupgrade.sh
5. Data backup reference in preupgrade.sh
6. Data restore reference in postinstall.sh
7. Zero config backup references in preinstall.sh (moved out)
