---
phase: 2
slug: threshold-evaluation-and-alert-logic
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | jest.config.js (existing) |
| **Quick run command** | `npx jest tests/evaluator.test.js` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest tests/evaluator.test.js`
- **After every plan wave:** Run `npx jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | ALRT-01 | unit | `npx jest tests/evaluator.test.js -t "offline threshold" -x` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | ALRT-02 | unit | `npx jest tests/evaluator.test.js -t "battery threshold" -x` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | ALRT-03 | unit | `npx jest tests/evaluator.test.js -t "duplicate" -x` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 1 | ALRT-04 | unit | `npx jest tests/evaluator.test.js -t "recovery" -x` | ❌ W0 | ⬜ pending |
| 02-01-05 | 01 | 1 | ALRT-05 | unit | `npx jest tests/evaluator.test.js -t "excluded" -x` | ❌ W0 | ⬜ pending |
| 02-01-06 | 01 | 1 | DEVT-02 | unit | `npx jest tests/evaluator.test.js -t "offline" -x` | ❌ W0 | ⬜ pending |
| 02-01-07 | 01 | 1 | DEVT-03 | unit | `npx jest tests/evaluator.test.js -t "battery" -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/evaluator.test.js` — stubs for ALRT-01 through ALRT-05, DEVT-02, DEVT-03
- [ ] Test fixtures for device states: online, offline, never-seen, low-battery, recovering, excluded

*Existing infrastructure covers framework and config — only test file and fixtures needed.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
