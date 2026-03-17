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

## Installation

1. Download the latest release ZIP from [Releases](https://github.com/benempson/loxberry-addons/releases)
2. In Loxberry Admin, go to Plugin Management
3. Upload and install the ZIP file
4. Navigate to the plugin configuration page
5. Configure your zigbee2mqtt data path (auto-detected if zigbee2mqtt is in a standard location)
6. Enable your preferred notification method (Loxberry notifications and/or email)

## Auto-Updates

After the initial manual install, the plugin updates itself automatically via Loxberry's built-in auto-update system.

Loxberry checks for new plugin versions once per day (via its scheduled update check). When a new version is detected, it downloads and installs the update automatically. Your configuration and device state data are preserved across updates.

To trigger an update check immediately, go to **Loxberry Admin → Plugin Management** and click the **Check for updates** button. If an update is available, you can install it from there.

## Configuration

All settings are available through the Loxberry web UI under the plugin's configuration page:

- **Settings**: zigbee2mqtt data path, offline threshold (hours), battery threshold (%), cron interval
- **Notifications**: Loxberry notifications, SMTP email settings
- **Device Status**: View all tracked devices with current status, link quality, and alert state
- **Blinds**: Dedicated tab for MS-108ZR cover devices

## Releasing a New Version

```bash
npm run release           # patch bump (default): 0.7.0 → 0.7.1
npm run release -- minor  # minor bump: 0.7.0 → 0.8.0
npm run release -- major  # major bump: 0.7.0 → 1.0.0
```

This single command handles the entire release process:
1. Bumps the version in `package.json`, `bin/package.json`, `plugin.cfg`, and `release.cfg`
2. Commits the version bump
3. Builds the release zip
4. Pushes to GitHub
5. Creates a GitHub Release with the zip attached and auto-generated release notes

The GitHub Actions workflow then updates `release.cfg` on main, which is what Loxberry polls to detect new versions.

## Author
Ben Empson
