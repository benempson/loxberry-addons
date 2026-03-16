# Phase 3: Alert Delivery - Research

**Researched:** 2026-03-16
**Domain:** Notification delivery (Loxberry system notifications + SMTP email), bridge offline detection
**Confidence:** MEDIUM-HIGH

## Summary

Phase 3 wires the existing evaluator transitions (already populating `state.pending_notifications`) into two delivery channels: Loxberry's built-in notification system and SMTP email via Nodemailer. It also adds bridge offline detection as a pre-evaluation gate.

The Loxberry notification system is a bash-based API (`notify` command) that the Node.js plugin must invoke via `child_process.execSync`. There is no native Node.js SDK for Loxberry notifications. For SMTP, Nodemailer v8.x is the standard Node.js library with zero runtime dependencies and built-in TLS auto-detection. The bridge/state topic publishes JSON `{"state":"online"}` or `{"state":"offline"}` -- this is already collected by mqtt-collector but non-JSON payloads are silently skipped (a consideration for legacy zigbee2mqtt versions).

**Primary recommendation:** Use `child_process.execSync` to shell out to LoxBerry's `notify` bash command for system notifications, and Nodemailer for SMTP email. Structure as two independent sender modules (`loxberry-notify.js`, `email-notify.js`) behind a unified `notify.js` dispatcher that reads `pending_notifications` from state and calls both channels independently.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Batch all alerts + recoveries from a single run into one notification message
- Include both "New Alerts" and "Recoveries" sections in the same message
- Send to both Loxberry and email channels independently -- each succeeds or fails on its own
- Stay silent when no transitions occurred (no alerts, no recoveries)
- Optional heartbeat "all clear" message with config toggle -- includes device count summary: "All clear: 52 devices tracked, 0 alerts, 3 excluded"
- HTML email body (table layout, color coding) + plain text for Loxberry notifications
- Email subject: count-based -- "Zigbee Watchdog: 3 alerts, 1 recovery"
- Loxberry notification severity by type: offline = error, battery = warning
- Heartbeat subject: "Zigbee Watchdog: All clear"
- Bridge offline is a separate, higher-severity critical alert -- not batched with device alerts
- Sent as its own notification, error severity
- When bridge is offline, skip device evaluation entirely (no evaluateDevices call) -- avoids false positives from stale data
- Track bridge state in state.json: bridge_online boolean, bridge_offline_since timestamp -- transition-based, no duplicate alerts
- Bridge recovery notification sent when bridge comes back online ("Bridge back online")
- Log error and continue -- don't retry, don't block other channels
- Clear pending_notifications after delivery attempt regardless of per-channel success -- prevents stale alert buildup
- No SMTP validation at startup -- fail at send time, log the error. Config validation belongs in Phase 4 (Web UI)
- SMTP TLS: auto-detect based on port (STARTTLS on 587, direct TLS on 465, plain on 25)

### Claude's Discretion
- HTML email template design and styling
- Nodemailer vs other SMTP library choice
- Loxberry notification API integration details (research flag: verify on live system)
- Heartbeat interval logic (config field name, default frequency)
- Internal module structure for notification sender

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ALRT-06 | Plugin detects bridge offline state via bridge/state topic and alerts separately | bridge/state publishes JSON `{"state":"online/offline"}` -- already collected by mqtt-collector. Bridge check module reads this from messages Map before evaluateDevices runs. |
| NOTF-01 | Plugin sends alerts via Loxberry's built-in notification system | LoxBerry bash API: `notify <package> <name> "<message>" [err]` via child_process.execSync. LBHOMEDIR env var provides base path. |
| NOTF-02 | Plugin sends alerts via SMTP email using configurable SMTP settings | Nodemailer v8.x with createTransport. Config already has smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_to. TLS auto-detected by port. |
| NOTF-03 | Alert messages include device friendly name, status, and relevant detail | Transition objects from evaluator already contain friendly_name, type (offline/battery), detail (hours/percentage), transition (alert/recovery). |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| nodemailer | ^8.0.0 | SMTP email delivery | De facto standard Node.js email library. Zero runtime dependencies. 9900+ dependents on npm. Active maintenance. |

### Supporting (already in project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| child_process (builtin) | Node.js core | Shell out to LoxBerry notify command | For Loxberry notification delivery |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Nodemailer | emailjs | Nodemailer has vastly larger ecosystem, better docs, more SMTP edge case handling |
| child_process for Loxberry | JsonRPC to LoxBerry API | JsonRPC is for web UI integration, not notifications. Bash API is the documented approach for plugins. |

**Installation:**
```bash
npm install nodemailer
```

## Architecture Patterns

### Recommended Module Structure
```
bin/lib/
  notify.js              # Dispatcher: reads pending_notifications, calls both channels
  loxberry-notify.js     # Loxberry channel: shells out to `notify` bash command
  email-notify.js        # Email channel: Nodemailer SMTP transport
  bridge-monitor.js      # Bridge state checker: reads bridge/state, manages transitions
  email-template.js      # HTML email body builder (pure function, no I/O)
```

### Pattern 1: Channel Dispatcher
**What:** A single `deliverNotifications(state, config)` function that orchestrates both channels independently.
**When to use:** Called from main() after evaluateDevices() and writeState().
**Example:**
```javascript
'use strict';
const { sendLoxberryNotification } = require('./loxberry-notify');
const { sendEmailNotification } = require('./email-notify');

/**
 * Deliver pending notifications to all enabled channels.
 * Each channel succeeds or fails independently.
 * Clears pending_notifications regardless of outcome.
 */
async function deliverNotifications(state, config) {
  const pending = state.pending_notifications || [];
  if (pending.length === 0) return { sent: false, reason: 'no-transitions' };

  const results = {};

  if (config.NOTIFICATIONS.loxberry_enabled) {
    try {
      sendLoxberryNotification(pending, config);
      results.loxberry = { success: true };
    } catch (err) {
      console.error('Loxberry notification failed:', err.message);
      results.loxberry = { success: false, error: err.message };
    }
  }

  if (config.NOTIFICATIONS.email_enabled) {
    try {
      await sendEmailNotification(pending, config);
      results.email = { success: true };
    } catch (err) {
      console.error('Email notification failed:', err.message);
      results.email = { success: false, error: err.message };
    }
  }

  // Clear pending regardless of outcome
  state.pending_notifications = [];

  return { sent: true, results };
}

module.exports = { deliverNotifications };
```

### Pattern 2: Loxberry Notification via Shell
**What:** Call LoxBerry's bash `notify` command via child_process.execSync.
**When to use:** When loxberry_enabled is true.
**Example:**
```javascript
'use strict';
const { execSync } = require('child_process');

const PLUGIN_NAME = 'zigbee_watchdog';
const LBHOMEDIR = process.env.LBHOMEDIR || '/opt/loxberry';
const NOTIFY_SCRIPT = `${LBHOMEDIR}/libs/bashlib/notify.sh`;

/**
 * Send a notification via LoxBerry's built-in system.
 * @param {string} message - Plain text notification message
 * @param {string} severity - 'err' for error, omit for info
 */
function loxberryNotify(message, severity) {
  // Source notify.sh then call notify command
  const errFlag = severity === 'err' ? ' err' : '';
  const escapedMsg = message.replace(/"/g, '\\"');
  const cmd = `. ${NOTIFY_SCRIPT} && notify ${PLUGIN_NAME} watchdog "${escapedMsg}"${errFlag}`;
  execSync(cmd, { shell: '/bin/bash', timeout: 5000, stdio: 'pipe' });
}

module.exports = { loxberryNotify };
```

### Pattern 3: Bridge Offline Detection
**What:** Check bridge/state from MQTT messages, manage transition state, gate device evaluation.
**When to use:** In main() BEFORE evaluateDevices().
**Example:**
```javascript
'use strict';

/**
 * Check bridge online state and return whether device evaluation should proceed.
 * Manages bridge_online and bridge_offline_since in state.
 * Returns transition object if state changed, null otherwise.
 */
function checkBridgeState(messages, baseTopic, state, now) {
  now = now || new Date();
  const bridgeTopic = `${baseTopic}/bridge/state`;
  const bridgePayload = messages.get(bridgeTopic);

  // Determine current bridge state
  let bridgeOnline;
  if (!bridgePayload) {
    // No bridge/state message received -- assume offline
    bridgeOnline = false;
  } else if (typeof bridgePayload === 'object' && bridgePayload.state) {
    bridgeOnline = bridgePayload.state === 'online';
  } else {
    bridgeOnline = false;
  }

  const wasOnline = state.bridge_online !== false; // default true on first run
  state.bridge_online = bridgeOnline;

  if (wasOnline && !bridgeOnline) {
    // Transition: online -> offline
    state.bridge_offline_since = now.toISOString();
    return { type: 'bridge', transition: 'offline', timestamp: now.toISOString() };
  } else if (!wasOnline && bridgeOnline) {
    // Transition: offline -> online
    const offlineSince = state.bridge_offline_since;
    state.bridge_offline_since = null;
    return { type: 'bridge', transition: 'online', detail: offlineSince, timestamp: now.toISOString() };
  }

  return null; // No transition
}

module.exports = { checkBridgeState };
```

### Pattern 4: Nodemailer SMTP Transport
**What:** Create SMTP transport with auto-TLS based on port.
**When to use:** When email_enabled is true.
**Example:**
```javascript
'use strict';
const nodemailer = require('nodemailer');

function createSmtpTransport(config) {
  const port = config.NOTIFICATIONS.smtp_port;
  const secure = port === 465; // Direct TLS on 465, STARTTLS on 587, plain on 25

  const transportOpts = {
    host: config.NOTIFICATIONS.smtp_host,
    port: port,
    secure: secure,
  };

  if (config.NOTIFICATIONS.smtp_user) {
    transportOpts.auth = {
      user: config.NOTIFICATIONS.smtp_user,
      pass: config.NOTIFICATIONS.smtp_pass,
    };
  }

  return nodemailer.createTransport(transportOpts);
}

module.exports = { createSmtpTransport };
```

### Anti-Patterns to Avoid
- **Retrying failed sends:** Decision is log-and-continue. Retries add complexity and delay cron completion within the 30s hard timeout.
- **Validating SMTP at startup:** Decision defers config validation to Phase 4 Web UI. Fail at send time.
- **Batching bridge alerts with device alerts:** Bridge offline is separate, higher severity. Send immediately as its own notification.
- **Sending when nothing changed:** Stay completely silent when no transitions occurred.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SMTP email sending | Custom socket/TLS handling | Nodemailer | SMTP has dozens of edge cases (STARTTLS upgrade, auth mechanisms, content encoding, MIME boundaries) |
| HTML email templates | String concatenation | Template literal builder with proper HTML escaping | Avoids XSS-like injection from device names containing HTML chars |
| TLS auto-detection | Manual port-to-TLS mapping beyond what Nodemailer supports | Nodemailer `secure` flag (true for 465, false otherwise) | Nodemailer handles STARTTLS upgrade automatically when secure=false |

**Key insight:** SMTP is deceptively complex. Nodemailer has 14+ years of edge case fixes. Even "simple" email sending involves content-type negotiation, character encoding, line length limits, and TLS handshakes that break in surprising ways on different mail servers.

## Common Pitfalls

### Pitfall 1: Bridge/state Payload Format Assumptions
**What goes wrong:** Assuming bridge/state is always JSON. Older zigbee2mqtt versions publish plain string "online"/"offline". The mqtt-collector silently skips non-JSON payloads, so the message would not appear in the Map at all.
**Why it happens:** The collector does `JSON.parse(payload.toString())` and catches errors silently.
**How to avoid:** Treat missing bridge/state message as "unknown/offline" state. The JSON format `{"state":"online"}` is standard since zigbee2mqtt ~1.17.0 (2021). If the topic is not in the messages Map, assume bridge is not confirmed online.
**Warning signs:** Bridge always appears offline even when zigbee2mqtt is running.

### Pitfall 2: Shell Injection in Loxberry Notify
**What goes wrong:** Device names or alert details containing shell metacharacters (quotes, backticks, $) break or exploit the notify command.
**Why it happens:** Building shell commands with string interpolation.
**How to avoid:** Escape all dynamic content before interpolating into the shell command. Use a strict allowlist approach: strip everything except alphanumeric, spaces, basic punctuation.
**Warning signs:** Notifications fail or contain garbled text for devices with special characters in names.

### Pitfall 3: Hard Timeout vs Email Sending
**What goes wrong:** SMTP connection + TLS handshake + authentication + delivery can take 5-10 seconds on slow networks. Combined with MQTT drain (3s) and other processing, this eats into the 30s hard timeout.
**Why it happens:** The hard timeout in watchdog.js (`process.exit(1)` after 30s) kills the process mid-send.
**How to avoid:** Set a 10s timeout on the Nodemailer transport (`connectionTimeout: 10000`, `greetingTimeout: 10000`, `socketTimeout: 10000`). This ensures email either succeeds quickly or fails fast, leaving headroom for the hard timeout.
**Warning signs:** Partial email sends, state not written because process killed before writeState.

### Pitfall 4: Notification Ordering vs State Write
**What goes wrong:** If notifications are sent before writeState, and the process crashes after sending but before writing, the next run re-sends the same alerts (duplicates). If notifications are sent after writeState, and sending fails, the pending_notifications are already cleared (alerts lost).
**Why it happens:** The "clear pending regardless" decision means notifications and state must be carefully ordered.
**How to avoid:** The current code already calls writeState before notification delivery would run. The dispatcher clears pending_notifications, but since state was already written with them, a crash after send but before second write just means next run has stale pending_notifications. Solution: write state, deliver, clear pending, write state again. Or accept that crash recovery may duplicate -- which is acceptable for alerts (better to alert twice than miss).
**Warning signs:** Duplicate alerts after process crashes.

### Pitfall 5: HTML Email in Plain Text Clients
**What goes wrong:** Some email clients (especially on mobile or in corporate environments) strip HTML and show raw tags.
**Why it happens:** Not providing a plain text alternative in the email.
**How to avoid:** Always set both `html` and `text` fields in Nodemailer's `sendMail` options. Generate a plain text version alongside HTML.
**Warning signs:** Users report unreadable emails with HTML tags visible.

## Code Examples

### HTML Email Template Builder
```javascript
'use strict';

/**
 * Build HTML email body from transitions.
 * @param {Array} transitions - Array of transition objects
 * @param {object} summary - Evaluation summary
 * @returns {{ html: string, text: string }}
 */
function buildEmailBody(transitions, summary) {
  const alerts = transitions.filter(t => t.transition === 'alert');
  const recoveries = transitions.filter(t => t.transition === 'recovery');

  // Escape HTML special chars
  const esc = (s) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  let html = '<div style="font-family:sans-serif;max-width:600px;">';
  let text = '';

  if (alerts.length > 0) {
    html += '<h2 style="color:#c0392b;">New Alerts</h2>';
    html += '<table style="width:100%;border-collapse:collapse;">';
    html += '<tr style="background:#f5f5f5;"><th style="padding:8px;text-align:left;">Device</th><th style="padding:8px;text-align:left;">Status</th><th style="padding:8px;text-align:left;">Detail</th></tr>';
    text += 'NEW ALERTS\n';

    for (const t of alerts) {
      const color = t.type === 'offline' ? '#e74c3c' : '#f39c12';
      const status = t.type === 'offline' ? 'Offline' : 'Low Battery';
      html += `<tr><td style="padding:8px;">${esc(t.friendly_name)}</td>`;
      html += `<td style="padding:8px;color:${color};font-weight:bold;">${status}</td>`;
      html += `<td style="padding:8px;">${esc(t.detail)}</td></tr>`;
      text += `  ${t.friendly_name}: ${status} - ${t.detail}\n`;
    }
    html += '</table>';
    text += '\n';
  }

  if (recoveries.length > 0) {
    html += '<h2 style="color:#27ae60;">Recoveries</h2>';
    html += '<table style="width:100%;border-collapse:collapse;">';
    html += '<tr style="background:#f5f5f5;"><th style="padding:8px;text-align:left;">Device</th><th style="padding:8px;text-align:left;">Detail</th></tr>';
    text += 'RECOVERIES\n';

    for (const t of recoveries) {
      html += `<tr><td style="padding:8px;">${esc(t.friendly_name)}</td>`;
      html += `<td style="padding:8px;color:#27ae60;">${esc(t.detail)}</td></tr>`;
      text += `  ${t.friendly_name}: ${t.detail}\n`;
    }
    html += '</table>';
  }

  html += '</div>';
  return { html, text };
}

module.exports = { buildEmailBody };
```

### Email Subject Line Builder
```javascript
function buildSubject(transitions) {
  const alerts = transitions.filter(t => t.transition === 'alert').length;
  const recoveries = transitions.filter(t => t.transition === 'recovery').length;
  const parts = [];
  if (alerts > 0) parts.push(`${alerts} alert${alerts !== 1 ? 's' : ''}`);
  if (recoveries > 0) parts.push(`${recoveries} recovery`);
  return `Zigbee Watchdog: ${parts.join(', ')}`;
}
```

### Loxberry Notification Message Builder
```javascript
function buildLoxberryMessage(transitions) {
  const lines = [];
  const alerts = transitions.filter(t => t.transition === 'alert');
  const recoveries = transitions.filter(t => t.transition === 'recovery');

  if (alerts.length > 0) {
    lines.push('ALERTS:');
    for (const t of alerts) {
      const status = t.type === 'offline' ? 'OFFLINE' : 'LOW BATTERY';
      lines.push(`  ${t.friendly_name}: ${status} - ${t.detail}`);
    }
  }
  if (recoveries.length > 0) {
    lines.push('RECOVERIES:');
    for (const t of recoveries) {
      lines.push(`  ${t.friendly_name}: ${t.detail}`);
    }
  }
  return lines.join('\n');
}
```

### Heartbeat Config Extension
```javascript
// Add to config.js DEFAULTS.NOTIFICATIONS:
// heartbeat_enabled: '0',

// Add to BOOLEAN_FIELDS.NOTIFICATIONS:
// 'heartbeat_enabled'

// Heartbeat check in dispatcher:
function shouldSendHeartbeat(state, config) {
  if (!config.NOTIFICATIONS.heartbeat_enabled) return false;
  const pending = state.pending_notifications || [];
  return pending.length === 0; // Send heartbeat only when no transitions
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| zigbee2mqtt bridge/state as plain string | JSON `{"state":"online"}` | zigbee2mqtt 1.17.0 (2021) | mqtt-collector already handles JSON; plain string would be silently dropped |
| Nodemailer v6 | Nodemailer v8 | 2024 | Dropped CJS `require` support briefly, then restored. v8 works fine with CommonJS `require('nodemailer')` |
| LoxBerry notify Perl-only | Bash `notify` command available | LoxBerry 1.0.3 | Node.js plugins can shell out to bash notify |

**Deprecated/outdated:**
- zigbee2mqtt legacy API (pre-1.17.0): bridge/state as plain string. Not a concern for current installations but handle gracefully (missing key = offline).

## Open Questions

1. **LoxBerry environment on target system**
   - What we know: LBHOMEDIR defaults to /opt/loxberry, notify.sh lives at `$LBHOMEDIR/libs/bashlib/notify.sh`
   - What's unclear: Exact plugin directory name (`$lbpplugindir`) -- this is set during plugin installation. The research flag says "verify on live system."
   - Recommendation: Use env var `LBPPLUGINDIR` or fallback to hardcoded `zigbee_watchdog`. Make it configurable via env var so it can be overridden for testing and verified on live system.

2. **Nodemailer v8 CommonJS compatibility**
   - What we know: Project uses CommonJS (`'use strict'` + `require()`). Nodemailer v8 changelog shows ESM was briefly default then CJS was restored.
   - What's unclear: Whether latest v8.0.2 has any CJS issues.
   - Recommendation: Pin `nodemailer@^8.0.0` and test `require('nodemailer')` works. If issues arise, fall back to `^6.9.0` which is rock-solid CJS.

3. **Heartbeat frequency**
   - What we know: Heartbeat is opt-in with config toggle. Cron runs on interval_minutes (default 60).
   - What's unclear: Whether heartbeat should send every run or on a separate cadence.
   - Recommendation: Send heartbeat every run when heartbeat_enabled is true and no transitions occurred. Simpler than introducing a separate frequency. Config field: `heartbeat_enabled` in NOTIFICATIONS section.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.x |
| Config file | package.json `scripts.test` |
| Quick run command | `npx jest --testPathPattern="<pattern>" -x` |
| Full suite command | `npx jest` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ALRT-06 | Bridge offline detection from bridge/state topic, transition tracking, gating evaluateDevices | unit | `npx jest tests/bridge-monitor.test.js -x` | No -- Wave 0 |
| NOTF-01 | Loxberry notification via shell command | unit | `npx jest tests/loxberry-notify.test.js -x` | No -- Wave 0 |
| NOTF-02 | SMTP email via Nodemailer (transport creation, sendMail) | unit | `npx jest tests/email-notify.test.js -x` | No -- Wave 0 |
| NOTF-03 | Message formatting (friendly name, status, detail in both HTML and plain text) | unit | `npx jest tests/email-template.test.js -x` | No -- Wave 0 |
| -- | Notification dispatcher (channel routing, error handling, pending_notifications clearing) | unit | `npx jest tests/notify.test.js -x` | No -- Wave 0 |
| -- | Integration: watchdog main with bridge check + notification delivery | unit | `npx jest tests/watchdog.test.js -x` (extend existing) | Yes -- extend |

### Sampling Rate
- **Per task commit:** `npx jest --testPathPattern="<relevant-test>" -x`
- **Per wave merge:** `npx jest`
- **Phase gate:** Full suite green before /gsd:verify-work

### Wave 0 Gaps
- [ ] `tests/bridge-monitor.test.js` -- covers ALRT-06: bridge state transitions, missing payload handling, gating logic
- [ ] `tests/loxberry-notify.test.js` -- covers NOTF-01: mock execSync, verify command construction, shell escape
- [ ] `tests/email-notify.test.js` -- covers NOTF-02: mock Nodemailer transport, verify sendMail call, TLS port mapping
- [ ] `tests/email-template.test.js` -- covers NOTF-03: HTML/text body building, subject line, HTML escaping
- [ ] `tests/notify.test.js` -- covers dispatcher: channel routing, independent failure handling, pending clearing
- [ ] Extend `tests/watchdog.test.js` -- covers integration of bridge check and notification delivery in main()

## Sources

### Primary (HIGH confidence)
- [LoxBerry Wiki - Notifications with Bash](https://wiki.loxberry.de/entwickler/bash_supporting_scripts_for_your_plugin_development/bash_loxberry_sdk_documentation/notifications_with_bash) - Full bash notify API syntax, parameters, severity levels
- [LoxBerry Wiki - notify_ext Perl docs](https://wiki.loxberry.de/entwickler/perl_develop_plugins_with_perl/perl_loxberry_sdk_dokumentation/perlmodul_loxberrylog/usage_of_the_notification_functions) - Notification function internals, severity codes (3=error, 6=info)
- [Zigbee2MQTT MQTT Topics](https://www.zigbee2mqtt.io/guide/usage/mqtt_topics_and_messages.html) - bridge/state JSON format `{"state":"online/offline"}`
- [Nodemailer npm](https://www.npmjs.com/package/nodemailer) - v8.0.2, zero runtime deps, SMTP transport options
- Existing codebase: config.js NOTIFICATIONS section, evaluator.js transition objects, mqtt-collector.js message collection

### Secondary (MEDIUM confidence)
- [LoxBerry Wiki - Node.js for plugins](https://wiki.loxberry.de/entwickler/advanced_developers/nodejs_for_plugins) - Node.js integration approach (JsonRPC for UI, bash for notifications)
- [Nodemailer SMTP transport](https://nodemailer.com/smtp) - TLS auto-detection behavior (secure=true for 465, STARTTLS upgrade otherwise)

### Tertiary (LOW confidence)
- LBHOMEDIR default path `/opt/loxberry` -- confirmed by multiple Loxberry GitHub repos but needs live system verification
- Plugin directory name `zigbee_watchdog` as `$lbpplugindir` -- assumed from PLUGIN_NAME in watchdog.js, verify during Phase 5 packaging

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Nodemailer is the undisputed standard for Node.js email. Loxberry bash API is the documented approach.
- Architecture: HIGH -- Module structure follows established project patterns (CommonJS, single export per module). Integration points are clearly defined in existing code.
- Pitfalls: MEDIUM-HIGH -- Shell injection and timeout concerns are well-understood. Loxberry-specific behavior (exact notify script path, environment variables) needs live verification.
- Bridge detection: HIGH -- zigbee2mqtt docs confirm JSON format. mqtt-collector already collects the topic.

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable domain, unlikely to change)
