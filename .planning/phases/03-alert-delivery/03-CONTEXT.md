# Phase 3: Alert Delivery - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver alert notifications through Loxberry's built-in notification system and SMTP email when devices go offline or have low battery. Detect bridge offline state via bridge/state topic and raise a separate critical alert. Does NOT add new notification channels (Pushover, Telegram) or web UI — those are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Alert Batching
- Batch all alerts + recoveries from a single run into one notification message
- Include both "New Alerts" and "Recoveries" sections in the same message
- Send to both Loxberry and email channels independently (if both enabled) — each succeeds or fails on its own
- Stay silent when no transitions occurred (no alerts, no recoveries)
- Optional heartbeat "all clear" message with config toggle — includes device count summary: "All clear: 52 devices tracked, 0 alerts, 3 excluded"

### Message Formatting
- HTML email body (table layout, color coding) + plain text for Loxberry notifications
- Email subject: count-based — "Zigbee Watchdog: 3 alerts, 1 recovery"
- Loxberry notification severity by type: offline = error, battery = warning
- Heartbeat subject: "Zigbee Watchdog: All clear"

### Bridge Offline Detection
- Bridge offline is a separate, higher-severity critical alert — not batched with device alerts
- Sent as its own notification, error severity
- When bridge is offline, skip device evaluation entirely (no evaluateDevices call) — avoids false positives from stale data
- Track bridge state in state.json: bridge_online boolean, bridge_offline_since timestamp — transition-based, no duplicate alerts
- Bridge recovery notification sent when bridge comes back online ("Bridge back online")

### Delivery Failures
- Log error and continue — don't retry, don't block other channels
- Clear pending_notifications after delivery attempt regardless of per-channel success — prevents stale alert buildup
- No SMTP validation at startup — fail at send time, log the error. Config validation belongs in Phase 4 (Web UI)
- SMTP TLS: auto-detect based on port (STARTTLS on 587, direct TLS on 465, plain on 25)

### Claude's Discretion
- HTML email template design and styling
- Nodemailer vs other SMTP library choice
- Loxberry notification API integration details (research flag: verify on live system)
- Heartbeat interval logic (config field name, default frequency)
- Internal module structure for notification sender

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bin/lib/evaluator.js`: Already populates `state.pending_notifications` with transition objects containing `type`, `transition`, `ieee`, `friendly_name`, `detail`, `timestamp`
- `bin/lib/config.js`: Already parses `NOTIFICATIONS` section with `loxberry_enabled`, `email_enabled`, SMTP settings (`smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_from`, `smtp_to`), boolean coercion for enabled flags
- `bin/lib/mqtt-collector.js`: Already collects `bridge/state` topic — message available in the messages Map
- `bin/lib/state-store.js`: readState/writeState with atomic writes — bridge state and notification history persist through this

### Established Patterns
- CommonJS modules with 'use strict', single exported function per module
- State shape extends with: `bridge_online`, `bridge_offline_since`, `pending_notifications[]`
- Config NOTIFICATIONS section already fully defined with defaults
- Jest tests with fixtures in tests/ directory

### Integration Points
- Notification sender slots into main() after evaluateDevices() and writeState() — reads pending_notifications from state
- Bridge offline check slots into main() BEFORE evaluateDevices() — gates whether evaluation runs
- Bridge state read from messages.get(`${baseTopic}/bridge/state`) — already collected by MQTT drain
- Heartbeat needs a new config field (e.g., `NOTIFICATIONS.heartbeat_enabled`)

</code_context>

<specifics>
## Specific Ideas

- Bridge offline should feel urgent — "your entire Zigbee network is down" is different from "one sensor has low battery"
- Heartbeat confirms the watchdog is actually running — important for a cron-based tool where silence could mean "everything is fine" or "the cron job broke"
- HTML email should be functional, not fancy — clear table with device name, status, detail. Color coding for quick scanning (red for offline, amber for battery, green for recovery)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-alert-delivery*
*Context gathered: 2026-03-16*
