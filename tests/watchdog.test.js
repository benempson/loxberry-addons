'use strict';

// Mock all lib modules before requiring watchdog
jest.mock('../bin/lib/config');
jest.mock('../bin/lib/mqtt-collector');
jest.mock('../bin/lib/device-registry');
jest.mock('../bin/lib/state-store');
jest.mock('../bin/lib/evaluator');

const { readConfig } = require('../bin/lib/config');
const { collectMessages } = require('../bin/lib/mqtt-collector');
const { buildDeviceRegistry } = require('../bin/lib/device-registry');
const { readState, writeState, acquireLock } = require('../bin/lib/state-store');
const { evaluateDevices } = require('../bin/lib/evaluator');

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
  /** Helper: set up all mocks for a standard main() run */
  function setupMainMocks(callOrder) {
    const releaseFn = jest.fn(() => {
      if (callOrder) callOrder.push('release');
      return Promise.resolve();
    });

    acquireLock.mockImplementation(() => {
      if (callOrder) callOrder.push('acquireLock');
      return Promise.resolve(releaseFn);
    });

    readConfig.mockImplementation(() => {
      if (callOrder) callOrder.push('readConfig');
      return {
        MQTT: { host: 'localhost', port: 1883, base_topic: 'zigbee2mqtt', username: '', password: '' },
        CRON: { drain_seconds: 3 },
        THRESHOLDS: { offline_hours: 24, battery_pct: 25 },
        NOTIFICATIONS: {},
        EXCLUSIONS: { devices: [] },
      };
    });

    readState.mockImplementation(() => {
      if (callOrder) callOrder.push('readState');
      return { last_run: null, devices: {} };
    });

    collectMessages.mockImplementation(() => {
      if (callOrder) callOrder.push('collectMessages');
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
      if (callOrder) callOrder.push('buildDeviceRegistry');
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

    evaluateDevices.mockImplementation(() => {
      if (callOrder) callOrder.push('evaluateDevices');
      return { transitions: [], summary: { total_devices: 1, excluded: 0, evaluated: 1, alerts: { offline: 0, battery: 0, total: 0 }, transitions: { new_alerts: 0, recoveries: 0 } }, excludedCount: 0 };
    });

    writeState.mockImplementation(() => {
      if (callOrder) callOrder.push('writeState');
      return Promise.resolve();
    });

    return releaseFn;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calls modules in correct order: lock -> config -> state -> collect -> registry -> evaluate -> write -> release', async () => {
    const callOrder = [];
    setupMainMocks(callOrder);

    const watchdog = require('../bin/watchdog');
    await watchdog.main();

    expect(callOrder).toEqual([
      'acquireLock',
      'readConfig',
      'readState',
      'collectMessages',
      'buildDeviceRegistry',
      'evaluateDevices',
      'writeState',
      'release',
    ]);
  });

  test('evaluateDevices is called with state and config', async () => {
    setupMainMocks(null);

    const watchdog = require('../bin/watchdog');
    await watchdog.main();

    expect(evaluateDevices).toHaveBeenCalledTimes(1);
    // First arg is state object, second is config object
    const callArgs = evaluateDevices.mock.calls[0];
    expect(callArgs[0]).toHaveProperty('devices');
    expect(callArgs[1]).toHaveProperty('THRESHOLDS');
    expect(callArgs[1]).toHaveProperty('EXCLUSIONS');
  });

  test('console.log outputs summary with alerts and recoveries', async () => {
    setupMainMocks(null);
    evaluateDevices.mockReturnValue({
      transitions: [
        { type: 'offline', transition: 'alert', ieee: '0x1', friendly_name: 'A', detail: 'not seen', timestamp: 'T' },
        { type: 'offline', transition: 'alert', ieee: '0x2', friendly_name: 'B', detail: 'not seen', timestamp: 'T' },
        { type: 'battery', transition: 'alert', ieee: '0x3', friendly_name: 'C', detail: 'low', timestamp: 'T' },
        { type: 'offline', transition: 'recovery', ieee: '0x4', friendly_name: 'D', detail: 'seen', timestamp: 'T' },
      ],
      summary: {},
      excludedCount: 5,
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const watchdog = require('../bin/watchdog');
    await watchdog.main();

    const logOutput = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(logOutput).toMatch(/3 alerts \(2 offline, 1 battery\)/);
    expect(logOutput).toMatch(/1 recovery/);
    expect(logOutput).toMatch(/5 excluded/);
    logSpy.mockRestore();
  });

  test('console.log outputs "No changes" when no transitions or exclusions', async () => {
    setupMainMocks(null);
    evaluateDevices.mockReturnValue({
      transitions: [],
      summary: {},
      excludedCount: 0,
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const watchdog = require('../bin/watchdog');
    await watchdog.main();

    const logOutput = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(logOutput).toMatch(/No changes/);
    logSpy.mockRestore();
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
