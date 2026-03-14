'use strict';

const BATTERY_HYSTERESIS = 5;

const DEFAULT_THRESHOLDS = { offline_hours: 24, battery_pct: 25 };

/**
 * Check if a device is on the exclusion list (case-insensitive exact match).
 * @param {string} ieee - Device IEEE address
 * @param {string} friendlyName - Device friendly name
 * @param {string[]} exclusions - Exclusion list entries
 * @returns {boolean}
 */
function isExcluded(ieee, friendlyName, exclusions) {
  const lowerIeee = ieee.toLowerCase();
  const lowerName = (friendlyName || '').toLowerCase();
  return exclusions.some(ex => {
    const lowerEx = ex.toLowerCase();
    return lowerEx === lowerIeee || lowerEx === lowerName;
  });
}

/**
 * Normalize alerts object to include all expected fields.
 * Handles legacy Phase 1 state that lacks recovered_at fields.
 * @param {object} alerts - Per-device alerts object
 * @returns {object} Normalized alerts object
 */
function normalizeAlerts(alerts) {
  return {
    offline: alerts.offline || false,
    offline_sent_at: alerts.offline_sent_at || null,
    offline_recovered_at: alerts.offline_recovered_at || null,
    battery: alerts.battery || false,
    battery_sent_at: alerts.battery_sent_at || null,
    battery_recovered_at: alerts.battery_recovered_at || null,
  };
}

/**
 * Evaluate all devices against thresholds and produce transitions.
 * Mutates state.devices[ieee].alerts in place.
 *
 * @param {object} state - Full state object with state.devices
 * @param {object} config - Parsed config with THRESHOLDS and EXCLUSIONS
 * @param {Date} [now=new Date()] - Current time (injectable for testing)
 * @returns {{ transitions: Array, summary: object, excludedCount: number }}
 */
function evaluateDevices(state, config, now) {
  now = now || new Date();
  const thresholds = (config && config.THRESHOLDS) || DEFAULT_THRESHOLDS;
  const exclusions = (config && config.EXCLUSIONS && config.EXCLUSIONS.devices) || [];
  const offlineMs = (thresholds.offline_hours || DEFAULT_THRESHOLDS.offline_hours) * 3600000;
  const batteryPct = thresholds.battery_pct != null ? thresholds.battery_pct : DEFAULT_THRESHOLDS.battery_pct;

  const transitions = [];
  let excludedCount = 0;
  const nowMs = now.getTime();
  const nowIso = now.toISOString();

  if (!state.devices) state.devices = {};

  for (const [ieee, device] of Object.entries(state.devices)) {
    // Exclusion check -- skip entirely before any evaluation
    if (isExcluded(ieee, device.friendly_name, exclusions)) {
      excludedCount++;
      continue;
    }

    // Normalize alerts (handle legacy state)
    const alerts = normalizeAlerts(device.alerts || {});
    device.alerts = alerts;

    // --- Offline evaluation ---
    const lastSeen = device.last_seen;
    let isOffline;
    let offlineDetail;

    if (lastSeen === null || lastSeen === undefined) {
      isOffline = true;
      offlineDetail = 'never seen';
    } else {
      const lastSeenMs = new Date(lastSeen).getTime();
      const elapsedMs = nowMs - lastSeenMs;
      const elapsedHours = elapsedMs / 3600000;
      isOffline = elapsedMs > offlineMs; // strict greater-than: exactly at threshold = ok
      offlineDetail = `not seen for ${elapsedHours.toFixed(1)} hours`;
    }

    if (!alerts.offline && isOffline) {
      // ok -> alert
      alerts.offline = true;
      alerts.offline_sent_at = nowIso;
      transitions.push({
        type: 'offline',
        transition: 'alert',
        ieee,
        friendly_name: device.friendly_name,
        detail: offlineDetail,
        timestamp: nowIso,
      });
    } else if (alerts.offline && !isOffline) {
      // alert -> ok (recovery)
      // Calculate how long device was offline for recovery detail
      let recoveryDetail = 'seen again';
      if (alerts.offline_sent_at) {
        const offlineSinceMs = new Date(alerts.offline_sent_at).getTime();
        const offlineDurationHours = (nowMs - offlineSinceMs) / 3600000;
        recoveryDetail = `seen again after ${offlineDurationHours.toFixed(1)} hours offline`;
      }
      alerts.offline = false;
      alerts.offline_recovered_at = nowIso;
      transitions.push({
        type: 'offline',
        transition: 'recovery',
        ieee,
        friendly_name: device.friendly_name,
        detail: recoveryDetail,
        timestamp: nowIso,
      });
    }
    // else: ok->ok or alert->alert, no transition

    // --- Battery evaluation (battery-powered only) ---
    if (device.power_source === 'Battery') {
      const battery = device.battery;
      const isBatteryLow = battery !== null && battery !== undefined && battery <= batteryPct;
      const isBatteryRecovered = battery !== null && battery !== undefined && battery > batteryPct + BATTERY_HYSTERESIS;

      if (!alerts.battery && isBatteryLow) {
        // ok -> alert
        alerts.battery = true;
        alerts.battery_sent_at = nowIso;
        transitions.push({
          type: 'battery',
          transition: 'alert',
          ieee,
          friendly_name: device.friendly_name,
          detail: `battery at ${battery}% (threshold: ${batteryPct}%)`,
          timestamp: nowIso,
        });
      } else if (alerts.battery && isBatteryRecovered) {
        // alert -> ok (recovery)
        alerts.battery = false;
        alerts.battery_recovered_at = nowIso;
        transitions.push({
          type: 'battery',
          transition: 'recovery',
          ieee,
          friendly_name: device.friendly_name,
          detail: `battery recovered to ${battery}% (was below ${batteryPct}%)`,
          timestamp: nowIso,
        });
      }
      // else: no transition (ok->ok, alert->alert, or null battery)
    }
  }

  // Build summary
  const totalDevices = Object.keys(state.devices).length;
  const evaluated = totalDevices - excludedCount;
  let offlineAlerts = 0;
  let batteryAlerts = 0;

  for (const [ieee, device] of Object.entries(state.devices)) {
    if (isExcluded(ieee, device.friendly_name, exclusions)) continue;
    if (device.alerts.offline) offlineAlerts++;
    if (device.alerts.battery) batteryAlerts++;
  }

  const newAlerts = transitions.filter(t => t.transition === 'alert').length;
  const recoveries = transitions.filter(t => t.transition === 'recovery').length;

  const summary = {
    total_devices: totalDevices,
    excluded: excludedCount,
    evaluated,
    alerts: {
      offline: offlineAlerts,
      battery: batteryAlerts,
      total: offlineAlerts + batteryAlerts,
    },
    transitions: {
      new_alerts: newAlerts,
      recoveries,
    },
  };

  // Persist evaluation metadata in state
  state.last_evaluation = nowIso;
  state.evaluation_summary = summary;

  // Append transitions to pending_notifications
  if (!state.pending_notifications) state.pending_notifications = [];
  for (const transition of transitions) {
    state.pending_notifications.push(transition);
  }

  return { transitions, summary, excludedCount };
}

module.exports = { evaluateDevices };
