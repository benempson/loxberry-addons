<?php
/**
 * Zigbee Watchdog - Configuration Page
 *
 * Loxberry plugin web interface for configuring z2m data path, thresholds,
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
    'Z2M' => array(
        'z2m_data_path' => '',
    ),
    'THRESHOLDS' => array(
        'offline_hours' => '24',
        'battery_pct'   => '25',
    ),
    'CRON' => array(
        'interval_minutes' => '60',
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
// Cron helpers: must match bin/lib/cron-helper.js exactly
// ------------------------------------------------------------------

/**
 * Convert interval in minutes to a cron expression.
 * Must produce identical output to bin/lib/cron-helper.js intervalToCron().
 */
function interval_to_cron($minutes) {
    $m = intval($minutes);
    if ($m <= 0) return '0 * * * *'; // safe default: every hour
    if ($m < 60) return "*/$m * * * *";
    if ($m < 1440) {
        $hours = intval($m / 60);
        if ($hours === 1) return '0 * * * *';
        return "0 */$hours * * *";
    }
    return '0 3 * * *'; // daily at 3 am
}

/**
 * Register/update cron via Loxberry's installcrontab.sh.
 * Returns true on success, false on failure. Non-fatal.
 */
function update_cron($interval_minutes) {
    $plugin_name = 'zigbee_watchdog';
    $cron_expr = interval_to_cron($interval_minutes);
    $cron_line = "$cron_expr loxberry /usr/bin/node " . LBPBINDIR . "/watchdog.js > /dev/null 2>&1";
    $tmp_file = '/tmp/' . $plugin_name . '_cron';
    file_put_contents($tmp_file, $cron_line . "\n");
    exec(LBHOMEDIR . '/sbin/installcrontab.sh ' . escapeshellarg($plugin_name) . ' ' . escapeshellarg($tmp_file) . ' 2>&1', $output, $retval);
    @unlink($tmp_file);
    return $retval === 0;
}

// ------------------------------------------------------------------
// Load state.json for Device Status tab
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
        'Z2M' => array(
            'z2m_data_path' => trim($_POST['z2m_path'] ?? ''),
        ),
        'THRESHOLDS' => array(
            'offline_hours' => trim($_POST['offline_hours'] ?? '24'),
            'battery_pct'   => trim($_POST['battery_pct'] ?? '25'),
        ),
        'CRON' => array(
            'interval_minutes' => trim($_POST['cron_interval'] ?? '60'),
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
// Helper: resolve z2m data path from config or auto-detect
// ------------------------------------------------------------------
function resolve_z2m_path($config) {
    $path = isset($config['Z2M']['z2m_data_path']) ? $config['Z2M']['z2m_data_path'] : '';
    if (empty($path)) {
        $search_paths = array('/opt/zigbee2mqtt/data', '/opt/loxberry/data/plugins/zigbee2mqtt/zigbee2mqtt/', '/opt/loxberry/data/plugins/zigbee2mqtt/');
        foreach ($search_paths as $try_path) {
            if (file_exists($try_path . '/state.json')) {
                $path = $try_path;
                break;
            }
        }
    }
    return $path;
}

// ------------------------------------------------------------------
// POST handler: Save Settings / Verify Z2M / Test Email / Exclusion
// ------------------------------------------------------------------
$error = '';
$msg = isset($_GET['msg']) ? $_GET['msg'] : '';
$test_result = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {

    // AJAX single-device exclusion toggle (returns JSON, exits early)
    if ($_POST['action'] === 'save_exclusion') {
        $ieee = isset($_POST['ieee']) ? trim($_POST['ieee']) : '';
        $checked = isset($_POST['checked']) ? $_POST['checked'] === '1' : false;
        if (!preg_match('/^0x[0-9a-fA-F]+$/', $ieee)) {
            http_response_code(400);
            echo json_encode(array('error' => 'Invalid IEEE address'));
            exit;
        }
        $current = read_config($cfgfile, $defaults);
        $excl_raw = trim($current['EXCLUSIONS']['devices']);
        $excl_list = $excl_raw !== '' ? array_map('trim', explode(',', $excl_raw)) : array();
        if ($checked && !in_array($ieee, $excl_list)) {
            $excl_list[] = $ieee;
        } elseif (!$checked) {
            $excl_list = array_values(array_filter($excl_list, function($v) use ($ieee) { return $v !== $ieee; }));
        }
        $current['EXCLUSIONS']['devices'] = implode(',', $excl_list);
        $ok = write_config($cfgfile, $current);
        header('Content-Type: application/json');
        echo json_encode(array('success' => $ok));
        exit;
    }

    // AJAX: return fresh device status data as JSON (for live polling)
    if ($_POST['action'] === 'get_status_data') {
        header('Content-Type: application/json');
        $current_config = read_config($cfgfile, $defaults);
        $z2m_path = resolve_z2m_path($current_config);

        // Read watchdog state
        $state_raw = @file_get_contents(LBPDATADIR . '/state.json');
        $state_data = $state_raw ? @json_decode($state_raw, true) : array();
        $devs = isset($state_data['devices']) ? $state_data['devices'] : array();

        // Read z2m state
        $z2m_state = array();
        if (!empty($z2m_path) && file_exists($z2m_path . '/state.json')) {
            $z2m_raw = @file_get_contents($z2m_path . '/state.json');
            $z2m_state = $z2m_raw ? @json_decode($z2m_raw, true) : array();
            if (!is_array($z2m_state)) $z2m_state = array();
        }

        // Exclusion list
        $excl_raw_aj = trim($current_config['EXCLUSIONS']['devices']);
        $excl_list_aj = $excl_raw_aj !== '' ? array_map('trim', explode(',', $excl_raw_aj)) : array();

        // Build device rows (mirror the PHP $table_rows logic)
        $now_aj = time();
        $rows_aj = array();
        foreach ($devs as $ieee => $dev) {
            $name = isset($dev['friendly_name']) ? $dev['friendly_name'] : $ieee;
            $last_seen = isset($dev['last_seen']) && $dev['last_seen'] ? $dev['last_seen'] : null;
            $last_seen_ts = $last_seen ? strtotime($last_seen) : 0;
            $last_seen_age = $last_seen_ts > 0 ? formatAge($now_aj - $last_seen_ts) : 'Never';

            $battery = null;
            $battery_sort = -1;
            $power_source = isset($dev['power_source']) ? $dev['power_source'] : '';
            if (strtolower($power_source) !== 'mains' && isset($dev['battery'])) {
                $battery = intval($dev['battery']);
                $battery_sort = $battery;
            }

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
            $is_excluded = in_array($ieee, $excl_list_aj);
            if ($sort_priority > 1 && $is_excluded) {
                $alert_status = 'Excluded';
                $sort_priority = 2;
            }

            // Z2M state for this device
            $dev_z2m = isset($z2m_state[$ieee]) ? $z2m_state[$ieee] : null;
            $lqi = ($dev_z2m && isset($dev_z2m['linkquality'])) ? intval($dev_z2m['linkquality']) : null;

            $rows_aj[] = array(
                'ieee' => $ieee,
                'name' => $name,
                'description' => isset($dev['description']) ? $dev['description'] : '',
                'last_seen_age' => $last_seen_age,
                'last_seen_ts' => $last_seen_ts,
                'battery' => $battery,
                'battery_sort' => $battery_sort,
                'alert_status' => $alert_status,
                'sort_priority' => $sort_priority,
                'is_excluded' => $is_excluded,
                'linkquality' => $lqi,
                'z2m_state' => $dev_z2m,
            );
        }

        // Sort: alerts first, then alphabetical
        usort($rows_aj, function($a, $b) {
            if ($a['sort_priority'] !== $b['sort_priority']) {
                return $a['sort_priority'] - $b['sort_priority'];
            }
            return strcasecmp($a['name'], $b['name']);
        });

        echo json_encode(array(
            'devices' => $rows_aj,
            'last_run' => isset($state_data['last_run']) ? $state_data['last_run'] : null,
        ));
        exit;
    }

    if ($_POST['action'] === 'verify_z2m') {
        set_time_limit(45);
        // Save current form settings so verify script reads latest values
        $new_config = collect_form_config($defaults, $cfgfile);
        write_config($cfgfile, $new_config);
        // Run Z2M path verification
        $output = array();
        $retval = -1;
        exec('node ' . LBPBINDIR . '/verify-z2m.js 2>&1', $output, $retval);
        $test_result = array('type' => 'z2m', 'success' => ($retval === 0), 'message' => implode("\n", $output));
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
        $offline = intval($new_config['THRESHOLDS']['offline_hours']);
        if ($offline < 1) {
            $errors[] = 'Offline hours must be at least 1.';
        }
        $battery = intval($new_config['THRESHOLDS']['battery_pct']);
        if ($battery < 1 || $battery > 100) {
            $errors[] = 'Battery threshold must be between 1 and 100.';
        }
        $allowed_intervals = array(5, 15, 30, 60, 120, 240, 360, 720, 1440);
        $interval = intval($new_config['CRON']['interval_minutes']);
        if (!in_array($interval, $allowed_intervals)) {
            $interval = 60;
            $new_config['CRON']['interval_minutes'] = strval($interval);
        }
        $smtp_port = intval($new_config['NOTIFICATIONS']['smtp_port']);
        if ($new_config['NOTIFICATIONS']['email_enabled'] === '1' && ($smtp_port < 1 || $smtp_port > 65535)) {
            $errors[] = 'SMTP port must be between 1 and 65535.';
        }

        if (!empty($errors)) {
            $error = implode(' ', $errors);
        } else {
            if (write_config($cfgfile, $new_config)) {
                update_cron(intval($new_config['CRON']['interval_minutes']));
                header('Location: index.php?msg=saved');
                exit;
            } else {
                $error = $L['MESSAGES.SAVE_ERROR'] . 'Could not write config file.';
            }
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
// Compute Z2M status for settings page display
// ------------------------------------------------------------------
$z2m_status_text = '';
$z2m_data_path = resolve_z2m_path($config);
if (!empty($z2m_data_path) && file_exists($z2m_data_path . '/state.json')) {
    $z2m_state_raw = @file_get_contents($z2m_data_path . '/state.json');
    $z2m_state_data = $z2m_state_raw ? @json_decode($z2m_state_raw, true) : array();
    $z2m_device_count = is_array($z2m_state_data) ? count($z2m_state_data) : 0;
    $z2m_state_mtime = @filemtime($z2m_data_path . '/state.json');
    if ($z2m_state_mtime) {
        $age_seconds = time() - $z2m_state_mtime;
        if ($age_seconds < 60) $age_str = $age_seconds . 's ago';
        elseif ($age_seconds < 3600) $age_str = floor($age_seconds / 60) . 'm ago';
        elseif ($age_seconds < 86400) $age_str = floor($age_seconds / 3600) . 'h ago';
        else $age_str = floor($age_seconds / 86400) . 'd ago';
    } else {
        $age_str = 'unknown';
    }
    $z2m_status_text = $z2m_device_count . ' devices, state.json ' . $age_str;
}

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
// Build table rows for Device Status tab
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
    $is_excluded = in_array($ieee, $excluded_iees);
    if ($sort_priority > 1 && $is_excluded) {
        $alert_status = 'Excluded';
        $sort_priority = 2;
    }

    $table_rows[] = array(
        'ieee' => $ieee,
        'name' => $name,
        'description' => isset($dev['description']) ? $dev['description'] : '',
        'last_seen_age' => $last_seen_age,
        'last_seen_ts' => $last_seen_ts,
        'battery' => $battery,
        'battery_sort' => $battery_sort,
        'alert_status' => $alert_status,
        'sort_priority' => $sort_priority,
        'is_excluded' => $is_excluded,
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
// Navbar (Loxberry SDK tabs) -- two tabs only
// ------------------------------------------------------------------
$tab = isset($_GET['tab']) ? $_GET['tab'] : 'settings';

$navbar[1]['Name'] = $L['NAV.SETTINGS'];
$navbar[1]['URL']  = 'index.php';
if ($tab === 'settings') $navbar[1]['active'] = true;

$navbar[2]['Name'] = $L['NAV.STATUS'];
$navbar[2]['URL']  = 'index.php?tab=status';
if ($tab === 'status') $navbar[2]['active'] = true;

$navbar[3]['Name'] = $L['NAV.BLINDS'];
$navbar[3]['URL']  = 'index.php?tab=blinds';
if ($tab === 'blinds') $navbar[3]['active'] = true;

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
            <li><a href="#tab-status" <?php echo $tab === 'status' ? 'class="ui-btn-active"' : ''; ?>><?php echo htmlspecialchars($L['NAV.STATUS']); ?></a></li>
            <li><a href="#tab-blinds" <?php echo $tab === 'blinds' ? 'class="ui-btn-active"' : ''; ?>><?php echo htmlspecialchars($L['NAV.BLINDS']); ?></a></li>
        </ul>
    </div>

    <!-- ============================================================ -->
    <!-- SETTINGS TAB                                                  -->
    <!-- ============================================================ -->
    <div id="tab-settings">
        <form method="post" action="index.php" data-ajax="false">
            <input type="hidden" name="action" id="form-action" value="save_settings">

            <!-- Z2M Section -->
            <h3><?php echo htmlspecialchars($L['SETTINGS.SECTION_Z2M']); ?></h3>
            <div data-role="fieldcontain">
                <label for="z2m_path"><?php echo htmlspecialchars($L['SETTINGS.Z2M_PATH']); ?></label>
                <input type="text" name="z2m_path" id="z2m_path"
                       value="<?php echo htmlspecialchars($config['Z2M']['z2m_data_path']); ?>"
                       placeholder="/opt/zigbee2mqtt/data">
                <p class="ui-body-d" style="font-size:0.85em;margin-top:2px;"><?php echo htmlspecialchars($L['SETTINGS.Z2M_PATH_HELP']); ?></p>
            </div>
            <?php if (!empty($z2m_status_text)): ?>
            <p id="z2m-status" style="font-size:0.9em;color:#666;margin-top:4px;">
                <strong><?php echo htmlspecialchars($L['SETTINGS.Z2M_STATUS']); ?>:</strong>
                <?php echo htmlspecialchars($z2m_status_text); ?>
            </p>
            <?php endif; ?>

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
                <?php
                $interval_options = array(
                    5 => '5 minutes', 15 => '15 minutes', 30 => '30 minutes',
                    60 => '1 hour', 120 => '2 hours', 240 => '4 hours',
                    360 => '6 hours', 720 => '12 hours', 1440 => '24 hours',
                );
                $current_interval = intval($config['CRON']['interval_minutes']);
                ?>
                <select name="cron_interval" id="cron_interval">
                <?php foreach ($interval_options as $val => $label): ?>
                    <option value="<?php echo $val; ?>" <?php echo $current_interval === $val ? 'selected' : ''; ?>><?php echo htmlspecialchars($label); ?></option>
                <?php endforeach; ?>
                </select>
                <p class="ui-body-d" style="font-size:0.85em;margin-top:2px;"><?php echo htmlspecialchars($L['SETTINGS.CRON_INTERVAL_HELP']); ?></p>
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
                <button type="submit" id="btn-verify-z2m" class="ui-btn ui-btn-inline ui-mini"
                        onclick="document.getElementById('form-action').value='verify_z2m';">
                    <?php echo htmlspecialchars($L['BUTTONS.VERIFY_Z2M']); ?>
                </button>
                <button type="submit" id="btn-test-email" class="ui-btn ui-btn-inline ui-mini"
                        onclick="document.getElementById('form-action').value='test_email';">
                    <?php echo htmlspecialchars($L['BUTTONS.TEST_EMAIL']); ?>
                </button>
            </div>

            <?php if ($test_result !== null): ?>
            <div style="background:<?php echo $test_result['success'] ? '#4CAF50' : '#f44336'; ?>;color:#fff;padding:10px 15px;margin:10px 0;border-radius:4px;">
                <strong><?php echo $test_result['type'] === 'z2m' ? 'Z2M Path Verify' : 'Email Test'; ?>:</strong>
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

        <!-- Show Excluded toggle and Search filter -->
        <div style="display:flex;align-items:center;gap:15px;margin:10px 0;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:5px;font-size:0.9em;">
                <input type="checkbox" id="show-excluded">
                <?php echo htmlspecialchars($L['STATUS.SHOW_EXCLUDED']); ?>
            </label>
            <input type="search" id="device-search" placeholder="Filter devices..."
                   style="flex:1;min-width:200px;padding:8px;box-sizing:border-box;">
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
                    <th style="padding:8px;text-align:left;cursor:pointer;" onclick="sortTable(this.closest('table'), 1, 'str')"><?php echo htmlspecialchars($L['STATUS.COL_DESCRIPTION']); ?></th>
                    <th style="padding:8px;text-align:left;cursor:pointer;" onclick="sortTable(this.closest('table'), 2, 'num')"><?php echo htmlspecialchars($L['STATUS.COL_LAST_SEEN']); ?></th>
                    <th style="padding:8px;text-align:left;cursor:pointer;" onclick="sortTable(this.closest('table'), 3, 'num')"><?php echo htmlspecialchars($L['STATUS.COL_BATTERY']); ?></th>
                    <th style="padding:8px;text-align:left;cursor:pointer;" onclick="sortTable(this.closest('table'), 4, 'num')"><?php echo htmlspecialchars($L['STATUS.COL_LINK_QUALITY']); ?></th>
                    <th style="padding:8px;text-align:left;cursor:pointer;" onclick="sortTable(this.closest('table'), 5, 'num')"><?php echo htmlspecialchars($L['STATUS.COL_ALERT']); ?></th>
                    <th style="padding:8px;text-align:left;"><?php echo htmlspecialchars($L['STATUS.COL_EXCLUDE']); ?></th>
                </tr>
            </thead>
            <tbody>
<?php foreach ($table_rows as $row): ?>
                <tr style="border-bottom:1px solid #ddd;" data-ieee="<?php echo htmlspecialchars($row['ieee']); ?>" data-excluded="<?php echo $row['is_excluded'] ? '1' : '0'; ?>">
<?php
    $device_z2m_state = isset($z2m_state_data) && is_array($z2m_state_data) && isset($z2m_state_data[$row['ieee']]) ? $z2m_state_data[$row['ieee']] : null;
    $state_json_attr = $device_z2m_state ? htmlspecialchars(json_encode($device_z2m_state), ENT_QUOTES) : '';
    $lqi = ($device_z2m_state && isset($device_z2m_state['linkquality'])) ? intval($device_z2m_state['linkquality']) : null;
?>
                    <td style="padding:8px;"><?php echo htmlspecialchars($row['name']); ?></td>
                    <td style="padding:8px;"><?php echo htmlspecialchars($row['description']); ?></td>
                    <td style="padding:8px;" data-sort-value="<?php echo $row['last_seen_ts']; ?>"><?php echo htmlspecialchars($row['last_seen_age']); ?></td>
                    <td style="padding:8px;" data-sort-value="<?php echo $row['battery_sort']; ?>"><?php echo $row['battery'] !== null ? $row['battery'] . '%' : 'N/A'; ?></td>
                    <td style="padding:8px;" data-sort-value="<?php echo $lqi !== null ? $lqi : -1; ?>">
                        <?php echo $lqi !== null ? $lqi : 'N/A'; ?>
                    </td>
                    <td style="padding:8px;" data-sort-value="<?php echo $row['sort_priority']; ?>">
<?php
    $badge_bg = '#4CAF50'; // OK = green
    if ($row['alert_status'] === 'Offline') $badge_bg = '#f44336'; // red
    elseif ($row['alert_status'] === 'Low Battery') $badge_bg = '#FF9800'; // orange
    elseif ($row['alert_status'] === 'Excluded') $badge_bg = '#9E9E9E'; // grey
?>
                        <span style="background:<?php echo $badge_bg; ?>;color:#fff;padding:2px 8px;border-radius:3px;font-size:0.85em;<?php echo $state_json_attr !== '' ? 'cursor:pointer;' : ''; ?>"<?php echo $state_json_attr !== '' ? ' data-z2m-state="' . $state_json_attr . '"' : ''; ?>>
                            <?php echo htmlspecialchars($row['alert_status']); ?>
                        </span>
                    </td>
                    <td style="padding:8px;">
                        <input type="checkbox" class="exclude-cb" data-ieee="<?php echo htmlspecialchars($row['ieee']); ?>" <?php echo $row['is_excluded'] ? 'checked' : ''; ?>>
                    </td>
                </tr>
<?php endforeach; ?>
            </tbody>
        </table>
<?php endif; ?>

        <div data-role="popup" id="state-popup" class="ui-content" data-theme="a"
             style="max-width:420px;max-height:350px;overflow:auto;">
            <pre id="state-popup-content" style="margin:0;font-size:0.8em;white-space:pre-wrap;word-wrap:break-word;"></pre>
        </div>
    </div>

    <!-- ============================================================ -->
    <!-- BLINDS TAB                                                    -->
    <!-- ============================================================ -->
    <div id="tab-blinds">
        <table id="blinds-table" data-role="table" class="ui-responsive" style="width:100%;border-collapse:collapse;">
            <thead>
                <tr style="background:#f5f5f5;">
                    <th style="padding:8px;text-align:left;"><?php echo htmlspecialchars($L['STATUS.COL_DEVICE']); ?></th>
                    <th style="padding:8px;text-align:left;"><?php echo htmlspecialchars($L['STATUS.COL_POSITION']); ?></th>
                    <th style="padding:8px;text-align:left;"><?php echo htmlspecialchars($L['STATUS.COL_STATE']); ?></th>
                    <th style="padding:8px;text-align:left;"><?php echo htmlspecialchars($L['STATUS.COL_MOTOR_REVERSAL']); ?></th>
                </tr>
            </thead>
            <tbody>
<?php foreach ($table_rows as $row):
    // Only show devices with friendly_name starting with "MS-108ZR"
    if (strpos($row['name'], 'MS-108ZR') !== 0) continue;
    $blind_state = isset($z2m_state_data) && is_array($z2m_state_data) && isset($z2m_state_data[$row['ieee']]) ? $z2m_state_data[$row['ieee']] : null;
    $position = ($blind_state && isset($blind_state['position'])) ? $blind_state['position'] : null;
    $state_val = ($blind_state && isset($blind_state['state'])) ? $blind_state['state'] : null;
    $motor_rev = ($blind_state && isset($blind_state['motor_reversal'])) ? $blind_state['motor_reversal'] : null;
?>
                <tr style="border-bottom:1px solid #ddd;">
                    <td style="padding:8px;"><?php echo htmlspecialchars($row['name']); ?></td>
                    <td style="padding:8px;"><?php echo $position !== null ? htmlspecialchars($position) . '%' : 'N/A'; ?></td>
                    <td style="padding:8px;"><?php echo $state_val !== null ? htmlspecialchars($state_val) : 'N/A'; ?></td>
                    <td style="padding:8px;"><?php echo $motor_rev !== null ? htmlspecialchars($motor_rev) : 'N/A'; ?></td>
                </tr>
<?php endforeach; ?>
            </tbody>
        </table>
    </div>

</div>

<!-- Search input padding fix for magnifying glass icon -->
<style>
#device-search {
    padding-left: 2.2em !important;
}
</style>

<!-- Inline JS: SMTP toggle, password reveal, device filters, exclusion AJAX -->
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

    // Apply filters on page load to hide excluded devices by default
    applyFilters();
});

// Shared filter function for search + show-excluded
function applyFilters() {
    var searchEl = document.getElementById('device-search');
    var showExcludedEl = document.getElementById('show-excluded');
    var query = (searchEl ? searchEl.value : '').toLowerCase();
    var showExcluded = showExcludedEl ? showExcludedEl.checked : true;
    var rows = document.querySelectorAll('#device-table tbody tr');
    for (var i = 0; i < rows.length; i++) {
        var name = (rows[i].querySelector('td') || {}).textContent || '';
        var desc = rows[i].querySelectorAll('td')[1] ? rows[i].querySelectorAll('td')[1].textContent : '';
        var searchText = (name + ' ' + desc).toLowerCase();
        var excluded = rows[i].getAttribute('data-excluded') === '1';
        var matchesSearch = query.length < 2 || searchText.indexOf(query) !== -1;
        var matchesExcluded = showExcluded || !excluded;
        rows[i].style.display = (matchesSearch && matchesExcluded) ? '' : 'none';
    }
}

// Debounced search: 2 char minimum, 350ms delay
var searchTimer = null;
function wireSearch() {
    var el = document.getElementById('device-search');
    if (!el) return;
    el.addEventListener('input', function() {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(function() { applyFilters(); }, 350);
    });
    el.addEventListener('search', function() {
        if (searchTimer) clearTimeout(searchTimer);
        applyFilters();
    });
    // Also handle jQuery Mobile wrapped input
    if (typeof jQuery !== 'undefined') {
        jQuery(document).on('input', '#device-search', function() {
            if (searchTimer) clearTimeout(searchTimer);
            searchTimer = setTimeout(function() { applyFilters(); }, 350);
        });
    }
}
wireSearch();

// Wire show-excluded checkbox -- use jQuery for jQuery Mobile compatibility
function wireShowExcluded() {
    var el = document.getElementById('show-excluded');
    if (!el) return;
    // Native listener
    el.addEventListener('change', function() { applyFilters(); });
    // jQuery Mobile listener (JQM wraps checkboxes)
    if (typeof jQuery !== 'undefined') {
        jQuery(document).on('change', '#show-excluded', function() { applyFilters(); });
    }
}
wireShowExcluded();

// AJAX handler for exclude checkboxes -- uses event delegation
function wireExcludeCheckboxes() {
    // Use jQuery delegation for jQuery Mobile compatibility
    if (typeof jQuery !== 'undefined') {
        jQuery(document).on('change', '.exclude-cb', function() {
            var cb = this;
            var ieee = cb.getAttribute('data-ieee');
            var checked = cb.checked ? '1' : '0';
            var row = jQuery(cb).closest('tr')[0];
            if (row) row.setAttribute('data-excluded', cb.checked ? '1' : '0');
            jQuery.post('index.php', { action: 'save_exclusion', ieee: ieee, checked: checked })
                .fail(function() {
                    cb.checked = !cb.checked;
                    if (row) row.setAttribute('data-excluded', cb.checked ? '1' : '0');
                })
                .always(function() {
                    applyFilters();
                });
            applyFilters();
        });
    } else {
        // Fallback: native event delegation
        document.addEventListener('change', function(e) {
            if (!e.target.classList.contains('exclude-cb')) return;
            var cb = e.target;
            var ieee = cb.getAttribute('data-ieee');
            var checked = cb.checked ? '1' : '0';
            var row = cb.closest('tr');
            if (row) row.setAttribute('data-excluded', cb.checked ? '1' : '0');
            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'index.php', true);
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            xhr.onload = function() {
                if (xhr.status !== 200) {
                    cb.checked = !cb.checked;
                    if (row) row.setAttribute('data-excluded', cb.checked ? '1' : '0');
                }
                applyFilters();
            };
            xhr.send('action=save_exclusion&ieee=' + encodeURIComponent(ieee) + '&checked=' + checked);
            applyFilters();
        });
    }
}
wireExcludeCheckboxes();

// Z2M state tooltip popup
if (typeof jQuery !== 'undefined') {
    jQuery(document).on('click', '[data-z2m-state]', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var raw = this.getAttribute('data-z2m-state');
        if (!raw) return;
        try {
            var state = JSON.parse(raw);
            jQuery('#state-popup-content').text(JSON.stringify(state, null, 2));
            jQuery('#state-popup').popup('open', { positionTo: this });
        } catch(ex) {}
    });
}

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
if ($tab === 'status') $tab_index = 1;
if ($tab === 'blinds') $tab_index = 2;
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
