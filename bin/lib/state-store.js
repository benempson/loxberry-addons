'use strict';

const fs = require('fs');
const path = require('path');
const writeFileAtomic = require('write-file-atomic');
const lockfile = require('proper-lockfile');

const EMPTY_STATE = { last_run: null, devices: {} };

/**
 * Read state from a JSON file. Returns empty state if file is missing or corrupt.
 * @param {string} statePath - Absolute path to the state JSON file
 * @returns {object} Parsed state or empty state on error
 */
function readState(statePath) {
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`State file unreadable (${err.code || err.message}), starting with empty state`);
    return { ...EMPTY_STATE, devices: {} };
  }
}

/**
 * Write state to a JSON file atomically (temp file + rename).
 * Creates parent directories if they don't exist.
 * @param {string} statePath - Absolute path to write state JSON
 * @param {object} state - State object to serialize
 */
async function writeState(statePath, state) {
  const dir = path.dirname(statePath);
  fs.mkdirSync(dir, { recursive: true });
  const json = JSON.stringify(state, null, 2);
  await writeFileAtomic(statePath, json, { encoding: 'utf8' });
}

/**
 * Acquire a pidfile-style lock to prevent overlapping cron runs.
 * Creates the lock target file if it doesn't exist.
 * Stale locks (>60s) are automatically cleaned up.
 * @param {string} lockPath - Absolute path to the lock target file
 * @returns {Function} Release function -- call to release the lock
 */
async function acquireLock(lockPath) {
  const dir = path.dirname(lockPath);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(lockPath)) {
    fs.writeFileSync(lockPath, '');
  }
  const release = await lockfile.lock(lockPath, {
    stale: 60000,
    retries: 0,
  });
  return release;
}

module.exports = { readState, writeState, acquireLock };
