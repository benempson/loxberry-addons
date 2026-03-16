#!/usr/bin/env node
'use strict';

// Hard timeout: 10 seconds
setTimeout(function () {
  process.stderr.write('Timeout: verification took too long\n');
  process.exit(1);
}, 10000).unref();

const path = require('path');
const fs = require('fs');
const { readConfig } = require('./lib/config');
const { readZ2mState, readZ2mDatabase, detectZ2mPath } = require('./lib/z2m-reader');

// Locate config file
const pluginConfigDir = process.env.LBPCONFIGDIR || path.join(__dirname, '..', 'config');
const configPath = path.join(pluginConfigDir, 'watchdog.cfg');

let z2mPath = '';

try {
  const config = readConfig(configPath);
  z2mPath = config.Z2M.z2m_data_path || '';
} catch (_err) {
  // Config not readable; fall through to auto-detect
}

if (!z2mPath) {
  z2mPath = detectZ2mPath();
}

if (!z2mPath) {
  process.stderr.write('Z2M data path not found\n');
  process.exit(1);
}

try {
  // Read state.json
  const stateData = readZ2mState(z2mPath);
  const stateCount = Object.keys(stateData).length;

  // Read database.db
  const dbEntries = readZ2mDatabase(z2mPath);
  const dbCount = dbEntries.filter(function (e) { return e.type !== 'Coordinator'; }).length;

  // Get state.json mtime and compute age
  const stateFile = path.join(z2mPath, 'state.json');
  const stat = fs.statSync(stateFile);
  const ageSeconds = Math.floor((Date.now() - stat.mtime.getTime()) / 1000);

  var ageStr;
  if (ageSeconds < 60) {
    ageStr = ageSeconds + 's ago';
  } else if (ageSeconds < 3600) {
    ageStr = Math.floor(ageSeconds / 60) + 'm ago';
  } else if (ageSeconds < 86400) {
    ageStr = Math.floor(ageSeconds / 3600) + 'h ago';
  } else {
    ageStr = Math.floor(ageSeconds / 86400) + 'd ago';
  }

  process.stdout.write('Z2M path verified: ' + z2mPath + '\n');
  process.stdout.write(dbCount + ' devices in database, ' + stateCount + ' devices in state, state.json ' + ageStr + '\n');
  process.exit(0);
} catch (err) {
  process.stderr.write('Verification failed: ' + err.message + '\n');
  process.exit(1);
}
