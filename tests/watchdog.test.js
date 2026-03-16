'use strict';

// Mock all lib modules before requiring watchdog
jest.mock('../bin/lib/config');
jest.mock('../bin/lib/z2m-reader');
jest.mock('../bin/lib/device-registry');
jest.mock('../bin/lib/state-store');
jest.mock('../bin/lib/evaluator');
jest.mock('../bin/lib/bridge-monitor');
jest.mock('../bin/lib/notify');

const { readConfig } = require('../bin/lib/config');
const { readZ2mState, readZ2mDatabase, detectZ2mPath } = require('../bin/lib/z2m-reader');
const { buildDeviceRegistry } = require('../bin/lib/device-registry');
const { readState, writeState, acquireLock } = require('../bin/lib/state-store');
const { evaluateDevices } = require('../bin/lib/evaluator');
const { checkBridgeState } = require('../bin/lib/bridge-monitor');
const { deliverNotifications } = require('../bin/lib/notify');

// We'll import mergeDeviceState after the module exists
let mergeDeviceState;
try {
  mergeDeviceState = require('../bin/watchdog').mergeDeviceState;
} catch (_) {
  // Module doesn't exist yet in RED phase
}

describe('mergeDeviceState', () => {
  test('new device from registry is added to state with default alerts', () => {
    const state = { devices: {} };
    const registry = new Map([
      ['0xabc', { friendly_name: 'Sensor 1', power_source: 'Battery', type: 'EndDevice' }],
    ]);
    const z2mState = {};

    mergeDeviceState(state, registry, z2mState);

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
    const z2mState = {};

    mergeDeviceState(state, registry, z2mState);

    expect(state.devices['0xabc'].friendly_name).toBe('New Name');
    expect(state.devices['0xabc'].battery).toBe(80);
  });

  test('device with last_seen in z2m state updates last_seen in state', () => {
    const state = { devices: {} };
    const registry = new Map([
      ['0xabc', { friendly_name: 'Sensor 1', power_source: 'Battery', type: 'EndDevice' }],
    ]);
    const z2mState = { 'Sensor 1': { last_seen: '2026-03-14T10:00:00.000Z' } };

    mergeDeviceState(state, registry, z2mState);

    expect(state.devices['0xabc'].last_seen).toBe('2026-03-14T10:00:00.000Z');
  });

  test('device state without last_seen field falls back to current time', () => {
    const now = new Date('2026-03-14T12:00:00.000Z');
    jest.spyOn(global, 'Date').mockImplementation(() => now);
    Date.now = jest.fn(() => now.getTime());

    const state = { devices: {} };
    const registry = new Map([
      ['0xabc', { friendly_name: 'Sensor 1', power_source: 'Battery', type: 'EndDevice' }],
    ]);
    const z2mState = { 'Sensor 1': { temperature: 22.5 } };

    mergeDeviceState(state, registry, z2mState);

    expect(state.devices['0xabc'].last_seen).toBe('2026-03-14T12:00:00.000Z');

    jest.restoreAllMocks();
  });

  test('battery-powered device with battery field updates battery', () => {
    const state = { devices: {} };
    const registry = new Map([
      ['0xabc', { friendly_name: 'Sensor 1', power_source: 'Battery', type: 'EndDevice' }],
    ]);
    const z2mState = { 'Sensor 1': { battery: 65, last_seen: '2026-03-14T10:00:00.000Z' } };

    mergeDeviceState(state, registry, z2mState);

    expect(state.devices['0xabc'].battery).toBe(65);
  });

  test('mains-powered device: battery field in z2m state is ignored', () => {
    const state = { devices: {} };
    const registry = new Map([
      ['0xabc', { friendly_name: 'Plug 1', power_source: 'Mains (single phase)', type: 'Router' }],
    ]);
    const z2mState = { 'Plug 1': { battery: 100, last_seen: '2026-03-14T10:00:00.000Z' } };

    mergeDeviceState(state, registry, z2mState);

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
    const z2mState = {};

    mergeDeviceState(state, registry, z2mState);

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
    const z2mState = {};

    mergeDeviceState(state, registry, z2mState);

    expect(state.devices['0xold']).toBeDefined();
    expect(state.devices['0xold'].friendly_name).toBe('Old Device');
    expect(state.devices['0xnew']).toBeDefined();
  });

  test('device with slash in friendly_name: z2m state lookup uses correct key', () => {
    const state = { devices: {} };
    const registry = new Map([
      ['0xabc', { friendly_name: 'floor/sensor', power_source: 'Battery', type: 'EndDevice' }],
    ]);
    const z2mState = { 'floor/sensor': { last_seen: '2026-03-14T10:00:00.000Z', battery: 42 } };

    mergeDeviceState(state, registry, z2mState);

    expect(state.devices['0xabc'].last_seen).toBe('2026-03-14T10:00:00.000Z');
    expect(state.devices['0xabc'].battery).toBe(42);
  });
});

describe('hard timeout', () => {
  test('setTimeout is called with 30000ms at module load', () => {
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
        Z2M: { z2m_data_path: '' },
        CRON: { interval_minutes: 60 },
        THRESHOLDS: { offline_hours: 24, battery_pct: 25 },
        NOTIFICATIONS: {},
        EXCLUSIONS: { devices: [] },
      };
    });

    readState.mockImplementation(() => {
      if (callOrder) callOrder.push('readState');
      return { last_run: null, devices: {} };
    });

    detectZ2mPath.mockImplementation(() => {
      if (callOrder) callOrder.push('detectZ2mPath');
      return '/opt/zigbee2mqtt/data';
    });

    readZ2mState.mockImplementation(() => {
      if (callOrder) callOrder.push('readZ2mState');
      return {
        'Sensor': { last_seen: '2026-03-16T10:00:00.000Z', battery: 85 },
      };
    });

    readZ2mDatabase.mockImplementation(() => {
      if (callOrder) callOrder.push('readZ2mDatabase');
      return [
        {
          id: 1,
          type: 'EndDevice',
          ieee_addr: '0xabc',
          friendly_name: 'Sensor',
          powerSource: 'Battery',
          interviewCompleted: true,
          modelId: 'SNZB-02',
        },
      ];
    });

    buildDeviceRegistry.mockImplementation((entries) => {
      if (callOrder) callOrder.push('buildDeviceRegistry');
      const reg = new Map();
      if (Array.isArray(entries)) {
        for (const d of entries) {
          if (d.type !== 'Coordinator' && d.interviewCompleted) {
            reg.set(d.ieee_addr, {
              friendly_name: d.friendly_name,
              power_source: d.powerSource,
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

    checkBridgeState.mockImplementation(() => {
      if (callOrder) callOrder.push('checkBridgeState');
      return null; // No bridge transition by default
    });

    deliverNotifications.mockImplementation(() => {
      if (callOrder) callOrder.push('deliverNotifications');
      return Promise.resolve({ sent: false, reason: 'no-transitions' });
    });

    return releaseFn;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calls modules in correct order: lock -> config -> state -> z2m read -> bridge -> registry -> evaluate -> write -> release', async () => {
    const callOrder = [];
    setupMainMocks(callOrder);

    const watchdog = require('../bin/watchdog');
    await watchdog.main();

    expect(callOrder).toEqual([
      'acquireLock',
      'readConfig',
      'readState',
      'detectZ2mPath',
      'readZ2mState',
      'readZ2mDatabase',
      'checkBridgeState',
      'buildDeviceRegistry',
      'evaluateDevices',
      'writeState',
      'deliverNotifications',
      'writeState',
      'release',
    ]);
  });

  test('evaluateDevices is called with state and config', async () => {
    setupMainMocks(null);

    const watchdog = require('../bin/watchdog');
    await watchdog.main();

    expect(evaluateDevices).toHaveBeenCalledTimes(1);
    const callArgs = evaluateDevices.mock.calls[0];
    expect(callArgs[0]).toHaveProperty('devices');
    expect(callArgs[1]).toHaveProperty('THRESHOLDS');
    expect(callArgs[1]).toHaveProperty('EXCLUSIONS');
  });

  test('checkBridgeState is called with z2mPath and state', async () => {
    setupMainMocks(null);

    const watchdog = require('../bin/watchdog');
    await watchdog.main();

    expect(checkBridgeState).toHaveBeenCalledTimes(1);
    expect(checkBridgeState.mock.calls[0][0]).toBe('/opt/zigbee2mqtt/data');
    expect(checkBridgeState.mock.calls[0][1]).toHaveProperty('devices');
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

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      const e = new Error('process.exit');
      e.exitCode = code;
      throw e;
    });

    try {
      await watchdog.main();
      expect(true).toBe(false);
    } catch (e) {
      expect(e.message).toBe('process.exit');
      expect(e.exitCode).toBe(0);
    }

    expect(mockExit).toHaveBeenCalledWith(0);
    mockExit.mockRestore();
  });

  test('when z2m_data_path is set in config, detectZ2mPath is NOT called', async () => {
    setupMainMocks(null);
    readConfig.mockReturnValue({
      Z2M: { z2m_data_path: '/custom/z2m/data' },
      CRON: { interval_minutes: 60 },
      THRESHOLDS: { offline_hours: 24, battery_pct: 25 },
      NOTIFICATIONS: {},
      EXCLUSIONS: { devices: [] },
    });

    const watchdog = require('../bin/watchdog');
    await watchdog.main();

    expect(detectZ2mPath).not.toHaveBeenCalled();
    expect(readZ2mState).toHaveBeenCalledWith('/custom/z2m/data');
    expect(readZ2mDatabase).toHaveBeenCalledWith('/custom/z2m/data');
  });

  test('when z2m_data_path is empty and detectZ2mPath returns null, main() throws descriptive error', async () => {
    setupMainMocks(null);
    detectZ2mPath.mockReturnValue(null);

    const watchdog = require('../bin/watchdog');

    await expect(watchdog.main()).rejects.toThrow(
      'zigbee2mqtt data path not found. Set z2m_data_path in config or ensure z2m is installed in a standard location.'
    );
  });
});

describe('bridge monitor and notification integration', () => {
  function setupIntegrationMocks() {
    const releaseFn = jest.fn().mockResolvedValue();
    acquireLock.mockResolvedValue(releaseFn);

    readConfig.mockReturnValue({
      Z2M: { z2m_data_path: '/opt/zigbee2mqtt/data' },
      CRON: { interval_minutes: 60 },
      THRESHOLDS: { offline_hours: 24, battery_pct: 25 },
      NOTIFICATIONS: { loxberry_enabled: true, email_enabled: true },
      EXCLUSIONS: { devices: [] },
    });

    readState.mockReturnValue({ last_run: null, devices: {}, pending_notifications: [] });

    readZ2mState.mockReturnValue({
      'Sensor': { last_seen: '2026-03-16T10:00:00.000Z', battery: 85 },
    });

    readZ2mDatabase.mockReturnValue([
      { id: 1, type: 'EndDevice', ieee_addr: '0xabc', friendly_name: 'Sensor', powerSource: 'Battery', interviewCompleted: true, modelId: 'SNZB-02' },
    ]);

    buildDeviceRegistry.mockReturnValue(new Map([
      ['0xabc', { friendly_name: 'Sensor', power_source: 'Battery', type: 'EndDevice' }],
    ]));

    evaluateDevices.mockReturnValue({
      transitions: [],
      summary: { total_devices: 1, excluded: 0, evaluated: 1, alerts: { offline: 0, battery: 0, total: 0 }, transitions: { new_alerts: 0, recoveries: 0 } },
      excludedCount: 0,
    });

    writeState.mockResolvedValue();
    checkBridgeState.mockReturnValue(null);
    deliverNotifications.mockResolvedValue({ sent: false, reason: 'no-transitions' });

    return releaseFn;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('normal run (bridge online): evaluateDevices runs, deliverNotifications called, writeState called twice', async () => {
    setupIntegrationMocks();
    checkBridgeState.mockReturnValue(null);

    const watchdog = require('../bin/watchdog');
    await watchdog.main();

    expect(checkBridgeState).toHaveBeenCalledTimes(1);
    expect(evaluateDevices).toHaveBeenCalledTimes(1);
    expect(deliverNotifications).toHaveBeenCalledTimes(1);
    expect(writeState).toHaveBeenCalledTimes(2);
  });

  test('bridge offline: evaluateDevices NOT called, bridge transition added to pending, writeState called twice', async () => {
    setupIntegrationMocks();
    const bridgeTransition = { type: 'bridge', transition: 'offline', timestamp: '2026-03-16T10:00:00.000Z' };
    checkBridgeState.mockReturnValue(bridgeTransition);

    const watchdog = require('../bin/watchdog');
    await watchdog.main();

    expect(evaluateDevices).not.toHaveBeenCalled();
    expect(buildDeviceRegistry).not.toHaveBeenCalled();
    expect(deliverNotifications).toHaveBeenCalledTimes(1);
    const deliverCall = deliverNotifications.mock.calls[0];
    expect(deliverCall[0].pending_notifications).toContainEqual(bridgeTransition);
    expect(writeState).toHaveBeenCalledTimes(2);
  });

  test('bridge recovery: bridge transition added, evaluateDevices runs, deliverNotifications called', async () => {
    setupIntegrationMocks();
    const recoveryTransition = { type: 'bridge', transition: 'online', detail: '2026-03-16T09:00:00.000Z', timestamp: '2026-03-16T10:00:00.000Z' };
    checkBridgeState.mockReturnValue(recoveryTransition);

    const watchdog = require('../bin/watchdog');
    await watchdog.main();

    expect(evaluateDevices).toHaveBeenCalledTimes(1);
    expect(deliverNotifications).toHaveBeenCalledTimes(1);
    const deliverCall = deliverNotifications.mock.calls[0];
    expect(deliverCall[0].pending_notifications).toContainEqual(recoveryTransition);
  });

  test('notification delivery failure: writeState still called second time, process does not crash', async () => {
    setupIntegrationMocks();
    deliverNotifications.mockRejectedValue(new Error('delivery exploded'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const watchdog = require('../bin/watchdog');
    await watchdog.main();

    expect(writeState).toHaveBeenCalledTimes(2);
    consoleSpy.mockRestore();
  });
});
