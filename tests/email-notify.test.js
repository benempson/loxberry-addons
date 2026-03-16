'use strict';

const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }));

jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}));

const { sendEmailNotification } = require('../bin/lib/email-notify');

beforeEach(() => {
  jest.clearAllMocks();
  mockSendMail.mockResolvedValue({ messageId: '<test@example.com>' });
});

function makeConfig(overrides = {}) {
  return {
    NOTIFICATIONS: {
      smtp_host: 'mail.example.com',
      smtp_port: 587,
      smtp_user: 'user@example.com',
      smtp_pass: 'secret',
      smtp_from: 'watchdog@example.com',
      smtp_to: 'admin@example.com',
      ...overrides,
    },
  };
}

describe('sendEmailNotification', () => {
  test('creates transport with correct host, port, and auth for port 587', async () => {
    const config = makeConfig({ smtp_port: 587 });
    await sendEmailNotification('<p>html</p>', 'text', 'Subject', config);

    expect(mockCreateTransport).toHaveBeenCalledTimes(1);
    const opts = mockCreateTransport.mock.calls[0][0];
    expect(opts.host).toBe('mail.example.com');
    expect(opts.port).toBe(587);
    expect(opts.secure).toBe(false);
    expect(opts.auth).toEqual({ user: 'user@example.com', pass: 'secret' });
  });

  test('sets secure=true when port is 465', async () => {
    const config = makeConfig({ smtp_port: 465 });
    await sendEmailNotification('<p>html</p>', 'text', 'Subject', config);

    const opts = mockCreateTransport.mock.calls[0][0];
    expect(opts.secure).toBe(true);
  });

  test('sets secure=false when port is 25', async () => {
    const config = makeConfig({ smtp_port: 25 });
    await sendEmailNotification('<p>html</p>', 'text', 'Subject', config);

    const opts = mockCreateTransport.mock.calls[0][0];
    expect(opts.secure).toBe(false);
  });

  test('omits auth when smtp_user is empty', async () => {
    const config = makeConfig({ smtp_user: '', smtp_pass: '' });
    await sendEmailNotification('<p>html</p>', 'text', 'Subject', config);

    const opts = mockCreateTransport.mock.calls[0][0];
    expect(opts.auth).toBeUndefined();
  });

  test('sets all three timeout fields to 10000', async () => {
    const config = makeConfig();
    await sendEmailNotification('<p>html</p>', 'text', 'Subject', config);

    const opts = mockCreateTransport.mock.calls[0][0];
    expect(opts.connectionTimeout).toBe(10000);
    expect(opts.greetingTimeout).toBe(10000);
    expect(opts.socketTimeout).toBe(10000);
  });

  test('calls sendMail with correct from, to, subject, html, text', async () => {
    const config = makeConfig();
    await sendEmailNotification('<p>body</p>', 'plain body', 'Alert Subject', config);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailOpts = mockSendMail.mock.calls[0][0];
    expect(mailOpts.from).toBe('watchdog@example.com');
    expect(mailOpts.to).toBe('admin@example.com');
    expect(mailOpts.subject).toBe('Alert Subject');
    expect(mailOpts.html).toBe('<p>body</p>');
    expect(mailOpts.text).toBe('plain body');
  });

  test('returns sendMail result', async () => {
    const config = makeConfig();
    const result = await sendEmailNotification('<p>html</p>', 'text', 'Subject', config);

    expect(result).toEqual({ messageId: '<test@example.com>' });
  });

  test('propagates error when sendMail rejects', async () => {
    mockSendMail.mockRejectedValue(new Error('SMTP connection refused'));
    const config = makeConfig();

    await expect(
      sendEmailNotification('<p>html</p>', 'text', 'Subject', config)
    ).rejects.toThrow('SMTP connection refused');
  });
});
