// -----------------------------------------------------------
//  [*] Tests — services/format
//
//  The timezone rule is the load-bearing one: the backend
//  emits zoneless ISO timestamps that ARE UTC, so parsing
//  them as local time would shift every chat time by the
//  device offset.
// -----------------------------------------------------------

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    language: 'en',
    t: (key: string, opts?: { count?: number }) =>
      opts?.count !== undefined ? `${key}:${opts.count}` : key,
  },
}));

import { activeLocale, formatDate, formatDateTime, formatRelative, formatTime, parseIso } from '@/services/format';


describe('format', () => {
  it('maps the app language to a BCP-47 locale', () => {
    expect(activeLocale()).toBe('en-GB');
  });

  it('treats zoneless ISO timestamps as UTC', () => {
    const expected = new Date('2026-08-27T10:05:00Z').toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    expect(formatTime('2026-08-27T10:05:00')).toBe(expected);
    expect(formatTime('2026-08-27T10:05:00.123456')).toBe(expected);
  });

  it('treats SQLite space-separated stamps exactly like the T form', () => {
    // Raw sqlite CURRENT_TIMESTAMP rows ("2026-08-27 10:05:00")
    // reach the same formatters as isoformat() stamps and must
    // land on the same UTC instant
    expect(formatTime('2026-08-27 10:05:00')).toBe(formatTime('2026-08-27T10:05:00Z'));
    expect(formatDate('2026-08-27 10:05:00')).toBe(formatDate('2026-08-27T10:05:00Z'));
    expect(formatDateTime('2026-08-27 10:05:00')).toBe(formatDateTime('2026-08-27T10:05:00Z'));
  });

  it('truncates fractional seconds to milliseconds before parsing', () => {
    // Hermes' Date does not digest six fractional digits — the
    // expected instant is computed independently of the runner's
    // own long-fraction support
    expect(parseIso('2026-08-27T10:05:00.123456')?.getTime()).toBe(
      Date.UTC(2026, 7, 27, 10, 5, 0, 123),
    );
    expect(parseIso('2026-08-27 10:05:00.123456')?.getTime()).toBe(
      Date.UTC(2026, 7, 27, 10, 5, 0, 123),
    );
  });

  it('keeps explicit offsets', () => {
    const expected = new Date('2026-08-27T10:05:00+03:00').toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    expect(formatTime('2026-08-27T10:05:00+03:00')).toBe(expected);
  });

  it('returns the input untouched when it is not a date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
    expect(formatTime('')).toBe('');
  });

  it('formats relative time through i18n keys with counts', () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    expect(formatRelative(now - 10_000)).toBe('network.justNow');
    expect(formatRelative(now - 5 * 60_000)).toBe('network.minutesShort:5');
    expect(formatRelative(now - 3 * 3_600_000)).toBe('network.hoursShort:3');
    expect(formatRelative(now - 2 * 86_400_000)).toBe('network.daysShort:2');
    jest.restoreAllMocks();
  });
});
