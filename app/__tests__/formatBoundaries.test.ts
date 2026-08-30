// -----------------------------------------------------------
//  [*] Tests — formatRelative / formatRelativeAgo boundaries
//
//  The cutoffs the conversation list renders by: sub-minute is
//  "just now", the 60-minute and 24-hour rollovers land on the
//  right unit, future instants (clock skew) clamp instead of
//  going negative, and non-finite inputs degrade to '' — a
//  blank beats "NaN" in a list row.
// -----------------------------------------------------------

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    language: 'lt',
    t: (key: string, opts?: { count?: number; time?: string }) => {
      if (opts?.time !== undefined) return `${key}[${opts.time}]`;
      return opts?.count !== undefined ? `${key}:${opts.count}` : key;
    },
  },
}));

import { formatRelative, formatRelativeAgo, formatTime } from '@/services/format';


const NOW = Date.parse('2026-08-29T12:00:00Z');
const secondsAgo = (s: number) => NOW - s * 1000;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});
afterEach(() => {
  jest.useRealTimers();
});


describe('formatRelative boundaries', () => {
  it('says just-now under a minute, minutes from 60 s', () => {
    expect(formatRelative(secondsAgo(0))).toBe('network.justNow');
    expect(formatRelative(secondsAgo(59))).toBe('network.justNow');
    expect(formatRelative(secondsAgo(60))).toBe('network.minutesShort:1');
    expect(formatRelative(secondsAgo(119))).toBe('network.minutesShort:1');
  });

  it('rolls minutes into hours at exactly 60', () => {
    expect(formatRelative(secondsAgo(59 * 60))).toBe('network.minutesShort:59');
    expect(formatRelative(secondsAgo(60 * 60))).toBe('network.hoursShort:1');
    expect(formatRelative(secondsAgo(23 * 3600 + 3599))).toBe('network.hoursShort:23');
  });

  it('rolls hours into days at exactly 24', () => {
    expect(formatRelative(secondsAgo(24 * 3600))).toBe('network.daysShort:1');
    expect(formatRelative(secondsAgo(30 * 24 * 3600))).toBe('network.daysShort:30');
  });

  it('clamps future instants to just-now instead of going negative', () => {
    expect(formatRelative(NOW + 5 * 60_000)).toBe('network.justNow');
  });

  it('degrades non-finite input to an empty string', () => {
    expect(formatRelative(Number.NaN)).toBe('');
    expect(formatRelative(Number.POSITIVE_INFINITY)).toBe('');
  });
});


describe('formatRelativeAgo', () => {
  it('keeps the sub-minute phrase unwrapped', () => {
    expect(formatRelativeAgo(secondsAgo(30))).toBe('network.justNow');
  });

  it('wraps everything older in the ago phrase', () => {
    expect(formatRelativeAgo(secondsAgo(5 * 60))).toBe('network.ago[network.minutesShort:5]');
  });

  it('degrades non-finite input to an empty string', () => {
    expect(formatRelativeAgo(Number.NaN)).toBe('');
  });
});


describe('formatTime', () => {
  it('renders HH:MM for a valid stamp', () => {
    expect(formatTime('2026-08-29T10:05:00Z')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('returns garbage input untouched instead of Invalid Date', () => {
    expect(formatTime('nonsense')).toBe('nonsense');
  });
});
