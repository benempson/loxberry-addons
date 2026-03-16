'use strict';

/**
 * Check bridge online state and detect transitions.
 * Manages bridge_online and bridge_offline_since in state.
 * Returns transition object if state changed, null otherwise.
 *
 * @param {Map<string, object>} messages - MQTT messages map
 * @param {string} baseTopic - MQTT base topic (e.g. 'zigbee2mqtt')
 * @param {object} state - Mutable state object
 * @param {Date} [now] - Injectable current time (defaults to new Date())
 * @returns {{ type: string, transition: string, detail?: string, timestamp: string } | null}
 */
function checkBridgeState(messages, baseTopic, state, now) {
  now = now || new Date();
  const bridgeTopic = `${baseTopic}/bridge/state`;
  const bridgePayload = messages.get(bridgeTopic);

  // Determine current bridge state
  let bridgeOnline = false;
  if (bridgePayload && typeof bridgePayload === 'object' && bridgePayload.state) {
    bridgeOnline = bridgePayload.state === 'online';
  }

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
