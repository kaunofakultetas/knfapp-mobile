// -----------------------------------------------------------
//  [*] Tests — chatuikit MessageList, the detached window
//
//  A jump deep into history detaches the list from the head
//  (hasNewer): the forward paging row appears at the visual
//  bottom, onStartReached pulls the next page, and the
//  jump-back button is forced with the engine's missed count,
//  its press routed through onReturnToLatest.
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
import { FlatList } from 'react-native';

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


describe('MessageList detached window', () => {
  it('shows the forward paging row while detached; a tap and onStartReached pull the next page', async () => {
    const onLoadNewer = jest.fn();
    const attached = await wrap(<MessageList {...props} items={rows(5)} onLoadNewer={onLoadNewer} />);
    expect(attached.queryByTestId('chatuikit-load-newer')).toBeNull();
    await act(async () => attached.getByTestId('chatuikit-message-list').props.onStartReached({ distanceFromStart: 40 }));
    expect(onLoadNewer).not.toHaveBeenCalled();

    const detached = await wrap(<MessageList {...props} items={rows(5)} hasNewer onLoadNewer={onLoadNewer} />);
    await fireEvent.press(detached.getByTestId('chatuikit-load-newer'));
    expect(onLoadNewer).toHaveBeenCalledTimes(1);
    // The mount misfire guard holds for the forward edge too
    const list = detached.getByTestId('chatuikit-message-list');
    await act(async () => list.props.onStartReached({ distanceFromStart: 0 }));
    expect(onLoadNewer).toHaveBeenCalledTimes(1);
    await act(async () => list.props.onStartReached({ distanceFromStart: 40 }));
    expect(onLoadNewer).toHaveBeenCalledTimes(2);
  });

  it('replaces the row with the spinner while the forward page loads', async () => {
    const { queryByTestId } = await wrap(<MessageList {...props} items={rows(5)} hasNewer loadingNewer onLoadNewer={noop} />);
    expect(queryByTestId('chatuikit-load-newer')).toBeNull();
  });

  it('forces the jump-back button with the missed count and routes its press through onReturnToLatest', async () => {
    const onReturnToLatest = jest.fn();
    const { getByRole } = await wrap(<MessageList {...props} items={rows(5)} hasNewer missedCount={3} onReturnToLatest={onReturnToLatest} />);
    const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
    // No scrolling happened — the button is there purely because
    // the window is detached, badged with the engine's count
    const button = getByRole('button', { name: '3 new messages' });
    await fireEvent.press(button);
    expect(onReturnToLatest).toHaveBeenCalledTimes(1);
    scrollToOffset.mockRestore();
  });
});
