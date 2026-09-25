// -----------------------------------------------------------
//  [*] Tests — the 44pt touch floor the kit writes down
//
//  Every short control reaches 44pt on its short axis through
//  its own size plus its hitSlop (KNF-164 / KNF-186): the
//  mention chip, the voice note's send disc, the unread jump
//  pill, the reaction row. The reaction pills also follow the
//  LIVE font scale instead of the one in force at bundle load.
// -----------------------------------------------------------

// The live window metrics, steerable per test (RN's own jest
// setup pins fontScale at 2)
const mockWindow = { width: 390, height: 800, scale: 3, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: () => mockWindow }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), selectionAsync: jest.fn(async () => {}), notificationAsync: jest.fn(async () => {}), ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' } }));

import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Composer from '../composer/Composer';
import UnreadPill from '../list/UnreadPill';
import ReactionPills from '../message/ReactionPills';
import { ChatUiKitProvider } from '../provider';


// Safe-area metrics of a notched 390pt phone
const METRICS = { insets: { top: 0, bottom: 34, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 390, height: 800 } };
// The composer's required props, all inert
const composerBase = {
  onSend: noop, onQuickLike: noop, onAttachMedia: noop, onToggleEmoji: noop, emojiOpen: false,
  uploadingMedia: false, replyTo: null, onCancelReply: noop, onChangeText: noop,
};

// The shapes a Pressable's hitSlop takes
type Slop = number | { top?: number; bottom?: number; left?: number; right?: number } | undefined;







// -----------------------------------------------------------
// noop
// -----------------------------------------------------------
//
// The inert handler every required callback gets.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function noop() {}







// -----------------------------------------------------------
// wrap
// -----------------------------------------------------------
//
// Renders under the safe-area and kit providers, English.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function wrap(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={METRICS}><ChatUiKitProvider locale="en">{ui}</ChatUiKitProvider></SafeAreaProvider>);
}







// -----------------------------------------------------------
// vertical
// -----------------------------------------------------------
//
// The target a slop adds on the vertical axis (both sides).
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function vertical(slop: Slop) {
  return typeof slop === 'number' ? slop * 2 : (slop?.top ?? 0) + (slop?.bottom ?? 0);
}







// -----------------------------------------------------------
// horizontal
// -----------------------------------------------------------
//
// The target a slop adds on the horizontal axis (both sides).
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function horizontal(slop: Slop) {
  return typeof slop === 'number' ? slop * 2 : (slop?.left ?? 0) + (slop?.right ?? 0);
}


describe('the 44pt floor', () => {
  it('a mention chip reaches 44pt tall through its slop', async () => {
    const { getByTestId } = await wrap(<Composer {...composerBase} value="@O" mentionCandidates={[{ id: 'u2', name: 'Ona' }]} />);
    const chip = getByTestId('chatuikit-mention-pick-u2');
    const style = StyleSheet.flatten(chip.props.style) as { paddingVertical: number };
    // A 22pt portrait between the vertical padding
    expect(22 + style.paddingVertical * 2 + vertical(chip.props.hitSlop)).toBeGreaterThanOrEqual(44);
  });

  it('the voice note send disc reaches 44pt like its cancel sibling', async () => {
    const { getByTestId } = await wrap(<Composer {...composerBase} value="" recording={{ elapsedSeconds: 3 }} onStartRecording={noop} onStopRecording={noop} onCancelRecording={noop} />);
    const send = getByTestId('chatuikit-recording-send');
    const style = StyleSheet.flatten(send.props.style) as { width: number; height: number };
    expect(style.height + vertical(send.props.hitSlop)).toBeGreaterThanOrEqual(44);
    expect(style.width + horizontal(send.props.hitSlop)).toBeGreaterThanOrEqual(44);
  });

  it('the unread jump pill reaches 44pt tall', async () => {
    const { getByLabelText } = await wrap(<UnreadPill label="3 new messages" onPress={noop} onDismiss={noop} />);
    const pill = getByLabelText('3 new messages');
    const style = StyleSheet.flatten(pill.props.style) as { height: number };
    expect(style.height + vertical(pill.props.hitSlop)).toBeGreaterThanOrEqual(44);
  });
});


describe('ReactionPills and the live font scale', () => {
  afterEach(() => {
    mockWindow.fontScale = 1;
  });

  const pillHeight = async (fontScale: number) => {
    mockWindow.fontScale = fontScale;
    const { getByTestId } = await wrap(<ReactionPills reactions={[{ emoji: '👍', count: 2, bySelf: false, byUserIds: ['a', 'b'] }]} own={false} label="Reactions" onPress={noop} />);
    return (StyleSheet.flatten(getByTestId('chatuikit-reaction-👍').props.style) as { height: number }).height;
  };

  it('grows with the CURRENT text size, clamped', async () => {
    expect(await pillHeight(1)).toBe(22);
    expect(await pillHeight(1.3)).toBe(29);
    expect(await pillHeight(3)).toBe(35);
  });

  it('the row stays a 44pt target at the default size', async () => {
    const { getByLabelText } = await wrap(<ReactionPills reactions={[{ emoji: '👍', count: 1, bySelf: false, byUserIds: ['a'] }]} own={false} label="Reactions" onPress={noop} />);
    const row = getByLabelText('Reactions: 👍 1');
    expect(22 + vertical(row.props.hitSlop)).toBeGreaterThanOrEqual(44);
  });
});
