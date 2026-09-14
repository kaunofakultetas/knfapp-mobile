// -----------------------------------------------------------
//  [*] chatuikit — useContextMenu
//
//    const menu = useContextMenu(messages, picker, setReplyTo, { isTemp })
//    <MessageList onLongPressMessage={menu.open} menuTargetId={menu.hiddenId} … />
//    <MessageContextMenu target={pickerOpen ? menu.target : null}
//                        onOpened={menu.onOpened} onClosed={menu.onClosed} … />
//
//  The long-press menu's target and close cycle, decoupled
//  from any engine: the host hands in its reaction picker's
//  open/close pair and its reply setter, plus (optionally) an
//  `isTemp` predicate for optimistic rows that have no server
//  id yet — a sending temp has no menu, a failed one can only
//  be discarded (`isTemp`, `canAct`).
//
//  The menu aims at the long-pressed message; the LIVE row is
//  looked up each render (`message`, `target`) so reaction
//  toggles reflect while the menu is open, and its own
//  reaction (bySelf) is the ringed emoji.
//
//  The source row hides (`hiddenId`) once the floating copy is
//  on screen and reappears when the close animation ends; a
//  reply chosen in the menu (`replyTo`) is applied on close
//  too, so the composer focuses after the Modal has given the
//  window back. onClosed is the authoritative cleanup —
//  however the menu went away, no stale target or open picker
//  survives it.
//
//  Used by:
//    - hosts, between MessageList and MessageContextMenu
// -----------------------------------------------------------

import { useCallback, useRef, useState } from 'react';

import type { ContextTarget, KitMessage } from '../core/types';







// -----------------------------------------------------------
// useContextMenu
// -----------------------------------------------------------
//
// Everything derives from the one target: the live row, the
// ringed emoji, temp/canAct — recomputed every render, so a
// reaction landing while the menu is open shows at once.
//
// Used by:
//   - app/(main)/chat-room/index.tsx — between MessageList
//     and MessageContextMenu
// -----------------------------------------------------------

export function useContextMenu(
  messages: KitMessage[],
  // The host's reaction picker; these two members must be
  // referentially stable (the memoised handlers key on them)
  picker: { openPicker: (messageId: string) => void; closePicker: () => void },
  setReplyTo: (message: KitMessage) => void,
  { isTemp = () => false }: { isTemp?: (id: string) => boolean } = {},
) {

  const { openPicker, closePicker } = picker;
  const [target, setTarget] = useState<ContextTarget | null>(null);
  const [hiddenId, setHiddenId] = useState<string | null>(null);


  const message = target ? messages.find((m) => m.id === target.message.id) ?? null : null;
  const liveTarget = target && message ? { ...target, message } : null;
  const selectedEmoji = message?.reactions.find((r) => r.bySelf)?.emoji ?? null;
  const temp = !!message && isTemp(message.id);
  const canAct = !!message && !temp && !message.deleted;


  const open = useCallback(
    (next: ContextTarget) => {
      // No 'sending' guard here — the list's canAct is where that
      // invariant is actually enforced, before the long-press
      // ever reaches this handler
      setTarget(next);
      openPicker(next.message.id);
    },
    [openPicker],
  );
  const close = useCallback(() => {
    setTarget(null);
    closePicker();
  }, [closePicker]);


  const pendingReplyRef = useRef<KitMessage | null>(null);
  const onOpened = useCallback((id: string) => setHiddenId(id), []);
  const onClosed = useCallback(() => {
    setHiddenId(null);
    setTarget(null);
    closePicker();
    if (pendingReplyRef.current) {
      setReplyTo(pendingReplyRef.current);
      pendingReplyRef.current = null;
    }
  }, [setReplyTo, closePicker]);
  const replyTo = useCallback(
    (m: KitMessage) => {
      pendingReplyRef.current = m;
      close();
    },
    [close],
  );


  return { message, target: liveTarget, selectedEmoji, isTemp: temp, canAct, hiddenId, open, close, onOpened, onClosed, replyTo };
}
