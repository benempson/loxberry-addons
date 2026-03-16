# Phase 4: Web Config UI - Research

**Researched:** 2026-03-16
**Domain:** PHP web interface for Loxberry plugin configuration
**Confidence:** MEDIUM

## Summary

This phase builds a PHP web configuration page integrated with Loxberry's admin UI framework. Loxberry provides a complete SDK for PHP plugin web interfaces via `loxberry_system.php` and `loxberry_web.php`, which supply jQuery Mobile as the CSS/JS framework, automatic header/footer rendering, and plugin directory path globals. The target PHP version is 7.4 (Loxberry 3.x ships PHP 7.4 even on Debian 12 Bookworm).

The primary challenge is reading and writing the INI config file in a format that the existing Node.js `config.js` module can parse unchanged. Loxberry includes the `Config_Lite` PEAR library for INI read/write operations, which should be used instead of hand-rolling `parse_ini_file` + manual serialization. The EXCLUSIONS section requires special handling because devices are stored as a comma-separated string with comment annotations.

jQuery Mobile 1.4.x provides a built-in tabs widget (`data-role="tabs"`) that maps directly to the decided three-tab layout (Settings, Exclusions, Device Status). No additional JS framework is needed for tabs. Column sorting on the status table will require a small vanilla JS function since jQuery Mobile does not include table sorting.

**Primary recommendation:** Use Loxberry's PHP SDK (`loxberry_web.php`, `loxberry_system.php`) with `Config_Lite` for INI operations, jQuery Mobile tabs for layout, and vanilla JS for client-side sorting and SMTP field toggle.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Tabbed layout with three tabs: Settings | Exclusions | Device Status
- Settings tab contains all config sections (MQTT, Thresholds, Cron, Notifications) with a single Save button
- SMTP fields show/hide based on "Enable email" toggle (requires small JS)
- Save submits form, writes INI, reloads page with green "Settings saved" flash message
- Device Status tab has a "Refresh Data" button that triggers a one-off watchdog run via PHP `exec()`, then reloads with fresh data
- Device Status columns: Device name, Last seen (human-readable age), Battery level, Alert status
- Default sort: alerts first (offline, then low battery), then OK devices alphabetically
- Clickable column headers for client-side re-sorting (requires JS sorting)
- Excluded devices appear in the table with an "Excluded" badge
- Data is a static snapshot from last cron run (state.json); "Last updated" timestamp shown
- No auto-refresh -- user manually reloads or uses Refresh Data button
- Checkbox list of all discovered devices (from state.json), checked = excluded
- Shows friendly name in the UI but stores IEEE address as the matching key
- INI stores both IEEE and friendly name for readability (e.g., `0x00158d0001a2b3c4 # Kitchen motion sensor`)
- Unified exclusion list -- no separate "currently excluded" section; toggle on/off in one place
- Text filter/search box above the list for finding devices in a 50+ device list
- Client-side HTML5 validation (required, pattern) for instant feedback, plus PHP server-side validation as safety net
- "Test MQTT Connection" button -- attempts connection with entered settings, reports success/failure
- "Send Test Email" button -- sends test email using entered SMTP settings
- Password fields (MQTT, SMTP) masked by default with eye icon reveal toggle; pre-filled from INI

### Claude's Discretion
- PHP file structure (single file vs includes)
- Loxberry header/footer integration (research needed -- verify on live system)
- CSS styling approach within Loxberry's framework
- JS sorting library choice (or vanilla JS)
- Exact test connection/email implementation details
- Tab implementation (CSS tabs, JS tabs, or separate URL params)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONF-01 | PHP config page for MQTT connection settings (host, port, base topic, username, password) | Loxberry SDK path globals + Config_Lite for INI read/write; jQuery Mobile form widgets for input fields |
| CONF-02 | PHP config page for alert thresholds (offline hours, battery percentage) | Config_Lite `set()` for numeric fields; HTML5 `type="number"` with min/max validation |
| CONF-03 | PHP config page for notification preferences (enable/disable Loxberry notifications, enable/disable email, SMTP settings) | Config_Lite boolean handling with `getBool()`; jQuery Mobile flip switches for toggles; JS show/hide for SMTP fields |
| CONF-04 | PHP config page for device exclusion list | state.json provides device list; comma-separated IEEE addresses in INI; checkbox UI with search filter |
| CONF-05 | PHP config page for cron interval setting | Simple numeric field in CRON section; Config_Lite `set()` |
| CONF-06 | Device status table showing all tracked devices with last-seen age, battery level, and alert state | `json_decode()` of state.json; PHP time formatting for age; vanilla JS for column sorting |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| loxberry_system.php | LB 3.x | Plugin path globals, system functions | Loxberry SDK -- required for all PHP plugins |
| loxberry_web.php | LB 3.x | Header/footer, navbar, jQuery Mobile includes | Loxberry SDK -- provides consistent admin UI chrome |
| Config_Lite | PEAR (bundled) | INI file read/write with section support | Included in Loxberry core; handles sections, comments, locking |
| jQuery Mobile | 1.4.x | UI framework (tabs, forms, buttons) | Loaded automatically by Loxberry header; no additional install |
| jQuery | (bundled) | DOM manipulation, AJAX | Loaded automatically by Loxberry as jQuery Mobile dependency |
| PHP | 7.4 | Server-side language | Loxberry 3.x ships PHP 7.4 (even on Debian 12) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| parse_ini_file() | PHP built-in | Read-only INI parsing (fallback) | If Config_Lite unavailable; use INI_SCANNER_RAW |
| json_decode() | PHP built-in | Read state.json for device data | Status table and exclusion list population |
| exec() | PHP built-in | Run watchdog.js for "Refresh Data" | On-demand watchdog run from Status tab |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Config_Lite | Manual parse_ini_file + fwrite | Config_Lite handles edge cases, comments, locking; manual is error-prone |
| jQuery Mobile tabs | URL parameter tabs (?tab=settings) | jQuery Mobile tabs are built-in, no page reload, zero extra code |
| Vanilla JS sorting | Stupid-table-sort / list.js | Extra dependency for a simple table sort; vanilla JS is sufficient for static data |
| Single PHP file | Multiple PHP files + includes | Single file keeps it simple for a 3-tab config page; split only if exceeding ~500 lines |

## Architecture Patterns

### Recommended Project Structure
```
webfrontend/
  htmlauth/
    index.php              # Main config page (all 3 tabs)
templates/
  lang/
    language_en.ini        # English strings
    language_de.ini         # German strings (optional)
```

### Pattern 1: Loxberry PHP Page Skeleton
**What:** Standard structure for a Loxberry plugin config page
**When to use:** Every PHP page in the plugin
**Example:**
```php
<?php
// Source: Loxberry Wiki - PHP functions to create your webpage
require_once "loxberry_system.php";
require_once "loxberry_web.php";

// Language support
$L = LBSystem::readlanguage("language.ini");

// Navbar (tabs) -- Loxberry uses $navbar global for top navigation
$navbar[1]['Name'] = $L['NAV.SETTINGS'];
$navbar[1]['URL'] = 'index.php';
$navbar[1]['active'] = True;

$navbar[2]['Name'] = $L['NAV.EXCLUSIONS'];
$navbar[2]['URL'] = 'index.php?tab=exclusions';

$navbar[3]['Name'] = $L['NAV.STATUS'];
$navbar[3]['URL'] = 'index.php?tab=status';

// Header
LBWeb::lbheader("Zigbee Watchdog", "https://github.com/...", "");

// ... page content ...

// Footer
LBWeb::lbfooter();
?>
```

### Pattern 2: jQuery Mobile Tabs (In-Page)
**What:** Tabs without page reload using jQuery Mobile's built-in tabs widget
**When to use:** The three-tab layout decided by the user
**Example:**
```html
<!-- Source: jQuery Mobile API docs - Tabs Widget -->
<div data-role="tabs">
  <div data-role="navbar">
    <ul>
      <li><a href="#tab-settings" class="ui-btn-active">Settings</a></li>
      <li><a href="#tab-exclusions">Exclusions</a></li>
      <li><a href="#tab-status">Device Status</a></li>
    </ul>
  </div>
  <div id="tab-settings">
    <!-- Settings form content -->
  </div>
  <div id="tab-exclusions">
    <!-- Exclusion list content -->
  </div>
  <div id="tab-status">
    <!-- Device status table -->
  </div>
</div>
```

### Pattern 3: Config_Lite INI Read/Write
**What:** Reading and writing INI config files with section support
**When to use:** Loading current config on page load, saving on form submit
**Example:**
```php
<?php
// Source: Loxberry Wiki - Writing ini files in PHP
require_once 'Config/Lite.php';

$cfgfile = LBPCONFIGDIR . "/watchdog.cfg";

// Read
$cfg = new Config_Lite($cfgfile, LOCK_EX, INI_SCANNER_RAW);
$mqtt_host = $cfg->get('MQTT', 'host', 'localhost');
$email_enabled = $cfg->getBool('NOTIFICATIONS', 'email_enabled', false);

// Write
$cfg->set('MQTT', 'host', $_POST['mqtt_host']);
$cfg->set('NOTIFICATIONS', 'email_enabled', $_POST['email_enabled'] ? '1' : '0');
$cfg->save();
```

### Pattern 4: State.json Reading for Status Table
**What:** Reading the watchdog state file for device display
**When to use:** Populating the Device Status table and Exclusions checkbox list
**Example:**
```php
<?php
$statefile = LBPDATADIR . "/state.json";
$state = json_decode(file_get_contents($statefile), true);

// Build device table data
$devices = [];
if (isset($state['devices'])) {
    foreach ($state['devices'] as $ieee => $dev) {
        $age = '';
        if (!empty($dev['last_seen'])) {
            $last = strtotime($dev['last_seen']);
            $diff = time() - $last;
            $age = formatAge($diff); // Custom helper
        }
        $devices[] = [
            'ieee' => $ieee,
            'name' => $dev['friendly_name'] ?? $ieee,
            'last_seen_age' => $age,
            'battery' => $dev['battery'],
            'alerts' => $dev['alerts'] ?? [],
            'power_source' => $dev['power_source'] ?? 'Unknown',
        ];
    }
}
```

### Pattern 5: Refresh Data via exec()
**What:** Running the watchdog on-demand from the Status tab
**When to use:** "Refresh Data" button click
**Example:**
```php
<?php
if (isset($_POST['action']) && $_POST['action'] === 'refresh') {
    $cmd = 'node ' . LBPBINDIR . '/watchdog.js 2>&1';
    $output = '';
    $retval = 0;
    exec($cmd, $output, $retval);
    // Redirect back to status tab with result
    $msg = ($retval === 0) ? 'refresh_ok' : 'refresh_fail';
    header('Location: index.php?tab=status&msg=' . $msg);
    exit;
}
```

### Anti-Patterns to Avoid
- **Hardcoded paths:** Never use `/opt/loxberry/config/plugins/zigbee_watchdog/` directly. Always use `LBPCONFIGDIR`, `LBPDATADIR`, `LBPBINDIR` constants from `loxberry_system.php`.
- **Writing INI by hand with fwrite:** Use Config_Lite which handles section headers, escaping, and file locking properly.
- **External CSS/JS CDN links:** Loxberry is often on isolated LANs. Use only what Loxberry provides (jQuery Mobile) or inline small scripts.
- **PHP sessions for flash messages:** Use URL query parameters (`?msg=saved`) -- simpler and stateless.
- **Forgetting INI_SCANNER_RAW:** PHP's default INI scanner interprets values like `0` as boolean false. Always use `INI_SCANNER_RAW` when working with Loxberry INI files.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| INI file read/write | Custom fwrite with section headers | Config_Lite (bundled in Loxberry) | Handles escaping, comments, locking, section management |
| Admin UI chrome | Custom HTML/CSS header/footer | LBWeb::lbheader() / LBWeb::lbfooter() | Consistent look, includes jQuery Mobile, handles auth |
| Plugin directory paths | Hardcoded /opt/loxberry/... strings | LBPCONFIGDIR, LBPDATADIR, LBPBINDIR constants | Paths may vary by installation; SDK resolves them |
| Tab widget | Custom CSS/JS tabs | jQuery Mobile `data-role="tabs"` | Already loaded by Loxberry; zero additional code |
| Form toggle switches | Custom checkbox styling | jQuery Mobile flip switch | Consistent with Loxberry admin UI style |
| Internationalization | Hardcoded English strings | LBSystem::readlanguage() + language.ini files | Built-in i18n support; standard Loxberry pattern |

**Key insight:** Loxberry's PHP SDK and jQuery Mobile provide nearly everything needed for this config UI. The only custom JS required is the table sort function, the SMTP field toggle, the device search filter, and the password reveal toggle.

## Common Pitfalls

### Pitfall 1: INI Format Mismatch Between PHP and Node.js
**What goes wrong:** PHP writes the INI file in a format that Node.js `ini` library cannot parse, or vice versa.
**Why it happens:** Different INI libraries handle quoting, escaping, and comment syntax differently. The Node.js `ini@5.x` parser and PHP's `Config_Lite` may serialize values differently.
**How to avoid:** After writing INI from PHP, verify the output matches the format that `config.js` expects. Boolean values must be `0` or `1` (not `true`/`false`). Numeric values must be plain strings. The EXCLUSIONS.devices field is a comma-separated string.
**Warning signs:** Settings saved in the UI are not picked up by the next cron run; Node.js reports parse errors.

### Pitfall 2: EXCLUSIONS.devices Comment Format
**What goes wrong:** The user decided to store exclusions as `0x00158d0001a2b3c4 # Kitchen motion sensor` in the INI file, but the Node.js `ini` parser treats `#` as a comment delimiter and strips everything after it.
**Why it happens:** The `ini` npm package (v5.x) treats `#` and `;` as inline comment markers.
**How to avoid:** Store the friendly name as a separate comment line above the value, OR store only IEEE addresses in the INI value (comma-separated) and use state.json for name resolution at display time. The safest approach: store only IEEE addresses in the INI value, display names from state.json. The comment annotation idea from CONTEXT.md may conflict with the ini parser.
**Warning signs:** Exclusion list loses entries after PHP save; device names appear in the IEEE address list.

### Pitfall 3: PHP exec() Timeout and Output Capture
**What goes wrong:** The "Refresh Data" button hangs or times out because exec() blocks until the watchdog process completes.
**Why it happens:** The watchdog has a 30s hard timeout, and PHP's default max_execution_time may be shorter.
**How to avoid:** The watchdog's 30s timeout is a built-in safety net. PHP's default timeout (30s) aligns with it. If the watchdog is already running (lock held), exec() should return quickly with exit code 0 (skip message). Capture stderr with `2>&1` to get error output.
**Warning signs:** "Refresh Data" button causes gateway timeout; blank response page.

### Pitfall 4: state.json Missing or Empty on First Run
**What goes wrong:** Device Status tab and Exclusion list show nothing because state.json does not exist yet (no cron run has occurred).
**Why it happens:** The plugin was just installed and configured but hasn't run yet.
**How to avoid:** Check if state.json exists before reading. Show a friendly "No data yet -- click Refresh Data or wait for the next cron run" message.
**Warning signs:** PHP warnings about missing file; empty table with no explanation.

### Pitfall 5: jQuery Mobile Auto-Enhancement of Dynamic Content
**What goes wrong:** Dynamically inserted form elements (like SMTP fields shown on toggle) do not get jQuery Mobile styling.
**Why it happens:** jQuery Mobile enhances elements on page load. Elements added or shown later need manual enhancement.
**How to avoid:** Use CSS `display:none/block` to show/hide SMTP fields rather than injecting new HTML. The elements are already enhanced but hidden. Alternatively, call `.enhanceWithin()` after showing.
**Warning signs:** SMTP fields appear unstyled compared to the rest of the form.

### Pitfall 6: Config_Lite May Not Be Available
**What goes wrong:** `require_once 'Config/Lite.php'` fails because Config_Lite is not in the PHP include path.
**Why it happens:** Loxberry includes Config_Lite but the include path may not be set up for plugins.
**How to avoid:** Use the full path: `require_once LBHOMEDIR . '/libs/phplib/Config/Lite.php'` or verify the include path. Have a fallback plan using `parse_ini_file()` + manual write if Config_Lite is unavailable.
**Warning signs:** Fatal error on page load about missing class file.

## Code Examples

### Complete Form Field for jQuery Mobile
```html
<!-- Source: jQuery Mobile 1.4.x docs -->
<div data-role="fieldcontain">
  <label for="mqtt_host">MQTT Host:</label>
  <input type="text" name="mqtt_host" id="mqtt_host"
         value="<?php echo htmlspecialchars($mqtt_host); ?>"
         required placeholder="localhost">
</div>

<div data-role="fieldcontain">
  <label for="mqtt_port">MQTT Port:</label>
  <input type="number" name="mqtt_port" id="mqtt_port"
         value="<?php echo htmlspecialchars($mqtt_port); ?>"
         required min="1" max="65535" pattern="[0-9]+">
</div>

<!-- Flip switch for boolean -->
<div data-role="fieldcontain">
  <label for="email_enabled">Enable Email:</label>
  <select name="email_enabled" id="email_enabled" data-role="slider">
    <option value="0" <?php echo !$email_enabled ? 'selected' : ''; ?>>Off</option>
    <option value="1" <?php echo $email_enabled ? 'selected' : ''; ?>>On</option>
  </select>
</div>
```

### SMTP Toggle Show/Hide (Vanilla JS)
```javascript
// Source: Custom -- inline script for SMTP field visibility
document.getElementById('email_enabled').addEventListener('change', function() {
    var smtpFields = document.getElementById('smtp-fields');
    smtpFields.style.display = (this.value === '1') ? 'block' : 'none';
});
```

### Password Field with Eye Toggle
```html
<div data-role="fieldcontain" style="position:relative;">
  <label for="mqtt_password">MQTT Password:</label>
  <input type="password" name="mqtt_password" id="mqtt_password"
         value="<?php echo htmlspecialchars($mqtt_pass); ?>">
  <a href="#" onclick="togglePassword('mqtt_password'); return false;"
     style="position:absolute;right:10px;top:35px;">
    <span id="mqtt_password_icon">Show</span>
  </a>
</div>

<script>
function togglePassword(fieldId) {
    var field = document.getElementById(fieldId);
    var icon = document.getElementById(fieldId + '_icon');
    if (field.type === 'password') {
        field.type = 'text';
        icon.textContent = 'Hide';
    } else {
        field.type = 'password';
        icon.textContent = 'Show';
    }
}
</script>
```

### Human-Readable Age Formatting (PHP)
```php
<?php
function formatAge($seconds) {
    if ($seconds < 60) return 'just now';
    if ($seconds < 3600) return floor($seconds / 60) . 'm ago';
    if ($seconds < 86400) return floor($seconds / 3600) . 'h ago';
    return floor($seconds / 86400) . 'd ago';
}
```

### Vanilla JS Table Sorting
```javascript
// Source: Custom -- minimal table sort for device status
function sortTable(table, col, type) {
    var tbody = table.querySelector('tbody');
    var rows = Array.from(tbody.querySelectorAll('tr'));
    var asc = table.dataset.sortCol == col ? !JSON.parse(table.dataset.sortAsc || 'true') : true;

    rows.sort(function(a, b) {
        var aVal = a.cells[col].dataset.sortValue || a.cells[col].textContent.trim();
        var bVal = b.cells[col].dataset.sortValue || b.cells[col].textContent.trim();
        if (type === 'num') return asc ? aVal - bVal : bVal - aVal;
        return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

    rows.forEach(function(row) { tbody.appendChild(row); });
    table.dataset.sortCol = col;
    table.dataset.sortAsc = asc;
}
```

### Device Search Filter (Vanilla JS)
```javascript
// Source: Custom -- filter checkbox list by device name
document.getElementById('device-search').addEventListener('input', function() {
    var filter = this.value.toLowerCase();
    var items = document.querySelectorAll('.device-item');
    items.forEach(function(item) {
        var name = item.dataset.name.toLowerCase();
        item.style.display = name.indexOf(filter) >= 0 ? '' : 'none';
    });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PHP 5.6 + manual INI | PHP 7.4 + Config_Lite | LB 2.x to 3.x | Can use typed params, null coalescing, modern array syntax |
| Custom header HTML | LBWeb::lbheader() SDK | LB 1.x to 2.x | Standardized admin UI; jQuery Mobile auto-included |
| Perl-only plugins | PHP SDK at 99.9% parity | LB 2.x | PHP is fully supported for plugin development |
| PHP 7.4 default | PHP 8.x planned | LB 4.0 (future) | Write PHP 7.4 compatible code now; avoid 8.x-only features |

**Deprecated/outdated:**
- Loxberry SDK V1 patterns (direct HTML includes instead of LBWeb class methods)
- PHP 5.6 syntax -- LB 3.x requires PHP 7.4 minimum

## Open Questions

1. **Config_Lite Include Path**
   - What we know: Config_Lite is bundled in Loxberry core at `/opt/loxberry/libs/phplib/`
   - What's unclear: Whether the PHP include path for plugins automatically includes this directory
   - Recommendation: Use full path `LBHOMEDIR . '/libs/phplib/Config/Lite.php'`; test on live system. If unavailable, fall back to `parse_ini_file()` + manual write function.

2. **EXCLUSIONS.devices INI Comment Handling**
   - What we know: User wants `0x00158d0001a2b3c4 # Kitchen motion sensor` format. Node.js `ini@5.x` treats `#` as comment start.
   - What's unclear: Whether ini@5.x strips inline comments from values or only from standalone lines
   - Recommendation: Store ONLY IEEE addresses in the INI value (comma-separated). Display friendly names from state.json. The comment annotation idea will break the Node.js parser. If the user insists on comments, they must be on separate lines above the value, which is not how comma-separated values work.

3. **Test MQTT Connection Implementation**
   - What we know: PHP needs to test MQTT connectivity. A pure PHP MQTT client would be complex.
   - What's unclear: Best approach -- PHP MQTT library, or delegate to a Node.js helper script
   - Recommendation: Create a small Node.js helper script (`bin/test-mqtt.js`) that attempts connection and exits with status code. PHP calls it via `exec()`. Reuses the existing `mqtt` npm dependency. Simpler than adding a PHP MQTT library.

4. **Send Test Email Implementation**
   - What we know: The Node.js `notify.js` module already has email sending via Nodemailer.
   - What's unclear: Whether to create a separate test email script or reuse the notification module
   - Recommendation: Create `bin/test-email.js` that accepts SMTP settings as arguments or reads from the config file and sends a test message. Reuses Nodemailer dependency.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.x (Node.js tests only) |
| Config file | `jest.config.js` |
| Quick run command | `npx jest --testPathPattern=<test_file> -x` |
| Full suite command | `npx jest` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONF-01 | MQTT settings form reads/writes INI correctly | manual + integration | Manual browser test | N/A (PHP) |
| CONF-02 | Threshold settings form reads/writes INI correctly | manual + integration | Manual browser test | N/A (PHP) |
| CONF-03 | Notification settings form reads/writes INI correctly | manual + integration | Manual browser test | N/A (PHP) |
| CONF-04 | Exclusion list reads state.json, writes INI comma-separated devices | manual + unit | Manual browser test + `npx jest --testPathPattern=config -x` | tests/config.test.js (partial -- tests INI reading) |
| CONF-05 | Cron interval setting reads/writes INI correctly | manual + integration | Manual browser test | N/A (PHP) |
| CONF-06 | Device status table reads state.json and displays formatted data | manual | Manual browser test | N/A (PHP) |

**Note:** This phase is primarily PHP/HTML which is not testable via the existing Jest infrastructure. Validation will be mostly manual browser testing on a Loxberry instance. However, we can add Node.js integration tests to verify that INI files written by PHP (simulated format) are correctly parsed by `config.js`.

### Sampling Rate
- **Per task commit:** Manual browser verification of the affected tab/form
- **Per wave merge:** Full manual walkthrough of all three tabs + save/reload cycle
- **Phase gate:** Complete INI round-trip test (PHP writes, Node.js reads, values match)

### Wave 0 Gaps
- [ ] `tests/ini-roundtrip.test.js` -- Verify that an INI file in the exact format PHP will produce is correctly parsed by config.js
- [ ] Manual test checklist document for browser-based validation of all CONF-* requirements

## Sources

### Primary (HIGH confidence)
- [Loxberry Wiki - PHP functions for web design](https://wiki.loxberry.de/entwickler/php_develop_plugins_with_php/php_loxberry_sdk_documentation/php_module_loxberry_webphp/php_functions_to_create_your_webpage_with_loxberry_design) - lbheader/lbfooter, navbar pattern
- [Loxberry Wiki - Plugin basics](https://wiki.loxberry.de/en/entwickler/grundlagen_zur_erstellung_eines_plugins) - Directory structure, path conventions
- [Loxberry GitHub - loxberry_system.php](https://github.com/mschlenstedt/Loxberry/blob/master/libs/phplib/loxberry_system.php) - Global variables, LBSystem class
- [Loxberry GitHub - loxberry_web.php](https://raw.githubusercontent.com/mschlenstedt/Loxberry/master/libs/phplib/loxberry_web.php) - jQuery Mobile framework, header/footer implementation
- [jQuery Mobile API - Tabs Widget](https://api.jquerymobile.com/tabs/) - data-role="tabs" markup pattern
- Project source: `bin/lib/config.js` - INI schema (DEFAULTS, NUMERIC_FIELDS, BOOLEAN_FIELDS)
- Project source: `bin/lib/state-store.js` - State JSON format
- Project source: `bin/watchdog.js` - exec() target, 30s timeout, path resolution

### Secondary (MEDIUM confidence)
- [Loxberry Wiki - Writing ini files in PHP](https://loxwiki.atlassian.net/wiki/spaces/LOXBERRY/pages/1205241721/Writing+ini+files+in+PHP) - Config_Lite usage (page did not load fully, info from search snippets)
- [Loxberry Wiki - loxberry_system.php module](https://wiki.loxberry.de/entwickler/php_develop_plugins_with_php/php_loxberry_sdk_documentation/php_module_loxberry_systemphp/start) - Global variable documentation
- [Loxberry Wiki - PHP version](https://wiki.loxberry.de/installation_von_loxberry/die_versionen_des_loxberry/whats_new_in_v301) - PHP 7.4 on LB 3.x, PHP 8.x planned for LB 4.0
- [Config_Lite PEAR library](https://github.com/pear/Config_Lite) - INI read/write with sections

### Tertiary (LOW confidence)
- jQuery Mobile version (assumed 1.4.x based on LB 3.x source; exact version not confirmed)
- Config_Lite include path (assumed `/opt/loxberry/libs/phplib/Config/Lite.php`; needs live verification)

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - Loxberry SDK documented but wiki pages partially broken; confirmed via GitHub source
- Architecture: HIGH - jQuery Mobile tabs pattern well documented; Loxberry page structure clear from multiple sources
- Pitfalls: MEDIUM - INI format compatibility is the highest risk; needs live testing
- Code examples: MEDIUM - Patterns assembled from official docs and source code; not tested on live system

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (Loxberry SDK is stable; jQuery Mobile is frozen/maintenance-only)
