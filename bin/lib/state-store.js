'use strict';

const fs = require('fs');
const path = require('path');
const writeFileAtomic = require('write-file-atomic');

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

module.exports = { readState, writeState };
