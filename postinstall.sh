#!/bin/bash
# postinstall.sh -- runs as user 'loxberry' after install/upgrade
# Exit codes: 0=success, 1=warning, 2=fatal

ARGV1=$1  # temp folder
ARGV2=$2  # plugin name
ARGV3=$3  # plugin folder
ARGV4=$4  # plugin version
ARGV5=$5  # loxberry base

PCONFIG=$LBHOMEDIR/config/plugins/$ARGV3
PDATA=$LBHOMEDIR/data/plugins/$ARGV3
PBIN=$LBHOMEDIR/bin/plugins/$ARGV3
PLOG=$LBHOMEDIR/log/plugins/$ARGV3

echo "<INFO> Zigbee Device Monitor v$ARGV4 - postinstall starting"

# 1. Create data directory
echo "<INFO> Creating data directory"
mkdir -p "$PDATA"
chown loxberry:loxberry "$PDATA"

# 2. Restore backed-up config from preupgrade, or create default
if [ -f "/tmp/zigbee_watchdog_cfg_backup" ]; then
    echo "<OK> Restoring existing configuration from backup"
    cp "/tmp/zigbee_watchdog_cfg_backup" "$PCONFIG/watchdog.cfg"
    chown loxberry:loxberry "$PCONFIG/watchdog.cfg"
    rm -f "/tmp/zigbee_watchdog_cfg_backup"
elif [ ! -f "$PCONFIG/watchdog.cfg" ]; then
    echo "<INFO> Creating default configuration"
    cat > "$PCONFIG/watchdog.cfg" << 'CFGEOF'
[Z2M]
z2m_data_path =

[THRESHOLDS]
offline_hours = 24
battery_pct = 25

[CRON]
interval_minutes = 60

[NOTIFICATIONS]
loxberry_enabled = 0
email_enabled = 0
smtp_host =
smtp_port = 587
smtp_user =
smtp_pass =
smtp_from =
smtp_to =
heartbeat_enabled = 0

[EXCLUSIONS]
devices =
CFGEOF
    chown loxberry:loxberry "$PCONFIG/watchdog.cfg"
else
    echo "<OK> Existing configuration preserved"
fi

# 2b. Restore backed-up data from preupgrade
if [ -d "/tmp/zigbee_watchdog_data_backup" ]; then
    echo "<OK> Restoring existing data from backup"
    mkdir -p "$PDATA"
    cp -a /tmp/zigbee_watchdog_data_backup/* "$PDATA/" 2>/dev/null || true
    chown -R loxberry:loxberry "$PDATA"
    rm -rf "/tmp/zigbee_watchdog_data_backup"
fi

# 3. Install Node.js dependencies
echo "<INFO> Installing Node.js dependencies"
cd "$PBIN" && npm install --production 2>&1
if [ $? -ne 0 ]; then
    echo "<WARNING> npm install had issues -- plugin may not work correctly"
fi

# 4. Register cron job (reads interval from config or uses default)
echo "<INFO> Registering cron job"
INTERVAL=60
if [ -f "$PCONFIG/watchdog.cfg" ]; then
    INTERVAL=$(grep -E "^interval_minutes" "$PCONFIG/watchdog.cfg" | sed 's/.*=\s*//' | tr -d '[:space:]')
    [ -z "$INTERVAL" ] && INTERVAL=60
fi

# Build cron expression from interval
if [ "$INTERVAL" -lt 60 ] 2>/dev/null; then
    CRON_EXPR="*/$INTERVAL * * * *"
elif [ "$INTERVAL" -lt 1440 ] 2>/dev/null; then
    HOURS=$((INTERVAL / 60))
    if [ "$HOURS" -eq 1 ]; then
        CRON_EXPR="0 * * * *"
    else
        CRON_EXPR="0 */$HOURS * * *"
    fi
else
    CRON_EXPR="0 3 * * *"
fi

CRON_FILE="$PDATA/${ARGV3}_cron"
echo "$CRON_EXPR loxberry /usr/bin/node $PBIN/watchdog.js > /dev/null 2>&1" > "$CRON_FILE"
# Ensure destination cron file exists (installcrontab.sh requires it)
CRON_DEST="$LBHOMEDIR/system/cron/cron.d/$ARGV3"
if [ ! -e "$CRON_DEST" ]; then
    sudo touch "$CRON_DEST"
fi
sudo $LBHOMEDIR/sbin/installcrontab.sh "$ARGV3" "$CRON_FILE" 2>&1
rm -f "$CRON_FILE"

# 5. Check Node.js availability
if ! command -v node > /dev/null 2>&1; then
    echo "<WARNING> Node.js not found -- plugin requires Node.js to run"
fi

echo "<OK> Zigbee Device Monitor postinstall complete"
exit 0
