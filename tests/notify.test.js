'use strict';

jest.mock('../bin/lib/loxberry-notify');
jest.mock('../bin/lib/email-notify');
jest.mock('../bin/lib/email-template');

const { sendLoxberryNotification } = require('../bin/lib/loxberry-notify');
const { sendEmailNotification } = require('../bin/lib/email-notify');
const { buildEmailBody, buildSubject, buildLoxberryMessage, buildHeartbeatBody } = require('../bin/lib/email-template');

let deliverNotifications;
try {
  deliverNotifications = require('../bin/lib/notify').deliverNotifications;
} catch (_) {
  // Module doesn't exist yet in RED phase
}

function makeConfig(overrides = {}) {
  return {
    NOTIFICATIONS: {
      loxberry_enabled: true,
      email_enabled: true,
      heartbeat_enabled: false,
      smtp_host: 'mail.test',
      smtp_port: 587,
      smtp_user: 'u',
      smtp_pass: 'p',
      smtp_from: 'from@test',
      smtp_to: 'to@test',
      ...overrides,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default template mock returns
  buildEmailBody.mockReturnValue({ html: '<h1>alert</h1>', text: 'alert text' });
  buildSubject.mockReturnValue('Zigbee Watchdog: 1 alert');
  buildLoxberryMessage.mockReturnValue('ALERTS:\n  Sensor: OFFLINE');
  buildHeartbeatBody.mockReturnValue({ html: '<p>all clear</p>', text: 'all clear', subject: 'Zigbee Watchdog: All clear' });
  sendLoxberryNotification.mockImplementation(() => {});
  sendEmailNotification.mockResolvedValue({ messageId: 'ok' });
});

describe('deliverNotifications', () => {
  describe('no transitions', () => {
    test('heartbeat off: returns no-transitions, does nothing', async () => {
      const state = { pending_notifications: [] };
      const config = makeConfig({ heartbeat_enabled: false });

      const result = await deliverNotifications(state, config);

      expect(result).toEqual({ sent: false, reason: 'no-transitions' });
      expect(sendLoxberryNotification).not.toHaveBeenCalled();
      expect(sendEmailNotification).not.toHaveBeenCalled();
    });

    test('heartbeat on: sends heartbeat to enabled channels', async () => {
      const state = { pending_notifications: [], evaluation_summary: { total_devices: 10, alerts: { total: 0 }, excluded: 2 } };
      const config = makeConfig({ heartbeat_enabled: true });

      const result = await deliverNotifications(state, config);

      expect(result.sent).toBe(true);
      expect(result.heartbeat).toBe(true);
      expect(buildHeartbeatBody).toHaveBeenCalled();
      expect(sendLoxberryNotification).toHaveBeenCalled();
      expect(sendEmailNotification).toHaveBeenCalled();
    });
  });

  describe('device transitions', () => {
    test('builds messages and sends to both enabled channels', async () => {
      const state = {
        pending_notifications: [
          { type: 'offline', transition: 'alert', ieee: '0x1', friendly_name: 'Sensor A', detail: 'not seen 25h', timestamp: 'T' },
        ],
      };
      const config = makeConfig();

      const result = await deliverNotifications(state, config);

      expect(result.sent).toBe(true);
      expect(buildEmailBody).toHaveBeenCalled();
      expect(buildSubject).toHaveBeenCalled();
      expect(buildLoxberryMessage).toHaveBeenCalled();
      expect(sendLoxberryNotification).toHaveBeenCalled();
      expect(sendEmailNotification).toHaveBeenCalled();
      expect(state.pending_notifications).toEqual([]);
    });
  });

  describe('bridge transitions', () => {
    test('bridge transition sent as separate notification with error severity', async () => {
      const state = {
        pending_notifications: [
          { type: 'bridge', transition: 'offline', timestamp: 'T' },
        ],
      };
      const config = makeConfig();

      await deliverNotifications(state, config);

      // Bridge notification should use 'err' severity for Loxberry
      const loxCalls = sendLoxberryNotification.mock.calls;
      expect(loxCalls.length).toBeGreaterThanOrEqual(1);
      expect(loxCalls[0][1]).toBe('err');
      expect(state.pending_notifications).toEqual([]);
    });

    test('mixed device + bridge: bridge separate, devices batched', async () => {
      const state = {
        pending_notifications: [
          { type: 'bridge', transition: 'offline', timestamp: 'T' },
          { type: 'offline', transition: 'alert', ieee: '0x1', friendly_name: 'Sensor A', detail: 'not seen', timestamp: 'T' },
          { type: 'battery', transition: 'alert', ieee: '0x2', friendly_name: 'Sensor B', detail: 'low', timestamp: 'T' },
        ],
      };
      const config = makeConfig();

      await deliverNotifications(state, config);

      // Loxberry should be called at least twice: once for bridge, once for device batch
      const loxCalls = sendLoxberryNotification.mock.calls;
      expect(loxCalls.length).toBeGreaterThanOrEqual(2);
      // Bridge call has 'err' severity
      const bridgeCall = loxCalls.find(c => c[1] === 'err');
      expect(bridgeCall).toBeDefined();
      expect(state.pending_notifications).toEqual([]);
    });
  });

  describe('channel enable/disable', () => {
    test('loxberry disabled: skip loxberry, still send email', async () => {
      const state = {
        pending_notifications: [
          { type: 'offline', transition: 'alert', ieee: '0x1', friendly_name: 'A', detail: 'd', timestamp: 'T' },
        ],
      };
      const config = makeConfig({ loxberry_enabled: false });

      await deliverNotifications(state, config);

      expect(sendLoxberryNotification).not.toHaveBeenCalled();
      expect(sendEmailNotification).toHaveBeenCalled();
    });

    test('email disabled: skip email, still send loxberry', async () => {
      const state = {
        pending_notifications: [
          { type: 'offline', transition: 'alert', ieee: '0x1', friendly_name: 'A', detail: 'd', timestamp: 'T' },
        ],
      };
      const config = makeConfig({ email_enabled: false });

      await deliverNotifications(state, config);

      expect(sendLoxberryNotification).toHaveBeenCalled();
      expect(sendEmailNotification).not.toHaveBeenCalled();
    });
  });

  describe('error isolation', () => {
    test('loxberry throws: logged, email still sent, pending cleared', async () => {
      sendLoxberryNotification.mockImplementation(() => { throw new Error('shell failed'); });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const state = {
        pending_notifications: [
          { type: 'offline', transition: 'alert', ieee: '0x1', friendly_name: 'A', detail: 'd', timestamp: 'T' },
        ],
      };
      const config = makeConfig();

      const result = await deliverNotifications(state, config);

      expect(sendEmailNotification).toHaveBeenCalled();
      expect(state.pending_notifications).toEqual([]);
      expect(result.sent).toBe(true);
      expect(result.results.loxberry.success).toBe(false);
      expect(result.results.email.success).toBe(true);
      consoleSpy.mockRestore();
    });

    test('email rejects: logged, loxberry result preserved, pending cleared', async () => {
      sendEmailNotification.mockRejectedValue(new Error('SMTP timeout'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const state = {
        pending_notifications: [
          { type: 'offline', transition: 'alert', ieee: '0x1', friendly_name: 'A', detail: 'd', timestamp: 'T' },
        ],
      };
      const config = makeConfig();

      const result = await deliverNotifications(state, config);

      expect(sendLoxberryNotification).toHaveBeenCalled();
      expect(state.pending_notifications).toEqual([]);
      expect(result.sent).toBe(true);
      expect(result.results.loxberry.success).toBe(true);
      expect(result.results.email.success).toBe(false);
      consoleSpy.mockRestore();
    });

    test('pending_notifications cleared after delivery regardless of success/failure', async () => {
      sendLoxberryNotification.mockImplementation(() => { throw new Error('fail'); });
      sendEmailNotification.mockRejectedValue(new Error('fail'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const state = {
        pending_notifications: [
          { type: 'offline', transition: 'alert', ieee: '0x1', friendly_name: 'A', detail: 'd', timestamp: 'T' },
        ],
      };
      const config = makeConfig();

      await deliverNotifications(state, config);

      expect(state.pending_notifications).toEqual([]);
      consoleSpy.mockRestore();
    });
  });
});
