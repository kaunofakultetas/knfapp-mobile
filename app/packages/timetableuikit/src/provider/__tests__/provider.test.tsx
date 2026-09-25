// -----------------------------------------------------------
//  [*] Tests — provider, labels, theme resolution
//
//  LT/EN parity, Monday-first day names, the plural forms (a
//  boundary table — the kit's ltPlural had drifted from its
//  three twins, KNF-187), the zero-padded fallback clock, and
//  the merge rules a host relies on.
// -----------------------------------------------------------

import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { TimetableProvider, useTimetableEnv } from '../index';
import { defaultLabels } from '../labels';
import { defaultTheme, resolveTheme } from '../theme';

function Probe() {
  const { labels, theme, formatTime } = useTimetableEnv();
  return (
    <>
      <Text testID="today">{labels.today}</Text>
      <Text testID="no">{labels.noLessons}</Text>
      <Text testID="time">{formatTime(545)}</Text>
      <Text testID="brand">{theme.colors.brand}</Text>
    </>
  );
}

describe('labels', () => {
  it('LT and EN carry exactly the same keys', () => {
    expect(Object.keys(defaultLabels.lt).sort()).toEqual(Object.keys(defaultLabels.en).sort());
  });

  it('day names are Monday-first in both languages', () => {
    expect(defaultLabels.lt.dayShort).toEqual(['Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št', 'Sk']);
    expect(defaultLabels.en.dayShort[0]).toBe('Mon');
    expect(defaultLabels.lt.dayLong[0]).toBe('Pirmadienis');
    expect(defaultLabels.lt.dayShort).toHaveLength(7);
    expect(defaultLabels.en.dayLong).toHaveLength(7);
  });

  it('Lithuanian skipped-count declines with the number', () => {
    expect(defaultLabels.lt.lessonsSkipped(1)).toContain('įrašo');
    expect(defaultLabels.lt.lessonsSkipped(5)).toContain('įrašų');
    expect(defaultLabels.lt.lessonsSkipped(10)).toContain('įrašų');
    expect(defaultLabels.en.lessonsSkipped(1)).toContain('entry');
    expect(defaultLabels.en.lessonsSkipped(3)).toContain('entries');
  });

  it('week captions', () => {
    expect(defaultLabels.lt.weekNumber(37)).toBe('37 savaitė');
    expect(defaultLabels.en.weekNumber(37)).toBe('Week 37');
  });

  it('the Lithuanian plural walks the whole boundary table — teens, tens, hundreds, fractions', () => {
    const form = (count: number) => {
      const text = defaultLabels.lt.conflictsOverlap(count);
      return text.includes('paskaita ') ? 'one' : text.includes('paskaitos ') ? 'few' : 'other';
    };
    const table: [number, string][] = [
      [1, 'one'], [2, 'few'], [9, 'few'], [10, 'other'], [11, 'other'], [19, 'other'], [20, 'other'],
      [21, 'one'], [22, 'few'], [101, 'one'], [111, 'other'], [121, 'one'],
      // The drifted copy said "few" here; its three twins, and
      // now this one, say "other"
      [9.5, 'other'], [19.5, 'other'],
    ];
    for (const [count, expected] of table) expect([count, form(count)]).toEqual([count, expected]);
  });

  it('both sets say "lecture" — the word the app screens use', () => {
    expect(defaultLabels.lt.noLessons).toBe('Nėra paskaitų');
    expect(defaultLabels.en.noLessons).toBe('No lectures');
    expect(defaultLabels.en.conflict).toBe('Overlaps another lecture');
  });

  it('the countdown reads naturally — minutes, then hours and minutes', () => {
    expect(defaultLabels.lt.startsIn(25)).toBe('Po 25 min.');
    expect(defaultLabels.lt.startsIn(90)).toBe('Po 1 val. 30 min.');
    expect(defaultLabels.lt.startsIn(120)).toBe('Po 2 val.');
    expect(defaultLabels.en.startsIn(25)).toBe('In 25 min');
    expect(defaultLabels.en.startsIn(90)).toBe('In 1 h 30 min');
  });

  it('subgroups read naturally in both languages', () => {
    expect(defaultLabels.lt.subgroups(['1'])).toBe('1 pogrupis');
    expect(defaultLabels.lt.subgroups(['1', '2'])).toBe('1, 2 pogrupiai');
    expect(defaultLabels.en.subgroups(['1'])).toBe('Subgroup 1');
    expect(defaultLabels.en.subgroups(['1', '2'])).toBe('Subgroups 1, 2');
    expect(Object.keys(defaultLabels.lt.kinds).sort()).toEqual(Object.keys(defaultLabels.en.kinds).sort());
    // Every kind has its short form in both languages
    expect(Object.keys(defaultLabels.lt.kindsShort).sort()).toEqual(Object.keys(defaultLabels.lt.kinds).sort());
    expect(Object.keys(defaultLabels.en.kindsShort).sort()).toEqual(Object.keys(defaultLabels.en.kinds).sort());
  });
});

describe('TimetableProvider', () => {
  // The clock case used to pin "9:05": the grid was the one
  // timetable surface without the zero (KNF-184)
  it('provider-less: English labels, neutral theme, zero-padded HH:mm times', async () => {
    const view = await render(<Probe />);
    expect(view.getByTestId('today').props.children).toBe('Today');
    expect(view.getByTestId('time').props.children).toBe('09:05');
    expect(view.getByTestId('brand').props.children).toBe(defaultTheme.colors.brand);
  });

  it('locale lt picks the Lithuanian set; a partial override merges over it', async () => {
    const view = await render(
      <TimetableProvider locale="lt" labels={{ today: 'Nūnai' }}>
        <Probe />
      </TimetableProvider>,
    );
    expect(view.getByTestId('today').props.children).toBe('Nūnai');
    expect(view.getByTestId('no').props.children).toBe('Nėra paskaitų');
  });
});

describe('resolveTheme', () => {
  it('derives text styles from the fonts and honors overrides', () => {
    const resolved = resolveTheme({ ...defaultTheme, text: { title: { fontSize: 14 } } });
    expect(resolved.text.title.fontSize).toBe(14);
    expect(resolved.text.title.fontFamily).toBe(defaultTheme.fonts.semiBold);
    expect(resolved.text.axis.fontFamily).toBe(defaultTheme.fonts.medium);
    expect(resolved.subjectColors.length).toBeGreaterThan(0);
  });
});
