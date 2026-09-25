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


// The anchor every row's stamp counts from
const BASE = Date.UTC(2026, 7, 27, 10, 0, 0);
// The list's required props, all inert
const props = {
  typing: null, isGroup: false, showAvatars: true, intro: null, loadingOlder: false, hasMore: false, onLoadOlder: noop,
  revealedId: null, highlightedId: null, menuTargetId: null, canAct: () => true, canReply: () => true,
  onPressMessage: noop, onLongPressMessage: noop, onSwipeReply: noop, onPressQuote: noop, onPressImage: noop, onPressReactions: noop, onRetry: noop, onPressLink: noop,
};







// -----------------------------------------------------------
// msg
// -----------------------------------------------------------
//
// A foreign row i seconds past BASE.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function msg(id: string, i: number): KitMessage {
  return {
    id, senderId: 'u2', senderName: 'Ona', text: `m${i}`, createdAt: new Date(BASE + i * 1000).toISOString(),
    isOwn: false, status: 'read', reactions: [],
  };
}







// -----------------------------------------------------------
// rows
// -----------------------------------------------------------
//
// n rows as the timeline builds them, newest first.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function rows(n: number) {
  return buildTimeline(Array.from({ length: n }, (_, i) => msg(`m${i}`, n - i)), { today: 'Today', yesterday: 'Yesterday', locale: 'en' });
}







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
// Renders under the kit's provider, English.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function wrap(ui: React.ReactElement) {
  return render(<ChatUiKitProvider locale="en">{ui}</ChatUiKitProvider>);
}

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


// KNF-097: the floating day pill names the TOPMOST visible row —
// the highest index while inverted, the LOWEST while upright
describe('MessageList floating day by orientation', () => {
  const DAY = 86_400_000;
  // Two rows from yesterday, two from today, newest first —
  // anchored on LOCAL noon, so the day labels never flip with
  // the hour the suite happens to run at
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  const at = (ms: number) => new Date(ms).toISOString();
  const boundary = () =>
    buildTimeline(
      [
        { ...msg('today-2', 0), createdAt: at(noon.getTime() + 60_000) },
        { ...msg('today-1', 0), createdAt: at(noon.getTime()) },
        { ...msg('yest-2', 0), createdAt: at(noon.getTime() - DAY + 60_000) },
        { ...msg('yest-1', 0), createdAt: at(noon.getTime() - DAY) },
      ],
      { today: 'Today', yesterday: 'Yesterday', locale: 'en' },
    );

  const pillAfter = async (readerOn: boolean, visibleIds: string[]) => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(readerOn);
    const { Text } = require('react-native');
    const pill: { label?: string } = {};
    const FloatingDay = ({ label }: { label: string }) => {
      pill.label = label;
      return <Text>{label}</Text>;
    };
    const { getByTestId } = await render(
      <ChatUiKitProvider locale="en" components={{ FloatingDay }}>
        <MessageList {...props} items={boundary()} />
      </ChatUiKitProvider>,
    );
    await act(async () => {});
    const list = getByTestId('chatuikit-message-list');
    const data = list.props.data as { type: string; message?: KitMessage }[];
    const tokens = data
      .map((item, index) => ({ item, index, key: String(index), isViewable: true }))
      .filter((token) => token.item.type === 'message' && visibleIds.includes(token.item.message?.id ?? ''));
    await act(async () => {
      list.props.viewabilityConfigCallbackPairs[0].onViewableItemsChanged({ viewableItems: tokens, changed: tokens });
    });
    return pill.label;
  };

  it('upright, the pill names the top row (yesterday), not the bottom one', async () => {
    // Viewport from yest-1 at the top down to today-1 at the bottom
    expect(await pillAfter(true, ['yest-1', 'yest-2', 'today-1'])).toBe('Yesterday');
  });

  it('inverted, the highest index is still the top row', async () => {
    expect(await pillAfter(false, ['yest-1', 'yest-2', 'today-1'])).toBe('Yesterday');
  });
});
