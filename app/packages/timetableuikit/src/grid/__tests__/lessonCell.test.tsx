// -----------------------------------------------------------
//  [*] Tests — LessonCell tiers, washes, and presses
//
//  A cell's tier follows its PIXEL height with a constant
//  numberOfLines per tier — and a 15-minute sliver renders
//  without a crash.
// -----------------------------------------------------------

import { fireEvent, render } from '@testing-library/react-native';

import type { LessonGeometry, TimetableLesson } from '../../core/types';
import LessonCell from '../LessonCell';

const lesson = (extra: Partial<TimetableLesson> = {}): TimetableLesson => ({
  id: 'mat', title: 'Matematika', day: 0, startMin: 540, endMin: 630,
  location: ['112'], people: ['A. Petraitis'], ...extra,
});

const geo = (extra: Partial<LessonGeometry> = {}): LessonGeometry => ({
  topFrac: 0, heightFrac: 0.1, leftFrac: 0, widthFrac: 1, isShort: false, isConflict: false, ...extra,
});

const frameAt = (height: number) => ({ top: 0, left: 0, width: 120, height });

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean) as object[]);

describe('LessonCell tiers', () => {
  it('full (>= 56px): two title lines, the time range, the meta line', async () => {
    const view = await render(<LessonCell placed={{ entry: lesson(), layout: geo() }} frame={frameAt(70)} />);
    expect(view.getByText('Matematika').props.numberOfLines).toBe(2);
    expect(view.getByText('9:00–10:30')).toBeTruthy();
    expect(view.getByText('112 · A. Petraitis')).toBeTruthy();
  });

  it('medium (>= 34px): one title line and the time, no meta', async () => {
    const view = await render(<LessonCell placed={{ entry: lesson(), layout: geo() }} frame={frameAt(40)} />);
    expect(view.getByText('Matematika').props.numberOfLines).toBe(1);
    expect(view.getByText('9:00–10:30')).toBeTruthy();
    expect(view.queryByText('112 · A. Petraitis')).toBeNull();
  });

  it('short (< 34px): the title alone — and a sliver never crashes', async () => {
    const view = await render(
      <LessonCell placed={{ entry: lesson(), layout: geo({ isShort: true }) }} frame={frameAt(12)} />,
    );
    expect(view.getByText('Matematika').props.numberOfLines).toBe(1);
    expect(view.queryByText('9:00–10:30')).toBeNull();
  });

  it('a merged teacher card lists its groups in the meta line', async () => {
    const view = await render(
      <LessonCell
        placed={{ entry: lesson({ groupKeys: ['ISKS-1', 'ISKS-2'] }), layout: geo() }}
        frame={frameAt(70)}
      />,
    );
    expect(view.getByText('112 · A. Petraitis · ISKS-1, ISKS-2')).toBeTruthy();
  });
});

describe('LessonCell states', () => {
  it('a conflict wears the danger wash and says so to a screen reader', async () => {
    const view = await render(
      <LessonCell placed={{ entry: lesson(), layout: geo({ isConflict: true }) }} frame={frameAt(70)} />,
    );
    const cell = view.getByTestId('timetableuikit-lesson-mat');
    expect(flat(cell.props.style).backgroundColor).toBe('#FEE2E2');
    expect(cell.props.accessibilityLabel).toContain('Overlaps another lesson');
  });

  it('a block is inert and muted even when a press handler exists', async () => {
    const onPress = jest.fn();
    const view = await render(
      <LessonCell
        placed={{ entry: lesson({ id: 'hol', title: 'Šventė', isBlock: true }), layout: geo() }}
        frame={frameAt(70)}
        onPress={onPress}
      />,
    );
    const cell = view.getByTestId('timetableuikit-lesson-hol');
    expect(cell.props.accessibilityRole).toBeUndefined();
    expect(view.queryByText('9:00–10:30')).toBeNull();
  });

  it('a press hands back the LESSON, not an event', async () => {
    const onPress = jest.fn();
    const view = await render(
      <LessonCell placed={{ entry: lesson(), layout: geo() }} frame={frameAt(70)} onPress={onPress} />,
    );
    await fireEvent.press(view.getByTestId('timetableuikit-lesson-mat'));
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'mat', title: 'Matematika' }));
  });
});
