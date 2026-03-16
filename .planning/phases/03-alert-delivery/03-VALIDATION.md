---
phase: 3
slug: alert-delivery
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x |
| **Config file** | package.json `scripts.test` |
| **Quick run command** | `npx jest --testPathPattern="<pattern>" -x` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --testPathPattern="<relevant-test>" -x`
- **After every plan wave:** Run `npx jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | ALRT-06 | unit | `npx jest tests/bridge-monitor.test.js -x` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | NOTF-01 | unit | `npx jest tests/loxberry-notify.test.js -x` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | NOTF-02 | unit | `npx jest tests/email-notify.test.js -x` | ❌ W0 | ⬜ pending |
| 03-01-04 | 01 | 1 | NOTF-03 | unit | `npx jest tests/email-template.test.js -x` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | -- | unit | `npx jest tests/notify.test.js -x` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | -- | unit | `npx jest tests/watchdog.test.js -x` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/bridge-monitor.test.js` — stubs for ALRT-06: bridge state transitions, missing payload, gating logic
- [ ] `tests/loxberry-notify.test.js` — stubs for NOTF-01: mock execSync, command construction, shell escape
- [ ] `tests/email-notify.test.js` — stubs for NOTF-02: mock Nodemailer transport, sendMail, TLS port mapping
- [ ] `tests/email-template.test.js` — stubs for NOTF-03: HTML/text body, subject line, HTML escaping
- [ ] `tests/notify.test.js` — stubs for dispatcher: channel routing, error handling, pending clearing

*Existing infrastructure covers test framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Loxberry notification delivery | NOTF-01 | Requires live Loxberry environment with notify.sh | SSH to Loxberry host, run watchdog manually, check notification panel |
| SMTP email delivery | NOTF-02 | Requires live SMTP server | Configure SMTP in watchdog.cfg, trigger alert, check inbox |
| Bridge offline detection | ALRT-06 | Requires live MQTT broker with zigbee2mqtt | Stop zigbee2mqtt, run watchdog, verify bridge offline alert |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
