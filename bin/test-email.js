#!/usr/bin/env node
'use strict';

// Hard timeout to prevent hanging
const HARD_TIMEOUT_MS = 15000;
setTimeout(() => {
  process.stderr.write('Test email timed out\n');
  process.exit(1);
}, HARD_TIMEOUT_MS).unref();

const path = require('path');
const { readConfig } = require('./lib/config');
const { sendEmailNotification } = require('./lib/email-notify');

// Resolve config path same way watchdog.js does
const PLUGIN_NAME = 'zigbee_watchdog';
const BASE_DIR = process.env.LOXBERRY_DIR || '/opt/loxberry';
const CONFIG_PATH = process.env.WATCHDOG_CONFIG || path.join(BASE_DIR, 'config', 'plugins', PLUGIN_NAME, 'watchdog.cfg');

let config;
try {
  config = readConfig(CONFIG_PATH);
} catch (err) {
  process.stderr.write('Failed to read config: ' + err.message + '\n');
  process.exit(1);
}

const subject = 'Zigbee Watchdog - Test Email';
const textBody = 'This is a test email from Zigbee Watchdog. Your SMTP configuration is working correctly.';
const htmlBody = '<p>This is a test email from Zigbee Watchdog. Your SMTP configuration is working correctly.</p>';

sendEmailNotification(htmlBody, textBody, subject, config)
  .then(() => {
    process.stdout.write('Test email sent successfully\n');
    process.exit(0);
  })
  .catch((err) => {
    process.stderr.write('Test email failed: ' + err.message + '\n');
    process.exit(1);
  });
