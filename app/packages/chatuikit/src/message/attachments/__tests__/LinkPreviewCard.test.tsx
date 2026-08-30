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
import LinkPreviewCard from '../LinkPreviewCard';

const labels = defaultLabels.en;
const card = { url: 'https://knf.vu.lt/naujienos', title: 'Naujienos', description: 'Fakulteto naujienos', siteName: 'knf.vu.lt', imageUrl: '/api/uploads/p.jpg' };

describe('LinkPreviewCard', () => {
  it('shows site, title, description and opens the link', async () => {
    const onPress = jest.fn();
    const { getByText, getByLabelText } = await render(
      <ChatUiKitProvider locale="en" resolveImageUrl={(p) => `https://host${p}`}>
        <LinkPreviewCard preview={card} own={false} labels={labels} onPress={onPress} />
      </ChatUiKitProvider>,
    );
    expect(getByText('knf.vu.lt')).toBeTruthy();
    expect(getByText('Naujienos')).toBeTruthy();
    expect(getByText('Fakulteto naujienos')).toBeTruthy();
    await fireEvent.press(getByLabelText('Link preview: Naujienos'));
    expect(onPress).toHaveBeenCalledWith('https://knf.vu.lt/naujienos');
  });

  it('renders under a text bubble once the message carries a preview, never on an unsent one', async () => {
    const noop = () => {};
    const base: KitMessage = { id: 'm', senderId: 'u2', senderName: 'Ona', text: 'see https://knf.vu.lt/naujienos', createdAt: '2026-08-27T10:00:00Z', isOwn: false, status: 'read', reactions: [], linkPreview: card };
    const props = { position: 'single' as const, showSender: false, avatarSlot: 'none' as const, timeRevealed: false, showStatus: false, highlighted: false, animateIn: false, hidden: false, canAct: true, canReply: true, labels, onPress: noop, onLongPress: noop, onSwipeReply: noop, onPressQuote: noop, onPressImage: noop, onPressReactions: noop, onRetry: noop, onPressLink: noop };
    const withCard = await render(<ChatUiKitProvider locale="en"><MessageBubble {...props} message={base} /></ChatUiKitProvider>);
    expect(withCard.getByTestId('chatuikit-link-preview')).toBeTruthy();
    const unsent = await render(<ChatUiKitProvider locale="en"><MessageBubble {...props} message={{ ...base, deleted: true, text: '' }} /></ChatUiKitProvider>);
    expect(unsent.queryByTestId('chatuikit-link-preview')).toBeNull();
  });
});
