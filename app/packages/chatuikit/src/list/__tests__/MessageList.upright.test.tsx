// -----------------------------------------------------------
//  [*] Tests — the upright list under a screen reader
//
//  With TalkBack/VoiceOver running the native list drops its
//  inversion (the scaleY transform breaks swipe order): rows
//  go oldest-first top to bottom, older history pages through
//  the explicit tap row, and the newest edge stops firing the
//  older-page loader. Without a reader everything stays
//  inverted.
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

import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { buildTimeline } from '../../core/timeline';
import type { KitMessage } from '../../core/types';
import { ChatUiKitProvider } from '../../provider';
import MessageList from '../MessageList';


const BASE = Date.UTC(2026, 7, 27, 10, 0, 0);
const msg = (id: string, i: number): KitMessage => ({
  id, senderId: 'u2', senderName: 'Ona', text: `m${i}`, createdAt: new Date(BASE + i * 1000).toISOString(),
  isOwn: false, status: 'read', reactions: [],
});
const rows = (n: number) => buildTimeline(Array.from({ length: n }, (_, i) => msg(`m${i}`, n - i)), { today: 'Today', yesterday: 'Yesterday', locale: 'en' });
const noop = () => {};
const props = {
  typing: null, isGroup: false, showAvatars: true, intro: null, loadingOlder: false, hasMore: false, onLoadOlder: noop,
  revealedId: null, highlightedId: null, menuTargetId: null, canAct: () => true, canReply: () => true,
  onPressMessage: noop, onLongPressMessage: noop, onSwipeReply: noop, onPressQuote: noop, onPressImage: noop, onPressReactions: noop, onRetry: noop, onPressLink: noop,
};
const wrap = (ui: React.ReactElement) => render(<ChatUiKitProvider locale="en">{ui}</ChatUiKitProvider>);

afterEach(() => jest.restoreAllMocks());

describe('MessageList upright under a screen reader', () => {
  it('drops the inversion and reverses the rows to oldest-first', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    const { getByTestId } = await wrap(<MessageList {...props} items={rows(3)} />);
    await act(async () => {});
    const list = getByTestId('chatuikit-message-list');
    expect(list.props.inverted).toBe(false);
    const messages = (list.props.data as { type: string; message?: KitMessage }[]).filter((r) => r.type === 'message');
    expect(messages[0].message?.text).toBe('m1');
    expect(messages[messages.length - 1].message?.text).toBe('m3');
  });

  it('pages older history through the tap row, never through the newest edge', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    const onLoadOlder = jest.fn();
    const { getByTestId, getByRole } = await wrap(<MessageList {...props} items={rows(3)} hasMore onLoadOlder={onLoadOlder} />);
    await act(async () => {});
    // Upright: the end of the list is the NEWEST edge — reaching
    // it must not pull history
    await act(async () => getByTestId('chatuikit-message-list').props.onEndReached({ distanceFromEnd: 40 }));
    expect(onLoadOlder).not.toHaveBeenCalled();
    await fireEvent.press(getByRole('button', { name: 'Older messages' }));
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it('stays inverted while no screen reader runs', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    const { getByTestId } = await wrap(<MessageList {...props} items={rows(2)} />);
    await act(async () => {});
    expect(getByTestId('chatuikit-message-list').props.inverted).toBe(true);
  });
});
