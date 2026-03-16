'use strict';

const nodemailer = require('nodemailer');

/**
 * Send an email notification via SMTP using Nodemailer.
 *
 * @param {string} htmlBody - HTML email body
 * @param {string} textBody - Plain text email body
 * @param {string} subject - Email subject line
 * @param {object} config - Application config with NOTIFICATIONS section
 * @returns {Promise<object>} Nodemailer sendMail result
 * @throws {Error} If transport creation or sending fails
 */
async function sendEmailNotification(htmlBody, textBody, subject, config) {
  const n = config.NOTIFICATIONS;
  const port = n.smtp_port;
  const secure = port === 465;

  const transportOpts = {
    host: n.smtp_host,
    port: port,
    secure: secure,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  };

  if (n.smtp_user) {
    transportOpts.auth = {
      user: n.smtp_user,
      pass: n.smtp_pass,
    };
  }

  const transport = nodemailer.createTransport(transportOpts);

  return transport.sendMail({
    from: n.smtp_from,
    to: n.smtp_to,
    subject: subject,
    html: htmlBody,
    text: textBody,
  });
}

module.exports = { sendEmailNotification };
