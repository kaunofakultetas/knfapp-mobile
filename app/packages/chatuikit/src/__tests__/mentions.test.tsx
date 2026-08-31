// -----------------------------------------------------------
//  [*] Tests — mentions in the UI
//
//  The composer's @-completion strip (appears on an @ token at
//  the cursor, filters by fold, a pick replaces the token with
//  the full name) and the bubble's highlighted mention run
//  whose tap hands the member's name up.
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
import MessageBubble from '../message/MessageBubble';
import { ChatUiKitProvider } from '../provider';
import { defaultLabels } from '../provider/labels';

const labels = defaultLabels.en;
const CANDIDATES = [
  { id: 'u2', name: 'Ona' },
  { id: 'u3', name: 'Onaitė Petraitė' },
  { id: 'u4', name: 'Jonas' },
];
const METRICS = { insets: { top: 0, bottom: 34, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 390, height: 800 } };
const wrap = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={METRICS}><ChatUiKitProvider locale="en">{ui}</ChatUiKitProvider></SafeAreaProvider>);

const noop = () => {};
const composerBase = {
  onSend: noop, onQuickLike: noop, onAttachMedia: noop, onAttachFile: noop,
  onToggleEmoji: noop, emojiOpen: false, uploadingMedia: false, replyTo: null, onCancelReply: noop,
  mentionCandidates: CANDIDATES,
};

describe('Composer mention strip', () => {
  it('appears on an @ token, filters diacritic-insensitively, and a pick replaces the token', async () => {
    const onChangeText = jest.fn();
    const idle = await wrap(<Composer {...composerBase} value="labas" onChangeText={onChangeText} />);
    expect(idle.queryByTestId('chatuikit-mentions')).toBeNull();

    const open = await wrap(<Composer {...composerBase} value="labas @onai" onChangeText={onChangeText} />);
    expect(open.getByTestId('chatuikit-mentions')).toBeTruthy();
    expect(open.queryByTestId('chatuikit-mention-pick-u4')).toBeNull();
    await fireEvent.press(open.getByTestId('chatuikit-mention-pick-u3'));
    expect(onChangeText).toHaveBeenCalledWith('labas @Onaitė Petraitė ');
  });

  it('completes names in any script — Cyrillic, CJK, Lithuanian', async () => {
    const onChangeText = jest.fn();
    const world = [
      { id: 'u5', name: 'Тест Иванов' },
      { id: 'u6', name: '測試用戶' },
      { id: 'u7', name: 'Žydrūnė' },
    ];
    const cyr = await wrap(<Composer {...composerBase} mentionCandidates={world} value="@тест" onChangeText={onChangeText} />);
    await fireEvent.press(cyr.getByTestId('chatuikit-mention-pick-u5'));
    expect(onChangeText).toHaveBeenCalledWith('@Тест Иванов ');

    const cjk = await wrap(<Composer {...composerBase} mentionCandidates={world} value="labas @測" onChangeText={onChangeText} />);
    expect(cjk.getByTestId('chatuikit-mention-pick-u6')).toBeTruthy();

    // Diacritic-folded: zy finds Žydrūnė
    const lt = await wrap(<Composer {...composerBase} mentionCandidates={world} value="@zy" onChangeText={onChangeText} />);
    expect(lt.getByTestId('chatuikit-mention-pick-u7')).toBeTruthy();
  });

  it('offers every member on a bare @ and never opens mid-word', async () => {
    const bare = await wrap(<Composer {...composerBase} value="@" onChangeText={noop} />);
    expect(bare.getByTestId('chatuikit-mention-pick-u2')).toBeTruthy();
    expect(bare.getByTestId('chatuikit-mention-pick-u4')).toBeTruthy();
    const glued = await wrap(<Composer {...composerBase} value="ona@knf" onChangeText={noop} />);
    expect(glued.queryByTestId('chatuikit-mentions')).toBeNull();
  });
});

describe('Mention in the bubble', () => {
  it('highlights the run and hands the tapped name up with its message', async () => {
    const onPressMention = jest.fn();
    const message: KitMessage = { id: 'm1', senderId: 'u2', senderName: 'Ona', text: 'klausk @Jonas rytoj', createdAt: '2026-08-27T10:00:00Z', isOwn: false, status: 'read', reactions: [] };
    const props = { position: 'single' as const, showSender: false, avatarSlot: 'none' as const, timeRevealed: false, showStatus: false, highlighted: false, animateIn: false, hidden: false, canAct: true, canReply: true, labels, onPress: noop, onLongPress: noop, onSwipeReply: noop, onPressQuote: noop, onPressImage: noop, onPressReactions: noop, onRetry: noop, onPressLink: noop };
    const { getByTestId } = await wrap(
      <MessageBubble {...props} message={message} mentionNames={CANDIDATES.map((c) => c.name)} onPressMention={onPressMention} />,
    );
    await fireEvent.press(getByTestId('chatuikit-mention'));
    expect(onPressMention).toHaveBeenCalledWith('Jonas', message);
  });
});
