#!/bin/bash
# preinstall.sh -- runs as user 'loxberry' BEFORE files are extracted
# Purpose: Back up user config so it survives upgrade

ARGV1=$1  # temp folder
ARGV2=$2  # plugin name
ARGV3=$3  # plugin folder

PCONFIG=$LBHOMEDIR/config/plugins/$ARGV3

# Back up existing config if present
if [ -f "$PCONFIG/watchdog.cfg" ]; then
    echo "<INFO> Backing up existing configuration"
    cp "$PCONFIG/watchdog.cfg" "/tmp/zigbee_watchdog_cfg_backup"
fi

exit 0
