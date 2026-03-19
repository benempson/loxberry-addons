'use strict';

const fs = require('fs');

const SEVERITIES = ['Debug', 'Info', 'Warning', 'Error'];

const DEFAULT_MAX_SIZE = 1048576; // 1MB
const DEFAULT_MAX_FILES = 5;

let logPath = null;
let maxSize = DEFAULT_MAX_SIZE;
let maxFiles = DEFAULT_MAX_FILES;

/**
 * Initialize the logger with a file path and optional rotation settings.
 * @param {string} filePath - Absolute path to the log file
 * @param {object} [opts] - Options
 * @param {number} [opts.maxSize] - Max file size in bytes before rotation (default 1MB)
 * @param {number} [opts.maxFiles] - Max number of rotated files to keep (default 5)
 */
function init(filePath, opts = {}) {
  logPath = filePath;
  if (opts.maxSize != null) maxSize = opts.maxSize;
  if (opts.maxFiles != null) maxFiles = opts.maxFiles;
}

/**
 * Rotate log files when current file exceeds maxSize.
 * Renames logPath -> logPath.1 -> logPath.2 -> ... -> logPath.(maxFiles-1)
 */
function rotate() {
  if (logPath === null) return;

  let stat;
  try {
    stat = fs.statSync(logPath);
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }

  if (stat.size < maxSize) return;

  for (let i = maxFiles - 1; i >= 1; i--) {
    const from = i === 1 ? logPath : logPath + '.' + (i - 1);
    const to = logPath + '.' + i;
    try {
      fs.renameSync(from, to);
    } catch (_err) {
      // File may not exist, ignore
    }
  }

  fs.writeFileSync(logPath, '');
}

/**
 * Write a structured JSONL log entry.
 * @param {string} severity - One of SEVERITIES: Debug, Info, Warning, Error
 * @param {string} source - Source module name (e.g. 'watchdog', 'notify')
 * @param {string} message - Log message
 */
function log(severity, source, message) {
  if (logPath === null) return;
  if (!SEVERITIES.includes(severity)) severity = 'Info';

  rotate();

  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    sev: severity,
    src: source,
    msg: message,
  }) + '\n';

  fs.appendFileSync(logPath, entry, 'utf8');
}

module.exports = { init, log, SEVERITIES };
