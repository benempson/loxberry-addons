---
phase: 06-auto-update-mechanism
verified: 2026-03-17T00:00:00Z
status: human_needed
score: 4/4 must-haves verified
human_verification:
  - test: "Trigger Loxberry auto-update check and confirm it reads release.cfg from the raw GitHub URL"
    expected: "Loxberry admin UI shows update available when release.cfg VERSION is newer than installed plugin VERSION"
    why_human: "Requires a live Loxberry instance; no unit test covers Loxberry's own polling mechanism"
  - test: "Create a GitHub Release and confirm the Actions workflow runs to completion"
    expected: "Plugin zip is attached to the release as an asset; release.cfg is updated and committed to main"
    why_human: "GitHub Actions requires a real push event; cannot simulate workflow execution locally"
  - test: "Perform a simulated auto-update on a live Loxberry and verify watchdog.cfg and data survive"
    expected: "preupgrade.sh backs up config/data, postinstall.sh restores them; watchdog settings are unchanged after update"
    why_human: "Requires Loxberry's install pipeline to run; integration only, no unit test coverage"
---

# Phase 6: Auto-Update Mechanism Verification Report

**Phase Goal:** Plugin can update itself automatically from GitHub releases without requiring manual packaging and installation
**Verified:** 2026-03-17
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Loxberry can fetch release.cfg from the raw GitHub URL and detect available updates | VERIFIED | `plugin.cfg` line 13: `RELEASECFG=https://raw.githubusercontent.com/benempson/loxberry-addons/main/release.cfg`; `release.cfg` has `[AUTOUPDATE]` section with `VERSION=0.6.3` |
| 2 | Creating a GitHub Release triggers automatic zip build and asset upload | VERIFIED | `.github/workflows/release.yml` triggers on `release: types: [released]`, uses `softprops/action-gh-release@v2`, builds correct zip, then commits updated `release.cfg` |
| 3 | Running release.js updates release.cfg alongside the other version files | VERIFIED | `release.js` line 43-44 writes release.cfg; line 49 includes `release.cfg` in `git add`; line 46 logs its update |
| 4 | User config and data are preserved across auto-updates | VERIFIED | `preupgrade.sh` backs up `watchdog.cfg` and `$PDATA` to `/tmp`; `postinstall.sh` restores from backup on install |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `release.cfg` | Loxberry auto-update manifest with VERSION, ARCHIVEURL, INFOURL | VERIFIED | Exists, contains `[AUTOUPDATE]`, `VERSION=0.6.3`, correct ARCHIVEURL and INFOURL |
| `plugin.cfg` | AUTOUPDATE section with `AUTOMATIC_UPDATES=true` and raw GitHub URL | VERIFIED | Lines 11-14: AUTOMATIC_UPDATES=true, correct RELEASECFG and PRERELEASECFG URLs |
| `release.js` | Version bumper that also updates release.cfg | VERIFIED | Lines 43-44 write release.cfg; line 49 stages it; substantive (61 lines, real logic) |
| `.github/workflows/release.yml` | GitHub Actions workflow that builds zip and uploads to release | VERIFIED | Exists (49 lines), uses `softprops/action-gh-release@v2`, builds zip with correct file list, updates and commits release.cfg |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `plugin.cfg` | `release.cfg` | RELEASECFG raw GitHub URL | WIRED | `RELEASECFG=https://raw.githubusercontent.com/benempson/loxberry-addons/main/release.cfg` present at line 13 |
| `release.cfg` | GitHub Releases | ARCHIVEURL download link | WIRED | `ARCHIVEURL=https://github.com/benempson/loxberry-addons/releases/download/0.6.3/zigbee-watchdog-0.6.3.zip` present |
| `.github/workflows/release.yml` | `release.cfg` | Workflow updates release.cfg after uploading zip | WIRED | Step "Update release.cfg" writes the file; step "Commit release.cfg" stages and pushes it |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| UPDT-01 | 06-01-PLAN.md | Plugin checks GitHub for newer versions and indicates update availability | SATISFIED | `plugin.cfg` AUTOUPDATE section fully configured; Loxberry's built-in mechanism handles polling — no custom code needed per design |
| UPDT-02 | 06-01-PLAN.md | Plugin can self-update from GitHub without manual packaging and reinstallation | SATISFIED | `release.cfg` ARCHIVEURL points to GitHub Releases zip; GitHub Actions workflow builds and uploads the zip; Loxberry's install pipeline handles download and extraction |
| UPDT-03 | 06-01-PLAN.md | Update process preserves user configuration and state data | SATISFIED | `preupgrade.sh` backs up `watchdog.cfg` and data dir to `/tmp`; `postinstall.sh` restores them (lines 23-28) |

**Note:** REQUIREMENTS.md tracking table still shows UPDT-01, UPDT-02, UPDT-03 as `Planned` (not `Complete`). This table was not updated as part of this phase. The implementation satisfies all three requirements — the tracking status is a documentation gap only.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.github/workflows/release.yml` | 33-40 | Heredoc with `sed` whitespace strip | Info | Functional but fragile: if indentation ever changes, `sed -i 's/^          //'` silently produces malformed release.cfg. Low risk since the file is unlikely to be reformatted. |

No blockers found. No stub implementations detected. No TODO/FIXME markers in modified files.

### Human Verification Required

#### 1. Loxberry Auto-Update Detection

**Test:** On a live Loxberry instance with the plugin installed, manually trigger the update check or wait for the scheduled check. Alternatively, temporarily bump VERSION in release.cfg on the raw GitHub URL to a value higher than installed.
**Expected:** Loxberry admin UI shows an update notification for the Zigbee Device Monitor plugin.
**Why human:** Requires Loxberry core's polling mechanism to run against a real HTTP endpoint. Cannot simulate this with grep or unit tests.

#### 2. GitHub Actions Release Workflow

**Test:** Create a test GitHub Release (or inspect the workflow run for any prior release). Verify the Actions run succeeds: zip is built with the correct filename, attached to the release, and release.cfg is committed to main with the new version.
**Expected:** Release asset `zigbee-watchdog-{tag}.zip` appears on the release page; commit `chore: update release.cfg for {tag}` appears on main.
**Why human:** GitHub Actions requires a real push/release event. The workflow YAML is syntactically correct and structurally sound, but execution can only be confirmed against the live CI environment.

#### 3. Config Preservation Through Auto-Update

**Test:** On a live Loxberry instance, install the plugin, configure it (set some watchdog settings), then perform an auto-update (or manual reinstall to simulate). Check that watchdog.cfg values are unchanged after the install completes.
**Expected:** `watchdog.cfg` contents are identical before and after update; data directory contents survive.
**Why human:** Requires the full Loxberry install pipeline (preupgrade.sh -> purge -> extract -> postinstall.sh) to run on a real device.

### Gaps Summary

No gaps. All four observable truths are fully verified at all three levels (exists, substantive, wired). The three requirement IDs (UPDT-01, UPDT-02, UPDT-03) are satisfied by the implementation.

The only outstanding items are human-verification tests that require a live Loxberry instance and a real GitHub Actions run — these cannot be confirmed programmatically and are expected for this type of infrastructure/configuration phase.

**Minor documentation gap:** REQUIREMENTS.md tracking table still lists UPDT-01/02/03 as `Planned` instead of `Complete`. This does not affect functionality.

---

_Verified: 2026-03-17_
_Verifier: Claude (gsd-verifier)_
