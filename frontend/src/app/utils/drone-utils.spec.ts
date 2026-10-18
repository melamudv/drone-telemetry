import { cleanFilters, isLowBattery, markerClasses, statusColor } from './drone-utils';
import { formatNumber, formatTimestamp, israelToUtcIso } from './format';

describe('drone-utils', () => {
  it('flags low battery strictly below 20%', () => {
    expect(isLowBattery({ battery_percent: 19 })).toBeTrue();
    expect(isLowBattery({ battery_percent: 20 })).toBeFalse();
  });

  it('adds lost + low-battery marker classes', () => {
    const classes = markerClasses({ status: 'lost_signal', battery_percent: 15 });
    expect(classes).toContain('lost');
    expect(classes).toContain('low-battery');
    expect(classes).toContain('status-lost_signal');
  });

  it('does not add warning classes for healthy drones', () => {
    const classes = markerClasses({ status: 'active', battery_percent: 80 });
    expect(classes).not.toContain('lost');
    expect(classes).not.toContain('low-battery');
  });

  it('maps statuses to colors with a fallback', () => {
    expect(statusColor('active')).not.toEqual(statusColor('lost_signal'));
    expect(statusColor('unknown')).toEqual(statusColor('landed'));
  });

  it('cleanFilters drops empty values and keeps meaningful ones', () => {
    expect(
      cleanFilters({
        drone_type: [],
        status: ['active'],
        operator_id: 'OP-1',
        min_battery: 0,
        from: '',
        latest_only: false,
      }),
    ).toEqual({ status: ['active'], operator_id: 'OP-1', min_battery: '0' });
    expect(cleanFilters({ min_battery: null, latest_only: true })).toEqual({ latest_only: 'true' });
    expect(cleanFilters({ drone_type: ['VTOL', 'Quadcopter'] })).toEqual({ drone_type: ['VTOL', 'Quadcopter'] });
  });
});

describe('formatNumber', () => {
  it('keeps at most 3 decimals and trims trailing zeros', () => {
    expect(formatNumber(12.34567)).toBe('12.346');
    expect(formatNumber(45)).toBe('45');
    expect(formatNumber(45.1)).toBe('45.1');
    expect(formatNumber(0.0004)).toBe('0');
  });
});

describe('formatTimestamp', () => {
  it('formats ISO strings in Israel time', () => {
    expect(formatTimestamp('2026-06-28T10:30:00Z')).toBe('28/06/2026 13:30');
    expect(formatTimestamp('2026-01-15T10:30:00Z')).toBe('15/01/2026 12:30');
  });

  it('treats zone-less values as UTC', () => {
    expect(formatTimestamp('2026-06-28T10:30:00')).toBe('28/06/2026 13:30');
  });

  it('converts Israel wall-clock time to UTC, including daylight saving', () => {
    expect(israelToUtcIso('2026-06-28T13:30:00')).toBe('2026-06-28T10:30:00Z');
    expect(israelToUtcIso('2026-01-15T12:30:00')).toBe('2026-01-15T10:30:00Z');
  });

  it('handles empty and garbage input', () => {
    expect(formatTimestamp(null)).toBe('—');
    expect(formatTimestamp('nope')).toBe('nope');
  });
});
