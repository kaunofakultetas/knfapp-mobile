// -----------------------------------------------------------
//  [*] chatengine — useConversation
//
//  The data spine of a chat room: loads the newest history
//  page, keeps it live through the transport's realtime
//  events, and pages older messages with the before-cursor.
//  The list is held NEWEST-FIRST — what an inverted list
//  renders — so "prepend a new message" is an unshift and
//  "load older" is an append.
//
//  Own-message echo dedupe: a backend that broadcasts a new
//  message to the whole room INCLUDING the sender races the
//  composer's response. An incoming own message first matches
//  by id, then adopts the temp bubble whose clientId equals the
//  echoed one (a content + reply-target match is the fallback
//  for backends without the nonce) — see core/reducers.ts.
//
//  Read acknowledgements are gated and batched: nothing is
//  acknowledged while the app is backgrounded or the room is
//  not the focused screen (`focused`); arrivals only mark the
//  state dirty, and the buffered acknowledgement flushes on
//  refocus AND when the reader leaves. A burst collapses into
//  one trailing emit; the realtime signal is volatile, so the
//  durable transport.markRead always rides along.
//
//  Split into:
//
//    UseConversationResult — the hook's return shape
//    useConversation       — the hook itself
// -----------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { clearActiveConversation, setActiveConversation } from '../core/activeConversation';
import { toTransportError } from '../core/errors';
import { readOutboxTemps } from '../core/outbox';
import {
  adoptTemp,
  appendOlderPage,
  applyReceipt,
  findTempFor,
  markDeleted,
  markEdited,
  mergeFirstPage,
  mergeResyncPage,
  normalizeForViewer,
  olderCursor,
  reactionsForViewer,
  restoreDeleted,
} from '../core/reducers';
import type { ChatEvent, MessagesPage } from '../core/transport';
import { isTempId, type ChatMessage, type ConversationMeta, type Participant } from '../core/types';
import { useChatEngine } from '../provider';


// After a failed older-history page, automatic retries stay
// blocked this long — a reader parked near the visual top must
// not storm a failing endpoint on every bounce
const OLDER_RETRY_BACKOFF_MS = 4000;

// A burst of arrivals collapses into one read acknowledgement
const READ_DEBOUNCE_MS = 1500;


export interface UseConversationResult {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  // senderId → displayName, from every loaded row
  participants: Record<string, string>;
  // The members with portraits (first page)
  profiles: Participant[];
  conversation: ConversationMeta | null;
  loading: boolean;
  // 'load' is retryable; 'denied' (401/403/404) is terminal —
  // the viewer lost access and only a back action helps
  error: 'load' | 'denied' | null;
  retry: () => void;
  resync: () => Promise<void>;
  // Resolves once the older page has been applied, so callers
  // (a search jump) can await successive pages
  loadOlder: () => Promise<void>;
  loadingOlder: boolean;
  hasMore: boolean;
  // Optimistic unsend; the original comes back (with a notice)
  // if the backend refuses
  deleteMessage: (messageId: string) => void;
}







// -----------------------------------------------------------
// useConversation
// -----------------------------------------------------------
//
//   const chat = useConversation(conversationId, { focused })
//
//   `focused` — whether this room is the screen being looked
//   at (a navigation focus flag); default true. Only a focused
//   room acknowledges reads and claims the active-conversation
//   marker.
//
// Used by:
//   - the host's chat room screen (directly or via useChatRoom)
// -----------------------------------------------------------

export function useConversation(conversationId: string, options: { focused?: boolean } = {}): UseConversationResult {
  const { transport, currentUser, storage, notify, onNetworkRestore } = useChatEngine();
  const focused = options.focused ?? true;


  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<Participant[]>([]);
  const profilesRef = useRef<Participant[]>([]);
  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);
  const [conversation, setConversation] = useState<ConversationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'load' | 'denied' | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);


  // Refs mirror state for reads inside long-lived event handlers
  // and async paging, where closures would be stale
  const selfIdRef = useRef<string | null>(currentUser?.id ?? null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const hasMoreRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const mountedRef = useRef(true);
  const olderFailedAtRef = useRef(0);
  const olderNotifiedRef = useRef(false);
  const conversationIdRef = useRef(conversationId);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  useEffect(() => {
    selfIdRef.current = currentUser?.id ?? null;
  }, [currentUser]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);


  // A mounted instance can be handed a DIFFERENT room (web: the
  // query changes in place without a remount) — wipe every
  // per-room state before the new fetch
  const shownConvRef = useRef(conversationId);
  useEffect(() => {
    if (shownConvRef.current === conversationId) return;
    shownConvRef.current = conversationId;
    setMessages([]);
    setParticipants({});
    setProfiles([]);
    setConversation(null);
    setError(null);
    setHasMore(false);
    hasMoreRef.current = false;
    olderFailedAtRef.current = 0;
    olderNotifiedRef.current = false;
  }, [conversationId]);


  const mergeParticipants = useCallback((rows: readonly ChatMessage[]) => {
    setParticipants((prev) => {
      let next: Record<string, string> | null = null;
      for (const m of rows) {
        if (prev[m.senderId] === m.senderName && !next) continue;
        if (!next) next = { ...prev };
        next[m.senderId] = m.senderName;
      }
      return next ?? prev;
    });
  }, []);

  const applyPage = useCallback((resp: MessagesPage) => {
    setProfiles(resp.participants);
    setConversation(resp.conversation);
  }, []);


  // Read acknowledgements — see the file header
  const focusedRef = useRef(focused);
  // Only a REPORTED background closes the gate — 'unknown' (web, a
  // cold start) and 'active' both count as looking, and so does a
  // non-string value (React Native's jest mock answers a function)
  const initialAppState: unknown = AppState.currentState;
  const appActiveRef = useRef(typeof initialAppState !== 'string' || initialAppState === 'active' || initialAppState === 'unknown');
  const readDirtyRef = useRef(false);
  const readTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushMarkRead = useCallback(() => {
    if (readTimerRef.current) {
      clearTimeout(readTimerRef.current);
      readTimerRef.current = null;
    }
    if (!conversationId || !readDirtyRef.current) return;
    if (!focusedRef.current || !appActiveRef.current) return;
    readDirtyRef.current = false;
    transport.realtime.markRead(conversationId);
    transport.markRead(conversationId).catch(() => {});
  }, [conversationId, transport]);

  const scheduleMarkRead = useCallback(() => {
    readDirtyRef.current = true;
    if (!focusedRef.current || !appActiveRef.current) return;
    if (readTimerRef.current) return;
    readTimerRef.current = setTimeout(() => {
      readTimerRef.current = null;
      flushMarkRead();
    }, READ_DEBOUNCE_MS);
  }, [flushMarkRead]);

  useEffect(() => {
    focusedRef.current = focused;
    if (focused) flushMarkRead();
    return flushMarkRead;
  }, [focused, flushMarkRead]);

  useEffect(() => {
    if (!conversationId || !focused) return;
    setActiveConversation(conversationId);
    return () => clearActiveConversation(conversationId);
  }, [conversationId, focused]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      appActiveRef.current = state === 'active';
      if (state === 'active') flushMarkRead();
    });
    return () => sub.remove();
  }, [flushMarkRead]);

  useEffect(
    () => () => {
      if (readTimerRef.current) {
        clearTimeout(readTimerRef.current);
        readTimerRef.current = null;
      }
    },
    [conversationId],
  );


  // First load per conversation (and per retry)
  useEffect(() => {
    if (!conversationId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await transport.fetchMessages(conversationId);
        if (cancelled) return;
        const selfId = selfIdRef.current;
        const page = resp.messages.map((m) => normalizeForViewer(m, selfId)).reverse();

        // Failed sends persisted by the composer come back as
        // failed temp bubbles on top of the page
        const self = resp.participants.find((p) => p.id === selfId);
        const outbox = selfId
          ? await readOutboxTemps(storage, conversationId, {
              id: selfId,
              displayName: self?.displayName ?? currentUser?.displayName ?? '',
              avatarUrl: self?.avatarUrl ?? currentUser?.avatarUrl ?? undefined,
            })
          : [];
        if (cancelled) return;

        setMessages((prev) => mergeFirstPage(prev, page, outbox, conversationId));
        setHasMore(resp.hasMore);
        hasMoreRef.current = resp.hasMore;
        mergeParticipants(page);
        applyPage(resp);
        scheduleMarkRead();
      } catch (err) {
        if (!cancelled) {
          const e = toTransportError(err);
          setError(e.status === 401 || e.status === 403 || e.status === 404 ? 'denied' : 'load');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // currentUser only seeds names on the outbox rows — a hydrating
    // session must not refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, reloadKey, transport, storage, mergeParticipants, applyPage, scheduleMarkRead]);


  // Live delivery. Registration works before connect resolves,
  // so there is no subscribe race — only the join after connect
  // needs the cancelled flag
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;

    const unsubscribe = transport.realtime.subscribe((event: ChatEvent) => {
      const selfId = selfIdRef.current;

      if (event.type === 'message') {
        const raw = event.message;
        if (raw.conversationId !== conversationId) return;
        const normalized = normalizeForViewer(
          {
            ...raw,
            // Realtime payloads may carry no portrait — the member list does
            senderAvatar: raw.senderAvatar || profilesRef.current.find((p) => p.id === raw.senderId)?.avatarUrl || undefined,
          },
          selfId,
        );
        // A live row's status is the viewer's: an own echo is freshly
        // sent (receipts promote it from here), anyone else's is read
        const incoming: ChatMessage = { ...normalized, status: normalized.isOwn ? 'sent' : 'read' };
        setMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) return prev;
          if (incoming.isOwn) {
            const i = findTempFor(prev, incoming);
            if (i >= 0) {
              const next = [...prev];
              next[i] = adoptTemp(incoming, prev[i]);
              return next;
            }
          }
          return [incoming, ...prev];
        });
        setParticipants((prev) => (prev[raw.senderId] === raw.senderName ? prev : { ...prev, [raw.senderId]: raw.senderName }));
        if (!incoming.isOwn) scheduleMarkRead();
        return;
      }

      if (event.conversationId !== conversationId) return;

      if (event.type === 'reactions') {
        setMessages((prev) =>
          prev.map((m) => (m.id === event.messageId ? { ...m, reactions: reactionsForViewer(event.reactions, selfId) } : m)),
        );
      } else if (event.type === 'deleted') {
        setMessages((prev) => prev.map((m) => markDeleted(m, event.messageId)));
      } else if (event.type === 'edited') {
        setMessages((prev) => prev.map((m) => markEdited(m, event.messageId, event.text, event.editedAt)));
      } else if (event.type === 'read') {
        if (event.readerId === selfId) return;
        const memberCount = profilesRef.current.length;
        setMessages((prev) => applyReceipt(prev, event.readerId, event.messageIds, memberCount));
      }
    });

    // Rooms created after connect are not auto-joined by every
    // backend — join explicitly once a connection exists
    void transport.realtime
      .connect()
      .then((live) => {
        if (!cancelled && live) transport.realtime.join(conversationId);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unsubscribe();
      // No leave here: closing a room keeps its live delivery for
      // the conversation list and the unread badge
    };
  }, [conversationId, transport, scheduleMarkRead]);


  // After a drop or a network restore the newest page is fetched
  // again and MERGED (core/reducers.ts mergeResyncPage). One
  // resync runs at a time; a superseded response is never applied
  const resyncingRef = useRef(false);
  const resyncSeqRef = useRef(0);
  const resync = useCallback(async () => {
    if (!conversationId) return;
    if (resyncingRef.current) return;
    resyncingRef.current = true;
    const seq = ++resyncSeqRef.current;
    try {
      const resp = await transport.fetchMessages(conversationId);
      if (!mountedRef.current || seq !== resyncSeqRef.current || conversationId !== conversationIdRef.current) return;
      const selfId = selfIdRef.current;
      const page = resp.messages.map((m) => normalizeForViewer(m, selfId)).reverse();

      // hasMore only resets on a fresh head; the authoritative gap
      // decision is re-derived from `prev` INSIDE the updater —
      // this outer mirror exists because the paging flag cannot
      // be set from within a pure updater
      const knownRows = messagesRef.current.filter((m) => !isTempId(m.id));
      const knownIds = new Set(knownRows.map((m) => m.id));
      if (knownRows.length === 0 || (resp.hasMore && !page.some((row) => knownIds.has(row.id)))) {
        setHasMore(resp.hasMore);
        hasMoreRef.current = resp.hasMore;
      }
      setMessages((prev) => mergeResyncPage(prev, page, resp.hasMore).list);
      mergeParticipants(page);
      applyPage(resp);
      scheduleMarkRead();
    } catch {
      // Silent: the live feed keeps working and the next reconnect retries
    } finally {
      resyncingRef.current = false;
    }
  }, [conversationId, transport, mergeParticipants, applyPage, scheduleMarkRead]);

  const wasDownRef = useRef(false);
  useEffect(() => {
    if (!conversationId) return;
    return transport.realtime.onStatus((status) => {
      if (status !== 'connected') {
        wasDownRef.current = true;
        return;
      }
      if (wasDownRef.current) {
        wasDownRef.current = false;
        void resync();
      }
    });
  }, [conversationId, transport, resync]);

  const resyncRef = useRef(resync);
  useEffect(() => {
    resyncRef.current = resync;
  });
  useEffect(() => onNetworkRestore(() => void resyncRef.current()), [onNetworkRestore]);


  // Older-history paging for the inverted list's onEndReached
  const loadOlder = useCallback(async () => {
    if (!conversationId) return;
    if (loadingOlderRef.current || !hasMoreRef.current) return;
    if (Date.now() - olderFailedAtRef.current < OLDER_RETRY_BACKOFF_MS) return;

    const cursor = olderCursor(messagesRef.current);
    if (!cursor) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const resp = await transport.fetchMessages(conversationId, { before: { createdAt: cursor.createdAt, id: cursor.id }, limit: 50 });
      if (!mountedRef.current || conversationId !== conversationIdRef.current) return;
      const selfId = selfIdRef.current;
      const page = resp.messages.map((m) => normalizeForViewer(m, selfId)).reverse();
      setMessages((prev) => appendOlderPage(prev, page));
      setHasMore(resp.hasMore);
      hasMoreRef.current = resp.hasMore;
      mergeParticipants(page);
      olderFailedAtRef.current = 0;
      olderNotifiedRef.current = false;
    } catch {
      if (!mountedRef.current || conversationId !== conversationIdRef.current) return;
      olderFailedAtRef.current = Date.now();
      // One notice per failing run
      if (!olderNotifiedRef.current) {
        olderNotifiedRef.current = true;
        notify({ level: 'error', code: 'load_older_failed' });
      }
    } finally {
      loadingOlderRef.current = false;
      if (mountedRef.current) setLoadingOlder(false);
    }
  }, [conversationId, transport, mergeParticipants, notify]);


  const retry = useCallback(() => setReloadKey((k) => k + 1), []);


  const deleteMessage = useCallback(
    (messageId: string) => {
      const target = messagesRef.current.find((m) => m.id === messageId);
      if (!target || target.deleted) return;
      const snapshot = messagesRef.current;
      setMessages((prev) => prev.map((m) => markDeleted(m, messageId)));
      transport.deleteMessage(conversationId, messageId).catch(() => {
        if (!mountedRef.current) return;
        setMessages((prev) => restoreDeleted(prev, snapshot, messageId));
        notify({ level: 'error', code: 'delete_failed' });
      });
    },
    [conversationId, transport, notify],
  );


  return {
    messages,
    setMessages,
    participants,
    profiles,
    conversation,
    deleteMessage,
    resync,
    loading,
    error,
    retry,
    loadOlder,
    loadingOlder,
    hasMore,
  };
}
