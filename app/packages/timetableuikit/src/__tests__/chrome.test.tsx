// -----------------------------------------------------------
//  [*] Tests — the chrome components
//
//  The list-mode furniture around the grid views: day names
//  come from the catalog by the kit's 0=Monday indexing, the
//  active states are announced, the conflict copy pluralizes,
//  and every piece renders dependency-free without a provider
//  (the default env) — the contract a host leans on.
// -----------------------------------------------------------

import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react-native';

// The async (concurrent) renders do not auto-clean between
// tests — without this, every query after the first test
// walks the PREVIOUS test's tree
afterEach(cleanup);

import ConflictBanner from '../chrome/ConflictBanner';
import DayStepper from '../chrome/DayStepper';
import DayTabs from '../chrome/DayTabs';
import LessonCard from '../chrome/LessonCard';
import ViewModeSwitch from '../chrome/ViewModeSwitch';
import { TimetableProvider } from '../provider';
import { defaultTheme } from '../provider/theme';


describe('DayStepper', () => {
  // ONE press per test on purpose: two fireEvent presses on
  // sibling hitSlop pressables wedge RNTL's pressability
  // plumbing and every later render in the file mounts empty
  it('shows the short day, announces the long one, and steps back', async () => {
    const onPrev = jest.fn();
    const screen = await render(<DayStepper day={3} onPrev={onPrev} onNext={jest.fn()} />);

    expect(screen.getByText('Thu')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Previous day'));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('steps forward', async () => {
    const onNext = jest.fn();
    const screen = await render(<DayStepper day={3} onPrev={jest.fn()} onNext={onNext} />);
    fireEvent.press(screen.getByLabelText('Next day'));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('speaks the provider locale', async () => {
    const screen = await render(
      <TimetableProvider theme={defaultTheme} locale="lt">
        <DayStepper day={0} onPrev={jest.fn()} onNext={jest.fn()} />
      </TimetableProvider>,
    );
    expect(screen.getByText('Pr')).toBeTruthy();
    expect(screen.getByLabelText('Ankstesnė diena')).toBeTruthy();
  });

  it('stacks the dated subtitle under the day name', async () => {
    const screen = await render(
      <DayStepper day={0} subtitle="2026-09-14" onPrev={jest.fn()} onNext={jest.fn()} />,
    );
    expect(screen.getByText('Mon')).toBeTruthy();
    expect(screen.getByText('2026-09-14')).toBeTruthy();
  });

  it('lets a week-cursor host replace the day name via label', async () => {
    const screen = await render(
      <DayStepper day={0} label="38 sav." subtitle="09-14 – 09-20" onPrev={jest.fn()} onNext={jest.fn()} />,
    );
    expect(screen.getByText('38 sav.')).toBeTruthy();
    expect(screen.queryByText('Mon')).toBeNull();
    expect(screen.getByText('09-14 – 09-20')).toBeTruthy();
  });

  it('a week cursor renames what the chevrons announce', async () => {
    const screen = await render(
      <DayStepper
        day={0}
        prevAccessibilityLabel="Previous week"
        nextAccessibilityLabel="Next week"
        onPrev={jest.fn()}
        onNext={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Previous week')).toBeTruthy();
    expect(screen.getByLabelText('Next week')).toBeTruthy();
    expect(screen.queryByLabelText('Previous day')).toBeNull();
  });

  it('renders the Today pill only when the host hands the snap-back over', async () => {
    const onToday = jest.fn();
    const screen = await render(<DayStepper day={0} onToday={onToday} onPrev={jest.fn()} onNext={jest.fn()} />);
    fireEvent.press(screen.getByText('Today'));
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it('no onToday means no pill — presence itself marks displacement', async () => {
    const screen = await render(<DayStepper day={0} onPrev={jest.fn()} onNext={jest.fn()} />);
    expect(screen.queryByText('Today')).toBeNull();
  });
});


describe('DayTabs', () => {
  it('renders the given day set, marks the selection, and reports taps', async () => {
    const onSelect = jest.fn();
    const screen = await render(<DayTabs days={[0, 1, 2, 3, 4]} selectedDay={1} onSelect={onSelect} />);

    expect(screen.queryByText('Sat')).toBeNull();
    const tuesday = screen.getByLabelText('Tuesday');
    expect(tuesday.props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByLabelText('Friday'));
    expect(onSelect).toHaveBeenCalledWith(4);
  });

  it("today's pill announces itself, and only when the host marks one", async () => {
    const marked = await render(
      <DayTabs days={[0, 1, 2, 3, 4]} selectedDay={1} today={3} onSelect={jest.fn()} />,
    );
    // The a11y label carries the today marker; selection stays
    // on Tuesday untouched
    expect(marked.getByLabelText('Thursday, Today')).toBeTruthy();
    expect(marked.getByLabelText('Tuesday').props.accessibilityState).toEqual({ selected: true });

    // A foreign week passes no today — no pill claims it
    const foreign = await render(
      <DayTabs days={[0, 1, 2, 3, 4]} selectedDay={1} onSelect={jest.fn()} />,
    );
    expect(foreign.queryByLabelText('Thursday, Today')).toBeNull();
    expect(foreign.getByLabelText('Thursday')).toBeTruthy();
  });
});


describe('ViewModeSwitch', () => {
  it('announces the three modes from the catalog and switches', async () => {
    const onChange = jest.fn();
    const screen = await render(<ViewModeSwitch mode="list" onChange={onChange} />);

    fireEvent.press(screen.getByLabelText('Week'));
    expect(onChange).toHaveBeenCalledWith('week');
    expect(screen.getByLabelText('List').props.accessibilityState).toEqual({ selected: true });
  });

  it('lets the host render its own icons', async () => {
    const screen = await render(
      <ViewModeSwitch mode="day" onChange={jest.fn()} renderIcon={(mode) => <React.Fragment>{null}</React.Fragment>} />,
    );
    // The glyph fallback stays out when the host renders icons
    expect(screen.queryByText('⊞')).toBeNull();
  });
});


describe('ConflictBanner', () => {
  it('pluralizes through the catalog', async () => {
    const screen = await render(
      <TimetableProvider theme={defaultTheme} locale="lt">
        <ConflictBanner count={3} />
      </TimetableProvider>,
    );
    expect(screen.getByText('3 paskaitos persidengia laiku')).toBeTruthy();
  });
});


describe('LessonCard', () => {
  it('renders the neutral shape, clash chip only when conflicting', async () => {
    const props = {
      title: 'Programavimas',
      person: 'J. Jonaitis',
      room: '204 AUD',
      timeStart: '09:00',
      timeEnd: '10:30',
      footnote: 'IT-3 · 2026-R',
    };
    const calm = await render(<LessonCard {...props} />);
    expect(calm.getByText('Programavimas')).toBeTruthy();
    expect(calm.getByText('09:00 – 10:30')).toBeTruthy();
    expect(calm.queryByText('Overlap')).toBeNull();

    const clashing = await render(<LessonCard {...props} conflict />);
    expect(clashing.getByText('Overlap')).toBeTruthy();
  });
});
