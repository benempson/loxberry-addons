'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { readConfig } = require('../bin/lib/config');

describe('INI round-trip (PHP Config_Lite format)', () => {
  let tmpDir;
  let tmpCfg;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ini-rt-'));
    tmpCfg = path.join(tmpDir, 'watchdog.cfg');
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpCfg); } catch {}
    try { fs.rmdirSync(tmpDir); } catch {}
  });

  test('full INI with all sections and fields is correctly parsed', () => {
    // Config_Lite writes "key = value" with spaces around =
    const ini = [
      '[Z2M]',
      'z2m_data_path = /opt/zigbee2mqtt/data',
      '',
      '[THRESHOLDS]',
      'offline_hours = 48',
      'battery_pct = 20',
      '',
      '[CRON]',
      'interval_minutes = 30',
      '',
      '[NOTIFICATIONS]',
      'loxberry_enabled = 1',
      'email_enabled = 1',
      'smtp_host = smtp.example.com',
      'smtp_port = 465',
      'smtp_user = alerts@example.com',
      'smtp_pass = s3cret',
      'smtp_from = alerts@example.com',
      'smtp_to = admin@example.com',
      'heartbeat_enabled = 0',
      '',
      '[EXCLUSIONS]',
      'devices = 0x00158d0001a2b3c4, 0x00158d0001a2b3c5',
    ].join('\n');

    fs.writeFileSync(tmpCfg, ini);
    const config = readConfig(tmpCfg);

    expect(config.Z2M.z2m_data_path).toBe('/opt/zigbee2mqtt/data');

    expect(config.THRESHOLDS.offline_hours).toBe(48);
    expect(config.THRESHOLDS.battery_pct).toBe(20);

    expect(config.CRON.interval_minutes).toBe(30);

    expect(config.NOTIFICATIONS.loxberry_enabled).toBe(true);
    expect(config.NOTIFICATIONS.email_enabled).toBe(true);
    expect(config.NOTIFICATIONS.smtp_host).toBe('smtp.example.com');
    expect(config.NOTIFICATIONS.smtp_port).toBe(465);
    expect(config.NOTIFICATIONS.smtp_user).toBe('alerts@example.com');
    expect(config.NOTIFICATIONS.smtp_pass).toBe('s3cret');
    expect(config.NOTIFICATIONS.smtp_from).toBe('alerts@example.com');
    expect(config.NOTIFICATIONS.smtp_to).toBe('admin@example.com');
    expect(config.NOTIFICATIONS.heartbeat_enabled).toBe(false);

    expect(config.EXCLUSIONS.devices).toEqual([
      '0x00158d0001a2b3c4',
      '0x00158d0001a2b3c5',
    ]);
  });

  test('boolean fields written as 0/1 are correctly coerced', () => {
    const ini = [
      '[NOTIFICATIONS]',
      'loxberry_enabled = 0',
      'email_enabled = 1',
      'heartbeat_enabled = 1',
    ].join('\n');

    fs.writeFileSync(tmpCfg, ini);
    const config = readConfig(tmpCfg);

    expect(config.NOTIFICATIONS.loxberry_enabled).toBe(false);
    expect(config.NOTIFICATIONS.email_enabled).toBe(true);
    expect(config.NOTIFICATIONS.heartbeat_enabled).toBe(true);
  });

  test('numeric fields written as string digits are correctly coerced to integers', () => {
    const ini = [
      '[THRESHOLDS]',
      'offline_hours = 72',
      'battery_pct = 10',
      '',
      '[CRON]',
      'interval_minutes = 15',
      '',
      '[NOTIFICATIONS]',
      'smtp_port = 25',
    ].join('\n');

    fs.writeFileSync(tmpCfg, ini);
    const config = readConfig(tmpCfg);

    expect(typeof config.THRESHOLDS.offline_hours).toBe('number');
    expect(config.THRESHOLDS.offline_hours).toBe(72);
    expect(typeof config.THRESHOLDS.battery_pct).toBe('number');
    expect(config.THRESHOLDS.battery_pct).toBe(10);
    expect(typeof config.CRON.interval_minutes).toBe('number');
    expect(config.CRON.interval_minutes).toBe(15);
    expect(typeof config.NOTIFICATIONS.smtp_port).toBe('number');
    expect(config.NOTIFICATIONS.smtp_port).toBe(25);
  });

  test('EXCLUSIONS.devices as comma-separated IEEE addresses is parsed to array', () => {
    const ini = [
      '[EXCLUSIONS]',
      'devices = 0x00158d0001a2b3c4, 0x00158d0001a2b3c5, 0x00158d0001a2b3c6',
    ].join('\n');

    fs.writeFileSync(tmpCfg, ini);
    const config = readConfig(tmpCfg);

    expect(Array.isArray(config.EXCLUSIONS.devices)).toBe(true);
    expect(config.EXCLUSIONS.devices).toEqual([
      '0x00158d0001a2b3c4',
      '0x00158d0001a2b3c5',
      '0x00158d0001a2b3c6',
    ]);
  });

  test('empty EXCLUSIONS.devices produces empty array', () => {
    const ini = [
      '[EXCLUSIONS]',
      'devices =',
    ].join('\n');

    fs.writeFileSync(tmpCfg, ini);
    const config = readConfig(tmpCfg);

    expect(Array.isArray(config.EXCLUSIONS.devices)).toBe(true);
    expect(config.EXCLUSIONS.devices).toEqual([]);
  });

  test('special characters in SMTP password survive round-trip when quoted', () => {
    // ini@5.x treats ; as inline comment. PHP must double-quote values with special chars.
    // Config_Lite quotes values containing = or ; automatically.
    const specialPass = 'p@ss=w0rd;with special&chars!';
    const ini = [
      '[NOTIFICATIONS]',
      `smtp_pass = "${specialPass}"`,
    ].join('\n');

    fs.writeFileSync(tmpCfg, ini);
    const config = readConfig(tmpCfg);

    expect(config.NOTIFICATIONS.smtp_pass).toBe(specialPass);
  });

  test('unquoted semicolon in value is truncated by ini parser (documents limitation)', () => {
    // This documents the known limitation: unquoted ; is treated as comment start
    const ini = [
      '[NOTIFICATIONS]',
      'smtp_pass = p@ss;word',
    ].join('\n');

    fs.writeFileSync(tmpCfg, ini);
    const config = readConfig(tmpCfg);

    // ini@5.x strips everything after unquoted ;
    expect(config.NOTIFICATIONS.smtp_pass).toBe('p@ss');
  });
});
