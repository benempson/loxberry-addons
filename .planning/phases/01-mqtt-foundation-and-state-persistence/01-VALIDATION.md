---
phase: 1
slug: mqtt-foundation-and-state-persistence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `yarn test` |
| **Full suite command** | `yarn test --coverage` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `yarn test`
- **After every plan wave:** Run `yarn test --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | PLUG-05 | unit | `yarn test tests/config.test.js` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | MQTT-01, MQTT-02 | unit | `yarn test tests/mqtt-collector.test.js -t "connects"` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 1 | MQTT-03 | unit | `yarn test tests/mqtt-collector.test.js -t "drain"` | ❌ W0 | ⬜ pending |
| 1-02-03 | 02 | 1 | MQTT-04 | unit | `yarn test tests/watchdog.test.js -t "timeout"` | ❌ W0 | ⬜ pending |
| 1-02-04 | 02 | 1 | MQTT-05 | unit | `yarn test tests/lock.test.js -t "lock"` | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 1 | DEVT-01 | unit | `yarn test tests/device-registry.test.js` | ❌ W0 | ⬜ pending |
| 1-04-01 | 04 | 1 | DEVT-04, DEVT-05 | unit | `yarn test tests/state-store.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `package.json` — project initialization with jest as dev dependency
- [ ] `jest.config.js` — Jest configuration
- [ ] `tests/mqtt-collector.test.js` — covers MQTT-01, MQTT-02, MQTT-03 (mock mqtt client)
- [ ] `tests/state-store.test.js` — covers DEVT-04, DEVT-05
- [ ] `tests/device-registry.test.js` — covers DEVT-01
- [ ] `tests/config.test.js` — covers PLUG-05
- [ ] `tests/lock.test.js` — covers MQTT-05
- [ ] `tests/watchdog.test.js` — covers MQTT-04
- [ ] `tests/fixtures/` — sample bridge/devices JSON, sample INI config, sample state.json

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Connects to real Mosquitto broker | MQTT-01 | Requires running broker | Start Mosquitto, run `node bin/watchdog.js`, verify connection log |
| Pidfile prevents real overlap | MQTT-05 | Requires two concurrent processes | Run two instances simultaneously, verify second exits with lock error |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
