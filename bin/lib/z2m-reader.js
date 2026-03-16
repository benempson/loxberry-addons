'use strict';

const fs = require('fs');
const path = require('path');

const SEARCH_PATHS = [
  '/opt/zigbee2mqtt/data',
  '/opt/loxberry/data/plugins/zigbee2mqtt/zigbee2mqtt/',
  '/opt/loxberry/data/plugins/zigbee2mqtt/',
];

/**
 * Read z2m state.json and return device state object.
 * Keys are friendly names, values are device state objects.
 *
 * @param {string} z2mDataPath - Path to z2m data directory
 * @returns {object} Device state map (friendly_name -> state)
 */
function readZ2mState(z2mDataPath) {
  const filePath = path.join(z2mDataPath, 'state.json');
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }

  if (!raw || !raw.trim()) return {};

  // Try parsing; on failure retry once after short delay (z2m may be mid-write)
  try {
    return JSON.parse(raw);
  } catch (_firstErr) {
    try {
      const raw2 = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw2);
    } catch (_retryErr) {
      return {};
    }
  }
}

/**
 * Read z2m database.db (newline-delimited JSON) and return array of device objects.
 *
 * @param {string} z2mDataPath - Path to z2m data directory
 * @returns {Array<object>} Array of device objects from database.db
 */
function readZ2mDatabase(z2mDataPath) {
  const filePath = path.join(z2mDataPath, 'database.db');
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const lines = raw.split('\n');
  const entries = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object' && obj.type) {
        entries.push(obj);
      }
    } catch (_err) {
      // Skip unparseable lines
    }
  }

  return entries;
}

/**
 * Auto-detect z2m data path by checking known locations.
 * Returns first path where state.json exists, or null.
 *
 * @returns {string|null} Detected z2m data path or null
 */
function detectZ2mPath() {
  for (const searchPath of SEARCH_PATHS) {
    try {
      fs.accessSync(path.join(searchPath, 'state.json'));
      return searchPath;
    } catch (_err) {
      // Path doesn't exist or not accessible
    }
  }
  return null;
}

module.exports = { readZ2mState, readZ2mDatabase, detectZ2mPath };
