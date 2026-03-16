'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'watchdog.cfg');

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

  test('returns object with all expected sections (Z2M instead of MQTT)', () => {
    const config = readConfig(FIXTURE_PATH);
    expect(config).toHaveProperty('Z2M');
    expect(config).toHaveProperty('THRESHOLDS');
    expect(config).toHaveProperty('CRON');
    expect(config).toHaveProperty('NOTIFICATIONS');
    expect(config).toHaveProperty('EXCLUSIONS');
    expect(config).not.toHaveProperty('MQTT');
  });

  test('parses Z2M section with correct values', () => {
    const config = readConfig(FIXTURE_PATH);
    expect(config.Z2M.z2m_data_path).toBe('/opt/zigbee2mqtt/data');
  });

  test('coerces numeric fields to numbers', () => {
    const config = readConfig(FIXTURE_PATH);
    expect(config.THRESHOLDS.offline_hours).toBe(24);
    expect(config.THRESHOLDS.battery_pct).toBe(25);
    expect(config.CRON.interval_minutes).toBe(60);
    expect(config.NOTIFICATIONS.smtp_port).toBe(587);
  });

  test('CRON section does not have drain_seconds', () => {
    const config = readConfig(FIXTURE_PATH);
    expect(config.CRON).not.toHaveProperty('drain_seconds');
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
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    const tmpCfg = path.join(tmpDir, 'minimal.cfg');
    fs.writeFileSync(tmpCfg, '[Z2M]\nz2m_data_path = /custom/path\n');
    try {
      const config = readConfig(tmpCfg);
      expect(config.Z2M.z2m_data_path).toBe('/custom/path');
      expect(config.THRESHOLDS.offline_hours).toBe(24);
      expect(config.CRON.interval_minutes).toBe(60);
      expect(config.NOTIFICATIONS.loxberry_enabled).toBe(false);
      expect(config.EXCLUSIONS.devices).toEqual([]);
    } finally {
      fs.unlinkSync(tmpCfg);
      fs.rmdirSync(tmpDir);
    }
  });

  test('throws clear error for nonexistent file', () => {
    expect(() => readConfig('/nonexistent/path/config.cfg')).toThrow(/Cannot read config file/);
    expect(() => readConfig('/nonexistent/path/config.cfg')).toThrow(/config\.cfg/);
  });

  test('returns all defaults for empty file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    const tmpCfg = path.join(tmpDir, 'empty.cfg');
    fs.writeFileSync(tmpCfg, '');
    try {
      const config = readConfig(tmpCfg);
      expect(config.Z2M.z2m_data_path).toBe('');
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
