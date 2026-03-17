---
phase: 6
slug: auto-update-mechanism
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | jest.config.js |
| **Quick run command** | `npx jest --testPathPattern=update` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --testPathPattern=update`
- **After every plan wave:** Run `npx jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | UPDT-01 | config | `grep AUTOMATIC_UPDATES plugin.cfg` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | UPDT-02 | config | `test -f release.cfg` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | UPDT-03 | script | `grep -q "preserve" preupgrade.sh` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `release.cfg` — version and archive URL for Loxberry auto-update
- [ ] `plugin.cfg` update — AUTOMATIC_UPDATES flag
- [ ] `preupgrade.sh` — config preservation on upgrade

*Primarily configuration work — minimal test infrastructure needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Auto-update triggers in Loxberry | UPDT-02 | Requires live Loxberry instance | Install plugin, publish new release, verify Loxberry detects and applies update |
| Config preserved across update | UPDT-03 | Requires actual upgrade cycle | Modify config, trigger update, verify config unchanged |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
