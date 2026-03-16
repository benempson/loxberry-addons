'use strict';

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

const { execSync } = require('child_process');

// Must require after mock
const { sendLoxberryNotification } = require('../bin/lib/loxberry-notify');

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.LBHOMEDIR;
});

describe('sendLoxberryNotification', () => {
  test('constructs correct command for info severity (default)', () => {
    sendLoxberryNotification('Device went offline');

    expect(execSync).toHaveBeenCalledTimes(1);
    const cmd = execSync.mock.calls[0][0];
    expect(cmd).toContain('. /opt/loxberry/libs/bashlib/notify.sh');
    expect(cmd).toContain('notify zigbee_watchdog watchdog');
    expect(cmd).toContain('Device went offline');
    expect(cmd).not.toMatch(/ err$/);
  });

  test('constructs correct command for error severity', () => {
    sendLoxberryNotification('Critical failure', 'err');

    const cmd = execSync.mock.calls[0][0];
    expect(cmd).toMatch(/ err$/);
  });

  test('uses LBHOMEDIR env var when set', () => {
    process.env.LBHOMEDIR = '/custom/path';
    sendLoxberryNotification('test message');

    const cmd = execSync.mock.calls[0][0];
    expect(cmd).toContain('. /custom/path/libs/bashlib/notify.sh');
    expect(cmd).not.toContain('/opt/loxberry');
  });

  test('sanitizes double quotes in message', () => {
    sendLoxberryNotification('living room "light"');

    const cmd = execSync.mock.calls[0][0];
    expect(cmd).not.toContain('"light"');
    // Double quotes replaced with single quotes
    expect(cmd).toContain("living room 'light'");
  });

  test('sanitizes backticks in message', () => {
    sendLoxberryNotification('sensor `test`');

    const cmd = execSync.mock.calls[0][0];
    expect(cmd).not.toContain('`');
  });

  test('sanitizes dollar signs in message', () => {
    sendLoxberryNotification('sensor$1 offline');

    const cmd = execSync.mock.calls[0][0];
    expect(cmd).not.toContain('$');
  });

  test('sanitizes backslashes in message', () => {
    sendLoxberryNotification('path\\to\\device');

    const cmd = execSync.mock.calls[0][0];
    expect(cmd).not.toContain('\\');
  });

  test('passes correct options to execSync', () => {
    sendLoxberryNotification('test');

    const opts = execSync.mock.calls[0][1];
    expect(opts).toEqual({
      shell: '/bin/bash',
      timeout: 5000,
      stdio: 'pipe',
    });
  });

  test('propagates error when execSync throws', () => {
    execSync.mockImplementation(() => {
      throw new Error('Command failed');
    });

    expect(() => sendLoxberryNotification('test')).toThrow('Command failed');
  });
});
