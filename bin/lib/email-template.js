'use strict';

/**
 * Escape HTML special characters to prevent injection.
 * @param {string} s - Raw string
 * @returns {string} Escaped string
 */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build HTML and plain text email body from transition objects.
 * Alerts section uses red (offline) / amber (battery) color coding.
 * Recoveries section uses green. Empty sections are omitted.
 *
 * @param {Array} transitions - Array of transition objects from evaluator
 * @returns {{ html: string, text: string }}
 */
function buildEmailBody(transitions) {
  const alerts = transitions.filter(t => t.transition === 'alert');
  const recoveries = transitions.filter(t => t.transition === 'recovery');

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

/**
 * Build email subject line from transitions.
 * Format: "Zigbee Watchdog: N alert(s), N recovery"
 *
 * @param {Array} transitions - Array of transition objects
 * @returns {string}
 */
function buildSubject(transitions) {
  const alertCount = transitions.filter(t => t.transition === 'alert').length;
  const recoveryCount = transitions.filter(t => t.transition === 'recovery').length;
  const parts = [];
  if (alertCount > 0) parts.push(`${alertCount} alert${alertCount !== 1 ? 's' : ''}`);
  if (recoveryCount > 0) parts.push(`${recoveryCount} recovery`);
  return `Zigbee Watchdog: ${parts.join(', ')}`;
}

/**
 * Build plain text message for Loxberry notification system.
 * Includes ALERTS and RECOVERIES sections.
 *
 * @param {Array} transitions - Array of transition objects
 * @returns {string}
 */
function buildLoxberryMessage(transitions) {
  const alerts = transitions.filter(t => t.transition === 'alert');
  const recoveries = transitions.filter(t => t.transition === 'recovery');
  const lines = [];

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

/**
 * Build heartbeat "all clear" message with device count summary.
 *
 * @param {{ tracked: number, alerts: number, excluded: number }} summary
 * @returns {{ html: string, text: string, subject: string }}
 */
function buildHeartbeatBody(summary) {
  const subject = 'Zigbee Watchdog: All clear';
  const summaryLine = `All clear: ${summary.tracked} devices tracked, ${summary.alerts} alerts, ${summary.excluded} excluded`;

  const text = summaryLine;
  const html = `<div style="font-family:sans-serif;max-width:600px;">` +
    `<h2 style="color:#27ae60;">All Clear</h2>` +
    `<p>${esc(summaryLine)}</p>` +
    `</div>`;

  return { html, text, subject };
}

module.exports = { buildEmailBody, buildSubject, buildLoxberryMessage, buildHeartbeatBody };
