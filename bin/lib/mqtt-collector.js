'use strict';

const mqtt = require('mqtt');

/**
 * Connect to an MQTT broker, subscribe to the base topic wildcard,
 * collect messages for a drain window, then disconnect and return them.
 *
 * @param {object} mqttConfig - MQTT connection config
 * @param {string} mqttConfig.host - Broker hostname
 * @param {number} mqttConfig.port - Broker port
 * @param {string} mqttConfig.base_topic - Base topic (e.g. 'zigbee2mqtt')
 * @param {string} mqttConfig.username - Broker username (empty string = no auth)
 * @param {string} mqttConfig.password - Broker password (empty string = no auth)
 * @param {number} mqttConfig.drain_seconds - How long to collect messages before disconnecting
 * @returns {Promise<Map<string, object>>} Map of topic -> parsed JSON payload
 */
function collectMessages(mqttConfig) {
  const { host, port, base_topic, username, password, drain_seconds } = mqttConfig;

  const client = mqtt.connect(`mqtt://${host}:${port}`, {
    username: username || undefined,
    password: password || undefined,
    connectTimeout: 5000,
    reconnectPeriod: 0,
    clean: true,
  });

  return new Promise((resolve, reject) => {
    const messages = new Map();
    let drainTimer = null;
    let settled = false;

    function settle(fn) {
      if (settled) return;
      settled = true;
      if (drainTimer) clearTimeout(drainTimer);
      fn();
    }

    client.on('connect', () => {
      client.subscribe(`${base_topic}/#`, { qos: 0 }, (err) => {
        if (err) {
          settle(() => {
            client.end(true);
            reject(err);
          });
          return;
        }

        // Start drain timer after successful subscribe
        drainTimer = setTimeout(() => {
          settle(() => {
            client.end(false, () => {
              resolve(messages);
            });
          });
        }, drain_seconds * 1000);
      });
    });

    client.on('message', (topic, payload) => {
      try {
        const parsed = JSON.parse(payload.toString());
        messages.set(topic, parsed);
      } catch (_) {
        // Silently skip non-JSON payloads
      }
    });

    client.on('error', (err) => {
      settle(() => {
        client.end(true);
        reject(err);
      });
    });
  });
}

module.exports = { collectMessages };
