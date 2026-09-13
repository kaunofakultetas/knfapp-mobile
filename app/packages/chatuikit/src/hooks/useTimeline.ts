// -----------------------------------------------------------
//  [*] chatuikit — useTimeline
//
//    const { timeline, unreadMarker } =
//      useTimeline(messages, hasMore, unreadCount, labels, { isActive })
//
//  buildTimeline as a live hook: the kit's rows from the
//  message list — grouped runs, time separators, day labels
//  and the "new messages" line — kept current through two
//  behaviors a bare buildTimeline call cannot carry:
//
//    - the day key ticks over at midnight (only while
//      `isActive`, and the immediate tick catches a midnight
//      that passed while the room sat inactive), so "Today"
//      becomes "Yesterday" in a room left open;
//    - the unread stretch is FIXED once from the first loaded
//      page: the room opened with N unread and the list is
//      newest-first, so the Nth newest loaded row is the
//      oldest unread one — messages sent or received
//      afterwards must not move the line. The marker is
//      handed back for the list's own `unread` prop.
//
//  hasMore rides along so the timeline can suppress the false
//  "pause" separator above the oldest LOADED message while
//  older history still exists server-side.
//
//  Used by:
//    - hosts, feeding MessageList `items` + `unread`
// -----------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';

import { buildTimeline, type TimelineLabels } from '../core/timeline';
import type { KitMessage } from '../core/types';


// How often the day rolls over for the "Today" stamps
const DAY_TICK_MS = 60_000;







// -----------------------------------------------------------
// UnreadMarker
// -----------------------------------------------------------
//
// The fixed unread stretch: the oldest unread row's id and the
// count — what MessageList's `unread` prop wants.
//
// Used by:
//   - useTimeline (below) — the `unreadMarker` it returns
//   - exported through the kit's barrel for hosts
// -----------------------------------------------------------

export interface UnreadMarker {
  firstUnreadId: string;
  count: number;
}







// -----------------------------------------------------------
// useTimeline
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/chat-room/index.tsx — feeds MessageList
//     `items` + `unread`
// -----------------------------------------------------------

export function useTimeline(
  messages: KitMessage[],
  hasMore: boolean,
  unreadCount: number,
  labels: TimelineLabels,
  { isActive = true }: { isActive?: boolean } = {},
) {

  const [dayKey, setDayKey] = useState(() => new Date().toDateString());
  useEffect(() => {
    if (!isActive) return;
    const tick = () => {
      const next = new Date().toDateString();
      setDayKey((current) => (current === next ? current : next));
    };
    tick();
    const timer = setInterval(tick, DAY_TICK_MS);
    return () => clearInterval(timer);
  }, [isActive]);


  const unreadMarkerRef = useRef<UnreadMarker | null>(null);
  const [unreadMarker, setUnreadMarker] = useState<UnreadMarker | null>(null);
  useEffect(() => {
    if (unreadMarkerRef.current || unreadCount <= 0 || messages.length === 0) return;
    const index = Math.min(unreadCount, messages.length) - 1;
    const marker = { firstUnreadId: messages[index].id, count: unreadCount };
    unreadMarkerRef.current = marker;
    setUnreadMarker(marker);
  }, [messages, unreadCount]);


  const timeline = useMemo(
    () =>
      buildTimeline(messages, labels, hasMore, {
        unreadFromId: unreadMarker?.firstUnreadId,
        unreadCount: unreadMarker?.count,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dayKey forces the relabel
    [messages, labels, hasMore, dayKey, unreadMarker],
  );


  return { timeline, unreadMarker };
}
