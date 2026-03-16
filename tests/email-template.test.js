'use strict';

const {
  buildEmailBody,
  buildSubject,
  buildLoxberryMessage,
  buildHeartbeatBody,
} = require('../bin/lib/email-template');

// Fixture transitions matching evaluator shape
function makeTransition(overrides = {}) {
  return {
    type: overrides.type || 'offline',
    transition: overrides.transition || 'alert',
    ieee: overrides.ieee || '0x00158d0001234567',
    friendly_name: overrides.friendly_name || 'Living Room Sensor',
    detail: overrides.detail || 'not seen for 25.3 hours',
    timestamp: overrides.timestamp || '2026-03-15T12:00:00.000Z',
  };
}

describe('buildEmailBody', () => {
  test('returns html and text fields', () => {
    const transitions = [makeTransition()];
    const result = buildEmailBody(transitions);
    expect(result).toHaveProperty('html');
    expect(result).toHaveProperty('text');
  });

  test('includes alerts section with color-coded rows', () => {
    const transitions = [
      makeTransition({ type: 'offline', transition: 'alert', friendly_name: 'Door Sensor', detail: 'not seen for 26 hours' }),
      makeTransition({ type: 'battery', transition: 'alert', friendly_name: 'Temp Sensor', detail: 'battery at 15%' }),
    ];
    const { html } = buildEmailBody(transitions);

    // Red for offline
    expect(html).toContain('#e74c3c');
    expect(html).toContain('Door Sensor');
    expect(html).toContain('Offline');

    // Amber for battery
    expect(html).toContain('#f39c12');
    expect(html).toContain('Temp Sensor');
    expect(html).toContain('Low Battery');
  });

  test('includes recovery section with green color', () => {
    const transitions = [
      makeTransition({ transition: 'recovery', friendly_name: 'Motion Sensor', detail: 'back online' }),
    ];
    const { html } = buildEmailBody(transitions);

    expect(html).toContain('#27ae60');
    expect(html).toContain('Motion Sensor');
    expect(html).toContain('back online');
  });

  test('plain text has NEW ALERTS and RECOVERIES headers', () => {
    const transitions = [
      makeTransition({ transition: 'alert', friendly_name: 'Sensor A', detail: 'offline 25h' }),
      makeTransition({ transition: 'recovery', friendly_name: 'Sensor B', detail: 'recovered' }),
    ];
    const { text } = buildEmailBody(transitions);

    expect(text).toContain('NEW ALERTS');
    expect(text).toContain('Sensor A');
    expect(text).toContain('RECOVERIES');
    expect(text).toContain('Sensor B');
  });

  test('omits alerts section when no alerts', () => {
    const transitions = [
      makeTransition({ transition: 'recovery' }),
    ];
    const { html, text } = buildEmailBody(transitions);

    expect(html).not.toContain('New Alerts');
    expect(text).not.toContain('NEW ALERTS');
    expect(html).toContain('Recoveries');
  });

  test('omits recoveries section when no recoveries', () => {
    const transitions = [
      makeTransition({ transition: 'alert' }),
    ];
    const { html, text } = buildEmailBody(transitions);

    expect(html).toContain('New Alerts');
    expect(html).not.toContain('Recoveries');
    expect(text).not.toContain('RECOVERIES');
  });

  test('HTML-escapes device names and details', () => {
    const transitions = [
      makeTransition({
        transition: 'alert',
        friendly_name: '<script>alert("xss")</script>',
        detail: 'detail with "quotes" & <angles>',
      }),
    ];
    const { html } = buildEmailBody(transitions);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;');
    expect(html).toContain('&lt;angles&gt;');
  });
});

describe('buildSubject', () => {
  test('returns count-based subject with alerts and recoveries', () => {
    const transitions = [
      makeTransition({ transition: 'alert' }),
      makeTransition({ transition: 'alert' }),
      makeTransition({ transition: 'recovery' }),
    ];
    expect(buildSubject(transitions)).toBe('Zigbee Watchdog: 2 alerts, 1 recovery');
  });

  test('singular alert (no trailing s)', () => {
    const transitions = [
      makeTransition({ transition: 'alert' }),
    ];
    expect(buildSubject(transitions)).toBe('Zigbee Watchdog: 1 alert');
  });

  test('only recoveries', () => {
    const transitions = [
      makeTransition({ transition: 'recovery' }),
      makeTransition({ transition: 'recovery' }),
    ];
    expect(buildSubject(transitions)).toBe('Zigbee Watchdog: 2 recovery');
  });

  test('single recovery', () => {
    const transitions = [
      makeTransition({ transition: 'recovery' }),
    ];
    expect(buildSubject(transitions)).toBe('Zigbee Watchdog: 1 recovery');
  });
});

describe('buildLoxberryMessage', () => {
  test('returns plain text with ALERTS and RECOVERIES sections', () => {
    const transitions = [
      makeTransition({ type: 'offline', transition: 'alert', friendly_name: 'Door Sensor', detail: 'not seen for 26h' }),
      makeTransition({ type: 'battery', transition: 'alert', friendly_name: 'Temp Sensor', detail: 'battery at 15%' }),
      makeTransition({ transition: 'recovery', friendly_name: 'Motion Sensor', detail: 'back online' }),
    ];
    const msg = buildLoxberryMessage(transitions);

    expect(msg).toContain('ALERTS:');
    expect(msg).toContain('Door Sensor: OFFLINE - not seen for 26h');
    expect(msg).toContain('Temp Sensor: LOW BATTERY - battery at 15%');
    expect(msg).toContain('RECOVERIES:');
    expect(msg).toContain('Motion Sensor: back online');
  });

  test('omits RECOVERIES when none', () => {
    const transitions = [
      makeTransition({ transition: 'alert' }),
    ];
    const msg = buildLoxberryMessage(transitions);

    expect(msg).toContain('ALERTS:');
    expect(msg).not.toContain('RECOVERIES:');
  });

  test('omits ALERTS when none', () => {
    const transitions = [
      makeTransition({ transition: 'recovery', friendly_name: 'Sensor A', detail: 'recovered' }),
    ];
    const msg = buildLoxberryMessage(transitions);

    expect(msg).not.toContain('ALERTS:');
    expect(msg).toContain('RECOVERIES:');
    expect(msg).toContain('Sensor A: recovered');
  });
});

describe('buildHeartbeatBody', () => {
  test('returns html, text, and subject', () => {
    const summary = { tracked: 52, alerts: 0, excluded: 3 };
    const result = buildHeartbeatBody(summary);

    expect(result).toHaveProperty('html');
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('subject');
  });

  test('subject is "Zigbee Watchdog: All clear"', () => {
    const summary = { tracked: 52, alerts: 0, excluded: 3 };
    const result = buildHeartbeatBody(summary);

    expect(result.subject).toBe('Zigbee Watchdog: All clear');
  });

  test('includes device count summary in text', () => {
    const summary = { tracked: 52, alerts: 0, excluded: 3 };
    const result = buildHeartbeatBody(summary);

    expect(result.text).toContain('52 devices tracked');
    expect(result.text).toContain('0 alerts');
    expect(result.text).toContain('3 excluded');
  });

  test('includes device count summary in html', () => {
    const summary = { tracked: 10, alerts: 0, excluded: 1 };
    const result = buildHeartbeatBody(summary);

    expect(result.html).toContain('10 devices tracked');
    expect(result.html).toContain('0 alerts');
    expect(result.html).toContain('1 excluded');
  });
});
