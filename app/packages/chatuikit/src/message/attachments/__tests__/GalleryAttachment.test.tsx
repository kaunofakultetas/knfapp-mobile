// -----------------------------------------------------------
//  [*] Tests — chatuikit GalleryAttachment
//
//  The tiled album: pair / hero-over-pair layouts, the "+N"
//  wash past four photos, per-tile taps handing the index up,
//  the spoken count, and the bubble rendering the grid for a
//  multi-photo message while a lone photo keeps the classic
//  full-bleed path.
// -----------------------------------------------------------

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-gesture-handler', () => {
  const builder = () => {
    const gesture: Record<string, unknown> = {};
    const chain = () => gesture;
    for (const method of ['enabled', 'activeOffsetX', 'failOffsetY', 'onBegin', 'onStart', 'onUpdate', 'onEnd', 'onFinalize', 'minDistance', 'hitSlop']) gesture[method] = chain;
    return gesture;
  };
  return { Gesture: { Pan: builder, Tap: builder, LongPress: builder }, GestureDetector: ({ children }: { children: unknown }) => children };
});
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), selectionAsync: jest.fn(async () => {}), ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' } }));

import { fireEvent, render } from '@testing-library/react-native';

import type { KitMessage } from '../../../core/types';
import { ChatUiKitProvider } from '../../../provider';
import { defaultLabels } from '../../../provider/labels';
import MessageBubble from '../../MessageBubble';
import GalleryAttachment from '../GalleryAttachment';

const labels = defaultLabels.en;
const items = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `/api/uploads/g${i}.jpg`, width: 800, height: 600 }));

describe('GalleryAttachment', () => {
  it('tiles a pair, hands the tapped index up and speaks the count', async () => {
    const onPressItem = jest.fn();
    const { getByTestId, getByLabelText, queryByTestId } = await render(
      <ChatUiKitProvider locale="en" resolveImageUrl={(p) => `https://host${p}`}>
        <GalleryAttachment items={items(2)} labels={labels} onPressItem={onPressItem} />
      </ChatUiKitProvider>,
    );
    expect(getByLabelText('Album, 2 photos')).toBeTruthy();
    expect(queryByTestId('chatuikit-gallery-more')).toBeNull();
    await fireEvent.press(getByTestId('chatuikit-gallery-tile-1'));
    expect(onPressItem).toHaveBeenCalledWith(1);
  });

  it('past four photos the last tile carries the +N wash', async () => {
    const { getByText, getByTestId, queryByTestId } = await render(
      <ChatUiKitProvider locale="en" resolveImageUrl={(p) => `https://host${p}`}>
        <GalleryAttachment items={items(7)} labels={labels} onPressItem={() => {}} />
      </ChatUiKitProvider>,
    );
    expect(getByText('+3')).toBeTruthy();
    expect(getByTestId('chatuikit-gallery-tile-3')).toBeTruthy();
    expect(queryByTestId('chatuikit-gallery-tile-4')).toBeNull();
  });

  it('a multi-photo message renders the grid; a lone photo keeps the classic path', async () => {
    const noop = () => {};
    const base: KitMessage = { id: 'm', senderId: 'u2', senderName: 'Ona', text: '', createdAt: '2026-08-27T10:00:00Z', isOwn: false, status: 'read', reactions: [], kind: 'image', gallery: items(3) };
    const props = { position: 'single' as const, showSender: false, avatarSlot: 'none' as const, timeRevealed: false, showStatus: false, highlighted: false, animateIn: false, hidden: false, canAct: true, canReply: true, labels, onPress: noop, onLongPress: noop, onSwipeReply: noop, onPressQuote: noop, onPressImage: noop, onPressReactions: noop, onRetry: noop, onPressLink: noop };
    const grid = await render(<ChatUiKitProvider locale="en"><MessageBubble {...props} message={base} /></ChatUiKitProvider>);
    expect(grid.getByTestId('chatuikit-gallery')).toBeTruthy();
    const lone = await render(<ChatUiKitProvider locale="en"><MessageBubble {...props} message={{ ...base, gallery: undefined, imageUrl: '/api/uploads/one.jpg' }} /></ChatUiKitProvider>);
    expect(lone.queryByTestId('chatuikit-gallery')).toBeNull();
    expect(lone.getByTestId('chatuikit-image')).toBeTruthy();
    // Unsent rows show the placeholder, never a grid
    const unsent = await render(<ChatUiKitProvider locale="en"><MessageBubble {...props} message={{ ...base, deleted: true }} /></ChatUiKitProvider>);
    expect(unsent.queryByTestId('chatuikit-gallery')).toBeNull();
  });
});
