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
