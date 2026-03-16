---
phase: 4
slug: web-config-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x (Node.js) + Manual browser testing (PHP) |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npx jest --testPathPattern=<test_file> -x` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --testPathPattern=<test_file> -x` for Node.js changes; manual browser check for PHP changes
- **After every plan wave:** Run `npx jest` + full manual walkthrough of all three tabs
- **Before `/gsd:verify-work`:** Full suite must be green + complete INI round-trip test
- **Max feedback latency:** 5 seconds (Jest), manual for PHP

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-W0-01 | W0 | 0 | CONF-01..06 | integration | `npx jest --testPathPattern=ini-roundtrip -x` | ❌ W0 | ⬜ pending |
| 04-01-01 | 01 | 1 | CONF-01, CONF-02, CONF-05 | manual + integration | Manual browser test + INI round-trip | N/A (PHP) | ⬜ pending |
| 04-01-02 | 01 | 1 | CONF-03 | manual + integration | Manual browser test + INI round-trip | N/A (PHP) | ⬜ pending |
| 04-02-01 | 02 | 1 | CONF-04 | manual + unit | Manual browser test + `npx jest --testPathPattern=config -x` | tests/config.test.js (partial) | ⬜ pending |
| 04-03-01 | 03 | 2 | CONF-06 | manual | Manual browser test | N/A (PHP) | ⬜ pending |
| 04-04-01 | 04 | 2 | CONF-01, CONF-03 | manual + integration | Manual browser test (MQTT test, email test) | N/A (PHP) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/ini-roundtrip.test.js` — Verify INI files in the exact format PHP will produce are correctly parsed by `config.js` (covers all CONF-* requirements)
- [ ] Manual test checklist for browser-based validation of all three tabs

*PHP-heavy phase: most validation is manual browser testing. Wave 0 ensures INI format compatibility between PHP writer and Node.js reader.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MQTT settings form renders and saves | CONF-01 | PHP/HTML rendering, Loxberry integration | Load Settings tab, fill MQTT fields, save, verify INI updated |
| Threshold/cron settings form renders and saves | CONF-02, CONF-05 | PHP/HTML rendering | Load Settings tab, change thresholds/cron, save, verify INI |
| Notification preferences with SMTP toggle | CONF-03 | PHP/HTML + JS toggle | Enable email, verify SMTP fields appear, save, verify INI |
| Exclusion checkbox list from state.json | CONF-04 | PHP reads state.json, renders checkboxes | Load Exclusions tab, check devices, save, verify INI exclusions field |
| Device status table with sorting | CONF-06 | PHP reads state.json, jQuery sort | Load Status tab, verify columns, click headers to sort |
| Test MQTT Connection button | CONF-01 | Requires live MQTT broker | Click test button, verify success/failure message |
| Send Test Email button | CONF-03 | Requires SMTP server | Fill SMTP settings, click test, verify email received |
| Refresh Data button | CONF-06 | Requires Node.js exec + state.json | Click refresh, verify status table updates |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
