// -----------------------------------------------------------
//  [*] Tests — DayTimeline: the phone-first single day
// -----------------------------------------------------------

import { fireEvent, render } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { ScrollView, Text } from 'react-native';

import type { LessonGeometry, PlacedLesson, TimetableLesson } from '../core/types';
import DayTimeline, { firstLessonOffset } from '../DayTimeline';
import { TimetableProvider } from '../provider';

const WINDOW = { startMin: 480, endMin: 1260 }; // 13h · 64px = 832

const lesson = (id: string, startMin: number, endMin: number, extra: Partial<TimetableLesson> = {}): TimetableLesson => ({
  id, title: id, day: 2, startMin, endMin, ...extra,
});

const placed = (l: TimetableLesson, extra: Partial<LessonGeometry> = {}): PlacedLesson => ({
  entry: l,
  layout: {
    topFrac: (l.startMin - WINDOW.startMin) / 780,
    heightFrac: (l.endMin - l.startMin) / 780,
    leftFrac: 0, widthFrac: 1, isShort: false, isConflict: false, ...extra,
  },
});

const renderDay = (props: Partial<ComponentProps<typeof DayTimeline>> = {}) =>
  render(
    <TimetableProvider locale="lt">
      <DayTimeline placed={[placed(lesson('mat', 540, 630))]} window={WINDOW} day={2} now={null} {...props} />
    </TimetableProvider>,
  );

type DayView = Awaited<ReturnType<typeof render>>;

const layOut = (view: DayView, width = 394) =>
  fireEvent(view.getByTestId('timetableuikit-timeline'), 'layout', { nativeEvent: { layout: { width, height: 700 } } });

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean) as object[]);

describe('firstLessonOffset', () => {
  const grid = 832;

  it('opens just above the earliest real lesson', () => {
    const day = [placed(lesson('a', 540, 630)), placed(lesson('b', 780, 870))];
    expect(firstLessonOffset(day, grid)).toBe((60 / 780) * 832 - 12);
  });

  it('clamps to the top and ignores blocks', () => {
    expect(firstLessonOffset([placed(lesson('a', 485, 540))], grid)).toBe(0);
    expect(firstLessonOffset([placed(lesson('bg', 480, 1200, { isBlock: true }))], grid)).toBeNull();
    expect(firstLessonOffset([], grid)).toBeNull();
  });
});

describe('DayTimeline', () => {
  it('names the day in full, Lithuanian, Monday-indexed', async () => {
    const view = await renderDay();
    expect(view.getByTestId('timetableuikit-timeline-day').props.children).toBe('Trečiadienis');
  });

  it('wears the today chip only when now says this IS the day', async () => {
    expect((await renderDay({ now: { day: 2, minutes: 600 } })).getByText('Šiandien')).toBeTruthy();
    expect((await renderDay({ now: { day: 3, minutes: 600 } })).queryByText('Šiandien')).toBeNull();
    expect((await renderDay({ now: null })).queryByText('Šiandien')).toBeNull();
  });

  it('lays the single column across the measured width', async () => {
    const view = await renderDay();
    await layOut(view, 394); // column = 394 - 44 = 350, cell = 348
    expect(flat(view.getByTestId('timetableuikit-lesson-mat').props.style).width).toBe(348);
  });

  it('shows the now line only on today, gated by the window', async () => {
    const view = await renderDay({ now: { day: 2, minutes: 600 } });
    await layOut(view);
    expect(view.getByTestId('timetableuikit-nowline')).toBeTruthy();
    const other = await renderDay({ now: { day: 3, minutes: 600 } });
    await layOut(other);
    expect(other.queryByTestId('timetableuikit-nowline')).toBeNull();
  });

  it('an empty day says so; a dateLabel and skipped notice surface', async () => {
    const view = await renderDay({ placed: [], dateLabel: '2026-03-25', skippedCount: 2 });
    await layOut(view);
    expect(view.getByTestId('timetableuikit-empty').props.children).toBe('Paskaitų nėra');
    expect(view.getByText('2026-03-25')).toBeTruthy();
    expect(view.getByTestId('timetableuikit-skipped')).toBeTruthy();
  });

  it('forwards renderLesson and onPressLesson to its column', async () => {
    const onPressLesson = jest.fn();
    const custom = await renderDay({ renderLesson: (p) => <Text>{`CUSTOM ${p.entry.id}`}</Text> });
    await layOut(custom);
    expect(custom.getByText('CUSTOM mat')).toBeTruthy();
    expect(custom.queryByTestId('timetableuikit-lesson-mat')).toBeNull();

    const pressable = await renderDay({ onPressLesson });
    await layOut(pressable);
    await fireEvent.press(pressable.getByTestId('timetableuikit-lesson-mat'));
    expect(onPressLesson).toHaveBeenCalledWith(expect.objectContaining({ id: 'mat' }));
  });

  it('auto-scrolls once the width lands — once per day, never on a rebuilt-but-equal placed array', async () => {
    // The preset ships ScrollView.scrollTo as a shared mock:
    // spyOn returns that same mock, history and all — clear it
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
    scrollTo.mockClear();
    const view = await renderDay();
    // No width yet → nothing to scroll against
    expect(scrollTo).not.toHaveBeenCalled();
    await layOut(view);
    // gridHeight 832: first lesson at (60/780)·832 − 12 = 52
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 52, animated: false });

    // The host re-renders with a NEW array of the same day —
    // the reader's scroll position stays put
    await view.rerender(
      <TimetableProvider locale="lt">
        <DayTimeline placed={[placed(lesson('mat', 540, 630))]} window={WINDOW} day={2} now={null} />
      </TimetableProvider>,
    );
    expect(scrollTo).toHaveBeenCalledTimes(1);

    // A different day opens at ITS first lesson
    await view.rerender(
      <TimetableProvider locale="lt">
        <DayTimeline placed={[placed(lesson('kt', 660, 750))]} window={WINDOW} day={3} now={null} />
      </TimetableProvider>,
    );
    expect(scrollTo).toHaveBeenCalledTimes(2);
    scrollTo.mockRestore();
  });

  it('lessons arriving after an empty first render still position the view', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
    scrollTo.mockClear();
    const view = await renderDay({ placed: [] });
    await layOut(view);
    expect(scrollTo).not.toHaveBeenCalled();
    await view.rerender(
      <TimetableProvider locale="lt">
        <DayTimeline placed={[placed(lesson('mat', 540, 630))]} window={WINDOW} day={2} now={null} />
      </TimetableProvider>,
    );
    expect(scrollTo).toHaveBeenCalledTimes(1);
    scrollTo.mockRestore();
  });

  it('swipes report the day turn to the host', async () => {
    const onChangeDay = jest.fn();
    const view = await renderDay({ onChangeDay });
    await layOut(view);
    const root = view.getByTestId('timetableuikit-timeline');
    const touch = (x: number, y: number) => ({ nativeEvent: { pageX: x, pageY: y } });

    root.props.onStartShouldSetResponderCapture(touch(200, 300));
    root.props.onResponderMove(touch(260, 300));
    root.props.onResponderRelease(touch(260, 300));
    expect(onChangeDay).toHaveBeenCalledWith(-1);
  });
});
