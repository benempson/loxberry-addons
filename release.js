#!/usr/bin/env node
// release.js — Bump version, commit, build zip, push, and create GitHub Release
// Usage: node release.js [major|minor|patch]
// Default: patch

const fs = require('fs');
const { execSync } = require('child_process');

const bumpType = process.argv[2] || 'patch';

if (!['major', 'minor', 'patch'].includes(bumpType)) {
  console.error('Usage: node release.js [major|minor|patch]');
  process.exit(1);
}

// Read current version
const rootPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const [major, minor, patch] = rootPkg.version.split('.').map(Number);

// Calculate new version
const newVersion = {
  major: `${major + 1}.0.0`,
  minor: `${major}.${minor + 1}.0`,
  patch: `${major}.${minor}.${patch + 1}`,
}[bumpType];

console.log(`Bumping ${bumpType}: ${rootPkg.version} -> ${newVersion}`);

// Update root package.json
rootPkg.version = newVersion;
fs.writeFileSync('package.json', JSON.stringify(rootPkg, null, 2) + '\n');

// Update bin/package.json
const binPkg = JSON.parse(fs.readFileSync('bin/package.json', 'utf8'));
binPkg.version = newVersion;
fs.writeFileSync('bin/package.json', JSON.stringify(binPkg, null, 2) + '\n');

// Update plugin.cfg
const cfg = fs.readFileSync('plugin.cfg', 'utf8');
fs.writeFileSync('plugin.cfg', cfg.replace(/^VERSION=.*/m, `VERSION=${newVersion}`));

// Update release.cfg
const releaseCfg = `[AUTOUPDATE]\nVERSION=${newVersion}\nARCHIVEURL=https://github.com/benempson/loxberry-addons/releases/download/${newVersion}/zigbee-watchdog-${newVersion}.zip\nINFOURL=https://github.com/benempson/loxberry-addons/releases\n`;
fs.writeFileSync('release.cfg', releaseCfg);

console.log('Updated: package.json, bin/package.json, plugin.cfg, release.cfg');

// Commit version bump
execSync('git add package.json bin/package.json plugin.cfg release.cfg', { stdio: 'inherit' });
execSync(`git commit -m "chore: bump version to ${newVersion}"`, { stdio: 'inherit' });

// Build zip from HEAD
const zipName = `zigbee-watchdog-${newVersion}.zip`;
const files = [
  'plugin.cfg', 'preinstall.sh', 'preupgrade.sh', 'postinstall.sh',
  'uninstall/', 'bin/', 'webfrontend/', 'templates/', 'icons/', 'README.md',
].join(' ');
execSync(`git archive --format=zip --output=${zipName} HEAD ${files}`, { stdio: 'inherit' });
console.log(`Built: ${zipName}`);

// Push to remote
console.log('Pushing to origin...');
execSync('git push origin main', { stdio: 'inherit' });

// Create GitHub Release with zip attached
console.log(`Creating GitHub Release ${newVersion}...`);
execSync(`gh release create ${newVersion} ${zipName} --title "v${newVersion}" --generate-notes`, { stdio: 'inherit' });

// Clean up local zip
fs.unlinkSync(zipName);

console.log(`\nDone! v${newVersion} released.`);
console.log('GitHub Actions will also attach the zip and update release.cfg on main.');
