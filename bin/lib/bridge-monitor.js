'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_FRESHNESS_MINUTES = 10;

/**
 * Check bridge online state via systemctl + file freshness.
 * Manages bridge_online and bridge_offline_since in state.
 * Returns transition object if state changed, null otherwise.
 *
 * @param {string} z2mDataPath - Path to z2m data directory
 * @param {object} state - Mutable state object
 * @param {Date} [now] - Injectable current time (defaults to new Date())
 * @param {number} [freshnessMinutes] - Max age of state.json in minutes (default 10)
 * @returns {{ type: string, transition: string, detail?: string, timestamp: string } | null}
 */
function checkBridgeState(z2mDataPath, state, now, freshnessMinutes) {
  now = now || new Date();
  freshnessMinutes = freshnessMinutes || DEFAULT_FRESHNESS_MINUTES;

  // Primary check: systemctl is-active
  let systemctlActive = false;
  try {
    const result = execSync('systemctl is-active zigbee2mqtt', { encoding: 'utf8' }).trim();
    systemctlActive = result === 'active';
  } catch (_err) {
    systemctlActive = false;
  }

  // Secondary check: state.json mtime freshness
  let fileFresh = false;
  if (systemctlActive) {
    try {
      const stat = fs.statSync(path.join(z2mDataPath, 'state.json'));
      const ageMs = now.getTime() - stat.mtime.getTime();
      const thresholdMs = freshnessMinutes * 60 * 1000;
      fileFresh = ageMs <= thresholdMs;
    } catch (_err) {
      fileFresh = false;
    }
  }

  const bridgeOnline = systemctlActive && fileFresh;

  // Default to true on first run (bridge_online undefined)
  const wasOnline = state.bridge_online !== false;
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

  return null;
}

module.exports = { checkBridgeState };
