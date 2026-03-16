<?php
/**
 * Zigbee Watchdog - Configuration Page
 *
 * Loxberry plugin web interface for configuring MQTT, thresholds,
 * notifications, exclusions, and viewing device status.
 */

// Loxberry SDK
require_once "loxberry_system.php";
require_once "loxberry_web.php";

// Language support
$L = LBSystem::readlanguage("language.ini");

// Config file path
$cfgfile = LBPCONFIGDIR . "/watchdog.cfg";

// ------------------------------------------------------------------
// Default values (must match bin/lib/config.js DEFAULTS)
// ------------------------------------------------------------------
$defaults = array(
    'MQTT' => array(
        'host'       => 'localhost',
        'port'       => '1883',
        'base_topic' => 'zigbee2mqtt',
        'username'   => '',
        'password'   => '',
    ),
    'THRESHOLDS' => array(
        'offline_hours' => '24',
        'battery_pct'   => '25',
    ),
    'CRON' => array(
        'interval_minutes' => '60',
        'drain_seconds'    => '3',
    ),
    'NOTIFICATIONS' => array(
        'loxberry_enabled'  => '0',
        'email_enabled'     => '0',
        'smtp_host'         => '',
        'smtp_port'         => '587',
        'smtp_user'         => '',
        'smtp_pass'         => '',
        'smtp_from'         => '',
        'smtp_to'           => '',
        'heartbeat_enabled' => '0',
    ),
    'EXCLUSIONS' => array(
        'devices' => '',
    ),
);

// ------------------------------------------------------------------
// INI Read helpers
// ------------------------------------------------------------------

/**
 * Read config using Config_Lite if available, else parse_ini_file fallback.
 * Returns a nested array merged over defaults.
 */
function read_config($cfgfile, $defaults) {
    $config = $defaults;

    // Try Config_Lite first
    $config_lite_path = LBHOMEDIR . '/libs/phplib/Config/Lite.php';
    if (file_exists($config_lite_path)) {
        require_once $config_lite_path;
        if (file_exists($cfgfile)) {
            try {
                $cfg = new Config_Lite($cfgfile, LOCK_EX, INI_SCANNER_RAW);
                foreach ($defaults as $section => $keys) {
                    foreach ($keys as $key => $default) {
                        try {
                            $val = $cfg->get($section, $key);
                            if ($val !== null) {
                                $config[$section][$key] = $val;
                            }
                        } catch (Exception $e) {
                            // Key not in file, keep default
                        }
                    }
                }
            } catch (Exception $e) {
                error_log("Zigbee Watchdog: Config_Lite read error: " . $e->getMessage());
            }
        }
        return $config;
    }

    // Fallback: parse_ini_file
    if (file_exists($cfgfile)) {
        $parsed = parse_ini_file($cfgfile, true, INI_SCANNER_RAW);
        if ($parsed !== false) {
            foreach ($defaults as $section => $keys) {
                if (isset($parsed[$section])) {
                    foreach ($keys as $key => $default) {
                        if (isset($parsed[$section][$key])) {
                            $config[$section][$key] = $parsed[$section][$key];
                        }
                    }
                }
            }
        }
    }

    return $config;
}

/**
 * Write config to INI file.
 * Uses Config_Lite if available, manual write as fallback.
 * Values containing ; or = are double-quoted for ini@5.x compatibility.
 */
function write_config($cfgfile, $config) {
    $config_lite_path = LBHOMEDIR . '/libs/phplib/Config/Lite.php';
    if (file_exists($config_lite_path)) {
        require_once $config_lite_path;
        // Create new Config_Lite or load existing
        try {
            if (file_exists($cfgfile)) {
                $cfg = new Config_Lite($cfgfile, LOCK_EX, INI_SCANNER_RAW);
            } else {
                // Write a blank file so Config_Lite can open it
                file_put_contents($cfgfile, '');
                $cfg = new Config_Lite($cfgfile, LOCK_EX, INI_SCANNER_RAW);
            }
            foreach ($config as $section => $keys) {
                foreach ($keys as $key => $value) {
                    $cfg->set($section, $key, $value);
                }
            }
            $cfg->save();
            return true;
        } catch (Exception $e) {
            error_log("Zigbee Watchdog: Config_Lite write error: " . $e->getMessage());
            // Fall through to manual write
        }
    }

    // Manual INI write fallback
    $output = '';
    foreach ($config as $section => $keys) {
        $output .= "[{$section}]\n";
        foreach ($keys as $key => $value) {
            // Quote values containing ; or = to prevent ini@5.x comment stripping
            if (strpos($value, ';') !== false || strpos($value, '=') !== false) {
                $value = '"' . $value . '"';
            }
            $output .= "{$key} = {$value}\n";
        }
        $output .= "\n";
    }

    $dir = dirname($cfgfile);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    return file_put_contents($cfgfile, $output, LOCK_EX) !== false;
}

// ------------------------------------------------------------------
// Load state.json for Exclusions and Status tabs
// ------------------------------------------------------------------
$state_file = LBPDATADIR . '/state.json';
$state_missing = true;
$state = array();
$devices = array();

if (file_exists($state_file)) {
    $state_raw = file_get_contents($state_file);
    if ($state_raw !== false && $state_raw !== '') {
        $state = json_decode($state_raw, true);
        if (is_array($state) && isset($state['devices']) && is_array($state['devices'])) {
            $devices = $state['devices'];
            $state_missing = false;
        }
    }
}

// ------------------------------------------------------------------
// Helper: collect settings form values into config array
// ------------------------------------------------------------------
function collect_form_config($defaults, $cfgfile) {
    $new_config = array(
        'MQTT' => array(
            'host'       => trim($_POST['mqtt_host'] ?? ''),
            'port'       => trim($_POST['mqtt_port'] ?? '1883'),
            'base_topic' => trim($_POST['mqtt_topic'] ?? 'zigbee2mqtt'),
            'username'   => trim($_POST['mqtt_user'] ?? ''),
            'password'   => $_POST['mqtt_pass'] ?? '',
        ),
        'THRESHOLDS' => array(
            'offline_hours' => trim($_POST['offline_hours'] ?? '24'),
            'battery_pct'   => trim($_POST['battery_pct'] ?? '25'),
        ),
        'CRON' => array(
            'interval_minutes' => trim($_POST['cron_interval'] ?? '60'),
            'drain_seconds'    => trim($_POST['drain_seconds'] ?? '3'),
        ),
        'NOTIFICATIONS' => array(
            'loxberry_enabled'  => ($_POST['lb_notify'] ?? '0') === '1' ? '1' : '0',
            'email_enabled'     => ($_POST['email_enabled'] ?? '0') === '1' ? '1' : '0',
            'smtp_host'         => trim($_POST['smtp_host'] ?? ''),
            'smtp_port'         => trim($_POST['smtp_port'] ?? '587'),
            'smtp_user'         => trim($_POST['smtp_user'] ?? ''),
            'smtp_pass'         => $_POST['smtp_pass'] ?? '',
            'smtp_from'         => trim($_POST['smtp_from'] ?? ''),
            'smtp_to'           => trim($_POST['smtp_to'] ?? ''),
            'heartbeat_enabled' => ($_POST['heartbeat'] ?? '0') === '1' ? '1' : '0',
        ),
    );
    // Preserve EXCLUSIONS from existing config
    $current = read_config($cfgfile, $defaults);
    $new_config['EXCLUSIONS'] = $current['EXCLUSIONS'];
    return $new_config;
}

// ------------------------------------------------------------------
// POST handler: Save Settings / Test MQTT / Test Email
// ------------------------------------------------------------------
$error = '';
$msg = isset($_GET['msg']) ? $_GET['msg'] : '';
$test_result = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {

    if ($_POST['action'] === 'test_mqtt') {
        set_time_limit(45);
        // Save current form settings so test script reads latest values
        $new_config = collect_form_config($defaults, $cfgfile);
        write_config($cfgfile, $new_config);
        // Run MQTT test
        $output = array();
        $retval = -1;
        exec('node ' . LBPBINDIR . '/test-mqtt.js 2>&1', $output, $retval);
        $test_result = array('type' => 'mqtt', 'success' => ($retval === 0), 'message' => implode("\n", $output));
    }

    if ($_POST['action'] === 'test_email') {
        set_time_limit(45);
        // Save current form settings so test script reads latest values
        $new_config = collect_form_config($defaults, $cfgfile);
        write_config($cfgfile, $new_config);
        // Run email test
        $output = array();
        $retval = -1;
        exec('node ' . LBPBINDIR . '/test-email.js 2>&1', $output, $retval);
        $test_result = array('type' => 'email', 'success' => ($retval === 0), 'message' => implode("\n", $output));
    }

    if ($_POST['action'] === 'save_settings') {
        $new_config = collect_form_config($defaults, $cfgfile);

        // Server-side validation
        $errors = array();
        $port = intval($new_config['MQTT']['port']);
        if ($port < 1 || $port > 65535) {
            $errors[] = 'MQTT port must be between 1 and 65535.';
        }
        $offline = intval($new_config['THRESHOLDS']['offline_hours']);
        if ($offline < 1) {
            $errors[] = 'Offline hours must be at least 1.';
        }
        $battery = intval($new_config['THRESHOLDS']['battery_pct']);
        if ($battery < 1 || $battery > 100) {
            $errors[] = 'Battery threshold must be between 1 and 100.';
        }
        $interval = intval($new_config['CRON']['interval_minutes']);
        if ($interval < 1) {
            $errors[] = 'Check interval must be at least 1 minute.';
        }
        $drain = intval($new_config['CRON']['drain_seconds']);
        if ($drain < 1 || $drain > 30) {
            $errors[] = 'Drain time must be between 1 and 30 seconds.';
        }
        $smtp_port = intval($new_config['NOTIFICATIONS']['smtp_port']);
        if ($new_config['NOTIFICATIONS']['email_enabled'] === '1' && ($smtp_port < 1 || $smtp_port > 65535)) {
            $errors[] = 'SMTP port must be between 1 and 65535.';
        }

        if (!empty($errors)) {
            $error = implode(' ', $errors);
        } else {
            if (write_config($cfgfile, $new_config)) {
                header('Location: index.php?msg=saved');
                exit;
            } else {
                $error = $L['MESSAGES.SAVE_ERROR'] . 'Could not write config file.';
            }
        }
    }

    if ($_POST['action'] === 'save_exclusions') {
        $excluded = isset($_POST['excluded']) && is_array($_POST['excluded']) ? $_POST['excluded'] : array();
        // Sanitize: keep only valid-looking IEEE addresses
        $excluded = array_filter($excluded, function($v) {
            return preg_match('/^0x[0-9a-fA-F]+$/', $v);
        });
        $current = read_config($cfgfile, $defaults);
        $current['EXCLUSIONS']['devices'] = implode(',', $excluded);
        if (write_config($cfgfile, $current)) {
            header('Location: index.php?tab=exclusions&msg=saved');
            exit;
        } else {
            $error = 'Could not write config file.';
        }
    }

    if ($_POST['action'] === 'refresh') {
        exec('node ' . LBPBINDIR . '/watchdog.js 2>&1', $output, $retval);
        $refresh_msg = ($retval === 0) ? 'refresh_ok' : 'refresh_fail';
        header('Location: index.php?tab=status&msg=' . $refresh_msg);
        exit;
    }
}

// ------------------------------------------------------------------
// Read current config for form pre-fill
// ------------------------------------------------------------------
$config = read_config($cfgfile, $defaults);

// ------------------------------------------------------------------
// Exclusion list from INI
// ------------------------------------------------------------------
$excluded_iees = array();
$excl_raw = trim($config['EXCLUSIONS']['devices']);
if ($excl_raw !== '') {
    $excluded_iees = array_map('trim', explode(',', $excl_raw));
}

// ------------------------------------------------------------------
// Helper: format age from seconds to human-readable string
// ------------------------------------------------------------------
function formatAge($seconds) {
    if ($seconds < 60) return 'just now';
    if ($seconds < 3600) return floor($seconds / 60) . 'm ago';
    if ($seconds < 86400) return floor($seconds / 3600) . 'h ago';
    return floor($seconds / 86400) . 'd ago';
}

// ------------------------------------------------------------------
// Build sorted device list for Exclusions tab
// ------------------------------------------------------------------
$sorted_devices = array();
foreach ($devices as $ieee => $dev) {
    $sorted_devices[$ieee] = isset($dev['friendly_name']) ? $dev['friendly_name'] : $ieee;
}
asort($sorted_devices); // alphabetical by friendly name

// ------------------------------------------------------------------
// Build table rows for Status tab
// ------------------------------------------------------------------
$table_rows = array();
$now = time();
foreach ($devices as $ieee => $dev) {
    $name = isset($dev['friendly_name']) ? $dev['friendly_name'] : $ieee;
    $last_seen = isset($dev['last_seen']) && $dev['last_seen'] ? $dev['last_seen'] : null;
    $last_seen_ts = $last_seen ? strtotime($last_seen) : 0;
    $last_seen_age = $last_seen_ts > 0 ? formatAge($now - $last_seen_ts) : 'Never';

    $battery = null;
    $battery_sort = -1;
    $power_source = isset($dev['power_source']) ? $dev['power_source'] : '';
    if (strtolower($power_source) !== 'mains' && isset($dev['battery'])) {
        $battery = intval($dev['battery']);
        $battery_sort = $battery;
    }

    // Determine alert status
    $alert_status = 'OK';
    $sort_priority = 3;
    $alerts = isset($dev['alerts']) ? $dev['alerts'] : array();
    if (isset($alerts['offline']['active']) && $alerts['offline']['active']) {
        $alert_status = 'Offline';
        $sort_priority = 0;
    } elseif (isset($alerts['battery']['active']) && $alerts['battery']['active']) {
        $alert_status = 'Low Battery';
        $sort_priority = 1;
    }
    // Excluded overrides OK but not alerts
    if ($sort_priority > 1 && in_array($ieee, $excluded_iees)) {
        $alert_status = 'Excluded';
        $sort_priority = 2;
    }

    $table_rows[] = array(
        'ieee' => $ieee,
        'name' => $name,
        'last_seen_age' => $last_seen_age,
        'last_seen_ts' => $last_seen_ts,
        'battery' => $battery,
        'battery_sort' => $battery_sort,
        'alert_status' => $alert_status,
        'sort_priority' => $sort_priority,
    );
}

// Default sort: alerts first (by priority), then alphabetical by name
usort($table_rows, function($a, $b) {
    if ($a['sort_priority'] !== $b['sort_priority']) {
        return $a['sort_priority'] - $b['sort_priority'];
    }
    return strcasecmp($a['name'], $b['name']);
});

// ------------------------------------------------------------------
// Navbar (Loxberry SDK tabs)
// ------------------------------------------------------------------
$tab = isset($_GET['tab']) ? $_GET['tab'] : 'settings';

$navbar[1]['Name'] = $L['NAV.SETTINGS'];
$navbar[1]['URL']  = 'index.php';
if ($tab === 'settings') $navbar[1]['active'] = true;

$navbar[2]['Name'] = $L['NAV.EXCLUSIONS'];
$navbar[2]['URL']  = 'index.php?tab=exclusions';
if ($tab === 'exclusions') $navbar[2]['active'] = true;

$navbar[3]['Name'] = $L['NAV.STATUS'];
$navbar[3]['URL']  = 'index.php?tab=status';
if ($tab === 'status') $navbar[3]['active'] = true;

// ------------------------------------------------------------------
// Header
// ------------------------------------------------------------------
LBWeb::lbheader("Zigbee Watchdog", "https://github.com/", "");

?>

<!-- Flash messages -->
<?php if ($msg === 'saved'): ?>
<div style="background:#4CAF50;color:#fff;padding:10px 15px;margin:10px 0;border-radius:4px;">
    <?php echo htmlspecialchars($L['MESSAGES.SAVED']); ?>
</div>
<?php endif; ?>

<?php if (!empty($error)): ?>
<div style="background:#f44336;color:#fff;padding:10px 15px;margin:10px 0;border-radius:4px;">
    <?php echo htmlspecialchars($error); ?>
</div>
<?php endif; ?>

<!-- Tab content container -->
<div data-role="tabs">
    <div data-role="navbar">
        <ul>
            <li><a href="#tab-settings" <?php echo $tab === 'settings' ? 'class="ui-btn-active"' : ''; ?>><?php echo htmlspecialchars($L['NAV.SETTINGS']); ?></a></li>
            <li><a href="#tab-exclusions" <?php echo $tab === 'exclusions' ? 'class="ui-btn-active"' : ''; ?>><?php echo htmlspecialchars($L['NAV.EXCLUSIONS']); ?></a></li>
            <li><a href="#tab-status" <?php echo $tab === 'status' ? 'class="ui-btn-active"' : ''; ?>><?php echo htmlspecialchars($L['NAV.STATUS']); ?></a></li>
        </ul>
    </div>

    <!-- ============================================================ -->
    <!-- SETTINGS TAB                                                  -->
    <!-- ============================================================ -->
    <div id="tab-settings">
        <form method="post" action="index.php" data-ajax="false">
            <input type="hidden" name="action" id="form-action" value="save_settings">

            <!-- MQTT Section -->
            <h3><?php echo htmlspecialchars($L['SETTINGS.SECTION_MQTT']); ?></h3>

            <div data-role="fieldcontain">
                <label for="mqtt_host"><?php echo htmlspecialchars($L['SETTINGS.MQTT_HOST']); ?></label>
                <input type="text" name="mqtt_host" id="mqtt_host"
                       value="<?php echo htmlspecialchars($config['MQTT']['host']); ?>"
                       required placeholder="localhost">
            </div>

            <div data-role="fieldcontain">
                <label for="mqtt_port"><?php echo htmlspecialchars($L['SETTINGS.MQTT_PORT']); ?></label>
                <input type="number" name="mqtt_port" id="mqtt_port"
                       value="<?php echo htmlspecialchars($config['MQTT']['port']); ?>"
                       required min="1" max="65535">
            </div>

            <div data-role="fieldcontain">
                <label for="mqtt_topic"><?php echo htmlspecialchars($L['SETTINGS.MQTT_TOPIC']); ?></label>
                <input type="text" name="mqtt_topic" id="mqtt_topic"
                       value="<?php echo htmlspecialchars($config['MQTT']['base_topic']); ?>"
                       required placeholder="zigbee2mqtt">
            </div>

            <div data-role="fieldcontain">
                <label for="mqtt_user"><?php echo htmlspecialchars($L['SETTINGS.MQTT_USER']); ?></label>
                <input type="text" name="mqtt_user" id="mqtt_user"
                       value="<?php echo htmlspecialchars($config['MQTT']['username']); ?>"
                       placeholder="">
            </div>

            <div data-role="fieldcontain" style="position:relative;">
                <label for="mqtt_pass"><?php echo htmlspecialchars($L['SETTINGS.MQTT_PASS']); ?></label>
                <input type="password" name="mqtt_pass" id="mqtt_pass"
                       value="<?php echo htmlspecialchars($config['MQTT']['password']); ?>">
                <a href="#" onclick="togglePassword('mqtt_pass'); return false;"
                   class="pw-toggle" style="position:absolute;right:10px;top:35px;z-index:10;">
                    <span id="mqtt_pass_icon">Show</span>
                </a>
            </div>

            <!-- Thresholds Section -->
            <h3><?php echo htmlspecialchars($L['SETTINGS.SECTION_THRESHOLDS']); ?></h3>

            <div data-role="fieldcontain">
                <label for="offline_hours"><?php echo htmlspecialchars($L['SETTINGS.OFFLINE_HOURS']); ?></label>
                <input type="number" name="offline_hours" id="offline_hours"
                       value="<?php echo htmlspecialchars($config['THRESHOLDS']['offline_hours']); ?>"
                       required min="1">
                <p class="ui-body-d" style="font-size:0.85em;margin-top:2px;"><?php echo htmlspecialchars($L['SETTINGS.OFFLINE_HOURS_HELP']); ?></p>
            </div>

            <div data-role="fieldcontain">
                <label for="battery_pct"><?php echo htmlspecialchars($L['SETTINGS.BATTERY_PCT']); ?></label>
                <input type="number" name="battery_pct" id="battery_pct"
                       value="<?php echo htmlspecialchars($config['THRESHOLDS']['battery_pct']); ?>"
                       required min="1" max="100">
                <p class="ui-body-d" style="font-size:0.85em;margin-top:2px;"><?php echo htmlspecialchars($L['SETTINGS.BATTERY_PCT_HELP']); ?></p>
            </div>

            <!-- Cron Section -->
            <h3><?php echo htmlspecialchars($L['SETTINGS.SECTION_CRON']); ?></h3>

            <div data-role="fieldcontain">
                <label for="cron_interval"><?php echo htmlspecialchars($L['SETTINGS.CRON_INTERVAL']); ?></label>
                <input type="number" name="cron_interval" id="cron_interval"
                       value="<?php echo htmlspecialchars($config['CRON']['interval_minutes']); ?>"
                       required min="1">
                <p class="ui-body-d" style="font-size:0.85em;margin-top:2px;"><?php echo htmlspecialchars($L['SETTINGS.CRON_INTERVAL_HELP']); ?></p>
            </div>

            <div data-role="fieldcontain">
                <label for="drain_seconds"><?php echo htmlspecialchars($L['SETTINGS.DRAIN_SECONDS']); ?></label>
                <input type="number" name="drain_seconds" id="drain_seconds"
                       value="<?php echo htmlspecialchars($config['CRON']['drain_seconds']); ?>"
                       required min="1" max="30">
                <p class="ui-body-d" style="font-size:0.85em;margin-top:2px;"><?php echo htmlspecialchars($L['SETTINGS.DRAIN_SECONDS_HELP']); ?></p>
            </div>

            <!-- Notifications Section -->
            <h3><?php echo htmlspecialchars($L['SETTINGS.SECTION_NOTIFICATIONS']); ?></h3>

            <div data-role="fieldcontain">
                <label for="lb_notify"><?php echo htmlspecialchars($L['SETTINGS.LB_NOTIFY']); ?></label>
                <select name="lb_notify" id="lb_notify" data-role="slider">
                    <option value="0" <?php echo $config['NOTIFICATIONS']['loxberry_enabled'] !== '1' ? 'selected' : ''; ?>>Off</option>
                    <option value="1" <?php echo $config['NOTIFICATIONS']['loxberry_enabled'] === '1' ? 'selected' : ''; ?>>On</option>
                </select>
            </div>

            <div data-role="fieldcontain">
                <label for="email_enabled"><?php echo htmlspecialchars($L['SETTINGS.EMAIL_ENABLED']); ?></label>
                <select name="email_enabled" id="email_enabled" data-role="slider">
                    <option value="0" <?php echo $config['NOTIFICATIONS']['email_enabled'] !== '1' ? 'selected' : ''; ?>>Off</option>
                    <option value="1" <?php echo $config['NOTIFICATIONS']['email_enabled'] === '1' ? 'selected' : ''; ?>>On</option>
                </select>
            </div>

            <div data-role="fieldcontain">
                <label for="heartbeat"><?php echo htmlspecialchars($L['SETTINGS.HEARTBEAT']); ?></label>
                <select name="heartbeat" id="heartbeat" data-role="slider">
                    <option value="0" <?php echo $config['NOTIFICATIONS']['heartbeat_enabled'] !== '1' ? 'selected' : ''; ?>>Off</option>
                    <option value="1" <?php echo $config['NOTIFICATIONS']['heartbeat_enabled'] === '1' ? 'selected' : ''; ?>>On</option>
                </select>
                <p class="ui-body-d" style="font-size:0.85em;margin-top:2px;"><?php echo htmlspecialchars($L['SETTINGS.HEARTBEAT_HELP']); ?></p>
            </div>

            <!-- SMTP Fields (shown only when email is enabled) -->
            <div id="smtp-fields" style="<?php echo $config['NOTIFICATIONS']['email_enabled'] !== '1' ? 'display:none;' : ''; ?>">
                <h4><?php echo htmlspecialchars($L['SETTINGS.SECTION_SMTP']); ?></h4>

                <div data-role="fieldcontain">
                    <label for="smtp_host"><?php echo htmlspecialchars($L['SETTINGS.SMTP_HOST']); ?></label>
                    <input type="text" name="smtp_host" id="smtp_host"
                           value="<?php echo htmlspecialchars($config['NOTIFICATIONS']['smtp_host']); ?>"
                           placeholder="smtp.example.com">
                </div>

                <div data-role="fieldcontain">
                    <label for="smtp_port"><?php echo htmlspecialchars($L['SETTINGS.SMTP_PORT']); ?></label>
                    <input type="number" name="smtp_port" id="smtp_port"
                           value="<?php echo htmlspecialchars($config['NOTIFICATIONS']['smtp_port']); ?>"
                           min="1" max="65535">
                </div>

                <div data-role="fieldcontain">
                    <label for="smtp_user"><?php echo htmlspecialchars($L['SETTINGS.SMTP_USER']); ?></label>
                    <input type="text" name="smtp_user" id="smtp_user"
                           value="<?php echo htmlspecialchars($config['NOTIFICATIONS']['smtp_user']); ?>">
                </div>

                <div data-role="fieldcontain" style="position:relative;">
                    <label for="smtp_pass"><?php echo htmlspecialchars($L['SETTINGS.SMTP_PASS']); ?></label>
                    <input type="password" name="smtp_pass" id="smtp_pass"
                           value="<?php echo htmlspecialchars($config['NOTIFICATIONS']['smtp_pass']); ?>">
                    <a href="#" onclick="togglePassword('smtp_pass'); return false;"
                       class="pw-toggle" style="position:absolute;right:10px;top:35px;z-index:10;">
                        <span id="smtp_pass_icon">Show</span>
                    </a>
                </div>

                <div data-role="fieldcontain">
                    <label for="smtp_from"><?php echo htmlspecialchars($L['SETTINGS.SMTP_FROM']); ?></label>
                    <input type="email" name="smtp_from" id="smtp_from"
                           value="<?php echo htmlspecialchars($config['NOTIFICATIONS']['smtp_from']); ?>"
                           placeholder="alerts@example.com">
                </div>

                <div data-role="fieldcontain">
                    <label for="smtp_to"><?php echo htmlspecialchars($L['SETTINGS.SMTP_TO']); ?></label>
                    <input type="email" name="smtp_to" id="smtp_to"
                           value="<?php echo htmlspecialchars($config['NOTIFICATIONS']['smtp_to']); ?>"
                           placeholder="admin@example.com">
                </div>
            </div>

            <!-- Test buttons -->
            <div style="margin:15px 0;">
                <button type="submit" id="btn-test-mqtt" class="ui-btn ui-btn-inline ui-mini"
                        onclick="document.getElementById('form-action').value='test_mqtt';">
                    <?php echo htmlspecialchars($L['BUTTONS.TEST_MQTT']); ?>
                </button>
                <button type="submit" id="btn-test-email" class="ui-btn ui-btn-inline ui-mini"
                        onclick="document.getElementById('form-action').value='test_email';">
                    <?php echo htmlspecialchars($L['BUTTONS.TEST_EMAIL']); ?>
                </button>
            </div>

            <?php if ($test_result !== null): ?>
            <div style="background:<?php echo $test_result['success'] ? '#4CAF50' : '#f44336'; ?>;color:#fff;padding:10px 15px;margin:10px 0;border-radius:4px;">
                <strong><?php echo $test_result['type'] === 'mqtt' ? 'MQTT Test' : 'Email Test'; ?>:</strong>
                <?php echo htmlspecialchars($test_result['message']); ?>
            </div>
            <?php endif; ?>

            <!-- Save button -->
            <button type="submit" class="ui-btn ui-btn-b ui-corner-all"
                    onclick="document.getElementById('form-action').value='save_settings';">
                <?php echo htmlspecialchars($L['BUTTONS.SAVE']); ?>
            </button>
        </form>
    </div>

    <!-- ============================================================ -->
    <!-- EXCLUSIONS TAB                                                -->
    <!-- ============================================================ -->
    <div id="tab-exclusions">
<?php if ($state_missing): ?>
        <div style="background:#2196F3;color:#fff;padding:10px 15px;margin:10px 0;border-radius:4px;">
            No device data yet. Run the watchdog first or click Refresh Data on the Device Status tab.
        </div>
<?php else: ?>
        <input type="search" id="device-search" placeholder="Filter devices..." style="margin:10px 0;padding:8px;width:100%;box-sizing:border-box;">

        <form method="post" action="index.php" data-ajax="false">
            <input type="hidden" name="action" value="save_exclusions">

<?php foreach ($sorted_devices as $ieee => $friendly_name): ?>
            <div class="device-item" data-name="<?php echo htmlspecialchars($friendly_name); ?>" style="padding:4px 0;">
                <input type="checkbox" name="excluded[]" value="<?php echo htmlspecialchars($ieee); ?>"
                       id="dev-<?php echo htmlspecialchars($ieee); ?>"
                       <?php echo in_array($ieee, $excluded_iees) ? 'checked' : ''; ?>>
                <label for="dev-<?php echo htmlspecialchars($ieee); ?>"><?php echo htmlspecialchars($friendly_name); ?></label>
            </div>
<?php endforeach; ?>

            <button type="submit" class="ui-btn ui-btn-b ui-corner-all" style="margin-top:15px;">
                <?php echo htmlspecialchars($L['BUTTONS.SAVE']); ?>
            </button>
        </form>
<?php endif; ?>
    </div>

    <!-- ============================================================ -->
    <!-- DEVICE STATUS TAB                                             -->
    <!-- ============================================================ -->
    <div id="tab-status">

<?php if ($msg === 'refresh_ok'): ?>
        <div style="background:#4CAF50;color:#fff;padding:10px 15px;margin:10px 0;border-radius:4px;">
            <?php echo htmlspecialchars($L['MESSAGES.REFRESH_OK']); ?>
        </div>
<?php elseif ($msg === 'refresh_fail'): ?>
        <div style="background:#f44336;color:#fff;padding:10px 15px;margin:10px 0;border-radius:4px;">
            <?php echo htmlspecialchars($L['MESSAGES.REFRESH_FAIL']); ?>
        </div>
<?php endif; ?>

        <div style="display:flex;align-items:center;justify-content:space-between;margin:10px 0;">
            <span style="font-size:0.9em;color:#666;">
                <?php
                    $last_run = isset($state['last_run']) && $state['last_run'] ? $state['last_run'] : null;
                    if ($last_run) {
                        $last_run_ts = strtotime($last_run);
                        echo htmlspecialchars($L['STATUS.LAST_UPDATED']) . date('Y-m-d H:i:s', $last_run_ts);
                    } else {
                        echo htmlspecialchars($L['STATUS.LAST_UPDATED']) . 'Never';
                    }
                ?>
            </span>
            <form method="post" action="index.php" data-ajax="false" style="margin:0;">
                <input type="hidden" name="action" value="refresh">
                <button type="submit" class="ui-btn ui-btn-inline ui-mini">
                    <?php echo htmlspecialchars($L['BUTTONS.REFRESH']); ?>
                </button>
            </form>
        </div>

<?php if ($state_missing): ?>
        <div style="background:#2196F3;color:#fff;padding:10px 15px;margin:10px 0;border-radius:4px;">
            <?php echo htmlspecialchars($L['MESSAGES.NO_DATA']); ?>
        </div>
<?php else: ?>
        <table id="device-table" data-role="table" class="ui-responsive" style="width:100%;border-collapse:collapse;">
            <thead>
                <tr style="background:#f5f5f5;">
                    <th style="padding:8px;text-align:left;cursor:pointer;" onclick="sortTable(this.closest('table'), 0, 'str')"><?php echo htmlspecialchars($L['STATUS.COL_DEVICE']); ?></th>
                    <th style="padding:8px;text-align:left;cursor:pointer;" onclick="sortTable(this.closest('table'), 1, 'num')"><?php echo htmlspecialchars($L['STATUS.COL_LAST_SEEN']); ?></th>
                    <th style="padding:8px;text-align:left;cursor:pointer;" onclick="sortTable(this.closest('table'), 2, 'num')"><?php echo htmlspecialchars($L['STATUS.COL_BATTERY']); ?></th>
                    <th style="padding:8px;text-align:left;cursor:pointer;" onclick="sortTable(this.closest('table'), 3, 'num')"><?php echo htmlspecialchars($L['STATUS.COL_ALERT']); ?></th>
                </tr>
            </thead>
            <tbody>
<?php foreach ($table_rows as $row): ?>
                <tr style="border-bottom:1px solid #ddd;">
                    <td style="padding:8px;"><?php echo htmlspecialchars($row['name']); ?></td>
                    <td style="padding:8px;" data-sort-value="<?php echo $row['last_seen_ts']; ?>"><?php echo htmlspecialchars($row['last_seen_age']); ?></td>
                    <td style="padding:8px;" data-sort-value="<?php echo $row['battery_sort']; ?>"><?php echo $row['battery'] !== null ? $row['battery'] . '%' : 'N/A'; ?></td>
                    <td style="padding:8px;" data-sort-value="<?php echo $row['sort_priority']; ?>">
<?php
    $badge_bg = '#4CAF50'; // OK = green
    if ($row['alert_status'] === 'Offline') $badge_bg = '#f44336'; // red
    elseif ($row['alert_status'] === 'Low Battery') $badge_bg = '#FF9800'; // orange
    elseif ($row['alert_status'] === 'Excluded') $badge_bg = '#9E9E9E'; // grey
?>
                        <span style="background:<?php echo $badge_bg; ?>;color:#fff;padding:2px 8px;border-radius:3px;font-size:0.85em;">
                            <?php echo htmlspecialchars($row['alert_status']); ?>
                        </span>
                    </td>
                </tr>
<?php endforeach; ?>
            </tbody>
        </table>
<?php endif; ?>
    </div>

</div>

<!-- Inline JS: SMTP toggle and password reveal -->
<script>
// Toggle SMTP fields visibility based on email_enabled slider
document.addEventListener('DOMContentLoaded', function() {
    var emailSelect = document.getElementById('email_enabled');
    var smtpFields = document.getElementById('smtp-fields');

    function updateSmtpVisibility() {
        if (emailSelect.value === '1') {
            smtpFields.style.display = 'block';
        } else {
            smtpFields.style.display = 'none';
        }
    }

    if (emailSelect && smtpFields) {
        emailSelect.addEventListener('change', updateSmtpVisibility);
        // Also handle jQuery Mobile slider change event
        if (typeof jQuery !== 'undefined') {
            jQuery(emailSelect).on('slidestop', updateSmtpVisibility);
        }
    }
});

// Sortable table for Device Status tab
function sortTable(table, col, type) {
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
    var prevCol = table.dataset.sortCol;
    var asc = (prevCol === String(col)) ? !(table.dataset.sortAsc === 'true') : true;
    table.dataset.sortCol = col;
    table.dataset.sortAsc = asc;

    rows.sort(function(a, b) {
        var cellA = a.querySelectorAll('td')[col];
        var cellB = b.querySelectorAll('td')[col];
        if (!cellA || !cellB) return 0;
        var valA = cellA.hasAttribute('data-sort-value') ? cellA.getAttribute('data-sort-value') : cellA.textContent.trim();
        var valB = cellB.hasAttribute('data-sort-value') ? cellB.getAttribute('data-sort-value') : cellB.textContent.trim();
        if (type === 'num') {
            valA = parseFloat(valA) || 0;
            valB = parseFloat(valB) || 0;
            return asc ? valA - valB : valB - valA;
        }
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
        if (valA < valB) return asc ? -1 : 1;
        if (valA > valB) return asc ? 1 : -1;
        return 0;
    });

    for (var i = 0; i < rows.length; i++) {
        tbody.appendChild(rows[i]);
    }
}

// Device search filter for Exclusions tab
var deviceSearch = document.getElementById('device-search');
if (deviceSearch) {
    deviceSearch.addEventListener('input', function() {
        var query = this.value.toLowerCase();
        var items = document.querySelectorAll('.device-item');
        for (var i = 0; i < items.length; i++) {
            var name = (items[i].getAttribute('data-name') || '').toLowerCase();
            items[i].style.display = name.indexOf(query) !== -1 ? '' : 'none';
        }
    });
}

// Password eye-toggle
function togglePassword(fieldId) {
    var field = document.getElementById(fieldId);
    var icon = document.getElementById(fieldId + '_icon');
    if (field && icon) {
        if (field.type === 'password') {
            field.type = 'text';
            icon.textContent = 'Hide';
        } else {
            field.type = 'password';
            icon.textContent = 'Show';
        }
    }
}

// Tab activation from URL parameter
<?php
$tab_index = 0;
if ($tab === 'exclusions') $tab_index = 1;
if ($tab === 'status') $tab_index = 2;
if ($tab_index > 0):
?>
if (typeof jQuery !== 'undefined') {
    jQuery(document).on('pagecreate', function() {
        try {
            jQuery('[data-role="tabs"]').tabs("option", "active", <?php echo $tab_index; ?>);
        } catch(e) {}
    });
}
<?php endif; ?>
</script>

<?php
// Footer
LBWeb::lbfooter();
?>
