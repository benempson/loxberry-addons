'use strict';

const EventEmitter = require('events');

// Mock mqtt module
jest.mock('mqtt', () => {
  const createMockClient = () => {
    const client = new EventEmitter();
    client.subscribe = jest.fn();
    client.end = jest.fn();
    return client;
  };

  return {
    connect: jest.fn(() => createMockClient()),
    _createMockClient: createMockClient,
  };
});

const mqtt = require('mqtt');
const { collectMessages } = require('../bin/lib/mqtt-collector');

const BASE_CONFIG = {
  host: '192.168.1.100',
  port: 1883,
  base_topic: 'zigbee2mqtt',
  username: 'user1',
  password: 'pass1',
  drain_seconds: 1,
};

describe('collectMessages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('connects with correct options', () => {
    const promise = collectMessages(BASE_CONFIG);
    expect(mqtt.connect).toHaveBeenCalledWith('mqtt://192.168.1.100:1883', {
      username: 'user1',
      password: 'pass1',
      connectTimeout: 5000,
      reconnectPeriod: 0,
      clean: true,
    });
    // Clean up: emit error to reject promise and avoid unhandled rejection
    const client = mqtt.connect.mock.results[0].value;
    client.emit('error', new Error('cleanup'));
    return promise.catch(() => {});
  });

  test('omits credentials when username/password are empty', () => {
    const config = { ...BASE_CONFIG, username: '', password: '' };
    const promise = collectMessages(config);
    expect(mqtt.connect).toHaveBeenCalledWith('mqtt://192.168.1.100:1883', {
      username: undefined,
      password: undefined,
      connectTimeout: 5000,
      reconnectPeriod: 0,
      clean: true,
    });
    const client = mqtt.connect.mock.results[0].value;
    client.emit('error', new Error('cleanup'));
    return promise.catch(() => {});
  });

  test('subscribes to base_topic/# after connect', () => {
    const promise = collectMessages(BASE_CONFIG);
    const client = mqtt.connect.mock.results[0].value;

    // Emit connect event
    client.emit('connect');

    expect(client.subscribe).toHaveBeenCalledWith(
      'zigbee2mqtt/#',
      { qos: 0 },
      expect.any(Function)
    );

    // Call subscribe callback with success
    const subscribeCb = client.subscribe.mock.calls[0][2];
    subscribeCb(null);

    // Clean up
    client.emit('error', new Error('cleanup'));
    return promise.catch(() => {});
  });

  test('collects JSON messages into Map by topic', async () => {
    const promise = collectMessages(BASE_CONFIG);
    const client = mqtt.connect.mock.results[0].value;

    // Connect and subscribe
    client.emit('connect');
    const subscribeCb = client.subscribe.mock.calls[0][2];
    subscribeCb(null);

    // Emit messages
    client.emit('message', 'zigbee2mqtt/living_room', Buffer.from('{"state":"ON"}'));
    client.emit('message', 'zigbee2mqtt/kitchen', Buffer.from('{"temperature":22.5}'));

    // Set up end to call callback
    client.end.mockImplementation((force, opts, cb) => {
      if (typeof opts === 'function') cb = opts;
      if (typeof cb === 'function') cb();
    });

    // Advance timer past drain window
    jest.advanceTimersByTime(1000);

    const result = await promise;
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(2);
    expect(result.get('zigbee2mqtt/living_room')).toEqual({ state: 'ON' });
    expect(result.get('zigbee2mqtt/kitchen')).toEqual({ temperature: 22.5 });
  });

  test('skips non-JSON payloads without crashing', async () => {
    const promise = collectMessages(BASE_CONFIG);
    const client = mqtt.connect.mock.results[0].value;

    client.emit('connect');
    const subscribeCb = client.subscribe.mock.calls[0][2];
    subscribeCb(null);

    // Emit valid and invalid messages
    client.emit('message', 'zigbee2mqtt/sensor1', Buffer.from('{"ok":true}'));
    client.emit('message', 'zigbee2mqtt/sensor2', Buffer.from('not json at all'));
    client.emit('message', 'zigbee2mqtt/sensor3', Buffer.from(''));

    client.end.mockImplementation((force, opts, cb) => {
      if (typeof opts === 'function') cb = opts;
      if (typeof cb === 'function') cb();
    });

    jest.advanceTimersByTime(1000);

    const result = await promise;
    expect(result.size).toBe(1);
    expect(result.get('zigbee2mqtt/sensor1')).toEqual({ ok: true });
  });

  test('resolves after drain_seconds with collected messages', async () => {
    const config = { ...BASE_CONFIG, drain_seconds: 2 };
    const promise = collectMessages(config);
    const client = mqtt.connect.mock.results[0].value;

    client.emit('connect');
    const subscribeCb = client.subscribe.mock.calls[0][2];
    subscribeCb(null);

    client.end.mockImplementation((force, opts, cb) => {
      if (typeof opts === 'function') cb = opts;
      if (typeof cb === 'function') cb();
    });

    // Not resolved yet at 1 second
    jest.advanceTimersByTime(1000);
    expect(client.end).not.toHaveBeenCalled();

    // Resolved at 2 seconds
    jest.advanceTimersByTime(1000);
    expect(client.end).toHaveBeenCalled();

    const result = await promise;
    expect(result).toBeInstanceOf(Map);
  });

  test('rejects on connection error', async () => {
    const promise = collectMessages(BASE_CONFIG);
    const client = mqtt.connect.mock.results[0].value;

    client.end.mockImplementation((force, opts, cb) => {
      if (typeof opts === 'function') cb = opts;
      if (typeof cb === 'function') cb();
    });

    client.emit('error', new Error('Connection refused'));

    await expect(promise).rejects.toThrow('Connection refused');
  });

  test('rejects on subscribe error', async () => {
    const promise = collectMessages(BASE_CONFIG);
    const client = mqtt.connect.mock.results[0].value;

    client.emit('connect');

    client.end.mockImplementation((force, opts, cb) => {
      if (typeof opts === 'function') cb = opts;
      if (typeof cb === 'function') cb();
    });

    // Call subscribe callback with error
    const subscribeCb = client.subscribe.mock.calls[0][2];
    subscribeCb(new Error('Subscribe failed'));

    await expect(promise).rejects.toThrow('Subscribe failed');
  });
});
