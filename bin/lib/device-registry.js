'use strict';

/**
 * Build a device registry Map from z2m database.db entries and devices.yaml names.
 *
 * Filters out Coordinator devices and devices with incomplete interviews.
 * Keys the Map on IEEE address for O(1) lookups.
 *
 * @param {Array} databaseEntries - Array of device objects parsed from database.db
 * @param {object} [devicesYaml] - Map of IEEE -> { friendly_name, description } from devices.yaml
 * @returns {Map<string, object>} Map keyed on IEEE address with device info
 */
function buildDeviceRegistry(databaseEntries, devicesYaml) {
  if (!Array.isArray(databaseEntries)) {
    return new Map();
  }

  const names = devicesYaml || {};
  const registry = new Map();

  for (const device of databaseEntries) {
    // Skip devices without an IEEE address
    if (!device.ieeeAddr) continue;

    // Skip Coordinator
    if (device.type === 'Coordinator') continue;

    // Skip devices with incomplete interview
    if (!device.interviewCompleted) continue;

    const yamlEntry = names[device.ieeeAddr] || {};

    registry.set(device.ieeeAddr, {
      friendly_name: yamlEntry.friendly_name || device.ieeeAddr,
      power_source: device.powerSource || 'Unknown',
      type: device.type,
      model_id: device.modelId || null,
      supported: true,
    });
  }

  return registry;
}

module.exports = { buildDeviceRegistry };
