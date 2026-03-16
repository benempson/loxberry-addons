'use strict';

const { checkBridgeState } = require('../bin/lib/bridge-monitor');

const NOW = new Date('2026-03-15T12:00:00.000Z');
const BASE_TOPIC = 'zigbee2mqtt';

function makeMessages(bridgeState) {
  const map = new Map();
  if (bridgeState !== undefined) {
    map.set(`${BASE_TOPIC}/bridge/state`, bridgeState);
  }
  return map;
}

describe('checkBridgeState', () => {
  describe('online -> offline transition', () => {
    test('returns offline transition and mutates state', () => {
      const state = { bridge_online: true };
      const messages = makeMessages({ state: 'offline' });

      const result = checkBridgeState(messages, BASE_TOPIC, state, NOW);

      expect(result).toEqual({
        type: 'bridge',
        transition: 'offline',
        timestamp: NOW.toISOString(),
      });
      expect(state.bridge_online).toBe(false);
      expect(state.bridge_offline_since).toBe(NOW.toISOString());
    });
  });

  describe('offline -> online transition', () => {
    test('returns online transition with offlineSince detail and clears bridge_offline_since', () => {
      const offlineSince = '2026-03-15T10:00:00.000Z';
      const state = { bridge_online: false, bridge_offline_since: offlineSince };
      const messages = makeMessages({ state: 'online' });

      const result = checkBridgeState(messages, BASE_TOPIC, state, NOW);

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
      const messages = makeMessages({ state: 'online' });

      const result = checkBridgeState(messages, BASE_TOPIC, state, NOW);

      expect(result).toBeNull();
      expect(state.bridge_online).toBe(true);
    });

    test('offline -> offline returns null', () => {
      const state = { bridge_online: false, bridge_offline_since: '2026-03-15T08:00:00.000Z' };
      const messages = makeMessages({ state: 'offline' });

      const result = checkBridgeState(messages, BASE_TOPIC, state, NOW);

      expect(result).toBeNull();
      expect(state.bridge_online).toBe(false);
      // bridge_offline_since should remain unchanged
      expect(state.bridge_offline_since).toBe('2026-03-15T08:00:00.000Z');
    });
  });

  describe('missing bridge/state message', () => {
    test('treats missing topic as offline', () => {
      const state = { bridge_online: true };
      const messages = new Map(); // no bridge/state topic

      const result = checkBridgeState(messages, BASE_TOPIC, state, NOW);

      expect(result).toEqual({
        type: 'bridge',
        transition: 'offline',
        timestamp: NOW.toISOString(),
      });
      expect(state.bridge_online).toBe(false);
    });
  });

  describe('first run (bridge_online undefined)', () => {
    test('defaults to wasOnline=true, detects offline', () => {
      const state = {}; // no bridge_online field
      const messages = makeMessages({ state: 'offline' });

      const result = checkBridgeState(messages, BASE_TOPIC, state, NOW);

      expect(result).toEqual({
        type: 'bridge',
        transition: 'offline',
        timestamp: NOW.toISOString(),
      });
      expect(state.bridge_online).toBe(false);
    });

    test('defaults to wasOnline=true, stays online (no transition)', () => {
      const state = {};
      const messages = makeMessages({ state: 'online' });

      const result = checkBridgeState(messages, BASE_TOPIC, state, NOW);

      expect(result).toBeNull();
      expect(state.bridge_online).toBe(true);
    });
  });

  describe('malformed payloads', () => {
    test('payload without state field is treated as offline', () => {
      const state = { bridge_online: true };
      const messages = makeMessages({ foo: 'bar' });

      const result = checkBridgeState(messages, BASE_TOPIC, state, NOW);

      expect(result).toEqual({
        type: 'bridge',
        transition: 'offline',
        timestamp: NOW.toISOString(),
      });
      expect(state.bridge_online).toBe(false);
    });

    test('non-object payload is treated as offline', () => {
      const state = { bridge_online: true };
      const messages = makeMessages('not an object');

      const result = checkBridgeState(messages, BASE_TOPIC, state, NOW);

      expect(result).toEqual({
        type: 'bridge',
        transition: 'offline',
        timestamp: NOW.toISOString(),
      });
      expect(state.bridge_online).toBe(false);
    });

    test('null payload is treated as offline', () => {
      const state = { bridge_online: true };
      const messages = makeMessages(null);

      const result = checkBridgeState(messages, BASE_TOPIC, state, NOW);

      expect(result).toEqual({
        type: 'bridge',
        transition: 'offline',
        timestamp: NOW.toISOString(),
      });
      expect(state.bridge_online).toBe(false);
    });
  });

  describe('now parameter', () => {
    test('defaults to current time when not provided', () => {
      const state = { bridge_online: true };
      const messages = makeMessages({ state: 'offline' });

      const before = new Date();
      const result = checkBridgeState(messages, BASE_TOPIC, state);
      const after = new Date();

      expect(result.timestamp).toBeDefined();
      const ts = new Date(result.timestamp);
      expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(ts.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
