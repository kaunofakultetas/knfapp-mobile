// -----------------------------------------------------------
//  [*] Tests — nowState: where the minute hand falls
//
//  Pure over an integer minute; the ticking lives in the UI.
// -----------------------------------------------------------

import { nowState } from '../now';
import type { TimetableEntry } from '../types';

const L = (id: string, startMin: number, endMin: number, extra: Partial<TimetableEntry> = {}): TimetableEntry => ({
  id, title: id, day: 0, startMin, endMin, ...extra,
});

const day = [L('a', 540, 630), L('b', 660, 750), L('c', 780, 870)];

describe('nowState', () => {
  it('inside a lesson: current set, next is the following one', () => {
    const state = nowState(day, 600);
    expect(state.current?.id).toBe('a');
    expect(state.next?.id).toBe('b');
    expect(state.minutesToNext).toBe(60);
  });

  it('start is inclusive, end exclusive', () => {
    expect(nowState(day, 540).current?.id).toBe('a');
    expect(nowState(day, 630).current).toBeUndefined();
  });

  it('in a gap: only next, with the countdown', () => {
    const state = nowState(day, 640);
    expect(state.current).toBeUndefined();
    expect(state.next?.id).toBe('b');
    expect(state.minutesToNext).toBe(20);
  });

  it('after the last lesson: nothing', () => {
    expect(nowState(day, 900)).toEqual({ current: undefined, next: undefined, minutesToNext: undefined });
  });

  it('empty day and blocks are calm', () => {
    expect(nowState([], 600).current).toBeUndefined();
    const state = nowState([L('bg', 480, 1200, { isBlock: true }), ...day], 600);
    expect(state.current?.id).toBe('a');
  });

  it('unsorted input still answers correctly', () => {
    const state = nowState([day[2], day[0], day[1]], 640);
    expect(state.next?.id).toBe('b');
  });
});

describe('nowState with overlapping lessons', () => {
  const overlap = [L('a', 540, 630), L('b', 600, 700)];

  it('an already-started overlap is NEXT with a zero countdown — it never vanishes mid-overlap', () => {
    const during = nowState(overlap, 610);
    expect(during.current?.id).toBe('a');
    expect(during.next?.id).toBe('b');
    expect(during.minutesToNext).toBe(0);
  });

  it('before the overlap starts the countdown is honest; after the first ends the second takes over', () => {
    expect(nowState(overlap, 590).minutesToNext).toBe(10);
    expect(nowState(overlap, 640).current?.id).toBe('b');
    expect(nowState(overlap, 640).next).toBeUndefined();
  });
});
