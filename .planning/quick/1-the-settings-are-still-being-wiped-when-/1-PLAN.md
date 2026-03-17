---
phase: quick-fix
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - preupgrade.sh
  - preinstall.sh
  - postinstall.sh
autonomous: true
must_haves:
  truths:
    - "User config (watchdog.cfg) survives plugin upgrade"
    - "Fresh install creates default config"
    - "State data (state.json, database.db) survives plugin upgrade"
  artifacts:
    - path: "preupgrade.sh"
      provides: "Config backup before purge_installation deletes directories"
    - path: "preinstall.sh"
      provides: "Kept for fresh install compatibility (no-op on upgrade)"
    - path: "postinstall.sh"
      provides: "Restores backed-up config and data after file extraction"
  key_links:
    - from: "preupgrade.sh"
      to: "postinstall.sh"
      via: "/tmp/zigbee_watchdog_cfg_backup and /tmp/zigbee_watchdog_data_backup/"
      pattern: "zigbee_watchdog.*backup"
---

<objective>
Fix settings being wiped on plugin upgrade (in-place install).

Root cause: Loxberry's plugin upgrade sequence is:
1. preupgrade.sh runs
2. purge_installation() DELETES config/, bin/, data/ directories
3. preinstall.sh runs (TOO LATE -- config already gone)
4. Files extracted from zip
5. postinstall.sh runs

The current preinstall.sh tries to back up watchdog.cfg, but by the time it runs,
purge_installation has already deleted the config directory. The backup must happen
in preupgrade.sh (step 1), before the purge.

Additionally, the data directory (state.json, database.db) is also purged and should
be backed up too.

Note: All scripts receive 6 arguments from Loxberry's plugininstall.pl:
$1=tempfile, $2=pname, $3=pfolder, $4=pversion, $5=lbhomedir, $6=tempfolder.
LBHOMEDIR is also available as an environment variable on Loxberry systems.

Output: Fixed preupgrade.sh, preinstall.sh, postinstall.sh
</objective>

<context>
@preinstall.sh
@postinstall.sh
@plugin.cfg
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create preupgrade.sh and update preinstall.sh</name>
  <files>preupgrade.sh, preinstall.sh</files>
  <action>
Create preupgrade.sh that backs up config AND data before purge_installation runs:

```bash
#!/bin/bash
# preupgrade.sh -- runs as user 'loxberry' BEFORE purge_installation
# Purpose: Back up user config and data so they survive upgrade
# Arguments: $1=tempfile $2=pname $3=pfolder $4=pversion $5=lbhomedir $6=tempfolder

ARGV3=$3  # plugin folder

PCONFIG=$LBHOMEDIR/config/plugins/$ARGV3
PDATA=$LBHOMEDIR/data/plugins/$ARGV3

# Back up existing config if present
if [ -f "$PCONFIG/watchdog.cfg" ]; then
    echo "<INFO> Backing up existing configuration"
    cp "$PCONFIG/watchdog.cfg" "/tmp/zigbee_watchdog_cfg_backup"
fi

# Back up existing data directory if present (state.json, database.db)
if [ -d "$PDATA" ]; then
    echo "<INFO> Backing up existing data directory"
    mkdir -p "/tmp/zigbee_watchdog_data_backup"
    cp -a "$PDATA"/* "/tmp/zigbee_watchdog_data_backup/" 2>/dev/null || true
fi

exit 0
```

Update preinstall.sh to be a minimal no-op (backup now handled by preupgrade.sh):

```bash
#!/bin/bash
# preinstall.sh -- runs as user 'loxberry' BEFORE files are extracted
# Note: Config backup is handled by preupgrade.sh (runs before purge)
# This script is kept for fresh-install compatibility but is a no-op.

exit 0
```

Both files must have Unix line endings (LF) and be executable.
  </action>
  <verify>
    <automated>bash -n preupgrade.sh && bash -n preinstall.sh && echo "syntax ok"</automated>
  </verify>
  <done>preupgrade.sh backs up config + data before purge; preinstall.sh is a clean no-op</done>
</task>

<task type="auto">
  <name>Task 2: Update postinstall.sh to restore data directory too</name>
  <files>postinstall.sh</files>
  <action>
Update postinstall.sh to also restore the data directory backup (not just config).
After the config restore block (step 2), add a data restore step before npm install:

After the existing config restore logic, add:

```bash
# 2b. Restore backed-up data from preupgrade
if [ -d "/tmp/zigbee_watchdog_data_backup" ]; then
    echo "<OK> Restoring existing data from backup"
    mkdir -p "$PDATA"
    cp -a /tmp/zigbee_watchdog_data_backup/* "$PDATA/" 2>/dev/null || true
    chown -R loxberry:loxberry "$PDATA"
    rm -rf "/tmp/zigbee_watchdog_data_backup"
fi
```

Keep everything else in postinstall.sh the same. The mkdir -p for PDATA (step 1) already
exists and should remain -- it handles the fresh install case.

The file must have Unix line endings (LF).
  </action>
  <verify>
    <automated>bash -n postinstall.sh && grep -q "zigbee_watchdog_data_backup" postinstall.sh && echo "ok"</automated>
  </verify>
  <done>postinstall.sh restores both config and data backups on upgrade; fresh install unchanged</done>
</task>

</tasks>

<verification>
1. `bash -n preupgrade.sh` -- no syntax errors
2. `bash -n preinstall.sh` -- no syntax errors
3. `bash -n postinstall.sh` -- no syntax errors
4. `grep "zigbee_watchdog_cfg_backup" preupgrade.sh` -- config backup in preupgrade
5. `grep "zigbee_watchdog_data_backup" preupgrade.sh` -- data backup in preupgrade
6. `grep "zigbee_watchdog_data_backup" postinstall.sh` -- data restore in postinstall
7. `grep -c "zigbee_watchdog_cfg_backup" preinstall.sh` -- should be 0 (moved to preupgrade)
</verification>

<success_criteria>
- preupgrade.sh exists and backs up config + data BEFORE purge_installation runs
- preinstall.sh is a clean no-op (backup logic moved to preupgrade.sh)
- postinstall.sh restores both config and data from backup
- All three scripts pass bash -n syntax check
- Fresh install still creates default config (postinstall.sh elif branch unchanged)
</success_criteria>
