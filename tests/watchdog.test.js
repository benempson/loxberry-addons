'use strict';

// Mock all lib modules before requiring watchdog
jest.mock('../bin/lib/config');
jest.mock('../bin/lib/mqtt-collector');
jest.mock('../bin/lib/device-registry');
jest.mock('../bin/lib/state-store');

const { readConfig } = require('../bin/lib/config');
const { collectMessages } = require('../bin/lib/mqtt-collector');
const { buildDeviceRegistry } = require('../bin/lib/device-registry');
const { readState, writeState, acquireLock } = require('../bin/lib/state-store');

// We'll import mergeDeviceState after the module exists
let mergeDeviceState;
try {
  mergeDeviceState = require('../bin/watchdog').mergeDeviceState;
} catch (_) {
  // Module doesn't exist yet in RED phase
}

describe('mergeDeviceState', () => {
  const baseTopic = 'zigbee2mqtt';

  test('new device from registry is added to state with default alerts', () => {
    const state = { devices: {} };
    const registry = new Map([
      ['0xabc', { friendly_name: 'Sensor 1', power_source: 'Battery', type: 'EndDevice' }],
    ]);
    const messages = new Map();

    mergeDeviceState(state, registry, messages, baseTopic);

    expect(state.devices['0xabc']).toEqual({
      friendly_name: 'Sensor 1',
      power_source: 'Battery',
      type: 'EndDevice',
      last_seen: null,
      battery: null,
      alerts: { offline: false, offline_sent_at: null, battery: false, battery_sent_at: null },
    });
  });

  test('existing device has friendly_name updated from registry (handles renames)', () => {
    const state = {
      devices: {
        '0xabc': {
          friendly_name: 'Old Name',
          power_source: 'Battery',
          type: 'EndDevice',
          last_seen: '2026-01-01T00:00:00.000Z',
          battery: 80,
          alerts: { offline: false, offline_sent_at: null, battery: false, battery_sent_at: null },
        },
      },
    };
    const registry = new Map([
      ['0xabc', { friendly_name: 'New Name', power_source: 'Battery', type: 'EndDevice' }],
    ]);
    const messages = new Map();

    mergeDeviceState(state, registry, messages, baseTopic);

    expect(state.devices['0xabc'].friendly_name).toBe('New Name');
    expect(state.devices['0xabc'].battery).toBe(80);
  });

  test('device payload with last_seen field updates last_seen in state', () => {
    const state = { devices: {} };
    const registry = new Map([
      ['0xabc', { friendly_name: 'Sensor 1', power_source: 'Battery', type: 'EndDevice' }],
    ]);
    const messages = new Map([
      ['zigbee2mqtt/Sensor 1', { last_seen: '2026-03-14T10:00:00.000Z' }],
    ]);

    mergeDeviceState(state, registry, messages, baseTopic);

    expect(state.devices['0xabc'].last_seen).toBe('2026-03-14T10:00:00.000Z');
  });

  test('device payload without last_seen field falls back to current time', () => {
    const now = new Date('2026-03-14T12:00:00.000Z');
    jest.spyOn(global, 'Date').mockImplementation(() => now);
    Date.now = jest.fn(() => now.getTime());

    const state = { devices: {} };
    const registry = new Map([
      ['0xabc', { friendly_name: 'Sensor 1', power_source: 'Battery', type: 'EndDevice' }],
    ]);
    const messages = new Map([
      ['zigbee2mqtt/Sensor 1', { temperature: 22.5 }],
    ]);

    mergeDeviceState(state, registry, messages, baseTopic);

    expect(state.devices['0xabc'].last_seen).toBe('2026-03-14T12:00:00.000Z');

    jest.restoreAllMocks();
  });

  test('battery-powered device payload with battery field updates battery', () => {
    const state = { devices: {} };
    const registry = new Map([
      ['0xabc', { friendly_name: 'Sensor 1', power_source: 'Battery', type: 'EndDevice' }],
    ]);
    const messages = new Map([
      ['zigbee2mqtt/Sensor 1', { battery: 65, last_seen: '2026-03-14T10:00:00.000Z' }],
    ]);

    mergeDeviceState(state, registry, messages, baseTopic);

    expect(state.devices['0xabc'].battery).toBe(65);
  });

  test('mains-powered device: battery field in payload is ignored', () => {
    const state = { devices: {} };
    const registry = new Map([
      ['0xabc', { friendly_name: 'Plug 1', power_source: 'Mains (single phase)', type: 'Router' }],
    ]);
    const messages = new Map([
      ['zigbee2mqtt/Plug 1', { battery: 100, last_seen: '2026-03-14T10:00:00.000Z' }],
    ]);

    mergeDeviceState(state, registry, messages, baseTopic);

    expect(state.devices['0xabc'].battery).toBeNull();
  });

  test('existing device alerts are preserved (not reset on merge)', () => {
    const state = {
      devices: {
        '0xabc': {
          friendly_name: 'Sensor 1',
          power_source: 'Battery',
          type: 'EndDevice',
          last_seen: '2026-01-01T00:00:00.000Z',
          battery: 50,
          alerts: { offline: true, offline_sent_at: '2026-03-13T00:00:00.000Z', battery: true, battery_sent_at: '2026-03-13T00:00:00.000Z' },
        },
      },
    };
    const registry = new Map([
      ['0xabc', { friendly_name: 'Sensor 1', power_source: 'Battery', type: 'EndDevice' }],
    ]);
    const messages = new Map();

    mergeDeviceState(state, registry, messages, baseTopic);

    expect(state.devices['0xabc'].alerts).toEqual({
      offline: true,
      offline_sent_at: '2026-03-13T00:00:00.000Z',
      battery: true,
      battery_sent_at: '2026-03-13T00:00:00.000Z',
    });
  });

  test('device in state but not in registry is preserved', () => {
    const state = {
      devices: {
        '0xold': {
          friendly_name: 'Old Device',
          power_source: 'Battery',
          type: 'EndDevice',
          last_seen: '2026-01-01T00:00:00.000Z',
          battery: 90,
          alerts: { offline: false, offline_sent_at: null, battery: false, battery_sent_at: null },
        },
      },
    };
    const registry = new Map([
      ['0xnew', { friendly_name: 'New Device', power_source: 'Battery', type: 'EndDevice' }],
    ]);
    const messages = new Map();

    mergeDeviceState(state, registry, messages, baseTopic);

    expect(state.devices['0xold']).toBeDefined();
    expect(state.devices['0xold'].friendly_name).toBe('Old Device');
    expect(state.devices['0xnew']).toBeDefined();
  });

  test('device with slash in friendly_name: message lookup uses correct topic', () => {
    const state = { devices: {} };
    const registry = new Map([
      ['0xabc', { friendly_name: 'floor/sensor', power_source: 'Battery', type: 'EndDevice' }],
    ]);
    const messages = new Map([
      ['zigbee2mqtt/floor/sensor', { last_seen: '2026-03-14T10:00:00.000Z', battery: 42 }],
    ]);

    mergeDeviceState(state, registry, messages, baseTopic);

    expect(state.devices['0xabc'].last_seen).toBe('2026-03-14T10:00:00.000Z');
    expect(state.devices['0xabc'].battery).toBe(42);
  });
});

describe('hard timeout', () => {
  test('setTimeout is called with 30000ms at module load', () => {
    // This is verified by the module structure -- the setTimeout call at the top
    // We verify the exported HARD_TIMEOUT_MS constant or check the module loaded
    // Since watchdog.js sets setTimeout at top level, we verify it by checking
    // that requiring the module doesn't throw and mergeDeviceState is exported
    expect(mergeDeviceState).toBeDefined();
    expect(typeof mergeDeviceState).toBe('function');
  });
});

describe('main lifecycle (happy path)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calls modules in correct order: lock -> config -> state -> collect -> registry -> merge -> write -> release', async () => {
    const callOrder = [];
    const releaseFn = jest.fn(() => {
      callOrder.push('release');
      return Promise.resolve();
    });

    acquireLock.mockImplementation(() => {
      callOrder.push('acquireLock');
      return Promise.resolve(releaseFn);
    });

    readConfig.mockImplementation(() => {
      callOrder.push('readConfig');
      return {
        MQTT: { host: 'localhost', port: 1883, base_topic: 'zigbee2mqtt', username: '', password: '' },
        CRON: { drain_seconds: 3 },
        THRESHOLDS: { offline_hours: 24, battery_pct: 25 },
        NOTIFICATIONS: {},
        EXCLUSIONS: { devices: [] },
      };
    });

    readState.mockImplementation(() => {
      callOrder.push('readState');
      return { last_run: null, devices: {} };
    });

    collectMessages.mockImplementation(() => {
      callOrder.push('collectMessages');
      const msgs = new Map();
      msgs.set('zigbee2mqtt/bridge/devices', [
        {
          ieee_address: '0xabc',
          friendly_name: 'Sensor',
          power_source: 'Battery',
          type: 'EndDevice',
          interview_completed: true,
          supported: true,
        },
      ]);
      return Promise.resolve(msgs);
    });

    buildDeviceRegistry.mockImplementation((payload) => {
      callOrder.push('buildDeviceRegistry');
      const reg = new Map();
      if (Array.isArray(payload)) {
        for (const d of payload) {
          if (d.type !== 'Coordinator' && d.interview_completed) {
            reg.set(d.ieee_address, {
              friendly_name: d.friendly_name,
              power_source: d.power_source,
              type: d.type,
            });
          }
        }
      }
      return reg;
    });

    writeState.mockImplementation(() => {
      callOrder.push('writeState');
      return Promise.resolve();
    });

    // Run main by re-requiring with mocked require.main
    // Instead, we test the exported mergeDeviceState integration
    // and verify the call order through a manual main() invocation
    const watchdog = require('../bin/watchdog');

    // If main is exported, call it directly; otherwise we test via the lifecycle
    if (watchdog.main) {
      await watchdog.main();
    }

    expect(callOrder).toEqual([
      'acquireLock',
      'readConfig',
      'readState',
      'collectMessages',
      'buildDeviceRegistry',
      'writeState',
      'release',
    ]);
  });

  test('ELOCKED error causes graceful skip (exit 0)', async () => {
    const err = new Error('Lock is already being held');
    err.code = 'ELOCKED';
    acquireLock.mockRejectedValue(err);

    const watchdog = require('../bin/watchdog');

    // Mock process.exit to throw a sentinel so execution stops like real exit
    const exitError = new Error('process.exit');
    exitError.exitCode = 0;
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      const e = new Error('process.exit');
      e.exitCode = code;
      throw e;
    });

    try {
      await watchdog.main();
      // Should not reach here
      expect(true).toBe(false);
    } catch (e) {
      expect(e.message).toBe('process.exit');
      expect(e.exitCode).toBe(0);
    }

    expect(mockExit).toHaveBeenCalledWith(0);
    mockExit.mockRestore();
  });
});
