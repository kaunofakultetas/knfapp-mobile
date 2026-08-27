// -----------------------------------------------------------
//  [*] Tests — hooks/useScheduleConflicts
//
//  Overlap math with exclusive endpoints, restricted to the
//  same group — parallel groups legitimately share slots.
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

  it('returns nothing when disabled', async () => {
    const { result } = await renderHook(() =>
      useScheduleConflicts([lesson('a', '09:00', '10:30'), lesson('b', '10:00', '11:30')], false),
    );
    expect(result.current.size).toBe(0);
  });
});
