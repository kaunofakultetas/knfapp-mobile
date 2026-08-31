// -----------------------------------------------------------
//  [*] Tests — socialuikit RelativeTime
//
//  The stamp's promises under a frozen, steppable clock: every
//  past band renders its string, the absolute date takes over
//  at a week (year only across years), the countdown bands
//  answer hasFuture, a future stamp without it clamps to now,
//  crossing a unit boundary re-renders on its own, no wake
//  comes sooner than 10 s, and unmount leaves no timer behind.
//  jest's fake clock drives both Date.now and the timers, so
//  env.now (the provider default, reading new Date()) and the
//  scheduled wake can never drift apart.
// -----------------------------------------------------------

import { act, render } from '@testing-library/react-native';

import { SocialUiKitProvider } from '../../provider';
import RelativeTime from '../RelativeTime';


const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// A Sunday noon, mid-year, so week and year edges are explicit
const BASE = Date.UTC(2026, 7, 30, 12, 0, 0);

const iso = (offsetMs: number): string => new Date(BASE + offsetMs).toISOString();

const mount = (stamp: string, opts?: { hasFuture?: boolean; locale?: 'lt' | 'en' }) =>
  render(
    <SocialUiKitProvider locale={opts?.locale ?? 'lt'} env={{ now: () => new Date() }}>
      <RelativeTime iso={stamp} hasFuture={opts?.hasFuture} />
    </SocialUiKitProvider>,
  );

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};


beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(BASE);
});

afterEach(() => {
  jest.useRealTimers();
});




describe('RelativeTime', () => {

  it('reads anything under a minute as now', async () => {
    const fresh = await mount(iso(-5 * SECOND));
    expect(fresh.getByText('Ką tik')).toBeTruthy();

    const almost = await mount(iso(-59 * SECOND));
    expect(almost.getByText('Ką tik')).toBeTruthy();
  });


  it('walks the minute, hour and day bands', async () => {
    expect((await mount(iso(-MINUTE))).getByText('1 min.')).toBeTruthy();
    expect((await mount(iso(-59 * MINUTE))).getByText('59 min.')).toBeTruthy();
    expect((await mount(iso(-90 * MINUTE))).getByText('1 val.')).toBeTruthy();
    expect((await mount(iso(-23 * HOUR))).getByText('23 val.')).toBeTruthy();
    expect((await mount(iso(-24 * HOUR))).getByText('1 d.')).toBeTruthy();
    expect((await mount(iso(-6 * DAY - 23 * HOUR))).getByText('6 d.')).toBeTruthy();
  });


  it('switches to the absolute date at a week, adding the year only across years', async () => {
    const sameYear = new Date(BASE - 30 * DAY);
    const r = await mount(sameYear.toISOString());
    const bare = sameYear.toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' });
    expect(r.getByText(bare)).toBeTruthy();
    expect(r.queryByText(`${bare}, 2026`)).toBeNull();

    const lastYear = new Date(Date.UTC(2025, 11, 31, 12, 0, 0));
    const r2 = await mount(lastYear.toISOString());
    const dated = lastYear.toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' });
    expect(r2.getByText(`${dated}, 2025`)).toBeTruthy();
  });


  it('formats English dates when the English catalog is live', async () => {
    const r = await mount(iso(-5 * MINUTE), { locale: 'en' });
    expect(r.getByText('5m')).toBeTruthy();

    const lastYear = new Date(Date.UTC(2025, 11, 31, 12, 0, 0));
    const r2 = await mount(lastYear.toISOString(), { locale: 'en' });
    const dated = lastYear.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
    expect(r2.getByText(`${dated}, 2025`)).toBeTruthy();
  });


  it('carries the full datetime into the accessibility label', async () => {
    const stamp = iso(-5 * MINUTE);
    const r = await mount(stamp);
    const expected = `Paskelbta ${new Date(stamp).toLocaleString('lt-LT')}`;
    expect(r.getByText('5 min.').props.accessibilityLabel).toBe(expected);

    const r2 = await mount(stamp, { locale: 'en' });
    const expectedEn = `Posted ${new Date(stamp).toLocaleString('en-GB')}`;
    expect(r2.getByText('5m').props.accessibilityLabel).toBe(expectedEn);
  });


  it('ticks across the 59 min boundary into hours on its own', async () => {
    const r = await mount(iso(-59 * MINUTE));
    expect(r.getByText('59 min.')).toBeTruthy();

    await advance(MINUTE);
    expect(r.getByText('1 val.')).toBeTruthy();
  });


  it('reschedules after every fire, even with identical waits', async () => {
    const r = await mount(iso(0));
    expect(r.getByText('Ką tik')).toBeTruthy();

    // Two consecutive one-minute waits: a timer keyed on the
    // wait alone would die after the first fire
    await advance(MINUTE);
    expect(r.getByText('1 min.')).toBeTruthy();
    await advance(MINUTE);
    expect(r.getByText('2 min.')).toBeTruthy();
  });


  it('never wakes sooner than 10 s', async () => {
    // 5 s from the natural minute edge; the floor pushes the
    // wake to 10 s, past the edge
    const r = await mount(iso(-(59 * MINUTE + 55 * SECOND)));
    expect(r.getByText('59 min.')).toBeTruthy();

    await advance(9_999);
    expect(r.getByText('59 min.')).toBeTruthy();
    await advance(1);
    expect(r.getByText('1 val.')).toBeTruthy();
  });


  it('clamps a skewed future stamp to now and recovers as time catches up', async () => {
    const r = await mount(iso(5 * MINUTE));
    expect(r.getByText('Ką tik')).toBeTruthy();

    // Once real time passes the stamp it ages normally
    await advance(6 * MINUTE);
    expect(r.getByText('1 min.')).toBeTruthy();
  });


  it('counts a poll down through days, hours and minutes', async () => {
    expect((await mount(iso(5 * DAY), { hasFuture: true })).getByText('Liko 5 dienos')).toBeTruthy();
    expect((await mount(iso(2 * DAY), { hasFuture: true })).getByText('Liko 2 dienos')).toBeTruthy();
    // Under two days the hour count reads better than "1 day"
    expect((await mount(iso(47 * HOUR), { hasFuture: true })).getByText('Liko 47 valandos')).toBeTruthy();
    expect((await mount(iso(90 * MINUTE), { hasFuture: true })).getByText('Liko 1 valanda')).toBeTruthy();
    expect((await mount(iso(5 * MINUTE), { hasFuture: true })).getByText('Liko 5 minutės')).toBeTruthy();
    expect((await mount(iso(30 * SECOND), { hasFuture: true })).getByText('Netrukus baigsis')).toBeTruthy();
  });


  it('descends the countdown as the deadline nears', async () => {
    const r = await mount(iso(3 * MINUTE), { hasFuture: true });
    expect(r.getByText('Liko 3 minutės')).toBeTruthy();

    await advance(170 * SECOND);
    expect(r.getByText('Netrukus baigsis')).toBeTruthy();


    // Past the deadline the future bands are done; the stamp
    // reads as a fresh past moment
    await advance(MINUTE);
    expect(r.getByText('Ką tik')).toBeTruthy();
  });


  it('clears its pending timer on unmount', async () => {
    // The renderer keeps its own timers, so the global count
    // proves nothing — follow the stamp's one handle instead.
    // 30 s old → the wake is the distinctive 30 s to the edge
    const setSpy = jest.spyOn(global, 'setTimeout');
    const clearSpy = jest.spyOn(global, 'clearTimeout');
    const r = await mount(iso(-30 * SECOND));

    const call = setSpy.mock.calls.findIndex((args) => args[1] === 30 * SECOND);
    expect(call).toBeGreaterThanOrEqual(0);
    const handle = setSpy.mock.results[call].value;


    await r.unmount();
    expect(clearSpy.mock.calls.some((args) => args[0] === handle)).toBe(true);

    // Nothing of ours left to fire: a day of clock proves no
    // orphaned setState against the unmounted tree
    jest.advanceTimersByTime(DAY);
    setSpy.mockRestore();
    clearSpy.mockRestore();
  });

  it('reads a zone-less server stamp as UTC, never as device-local time', async () => {
    // 90 seconds ago, written the way a SQLite column default
    // writes it: naive, space-form
    const naive = new Date(BASE - 90 * SECOND).toISOString().replace('Z', '').replace('T', ' ');
    const r = await mount(naive);
    expect(r.getByText('1 min.')).toBeTruthy();
  });

  it('renders the calm default for an unparseable stamp — never NaN', async () => {
    const r = await mount('not-a-date');
    expect(r.getByText('Ką tik')).toBeTruthy();
    expect(r.queryByText(/NaN/)).toBeNull();
  });

  it('pins the week flip exactly: 7d shows the absolute date, one hour earlier still counts days', async () => {
    const almost = await mount(iso(-(7 * DAY - HOUR)));
    expect(almost.getByText('6 d.')).toBeTruthy();

    const flipped = await mount(iso(-7 * DAY));
    expect(flipped.queryByText('7 d.')).toBeNull();
    expect(flipped.queryByText('6 d.')).toBeNull();
  });
});
