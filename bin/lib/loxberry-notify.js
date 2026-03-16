'use strict';

const { execSync } = require('child_process');

const PLUGIN_NAME = 'zigbee_watchdog';

/**
 * Sanitize a string for safe inclusion in a bash double-quoted context.
 * Replaces double quotes with single quotes, strips backticks, dollar signs, and backslashes.
 * @param {string} str
 * @returns {string}
 */
function sanitize(str) {
  return String(str)
    .replace(/"/g, "'")
    .replace(/[`$\\]/g, '');
}

/**
 * Send a notification via LoxBerry's built-in notification system.
 * Shells out to the LoxBerry notify bash command.
 *
 * @param {string} message - Plain text notification message
 * @param {string} [severity] - 'err' for error severity; omit for info
 * @throws {Error} If the shell command fails
 */
function sendLoxberryNotification(message, severity) {
  const lbHome = process.env.LBHOMEDIR || '/opt/loxberry';
  const notifyScript = `${lbHome}/libs/bashlib/notify.sh`;
  const escaped = sanitize(message);
  const errFlag = severity === 'err' ? ' err' : '';
  const cmd = `. ${notifyScript} && notify ${PLUGIN_NAME} watchdog "${escaped}"${errFlag}`;

  execSync(cmd, { shell: '/bin/bash', timeout: 5000, stdio: 'pipe' });
}

module.exports = { sendLoxberryNotification };
