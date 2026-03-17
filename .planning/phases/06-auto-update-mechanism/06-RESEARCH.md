# Phase 6: Auto-Update Mechanism - Research

**Researched:** 2026-03-17
**Domain:** Loxberry plugin auto-update system, GitHub Releases, CI/CD
**Confidence:** HIGH

## Summary

Loxberry has a **built-in plugin auto-update system** that works via a simple polling mechanism. The plugin's `plugin.cfg` contains an `[AUTOUPDATE]` section pointing to a `release.cfg` file hosted on GitHub (raw URL). Loxberry periodically fetches this file, compares the `VERSION` field against the installed plugin version, and if newer, downloads the zip from the `ARCHIVEURL` and installs it through the normal plugin install process (preupgrade.sh -> purge -> extract -> postinstall.sh).

This is exactly the mechanism the zigbee2mqtt Loxberry plugin (romanlum/LoxBerry-Plugin-Zigbee2Mqtt) uses. The key insight is that **no custom update code is needed in the plugin itself** -- Loxberry handles everything. The plugin developer's responsibility is: (1) configure `plugin.cfg` correctly, (2) maintain a `release.cfg` file in the repo with the current version and download URL, and (3) create GitHub Releases with a zip artifact attached.

**Primary recommendation:** Use Loxberry's built-in auto-update system by configuring `plugin.cfg [AUTOUPDATE]`, creating a `release.cfg` file, and setting up a GitHub Actions workflow to automate release creation. The existing `release.js` script already builds the zip -- the workflow just needs to automate uploading it to GitHub Releases and updating `release.cfg`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UPDT-01 | Plugin checks GitHub for newer versions and indicates update availability | Loxberry's built-in auto-update system handles this automatically via `release.cfg` polling -- no custom code needed |
| UPDT-02 | Plugin can self-update from GitHub without manual packaging and reinstallation | Loxberry downloads the zip from `ARCHIVEURL` in `release.cfg` and installs it automatically -- standard mechanism |
| UPDT-03 | Update process preserves user configuration and state data | Already handled by existing `preupgrade.sh` (backs up config + data) and `postinstall.sh` (restores from backup) |
</phase_requirements>

## Standard Stack

### Core
| Component | Purpose | Why Standard |
|-----------|---------|--------------|
| Loxberry AUTOUPDATE | Version checking and auto-install | Built into Loxberry core, no custom code needed |
| GitHub Releases | Host downloadable zip artifacts | Standard for Loxberry plugins, free, reliable |
| GitHub Actions | Automate release builds | Free for public repos, standard CI/CD |
| release.cfg | Version manifest for Loxberry to poll | Required format for Loxberry auto-update |

### Supporting
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| prerelease.cfg | Beta/pre-release channel | Optional; same format as release.cfg for users who opt into pre-releases |
| gh CLI | Create releases from command line | Alternative to GitHub Actions for manual releases |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GitHub Actions | Manual `node release.js` + `gh release create` | Simpler but requires developer to run commands manually |
| GitHub Releases zip | Direct `git archive` from tag | Loxberry needs a zip with specific structure; git archive works fine |

## Architecture Patterns

### How Loxberry Auto-Update Works (End-to-End)

```
1. Developer creates a GitHub Release with a plugin.zip attached
2. release.cfg in the repo's main branch is updated with:
   - VERSION=X.Y.Z (matching the release)
   - ARCHIVEURL=https://github.com/{user}/{repo}/releases/download/X.Y.Z/{zipname}.zip
   - INFOURL=https://github.com/{user}/{repo}/releases
3. plugin.cfg [AUTOUPDATE] section points to the raw GitHub URL of release.cfg:
   RELEASECFG=https://raw.githubusercontent.com/{user}/{repo}/main/release.cfg
4. Loxberry periodically fetches release.cfg from that URL
5. Loxberry compares VERSION in release.cfg to installed plugin VERSION in plugin.cfg
6. If remote VERSION > installed VERSION:
   - Loxberry downloads the zip from ARCHIVEURL
   - Runs the standard plugin install process:
     a. preupgrade.sh (backs up config/data)
     b. Purges old installation
     c. Extracts new zip
     d. postinstall.sh (restores config/data, npm install, cron setup)
7. User sees update notification in Loxberry admin UI
```

### release.cfg Format

```ini
[AUTOUPDATE]
# Version of the new release
VERSION=0.7.0

# Download URL of the ZIP Archive
ARCHIVEURL=https://github.com/benempson/loxberry-addons/releases/download/0.7.0/zigbee-watchdog-0.7.0.zip

# URL for further information about this release
INFOURL=https://github.com/benempson/loxberry-addons/releases
```

### plugin.cfg AUTOUPDATE Section (What Needs to Change)

Current:
```ini
[AUTOUPDATE]
AUTOMATIC_UPDATES=false
RELEASECFG=
PRERELEASECFG=
```

Target:
```ini
[AUTOUPDATE]
AUTOMATIC_UPDATES=true
RELEASECFG=https://raw.githubusercontent.com/benempson/loxberry-addons/main/release.cfg
PRERELEASECFG=https://raw.githubusercontent.com/benempson/loxberry-addons/main/prerelease.cfg
```

### GitHub Actions Workflow Pattern

Based on the romanlum/LoxBerry-Plugin-Zigbee2Mqtt workflow:

```yaml
name: Release Plugin
on:
  release:
    types: [released]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Build the plugin zip (same files as release.js)
      - name: Build plugin zip
        run: |
          ZIP_NAME="zigbee-watchdog-${{ github.event.release.tag_name }}.zip"
          git archive --format=zip --output="$ZIP_NAME" HEAD \
            plugin.cfg preinstall.sh preupgrade.sh postinstall.sh \
            uninstall/ bin/ webfrontend/ templates/ README.md
          echo "ZIP_NAME=$ZIP_NAME" >> $GITHUB_ENV

      # Upload zip to the GitHub Release
      - name: Upload release asset
        uses: softprops/action-gh-release@v2
        with:
          files: ${{ env.ZIP_NAME }}

      # Update release.cfg with new version and push to main
      - name: Update release.cfg
        run: |
          VERSION="${{ github.event.release.tag_name }}"
          cat > release.cfg << EOF
          [AUTOUPDATE]
          VERSION=$VERSION
          ARCHIVEURL=https://github.com/benempson/loxberry-addons/releases/download/$VERSION/zigbee-watchdog-$VERSION.zip
          INFOURL=https://github.com/benempson/loxberry-addons/releases
          EOF

      - name: Commit release.cfg
        uses: github-actions-x/commit@v2.9
        with:
          push-branch: main
          commit-message: "chore: update release.cfg for ${{ github.event.release.tag_name }}"
          files: release.cfg
```

### Recommended Project Structure Changes

```
(root)
  release.cfg              # NEW: Loxberry auto-update manifest (committed to repo)
  prerelease.cfg           # OPTIONAL: Pre-release channel manifest
  .github/
    workflows/
      release.yml          # NEW: GitHub Actions workflow for release automation
  plugin.cfg               # MODIFIED: [AUTOUPDATE] section populated
```

### Release Workflow (Developer Experience)

Two options, recommend Option A for simplicity:

**Option A: Manual release with gh CLI (simplest)**
```bash
# 1. Bump version (already have release.js for this)
node release.js patch

# 2. Push to GitHub
git push origin main

# 3. Create GitHub Release with zip attached
gh release create 0.7.0 zigbee-watchdog-0.7.0.zip --title "v0.7.0" --notes "Release notes here"

# 4. Update release.cfg and push (or let GitHub Actions do it)
```

**Option B: Fully automated with GitHub Actions**
```bash
# 1. Bump version
node release.js patch

# 2. Push to GitHub
git push origin main

# 3. Create a release on GitHub (UI or gh CLI) -- workflow handles the rest
gh release create 0.7.0 --title "v0.7.0" --generate-notes
# GitHub Actions builds zip, attaches to release, updates release.cfg
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Version checking | Custom HTTP polling script | Loxberry's built-in AUTOUPDATE | Already implemented in Loxberry core, handles version comparison |
| Update installation | Custom download/extract/install script | Loxberry plugin install pipeline | Handles preupgrade, purge, extract, postinstall correctly |
| Config preservation | Custom config migration logic | Existing preupgrade.sh + postinstall.sh | Already backs up and restores config/data |
| Release artifact hosting | Self-hosted file server | GitHub Releases | Free, reliable, CDN-backed, integrates with release.cfg |

**Key insight:** All three UPDT requirements are satisfied by Loxberry's built-in system. No custom update code is needed in the plugin. The work is purely configuration: updating plugin.cfg, creating release.cfg, and optionally setting up GitHub Actions.

## Common Pitfalls

### Pitfall 1: Version String Mismatch
**What goes wrong:** release.cfg VERSION doesn't match the zip's plugin.cfg VERSION, causing Loxberry to re-download the same version repeatedly or skip updates.
**Why it happens:** Manual version bumping in multiple files without consistency.
**How to avoid:** The existing `release.js` script already bumps version in package.json, bin/package.json, and plugin.cfg. Extend it to also update release.cfg, or let GitHub Actions handle release.cfg from the git tag.
**Warning signs:** Loxberry shows "update available" even after updating, or never detects updates.

### Pitfall 2: ARCHIVEURL Points to Wrong Asset
**What goes wrong:** The zip URL in release.cfg doesn't match the actual asset name on GitHub Releases.
**Why it happens:** Zip filename includes version; if naming convention changes, URL breaks.
**How to avoid:** Use a consistent naming convention: `zigbee-watchdog-{version}.zip`. The release.js already uses this pattern.
**Warning signs:** Loxberry reports download failure during auto-update.

### Pitfall 3: release.cfg Not Updated After Release
**What goes wrong:** A new release is created on GitHub but release.cfg still points to the old version.
**Why it happens:** Forgetting to update and push release.cfg after creating the release.
**How to avoid:** Either automate with GitHub Actions (recommended) or add release.cfg update to release.js script.
**Warning signs:** No auto-updates despite new releases being available.

### Pitfall 4: Raw GitHub URL Uses Wrong Branch
**What goes wrong:** RELEASECFG URL in plugin.cfg points to `master` but repo uses `main` (or vice versa).
**Why it happens:** GitHub changed default branch name convention.
**How to avoid:** Verify the default branch name. This repo uses `main`.
**Warning signs:** Loxberry can't fetch release.cfg (404 error).

### Pitfall 5: Zip Contains Wrong File Structure
**What goes wrong:** Auto-update installs but plugin doesn't work because files are in wrong paths.
**Why it happens:** Zip must contain files at the root level matching Loxberry's expected layout (plugin.cfg, bin/, webfrontend/, etc.)
**How to avoid:** Use `git archive` which preserves the repo structure. The existing release.js already does this correctly.
**Warning signs:** Plugin installs but pages 404 or Node.js script not found.

## Code Examples

### release.cfg Template (to create in repo)

```ini
[AUTOUPDATE]
# This file is checked by Loxberry for new releases
# When VERSION here is newer than installed, ARCHIVEURL is downloaded and installed

VERSION=0.6.2
ARCHIVEURL=https://github.com/benempson/loxberry-addons/releases/download/0.6.2/zigbee-watchdog-0.6.2.zip
INFOURL=https://github.com/benempson/loxberry-addons/releases
```
Source: Based on romanlum/LoxBerry-Plugin-Zigbee2Mqtt release.cfg format and mschlenstedt/LoxBerry-Plugin-SamplePlugin-V2-Perl

### Updated plugin.cfg [AUTOUPDATE] Section

```ini
[AUTOUPDATE]
AUTOMATIC_UPDATES=true
RELEASECFG=https://raw.githubusercontent.com/benempson/loxberry-addons/main/release.cfg
PRERELEASECFG=https://raw.githubusercontent.com/benempson/loxberry-addons/main/prerelease.cfg
```

### Enhanced release.js (Add release.cfg Update)

```javascript
// After building zip, update release.cfg
const releaseCfg = `[AUTOUPDATE]
VERSION=${newVersion}
ARCHIVEURL=https://github.com/benempson/loxberry-addons/releases/download/${newVersion}/zigbee-watchdog-${newVersion}.zip
INFOURL=https://github.com/benempson/loxberry-addons/releases
`;
fs.writeFileSync('release.cfg', releaseCfg);
console.log('Updated: release.cfg');

// Add release.cfg to the commit
execSync('git add package.json bin/package.json plugin.cfg release.cfg', { stdio: 'inherit' });
```

### GitHub Actions Workflow (release.yml)

```yaml
name: Release Plugin

on:
  release:
    types: [released]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build plugin zip
        run: |
          TAG="${{ github.event.release.tag_name }}"
          ZIP_NAME="zigbee-watchdog-${TAG}.zip"
          git archive --format=zip --output="${ZIP_NAME}" HEAD \
            plugin.cfg preinstall.sh preupgrade.sh postinstall.sh \
            uninstall/ bin/ webfrontend/ templates/ README.md
          echo "ZIP_NAME=${ZIP_NAME}" >> $GITHUB_ENV

      - name: Upload release asset
        uses: softprops/action-gh-release@v2
        with:
          files: ${{ env.ZIP_NAME }}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual zip download and install | Loxberry built-in AUTOUPDATE via release.cfg | Loxberry 1.x+ | Zero-effort updates for users |
| Manual release.cfg editing | GitHub Actions auto-update release.cfg on release | Current best practice | No forgotten updates |

## Open Questions

1. **Pre-release channel: needed now?**
   - What we know: Loxberry supports a separate prerelease.cfg for beta users
   - What's unclear: Whether the user wants a pre-release channel
   - Recommendation: Create the prerelease.cfg file but leave it pointing to the same version as release.cfg initially. Can be differentiated later if needed.

2. **GitHub Actions vs. manual `gh release create`**
   - What we know: Both approaches work. The user already has release.js that builds zips locally.
   - What's unclear: Whether the user prefers full CI/CD automation or manual control
   - Recommendation: Start with enhancing release.js to also update release.cfg and add a `gh release create` command instruction to README. Add GitHub Actions later if desired. This is simpler and the user already has the workflow muscle memory.

3. **First release for auto-update bootstrap**
   - What we know: Existing Loxberry installations have AUTOMATIC_UPDATES=false
   - What's unclear: How to transition existing installations
   - Recommendation: The user must do ONE manual install of the version that has AUTOUPDATE configured. After that, all future updates are automatic. Document this in the release notes.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.x |
| Config file | jest.config.js |
| Quick run command | `npx jest --testPathPattern=release` |
| Full suite command | `npx jest` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UPDT-01 | Loxberry checks release.cfg for newer version | manual-only | N/A - Loxberry core handles this | N/A |
| UPDT-02 | Loxberry downloads and installs from ARCHIVEURL | manual-only | N/A - Loxberry core handles this | N/A |
| UPDT-03 | Config preserved across update | manual-only | N/A - already tested via preupgrade.sh/postinstall.sh | N/A |

**Justification for manual-only:** All three requirements are satisfied by Loxberry's built-in auto-update system and existing install scripts. There is no custom code to unit-test. Validation requires a live Loxberry instance.

### Sampling Rate
- **Per task commit:** `npx jest` (existing tests still pass)
- **Per wave merge:** Full suite
- **Phase gate:** Manual verification on Loxberry: install plugin, create release, confirm auto-update triggers

### Wave 0 Gaps
None -- no new test infrastructure needed. This phase is configuration-only.

## Sources

### Primary (HIGH confidence)
- [romanlum/LoxBerry-Plugin-Zigbee2Mqtt plugin.cfg](https://raw.githubusercontent.com/romanlum/LoxBerry-Plugin-Zigbee2Mqtt/master/plugin.cfg) - Working example of AUTOUPDATE configuration
- [romanlum/LoxBerry-Plugin-Zigbee2Mqtt release.cfg](https://raw.githubusercontent.com/romanlum/LoxBerry-Plugin-Zigbee2Mqtt/master/release.cfg) - Working example of release manifest format
- [romanlum/LoxBerry-Plugin-Zigbee2Mqtt resources/release.cfg](https://raw.githubusercontent.com/romanlum/LoxBerry-Plugin-Zigbee2Mqtt/master/resources/release.cfg) - Template with __VERSION__ placeholder
- [romanlum/LoxBerry-Plugin-Zigbee2Mqtt .github/workflows/release.yml](https://github.com/romanlum/LoxBerry-Plugin-Zigbee2Mqtt/blob/master/.github/workflows) - GitHub Actions workflow for release automation
- [mschlenstedt/LoxBerry-Plugin-SamplePlugin-V2-Perl plugin.cfg](https://raw.githubusercontent.com/mschlenstedt/LoxBerry-Plugin-SamplePlugin-V2-Perl/master/plugin.cfg) - Official sample plugin with AUTOUPDATE documentation comments

### Secondary (MEDIUM confidence)
- [LoxBerry Wiki - Zigbee2MQTT Plugin](https://wiki.loxberry.de/plugins/zigbee2mqtt_plugin/start) - Confirms auto-update was enabled in v0.3.0
- [LoxBerry Wiki - Plugin Development](https://wiki.loxberry.de/entwickler/plugin_fur_den_loxberry_entwickeln_ab_version_1x/start) - AUTOUPDATE section documentation with comments

### Tertiary (LOW confidence)
- Loxberry wiki FAQ page for auto/manual plugin updates does not exist yet (returns empty page)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - verified against two working Loxberry plugins (zigbee2mqtt + sample plugin)
- Architecture: HIGH - release.cfg format and plugin.cfg AUTOUPDATE section confirmed from multiple sources
- Pitfalls: MEDIUM - based on known issues from zigbee2mqtt plugin GitHub issues and general release management experience

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable mechanism, unlikely to change)
