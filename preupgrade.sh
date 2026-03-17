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
