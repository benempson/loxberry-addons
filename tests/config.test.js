'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'watchdog.cfg');

// Import will fail until config.js exists -- that's expected (RED phase)
let readConfig;
try {
  readConfig = require('../bin/lib/config').readConfig;
} catch {
  // Will be created in GREEN phase
}

describe('readConfig', () => {
  beforeAll(() => {
    if (!readConfig) {
      throw new Error('readConfig not available -- bin/lib/config.js does not exist yet');
    }
  });

  test('returns object with all expected sections', () => {
    const config = readConfig(FIXTURE_PATH);
    expect(config).toHaveProperty('MQTT');
    expect(config).toHaveProperty('THRESHOLDS');
    expect(config).toHaveProperty('CRON');
    expect(config).toHaveProperty('NOTIFICATIONS');
    expect(config).toHaveProperty('EXCLUSIONS');
  });

  test('parses MQTT section with correct values', () => {
    const config = readConfig(FIXTURE_PATH);
    expect(config.MQTT.host).toBe('localhost');
    expect(config.MQTT.base_topic).toBe('zigbee2mqtt');
    expect(config.MQTT.username).toBe('');
    expect(config.MQTT.password).toBe('');
  });

  test('coerces numeric fields to numbers', () => {
    const config = readConfig(FIXTURE_PATH);
    expect(config.MQTT.port).toBe(1883);
    expect(config.THRESHOLDS.offline_hours).toBe(24);
    expect(config.THRESHOLDS.battery_pct).toBe(25);
    expect(config.CRON.interval_minutes).toBe(60);
    expect(config.CRON.drain_seconds).toBe(3);
    expect(config.NOTIFICATIONS.smtp_port).toBe(587);
  });

  test('coerces boolean fields to booleans', () => {
    const config = readConfig(FIXTURE_PATH);
    expect(config.NOTIFICATIONS.loxberry_enabled).toBe(true);
    expect(config.NOTIFICATIONS.email_enabled).toBe(false);
  });

  test('parses EXCLUSIONS.devices as array (empty string -> empty array)', () => {
    const config = readConfig(FIXTURE_PATH);
    expect(Array.isArray(config.EXCLUSIONS.devices)).toBe(true);
    expect(config.EXCLUSIONS.devices).toEqual([]);
  });

  test('parses EXCLUSIONS.devices as comma-separated array', () => {
    // Create a temp config with exclusions
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    const tmpCfg = path.join(tmpDir, 'test.cfg');
    fs.writeFileSync(tmpCfg, '[EXCLUSIONS]\ndevices = sensor_a, sensor_b , sensor_c\n');
    try {
      const config = readConfig(tmpCfg);
      expect(config.EXCLUSIONS.devices).toEqual(['sensor_a', 'sensor_b', 'sensor_c']);
    } finally {
      fs.unlinkSync(tmpCfg);
      fs.rmdirSync(tmpDir);
    }
  });

  test('fills missing keys from defaults', () => {
    // Create a minimal config with only MQTT host
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    const tmpCfg = path.join(tmpDir, 'minimal.cfg');
    fs.writeFileSync(tmpCfg, '[MQTT]\nhost = 192.168.1.50\n');
    try {
      const config = readConfig(tmpCfg);
      // Overridden value
      expect(config.MQTT.host).toBe('192.168.1.50');
      // Defaults
      expect(config.MQTT.port).toBe(1883);
      expect(config.MQTT.base_topic).toBe('zigbee2mqtt');
      expect(config.THRESHOLDS.offline_hours).toBe(24);
      expect(config.CRON.drain_seconds).toBe(3);
      expect(config.NOTIFICATIONS.loxberry_enabled).toBe(false);
      expect(config.EXCLUSIONS.devices).toEqual([]);
    } finally {
      fs.unlinkSync(tmpCfg);
      fs.rmdirSync(tmpDir);
    }
  });

  test('throws clear error for nonexistent file', () => {
    expect(() => readConfig('/nonexistent/path/config.cfg')).toThrow(/config/i);
    expect(() => readConfig('/nonexistent/path/config.cfg')).not.toThrow('ENOENT');
  });

  test('returns all defaults for empty file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    const tmpCfg = path.join(tmpDir, 'empty.cfg');
    fs.writeFileSync(tmpCfg, '');
    try {
      const config = readConfig(tmpCfg);
      expect(config.MQTT.host).toBe('localhost');
      expect(config.MQTT.port).toBe(1883);
      expect(config.THRESHOLDS.offline_hours).toBe(24);
      expect(config.CRON.interval_minutes).toBe(60);
      expect(config.NOTIFICATIONS.loxberry_enabled).toBe(false);
      expect(config.EXCLUSIONS.devices).toEqual([]);
    } finally {
      fs.unlinkSync(tmpCfg);
      fs.rmdirSync(tmpDir);
    }
  });
});
