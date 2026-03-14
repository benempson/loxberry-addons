'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readState, writeState } = require('../bin/lib/state-store');

const FIXTURE_STATE = path.join(__dirname, 'fixtures', 'state.json');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'state-store-test-'));
}

describe('readState', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty state when file does not exist', () => {
    const result = readState(path.join(tmpDir, 'nonexistent.json'));
    expect(result).toEqual({ last_run: null, devices: {} });
  });

  it('returns empty state when file contains invalid JSON', () => {
    const badFile = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(badFile, '{invalid json', 'utf8');
    const result = readState(badFile);
    expect(result).toEqual({ last_run: null, devices: {} });
  });

  it('returns parsed content from valid fixture', () => {
    const result = readState(FIXTURE_STATE);
    expect(result.last_run).toBe('2026-03-14T10:00:00.000Z');
    expect(Object.keys(result.devices)).toHaveLength(2);
    expect(result.devices['0x00158d0001a2b3c4'].friendly_name).toBe('Living Room Motion');
  });
});

describe('writeState', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trips: writeState then readState returns equivalent object', async () => {
    const state = { last_run: '2026-03-14T12:00:00.000Z', devices: { abc: { name: 'test' } } };
    const filePath = path.join(tmpDir, 'state.json');
    await writeState(filePath, state);
    const result = readState(filePath);
    expect(result).toEqual(state);
  });

  it('writes JSON with 2-space indentation', async () => {
    const state = { last_run: null, devices: {} };
    const filePath = path.join(tmpDir, 'state.json');
    await writeState(filePath, state);
    const raw = fs.readFileSync(filePath, 'utf8');
    // 2-space indent means "devices" key is indented with 2 spaces
    expect(raw).toContain('  "devices"');
    // Verify it's valid JSON
    expect(JSON.parse(raw)).toEqual(state);
  });

  it('creates parent directories if they do not exist', async () => {
    const state = { last_run: null, devices: {} };
    const filePath = path.join(tmpDir, 'nested', 'deep', 'state.json');
    await writeState(filePath, state);
    expect(fs.existsSync(filePath)).toBe(true);
    const result = readState(filePath);
    expect(result).toEqual(state);
  });
});
