'use strict';

const { sendLoxberryNotification } = require('./loxberry-notify');
const { sendEmailNotification } = require('./email-notify');
const { buildEmailBody, buildSubject, buildLoxberryMessage, buildHeartbeatBody } = require('./email-template');
const logger = require('./logger');

/**
 * Deliver pending notifications to enabled channels.
 * Routes bridge transitions separately (critical severity).
 * Device transitions are batched into one notification.
 * Clears state.pending_notifications after all delivery attempts.
 *
 * @param {object} state - Application state with pending_notifications array
 * @param {object} config - Application config with NOTIFICATIONS section
 * @returns {Promise<object>} Delivery result
 */
async function deliverNotifications(state, config) {
  const pending = state.pending_notifications || [];
  const n = config.NOTIFICATIONS;

  // No transitions and no heartbeat -- stay silent
  if (pending.length === 0 && !n.heartbeat_enabled) {
    logger.log('Debug', 'notify', 'No transitions to deliver');
    return { sent: false, reason: 'no-transitions' };
  }

  const results = { loxberry: { success: false }, email: { success: false } };

  // Heartbeat path: no transitions but heartbeat enabled
  if (pending.length === 0 && n.heartbeat_enabled) {
    const summary = state.evaluation_summary || { total_devices: 0, alerts: { total: 0 }, excluded: 0 };
    const heartbeat = buildHeartbeatBody({
      tracked: summary.total_devices || 0,
      alerts: (summary.alerts && summary.alerts.total) || 0,
      excluded: summary.excluded || 0,
    });

    // Send heartbeat to Loxberry
    if (n.loxberry_enabled) {
      try {
        sendLoxberryNotification(heartbeat.text);
        results.loxberry.success = true;
        logger.log('Info', 'notify', 'Heartbeat notification sent');
      } catch (err) {
        console.error('Loxberry heartbeat failed:', err.message);
        logger.log('Error', 'notify', 'Loxberry heartbeat failed: ' + err.message);
      }
    }

    // Send heartbeat to email
    if (n.email_enabled) {
      try {
        await sendEmailNotification(heartbeat.html, heartbeat.text, heartbeat.subject, config);
        results.email.success = true;
        logger.log('Info', 'notify', 'Heartbeat notification sent');
      } catch (err) {
        console.error('Email heartbeat failed:', err.message);
        logger.log('Error', 'notify', 'Email heartbeat failed: ' + err.message);
      }
    }

    return { sent: true, heartbeat: true, results };
  }

  // Transition delivery path
  const bridgeTransitions = pending.filter(t => t.type === 'bridge');
  const deviceTransitions = pending.filter(t => t.type !== 'bridge');

  // Deliver bridge transitions separately (critical severity)
  if (bridgeTransitions.length > 0) {
    if (n.loxberry_enabled) {
      try {
        const bridgeMsg = buildLoxberryMessage(bridgeTransitions);
        sendLoxberryNotification(bridgeMsg, 'err');
        results.loxberry.success = true;
      } catch (err) {
        console.error('Loxberry bridge notification failed:', err.message);
        logger.log('Error', 'notify', 'Loxberry bridge notification failed: ' + err.message);
      }
    }

    if (n.email_enabled) {
      try {
        const { html, text } = buildEmailBody(bridgeTransitions);
        const subject = buildSubject(bridgeTransitions);
        await sendEmailNotification(html, text, subject, config);
        results.email.success = true;
      } catch (err) {
        console.error('Email bridge notification failed:', err.message);
        logger.log('Error', 'notify', 'Email bridge notification failed: ' + err.message);
      }
    }
  }

  // Deliver device transitions as batched notification
  if (deviceTransitions.length > 0) {
    if (n.loxberry_enabled) {
      try {
        const msg = buildLoxberryMessage(deviceTransitions);
        const hasOffline = deviceTransitions.some(t => t.type === 'offline' && t.transition === 'alert');
        sendLoxberryNotification(msg, hasOffline ? 'err' : undefined);
        results.loxberry.success = true;
        logger.log('Info', 'notify', 'Loxberry notification sent (' + pending.length + ' transitions)');
      } catch (err) {
        console.error('Loxberry notification failed:', err.message);
        logger.log('Error', 'notify', 'Loxberry notification failed: ' + err.message);
      }
    }

    if (n.email_enabled) {
      try {
        const { html, text } = buildEmailBody(deviceTransitions);
        const subject = buildSubject(deviceTransitions);
        await sendEmailNotification(html, text, subject, config);
        results.email.success = true;
        logger.log('Info', 'notify', 'Email notification sent (' + pending.length + ' transitions)');
      } catch (err) {
        console.error('Email notification failed:', err.message);
        logger.log('Error', 'notify', 'Email notification failed: ' + err.message);
      }
    }
  }

  // Always clear pending after delivery attempt
  state.pending_notifications = [];

  return { sent: true, results };
}

module.exports = { deliverNotifications };
