'use strict';

const { evaluateDevices } = require('../bin/lib/evaluator');

// Helper: create a device entry
function makeDevice(overrides = {}) {
  return {
    friendly_name: overrides.friendly_name || 'Test Sensor',
    power_source: overrides.power_source || 'Battery',
    type: overrides.type || 'EndDevice',
    last_seen: overrides.last_seen !== undefined ? overrides.last_seen : '2026-03-14T10:00:00.000Z',
    battery: overrides.battery !== undefined ? overrides.battery : 85,
    alerts: overrides.alerts || {
      offline: false,
      offline_sent_at: null,
      battery: false,
      battery_sent_at: null,
    },
  };
}

// Helper: create a state with devices
function makeState(devices = {}) {
  return { last_run: '2026-03-14T09:00:00.000Z', devices };
}

// Helper: create config
function makeConfig(overrides = {}) {
  return {
    THRESHOLDS: {
      offline_hours: overrides.offline_hours || 24,
      battery_pct: overrides.battery_pct || 25,
    },
    EXCLUSIONS: {
      devices: overrides.exclusions || [],
    },
  };
}

// Fixed "now" for deterministic tests
const NOW = new Date('2026-03-15T12:00:00.000Z');

describe('evaluateDevices', () => {
  describe('offline evaluation (ALRT-01, DEVT-02)', () => {
    test('flags device offline when last_seen exceeds threshold', () => {
      // 26 hours ago (threshold is 24h)
      const state = makeState({
        '0x001': makeDevice({ last_seen: '2026-03-14T10:00:00.000Z' }),
      });
      const config = makeConfig();
      const result = evaluateDevices(state, config, NOW);

      expect(state.devices['0x001'].alerts.offline).toBe(true);
      expect(state.devices['0x001'].alerts.offline_sent_at).toBe(NOW.toISOString());

      // Should produce an alert transition
      expect(result.transitions).toHaveLength(1);
      expect(result.transitions[0]).toMatchObject({
        type: 'offline',
        transition: 'alert',
        ieee: '0x001',
        friendly_name: 'Test Sensor',
      });
      expect(result.transitions[0].detail).toMatch(/not seen for/);
    });

    test('flags device with null last_seen as offline with "never seen" detail', () => {
      const state = makeState({
        '0x002': makeDevice({ last_seen: null }),
      });
      const config = makeConfig();
      const result = evaluateDevices(state, config, NOW);

      expect(state.devices['0x002'].alerts.offline).toBe(true);
      expect(state.devices['0x002'].alerts.offline_sent_at).toBe(NOW.toISOString());
      expect(result.transitions[0].detail).toBe('never seen');
    });

    test('does not flag device seen within threshold', () => {
      // 2 hours ago (well within 24h threshold)
      const state = makeState({
        '0x003': makeDevice({ last_seen: '2026-03-15T10:00:00.000Z' }),
      });
      const config = makeConfig();
      const result = evaluateDevices(state, config, NOW);

      expect(state.devices['0x003'].alerts.offline).toBe(false);
      expect(result.transitions).toHaveLength(0);
    });

    test('suppresses duplicate alert when already offline (ALRT-03)', () => {
      const state = makeState({
        '0x004': makeDevice({
          last_seen: '2026-03-13T10:00:00.000Z',
          alerts: {
            offline: true,
            offline_sent_at: '2026-03-14T12:00:00.000Z',
            battery: false,
            battery_sent_at: null,
          },
        }),
      });
      const config = makeConfig();
      const result = evaluateDevices(state, config, NOW);

      // Still offline but no new transition
      expect(state.devices['0x004'].alerts.offline).toBe(true);
      expect(result.transitions).toHaveLength(0);
    });

    test('produces recovery transition when previously offline device is seen again (ALRT-04)', () => {
      const state = makeState({
        '0x005': makeDevice({
          last_seen: '2026-03-15T11:00:00.000Z', // 1 hour ago, within threshold
          alerts: {
            offline: true,
            offline_sent_at: '2026-03-14T12:00:00.000Z',
            battery: false,
            battery_sent_at: null,
          },
        }),
      });
      const config = makeConfig();
      const result = evaluateDevices(state, config, NOW);

      expect(state.devices['0x005'].alerts.offline).toBe(false);
      expect(state.devices['0x005'].alerts.offline_recovered_at).toBe(NOW.toISOString());
      expect(result.transitions).toHaveLength(1);
      expect(result.transitions[0]).toMatchObject({
        type: 'offline',
        transition: 'recovery',
        ieee: '0x005',
      });
      expect(result.transitions[0].detail).toMatch(/seen again/);
    });
  });

  describe('battery evaluation (ALRT-02, DEVT-03)', () => {
    test('flags battery-powered device with battery at threshold', () => {
      const state = makeState({
        '0x010': makeDevice({ battery: 25 }), // exactly at threshold
      });
      const config = makeConfig();
      const result = evaluateDevices(state, config, NOW);

      expect(state.devices['0x010'].alerts.battery).toBe(true);
      expect(state.devices['0x010'].alerts.battery_sent_at).toBe(NOW.toISOString());
      expect(result.transitions).toContainEqual(
        expect.objectContaining({
          type: 'battery',
          transition: 'alert',
          ieee: '0x010',
        })
      );
    });

    test('flags battery-powered device with battery below threshold', () => {
      const state = makeState({
        '0x011': makeDevice({ battery: 12 }),
      });
      const config = makeConfig();
      const result = evaluateDevices(state, config, NOW);

      expect(state.devices['0x011'].alerts.battery).toBe(true);
      expect(result.transitions).toContainEqual(
        expect.objectContaining({ type: 'battery', transition: 'alert' })
      );
      expect(result.transitions.find(t => t.type === 'battery').detail).toMatch(/battery at 12%/);
    });

    test('does NOT flag battery-powered device with null battery', () => {
      const state = makeState({
        '0x012': makeDevice({ battery: null }),
      });
      const config = makeConfig();
      const result = evaluateDevices(state, config, NOW);

      expect(state.devices['0x012'].alerts.battery).toBe(false);
      // Should have no battery transitions
      const batteryTransitions = result.transitions.filter(t => t.type === 'battery');
      expect(batteryTransitions).toHaveLength(0);
    });

    test('does NOT flag non-battery device even with battery field', () => {
      const state = makeState({
        '0x013': makeDevice({
          power_source: 'Mains (single phase)',
          battery: 10, // low but irrelevant
        }),
      });
      const config = makeConfig();
      const result = evaluateDevices(state, config, NOW);

      expect(state.devices['0x013'].alerts.battery).toBe(false);
    });

    test('suppresses duplicate battery alert (ALRT-03)', () => {
      const state = makeState({
        '0x014': makeDevice({
          battery: 15,
          alerts: {
            offline: false,
            offline_sent_at: null,
            battery: true,
            battery_sent_at: '2026-03-14T12:00:00.000Z',
          },
        }),
      });
      const config = makeConfig();
      const result = evaluateDevices(state, config, NOW);

      expect(state.devices['0x014'].alerts.battery).toBe(true);
      const batteryTransitions = result.transitions.filter(t => t.type === 'battery');
      expect(batteryTransitions).toHaveLength(0);
    });

    test('battery recovery requires exceeding threshold + hysteresis (strict >)', () => {
      // Battery at 30% with threshold 25% + hysteresis 5 = 30. Must be > 30 to clear.
      const state = makeState({
        '0x015': makeDevice({
          battery: 30,
          alerts: {
            offline: false,
            offline_sent_at: null,
            battery: true,
            battery_sent_at: '2026-03-14T12:00:00.000Z',
          },
        }),
      });
      const config = makeConfig();
      const result = evaluateDevices(state, config, NOW);

      // 30 is NOT > 30, so alert stays
      expect(state.devices['0x015'].alerts.battery).toBe(true);
      const batteryTransitions = result.transitions.filter(t => t.type === 'battery');
      expect(batteryTransitions).toHaveLength(0);
    });

    test('battery recovery when battery exceeds threshold + hysteresis', () => {
      const state = makeState({
        '0x016': makeDevice({
          battery: 31, // > 25 + 5 = 30
          alerts: {
            offline: false,
            offline_sent_at: null,
            battery: true,
            battery_sent_at: '2026-03-14T12:00:00.000Z',
          },
        }),
      });
      const config = makeConfig();
      const result = evaluateDevices(state, config, NOW);

      expect(state.devices['0x016'].alerts.battery).toBe(false);
      expect(state.devices['0x016'].alerts.battery_recovered_at).toBe(NOW.toISOString());
      expect(result.transitions).toContainEqual(
        expect.objectContaining({
          type: 'battery',
          transition: 'recovery',
          ieee: '0x016',
        })
      );
    });

    test('battery recovery with null battery does NOT clear alert', () => {
      const state = makeState({
        '0x017': makeDevice({
          battery: null,
          alerts: {
            offline: false,
            offline_sent_at: null,
            battery: true,
            battery_sent_at: '2026-03-14T12:00:00.000Z',
          },
        }),
      });
      const config = makeConfig();
      const result = evaluateDevices(state, config, NOW);

      // Null battery can't prove recovery
      expect(state.devices['0x017'].alerts.battery).toBe(true);
    });
  });

  describe('exclusions (ALRT-05)', () => {
    test('skips device matching IEEE address (case-insensitive)', () => {
      const state = makeState({
        '0x00158d0001a2b3c4': makeDevice({ last_seen: null }),
      });
      const config = makeConfig({ exclusions: ['0x00158D0001A2B3C4'] }); // uppercase
      const result = evaluateDevices(state, config, NOW);

      // Should not be flagged offline despite null last_seen
      expect(state.devices['0x00158d0001a2b3c4'].alerts.offline).toBe(false);
      expect(result.excludedCount).toBe(1);
      expect(result.transitions).toHaveLength(0);
    });

    test('skips device matching friendly_name (case-insensitive)', () => {
      const state = makeState({
        '0x020': makeDevice({
          friendly_name: 'Kitchen Door',
          last_seen: null,
        }),
      });
      const config = makeConfig({ exclusions: ['kitchen door'] }); // lowercase
      const result = evaluateDevices(state, config, NOW);

      expect(state.devices['0x020'].alerts.offline).toBe(false);
      expect(result.excludedCount).toBe(1);
    });

    test('excluded devices have no state mutations', () => {
      const originalAlerts = {
        offline: false,
        offline_sent_at: null,
        battery: false,
        battery_sent_at: null,
      };
      const state = makeState({
        '0x021': makeDevice({
          last_seen: null,
          battery: 5,
          alerts: { ...originalAlerts },
        }),
      });
      const config = makeConfig({ exclusions: ['0x021'] });
      evaluateDevices(state, config, NOW);

      expect(state.devices['0x021'].alerts).toEqual(originalAlerts);
    });

    test('excluded count tracked in summary', () => {
      const state = makeState({
        '0x030': makeDevice(),
        '0x031': makeDevice({ friendly_name: 'Excluded1' }),
        '0x032': makeDevice({ friendly_name: 'Excluded2' }),
      });
      const config = makeConfig({ exclusions: ['Excluded1', 'Excluded2'] });
      const result = evaluateDevices(state, config, NOW);

      expect(result.excludedCount).toBe(2);
      expect(result.summary.excluded).toBe(2);
      expect(result.summary.evaluated).toBe(1);
    });
  });

  describe('summary and state mutations', () => {
    test('returns correct summary shape', () => {
      const state = makeState({
        '0x040': makeDevice({ last_seen: '2026-03-13T10:00:00.000Z' }), // offline
        '0x041': makeDevice({ last_seen: '2026-03-15T11:00:00.000Z', battery: 10 }), // low battery, seen recently
        '0x042': makeDevice({ last_seen: '2026-03-15T11:00:00.000Z' }), // healthy, seen recently
      });
      const config = makeConfig();
      const result = evaluateDevices(state, config, NOW);

      expect(result.summary).toEqual({
        total_devices: 3,
        excluded: 0,
        evaluated: 3,
        alerts: {
          offline: 1,
          battery: 1,
          total: 2,
        },
        transitions: {
          new_alerts: 2,
          recoveries: 0,
        },
      });
    });

    test('sets state.last_evaluation', () => {
      const state = makeState({});
      const config = makeConfig();
      evaluateDevices(state, config, NOW);

      expect(state.last_evaluation).toBe(NOW.toISOString());
    });

    test('sets state.evaluation_summary', () => {
      const state = makeState({});
      const config = makeConfig();
      evaluateDevices(state, config, NOW);

      expect(state.evaluation_summary).toBeDefined();
      expect(state.evaluation_summary.total_devices).toBe(0);
    });

    test('appends transitions to state.pending_notifications', () => {
      const state = makeState({
        '0x050': makeDevice({ last_seen: null }), // will trigger offline alert
      });
      const config = makeConfig();
      evaluateDevices(state, config, NOW);

      expect(state.pending_notifications).toHaveLength(1);
      expect(state.pending_notifications[0].type).toBe('offline');
    });

    test('preserves existing pending_notifications', () => {
      const state = makeState({
        '0x051': makeDevice({ last_seen: null }),
      });
      state.pending_notifications = [{ type: 'offline', ieee: '0x000', existing: true }];
      const config = makeConfig();
      evaluateDevices(state, config, NOW);

      expect(state.pending_notifications).toHaveLength(2);
      expect(state.pending_notifications[0].existing).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('empty state.devices returns zero counts', () => {
      const state = makeState({});
      const config = makeConfig();
      const result = evaluateDevices(state, config, NOW);

      expect(result.transitions).toHaveLength(0);
      expect(result.summary.total_devices).toBe(0);
      expect(result.excludedCount).toBe(0);
    });

    test('handles legacy state without recovered_at fields', () => {
      const state = makeState({
        '0x060': makeDevice({
          last_seen: '2026-03-15T11:00:00.000Z', // within threshold
          alerts: {
            offline: true,
            offline_sent_at: '2026-03-14T12:00:00.000Z',
            // no offline_recovered_at field at all
            battery: false,
            battery_sent_at: null,
            // no battery_recovered_at field at all
          },
        }),
      });
      const config = makeConfig();

      // Should not crash, should produce recovery
      const result = evaluateDevices(state, config, NOW);
      expect(state.devices['0x060'].alerts.offline).toBe(false);
      expect(state.devices['0x060'].alerts.offline_recovered_at).toBe(NOW.toISOString());
    });

    test('handles missing config.THRESHOLDS gracefully with defaults', () => {
      const state = makeState({
        '0x070': makeDevice({ last_seen: '2026-03-14T10:00:00.000Z' }),
      });
      const config = { EXCLUSIONS: { devices: [] } }; // no THRESHOLDS
      const result = evaluateDevices(state, config, NOW);

      // Should use defaults (24h offline, 25% battery)
      expect(state.devices['0x070'].alerts.offline).toBe(true);
    });

    test('both offline and battery transitions for same device', () => {
      const state = makeState({
        '0x080': makeDevice({
          last_seen: '2026-03-13T10:00:00.000Z', // > 24h ago
          battery: 10, // below 25%
        }),
      });
      const config = makeConfig();
      const result = evaluateDevices(state, config, NOW);

      expect(state.devices['0x080'].alerts.offline).toBe(true);
      expect(state.devices['0x080'].alerts.battery).toBe(true);
      expect(result.transitions).toHaveLength(2);
      expect(result.transitions.map(t => t.type).sort()).toEqual(['battery', 'offline']);
    });

    test('device at exactly offline threshold boundary is not flagged', () => {
      // Exactly 24 hours ago
      const state = makeState({
        '0x090': makeDevice({ last_seen: '2026-03-14T12:00:00.000Z' }),
      });
      const config = makeConfig({ offline_hours: 24 });
      const result = evaluateDevices(state, config, NOW);

      // 24h exactly -- not EXCEEDING threshold, so should not alert
      expect(state.devices['0x090'].alerts.offline).toBe(false);
    });

    test('transition detail format for offline alert', () => {
      const state = makeState({
        '0x100': makeDevice({ last_seen: '2026-03-14T10:00:00.000Z' }), // 26h ago
      });
      const config = makeConfig();
      const result = evaluateDevices(state, config, NOW);

      expect(result.transitions[0].detail).toMatch(/not seen for 26\.0 hours/);
      expect(result.transitions[0].timestamp).toBe(NOW.toISOString());
    });

    test('transition detail format for battery alert', () => {
      const state = makeState({
        '0x101': makeDevice({ battery: 12 }),
      });
      const config = makeConfig();
      const result = evaluateDevices(state, config, NOW);

      const batteryTrans = result.transitions.find(t => t.type === 'battery');
      expect(batteryTrans.detail).toBe('battery at 12% (threshold: 25%)');
    });

    test('transition detail format for offline recovery', () => {
      const state = makeState({
        '0x102': makeDevice({
          last_seen: '2026-03-15T11:00:00.000Z',
          alerts: {
            offline: true,
            offline_sent_at: '2026-03-14T00:00:00.000Z', // was alerted 36h ago
            battery: false,
            battery_sent_at: null,
          },
        }),
      });
      const config = makeConfig();
      const result = evaluateDevices(state, config, NOW);

      const recov = result.transitions.find(t => t.transition === 'recovery');
      expect(recov.detail).toMatch(/seen again/);
    });

    test('transition detail format for battery recovery', () => {
      const state = makeState({
        '0x103': makeDevice({
          battery: 31,
          alerts: {
            offline: false,
            offline_sent_at: null,
            battery: true,
            battery_sent_at: '2026-03-14T12:00:00.000Z',
          },
        }),
      });
      const config = makeConfig();
      const result = evaluateDevices(state, config, NOW);

      const recov = result.transitions.find(t => t.transition === 'recovery');
      expect(recov.detail).toMatch(/battery recovered to 31%/);
    });
  });
});
