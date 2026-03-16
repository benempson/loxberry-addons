'use strict';

const path = require('path');

// Mock child_process and fs before requiring the module
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

// We need a partial mock of fs -- only mock statSync, keep the rest real
const realFs = jest.requireActual('fs');
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    statSync: jest.fn(),
  };
});

const { execSync } = require('child_process');
const fs = require('fs');
const { checkBridgeState } = require('../bin/lib/bridge-monitor');

const NOW = new Date('2026-03-15T12:00:00.000Z');
const Z2M_PATH = '/opt/zigbee2mqtt/data';
const FRESH_MTIME = new Date('2026-03-15T11:55:00.000Z'); // 5 min ago = fresh
const STALE_MTIME = new Date('2026-03-15T11:40:00.000Z'); // 20 min ago = stale

function mockSystemctlActive() {
  execSync.mockReturnValue('active\n');
}

function mockSystemctlInactive() {
  execSync.mockReturnValue('inactive\n');
}

function mockSystemctlError() {
  execSync.mockImplementation(() => { throw new Error('Unit zigbee2mqtt.service not found'); });
}

function mockFreshMtime() {
  fs.statSync.mockReturnValue({ mtime: FRESH_MTIME });
}

function mockStaleMtime() {
  fs.statSync.mockReturnValue({ mtime: STALE_MTIME });
}

function mockStatError() {
  fs.statSync.mockImplementation(() => { throw new Error('ENOENT'); });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('checkBridgeState', () => {
  describe('online -> offline transition', () => {
    test('returns offline transition when systemctl inactive', () => {
      const state = { bridge_online: true };
      mockSystemctlInactive();
      mockFreshMtime();

      const result = checkBridgeState(Z2M_PATH, state, NOW);

      expect(result).toEqual({
        type: 'bridge',
        transition: 'offline',
        timestamp: NOW.toISOString(),
      });
      expect(state.bridge_online).toBe(false);
      expect(state.bridge_offline_since).toBe(NOW.toISOString());
    });

    test('returns offline transition when systemctl throws (service not found)', () => {
      const state = { bridge_online: true };
      mockSystemctlError();
      mockFreshMtime();

      const result = checkBridgeState(Z2M_PATH, state, NOW);

      expect(result).toEqual({
        type: 'bridge',
        transition: 'offline',
        timestamp: NOW.toISOString(),
      });
      expect(state.bridge_online).toBe(false);
    });

    test('returns offline transition when systemctl active but state.json stale', () => {
      const state = { bridge_online: true };
      mockSystemctlActive();
      mockStaleMtime();

      const result = checkBridgeState(Z2M_PATH, state, NOW);

      expect(result).toEqual({
        type: 'bridge',
        transition: 'offline',
        timestamp: NOW.toISOString(),
      });
      expect(state.bridge_online).toBe(false);
    });
  });

  describe('offline -> online transition', () => {
    test('returns online transition with offlineSince detail', () => {
      const offlineSince = '2026-03-15T10:00:00.000Z';
      const state = { bridge_online: false, bridge_offline_since: offlineSince };
      mockSystemctlActive();
      mockFreshMtime();

      const result = checkBridgeState(Z2M_PATH, state, NOW);

      expect(result).toEqual({
        type: 'bridge',
        transition: 'online',
        detail: offlineSince,
        timestamp: NOW.toISOString(),
      });
      expect(state.bridge_online).toBe(true);
      expect(state.bridge_offline_since).toBeNull();
    });
  });

  describe('no state change', () => {
    test('online -> online returns null', () => {
      const state = { bridge_online: true };
      mockSystemctlActive();
      mockFreshMtime();

      const result = checkBridgeState(Z2M_PATH, state, NOW);

      expect(result).toBeNull();
      expect(state.bridge_online).toBe(true);
    });

    test('offline -> offline returns null', () => {
      const state = { bridge_online: false, bridge_offline_since: '2026-03-15T08:00:00.000Z' };
      mockSystemctlInactive();
      mockFreshMtime();

      const result = checkBridgeState(Z2M_PATH, state, NOW);

      expect(result).toBeNull();
      expect(state.bridge_online).toBe(false);
      expect(state.bridge_offline_since).toBe('2026-03-15T08:00:00.000Z');
    });
  });

  describe('first run (bridge_online undefined)', () => {
    test('defaults to wasOnline=true, detects offline', () => {
      const state = {};
      mockSystemctlInactive();
      mockFreshMtime();

      const result = checkBridgeState(Z2M_PATH, state, NOW);

      expect(result).toEqual({
        type: 'bridge',
        transition: 'offline',
        timestamp: NOW.toISOString(),
      });
      expect(state.bridge_online).toBe(false);
    });

    test('defaults to wasOnline=true, stays online (no transition)', () => {
      const state = {};
      mockSystemctlActive();
      mockFreshMtime();

      const result = checkBridgeState(Z2M_PATH, state, NOW);

      expect(result).toBeNull();
      expect(state.bridge_online).toBe(true);
    });
  });

  describe('state.json stat errors', () => {
    test('treats stat error as offline even if systemctl active', () => {
      const state = { bridge_online: true };
      mockSystemctlActive();
      mockStatError();

      const result = checkBridgeState(Z2M_PATH, state, NOW);

      expect(result).toEqual({
        type: 'bridge',
        transition: 'offline',
        timestamp: NOW.toISOString(),
      });
      expect(state.bridge_online).toBe(false);
    });
  });

  describe('freshness threshold', () => {
    test('custom freshness threshold (5 minutes)', () => {
      const state = { bridge_online: true };
      mockSystemctlActive();
      // 5 min ago mtime, with 5 min threshold = exactly at boundary, treat as fresh
      fs.statSync.mockReturnValue({ mtime: new Date('2026-03-15T11:55:00.000Z') });

      const result = checkBridgeState(Z2M_PATH, state, NOW, 5);

      // 5 min ago with 5 min threshold = not stale (<=)
      expect(result).toBeNull();
      expect(state.bridge_online).toBe(true);
    });

    test('custom freshness threshold triggers offline when exceeded', () => {
      const state = { bridge_online: true };
      mockSystemctlActive();
      // 6 min ago mtime with 5 min threshold = stale
      fs.statSync.mockReturnValue({ mtime: new Date('2026-03-15T11:54:00.000Z') });

      const result = checkBridgeState(Z2M_PATH, state, NOW, 5);

      expect(result).toEqual({
        type: 'bridge',
        transition: 'offline',
        timestamp: NOW.toISOString(),
      });
    });
  });

  describe('now parameter', () => {
    test('defaults to current time when not provided', () => {
      const state = { bridge_online: true };
      mockSystemctlInactive();
      mockFreshMtime();

      const before = new Date();
      const result = checkBridgeState(Z2M_PATH, state);
      const after = new Date();

      expect(result.timestamp).toBeDefined();
      const ts = new Date(result.timestamp);
      expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(ts.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
