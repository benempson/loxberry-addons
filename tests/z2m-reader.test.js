'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readZ2mState, readZ2mDatabase, detectZ2mPath } = require('../bin/lib/z2m-reader');

const FIXTURE_DIR = path.join(__dirname, 'fixtures');

describe('readZ2mState', () => {
  test('reads state.json and returns object mapping friendly_name to device state', () => {
    const result = readZ2mState(FIXTURE_DIR);
    expect(result).toHaveProperty('Living Room Plug');
    expect(result['Living Room Plug'].state).toBe('ON');
    expect(result['Kitchen Door'].battery).toBe(85);
    expect(result['Bedroom Motion'].battery).toBe(42);
  });

  test('returns empty object if state.json missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z2m-'));
    const result = readZ2mState(tmpDir);
    expect(result).toEqual({});
    fs.rmdirSync(tmpDir);
  });

  test('returns empty object if state.json is empty', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z2m-'));
    fs.writeFileSync(path.join(tmpDir, 'state.json'), '');
    const result = readZ2mState(tmpDir);
    expect(result).toEqual({});
    fs.unlinkSync(path.join(tmpDir, 'state.json'));
    fs.rmdirSync(tmpDir);
  });

  test('handles invalid JSON gracefully (returns empty object)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z2m-'));
    fs.writeFileSync(path.join(tmpDir, 'state.json'), '{bad json!!!');
    const result = readZ2mState(tmpDir);
    expect(result).toEqual({});
    fs.unlinkSync(path.join(tmpDir, 'state.json'));
    fs.rmdirSync(tmpDir);
  });
});

describe('readZ2mDatabase', () => {
  test('reads database.db and returns array of device objects', () => {
    const result = readZ2mDatabase(FIXTURE_DIR);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(5);
    expect(result[0].type).toBe('Coordinator');
    expect(result[1].friendly_name).toBe('Living Room Plug');
  });

  test('returns empty array if file missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z2m-'));
    const result = readZ2mDatabase(tmpDir);
    expect(result).toEqual([]);
    fs.rmdirSync(tmpDir);
  });

  test('skips blank lines in database.db', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z2m-'));
    fs.writeFileSync(
      path.join(tmpDir, 'database.db'),
      '{"id":1,"type":"Router","ieee_addr":"0x01"}\n\n{"id":2,"type":"EndDevice","ieee_addr":"0x02"}\n'
    );
    const result = readZ2mDatabase(tmpDir);
    expect(result.length).toBe(2);
    fs.unlinkSync(path.join(tmpDir, 'database.db'));
    fs.rmdirSync(tmpDir);
  });
});

describe('detectZ2mPath', () => {
  test('returns null if no z2m data path found', () => {
    // On a dev machine, none of the standard paths should exist
    const result = detectZ2mPath();
    expect(result).toBeNull();
  });
});
