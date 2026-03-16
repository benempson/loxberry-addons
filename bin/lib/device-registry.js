'use strict';

/**
 * Build a device registry Map from z2m database.db entries.
 *
 * Filters out Coordinator devices and devices with incomplete interviews.
 * Keys the Map on ieee_addr for O(1) lookups.
 *
 * @param {Array} databaseEntries - Array of device objects parsed from database.db
 * @returns {Map<string, object>} Map keyed on ieee_addr with device info
 */
function buildDeviceRegistry(databaseEntries) {
  if (!Array.isArray(databaseEntries)) {
    return new Map();
  }

  const registry = new Map();

  for (const device of databaseEntries) {
    // Skip devices without an IEEE address
    if (!device.ieee_addr) continue;

    // Skip Coordinator
    if (device.type === 'Coordinator') continue;

    // Skip devices with incomplete interview
    if (!device.interviewCompleted) continue;

    registry.set(device.ieee_addr, {
      friendly_name: device.friendly_name,
      power_source: device.powerSource,
      type: device.type,
      model_id: device.modelId || null,
      supported: true,
    });
  }

  return registry;
}

module.exports = { buildDeviceRegistry };
