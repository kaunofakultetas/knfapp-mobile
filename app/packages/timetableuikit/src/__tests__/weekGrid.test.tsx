// -----------------------------------------------------------
//  [*] Tests — WeekGrid: layout-driven geometry, the swipe,
//  and the fully controlled contract
// -----------------------------------------------------------

import { fireEvent, render, within } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { Text } from 'react-native';

import type { LessonGeometry, PlacedLesson, TimetableLesson } from '../core/types';
import { TimetableProvider } from '../provider';
import WeekGrid from '../WeekGrid';

const WINDOW = { startMin: 480, endMin: 1260 }; // span 780, gridHeight 13h * 56 = 728

const lesson = (id: string, day: number, startMin: number, endMin: number, extra: Partial<TimetableLesson> = {}): TimetableLesson => ({
  id, title: id, day, startMin, endMin, ...extra,
});

const placed = (l: TimetableLesson, extra: Partial<LessonGeometry> = {}): PlacedLesson => ({
  entry: l,
  layout: {
    topFrac: (l.startMin - WINDOW.startMin) / 780,
    heightFrac: (l.endMin - l.startMin) / 780,
    leftFrac: 0, widthFrac: 1, isShort: false, isConflict: false, ...extra,
  },
});

const week = (): PlacedLesson[][] => {
  const days: PlacedLesson[][] = [[], [], [], [], [], [], []];
  days[0].push(placed(lesson('mat', 0, 540, 630)));
  days[2].push(placed(lesson('fiz', 2, 720, 810)));
  return days;
};

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean) as object[]);

// Every flattened style in the rendered tree — for asserting a
// wrapper the kit itself draws
const allStyles = (node: unknown): Record<string, unknown>[] => {
  if (!node || typeof node !== 'object') return [];
  const n = node as { props?: { style?: unknown }; children?: unknown[] };
  const own = n.props?.style ? [flat(n.props.style)] : [];
  return own.concat(...(n.children ?? []).map(allStyles));
};

type GridView = Awaited<ReturnType<typeof render>>;

const layOut = (view: GridView, width = 394) =>
  fireEvent(view.getByTestId('timetableuikit-week'), 'layout', { nativeEvent: { layout: { width, height: 700 } } });

const renderGrid = (props: Partial<ComponentProps<typeof WeekGrid>> = {}) =>
  render(
    <TimetableProvider locale="lt">
      <WeekGrid days={week()} window={WINDOW} now={null} {...props} />
    </TimetableProvider>,
  );

describe('WeekGrid layout', () => {
  it('renders nothing measurable before onLayout, everything after', async () => {
    const view = await renderGrid();
    expect(view.queryByTestId('timetableuikit-lesson-mat')).toBeNull();
    await layOut(view);
    expect(view.getByTestId('timetableuikit-lesson-mat')).toBeTruthy();
  });

  it('cells take integer frames from the measured width', async () => {
    const view = await renderGrid();
    await layOut(view, 394); // dayWidth = floor((394-44)/5) = 70
    const style = flat(view.getByTestId('timetableuikit-lesson-mat').props.style);
    expect(style).toMatchObject({ top: 56, left: 0, width: 68, height: 82 });
  });

  it('a new measurement relays the geometry', async () => {
    const view = await renderGrid();
    await layOut(view, 394);
    await layOut(view, 704); // dayWidth = floor(660/5) = 132
    expect(flat(view.getByTestId('timetableuikit-lesson-mat').props.style).width).toBe(130);
  });

  it('the header runs Pr An Tr Kt Pn, Monday first', async () => {
    const view = await renderGrid();
    await layOut(view);
    const names = ['Pr', 'An', 'Tr', 'Kt', 'Pn'];
    names.forEach((name, day) => {
      expect(within(view.getByTestId(`timetableuikit-dayname-${day}`)).getByText(name)).toBeTruthy();
    });
    expect(view.queryByTestId('timetableuikit-dayname-5')).toBeNull();
  });

  it('weekend columns appear when visibleDays says so', async () => {
    const view = await renderGrid({ visibleDays: [0, 1, 2, 3, 4, 5] });
    await layOut(view);
    expect(within(view.getByTestId('timetableuikit-dayname-5')).getByText('Št')).toBeTruthy();
  });

  it('a dotted seam stands at every interior day boundary — none before the first column', async () => {
    const view = await renderGrid();
    await layOut(view, 394); // dayWidth 70, axis 44
    expect(view.queryByTestId('timetableuikit-dayline-0')).toBeNull();
    [1, 2, 3, 4].forEach((day) => {
      const style = flat(view.getByTestId(`timetableuikit-dayline-${day}`).props.style);
      expect(style).toMatchObject({ left: 44 + day * 70, borderStyle: 'dotted', width: 1 });
    });
    expect(view.queryByTestId('timetableuikit-dayline-5')).toBeNull();
  });
});

describe('WeekGrid now', () => {
  it('the now line and the today chip live ONLY in today’s column', async () => {
    const view = await renderGrid({ now: { day: 0, minutes: 600 } });
    await layOut(view);
    expect(view.getAllByTestId('timetableuikit-nowline')).toHaveLength(1);
    expect(within(view.getByTestId('timetableuikit-day-0')).getByTestId('timetableuikit-nowline')).toBeTruthy();
    expect(flat(view.getByTestId('timetableuikit-dayname-0').props.style).backgroundColor).toBe('#2F6FED');
    expect(flat(view.getByTestId('timetableuikit-dayname-1').props.style).backgroundColor).toBe('transparent');
  });

  it('now: null silences the clock — another week is just a grid', async () => {
    const view = await renderGrid({ now: null });
    await layOut(view);
    expect(view.queryByTestId('timetableuikit-nowline')).toBeNull();
  });

  it('a host-supplied now starts NO half-minute interval; the default clock does', async () => {
    const spy = jest.spyOn(global, 'setInterval');
    const view = await renderGrid({ now: { day: 0, minutes: 600 } });
    await layOut(view);
    expect(spy.mock.calls.filter((call) => call[1] === 30_000)).toHaveLength(0);
    await view.unmount();
    await renderGrid({ now: undefined });
    expect(spy.mock.calls.filter((call) => call[1] === 30_000)).toHaveLength(1);
    spy.mockRestore();
  });

  it('an evening minute outside the window draws no line', async () => {
    const view = await renderGrid({ now: { day: 0, minutes: 1300 } });
    await layOut(view);
    expect(view.queryByTestId('timetableuikit-nowline')).toBeNull();
  });
});

describe('WeekGrid content states', () => {
  it('an all-empty week says so in the host’s language', async () => {
    const view = await renderGrid({ days: [[], [], [], [], [], [], []] });
    await layOut(view);
    expect(view.getByTestId('timetableuikit-empty').props.children).toBe('Paskaitų nėra');
  });

  it('a skipped count surfaces the degradation notice', async () => {
    const view = await renderGrid({ skippedCount: 3 });
    await layOut(view);
    expect(view.getByTestId('timetableuikit-skipped').props.children).toContain('įrašų');
  });

  it('renderLesson swaps the cell — and the kit still places its frame', async () => {
    const view = await renderGrid({
      renderLesson: (p) => <Text>{`CUSTOM ${p.entry.id}`}</Text>,
    });
    await layOut(view);
    expect(view.getByText('CUSTOM mat')).toBeTruthy();
    expect(view.queryByTestId('timetableuikit-lesson-mat')).toBeNull();
    // The custom cell sits inside an absolutely positioned
    // wrapper carrying the SAME frame the default cell gets —
    // a flow-layout renderer must not stack at the top-left
    const framed = [view.toJSON()].flat().flatMap(allStyles);
    expect(framed.some((s) => s.position === 'absolute' && s.top === 56 && s.left === 0 && s.width === 68 && s.height === 82)).toBe(true);
  });

  it('a host formatTime flows into the cells and the axis', async () => {
    const view = await render(
      <TimetableProvider locale="lt" formatTime={(minutes) => `${minutes}m`}>
        <WeekGrid days={week()} window={WINDOW} now={null} />
      </TimetableProvider>,
    );
    await layOut(view);
    expect(view.getByText('540m–630m')).toBeTruthy();
    expect(view.getByTestId('timetableuikit-axis-9').props.children).toBe('540m');
  });

  it('a cell press reports the lesson', async () => {
    const onPressLesson = jest.fn();
    const view = await renderGrid({ onPressLesson });
    await layOut(view);
    await fireEvent.press(view.getByTestId('timetableuikit-lesson-mat'));
    expect(onPressLesson).toHaveBeenCalledWith(expect.objectContaining({ id: 'mat' }));
  });
});

describe('WeekGrid paging', () => {
  const touch = (x: number, y: number) => ({ nativeEvent: { pageX: x, pageY: y } });

  const gesture = (view: GridView) => {
    const root = view.getByTestId('timetableuikit-week');
    return {
      start: (x: number, y: number) => root.props.onStartShouldSetResponderCapture(touch(x, y)),
      claim: (x: number, y: number) => root.props.onMoveShouldSetResponderCapture(touch(x, y)) as boolean,
      move: (x: number, y: number) => root.props.onResponderMove(touch(x, y)),
      release: (x: number, y: number) => root.props.onResponderRelease(touch(x, y)),
    };
  };

  it('a left swipe pages forward EXACTLY once, however long the drag', async () => {
    const onChangeWeek = jest.fn();
    const view = await renderGrid({ onChangeWeek });
    await layOut(view);
    const g = gesture(view);

    g.start(200, 300);
    expect(g.claim(180, 303)).toBe(true); // decisively horizontal
    g.move(145, 300);                     // 55px — commits
    g.move(80, 300);                      // keeps dragging — no second page
    g.release(60, 300);
    expect(onChangeWeek).toHaveBeenCalledTimes(1);
    expect(onChangeWeek).toHaveBeenCalledWith(1);
  });

  it('a right swipe pages back', async () => {
    const onChangeWeek = jest.fn();
    const view = await renderGrid({ onChangeWeek });
    await layOut(view);
    const g = gesture(view);

    g.start(100, 300);
    g.move(170, 300);
    g.release(170, 300);
    expect(onChangeWeek).toHaveBeenCalledWith(-1);
  });

  it('a short drag cancels; the NEXT gesture works again', async () => {
    const onChangeWeek = jest.fn();
    const view = await renderGrid({ onChangeWeek });
    await layOut(view);
    const g = gesture(view);

    g.start(200, 300);
    g.move(170, 300); // 30px — under the threshold
    g.release(170, 300);
    expect(onChangeWeek).not.toHaveBeenCalled();

    g.start(200, 300);
    g.move(130, 300);
    g.release(130, 300);
    expect(onChangeWeek).toHaveBeenCalledTimes(1);
  });

  it('a vertical drag is never claimed — the scroll keeps it', async () => {
    const view = await renderGrid({ onChangeWeek: jest.fn() });
    await layOut(view);
    const g = gesture(view);

    g.start(200, 300);
    expect(g.claim(215, 360)).toBe(false); // |dy| beats |dx|
  });

  it('stays fully controlled: the same days render after a page turn', async () => {
    const onChangeWeek = jest.fn();
    const view = await renderGrid({ onChangeWeek });
    await layOut(view);
    const g = gesture(view);
    g.start(200, 300);
    g.move(130, 300);
    g.release(130, 300);
    expect(onChangeWeek).toHaveBeenCalledTimes(1);
    // No internal cursor moved — the grid still shows what the
    // host gave it
    expect(view.getByTestId('timetableuikit-lesson-mat')).toBeTruthy();
  });
});
