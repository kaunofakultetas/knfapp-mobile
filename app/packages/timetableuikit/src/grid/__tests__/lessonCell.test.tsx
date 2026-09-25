// -----------------------------------------------------------
//  [*] Tests — LessonCell tiers, washes, and presses
//
//  A cell's tier follows its PIXEL height with a constant
//  numberOfLines per tier — and a 15-minute sliver renders
//  without a crash. An exam never reads as one more lecture:
//  its time line leads with the kind and the cell wears the
//  brand outline; its subgroups join the meta line.
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

// Wide enough for every word of the fixtures at the jest
// mock's fontScale 2 — the tier cases are about HEIGHT; the
// narrow-column cases below pass their own width
const frameAt = (height: number, width = 220) => ({ top: 0, left: 0, width, height });

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean) as object[]);

describe('LessonCell tiers', () => {
  it('full (>= 56px): two title lines, the time range, the meta line', async () => {
    const view = await render(<LessonCell placed={{ entry: lesson(), layout: geo() }} frame={frameAt(70)} />);
    expect(view.getByText('Matematika').props.numberOfLines).toBe(2);
    expect(view.getByText('09:00–10:30')).toBeTruthy();
    expect(view.getByText('112 · A. Petraitis')).toBeTruthy();
  });

  it('medium (>= 34px): one title line and the time, no meta', async () => {
    const view = await render(<LessonCell placed={{ entry: lesson(), layout: geo() }} frame={frameAt(40)} />);
    expect(view.getByText('Matematika').props.numberOfLines).toBe(1);
    expect(view.getByText('09:00–10:30')).toBeTruthy();
    expect(view.queryByText('112 · A. Petraitis')).toBeNull();
  });

  it('short (< 34px): the title alone — and a sliver never crashes', async () => {
    const view = await render(
      <LessonCell placed={{ entry: lesson(), layout: geo({ isShort: true }) }} frame={frameAt(12)} />,
    );
    expect(view.getByText('Matematika').props.numberOfLines).toBe(1);
    expect(view.queryByText('09:00–10:30')).toBeNull();
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
    expect(cell.props.accessibilityLabel).toContain('Overlaps another lecture');
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
    expect(view.queryByText('09:00–10:30')).toBeNull();
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


describe('LessonCell kinds and subgroups', () => {
  it('an exam leads its time line with the kind, wears the brand outline and says so', async () => {
    const view = await render(
      <LessonCell placed={{ entry: lesson({ kind: 'exam' }), layout: geo() }} frame={frameAt(70)} />,
    );
    expect(view.getByText('Exam · 09:00–10:30')).toBeTruthy();
    const cell = view.getByTestId('timetableuikit-lesson-mat');
    expect(flat(cell.props.style).borderTopWidth).toBe(2);
    expect(cell.props.accessibilityLabel).toBe('Matematika, Exam, 09:00–10:30, 112, A. Petraitis');
  });

  it('an everyday kind is named quietly — no outline, no bold — and to a screen reader', async () => {
    const view = await render(
      <LessonCell placed={{ entry: lesson({ kind: 'practice' }), layout: geo() }} frame={frameAt(70)} />,
    );
    expect(view.getByText('Practical · 09:00–10:30')).toBeTruthy();
    const cell = view.getByTestId('timetableuikit-lesson-mat');
    expect(flat(cell.props.style).borderTopWidth).toBeUndefined();
    expect(cell.props.accessibilityLabel).toContain('Practical');
  });

  it('the subgroups join the meta line right after the room', async () => {
    const view = await render(
      <LessonCell placed={{ entry: lesson({ subgroupKeys: ['2'] }), layout: geo() }} frame={frameAt(70)} />,
    );
    expect(view.getByText('112 · Sub. 2 · A. Petraitis')).toBeTruthy();
  });
});


describe('LessonCell in a narrow column', () => {
  // jest's window mock runs at fontScale 2 — a 12 pt title is
  // measured at 24 pt, exactly as a phone with large text would
  it('a title whose longest word cannot fit shows its short code, whole, on one line', async () => {
    const view = await render(
      <LessonCell
        placed={{ entry: lesson({ title: 'Kompiuterių tinklai', kind: 'practice' }), layout: geo() }}
        frame={frameAt(90, 56)}
      />,
    );
    const title = view.getByText('KT');
    expect(title.props.numberOfLines).toBe(1);
    // The full name stays with the screen reader
    const cell = view.getByTestId('timetableuikit-lesson-mat');
    expect(cell.props.accessibilityLabel).toContain('Kompiuterių tinklai');
    // The short kind name leads the time line
    expect(view.getByText('Prac. · 09:00–10:30')).toBeTruthy();
  });

  it('a one-word title keeps itself — ellipsized on one line, never split mid-word', async () => {
    const view = await render(
      <LessonCell placed={{ entry: lesson({ title: 'Ekonometrija' }), layout: geo() }} frame={frameAt(90, 56)} />,
    );
    expect(view.getByText('Ekonometrija').props.numberOfLines).toBe(1);
  });

  it('a wide cell names an everyday kind in full, quietly', async () => {
    const view = await render(
      <LessonCell placed={{ entry: lesson({ kind: 'lecture' }), layout: geo() }} frame={frameAt(70)} />,
    );
    expect(view.getByText('Lecture · 09:00–10:30')).toBeTruthy();
  });
});
