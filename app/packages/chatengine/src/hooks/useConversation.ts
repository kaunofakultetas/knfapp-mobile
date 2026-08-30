// -----------------------------------------------------------
//  [*] chatengine — useConversation
//
//  The data spine of a chat room: loads the newest history
//  page, keeps it live through the transport's realtime
//  events, pages older messages with the before-cursor, and
//  re-anchors the window around a message beyond the loaded
//  history (jumpTo / loadNewer / returnToLatest).
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
//  not the focused screen (`focused`) or the reader is scrolled
//  up into history (`atLatest`); arrivals only mark the
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
import { isRetryable, toTransportError } from '../core/errors';
import { readOutboxTemps } from '../core/outbox';
import { getTaskQueue, type PendingTask } from '../core/tasks';
import {
  adoptTemp,
  appendOlderPage,
  applyChanges,
  applyReceipt,
  findTempFor,
  markDeleted,
  markEdited,
  mergeFirstPage,
  newerCursor,
  prependNewerPage,
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
  // Jump-to-message beyond the loaded history: the window is
  // re-anchored around the message in one round trip (the
  // transport's `around` window). 'loaded' — the row was already
  // held, nothing changed; 'anchored' — the list now holds a
  // window around it and `hasNewer` says whether the head is
  // further down; 'missing' — the message is not in this
  // conversation (or the fetch failed, with a notice)
  jumpTo: (messageId: string) => Promise<'loaded' | 'anchored' | 'missing'>;
  // Newer rows exist beyond the held window (after a jump); the
  // list is detached from the head until loadNewer walks back
  // or returnToLatest re-fetches the newest page
  hasNewer: boolean;
  loadNewer: () => Promise<void>;
  loadingNewer: boolean;
  returnToLatest: () => Promise<void>;
  // Messages that arrived at the head while the window was
  // detached — the "new messages" count for a jump-back button
  missedWhileDetached: number;
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

export function useConversation(conversationId: string, options: { focused?: boolean; atLatest?: boolean } = {}): UseConversationResult {
  const { transport, currentUser, storage, notify, onNetworkRestore } = useChatEngine();
  const focused = options.focused ?? true;
  // Whether the reader is at the newest end of the list — a room
  // being read from the middle of its history is not "read"
  // (the UI reports it: chatuikit's MessageList onAtLatestChange)
  const atLatest = options.atLatest ?? true;


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
  const [hasNewer, setHasNewer] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [missedWhileDetached, setMissedWhileDetached] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);


  // Refs mirror state for reads inside long-lived event handlers
  // and async paging, where closures would be stale
  const selfIdRef = useRef<string | null>(currentUser?.id ?? null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const hasMoreRef = useRef(false);
  const loadingOlderRef = useRef(false);
  // Detached: the held window does not reach the head (a jump
  // landed it in history). Live arrivals are counted, not
  // inserted — a row with a gap before it would misplace them
  const hasNewerRef = useRef(false);
  const loadingNewerRef = useRef(false);
  const setDetached = useCallback((next: boolean) => {
    hasNewerRef.current = next;
    setHasNewer(next);
    if (!next) setMissedWhileDetached(0);
  }, []);
  const mountedRef = useRef(true);
  const olderFailedAtRef = useRef(0);
  const olderNotifiedRef = useRef(false);
  const conversationIdRef = useRef(conversationId);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  // The change-feed cursor: the server clock of the last page or
  // feed applied (null until a page carried one)
  const changesCursorRef = useRef<string | null>(null);

  // The room's offline task queue (edits, unsends, reactions made
  // while down) — enqueued by any hook, replayed here
  const taskQueue = getTaskQueue(storage, conversationId);
  useEffect(() => {
    void taskQueue.load();
  }, [taskQueue]);
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
    setDetached(false);
    olderFailedAtRef.current = 0;
    olderNotifiedRef.current = false;
    changesCursorRef.current = null;
  }, [conversationId, setDetached]);
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
    if (resp.cursor) changesCursorRef.current = resp.cursor;
  }, []);


  // Read acknowledgements — see the file header
  const focusedRef = useRef(focused);
  const atLatestRef = useRef(atLatest);
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
    if (!focusedRef.current || !appActiveRef.current || !atLatestRef.current || hasNewerRef.current) return;
    readDirtyRef.current = false;
    transport.realtime.markRead(conversationId);
    transport.markRead(conversationId).catch(() => {});
  }, [conversationId, transport]);

  const scheduleMarkRead = useCallback(() => {
    readDirtyRef.current = true;
    if (!focusedRef.current || !appActiveRef.current || !atLatestRef.current || hasNewerRef.current) return;
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
  // Returning to the newest end acknowledges what arrived meanwhile
  useEffect(() => {
    atLatestRef.current = atLatest;
    if (atLatest) flushMarkRead();
  }, [atLatest, flushMarkRead]);

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
        if (hasNewerRef.current) {
          // Detached: the head is not held, so the row cannot be
          // placed — it is counted for the jump-back button and
          // arrives with the forward page / the fresh head
          if (!incoming.isOwn) setMissedWhileDetached((n) => n + 1);
          setParticipants((prev) => (prev[raw.senderId] === raw.senderName ? prev : { ...prev, [raw.senderId]: raw.senderName }));
          return;
        }
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
      } else if (event.type === 'updated') {
        setMessages((prev) => prev.map((m) => (m.id === event.messageId && !m.deleted ? { ...m, ...event.patch } : m)));
      } else if (event.type === 'conversation') {
        // A room setting moved (the disappearing window) — merge
        // into the meta every reader of `conversation` holds
        setConversation((prev) => (prev ? { ...prev, ...event.patch } : prev));
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
    // A detached window is history; merging the head into it would
    // yank the reader away — returnToLatest is the way back
    if (hasNewerRef.current) return;
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

      // Edits and unsends further up than the newest page: the
      // change feed since the last cursor, applied to held rows
      const since = changesCursorRef.current;
      if (transport.fetchChanges && since) {
        try {
          const changes = await transport.fetchChanges(conversationId, since);
          if (!mountedRef.current || seq !== resyncSeqRef.current || conversationId !== conversationIdRef.current) return;
          const rows = changes.messages.map((m) => normalizeForViewer(m, selfId));
          setMessages((prev) => applyChanges(prev, rows));
          changesCursorRef.current = changes.cursor;
        } catch {
          // The feed is best effort; the page cursor stands
        }
      }
      applyPage(resp);
      scheduleMarkRead();
    } catch {
      // Silent: the live feed keeps working and the next reconnect retries
    } finally {
      resyncingRef.current = false;
    }
  }, [conversationId, transport, mergeParticipants, applyPage, scheduleMarkRead]);

  // Replay the offline tasks, oldest first, one at a time: a task
  // that succeeds leaves the queue, a definitive refusal drops it
  // (the optimistic state is reverted where the server's answer
  // says so), a transport failure keeps it for the next restore
  const replayingRef = useRef(false);
  const replayTasks = useCallback(async () => {
    if (replayingRef.current) return;
    replayingRef.current = true;
    try {
      await taskQueue.load();
      for (const task of taskQueue.list()) {
        if (!mountedRef.current || conversationId !== conversationIdRef.current) return;
        try {
          if (task.type === 'edit') {
            const saved = await transport.editMessage(conversationId, task.messageId, task.text);
            setMessages((prev) => prev.map((m) => markEdited(m, task.messageId, saved.text, saved.editedAt)));
          } else if (task.type === 'delete') {
            await transport.deleteMessage(conversationId, task.messageId);
          } else {
            const groups = task.emoji ? await transport.setReaction(conversationId, task.messageId, task.emoji) : await transport.removeReaction(conversationId, task.messageId);
            const viewerId = selfIdRef.current;
            setMessages((prev) => prev.map((m) => (m.id === task.messageId ? { ...m, reactions: reactionsForViewer(groups, viewerId) } : m)));
          }
          taskQueue.remove(task);
        } catch (err) {
          if (isRetryable(err)) return;
          taskQueue.remove(task);
          if (task.type === 'edit') {
            setMessages((prev) => prev.map((m) => (m.id === task.messageId ? { ...m, text: task.previousText } : m)));
            notify({ level: 'error', code: 'edit_failed' });
          } else if (task.type === 'delete') {
            notify({ level: 'error', code: 'delete_failed' });
          } else {
            notify({ level: 'error', code: task.emoji ? 'reaction_add_failed' : 'reaction_remove_failed' });
          }
        }
      }
    } finally {
      replayingRef.current = false;
    }
  }, [conversationId, transport, taskQueue, notify]);
  const replayRef = useRef(replayTasks);
  useEffect(() => {
    replayRef.current = replayTasks;
  });

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
        void resync().then(() => replayRef.current());
      }
    });
  }, [conversationId, transport, resync]);

  const resyncRef = useRef(resync);
  useEffect(() => {
    resyncRef.current = resync;
  });
  useEffect(
    () =>
      onNetworkRestore(() => {
        void resyncRef.current().then(() => replayRef.current());
      }),
    [onNetworkRestore],
  );


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


  // Jump beyond the loaded history: one `around` window replaces
  // the held rows (temps — unsent drafts — stay in front). The
  // outer flags mirror the page's; hasNewer detaches the window
  const jumpSeqRef = useRef(0);
  const jumpTo = useCallback(
    async (messageId: string): Promise<'loaded' | 'anchored' | 'missing'> => {
      if (!conversationId) return 'missing';
      if (messagesRef.current.some((m) => m.id === messageId)) return 'loaded';
      const seq = ++jumpSeqRef.current;
      try {
        const resp = await transport.fetchMessages(conversationId, { around: messageId, limit: 50 });
        if (!mountedRef.current || seq !== jumpSeqRef.current || conversationId !== conversationIdRef.current) return 'missing';
        const selfId = selfIdRef.current;
        const page = resp.messages.map((m) => normalizeForViewer(m, selfId)).reverse();
        if (!page.some((m) => m.id === messageId)) return 'missing';
        // The anchored window supersedes any resync in flight
        resyncSeqRef.current += 1;
        setMessages((prev) => [...prev.filter((m) => isTempId(m.id)), ...page]);
        setHasMore(resp.hasMore);
        hasMoreRef.current = resp.hasMore;
        setDetached(!!resp.hasNewer);
        mergeParticipants(page);
        if (resp.cursor) changesCursorRef.current = resp.cursor;
        return 'anchored';
      } catch (err) {
        if (!mountedRef.current || seq !== jumpSeqRef.current) return 'missing';
        const e = toTransportError(err);
        if (e.status !== 404) notify({ level: 'error', code: 'load_older_failed' });
        return 'missing';
      }
    },
    [conversationId, transport, mergeParticipants, notify, setDetached],
  );
  // Forward paging from a detached window; the page that reaches
  // the head re-attaches the window and a resync catches whatever
  // landed at the head between the fetch and now
  const loadNewer = useCallback(async () => {
    if (!conversationId) return;
    if (loadingNewerRef.current || !hasNewerRef.current) return;
    const cursor = newerCursor(messagesRef.current);
    if (!cursor) return;
    loadingNewerRef.current = true;
    setLoadingNewer(true);
    try {
      const resp = await transport.fetchMessages(conversationId, { after: { createdAt: cursor.createdAt, id: cursor.id }, limit: 50 });
      if (!mountedRef.current || conversationId !== conversationIdRef.current || !hasNewerRef.current) return;
      const selfId = selfIdRef.current;
      const page = resp.messages.map((m) => normalizeForViewer(m, selfId)).reverse();
      setMessages((prev) => prependNewerPage(prev, page));
      mergeParticipants(page);
      if (resp.cursor) changesCursorRef.current = resp.cursor;
      if (!resp.hasNewer) {
        setDetached(false);
        void resyncRef.current();
        scheduleMarkRead();
      }
    } catch {
      if (!mountedRef.current || conversationId !== conversationIdRef.current) return;
      notify({ level: 'error', code: 'load_older_failed' });
    } finally {
      loadingNewerRef.current = false;
      if (mountedRef.current) setLoadingNewer(false);
    }
  }, [conversationId, transport, mergeParticipants, notify, setDetached, scheduleMarkRead]);
  // Straight back to the head: the newest page replaces the
  // detached window (temps stay), as if the room were opened afresh
  const returnToLatest = useCallback(async () => {
    if (!conversationId) return;
    if (!hasNewerRef.current) return;
    const seq = ++jumpSeqRef.current;
    try {
      const resp = await transport.fetchMessages(conversationId);
      if (!mountedRef.current || seq !== jumpSeqRef.current || conversationId !== conversationIdRef.current) return;
      const selfId = selfIdRef.current;
      const page = resp.messages.map((m) => normalizeForViewer(m, selfId)).reverse();
      setMessages((prev) => [...prev.filter((m) => isTempId(m.id)), ...page]);
      setHasMore(resp.hasMore);
      hasMoreRef.current = resp.hasMore;
      setDetached(false);
      mergeParticipants(page);
      applyPage(resp);
      scheduleMarkRead();
    } catch {
      if (!mountedRef.current || seq !== jumpSeqRef.current) return;
      notify({ level: 'error', code: 'load_older_failed' });
    }
  }, [conversationId, transport, mergeParticipants, applyPage, scheduleMarkRead, notify, setDetached]);
  // Disappearing messages: every half minute the rows whose
  // expires_at has passed leave the screen (the server hard-
  // deletes on its own clock; this one only keeps the list honest
  // between fetches). The identity check keeps quiet ticks free
  useEffect(() => {
    const timer = setInterval(() => {
      const nowIso = new Date().toISOString();
      setMessages((prev) => (prev.some((m) => m.expiresAt && m.expiresAt <= nowIso) ? prev.filter((m) => !(m.expiresAt && m.expiresAt <= nowIso)) : prev));
    }, 30_000);
    return () => clearInterval(timer);
  }, [setMessages]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);
  const deleteMessage = useCallback(
    (messageId: string) => {
      const target = messagesRef.current.find((m) => m.id === messageId);
      if (!target || target.deleted) return;
      const snapshot = messagesRef.current;
      setMessages((prev) => prev.map((m) => markDeleted(m, messageId)));
      transport.deleteMessage(conversationId, messageId).catch((err: unknown) => {
        if (!mountedRef.current) return;
        // Offline: the placeholder stays and the unsend replays on
        // restore; a refusal puts the message back
        if (isRetryable(err)) {
          taskQueue.add({ type: 'delete', messageId, at: new Date().toISOString() });
          return;
        }
        setMessages((prev) => restoreDeleted(prev, snapshot, messageId));
        notify({ level: 'error', code: 'delete_failed' });
      });
    },
    [conversationId, transport, notify, taskQueue],
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
    jumpTo,
    hasNewer,
    loadNewer,
    loadingNewer,
    returnToLatest,
    missedWhileDetached,
  };
}
