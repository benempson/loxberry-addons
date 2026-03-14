'use strict';

/**
 * Build a device registry Map from the zigbee2mqtt bridge/devices payload.
 *
 * Filters out Coordinator devices and devices with incomplete interviews.
 * Keys the Map on ieee_address for O(1) lookups.
 *
 * @param {Array} bridgeDevicesPayload - The bridge/devices JSON array from zigbee2mqtt
 * @returns {Map<string, object>} Map keyed on ieee_address with device info
 */
function buildDeviceRegistry(bridgeDevicesPayload) {
  if (!Array.isArray(bridgeDevicesPayload)) {
    return new Map();
  }

  const registry = new Map();

  for (const device of bridgeDevicesPayload) {
    // Skip devices without an IEEE address
    if (!device.ieee_address) continue;

    // Skip Coordinator
    if (device.type === 'Coordinator') continue;

    // Skip devices with incomplete interview
    if (!device.interview_completed) continue;

    registry.set(device.ieee_address, {
      friendly_name: device.friendly_name,
      power_source: device.power_source,
      type: device.type,
      model_id: device.model_id || null,
      supported: device.supported !== false,
    });
  }

  return registry;
}

module.exports = { buildDeviceRegistry };
