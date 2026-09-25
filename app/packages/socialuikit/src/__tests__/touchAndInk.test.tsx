// -----------------------------------------------------------
//  [*] Tests — the kit's touch floor and its text ink
//
//  Two rules the kit states in its own comments and now keeps
//  mechanically: every press target reaches the 44pt floor
//  (a slim face plus hitSlop is fine — KNF-186 named the
//  connect pill, the new-posts pill, the comment send disc
//  and the poll submit), and brand-coloured TEXT is drawn in
//  the brandText token, which clears WCAG AA on the dark
//  ground where the fill burgundy (~3.5:1) does not.
// -----------------------------------------------------------

import { fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import CommentComposer from '../comments/CommentComposer';
import CommentRow from '../comments/CommentRow';
import GapRow from '../feed/GapRow';
import NewPostsPill from '../feed/NewPostsPill';
import PollBlock from '../poll/PollBlock';
import { SocialUiKitProvider } from '../provider';
import { darkTheme, defaultTheme } from '../provider/theme';
import ConnectButton from '../social/ConnectButton';
import type { KitPoll } from '../core/types';


// A frozen safe-area frame — the composer reads real insets
const METRICS = { insets: { top: 0, bottom: 0, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 390, height: 800 } };

// A five-option multi-choice poll — the fold and the submit
// capsule both show
const poll: KitPoll = {
  id: 'poll-1',
  question: 'Kur?',
  options: ['A', 'B', 'C', 'D', 'E'].map((text, i) => ({ id: `o${i}`, text, voteCount: i, votedByMe: false })),
  answerType: 'multiple',
  totalVotes: 10,
  closed: false,
  votedByMe: false,
};







// -----------------------------------------------------------
// wrap
// -----------------------------------------------------------
//
// One kit component under the safe-area frame and a provider
// in the given scheme (English labels for readable queries).
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const wrap = (ui: ReactElement, scheme: 'light' | 'dark' = 'light') =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <SocialUiKitProvider locale="en" scheme={scheme}>
        {ui}
      </SocialUiKitProvider>
    </SafeAreaProvider>,
  );







// -----------------------------------------------------------
// reach
// -----------------------------------------------------------
//
// The vertical reach of a press target: its declared height
// (or the given face height for text-sized targets) plus the
// slop above and below.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const reach = (node: { props: { style?: unknown; hitSlop?: unknown } }, faceHeight?: number): number => {
  const style = StyleSheet.flatten(node.props.style as never) as { height?: number; minHeight?: number } | undefined;
  const face = style?.height ?? style?.minHeight ?? faceHeight ?? 0;
  const slop = node.props.hitSlop;
  const extra = typeof slop === 'number' ? 2 * slop : slop && typeof slop === 'object' ? ((slop as { top?: number }).top ?? 0) + ((slop as { bottom?: number }).bottom ?? 0) : 0;
  return face + extra;
};







// -----------------------------------------------------------
// luminance
// -----------------------------------------------------------
//
// WCAG relative luminance of a #rrggbb colour.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};







// -----------------------------------------------------------
// contrast
// -----------------------------------------------------------
//
// WCAG contrast ratio of two #rrggbb colours.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};



describe('the 44pt touch floor', () => {
  it('the connect pills and the new-posts pill reach it through their slop', async () => {
    const connect = await wrap(<ConnectButton state="incoming" onAction={() => {}} />);
    expect(reach(connect.getByTestId('socialuikit-connect-accept'))).toBeGreaterThanOrEqual(44);
    expect(reach(connect.getByTestId('socialuikit-connect-decline'))).toBeGreaterThanOrEqual(44);

    const pill = await wrap(<NewPostsPill count={3} onPress={() => {}} />);
    expect(reach(pill.getByTestId('socialuikit-new-posts-pill'))).toBeGreaterThanOrEqual(44);
  });

  it('the comment send disc, the sign-in pill and the gap chip reach it', async () => {
    const composer = await wrap(<CommentComposer canComment onSubmit={async () => true} />);
    expect(reach(composer.getByTestId('socialuikit-comment-send'))).toBeGreaterThanOrEqual(44);

    // ~30dp face: 7 + 13pt text line + 7
    const locked = await wrap(<CommentComposer canComment={false} onSubmit={async () => true} />);
    expect(reach(locked.getByRole('button', { name: 'Sign in' }), 30)).toBeGreaterThanOrEqual(44);

    // ~28dp chip: 6 + 13pt text line + 6
    const gap = await wrap(<GapRow onPress={() => {}} />);
    expect(reach(gap.getByTestId('socialuikit-gap-row'), 28)).toBeGreaterThanOrEqual(44);
  });

  it("the poll's submit and its slim text links reach it", async () => {
    const r = await wrap(<PollBlock poll={poll} canVote onVote={() => {}} onRefreshResults={() => {}} />);
    // The submit capsule is 40dp tall
    expect(reach(r.getByRole('button', { name: 'Vote' }))).toBeGreaterThanOrEqual(44);
    // 'Show 1 more option' — 8 + 13pt line + 8
    expect(reach(r.getByTestId('socialuikit-poll-more'), 32)).toBeGreaterThanOrEqual(44);
    // 'See results' — 4 + 13pt line + 4
    expect(reach(r.getByRole('button', { name: 'See results' }), 24)).toBeGreaterThanOrEqual(44);
    await fireEvent.press(r.getByRole('button', { name: 'See results' }));
    expect(reach(r.getByRole('button', { name: 'Refresh results' }), 24)).toBeGreaterThanOrEqual(44);
  });
});


describe('brand ink as text', () => {
  it('the dark theme carries a text token that clears AA where the fill does not', () => {
    expect(contrast(darkTheme.colors.brand, darkTheme.colors.surface)).toBeLessThan(4.5);
    expect(contrast(darkTheme.colors.brandText, darkTheme.colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkTheme.colors.brandText, darkTheme.colors.brandSoft)).toBeGreaterThanOrEqual(4.5);
    // Light mode is unchanged — the fill is already legible text
    expect(defaultTheme.colors.brandText).toBe(defaultTheme.colors.brand);
  });

  it("a comment author's name is drawn in the text token", async () => {
    const r = await wrap(
      <CommentRow comment={{ id: 'c1', author: { id: 'u1', displayName: 'Ona' }, text: 'Labas', createdAt: '2026-08-30T12:34:00Z', isOwn: true }} />,
      'dark',
    );
    expect(StyleSheet.flatten(r.getByText('Ona').props.style).color).toBe(darkTheme.colors.brandText);
  });
});
