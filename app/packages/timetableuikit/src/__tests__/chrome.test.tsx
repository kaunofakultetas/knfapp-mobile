// -----------------------------------------------------------
//  [*] Tests — the chrome components
//
//  The list-mode furniture around the grid views: day names
//  come from the catalog by the kit's 0=Monday indexing, the
//  active states are announced, the conflict copy pluralizes,
//  and every piece renders dependency-free without a provider
//  (the default env) — the contract a host leans on. The
//  touch targets stay 44 pt WITHOUT a Pressable style
//  function (css-interop drops those on device), an exam card
//  leads with its kind, and a long footer wraps instead of
//  running off a 320 pt card.
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
import TodayButton from '../chrome/TodayButton';
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
  it('the default "!" disc sits on the theme\'s dangerFill, never the text red', async () => {
    const screen = await render(
      <TimetableProvider theme={{ ...defaultTheme, colors: { ...defaultTheme.colors, danger: '#EF5350', dangerFill: '#D32F2F' } }}>
        <ConflictBanner count={2} />
      </TimetableProvider>,
    );
    // The rendered View whose Text child is the "!"
    type Node = { type?: string; props?: { style?: unknown }; children?: (Node | string)[] | null };
    const discOf = (node: Node | string | null): Node | null => {
      if (!node || typeof node === 'string') return null;
      const kids = node.children ?? [];
      if (kids.some((kid) => typeof kid !== 'string' && kid.type === 'Text' && (kid.children ?? []).includes('!'))) return node;
      for (const kid of kids) {
        const found = discOf(kid);
        if (found) return found;
      }
      return null;
    };
    const disc = discOf(screen.toJSON() as unknown as Node);
    const style = Object.assign({}, ...[disc?.props?.style].flat(Infinity).filter(Boolean) as object[]);
    expect(style.backgroundColor).toBe('#D32F2F');
  });

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


describe('TodayButton', () => {
  it('speaks the catalog, reports the press, and keeps its target without a style function', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <TimetableProvider theme={defaultTheme} locale="lt">
        <TodayButton onPress={onPress} />
      </TimetableProvider>,
    );
    const button = screen.getByLabelText('Šiandien');
    expect(typeof button.props.style).not.toBe('function');
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});


describe('chrome touch targets', () => {
  it('the stepper and the tabs draw their visuals inside — no Pressable style function anywhere', async () => {
    const stepper = await render(<DayStepper day={0} onToday={jest.fn()} onPrev={jest.fn()} onNext={jest.fn()} />);
    for (const label of ['Previous day', 'Next day', 'Today']) {
      expect(typeof stepper.getByLabelText(label).props.style).not.toBe('function');
    }
    const tabs = await render(<DayTabs days={[0, 1, 2, 3, 4]} selectedDay={0} onSelect={jest.fn()} />);
    // 24 pt pills + 10 pt of slop either side: the full 44 pt
    expect(tabs.getByLabelText('Monday').props.hitSlop).toEqual({ top: 10, bottom: 10, left: 3, right: 3 });
  });

  it('a host row that draws its own hairline turns the strip\'s off', async () => {
    // Every border-bottom width the rendered tree carries
    const bottoms = (node: unknown): unknown[] => {
      if (!node || typeof node !== 'object') return [];
      const n = node as { props?: { style?: unknown }; children?: unknown[] };
      const style = Object.assign({}, ...[n.props?.style].flat(Infinity).filter(Boolean) as object[]);
      const own = 'borderBottomWidth' in style ? [style.borderBottomWidth] : [];
      return own.concat(...(n.children ?? []).map(bottoms));
    };
    const bare = await render(<DayTabs days={[0, 1]} selectedDay={0} onSelect={jest.fn()} bordered={false} />);
    expect([bare.toJSON()].flat().flatMap(bottoms)).toEqual([0]);
    const lined = await render(<DayTabs days={[0, 1]} selectedDay={0} onSelect={jest.fn()} />);
    expect([lined.toJSON()].flat().flatMap(bottoms)).toEqual([1]);
  });
});


describe('LessonCard kinds, subgroups and narrow footers', () => {
  const base = {
    title: 'Akademinis ir informacinis raštingumas',
    person: 'Ilona Veitaitė, Doc., Dr.',
    room: 'II k. kl. (knf)',
    timeStart: '09:00',
    timeEnd: '11:00',
  };

  it('an exam leads with a filled badge naming it; an everyday kind shows none', async () => {
    const exam = await render(
      <TimetableProvider theme={defaultTheme} locale="lt">
        <LessonCard {...base} kind="exam" />
      </TimetableProvider>,
    );
    expect(exam.getByText('Egzaminas')).toBeTruthy();
    const lecture = await render(<LessonCard {...base} kind="lecture" />);
    expect(lecture.queryByTestId('timetableuikit-kind-badge')).toBeNull();
  });

  it('a host clock adds the status chip — the lecture under way, or the next one\'s countdown', async () => {
    const live = await render(<LessonCard {...base} status={{ label: 'In progress', live: true }} />);
    expect(live.getByText('In progress')).toBeTruthy();
    const next = await render(<LessonCard {...base} status={{ label: 'In 25 min', live: false }} />);
    expect(next.getByText('In 25 min')).toBeTruthy();
    const none = await render(<LessonCard {...base} />);
    expect(none.queryByTestId('timetableuikit-status')).toBeNull();
  });

  it('the badge and the clash chip stand side by side', async () => {
    const both = await render(<LessonCard {...base} kind="exam" conflict />);
    expect(both.getByText('Exam')).toBeTruthy();
    expect(both.getByText('Overlap')).toBeTruthy();
  });

  it('an everyday kind names itself quietly in the footer, before the group', async () => {
    const card = await render(<LessonCard {...base} kind="practice" footnote="ISKS-1" subgroups={['2']} />);
    expect(card.getByText('Practical · ISKS-1 · Subgroup 2')).toBeTruthy();
    // A badge kind is not named twice
    const exam = await render(<LessonCard {...base} kind="exam" footnote="ISKS-1" />);
    expect(exam.getByText('ISKS-1')).toBeTruthy();
  });

  it('below 360 pt the room leaves the title\'s side for its own row; an empty room draws no chip', async () => {
    // The rendered View whose Text child reads the room
    type Node = { type?: string; props?: { style?: unknown }; children?: (Node | string)[] | null };
    const holderOf = (node: Node | string | null, room: string): Node | null => {
      if (!node || typeof node === 'string') return null;
      const kids = node.children ?? [];
      if (kids.some((kid) => typeof kid !== 'string' && kid.type === 'Text' && (kid.children ?? []).includes(room))) return node;
      for (const kid of kids) {
        const found = holderOf(kid, room);
        if (found) return found;
      }
      return null;
    };
    const chipStyle = (view: Awaited<ReturnType<typeof render>>) => {
      const chip = holderOf(view.toJSON() as unknown as Node, 'II k. kl. (knf)');
      return Object.assign({}, ...[chip?.props?.style].flat(Infinity).filter(Boolean) as object[]);
    };
    const wide = await render(<LessonCard {...base} />);
    expect(chipStyle(wide).maxWidth).toBe(130);

    const RN = require('react-native');
    const narrow = jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({ width: 320, height: 568, scale: 2, fontScale: 1 });
    try {
      const small = await render(<LessonCard {...base} />);
      expect(chipStyle(small)).toMatchObject({ alignSelf: 'flex-start', maxWidth: '100%' });
      const roomless = await render(<LessonCard {...base} room="" />);
      expect(roomless.queryByText('II k. kl. (knf)')).toBeNull();
    } finally {
      narrow.mockRestore();
    }
  });

  it('the subgroups follow the footnote, and the footer wraps at the card edge', async () => {
    const card = await render(<LessonCard {...base} footnote="FT-1, ISKS-1, MV-1" subgroups={['1']} />);
    const footer = card.getByText('FT-1, ISKS-1, MV-1 · Subgroup 1');
    const style = Object.assign({}, ...[footer.props.style].flat());
    expect(style.flexShrink).toBe(1);
    expect(footer.props.numberOfLines).toBe(2);
  });
});
