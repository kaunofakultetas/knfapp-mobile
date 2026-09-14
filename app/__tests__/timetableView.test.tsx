// -----------------------------------------------------------
//  [*] Tests — TimetableView: the engine-to-kit seam
//
//  The screen hands entries in; this pins that the pipeline
//  places them into the kit's views, that both modes render,
//  that a tap reports the pressed lesson, and that the
//  person-scope wash reaches a double-booked teacher's cells.
// -----------------------------------------------------------

import { fireEvent, render } from '@testing-library/react-native';

import TimetableView from '@/components/schedule/TimetableView';
import type { KnfLesson, TimetableEntry } from '@knf/timetableengine';

const entry = (
  id: string,
  day: number,
  startMin: number,
  endMin: number,
  extra: Partial<TimetableEntry<KnfLesson>> = {},
): TimetableEntry<KnfLesson> =>
  ({
    id,
    title: `Lesson ${id}`,
    day,
    startMin,
    endMin,
    people: ['A. Petraitis'],
    location: ['112'],
    groupKey: 'ISKS-1',
    termKey: '2026-R',
    ...extra,
  }) as TimetableEntry<KnfLesson>;

const ENTRIES = [entry('a', 0, 540, 630), entry('b', 0, 600, 660), entry('c', 2, 720, 810)];

const layOut = async (view: Awaited<ReturnType<typeof render>>, testID: string) =>
  fireEvent(view.getByTestId(testID), 'layout', { nativeEvent: { layout: { width: 394, height: 700 } } });

describe('TimetableView', () => {
  it('week mode places every entry into the grid', async () => {
    const view = await render(
      <TimetableView
        entries={ENTRIES}
        skipped={0}
        scope={{ scope: 'group', groupFilterActive: false }}
        mode="week"
        day={0}
        onChangeDay={jest.fn()}
        onPressLesson={jest.fn()}
      />,
    );
    await layOut(view, 'timetableuikit-week');
    expect(view.getByTestId('timetableuikit-lesson-a')).toBeTruthy();
    expect(view.getByTestId('timetableuikit-lesson-b')).toBeTruthy();
    expect(view.getByTestId('timetableuikit-lesson-c')).toBeTruthy();
  });

  it('a foreign week silences the now line', async () => {
    // A full-day entry on TODAY'S weekday keeps the clock
    // inside the derived window at any hour the suite runs, so
    // the current-week branch is guaranteed its now line
    const todayIdx = (new Date().getDay() + 6) % 7;
    const todays = [entry('t', todayIdx, 0, 1439)];

    const foreign = await render(
      <TimetableView
        entries={todays}
        skipped={0}
        scope={{ scope: 'group', groupFilterActive: false }}
        mode="week"
        day={todayIdx}
        currentWeek={false}
        onChangeDay={jest.fn()}
        onPressLesson={jest.fn()}
      />,
    );
    await layOut(foreign, 'timetableuikit-week');
    expect(foreign.queryByLabelText('Now')).toBeNull();

    const current = await render(
      <TimetableView
        entries={todays}
        skipped={0}
        scope={{ scope: 'group', groupFilterActive: false }}
        mode="week"
        day={todayIdx}
        onChangeDay={jest.fn()}
        onPressLesson={jest.fn()}
      />,
    );
    await layOut(current, 'timetableuikit-week');
    expect(current.getByLabelText('Now')).toBeTruthy();
  });

  it('neighbour weeks turn week mode into the scrolling pager, and a settled swipe pages ±1', async () => {
    const onChangeWeek = jest.fn();
    const view = await render(
      <TimetableView
        entries={ENTRIES}
        skipped={0}
        scope={{ scope: 'group', groupFilterActive: false }}
        mode="week"
        day={0}
        weeks={{ prev: [entry('p', 1, 540, 630)], next: [entry('n', 4, 540, 630)] }}
        onChangeDay={jest.fn()}
        onChangeWeek={onChangeWeek}
        onPressLesson={jest.fn()}
      />,
    );

    // The pager measures itself, then pages take that width —
    // a momentum stop on the right page settles forward
    await fireEvent(view.getByTestId('timetableuikit-snappager-frame'), 'layout', {
      nativeEvent: { layout: { width: 390, height: 600 } },
    });
    // All three weeks' grids are really mounted side by side
    expect(view.getAllByTestId('timetableuikit-week')).toHaveLength(3);

    await fireEvent(view.getByTestId('timetableuikit-snappager'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 2 * 390, y: 0 } },
    });
    expect(onChangeWeek).toHaveBeenCalledWith(1);
  });

  it('day mode pages too: a settled swipe reports through onChangeDay, side pages drawing the neighbour week', async () => {
    const onChangeDay = jest.fn();
    const view = await render(
      <TimetableView
        entries={ENTRIES}
        skipped={0}
        scope={{ scope: 'group', groupFilterActive: false }}
        mode="day"
        day={0}
        weeks={{ prev: [entry('p', 6, 540, 630)], next: [] }}
        onChangeDay={onChangeDay}
        onPressLesson={jest.fn()}
      />,
    );

    await fireEvent(view.getByTestId('timetableuikit-snappager-frame'), 'layout', {
      nativeEvent: { layout: { width: 390, height: 600 } },
    });
    // Three day timelines side by side; each places its lessons
    // only after its own layout lands
    const timelines = view.getAllByTestId('timetableuikit-timeline');
    expect(timelines).toHaveLength(3);
    for (const timeline of timelines) {
      await fireEvent(timeline, 'layout', { nativeEvent: { layout: { width: 390, height: 700 } } });
    }
    // The left page holds the PREVIOUS week's Sunday — the
    // boundary crossing is real
    expect(view.getByTestId('timetableuikit-lesson-p')).toBeTruthy();

    await fireEvent(view.getByTestId('timetableuikit-snappager'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 0, y: 0 } },
    });
    expect(onChangeDay).toHaveBeenCalledWith(-1);
  });

  it('only the pager MIDDLE page carries the now line — week pages', async () => {
    // Full-day entries on today's weekday in all three weeks:
    // every page COULD draw the line, only the shown week may
    const todayIdx = (new Date().getDay() + 6) % 7;
    const allDay = (id: string) => [entry(id, todayIdx, 0, 1439)];
    const view = await render(
      <TimetableView
        entries={allDay('mid')}
        skipped={0}
        scope={{ scope: 'group', groupFilterActive: false }}
        mode="week"
        day={todayIdx}
        weeks={{ prev: allDay('before'), next: allDay('after') }}
        onChangeDay={jest.fn()}
        onChangeWeek={jest.fn()}
        onPressLesson={jest.fn()}
      />,
    );
    await fireEvent(view.getByTestId('timetableuikit-snappager-frame'), 'layout', {
      nativeEvent: { layout: { width: 390, height: 600 } },
    });
    for (const grid of view.getAllByTestId('timetableuikit-week')) {
      await fireEvent(grid, 'layout', { nativeEvent: { layout: { width: 390, height: 600 } } });
    }
    expect(view.getAllByLabelText('Now')).toHaveLength(1);
  });

  it('only the pager MIDDLE page carries the now line — day pages', async () => {
    const todayIdx = (new Date().getDay() + 6) % 7;
    const allDay = [
      entry('d0', 0, 0, 1439), entry('d6', 6, 0, 1439),
      entry('mid', todayIdx, 0, 1439),
    ];
    const view = await render(
      <TimetableView
        entries={allDay}
        skipped={0}
        scope={{ scope: 'group', groupFilterActive: false }}
        mode="day"
        day={todayIdx}
        weeks={{ prev: allDay, next: allDay }}
        onChangeDay={jest.fn()}
        onPressLesson={jest.fn()}
      />,
    );
    await fireEvent(view.getByTestId('timetableuikit-snappager-frame'), 'layout', {
      nativeEvent: { layout: { width: 390, height: 600 } },
    });
    for (const timeline of view.getAllByTestId('timetableuikit-timeline')) {
      await fireEvent(timeline, 'layout', { nativeEvent: { layout: { width: 390, height: 700 } } });
    }
    // Side pages are yesterday/tomorrow (or a foreign week's
    // edge day) — none of them is "now"
    expect(view.getAllByLabelText('Now')).toHaveLength(1);
  });

  it('day mode shows the chosen day only, and a tap reports the lesson', async () => {
    const onPressLesson = jest.fn();
    const view = await render(
      <TimetableView
        entries={ENTRIES}
        skipped={0}
        scope={{ scope: 'group', groupFilterActive: false }}
        mode="day"
        day={0}
        onChangeDay={jest.fn()}
        onPressLesson={onPressLesson}
      />,
    );
    await layOut(view, 'timetableuikit-timeline');
    expect(view.getByTestId('timetableuikit-lesson-a')).toBeTruthy();
    expect(view.queryByTestId('timetableuikit-lesson-c')).toBeNull();

    await fireEvent.press(view.getByTestId('timetableuikit-lesson-a'));
    expect(onPressLesson).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('a skipped count surfaces the kit notice', async () => {
    const view = await render(
      <TimetableView
        entries={ENTRIES}
        skipped={2}
        scope={{ scope: 'group', groupFilterActive: false }}
        mode="week"
        day={0}
        onChangeDay={jest.fn()}
        onPressLesson={jest.fn()}
      />,
    );
    expect(view.getByTestId('timetableuikit-skipped')).toBeTruthy();
  });

  it('person scope washes a double-booked teacher, and never a mere neighbour', async () => {
    const doubleBooked = [
      entry('x', 0, 540, 630, { groupKey: 'ISKS-1' }),
      entry('y', 0, 600, 660, { groupKey: 'PDF-2' }),
      entry('z', 0, 700, 760, { people: ['B. Jonaitis'] }),
    ];
    const view = await render(
      <TimetableView
        entries={doubleBooked}
        skipped={0}
        scope={{ scope: 'person' }}
        mode="day"
        day={0}
        onChangeDay={jest.fn()}
        onPressLesson={jest.fn()}
      />,
    );
    await layOut(view, 'timetableuikit-timeline');
    // The kit voices a conflict through the cell's a11y label
    // ('Overlaps another lesson' in the provider-less default)
    const flagged = view.getByTestId('timetableuikit-lesson-x').props.accessibilityLabel as string;
    const calm = view.getByTestId('timetableuikit-lesson-z').props.accessibilityLabel as string;
    expect(flagged).toContain('Overlaps another lesson');
    expect(calm).not.toContain('Overlaps another lesson');
  });

  it('the scope prop decides — the same double-booking stays calm under an inactive group scope', async () => {
    const doubleBooked = [
      entry('x', 0, 540, 630, { groupKey: 'ISKS-1' }),
      entry('y', 0, 600, 660, { groupKey: 'PDF-2' }),
    ];
    const view = await render(
      <TimetableView
        entries={doubleBooked}
        skipped={0}
        scope={{ scope: 'group', groupFilterActive: false }}
        mode="day"
        day={0}
        onChangeDay={jest.fn()}
        onPressLesson={jest.fn()}
      />,
    );
    await layOut(view, 'timetableuikit-timeline');
    const label = view.getByTestId('timetableuikit-lesson-x').props.accessibilityLabel as string;
    expect(label).not.toContain('Overlaps another lesson');
  });
});
