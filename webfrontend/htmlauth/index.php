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
    'LOGGING' => array(
        'log_max_size'  => '1024',
        'log_max_files' => '5',
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
    $tmp_file = LBPDATADIR . '/' . $plugin_name . '_cron';
    $wrote = file_put_contents($tmp_file, $cron_line . "\n");
    $file_exists = file_exists($tmp_file);
    $cmd = 'sudo ' . LBHOMEDIR . '/sbin/installcrontab.sh ' . escapeshellarg($plugin_name) . ' ' . escapeshellarg($tmp_file) . ' 2>&1';
    exec($cmd, $output, $retval);
    @unlink($tmp_file);
    // Log cron installation result with full diagnostics
    $diag = 'tmp_file=' . $tmp_file . ' wrote=' . var_export($wrote, true) . ' exists=' . var_export($file_exists, true) . ' cmd=' . $cmd;
    $log_entry = json_encode(array(
        'ts' => gmdate('Y-m-d\TH:i:s.000\Z'),
        'sev' => $retval === 0 ? 'Info' : 'Error',
        'src' => 'cron',
        'msg' => $retval === 0
            ? 'Cron job installed: ' . $cron_expr
            : 'Cron install failed (exit ' . $retval . '): ' . implode(' ', $output) . ' | ' . $diag,
    )) . "\n";
    @file_put_contents(LBPDATADIR . '/watchdog.log', $log_entry, FILE_APPEND | LOCK_EX);
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
    $new_config['LOGGING'] = array(
        'log_max_size'  => trim($_POST['log_max_size'] ?? '1024'),
        'log_max_files' => trim($_POST['log_max_files'] ?? '5'),
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
    if ($_POST['action'] === 'get_device_state' && !empty($_POST['ieee'])) {
        header('Content-Type: application/json');
        $current_config = read_config($cfgfile, $defaults);
        $z2m_path = resolve_z2m_path($current_config);
        $ieee = $_POST['ieee'];
        $state = null;
        if (!empty($z2m_path) && file_exists($z2m_path . '/state.json')) {
            $z2m_raw = @file_get_contents($z2m_path . '/state.json');
            $z2m_data = $z2m_raw ? @json_decode($z2m_raw, true) : array();
            if (is_array($z2m_data) && isset($z2m_data[$ieee])) {
                $state = $z2m_data[$ieee];
            }
        }
        echo json_encode(array('ieee' => $ieee, 'state' => $state));
        exit;
    }

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

    if ($_POST['action'] === 'get_log_data') {
        header('Content-Type: application/json');
        $log_base = LBPDATADIR . '/watchdog.log';
        $volume = isset($_POST['volume']) ? $_POST['volume'] : '100';
        $severity = strtolower(isset($_POST['severity']) ? $_POST['severity'] : 'all');
        $search = isset($_POST['search']) ? $_POST['search'] : '';

        // Collect all log entries from all files (current file first, then rotated)
        $all_entries = array();
        $files = array($log_base);
        for ($i = 1; $i <= 10; $i++) {
            if (file_exists($log_base . '.' . $i)) $files[] = $log_base . '.' . $i;
        }
        foreach ($files as $f) {
            if (!file_exists($f)) continue;
            $lines = file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if (!$lines) continue;
            foreach ($lines as $line) {
                $entry = @json_decode($line, true);
                if (!$entry || !isset($entry['ts'])) continue;
                $all_entries[] = $entry;
            }
        }

        // Sort newest first
        usort($all_entries, function($a, $b) {
            return strcmp($b['ts'], $a['ts']);
        });

        // Apply severity filter
        if ($severity !== 'all') {
            $all_entries = array_values(array_filter($all_entries, function($e) use ($severity) {
                return strtolower($e['sev']) === $severity;
            }));
        }

        // Apply text search filter
        if ($search !== '') {
            $search_lower = strtolower($search);
            $all_entries = array_values(array_filter($all_entries, function($e) use ($search_lower) {
                return strpos(strtolower($e['msg']), $search_lower) !== false;
            }));
        }

        $total = count($all_entries);

        // Apply volume filter
        if (preg_match('/^(\d+)$/', $volume, $m)) {
            // Line count mode
            $all_entries = array_slice($all_entries, 0, intval($m[1]));
        } elseif (preg_match('/^(\d+)h$/', $volume, $m)) {
            // Time-based mode
            $cutoff = date('c', time() - intval($m[1]) * 3600);
            $all_entries = array_values(array_filter($all_entries, function($e) use ($cutoff) {
                return $e['ts'] >= $cutoff;
            }));
        }
        // "all" = no volume filter (but cap at 5000)
        $truncated = false;
        if (count($all_entries) > 5000) {
            $all_entries = array_slice($all_entries, 0, 5000);
            $truncated = true;
        }

        echo json_encode(array('entries' => $all_entries, 'total' => $total, 'truncated' => $truncated));
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
                $cron_ok = update_cron(intval($new_config['CRON']['interval_minutes']));
                // Log config save event
                $log_entry = json_encode(array(
                    'ts' => gmdate('Y-m-d\TH:i:s.000\Z'),
                    'sev' => 'Info',
                    'src' => 'config',
                    'msg' => 'Settings saved via web UI',
                )) . "\n";
                @file_put_contents(LBPDATADIR . '/watchdog.log', $log_entry, FILE_APPEND | LOCK_EX);
                $redirect = 'index.php?msg=saved';
                if (!$cron_ok) {
                    $redirect .= '&cron_error=1';
                }
                header('Location: ' . $redirect);
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
// Check cron job status
// ------------------------------------------------------------------
$cron_file = LBHOMEDIR . '/system/cron/cron.d/zigbee_watchdog';
$cron_installed = file_exists($cron_file);
$cron_error_param = isset($_GET['cron_error']) && $_GET['cron_error'] === '1';

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

$navbar[4]['Name'] = $L['NAV.LOGS'];
$navbar[4]['URL']  = 'index.php?tab=logs';
if ($tab === 'logs') $navbar[4]['active'] = true;

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

<!-- Tab content container (navigation is handled by Loxberry SDK $navbar above) -->
<div data-role="tabs">
    <div data-role="navbar" style="display:none;">
        <ul>
            <li><a href="#tab-settings">Settings</a></li>
            <li><a href="#tab-status">Status</a></li>
            <li><a href="#tab-blinds">Blinds</a></li>
            <li><a href="#tab-logs">Logs</a></li>
        </ul>
    </div>

    <!-- ============================================================ -->
    <!-- SETTINGS TAB                                                  -->
    <!-- ============================================================ -->
    <div id="tab-settings">
        <form method="post" action="index.php" data-ajax="false">
            <input type="hidden" name="action" id="form-action" value="save_settings">

<?php if (!$cron_installed || $cron_error_param): ?>
            <div style="background:#FF9800;color:#fff;padding:10px 15px;margin:10px 0;border-radius:4px;">
                <strong>Cron job not installed.</strong> The scheduled watchdog run is not active. Try saving settings again. If this persists, check the Logs tab for errors or reinstall the plugin.
            </div>
<?php endif; ?>

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

            <!-- Logging Section -->
            <h3><?php echo htmlspecialchars($L['SETTINGS.SECTION_LOGGING']); ?></h3>
            <div data-role="fieldcontain">
                <label for="log_max_size"><?php echo htmlspecialchars($L['SETTINGS.LOG_MAX_SIZE']); ?></label>
                <?php $current_log_size = intval($config['LOGGING']['log_max_size']); ?>
                <select name="log_max_size" id="log_max_size">
                    <option value="512" <?php echo $current_log_size === 512 ? 'selected' : ''; ?>>512 KB</option>
                    <option value="1024" <?php echo $current_log_size === 1024 ? 'selected' : ''; ?>>1 MB</option>
                    <option value="2048" <?php echo $current_log_size === 2048 ? 'selected' : ''; ?>>2 MB</option>
                </select>
                <p class="ui-body-d" style="font-size:0.85em;margin-top:2px;"><?php echo htmlspecialchars($L['SETTINGS.LOG_MAX_SIZE_HELP']); ?></p>
            </div>
            <div data-role="fieldcontain">
                <label for="log_max_files"><?php echo htmlspecialchars($L['SETTINGS.LOG_MAX_FILES']); ?></label>
                <?php $current_log_files = intval($config['LOGGING']['log_max_files']); ?>
                <select name="log_max_files" id="log_max_files">
                    <option value="3" <?php echo $current_log_files === 3 ? 'selected' : ''; ?>>3 files</option>
                    <option value="5" <?php echo $current_log_files === 5 ? 'selected' : ''; ?>>5 files</option>
                    <option value="10" <?php echo $current_log_files === 10 ? 'selected' : ''; ?>>10 files</option>
                </select>
                <p class="ui-body-d" style="font-size:0.85em;margin-top:2px;"><?php echo htmlspecialchars($L['SETTINGS.LOG_MAX_FILES_HELP']); ?></p>
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
        <div id="status-refreshed" style="font-size:0.85em;color:#666;margin:5px 0;">
            <?php echo htmlspecialchars($L['STATUS.DATA_REFRESHED']); ?><?php echo date('Y-m-d H:i:s'); ?>
        </div>
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
        <div id="blinds-refreshed" style="font-size:0.85em;color:#666;margin:10px 0 0 0;">
            <?php echo htmlspecialchars($L['STATUS.DATA_REFRESHED']); ?><?php echo date('Y-m-d H:i:s'); ?>
        </div>
        <table id="blinds-table" data-role="table" class="ui-responsive" style="width:100%;border-collapse:collapse;margin-top:20px;">
            <thead>
                <tr style="background:#f5f5f5;">
                    <th style="padding:8px;text-align:left;cursor:pointer;" onclick="sortTable(this.closest('table'), 0, 'str')"><?php echo htmlspecialchars($L['STATUS.COL_DEVICE']); ?></th>
                    <th style="padding:8px;text-align:left;cursor:pointer;" onclick="sortTable(this.closest('table'), 1, 'str')"><?php echo htmlspecialchars($L['STATUS.COL_DESCRIPTION']); ?></th>
                    <th style="padding:8px;text-align:left;cursor:pointer;" onclick="sortTable(this.closest('table'), 2, 'num')"><?php echo htmlspecialchars($L['STATUS.COL_POSITION']); ?></th>
                    <th style="padding:8px;text-align:left;cursor:pointer;" onclick="sortTable(this.closest('table'), 3, 'str')"><?php echo htmlspecialchars($L['STATUS.COL_STATE']); ?></th>
                    <th style="padding:8px;text-align:left;cursor:pointer;" onclick="sortTable(this.closest('table'), 4, 'str')"><?php echo htmlspecialchars($L['STATUS.COL_MOTOR_REVERSAL']); ?></th>
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
                    <td style="padding:8px;"><?php echo htmlspecialchars($row['description']); ?></td>
                    <td style="padding:8px;"><?php echo $position !== null ? htmlspecialchars($position) . '%' : 'N/A'; ?></td>
                    <td style="padding:8px;"><?php echo $state_val !== null ? htmlspecialchars($state_val) : 'N/A'; ?></td>
                    <td style="padding:8px;"><?php echo $motor_rev !== null ? htmlspecialchars($motor_rev) : 'N/A'; ?></td>
                </tr>
<?php endforeach; ?>
            </tbody>
        </table>
    </div>

    <!-- ============================================================ -->
    <!-- LOGS TAB                                                      -->
    <!-- ============================================================ -->
    <div id="tab-logs">
        <!-- Filter controls row -->
        <div style="display:flex;align-items:center;gap:16px;margin:16px 0;flex-wrap:wrap;">
            <label for="log-volume" style="font-size:0.9em;margin:0;"><?php echo htmlspecialchars($L['LOGS.FILTER_VOLUME']); ?></label>
            <select id="log-volume" data-mini="true" style="width:auto;">
                <option value="100" selected>100 Lines</option>
                <option value="200">200 Lines</option>
                <option value="300">300 Lines</option>
                <option value="1h">Last 1 Hour</option>
                <option value="2h">Last 2 Hours</option>
                <option value="4h">Last 4 Hours</option>
                <option value="8h">Last 8 Hours</option>
                <option value="24h">Last 24 Hours</option>
                <option value="48h">Last 48 Hours</option>
                <option value="96h">Last 96 Hours</option>
                <option value="all">All Logs</option>
            </select>
            <label for="log-severity" style="font-size:0.9em;margin:0;"><?php echo htmlspecialchars($L['LOGS.FILTER_SEVERITY']); ?></label>
            <select id="log-severity" data-mini="true" style="width:auto;">
                <option value="all" selected>All</option>
                <option value="debug">Debug</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
            </select>
            <input type="search" id="log-search" placeholder="<?php echo htmlspecialchars($L['LOGS.SEARCH_PLACEHOLDER']); ?>"
                   style="flex:1;min-width:200px;padding:8px 8px 8px 28px;box-sizing:border-box;" data-mini="true">
        </div>

        <!-- Entry count and data refreshed row -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin:4px 0;">
            <span id="log-entry-count" style="font-size:0.85em;color:#666;"></span>
            <span id="log-refreshed" style="font-size:0.85em;color:#666;"></span>
        </div>

        <!-- Error notice (hidden by default) -->
        <div id="log-error" style="font-size:0.85em;color:#f44336;margin:4px 0;display:none;">
            <?php echo htmlspecialchars($L['LOGS.ERROR']); ?>
        </div>

        <!-- Empty state (shown when no logs exist) -->
        <div id="log-empty" style="text-align:center;padding:40px 16px;display:none;">
            <p style="font-weight:bold;margin:0;"><?php echo htmlspecialchars($L['LOGS.EMPTY_HEADING']); ?></p>
            <p style="font-size:0.85em;color:#666;margin:8px 0 0 0;"><?php echo htmlspecialchars($L['LOGS.EMPTY_BODY']); ?></p>
        </div>

        <!-- Log table -->
        <table id="log-table" style="width:100%;border-collapse:collapse;margin-top:8px;display:none;">
            <thead>
                <tr style="background:#f5f5f5;">
                    <th style="padding:8px;text-align:left;">Timestamp</th>
                    <th style="padding:8px;text-align:left;width:80px;">Severity</th>
                    <th style="padding:8px;text-align:left;width:80px;">Source</th>
                    <th style="padding:8px;text-align:left;">Message</th>
                </tr>
            </thead>
            <tbody id="log-tbody"></tbody>
        </table>
    </div>

</div>

<!-- Search input padding fix for magnifying glass icon -->
<style>
#device-search {
    padding-left: 2.2em !important;
}
@keyframes log-highlight {
    from { background-color: rgba(255, 235, 59, 0.4); }
    to { background-color: transparent; }
}
.log-new { animation: log-highlight 2.5s ease-out forwards; }
.log-msg-cell {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 400px;
    cursor: pointer;
}
.log-msg-cell.expanded {
    white-space: pre-wrap;
    word-wrap: break-word;
    max-width: none;
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

// ------------------------------------------------------------------
// AJAX polling: live-update Device Status and Blinds tables
// ------------------------------------------------------------------

function escapeAttr(s) {
    return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function badgeColor(status) {
    if (status === 'Offline') return '#f44336';
    if (status === 'Low Battery') return '#FF9800';
    if (status === 'Excluded') return '#9E9E9E';
    return '#4CAF50';
}

function updateStatusTable(data) {
    var tbody = document.querySelector('#device-table tbody');
    if (!tbody || !data.devices) return;
    var html = '';
    for (var i = 0; i < data.devices.length; i++) {
        var d = data.devices[i];
        var stateAttr = d.z2m_state ? ' data-z2m-state="' + escapeAttr(JSON.stringify(d.z2m_state)) + '"' : '';
        var cursorStyle = d.z2m_state ? 'cursor:pointer;' : '';
        var bg = badgeColor(d.alert_status);
        var batteryText = d.battery !== null ? d.battery + '%' : 'N/A';
        var lqiText = d.linkquality !== null ? d.linkquality : 'N/A';
        var lqiSort = d.linkquality !== null ? d.linkquality : -1;

        html += '<tr style="border-bottom:1px solid #ddd;" data-ieee="' + escapeAttr(d.ieee) + '" data-excluded="' + (d.is_excluded ? '1' : '0') + '">';
        html += '<td style="padding:8px;">' + escapeAttr(d.name) + '</td>';
        html += '<td style="padding:8px;">' + escapeAttr(d.description) + '</td>';
        html += '<td style="padding:8px;" data-sort-value="' + d.last_seen_ts + '">' + escapeAttr(d.last_seen_age) + '</td>';
        html += '<td style="padding:8px;" data-sort-value="' + d.battery_sort + '">' + batteryText + '</td>';
        html += '<td style="padding:8px;" data-sort-value="' + lqiSort + '">' + lqiText + '</td>';
        html += '<td style="padding:8px;" data-sort-value="' + d.sort_priority + '">';
        html += '<span style="background:' + bg + ';color:#fff;padding:2px 8px;border-radius:3px;font-size:0.85em;' + cursorStyle + '"' + stateAttr + '>';
        html += escapeAttr(d.alert_status);
        html += '</span></td>';
        html += '<td style="padding:8px;">';
        html += '<input type="checkbox" class="exclude-cb" data-ieee="' + escapeAttr(d.ieee) + '"' + (d.is_excluded ? ' checked' : '') + '>';
        html += '</td></tr>';
    }
    tbody.innerHTML = html;

    // Update last_run text
    if (data.last_run) {
        var spans = document.querySelectorAll('#tab-status span');
        for (var j = 0; j < spans.length; j++) {
            var txt = spans[j].textContent || '';
            if (txt.indexOf('<?php echo addslashes($L['STATUS.LAST_UPDATED']); ?>') !== -1 || txt.indexOf('Last updated') !== -1) {
                try {
                    var dt = new Date(data.last_run);
                    var formatted = dt.getFullYear() + '-' +
                        ('0' + (dt.getMonth()+1)).slice(-2) + '-' +
                        ('0' + dt.getDate()).slice(-2) + ' ' +
                        ('0' + dt.getHours()).slice(-2) + ':' +
                        ('0' + dt.getMinutes()).slice(-2) + ':' +
                        ('0' + dt.getSeconds()).slice(-2);
                    spans[j].innerHTML = '<?php echo addslashes($L['STATUS.LAST_UPDATED']); ?>' + formatted;
                } catch(e) {}
                break;
            }
        }
    }

    reapplySort(document.getElementById('device-table'));
    var now = new Date();
    var ts = now.getFullYear() + '-' + ('0'+(now.getMonth()+1)).slice(-2) + '-' + ('0'+now.getDate()).slice(-2) + ' ' + ('0'+now.getHours()).slice(-2) + ':' + ('0'+now.getMinutes()).slice(-2) + ':' + ('0'+now.getSeconds()).slice(-2);
    var el = document.getElementById('status-refreshed');
    if (el) el.textContent = '<?php echo addslashes($L['STATUS.DATA_REFRESHED']); ?>' + ts;
    applyFilters();
}

function updateBlindsTable(data) {
    var tbody = document.querySelector('#blinds-table tbody');
    if (!tbody || !data.devices) return;
    var html = '';
    for (var i = 0; i < data.devices.length; i++) {
        var d = data.devices[i];
        if (d.name.indexOf('MS-108ZR') !== 0) continue;
        var z = d.z2m_state || {};
        var pos = z.position !== undefined && z.position !== null ? z.position + '%' : 'N/A';
        var st = z.state !== undefined && z.state !== null ? escapeAttr(String(z.state)) : 'N/A';
        var mr = z.motor_reversal !== undefined && z.motor_reversal !== null ? escapeAttr(String(z.motor_reversal)) : 'N/A';
        html += '<tr style="border-bottom:1px solid #ddd;">';
        html += '<td style="padding:8px;">' + escapeAttr(d.name) + '</td>';
        html += '<td style="padding:8px;">' + escapeAttr(d.description) + '</td>';
        html += '<td style="padding:8px;">' + pos + '</td>';
        html += '<td style="padding:8px;">' + st + '</td>';
        html += '<td style="padding:8px;">' + mr + '</td>';
        html += '</tr>';
    }
    tbody.innerHTML = html;
    reapplySort(document.getElementById('blinds-table'));
    var now = new Date();
    var ts = now.getFullYear() + '-' + ('0'+(now.getMonth()+1)).slice(-2) + '-' + ('0'+now.getDate()).slice(-2) + ' ' + ('0'+now.getHours()).slice(-2) + ':' + ('0'+now.getMinutes()).slice(-2) + ':' + ('0'+now.getSeconds()).slice(-2);
    var el = document.getElementById('blinds-refreshed');
    if (el) el.textContent = '<?php echo addslashes($L['STATUS.DATA_REFRESHED']); ?>' + ts;
}

// Polling logic
var pollTimer = null;
var POLL_INTERVAL = 30000;

function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(function() {
        if (document.hidden) return;
        // Only poll if status or blinds tab is active (not settings)
        try {
            var activeTab = jQuery('[data-role="tabs"]').tabs('option', 'active');
            if (activeTab === 0 || activeTab === 3) return; // Settings or Logs tab -- skip
        } catch(e) {}
        jQuery.post('index.php', { action: 'get_status_data' }, function(data) {
            updateStatusTable(data);
            updateBlindsTable(data);
        }, 'json').fail(function() {
            // Silent fail -- next poll will retry
        });
    }, POLL_INTERVAL);
}

function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

if (typeof jQuery !== 'undefined') {
    jQuery(document).on('pagecreate', function() {
        startPolling();
        // If logs tab is active on page load, start log polling instead
        var initialTab = <?php echo $tab === 'logs' ? '3' : ($tab === 'blinds' ? '2' : ($tab === 'status' ? '1' : '0')); ?>;
        if (initialTab === 3) {
            stopPolling();
            startLogPolling();
        }
    });
}

// Z2M state tooltip popup — fetches live data on click
if (typeof jQuery !== 'undefined') {
    jQuery(document).on('click', '[data-z2m-state]', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var badge = jQuery(this);
        var ieee = badge.closest('tr').attr('data-ieee');
        if (!ieee) return;
        jQuery('#state-popup-content').text('Loading...');
        jQuery('#state-popup').popup('open', { positionTo: this });
        jQuery.post('index.php', { action: 'get_device_state', ieee: ieee }, function(data) {
            if (data && data.state) {
                jQuery('#state-popup-content').text(JSON.stringify(data.state, null, 2));
            } else {
                jQuery('#state-popup-content').text('No state data available');
            }
        }, 'json').fail(function() {
            jQuery('#state-popup-content').text('Failed to fetch state');
        });
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
    table.dataset.sortType = type;

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

// Re-apply current sort after AJAX table rebuild
function reapplySort(table) {
    if (!table || !table.dataset.sortCol) return;
    var col = parseInt(table.dataset.sortCol, 10);
    var asc = table.dataset.sortAsc === 'true';
    var type = table.dataset.sortType || 'str';
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
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

// ------------------------------------------------------------------
// Log tab: polling, rendering, filters
// ------------------------------------------------------------------

var logPollTimer = null;
var LOG_POLL_INTERVAL = 10000;
var lastNewestTs = null;

function sevBadgeColor(sev) {
    sev = (sev || '').toLowerCase();
    if (sev === 'error') return '#f44336';
    if (sev === 'warning') return '#FF9800';
    if (sev === 'info') return '#4CAF50';
    return '#9E9E9E'; // debug
}

function sevRowTint(sev) {
    sev = (sev || '').toLowerCase();
    if (sev === 'error') return 'rgba(244, 67, 54, 0.06)';
    if (sev === 'warning') return 'rgba(255, 152, 0, 0.06)';
    if (sev === 'info') return 'rgba(76, 175, 80, 0.06)';
    return 'rgba(158, 158, 158, 0.06)'; // debug
}

function formatLogTimestamp(isoStr) {
    try {
        var d = new Date(isoStr);
        return d.getFullYear() + '-' +
            ('0' + (d.getMonth()+1)).slice(-2) + '-' +
            ('0' + d.getDate()).slice(-2) + ' ' +
            ('0' + d.getHours()).slice(-2) + ':' +
            ('0' + d.getMinutes()).slice(-2) + ':' +
            ('0' + d.getSeconds()).slice(-2);
    } catch(e) { return isoStr; }
}

function renderLogTable(data) {
    var table = document.getElementById('log-table');
    var tbody = document.getElementById('log-tbody');
    var empty = document.getElementById('log-empty');
    var countEl = document.getElementById('log-entry-count');
    var errorEl = document.getElementById('log-error');

    errorEl.style.display = 'none';

    if (!data.entries || data.entries.length === 0) {
        table.style.display = 'none';
        // Check if this is a filtered empty or truly no logs
        var vol = document.getElementById('log-volume');
        var sev = document.getElementById('log-severity');
        var search = document.getElementById('log-search');
        var hasFilters = (vol && vol.value !== '100') || (sev && sev.value !== 'all') || (search && search.value.length >= 2);
        if (hasFilters) {
            empty.style.display = 'block';
            empty.querySelector('p:first-child').textContent = '<?php echo addslashes($L['LOGS.EMPTY_FILTERED']); ?>';
            empty.querySelector('p:last-child').style.display = 'none';
        } else {
            empty.style.display = 'block';
            empty.querySelector('p:first-child').textContent = '<?php echo addslashes($L['LOGS.EMPTY_HEADING']); ?>';
            var sub = empty.querySelector('p:last-child');
            if (sub) { sub.style.display = ''; sub.textContent = '<?php echo addslashes($L['LOGS.EMPTY_BODY']); ?>'; }
        }
        if (countEl) countEl.textContent = '';
        return;
    }

    empty.style.display = 'none';
    table.style.display = '';

    // Determine new entries for highlight
    var prevNewest = lastNewestTs;
    var currentNewest = data.entries.length > 0 ? data.entries[0].ts : null;

    var html = '';
    for (var i = 0; i < data.entries.length; i++) {
        var e = data.entries[i];
        var isNew = prevNewest && e.ts > prevNewest;
        var rowClass = isNew ? ' class="log-new"' : '';
        var tint = sevRowTint(e.sev);
        var bg = sevBadgeColor(e.sev);
        html += '<tr style="border-bottom:1px solid #ddd;background:' + tint + ';"' + rowClass + '>';
        html += '<td style="padding:8px;white-space:nowrap;">' + formatLogTimestamp(e.ts) + '</td>';
        html += '<td style="padding:8px;"><span style="background:' + bg + ';color:#fff;padding:4px 8px;border-radius:4px;font-size:0.85em;">' + escapeAttr(e.sev) + '</span></td>';
        html += '<td style="padding:8px;">' + escapeAttr(e.src || '') + '</td>';
        html += '<td style="padding:8px;" class="log-msg-cell">' + escapeAttr(e.msg || '') + '</td>';
        html += '</tr>';
    }
    tbody.innerHTML = html;

    if (currentNewest) lastNewestTs = currentNewest;

    // Entry count
    if (countEl) {
        if (data.truncated) {
            countEl.textContent = '<?php echo addslashes($L['LOGS.TRUNCATED']); ?>';
        } else if (data.total > data.entries.length) {
            countEl.textContent = '<?php echo addslashes($L['LOGS.ENTRY_COUNT_OF']); ?>'.replace('%s', data.entries.length).replace('%s', data.total);
        } else {
            countEl.textContent = '<?php echo addslashes($L['LOGS.ENTRY_COUNT']); ?>'.replace('%s', data.entries.length);
        }
    }

    // Data refreshed timestamp
    var refreshEl = document.getElementById('log-refreshed');
    if (refreshEl) {
        var now = new Date();
        var ts = now.getFullYear() + '-' + ('0'+(now.getMonth()+1)).slice(-2) + '-' + ('0'+now.getDate()).slice(-2) + ' ' + ('0'+now.getHours()).slice(-2) + ':' + ('0'+now.getMinutes()).slice(-2) + ':' + ('0'+now.getSeconds()).slice(-2);
        refreshEl.textContent = '<?php echo addslashes($L['STATUS.DATA_REFRESHED']); ?>' + ts;
    }
}

function fetchLogs() {
    var vol = document.getElementById('log-volume');
    var sev = document.getElementById('log-severity');
    var search = document.getElementById('log-search');
    var params = {
        action: 'get_log_data',
        volume: vol ? vol.value : '100',
        severity: sev ? sev.value : 'all',
        search: search ? search.value : ''
    };
    jQuery.post('index.php', params, function(data) {
        renderLogTable(data);
    }, 'json').fail(function() {
        var errorEl = document.getElementById('log-error');
        if (errorEl) errorEl.style.display = '';
    });
}

function startLogPolling() {
    if (logPollTimer) return;
    fetchLogs(); // Initial load
    logPollTimer = setInterval(function() {
        if (document.hidden) return;
        try {
            var activeTab = jQuery('[data-role="tabs"]').tabs('option', 'active');
            if (activeTab !== 3) return; // Only poll on Logs tab
        } catch(e) {}
        fetchLogs();
    }, LOG_POLL_INTERVAL);
}

function stopLogPolling() {
    if (logPollTimer) { clearInterval(logPollTimer); logPollTimer = null; }
}

// Wire filter controls
if (typeof jQuery !== 'undefined') {
    jQuery(document).on('change', '#log-volume, #log-severity', function() {
        fetchLogs();
    });
    var logSearchTimer = null;
    jQuery(document).on('input', '#log-search', function() {
        if (logSearchTimer) clearTimeout(logSearchTimer);
        var val = this.value;
        logSearchTimer = setTimeout(function() {
            if (val.length >= 2 || val.length === 0) fetchLogs();
        }, 350);
    });
    jQuery(document).on('search', '#log-search', function() {
        if (logSearchTimer) clearTimeout(logSearchTimer);
        fetchLogs();
    });
}

// Message cell click-to-expand
jQuery(document).on('click', '.log-msg-cell', function() {
    jQuery(this).toggleClass('expanded');
});

// Tab change: manage polling
jQuery(document).on('tabsactivate', '[data-role="tabs"]', function(event, ui) {
    var newIndex = jQuery('[data-role="tabs"]').tabs('option', 'active');
    if (newIndex === 3) {
        // Entering Logs tab
        stopPolling();      // Stop device polling
        startLogPolling();  // Start log polling
    } else {
        stopLogPolling();   // Stop log polling
        if (newIndex === 1 || newIndex === 2) {
            startPolling(); // Restart device polling for Status/Blinds
        }
    }
});

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
if ($tab === 'logs') $tab_index = 3;
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
