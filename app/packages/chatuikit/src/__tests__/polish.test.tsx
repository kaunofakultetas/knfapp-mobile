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


// The kit's own English wording
const labels = defaultLabels.en;
// Safe-area metrics of a notched 390pt phone
const METRICS = { insets: { top: 0, bottom: 34, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 390, height: 800 } };
// The bubble's required props, all inert
const bubbleProps = {
  position: 'single' as const, showSender: false, avatarSlot: 'none' as const, timeRevealed: false, showStatus: false, highlighted: false, animateIn: false, hidden: false,
  canAct: true, canReply: true, labels, onPress: noop, onLongPress: noop, onSwipeReply: noop, onPressQuote: noop, onPressImage: noop, onPressReactions: noop, onRetry: noop, onPressLink: noop,
};







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
// Renders under the safe-area and kit providers, English,
// with optional slot components.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function wrap(ui: React.ReactElement, components?: Record<string, unknown>) {
  return render(<SafeAreaProvider initialMetrics={METRICS}><ChatUiKitProvider locale="en" components={components as never}>{ui}</ChatUiKitProvider></SafeAreaProvider>);
}







// -----------------------------------------------------------
// message
// -----------------------------------------------------------
//
// A foreign row with overrides.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function message(over: Partial<KitMessage> = {}): KitMessage {
  return { id: 'm1', senderId: 'u2', senderName: 'Ona', text: 'labas', createdAt: '2026-08-27T10:00:00Z', isOwn: false, status: 'read', reactions: [], ...over };
}

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

describe('Composer attachment tray', () => {
  const base = {
    onChangeText: noop, onSend: noop, onQuickLike: noop, onAttachMedia: noop, onAttachFile: noop,
    onToggleEmoji: noop, emojiOpen: false, uploadingMedia: false, replyTo: null, onCancelReply: noop,
  };

  it('the camera lives in the tray — reachable with or without a draft — and a pick closes the tray', async () => {
    const onAttachCamera = jest.fn();
    for (const value of ['', 'labas']) {
      const view = await wrap(<Composer {...base} value={value} onAttachCamera={onAttachCamera} />);
      expect(view.queryByTestId('chatuikit-camera')).toBeNull();
      await fireEvent.press(view.getByTestId('chatuikit-attach-toggle'));
      await fireEvent.press(view.getByTestId('chatuikit-camera'));
      expect(view.queryByTestId('chatuikit-attach-tray')).toBeNull();
    }
    expect(onAttachCamera).toHaveBeenCalledTimes(2);
  });

  it('offers exactly what the host wires, and speaks the long labels', async () => {
    const onToggleMemes = jest.fn();
    const view = await wrap(<Composer {...base} value="" onAttachFile={undefined} onToggleMemes={onToggleMemes} memesOpen={false} />);
    await fireEvent.press(view.getByTestId('chatuikit-attach-toggle'));
    expect(view.getByRole('button', { name: 'Attach a photo or video' })).toBeTruthy();
    expect(view.queryByTestId('chatuikit-attach-file')).toBeNull();
    expect(view.queryByTestId('chatuikit-camera')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Meme library' }));
    expect(onToggleMemes).toHaveBeenCalledTimes(1);
  });

  it('the mic shows only while nothing is typed; the field keeps the emoji toggle alone', async () => {
    const withMic = { ...base, onStartRecording: noop, onStopRecording: noop, onCancelRecording: noop };
    const empty = await wrap(<Composer {...withMic} value="" onToggleMemes={noop} onAttachCamera={noop} />);
    expect(empty.getByRole('button', { name: 'Record a voice message' })).toBeTruthy();
    // The in-field camera and meme badge are gone — the tray has them
    expect(empty.queryByTestId('chatuikit-memes-toggle')).toBeNull();
    const typed = await wrap(<Composer {...withMic} value="labas" />);
    expect(typed.queryByRole('button', { name: 'Record a voice message' })).toBeNull();
  });

  it('opening the tray closes the emoji row and the meme panel', async () => {
    const onToggleEmoji = jest.fn();
    const onToggleMemes = jest.fn();
    const view = await wrap(<Composer {...base} value="" emojiOpen onToggleEmoji={onToggleEmoji} onToggleMemes={onToggleMemes} memesOpen />);
    await fireEvent.press(view.getByTestId('chatuikit-attach-toggle'));
    expect(onToggleEmoji).toHaveBeenCalledTimes(1);
    expect(onToggleMemes).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('chatuikit-attach-tray')).toBeTruthy();
  });
});
