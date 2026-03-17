# Zigbee Device Monitor
A Loxberry plugin that monitors Zigbee devices via zigbee2mqtt and alerts when devices go offline or have low battery.

## Prerequisites
- [Loxberry](https://www.loxberry.de/) 2.0 or later
- [Zigbee2MQTT](https://www.zigbee2mqtt.io/) running and connected to a Mosquitto MQTT broker
- Node.js (typically installed with the Zigbee2MQTT plugin)

## Features
- Monitors 50+ Zigbee devices for offline status and low battery
- Configurable thresholds (default: 24h offline, 25% battery)
- Alerts via Loxberry notifications and/or SMTP email
- Device exclusion list for devices that legitimately report rarely
- Bridge offline detection
- Web UI for all configuration and device status overview

## Build
git archive --format=zip --output=zigbee-watchdog-0.1.0.zip HEAD plugin.cfg preinstall.sh preupgrade.sh postinstall.sh uninstall/ bin/ webfrontend/ templates/ README.md

node -e "const v=require('./package.json').version; require('child_process').execSync('git archive --format=zip --output=zigbee-watchdog-'+v+'.zip HEAD plugin.cfg preinstall.sh preupgrade.sh postinstall.sh uninstall/ bin/ webfrontend/ templates/ README.md', {stdio:'inherit'}); console.log('Built: zigbee-watchdog-'+v+'.zip')"

## Installation
1. Download the latest release ZIP
2. In Loxberry Admin, go to Plugin Management
3. Upload and install the ZIP file
4. Navigate to the plugin configuration page
5. Configure your MQTT broker connection (default: localhost:1883)
6. Enable your preferred notification method (Loxberry notifications and/or email)

## Configuration
All settings are available through the Loxberry web UI under the plugin's configuration page:

- **MQTT**: Broker host, port, base topic, credentials
- **Thresholds**: Offline hours, battery percentage
- **Notifications**: Loxberry notifications, SMTP email settings
- **Cron Interval**: How often the watchdog runs (default: every 60 minutes)
- **Exclusions**: Devices to skip during monitoring
- **Device Status**: View all tracked devices with current status

## Version
0.1.0 (pre-release)

## Author
Ben Empson
