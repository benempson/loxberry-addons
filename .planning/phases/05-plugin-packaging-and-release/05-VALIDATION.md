---
phase: 5
slug: plugin-packaging-and-release
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x (Node.js) + Manual testing (shell scripts on Loxberry host) |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npx jest --testPathPattern=<test_file> -x` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest -x` for any testable changes
- **After every plan wave:** Run `npx jest`
- **Before `/gsd:verify-work`:** Full suite must be green + manual install/uninstall test on Loxberry host
- **Max feedback latency:** 5 seconds (Jest)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-W0-01 | W0 | 0 | PLUG-04 | unit | `npx jest --testPathPattern=cron-helper -x` | ❌ W0 | ⬜ pending |
| 05-01-01 | 01 | 1 | PLUG-01 | structural | `bash -n postinstall.sh && bash -n uninstall/uninstall` | ❌ | ⬜ pending |
| 05-01-02 | 01 | 1 | PLUG-02, PLUG-03 | structural | `bash -n postinstall.sh && bash -n uninstall/uninstall` | ❌ | ⬜ pending |
| 05-02-01 | 02 | 2 | PLUG-04 | unit + structural | `npx jest --testPathPattern=cron-helper -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/cron-helper.test.js` — Verify interval-to-cron expression mapping for all preset intervals (5m, 15m, 30m, 60m, 2h, 4h, 6h, 12h, 24h)

*Shell-script-heavy phase: most validation requires a live Loxberry host. Wave 0 covers the testable cron logic.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Plugin ZIP follows Loxberry directory structure | PLUG-01 | Structure verification requires comparison with Loxberry conventions | Inspect ZIP contents, compare with SamplePlugin-V2-PHP structure |
| postinstall.sh creates default config on first install | PLUG-02 | Requires Loxberry host environment (LBHOMEDIR, loxberry user) | Install plugin on Loxberry, verify watchdog.cfg created with defaults |
| postinstall.sh preserves config on upgrade | PLUG-02 | Requires existing install to upgrade | Modify config, reinstall plugin, verify config unchanged |
| postinstall.sh runs npm install | PLUG-02 | Requires network access and Node.js on host | Install plugin, verify node_modules created in bin directory |
| uninstall removes all artifacts | PLUG-03 | Requires Loxberry uninstall framework | Uninstall plugin, verify config/data/cron/notifications removed |
| Cron job registered at correct interval | PLUG-04 | Requires Loxberry cron system | Install, check /etc/cron.d/ for plugin cron entry |
| Web UI interval change updates cron | PLUG-04 | Requires running Loxberry with web access | Change interval in UI, verify cron.d file updated |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
