// -----------------------------------------------------------
//  [*] chatuikit tests — the room machinery hooks
//
//  The contracts a host leans on: the timeline's unread line
//  is fixed from the first page and never moves, a jump
//  scrolls-or-anchors and reports the two failure modes, the
//  context menu's close cycle applies the pending reply and
//  cleans up however the menu went away, and the emoji strip
//  hands back exactly what was tapped.
// -----------------------------------------------------------

import React, { createRef } from 'react';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';

import EmojiQuickRow, { DEFAULT_QUICK_EMOJI } from '../../composer/EmojiQuickRow';
import { useContextMenu } from '../useContextMenu';
import { useJumpToMessage } from '../useJumpToMessage';
import { useTimeline } from '../useTimeline';
import type { ContextTarget, KitMessage } from '../../core/types';
import type { MessageListHandle } from '../../list/MessageList';


// A minimal live-looking row; newest-first like a real list
const row = (id: string, extra: Partial<KitMessage> = {}): KitMessage => ({
  id,
  text: `text-${id}`,
  senderId: 'u2',
  senderName: 'Ona',
  createdAt: '2026-09-13T10:00:00.000Z',
  isOwn: false,
  status: 'sent',
  reactions: [],
  ...extra,
});

const LABELS = { today: 'Šiandien', yesterday: 'Vakar', locale: 'lt' };


describe('useTimeline', () => {
  it('fixes the unread line from the first page and never moves it', async () => {
    const first = [row('m3'), row('m2'), row('m1')];
    const hook = await renderHook(
      ({ messages }: { messages: KitMessage[] }) => useTimeline(messages, false, 2, LABELS),
      { initialProps: { messages: first } },
    );

    // Newest-first: 2 unread → the 2nd newest row opens the stretch
    expect(hook.result.current.unreadMarker).toEqual({ firstUnreadId: 'm2', count: 2 });

    // New rows arrive — the marker must not move
    await hook.rerender({ messages: [row('m4'), ...first] });
    expect(hook.result.current.unreadMarker).toEqual({ firstUnreadId: 'm2', count: 2 });
    // And the rows made it into the timeline
    expect(hook.result.current.timeline.length).toBeGreaterThanOrEqual(4);
  });

  it('reads nothing into a room opened with no unread', async () => {
    const hook = await renderHook(() => useTimeline([row('m1')], false, 0, LABELS));
    expect(hook.result.current.unreadMarker).toBeNull();
  });
});


describe('useJumpToMessage', () => {
  it('highlights straight away when the row is already loaded', async () => {
    const listRef = createRef<MessageListHandle>();
    (listRef as { current: MessageListHandle | null }).current = { scrollToMessage: jest.fn(() => true) } as unknown as MessageListHandle;
    const jumpTo = jest.fn();

    const hook = await renderHook(() => useJumpToMessage(listRef, jumpTo));
    await act(async () => hook.result.current.jumpToMessage('m1'));

    expect(hook.result.current.highlightedId).toBe('m1');
    expect(jumpTo).not.toHaveBeenCalled();
  });

  it('anchors an unloaded target, retries the scroll, then highlights', async () => {
    // The first scroll misses (not loaded); after the anchor
    // lands the retry succeeds
    const scrollToMessage = jest.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const listRef = createRef<MessageListHandle>();
    (listRef as { current: MessageListHandle | null }).current = { scrollToMessage } as unknown as MessageListHandle;
    const jumpTo = jest.fn(async () => 'anchored');

    const hook = await renderHook(() => useJumpToMessage(listRef, jumpTo));
    await act(async () => hook.result.current.jumpToMessage('m9'));

    expect(jumpTo).toHaveBeenCalledWith('m9');
    expect(hook.result.current.highlightedId).toBe('m9');
    expect(hook.result.current.jumping).toBe(false);
  });

  it('reports a missing target to the host and never highlights', async () => {
    const listRef = createRef<MessageListHandle>();
    (listRef as { current: MessageListHandle | null }).current = { scrollToMessage: jest.fn(() => false) } as unknown as MessageListHandle;
    const onMissing = jest.fn();

    const hook = await renderHook(() =>
      useJumpToMessage(listRef, async () => 'missing', { onMissing }),
    );
    await act(async () => hook.result.current.jumpToMessage('gone'));

    expect(onMissing).toHaveBeenCalledTimes(1);
    expect(hook.result.current.highlightedId).toBeNull();
  });
});


describe('useContextMenu', () => {
  const target = (m: KitMessage): ContextTarget => ({ message: m, frame: { x: 0, y: 0, width: 100, height: 40 } } as unknown as ContextTarget);

  it('opens the picker on open, follows the LIVE row, and cleans up on close', async () => {
    const picker = { openPicker: jest.fn(), closePicker: jest.fn() };
    const setReplyTo = jest.fn();
    const messages = [row('m1')];

    const hook = await renderHook(
      ({ rows }: { rows: KitMessage[] }) => useContextMenu(rows, picker, setReplyTo),
      { initialProps: { rows: messages } },
    );

    await act(async () => hook.result.current.open(target(messages[0])));
    expect(picker.openPicker).toHaveBeenCalledWith('m1');
    expect(hook.result.current.canAct).toBe(true);

    // A reaction lands while the menu is open — the live lookup sees it
    await hook.rerender({ rows: [row('m1', { reactions: [{ emoji: '❤️', count: 1, bySelf: true, byUserIds: ['u1'] }] })] });
    expect(hook.result.current.selectedEmoji).toBe('❤️');

    // The close cycle: hidden while floating, cleanup on closed
    await act(async () => hook.result.current.onOpened('m1'));
    expect(hook.result.current.hiddenId).toBe('m1');
    await act(async () => hook.result.current.onClosed());
    expect(hook.result.current.hiddenId).toBeNull();
    expect(hook.result.current.target).toBeNull();
    expect(picker.closePicker).toHaveBeenCalled();
  });

  it('applies a reply chosen in the menu only after the close animation', async () => {
    const picker = { openPicker: jest.fn(), closePicker: jest.fn() };
    const setReplyTo = jest.fn();
    const m = row('m1');

    const hook = await renderHook(() => useContextMenu([m], picker, setReplyTo));
    await act(async () => hook.result.current.open(target(m)));
    await act(async () => hook.result.current.replyTo(m));
    expect(setReplyTo).not.toHaveBeenCalled();

    await act(async () => hook.result.current.onClosed());
    expect(setReplyTo).toHaveBeenCalledWith(m);
  });

  it('marks temps through the injected predicate', async () => {
    const picker = { openPicker: jest.fn(), closePicker: jest.fn() };
    const m = row('temp-1', { status: 'failed' });

    const hook = await renderHook(() =>
      useContextMenu([m], picker, jest.fn(), { isTemp: (id) => id.startsWith('temp-') }),
    );
    await act(async () => hook.result.current.open(target(m)));
    expect(hook.result.current.isTemp).toBe(true);
    expect(hook.result.current.canAct).toBe(false);
  });
});


describe('EmojiQuickRow', () => {
  it('renders the stock set and hands back the tapped emoji', async () => {
    const onPick = jest.fn();
    const screen = await render(<EmojiQuickRow onPick={onPick} />);

    const first = await screen.findByLabelText(DEFAULT_QUICK_EMOJI[0]);
    fireEvent.press(first);
    expect(onPick).toHaveBeenCalledWith(DEFAULT_QUICK_EMOJI[0]);
  });
});
