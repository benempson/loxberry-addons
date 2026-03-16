#!/usr/bin/env node
'use strict';

// Hard timeout to prevent hanging
const HARD_TIMEOUT_MS = 10000;
setTimeout(() => {
  process.stderr.write('MQTT connection timed out\n');
  process.exit(1);
}, HARD_TIMEOUT_MS).unref();

const path = require('path');
const mqtt = require('mqtt');
const { readConfig } = require('./lib/config');

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

const { host, port, username, password } = config.MQTT;

const client = mqtt.connect(`mqtt://${host}:${port}`, {
  username: username || undefined,
  password: password || undefined,
  connectTimeout: 5000,
  reconnectPeriod: 0,
  clean: true,
});

client.on('connect', () => {
  process.stdout.write('MQTT connection successful\n');
  client.end(false, () => {
    process.exit(0);
  });
});

client.on('error', (err) => {
  process.stderr.write('MQTT connection failed: ' + err.message + '\n');
  client.end(true);
  process.exit(1);
});
