// -----------------------------------------------------------
//  [*] chatengine — usePins
//
//  The room's pinned messages for the banner: fetched once,
//  refetched whenever a pin flips (the 'updated' event with
//  pinnedAt in its patch — the pinner's own client included),
//  pruned live when a pinned row is unsent, and pruned by the
//  clock when a pinned disappearing message lapses (the server
//  keeps a lapsed pin out of the fetch on its own; this keeps
//  the BANNER honest between fetches, exactly as the room's
//  list does for its rows). pin/unpin call the transport and
//  let the socket echo move the list, so every member
//  converges the same way; failures rethrow for the host's
//  toast. A transport without the optional pin trio answers an
//  empty, `supported: false` result — the banner simply never
//  draws.
//
//  Used by:
//    - the host's chat room (the pinned banner + menu actions)
// -----------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';

import { normalizeForViewer } from '../core/reducers';
import { parseStamp } from '../core/time';
import type { ChatMessage } from '../core/types';
import { useChatEngine } from '../provider';


// The longest one timer sleeps before it re-arms — a deadline
// weeks away must never overflow the timer's 32-bit millisecond
// range into an immediate fire
const MAX_TIMER_MS = 24 * 60 * 60 * 1000;







// -----------------------------------------------------------
// UsePinsResult
// -----------------------------------------------------------
//
// The pinned list and its verbs.
//
// Used by:
//   - usePins (below) — the return shape
// -----------------------------------------------------------

export interface UsePinsResult {
  // Newest pin first, at most what the backend caps (20 here)
  pins: ChatMessage[];
  pin: (messageId: string) => Promise<void>;
  unpin: (messageId: string) => Promise<void>;
  // False when the transport does not offer pins — hide the UI
  supported: boolean;
}







// -----------------------------------------------------------
// deadlineOf
// -----------------------------------------------------------
//
// A pinned row's expiry as epoch ms, or null when it has none
// or its stamp cannot be parsed (such a row always lives).
// Stamps parse through parseStamp, so the backend's bare UTC
// form and a zoned one compare alike.
//
// Used by:
//   - livePins (below)
// -----------------------------------------------------------

function deadlineOf(row: ChatMessage): number | null {
  const stamp = parseStamp(row.expiresAt);
  return stamp ? stamp.getTime() : null;
}







// -----------------------------------------------------------
// livePins
// -----------------------------------------------------------
//
//   livePins(rows, Date.now()) → the rows whose expiresAt has
//     not passed (a row without one always lives)
//
// The one expiry predicate the banner applies — on every
// fetch and on the timer tick. Stamps parse through
// parseStamp, so the backend's bare UTC form and a zoned one
// compare alike; an unparseable stamp keeps its row (the
// server sweeps on its own clock anyway).
//
// Used by:
//   - usePins (below) — the fetch and the deadline timer
// -----------------------------------------------------------

function livePins(rows: ChatMessage[], nowMs: number): ChatMessage[] {
  return rows.filter((row) => {
    const deadline = deadlineOf(row);
    return deadline === null || deadline > nowMs;
  });
}







// -----------------------------------------------------------
// usePins
// -----------------------------------------------------------
//
//   const { pins, pin, unpin, supported } = usePins(roomId)
//     — pin/unpin rethrow on failure for the host's toast;
//       supported is false when the transport has no pin trio
//
// Used by:
//   - app/(main)/chat-room/index.tsx — the pinned banner and
//     the message menu's pin / unpin actions
// -----------------------------------------------------------

export function usePins(conversationId: string): UsePinsResult {

  const { transport, currentUser } = useChatEngine();
  const [pins, setPins] = useState<ChatMessage[]>([]);
  // Bumped by a timer tick that found nothing lapsed yet (a
  // capped far deadline), so the deadline effect below re-arms
  const [sweep, setSweep] = useState(0);


  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);


  // The list is a convenience surface — a failed fetch keeps the
  // previous pins rather than surfacing an error. A pin already
  // past its deadline never enters the list, whatever the fetch
  // carried
  const selfId = currentUser?.id ?? '';
  const refresh = useCallback(async () => {
    if (!transport.fetchPins || !conversationId) return;
    try {
      const rows = await transport.fetchPins(conversationId);
      if (!mountedRef.current) return;
      setPins(livePins(rows.map((row) => normalizeForViewer(row, selfId)), Date.now()));
    } catch {
      // Keep what we have
    }
  }, [conversationId, transport, selfId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the room switch is the event: the old room's pins clear as the new fetch starts
    setPins([]);
    void refresh();
  }, [refresh]);


  // Pin flips ride the same patch door the link preview uses;
  // an unsent pinned row leaves the banner at once
  useEffect(
    () =>
      transport.realtime.subscribe((event) => {
        if (event.type === 'updated' && event.conversationId === conversationId && 'pinnedAt' in event.patch) void refresh();
        else if (event.type === 'deleted' && event.conversationId === conversationId) {
          setPins((prev) => (prev.some((p) => p.id === event.messageId) ? prev.filter((p) => p.id !== event.messageId) : prev));
        }
      }),
    [transport, conversationId, refresh],
  );


  // Disappearing messages: ONE timer for the soonest deadline
  // among the pins, re-armed whenever the list changes, drops
  // the pin that lapses while the banner is on screen. The
  // identity check keeps a tick that found nothing lapsed free
  // of a render; that tick bumps `sweep` so the next deadline
  // is armed
  useEffect(() => {
    const deadlines = pins.map(deadlineOf).filter((deadline): deadline is number => deadline !== null);
    if (deadlines.length === 0) return undefined;
    const delay = Math.max(0, Math.min(Math.min(...deadlines) - Date.now(), MAX_TIMER_MS));
    const timer = setTimeout(() => {
      if (!mountedRef.current) return;
      const nowMs = Date.now();
      setPins((prev) => (prev.some((p) => { const deadline = deadlineOf(p); return deadline !== null && deadline <= nowMs; }) ? livePins(prev, nowMs) : prev));
      setSweep((n) => n + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [pins, sweep]);


  const pin = useCallback(
    async (messageId: string) => {
      await transport.pinMessage?.(conversationId, messageId);
    },
    [conversationId, transport],
  );

  const unpin = useCallback(
    async (messageId: string) => {
      await transport.unpinMessage?.(conversationId, messageId);
    },
    [conversationId, transport],
  );


  return { pins, pin, unpin, supported: !!transport.fetchPins };
}
