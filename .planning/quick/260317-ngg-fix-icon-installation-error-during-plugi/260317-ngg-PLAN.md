---
phase: quick
plan: 260317-ngg
type: execute
wave: 1
depends_on: []
files_modified:
  - icons/icon_64.png
  - icons/icon_128.png
  - release.js
autonomous: true
requirements: []
must_haves:
  truths:
    - "Plugin installs without icon-related error messages"
    - "Plugin shows its own icon in LoxBerry plugin list instead of default"
  artifacts:
    - path: "icons/icon_64.png"
      provides: "64x64 plugin icon for LoxBerry"
    - path: "icons/icon_128.png"
      provides: "128x128 plugin icon for LoxBerry"
    - path: "release.js"
      provides: "Build script including icons/ in zip archive"
  key_links:
    - from: "release.js"
      to: "icons/"
      via: "git archive files list"
      pattern: "icons/"
---

<objective>
Fix the icon installation error that occurs during plugin install: "ERROR Zigbee Device Monitor: ICON files: Icons could not be (completely) installed. Using some default icons."

Purpose: LoxBerry's plugin installer expects icon_64.png and icon_128.png in an icons/ directory. The plugin currently has no icons/ directory at all, causing the installer to log an error and fall back to default icons.

Output: icons/icon_64.png, icons/icon_128.png created; release.js updated to include icons/ in the zip archive.
</objective>

<execution_context>
@C:/Users/Ben/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Ben/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@release.js
@plugin.cfg
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create plugin icon files</name>
  <files>icons/icon_64.png, icons/icon_128.png</files>
  <action>
Create an `icons/` directory at the repo root. Generate two PNG icon files for the Zigbee Device Monitor plugin:

1. `icons/icon_64.png` — 64x64 pixel PNG
2. `icons/icon_128.png` — 128x128 pixel PNG

The icons should represent a Zigbee/wireless monitoring concept. Use a simple, clean design suitable for a plugin list. Options for generation:
- Use ImageMagick (`convert`) to create a simple colored square/circle with "Z" or a zigbee-like symbol
- If ImageMagick is not available, use Python with Pillow to generate the icons
- The icon should have a distinct color (e.g., green or blue on transparent/white background) so it is recognizable in the LoxBerry plugin list

Example ImageMagick approach:
```
convert -size 128x128 xc:transparent -fill "#4CAF50" -draw "circle 64,64 64,10" -fill white -font Arial -pointsize 48 -gravity center -annotate 0 "Z" icons/icon_128.png
convert icons/icon_128.png -resize 64x64 icons/icon_64.png
```

If neither tool is available, create minimal valid PNG files programmatically using Python's struct module (a solid-color 1-bit PNG is sufficient to satisfy LoxBerry's installer).
  </action>
  <verify>
    <automated>test -f icons/icon_64.png && test -f icons/icon_128.png && file icons/icon_64.png | grep -q PNG && file icons/icon_128.png | grep -q PNG && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>Both icon_64.png and icon_128.png exist as valid PNG files in the icons/ directory</done>
</task>

<task type="auto">
  <name>Task 2: Add icons/ to release build zip</name>
  <files>release.js</files>
  <action>
In `release.js`, add `'icons/'` to the `files` array used by the `git archive` command (line 55-57). Insert it alongside the other directories like `uninstall/`, `bin/`, etc.

The files array should become:
```javascript
const files = [
  'plugin.cfg', 'preinstall.sh', 'preupgrade.sh', 'postinstall.sh',
  'uninstall/', 'bin/', 'webfrontend/', 'templates/', 'icons/', 'README.md',
].join(' ');
```

This ensures the icon files are included in the release zip that LoxBerry's installer processes.
  </action>
  <verify>
    <automated>grep -q "icons/" release.js && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>release.js includes icons/ in the git archive files list so icons are packaged in every release zip</done>
</task>

</tasks>

<verification>
- Both PNG files exist and are valid images
- release.js includes icons/ in the archive file list
- No other files modified
</verification>

<success_criteria>
- icons/icon_64.png exists as a valid 64x64 PNG
- icons/icon_128.png exists as a valid 128x128 PNG
- release.js git archive command includes icons/ directory
- Plugin can be installed without the "ICON files" error
</success_criteria>

<output>
After completion, create `.planning/quick/260317-ngg-fix-icon-installation-error-during-plugi/260317-ngg-SUMMARY.md`
</output>
