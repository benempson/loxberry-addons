'use strict';

// Hard timeout safety net -- FIRST thing
const HARD_TIMEOUT_MS = 30000;
setTimeout(() => {
  console.error('FATAL: Hard timeout reached after 30s, forcing exit');
  process.exit(1);
}, HARD_TIMEOUT_MS).unref();

const path = require('path');
const { readConfig } = require('./lib/config');
const { collectMessages } = require('./lib/mqtt-collector');
const { buildDeviceRegistry } = require('./lib/device-registry');
const { readState, writeState, acquireLock } = require('./lib/state-store');

// Paths -- overridable via env vars for dev/test
const PLUGIN_NAME = 'zigbee_watchdog';
const BASE_DIR = process.env.LOXBERRY_DIR || '/opt/loxberry';
const CONFIG_PATH = process.env.WATCHDOG_CONFIG || path.join(BASE_DIR, 'config', 'plugins', PLUGIN_NAME, 'watchdog.cfg');
const DATA_DIR = process.env.WATCHDOG_DATA_DIR || path.join(BASE_DIR, 'data', 'plugins', PLUGIN_NAME);
const STATE_PATH = path.join(DATA_DIR, 'state.json');
const LOCK_FILE = path.join(DATA_DIR, 'watchdog.lock');

/**
 * Merge device registry data and MQTT message payloads into persisted state.
 * Updates state.devices in place. Preserves devices not in current registry.
 *
 * @param {object} state - The persisted state object (mutated in place)
 * @param {Map} registry - Device registry from buildDeviceRegistry
 * @param {Map} messages - MQTT messages from collectMessages
 * @param {string} baseTopic - MQTT base topic (e.g. 'zigbee2mqtt')
 */
function mergeDeviceState(state, registry, messages, baseTopic) {
  if (!state.devices) state.devices = {};

  for (const [ieee, regEntry] of registry) {
    const existing = state.devices[ieee] || {};
    const topic = `${baseTopic}/${regEntry.friendly_name}`;
    const payload = messages.get(topic) || {};

    // Determine last_seen
    let lastSeen = existing.last_seen || null;
    if (payload.last_seen) {
      lastSeen = typeof payload.last_seen === 'number'
        ? new Date(payload.last_seen).toISOString()
        : payload.last_seen;
    } else if (Object.keys(payload).length > 0) {
      // Message received but no last_seen field -- use current time as fallback
      lastSeen = new Date().toISOString();
    }

    // Determine battery
    let battery = existing.battery != null ? existing.battery : null;
    if (regEntry.power_source === 'Battery' && payload.battery != null) {
      battery = payload.battery;
    }

    state.devices[ieee] = {
      friendly_name: regEntry.friendly_name,
      power_source: regEntry.power_source,
      type: regEntry.type,
      last_seen: lastSeen,
      battery: battery,
      alerts: existing.alerts || {
        offline: false, offline_sent_at: null,
        battery: false, battery_sent_at: null,
      },
    };
  }
}

/**
 * Main entry point -- runs the full watchdog lifecycle.
 */
async function main() {
  let release;
  try {
    release = await acquireLock(LOCK_FILE);
  } catch (err) {
    if (err.code === 'ELOCKED') {
      console.log('Previous run still active, skipping');
      process.exit(0);
    }
    throw err;
  }

  try {
    const config = readConfig(CONFIG_PATH);
    const state = readState(STATE_PATH);
    const mqttConfig = { ...config.MQTT, drain_seconds: config.CRON.drain_seconds };
    const messages = await collectMessages(mqttConfig);
    const bridgeTopic = `${config.MQTT.base_topic}/bridge/devices`;
    const registry = buildDeviceRegistry(messages.get(bridgeTopic));
    mergeDeviceState(state, registry, messages, config.MQTT.base_topic);
    state.last_run = new Date().toISOString();
    await writeState(STATE_PATH, state);
    console.log(`Run complete. ${registry.size} devices tracked.`);
  } finally {
    if (release) await release();
  }
}

// Export for testing
module.exports = { mergeDeviceState, main };

// Only run main if this is the entry point (not when required for testing)
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('FATAL:', err.message);
      process.exit(1);
    });
}
