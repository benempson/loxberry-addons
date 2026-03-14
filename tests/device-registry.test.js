'use strict';

const path = require('path');
const { buildDeviceRegistry } = require('../bin/lib/device-registry');

const fixture = require('./fixtures/bridge-devices.json');

describe('buildDeviceRegistry', () => {
  test('parses fixture and returns expected device count (excludes Coordinator + incomplete)', () => {
    const registry = buildDeviceRegistry(fixture);
    // Fixture has 5 devices: 1 Coordinator, 3 complete non-Coordinator, 1 incomplete
    // Expected: 3 devices (Living Room Plug, Kitchen Door, Bedroom Motion)
    expect(registry).toBeInstanceOf(Map);
    expect(registry.size).toBe(3);
  });

  test('each entry has correct fields', () => {
    const registry = buildDeviceRegistry(fixture);
    const plug = registry.get('0x00158d0001a2b3c4');
    expect(plug).toEqual({
      friendly_name: 'Living Room Plug',
      power_source: 'Mains (single phase)',
      type: 'Router',
      model_id: 'SP-EUC01',
      supported: true,
    });

    const door = registry.get('0x00158d0001d4e5f6');
    expect(door).toEqual({
      friendly_name: 'Kitchen Door',
      power_source: 'Battery',
      type: 'EndDevice',
      model_id: 'MCCGQ11LM',
      supported: true,
    });
  });

  test('Coordinator is not in result', () => {
    const registry = buildDeviceRegistry(fixture);
    expect(registry.has('0x00124b0025a7b300')).toBe(false);
  });

  test('incomplete interview device is not in result', () => {
    const registry = buildDeviceRegistry(fixture);
    expect(registry.has('0x00158d0003f8a9b0')).toBe(false);
  });

  test('returns empty Map for null input', () => {
    expect(buildDeviceRegistry(null)).toEqual(new Map());
  });

  test('returns empty Map for undefined input', () => {
    expect(buildDeviceRegistry(undefined)).toEqual(new Map());
  });

  test('returns empty Map for non-array input', () => {
    expect(buildDeviceRegistry('not an array')).toEqual(new Map());
    expect(buildDeviceRegistry(42)).toEqual(new Map());
    expect(buildDeviceRegistry({})).toEqual(new Map());
  });

  test('returns empty Map for empty array', () => {
    expect(buildDeviceRegistry([])).toEqual(new Map());
  });

  test('skips devices with missing ieee_address', () => {
    const payload = [
      {
        type: 'EndDevice',
        friendly_name: 'No IEEE',
        power_source: 'Battery',
        interview_completed: true,
        supported: true,
      },
    ];
    const registry = buildDeviceRegistry(payload);
    expect(registry.size).toBe(0);
  });
});
