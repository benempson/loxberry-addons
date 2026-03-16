'use strict';

const { buildDeviceRegistry } = require('../bin/lib/device-registry');

// Simulates parsed database.db entries (from readZ2mDatabase)
const fixture = [
  { id: 1, type: 'Coordinator', ieee_addr: '0x00124b0025a7b300', friendly_name: 'Coordinator', modelId: 'CC2652P' },
  { id: 2, type: 'Router', ieee_addr: '0x00158d0001a2b3c4', friendly_name: 'Living Room Plug', modelId: 'SP-EUC01', powerSource: 'Mains (single phase)', interviewCompleted: true },
  { id: 3, type: 'EndDevice', ieee_addr: '0x00158d0001d4e5f6', friendly_name: 'Kitchen Door', modelId: 'MCCGQ11LM', powerSource: 'Battery', interviewCompleted: true },
  { id: 4, type: 'EndDevice', ieee_addr: '0x00158d0002e6f7a8', friendly_name: 'Bedroom Motion', modelId: 'RTCGQ11LM', powerSource: 'Battery', interviewCompleted: true },
  { id: 5, type: 'EndDevice', ieee_addr: '0x00158d0003f8a9b0', friendly_name: 'Garage Temp', modelId: 'WSDCGQ11LM', powerSource: 'Battery', interviewCompleted: false },
];

describe('buildDeviceRegistry', () => {
  test('parses fixture and returns expected device count (excludes Coordinator + incomplete)', () => {
    const registry = buildDeviceRegistry(fixture);
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

  test('skips devices with missing ieee_addr', () => {
    const payload = [
      {
        type: 'EndDevice',
        friendly_name: 'No IEEE',
        powerSource: 'Battery',
        interviewCompleted: true,
      },
    ];
    const registry = buildDeviceRegistry(payload);
    expect(registry.size).toBe(0);
  });
});
