'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readZ2mState, readZ2mDatabase, detectZ2mPath } = require('../bin/lib/z2m-reader');

const Z2M_STATE_FIXTURE = path.join(__dirname, 'fixtures', 'z2m-state.json');
const Z2M_DB_FIXTURE = path.join(__dirname, 'fixtures', 'z2m-database.db');

function makeTmpZ2mDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z2m-'));
  return tmpDir;
}

function copyFixtureAsStateJson(tmpDir) {
  fs.copyFileSync(Z2M_STATE_FIXTURE, path.join(tmpDir, 'state.json'));
}

function copyFixtureAsDatabase(tmpDir) {
  fs.copyFileSync(Z2M_DB_FIXTURE, path.join(tmpDir, 'database.db'));
}

describe('readZ2mState', () => {
  test('reads state.json and returns object mapping friendly_name to device state', () => {
    const tmpDir = makeTmpZ2mDir();
    copyFixtureAsStateJson(tmpDir);
    try {
      const result = readZ2mState(tmpDir);
      expect(result).toHaveProperty('Living Room Plug');
      expect(result['Living Room Plug'].state).toBe('ON');
      expect(result['Kitchen Door'].battery).toBe(85);
      expect(result['Bedroom Motion'].battery).toBe(42);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('returns empty object if state.json missing', () => {
    const tmpDir = makeTmpZ2mDir();
    try {
      const result = readZ2mState(tmpDir);
      expect(result).toEqual({});
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('returns empty object if state.json is empty', () => {
    const tmpDir = makeTmpZ2mDir();
    fs.writeFileSync(path.join(tmpDir, 'state.json'), '');
    try {
      const result = readZ2mState(tmpDir);
      expect(result).toEqual({});
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('handles invalid JSON gracefully (returns empty object)', () => {
    const tmpDir = makeTmpZ2mDir();
    fs.writeFileSync(path.join(tmpDir, 'state.json'), '{bad json!!!');
    try {
      const result = readZ2mState(tmpDir);
      expect(result).toEqual({});
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});

describe('readZ2mDatabase', () => {
  test('reads database.db and returns array of device objects', () => {
    const tmpDir = makeTmpZ2mDir();
    copyFixtureAsDatabase(tmpDir);
    try {
      const result = readZ2mDatabase(tmpDir);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(5);
      expect(result[0].type).toBe('Coordinator');
      expect(result[1].friendly_name).toBe('Living Room Plug');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('returns empty array if file missing', () => {
    const tmpDir = makeTmpZ2mDir();
    try {
      const result = readZ2mDatabase(tmpDir);
      expect(result).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('skips blank lines in database.db', () => {
    const tmpDir = makeTmpZ2mDir();
    fs.writeFileSync(
      path.join(tmpDir, 'database.db'),
      '{"id":1,"type":"Router","ieee_addr":"0x01"}\n\n{"id":2,"type":"EndDevice","ieee_addr":"0x02"}\n'
    );
    try {
      const result = readZ2mDatabase(tmpDir);
      expect(result.length).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});

describe('detectZ2mPath', () => {
  test('returns null if no z2m data path found', () => {
    const result = detectZ2mPath();
    expect(result).toBeNull();
  });
});
