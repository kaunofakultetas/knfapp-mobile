// -----------------------------------------------------------
//  [*] Tests — the polish batch
//
//  ConnectionBanner's three states, PinnedBanner's cycle, the
//  forwarded marker, the upload-progress bar, the disappearing
//  glyph, the composer's camera shortcut, and the bubble guard
//  that turns a crashing custom renderer into the unsupported
//  row instead of a dead list.
// -----------------------------------------------------------

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), selectionAsync: jest.fn(async () => {}), notificationAsync: jest.fn(async () => {}), ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' } }));
jest.mock('react-native-gesture-handler', () => {
  const builder = () => {
    const gesture: Record<string, unknown> = {};
    const chain = () => gesture;
    for (const method of ['enabled', 'activeOffsetX', 'failOffsetY', 'onBegin', 'onStart', 'onUpdate', 'onEnd', 'onFinalize', 'minDistance', 'hitSlop']) gesture[method] = chain;
    return gesture;
  };
  return { Gesture: { Pan: builder, Tap: builder, LongPress: builder }, GestureDetector: ({ children }: { children: unknown }) => children };
});

import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Composer from '../composer/Composer';
import type { KitMessage } from '../core/types';
import ConnectionBanner from '../list/ConnectionBanner';
import PinnedBanner from '../list/PinnedBanner';
import MessageBubble from '../message/MessageBubble';
import { ChatUiKitProvider } from '../provider';
import { defaultLabels } from '../provider/labels';

const labels = defaultLabels.en;
const noop = () => {};
const METRICS = { insets: { top: 0, bottom: 34, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 390, height: 800 } };
const wrap = (ui: React.ReactElement, components?: Record<string, unknown>) =>
  render(<SafeAreaProvider initialMetrics={METRICS}><ChatUiKitProvider locale="en" components={components as never}>{ui}</ChatUiKitProvider></SafeAreaProvider>);

const message = (over: Partial<KitMessage> = {}): KitMessage => ({
  id: 'm1', senderId: 'u2', senderName: 'Ona', text: 'labas', createdAt: '2026-08-27T10:00:00Z', isOwn: false, status: 'read', reactions: [], ...over,
});
const bubbleProps = {
  position: 'single' as const, showSender: false, avatarSlot: 'none' as const, timeRevealed: false, showStatus: false, highlighted: false, animateIn: false, hidden: false,
  canAct: true, canReply: true, labels, onPress: noop, onLongPress: noop, onSwipeReply: noop, onPressQuote: noop, onPressImage: noop, onPressReactions: noop, onRetry: noop, onPressLink: noop,
};

describe('ConnectionBanner', () => {
  it('draws each state and nothing for null', async () => {
    const connecting = await wrap(<ConnectionBanner state="connecting" />);
    expect(connecting.getByText('Connecting…')).toBeTruthy();
    const offline = await wrap(<ConnectionBanner state="offline" />);
    expect(offline.getByText('No connection')).toBeTruthy();
    const quiet = await wrap(<ConnectionBanner state={null} />);
    expect(quiet.queryByTestId('chatuikit-connection')).toBeNull();
  });
});

describe('PinnedBanner', () => {
  it('shows the newest pin and cycles on tap, handing each shown pin up', async () => {
    const onPress = jest.fn();
    const pins = [message({ id: 'p1', text: 'first pin' }), message({ id: 'p2', text: 'second pin' })];
    const { getByTestId } = await wrap(<PinnedBanner pins={pins} onPress={onPress} />);
    expect(getByTestId('chatuikit-pinned-snippet').props.children).toBe('first pin');
    expect(getByTestId('chatuikit-pinned-count').props.children).toBe('1/2');
    await fireEvent.press(getByTestId('chatuikit-pinned-banner'));
    expect(onPress).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'p1' }));
    expect(getByTestId('chatuikit-pinned-snippet').props.children).toBe('second pin');
    await fireEvent.press(getByTestId('chatuikit-pinned-banner'));
    expect(onPress).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'p2' }));
    expect(getByTestId('chatuikit-pinned-snippet').props.children).toBe('first pin');
  });
});

describe('Bubble marks', () => {
  it('draws the forwarded row, the progress bar and the disappearing glyph', async () => {
    const forwarded = await wrap(<MessageBubble {...bubbleProps} message={message({ forwarded: true })} />);
    expect(forwarded.getByTestId('chatuikit-forwarded')).toBeTruthy();
    expect(forwarded.getByText('Forwarded')).toBeTruthy();

    const sending = await wrap(<MessageBubble {...bubbleProps} message={message({ isOwn: true, status: 'sending', uploadProgress: 0.45 })} />);
    expect(sending.getByTestId('chatuikit-upload-progress-fill').props.style.width).toBe('45%');

    const burning = await wrap(<MessageBubble {...bubbleProps} message={message({ expiresAt: '2026-08-27T11:00:00Z' })} timeRevealed />);
    expect(burning.getByTestId('chatuikit-expiry')).toBeTruthy();
  });

  it('a crashing custom renderer degrades to the unsupported row, not a dead list', async () => {
    const Bomb = () => {
      throw new Error('boom');
    };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { getByText } = await wrap(
      <MessageBubble {...bubbleProps} message={message({ kind: 'custom', custom: { x: 1 } })} />,
      { MessageBody: Bomb },
    );
    expect(getByText(labels.unsupportedMessage)).toBeTruthy();
    spy.mockRestore();
    warn.mockRestore();
  });
});

describe('Composer camera shortcut', () => {
  const base = {
    onChangeText: noop, onSend: noop, onQuickLike: noop, onAttachMedia: noop, onAttachFile: noop,
    onToggleEmoji: noop, emojiOpen: false, uploadingMedia: false, replyTo: null, onCancelReply: noop,
  };

  it('fires while the field is empty and steps aside once text arrives', async () => {
    const onAttachCamera = jest.fn();
    const empty = await wrap(<Composer {...base} value="" onAttachCamera={onAttachCamera} />);
    await fireEvent.press(empty.getByTestId('chatuikit-camera'));
    expect(onAttachCamera).toHaveBeenCalledTimes(1);
    const typed = await wrap(<Composer {...base} value="labas" onAttachCamera={onAttachCamera} />);
    expect(typed.queryByTestId('chatuikit-camera')).toBeNull();
  });
});
