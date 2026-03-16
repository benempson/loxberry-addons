'use strict';

/**
 * Convert an interval in minutes to a cron expression.
 *
 * Mapping:
 *   < 60 min  -> *\/N * * * *    (every N minutes)
 *   60-1439   -> 0 *\/H * * *    (every H hours, on the hour)
 *   >= 1440   -> 0 3 * * *       (daily at 3 am)
 *
 * Invalid / non-positive values default to 60 minutes.
 *
 * @param {number|string} minutes - Interval in minutes
 * @returns {string} Cron expression
 */
function intervalToCron(minutes) {
  const m = parseInt(minutes, 10);
  if (!m || m <= 0) {
    // safe default: every hour
    return '0 * * * *';
  }
  if (m < 60) {
    return `*/${m} * * * *`;
  }
  if (m < 1440) {
    const hours = Math.floor(m / 60);
    if (hours === 1) {
      return '0 * * * *';
    }
    return `0 */${hours} * * *`;
  }
  // daily at 3 am
  return '0 3 * * *';
}

module.exports = { intervalToCron };
