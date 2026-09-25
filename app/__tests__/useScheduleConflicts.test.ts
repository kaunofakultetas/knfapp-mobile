// -----------------------------------------------------------
//  [*] Tests — hooks/useScheduleConflicts
//
//  Overlap math with exclusive endpoints, restricted to the
//  same group — parallel groups legitimately share slots, and
//  so do the two subgroups of one group (the live ISKS-1
//  Friday: subgroup 1 in one subject, subgroup 2 in another,
//  one slot, painted red every week before the rule).
// -----------------------------------------------------------

import { renderHook } from '@testing-library/react-native';

import { useScheduleConflicts } from '@/hooks/useScheduleConflicts';
import type { ScheduleLesson } from '@/services/api';


const lesson = (id: string, timeStart: string, timeEnd: string, group = 'G1'): ScheduleLesson => ({
  id, title: id, teacher: 't', room: 'r', timeStart, timeEnd, dayOfWeek: 0, group, semester: 'S',
});


describe('useScheduleConflicts', () => {
  it('flags overlapping lessons of the same group', async () => {
    const { result } = await renderHook(() =>
      useScheduleConflicts([lesson('a', '09:00', '10:30'), lesson('b', '10:00', '11:30')]),
    );
    expect(result.current).toEqual(new Set(['a', 'b']));
  });

  it('does not flag back-to-back lessons', async () => {
    const { result } = await renderHook(() =>
      useScheduleConflicts([lesson('a', '09:00', '10:00'), lesson('b', '10:00', '11:00')]),
    );
    expect(result.current.size).toBe(0);
  });

  it('ignores overlaps across different groups', async () => {
    const { result } = await renderHook(() =>
      useScheduleConflicts([lesson('a', '09:00', '10:30'), lesson('b', '10:00', '11:30', 'G2')]),
    );
    expect(result.current.size).toBe(0);
  });

  it('two DISJOINT subgroups of one group never clash', async () => {
    const { result } = await renderHook(() =>
      useScheduleConflicts([
        { ...lesson('a', '09:45', '11:15'), subgroups: ['1'] },
        { ...lesson('b', '09:45', '11:15'), subgroups: ['2'] },
      ]),
    );
    expect(result.current.size).toBe(0);
  });

  it('a whole-group lecture clashes with any subgroup; a shared subgroup clashes', async () => {
    const whole = await renderHook(() =>
      useScheduleConflicts([lesson('lecture', '15:30', '17:30'), { ...lesson('practice', '17:15', '18:45'), subgroups: ['2'] }]),
    );
    expect(whole.result.current).toEqual(new Set(['lecture', 'practice']));
    const shared = await renderHook(() =>
      useScheduleConflicts([
        { ...lesson('a', '09:00', '10:30'), subgroups: ['1', '2'] },
        { ...lesson('b', '10:00', '11:30'), subgroups: ['2'] },
      ]),
    );
    expect(shared.result.current).toEqual(new Set(['a', 'b']));
  });

  it('returns nothing when disabled', async () => {
    const { result } = await renderHook(() =>
      useScheduleConflicts([lesson('a', '09:00', '10:30'), lesson('b', '10:00', '11:30')], false),
    );
    expect(result.current.size).toBe(0);
  });
});
