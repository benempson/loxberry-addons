'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { acquireLock } = require('../bin/lib/state-store');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lock-test-'));
}

describe('acquireLock', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('succeeds and returns a release function', async () => {
    const lockPath = path.join(tmpDir, 'watchdog.lock');
    const release = await acquireLock(lockPath);
    expect(typeof release).toBe('function');
    await release();
  });

  it('throws with code ELOCKED when lock is already held', async () => {
    const lockPath = path.join(tmpDir, 'watchdog.lock');
    const release = await acquireLock(lockPath);
    try {
      await expect(acquireLock(lockPath)).rejects.toMatchObject({ code: 'ELOCKED' });
    } finally {
      await release();
    }
  });

  it('can re-acquire after release', async () => {
    const lockPath = path.join(tmpDir, 'watchdog.lock');
    const release1 = await acquireLock(lockPath);
    await release1();
    const release2 = await acquireLock(lockPath);
    expect(typeof release2).toBe('function');
    await release2();
  });

  it('creates the lock target file if it does not exist', async () => {
    const lockPath = path.join(tmpDir, 'newfile.lock');
    expect(fs.existsSync(lockPath)).toBe(false);
    const release = await acquireLock(lockPath);
    expect(fs.existsSync(lockPath)).toBe(true);
    await release();
  });
});
