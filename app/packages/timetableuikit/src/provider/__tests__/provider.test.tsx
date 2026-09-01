// -----------------------------------------------------------
//  [*] Tests — provider, labels, theme resolution
//
//  LT/EN parity, Monday-first day names, the plural forms, and
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
});

describe('TimetableProvider', () => {
  it('provider-less: English labels, neutral theme, H:mm times', async () => {
    const view = await render(<Probe />);
    expect(view.getByTestId('today').props.children).toBe('Today');
    expect(view.getByTestId('time').props.children).toBe('9:05');
    expect(view.getByTestId('brand').props.children).toBe(defaultTheme.colors.brand);
  });

  it('locale lt picks the Lithuanian set; a partial override merges over it', async () => {
    const view = await render(
      <TimetableProvider locale="lt" labels={{ today: 'Nūnai' }}>
        <Probe />
      </TimetableProvider>,
    );
    expect(view.getByTestId('today').props.children).toBe('Nūnai');
    expect(view.getByTestId('no').props.children).toBe('Paskaitų nėra');
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
