#!/usr/bin/env node
// release.js — Bump version, commit, build zip, push, and create GitHub Release
// Usage: node release.js [major|minor|patch]
// Default: patch

const fs = require('fs');
const path = require('path');
const https = require('https');
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

// Create GitHub Release and upload zip via GitHub API
async function createRelease() {
  const token = (process.env.GITHUB_TOKEN || '').trim()
    || (() => { try { return execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n', encoding: 'utf8' }).match(/password=(.*)/)?.[1]?.trim(); } catch { return ''; } })();

  if (!token) {
    console.error('\nError: No GitHub token found.');
    console.error('Set GITHUB_TOKEN environment variable or install gh CLI.');
    console.error(`\nTo finish manually:\n  gh release create ${newVersion} ${zipName} --title "v${newVersion}" --generate-notes`);
    process.exit(1);
  }

  const owner = 'benempson';
  const repo = 'loxberry-addons';

  function ghApi(method, apiPath, body) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: apiPath,
        method,
        headers: {
          'Authorization': `token ${token}`,
          'User-Agent': 'zigbee-watchdog-release',
          'Accept': 'application/vnd.github+json',
        },
      };
      if (body) {
        const data = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = Buffer.byteLength(data);
      }
      const req = https.request(options, (res) => {
        let raw = '';
        res.on('data', (chunk) => raw += chunk);
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`GitHub API ${res.statusCode}: ${raw}`));
          } else {
            resolve(JSON.parse(raw || '{}'));
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  function uploadAsset(uploadUrl, filePath, fileName) {
    return new Promise((resolve, reject) => {
      const fileData = fs.readFileSync(filePath);
      const url = new URL(uploadUrl.replace('{?name,label}', `?name=${fileName}`));
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Authorization': `token ${token}`,
          'User-Agent': 'zigbee-watchdog-release',
          'Content-Type': 'application/zip',
          'Content-Length': fileData.length,
        },
      };
      const req = https.request(options, (res) => {
        let raw = '';
        res.on('data', (chunk) => raw += chunk);
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`Upload failed ${res.statusCode}: ${raw}`));
          } else {
            resolve(JSON.parse(raw));
          }
        });
      });
      req.on('error', reject);
      req.write(fileData);
      req.end();
    });
  }

  console.log(`Creating GitHub Release ${newVersion}...`);
  const release = await ghApi('POST', `/repos/${owner}/${repo}/releases`, {
    tag_name: newVersion,
    name: `v${newVersion}`,
    generate_release_notes: true,
  });

  console.log(`Uploading ${zipName}...`);
  await uploadAsset(release.upload_url, zipName, zipName);

  fs.unlinkSync(zipName);
  console.log(`\nDone! v${newVersion} released.`);
  console.log(`https://github.com/${owner}/${repo}/releases/tag/${newVersion}`);
  console.log('GitHub Actions will update release.cfg on main.');
}

createRelease().catch((err) => {
  console.error('\nRelease creation failed:', err.message);
  console.error(`\nVersion bump and push succeeded. To finish manually:\n  gh release create ${newVersion} ${zipName} --title "v${newVersion}" --generate-notes`);
  process.exit(1);
});
