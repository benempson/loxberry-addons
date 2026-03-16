'use strict';

const { intervalToCron } = require('../bin/lib/cron-helper');

describe('intervalToCron', () => {
  test.each([
    [5, '*/5 * * * *'],
    [15, '*/15 * * * *'],
    [30, '*/30 * * * *'],
    [60, '0 * * * *'],
    [120, '0 */2 * * *'],
    [240, '0 */4 * * *'],
    [360, '0 */6 * * *'],
    [720, '0 */12 * * *'],
    [1440, '0 3 * * *'],
  ])('intervalToCron(%i) returns "%s"', (minutes, expected) => {
    expect(intervalToCron(minutes)).toBe(expected);
  });

  test('treats 0 as safe default (60 minutes)', () => {
    expect(intervalToCron(0)).toBe('0 * * * *');
  });

  test('treats negative as safe default (60 minutes)', () => {
    expect(intervalToCron(-10)).toBe('0 * * * *');
  });

  test('coerces string input to number', () => {
    expect(intervalToCron('30')).toBe('*/30 * * * *');
  });

  test('coerces string "120" to number', () => {
    expect(intervalToCron('120')).toBe('0 */2 * * *');
  });

  test('treats NaN input as safe default (60 minutes)', () => {
    expect(intervalToCron('abc')).toBe('0 * * * *');
  });
});
