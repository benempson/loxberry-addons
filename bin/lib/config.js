'use strict';

const fs = require('fs');
const ini = require('ini');

const DEFAULTS = {
  Z2M: {
    z2m_data_path: '',
  },
  THRESHOLDS: {
    offline_hours: '24',
    battery_pct: '25',
  },
  CRON: {
    interval_minutes: '60',
  },
  NOTIFICATIONS: {
    loxberry_enabled: '0',
    email_enabled: '0',
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_pass: '',
    smtp_from: '',
    smtp_to: '',
    heartbeat_enabled: '0',
  },
  LOGGING: {
    log_max_size: '1024',   // KB
    log_max_files: '5',
  },
  EXCLUSIONS: {
    devices: '',
  },
};

const NUMERIC_FIELDS = {
  THRESHOLDS: ['offline_hours', 'battery_pct'],
  CRON: ['interval_minutes'],
  NOTIFICATIONS: ['smtp_port'],
  LOGGING: ['log_max_size', 'log_max_files'],
};

const BOOLEAN_FIELDS = {
  NOTIFICATIONS: ['loxberry_enabled', 'email_enabled', 'heartbeat_enabled'],
};

/**
 * Read an INI config file and return a typed config object with defaults merged.
 * @param {string} configPath - Absolute path to the INI config file
 * @returns {object} Config object with sections: Z2M, THRESHOLDS, CRON, NOTIFICATIONS, EXCLUSIONS
 */
function readConfig(configPath) {
  let raw;
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read config file at "${configPath}": ${err.message}`);
  }

  const parsed = ini.parse(raw);

  // Merge parsed over defaults per section
  const config = {};
  for (const [section, defaults] of Object.entries(DEFAULTS)) {
    config[section] = { ...defaults, ...(parsed[section] || {}) };
  }

  // Coerce numeric fields
  for (const [section, fields] of Object.entries(NUMERIC_FIELDS)) {
    for (const field of fields) {
      const val = config[section][field];
      config[section][field] = parseInt(val, 10) || 0;
    }
  }

  // Coerce boolean fields
  for (const [section, fields] of Object.entries(BOOLEAN_FIELDS)) {
    for (const field of fields) {
      const val = config[section][field];
      config[section][field] = val === '1' || val === 'true' || val === true;
    }
  }

  // Parse EXCLUSIONS.devices as comma-separated array
  const devicesRaw = config.EXCLUSIONS.devices;
  if (typeof devicesRaw === 'string') {
    config.EXCLUSIONS.devices = devicesRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } else if (!Array.isArray(devicesRaw)) {
    config.EXCLUSIONS.devices = [];
  }

  return config;
}

module.exports = { readConfig };
