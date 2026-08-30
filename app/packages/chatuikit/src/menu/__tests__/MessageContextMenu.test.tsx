// -----------------------------------------------------------
//  [*] Tests — the context menu stays on the screen
//
//  The regression that shipped with the host-action rows: the
//  stack clamp used to count only Reply / Copy / Delete, so a
//  long menu on a LOW message ran past the bottom edge. The
//  clamp now measures the SAME rows the card renders, and a
//  menu taller than the room left is capped and scrolls.
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

import { render } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import type { ContextTarget, KitMessage, KitMessageAction } from '../../core/types';
import { ChatUiKitProvider } from '../../provider';
import MessageContextMenu from '../MessageContextMenu';

const noop = () => {};
const message: KitMessage = { id: 'm1', senderId: 'u2', senderName: 'Ona', text: 'labas', createdAt: '2026-08-27T10:00:00Z', isOwn: false, status: 'read', reactions: [] };
const actions: KitMessageAction[] = ['edit', 'report', 'pin', 'forward', 'seen'].map((id) => ({
  id, label: id, icon: 'flag-outline' as const, onPress: noop,
}));

const menuProps = {
  reactionOptions: ['👍', '❤️'],
  selectedEmoji: null,
  canReact: true,
  canReply: true,
  canDelete: true,
  onReact: noop,
  onClearReaction: noop,
  onReply: noop,
  onCopy: noop,
  onDelete: noop,
  onClose: noop,
  actions,
};

const wrap = (ui: React.ReactElement) => render(<ChatUiKitProvider locale="en">{ui}</ChatUiKitProvider>);

// ROW_HEIGHT / EDGE / MENU_GAP mirrors — the card's own geometry
const ROW_HEIGHT = 46;
const EDGE = 12;

describe('MessageContextMenu', () => {
  it('keeps a long menu on a low message inside the screen', async () => {
    const { height: windowHeight } = Dimensions.get('window');
    // A short bubble sitting right above the composer
    const target: ContextTarget = { message, frame: { x: 16, y: windowHeight - 120, width: 200, height: 40 } };
    const { getByTestId } = await wrap(<MessageContextMenu {...menuProps} target={target} />);
    const card = getByTestId('chatuikit-context-menu');
    const style = StyleSheet.flatten(card.props.style);
    // 8 rows render: reply + copy + 5 host actions + delete
    const scroller = card.props.children;
    const menuHeight = StyleSheet.flatten(scroller.props.style).maxHeight as number;
    expect(menuHeight).toBe(8 * ROW_HEIGHT);
    expect((style.top as number) + menuHeight).toBeLessThanOrEqual(windowHeight - EDGE);
  });

  it('caps a menu taller than the room left and lets it scroll', async () => {
    const many: KitMessageAction[] = Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, label: `a${i}`, icon: 'flag-outline' as const, onPress: noop }));
    const target: ContextTarget = { message, frame: { x: 16, y: 300, width: 200, height: 40 } };
    const { getByTestId } = await wrap(<MessageContextMenu {...menuProps} actions={many} target={target} />);
    const { height: windowHeight } = Dimensions.get('window');
    const card = getByTestId('chatuikit-context-menu');
    const scroller = card.props.children;
    const scrollerStyle = StyleSheet.flatten(scroller.props.style);
    expect(scrollerStyle.maxHeight as number).toBeLessThan(32 * ROW_HEIGHT);
    expect(scroller.props.scrollEnabled).toBe(true);
    const style = StyleSheet.flatten(card.props.style);
    expect((style.top as number) + (scrollerStyle.maxHeight as number)).toBeLessThanOrEqual(windowHeight - EDGE);
  });
});
