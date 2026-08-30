// -----------------------------------------------------------
//  [*] Tests — chatuikit MessageList behaviour
//
//  The list driven by synthetic scroll events: the empty state,
//  the onEndReached misfire guard, the scroll-to-latest button
//  and the at-latest report, the list-level accessibility
//  action, the scrollToIndex retry that ends in onJumpFailed,
//  and the autoscroll threshold lifted while the menu is open.
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
import MessageList, { type MessageListHandle } from '../MessageList';
import { createRef } from 'react';


const BASE = Date.UTC(2026, 7, 27, 10, 0, 0);
const msg = (id: string, i: number, own = false): KitMessage => ({
  id, senderId: own ? 'me' : 'u2', senderName: own ? 'Me' : 'Ona', text: `m${i}`, createdAt: new Date(BASE + i * 1000).toISOString(),
  isOwn: own, status: 'read', reactions: [],
});
const rows = (n: number) => buildTimeline(Array.from({ length: n }, (_, i) => msg(`m${i}`, n - i)), { today: 'Today', yesterday: 'Yesterday', locale: 'en' });
const noop = () => {};
const props = {
  typing: null, isGroup: false, showAvatars: true, intro: null, loadingOlder: false, hasMore: false, onLoadOlder: noop,
  revealedId: null, highlightedId: null, menuTargetId: null, canAct: () => true, canReply: () => true,
  onPressMessage: noop, onLongPressMessage: noop, onSwipeReply: noop, onPressQuote: noop, onPressImage: noop, onPressReactions: noop, onRetry: noop, onPressLink: noop,
};
const scroll = (list: Parameters<typeof fireEvent.scroll>[0], y: number) =>
  fireEvent.scroll(list, { nativeEvent: { contentOffset: { y, x: 0 }, contentSize: { height: 4000, width: 390 }, layoutMeasurement: { height: 700, width: 390 } } });
const wrap = (ui: React.ReactElement) => render(<ChatUiKitProvider locale="en">{ui}</ChatUiKitProvider>);


describe('MessageList', () => {
  it('shows the empty state only once history is known to be empty', async () => {
    const empty = await wrap(<MessageList {...props} items={[]} />);
    expect(empty.getByTestId('chatuikit-empty')).toBeTruthy();
    expect(empty.getByText('No messages yet — say hello')).toBeTruthy();
    const loading = await wrap(<MessageList {...props} items={[]} loadingOlder />);
    expect(loading.queryByTestId('chatuikit-empty')).toBeNull();
    const filled = await wrap(<MessageList {...props} items={rows(2)} />);
    expect(filled.queryByTestId('chatuikit-empty')).toBeNull();
  });

  it('ignores an onEndReached that fires with a non-positive distance', async () => {
    const onLoadOlder = jest.fn();
    const { getByTestId } = await wrap(<MessageList {...props} items={rows(3)} hasMore onLoadOlder={onLoadOlder} />);
    const list = getByTestId('chatuikit-message-list');
    await act(async () => list.props.onEndReached({ distanceFromEnd: 0 }));
    await act(async () => list.props.onEndReached({ distanceFromEnd: -12 }));
    expect(onLoadOlder).not.toHaveBeenCalled();
    await act(async () => list.props.onEndReached({ distanceFromEnd: 40 }));
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it('reports leaving and reaching the newest end, shows the button away, and jumps back through the accessibility action', async () => {
    const onAtLatestChange = jest.fn();
    const { getByTestId, queryByRole, getByRole } = await wrap(<MessageList {...props} items={rows(30)} onAtLatestChange={onAtLatestChange} />);
    const list = getByTestId('chatuikit-message-list');
    const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
    expect(queryByRole('button', { name: 'Latest messages' })).toBeNull();
    await scroll(list, 600);
    expect(onAtLatestChange).toHaveBeenLastCalledWith(false);
    expect(getByRole('button', { name: 'Latest messages' })).toBeTruthy();
    expect(list.props.accessibilityActions).toEqual([{ name: 'scrollToLatest', label: 'Latest messages' }]);
    await act(async () => list.props.onAccessibilityAction({ nativeEvent: { actionName: 'scrollToLatest' } }));
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
    expect(onAtLatestChange).toHaveBeenLastCalledWith(true);
    expect(queryByRole('button', { name: 'Latest messages' })).toBeNull();
    scrollToOffset.mockRestore();
  });

  it('retries an unmeasured scrollToIndex by climbing the frontier and ends in onJumpFailed', async () => {
    jest.useFakeTimers();
    const onJumpFailed = jest.fn();
    const ref = createRef<MessageListHandle>();
    const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => {});
    const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
    const { getByTestId } = await wrap(<MessageList {...props} ref={ref} items={rows(50)} onJumpFailed={onJumpFailed} />);
    const list = getByTestId('chatuikit-message-list');
    expect(ref.current?.scrollToMessage('m0')).toBe(true);
    expect(ref.current?.scrollToMessage('nope')).toBe(false);
    for (let i = 0; i < 13; i++) {
      await act(async () => list.props.onScrollToIndexFailed({ index: 40, highestMeasuredFrameIndex: 10, averageItemLength: 60 }));
      await act(async () => {
        jest.advanceTimersByTime(130);
      });
    }
    expect(scrollToIndex).toHaveBeenCalledWith({ index: 10, animated: false });
    expect(onJumpFailed).toHaveBeenCalledTimes(1);
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 2400, animated: false });
    scrollToIndex.mockRestore();
    scrollToOffset.mockRestore();
    jest.useRealTimers();
  });

  it('lifts the autoscroll threshold while the context menu floats over a row, and passes extra FlatList props through', async () => {
    const { getByTestId, rerender } = await wrap(<MessageList {...props} items={rows(3)} flatListProps={{ testID: 'host-list' }} />);
    expect(getByTestId('host-list').props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0, autoscrollToTopThreshold: 240 });
    await rerender(<ChatUiKitProvider locale="en"><MessageList {...props} items={rows(3)} menuTargetId="m1" /></ChatUiKitProvider>);
    expect(getByTestId('chatuikit-message-list').props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0, autoscrollToTopThreshold: undefined });
  });
});
