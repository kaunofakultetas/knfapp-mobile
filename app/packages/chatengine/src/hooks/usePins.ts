// -----------------------------------------------------------
//  [*] chatengine — usePins
//
//  The room's pinned messages for the banner: fetched once,
//  refetched whenever a pin flips (the 'updated' event with
//  pinnedAt in its patch — the pinner's own client included),
//  and pruned live when a pinned row is unsent. pin/unpin call
//  the transport and let the socket echo move the list, so
//  every member converges the same way; failures rethrow for
//  the host's toast. A transport without the optional pin trio
//  answers an empty, `supported: false` result — the banner
//  simply never draws.
//
//  Used by:
//    - the host's chat room (the pinned banner + menu actions)
// -----------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';

import { normalizeForViewer } from '../core/reducers';
import type { ChatMessage } from '../core/types';
import { useChatEngine } from '../provider';


export interface UsePinsResult {
  // Newest pin first, at most what the backend caps (20 here)
  pins: ChatMessage[];
  pin: (messageId: string) => Promise<void>;
  unpin: (messageId: string) => Promise<void>;
  // False when the transport does not offer pins — hide the UI
  supported: boolean;
}


export function usePins(conversationId: string): UsePinsResult {

  const { transport, currentUser } = useChatEngine();
  const [pins, setPins] = useState<ChatMessage[]>([]);


  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);


  // The list is a convenience surface — a failed fetch keeps the
  // previous pins rather than surfacing an error
  const refresh = useCallback(async () => {
    if (!transport.fetchPins || !conversationId) return;
    try {
      const rows = await transport.fetchPins(conversationId);
      if (!mountedRef.current) return;
      const selfId = currentUser?.id ?? '';
      setPins(rows.map((row) => normalizeForViewer(row, selfId)));
    } catch {
      // Keep what we have
    }
  }, [conversationId, transport, currentUser?.id]);

  useEffect(() => {
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
