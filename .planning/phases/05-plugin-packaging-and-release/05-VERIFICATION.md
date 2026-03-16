---
phase: 05-plugin-packaging-and-release
verified: 2026-03-16T12:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 5: Plugin Packaging and Release Verification Report

**Phase Goal:** Plugin is packaged as a proper Loxberry addon that installs, upgrades, and uninstalls cleanly
**Verified:** 2026-03-16T12:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                        | Status     | Evidence                                                                                         |
|----|----------------------------------------------------------------------------------------------|------------|--------------------------------------------------------------------------------------------------|
| 1  | Plugin has a valid plugin.cfg with correct metadata                                          | VERIFIED   | plugin.cfg exists; TITLE=Zigbee Device Monitor, VERSION=0.1.0, INTERFACE=2.0 confirmed           |
| 2  | postinstall.sh creates default config on first install and preserves config on upgrade       | VERIFIED   | `[ ! -f "$PCONFIG/watchdog.cfg" ]` guard present; heredoc writes all DEFAULTS fields             |
| 3  | postinstall.sh runs npm install --production and registers cron job                          | VERIFIED   | `npm install --production` at line 63; installcrontab.sh call at line 92                         |
| 4  | uninstall script removes cron.d entry and clears notifications                               | VERIFIED   | `rm -f "$LBHOMEDIR/system/cron/cron.d/$1"` + guarded `delete_notifications` call                |
| 5  | Shell scripts use LF line endings (enforced via .gitattributes)                              | VERIFIED   | .gitattributes contains `*.sh text eol=lf` and `uninstall/uninstall text eol=lf`                 |
| 6  | package.json exists in bin/ directory for npm install after Loxberry copies files            | VERIFIED   | bin/package.json present; production deps only; no devDependencies/scripts/main                  |
| 7  | When user saves settings with a new cron interval, Loxberry cron registration is updated    | VERIFIED   | `update_cron(intval($new_config['CRON']['interval_minutes']))` called after write_config()        |
| 8  | Cron interval is selected from a preset dropdown (not free-text input)                       | VERIFIED   | `<select name="cron_interval">` with 9 preset options (5–1440 min); old `<input type="number">` gone |
| 9  | README.md describes what the plugin does, prerequisites, and setup steps                     | VERIFIED   | README.md exists; contains "Zigbee Device Monitor", Prerequisites, Installation, Configuration   |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact                          | Expected                                             | Status    | Details                                                                                    |
|-----------------------------------|------------------------------------------------------|-----------|--------------------------------------------------------------------------------------------|
| `plugin.cfg`                      | Plugin metadata for Loxberry plugin manager          | VERIFIED  | All required fields present: TITLE, VERSION, NAME, FOLDER, INTERFACE, LB_MINIMUM           |
| `postinstall.sh`                  | Post-install lifecycle hook                          | VERIFIED  | Passes `bash -n`; contains `npm install --production`; 102 lines, fully implemented        |
| `uninstall/uninstall`             | Cleanup script for plugin removal                    | VERIFIED  | Passes `bash -n`; guarded notify.sh sourcing; calls `delete_notifications`                  |
| `.gitattributes`                  | LF enforcement for shell scripts                     | VERIFIED  | `*.sh text eol=lf` and `uninstall/uninstall text eol=lf` present                           |
| `bin/package.json`                | Dependencies manifest for npm install                | VERIFIED  | name=zigbee-watchdog; 5 production deps; no devDependencies, scripts, or main              |
| `bin/lib/cron-helper.js`          | Shared interval-to-cron mapping logic                | VERIFIED  | Exports `intervalToCron`; 37 lines; handles all 9 presets + edge cases                     |
| `tests/cron-helper.test.js`       | Tests for cron expression mapping                    | VERIFIED  | 14 tests; all 9 preset intervals + edge cases (0, negative, string, NaN); all pass          |
| `webfrontend/htmlauth/index.php`  | Cron re-registration on settings save + dropdown     | VERIFIED  | `interval_to_cron()`, `update_cron()` present; select dropdown with 9 options              |
| `README.md`                       | Plugin documentation                                 | VERIFIED  | Contains "Zigbee Device Monitor"; Prerequisites, Features, Installation, Configuration sections |

---

### Key Link Verification

| From                              | To                       | Via                                              | Status    | Details                                                                                               |
|-----------------------------------|--------------------------|--------------------------------------------------|-----------|-------------------------------------------------------------------------------------------------------|
| `postinstall.sh`                  | `bin/lib/config.js`      | Default config values match DEFAULTS object      | VERIFIED  | `interval_minutes = 60`, `battery_pct = 25`, `offline_hours = 24`, all sections present in heredoc   |
| `postinstall.sh`                  | `bin/package.json`       | `cd $PBIN && npm install --production`           | VERIFIED  | Line 63: `cd "$PBIN" && npm install --production 2>&1`                                                |
| `webfrontend/htmlauth/index.php`  | `installcrontab.sh`      | `exec()` call after `write_config()` succeeds   | VERIFIED  | Line 193: `exec(LBHOMEDIR . '/sbin/installcrontab.sh' ...)` inside `update_cron()`; called at line 324 |
| `webfrontend/htmlauth/index.php`  | `bin/lib/cron-helper.js` | PHP `interval_to_cron` mirrors Node.js logic     | VERIFIED  | PHP function at lines 171-181 implements identical branch logic; `hours===1` special case present     |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                      | Status    | Evidence                                                                                          |
|-------------|-------------|------------------------------------------------------------------|-----------|---------------------------------------------------------------------------------------------------|
| PLUG-01     | 05-01       | Plugin follows Loxberry addon directory structure conventions    | SATISFIED | plugin.cfg at root, postinstall.sh at root, uninstall/ directory, bin/, webfrontend/ present      |
| PLUG-02     | 05-01       | Plugin includes idempotent postinstall.sh that preserves config  | SATISFIED | `[ ! -f "$PCONFIG/watchdog.cfg" ]` guard; only writes default on first install                   |
| PLUG-03     | 05-01       | Plugin includes uninstall script for clean removal               | SATISFIED | `uninstall/uninstall` passes syntax check; removes cron.d entry; clears notifications             |
| PLUG-04     | 05-02       | Plugin registers cron job via Loxberry's cron system             | SATISFIED | postinstall.sh calls installcrontab.sh; PHP save handler re-registers on interval change          |

**PLUG-05 note:** PLUG-05 ("Config stored as INI file readable by both Node.js and PHP") is assigned to Phase 1 in REQUIREMENTS.md traceability table. It is not in scope for Phase 5 plans and is not orphaned — it was satisfied in Phase 1.

**No orphaned requirements** — all four Phase 5 requirement IDs (PLUG-01 through PLUG-04) are claimed by a plan and verified.

---

### Anti-Patterns Found

No anti-patterns found in phase 5 artifacts. Checked: postinstall.sh, uninstall/uninstall, bin/lib/cron-helper.js, bin/package.json, plugin.cfg, README.md for TODO/FIXME/placeholder patterns. All return clean.

---

### Human Verification Required

#### 1. Loxberry cron registration on fresh install

**Test:** Install the plugin ZIP on a real Loxberry host. Check `/etc/cron.d/` or Loxberry's cron.d directory for the `zigbee_watchdog` entry after install completes.
**Expected:** A file named `zigbee_watchdog` exists in Loxberry's cron.d directory containing a line like `0 * * * * loxberry /usr/bin/node .../watchdog.js > /dev/null 2>&1`
**Why human:** The `installcrontab.sh` call requires the actual Loxberry environment; cannot be invoked in dev.

#### 2. Config preservation on upgrade

**Test:** Install the plugin, change a config value (e.g. set SMTP host), then re-install the same or newer version.
**Expected:** The modified config values survive the upgrade (postinstall.sh skips default config creation because watchdog.cfg already exists).
**Why human:** Requires the Loxberry upgrade flow which copies files and re-runs postinstall.sh.

#### 3. Cron interval dropdown renders and saves correctly

**Test:** Open the plugin config page in a browser. Confirm the cron interval field is a dropdown (not a text box) with 9 options from "5 minutes" to "24 hours". Select a different interval, save, and verify the cron entry is updated.
**Expected:** Dropdown renders; saving triggers cron re-registration; Loxberry cron.d entry reflects the new expression.
**Why human:** Requires a running Loxberry + browser environment.

#### 4. Uninstall removes cron entry and notifications

**Test:** Uninstall the plugin via Loxberry admin. Verify the cron.d file is gone and no stale notifications remain in the Loxberry notification center.
**Expected:** Clean removal with no orphaned files or notifications.
**Why human:** Requires the Loxberry uninstall workflow which calls the uninstall script with the plugin name as `$1`.

---

### Gaps Summary

No gaps found. All automated checks pass:

- `bash -n postinstall.sh` — syntax valid
- `bash -n uninstall/uninstall` — syntax valid
- `npx jest --testPathPattern=cron-helper` — 14/14 tests pass
- `node -e "require('./bin/lib/cron-helper.js')"` — module loads correctly
- `plugin.cfg` contains TITLE=Zigbee Device Monitor and INTERFACE=2.0
- `bin/package.json` has no devDependencies, scripts, or main field
- PHP `interval_to_cron()` mirrors Node.js `intervalToCron()` including the `hours===1` special case
- PHP `update_cron()` is called in the save handler after `write_config()` succeeds
- Cron interval rendered as `<select>` with 9 preset options
- All 4 phase-5 requirement IDs (PLUG-01 to PLUG-04) verified and accounted for

The 4 human verification items above require a running Loxberry host and cannot be confirmed programmatically. All automated checks are clear.

---

_Verified: 2026-03-16T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
