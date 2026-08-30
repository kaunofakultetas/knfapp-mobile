// -----------------------------------------------------------
//  [*] useChatMessages — history, live delivery and paging
//
//  The data spine of the chat room: loads the newest history
//  page over REST, keeps it live through the socket registry,
//  and pages older messages with the before-cursor. The list
//  is held NEWEST-FIRST — exactly what the inverted FlatList
//  in chatkit/MessageList.tsx renders — so "prepend a
//  new message" is an unshift and "load older" is an append.
//
//  Socket subscriptions go through the registry helpers in
//  services/socket.ts, which register synchronously even
//  while the socket is null — so listeners exist before the
//  async connect resolves and cleanup can never race it. The
//  connect promise is only awaited to emit join_conversation
//  (rooms created after socket connect are not auto-joined by
//  the backend); NO leave is emitted, on cleanup or ever — the
//  server keeps every member room joined for the whole
//  connection, which is what keeps list previews and the
//  unread badge live after the room closes.
//
//  Own-message echo dedupe: the backend broadcasts new_message
//  to the whole room INCLUDING the sender, and the composer's
//  REST response races that echo. An incoming own message
//  first matches by id, then adopts the temp bubble whose
//  clientId equals the echoed clientMsgId (a content + reply-
//  target match, newest temp first, is the fallback for rows
//  without the nonce) — whichever side lands first wins and
//  the other becomes a no-op, so the list never holds
//  duplicate keys.
//
//  Self detection uses useAuth().user through a ref — never an
//  AsyncStorage read that could still be in flight when the
//  first echo arrives.
//
//  Split into:
//
//    TEMP_ID_PREFIX        — optimistic-id marker (composer)
//    toChatMessage         — ApiMessage → ChatMessage mapper
//    readOutboxTemps       — rehydrate persisted failed sends
//    UseChatMessagesResult — the hook's return shape
//    useChatMessages       — the hook itself
// -----------------------------------------------------------

// History REST endpoints, their row shape, and the error type
// that tells a lost-access failure from a transient one
import { ApiError, deleteMessageApi, fetchMessages, markConversationRead, type ApiMessage } from '@/services/api';
import { useNetworkRestore } from '@/hooks/useNetworkRestore';
import { parseStamp } from '@/chatkit/timeline';

// The composer's persisted failed-send outbox (rehydrated on
// first load so a send that died with the app stays visible)
import AsyncStorage from '@react-native-async-storage/async-storage';

// Live delivery — registry-backed subscriptions and room emits
import {
  connectSocket,
  emitMarkRead,
  joinConversation,
  onMessageDeleted,
  onMessagesRead,
  onNewMessage,
  onSocketStatusChange,
  onReactionUpdate,
  type MessageDeletedEvent,
  type MessagesReadEvent,
  type ReactionUpdate,
  type SocketMessage,
} from '@/services/socket';

// The focused room claims the active-conversation marker so
// the unread badge never counts messages the reader is seeing
import { clearActiveConversation, setActiveConversation } from '@/hooks/chat/activeConversation';

// Self identity for echo dedupe and bySelf reaction flags
import { useAuth } from '@/context/AuthContext';

// User-facing failure toasts
import { showToast } from '@/context/NetworkContext';
import { useTranslation } from 'react-i18next';

// The unified UI message shape
import type { ChatMessage, ChatReplyRef } from '@/types';

// Read acknowledgements only fire while the app is in the
// foreground AND this screen is the focused one
import { useIsFocused } from '@react-navigation/native';
import { AppState } from 'react-native';

// State and lifecycle plumbing
import { useCallback, useEffect, useRef, useState } from 'react';







// -----------------------------------------------------------
// TEMP_ID_PREFIX
// -----------------------------------------------------------
//
// Marks optimistic messages that only exist client-side; the
// echo dedupe above and the resync merge both key
// off it.
//
// Used by:
//   - useChatMessages (below) — echo replace, resync merge
//   - hooks/chat/useChatComposer.ts — temp id minting
// -----------------------------------------------------------

export const TEMP_ID_PREFIX = 'temp-';

// The wire shape of a quoted message (api rows and socket
// payloads agree); null/undefined means "not a reply"
export type WireReply = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  imageUrl?: string | null;
  deleted: boolean;
} | null | undefined;

// A quote arrives with nullable imageUrl — the UI wants
// undefined, and a quote of an unsent message stays flagged
export const mapReply = (reply: WireReply): ChatReplyRef | undefined =>
  reply
    ? {
        id: reply.id,
        senderId: reply.senderId,
        senderName: reply.senderName,
        text: reply.text ?? '',
        imageUrl: reply.imageUrl || undefined,
        deleted: !!reply.deleted,
      }
    : undefined;







// -----------------------------------------------------------
// findTempFor / adoptTemp
// -----------------------------------------------------------
//
// The server row of an own send, whether it arrives as a socket
// echo or inside a resync page, must REPLACE the optimistic temp
// that produced it — never sit beside it. Rows that echo the
// send's clientMsgId name their temp exactly (and match nothing
// when it is gone); rows without the nonce fall back to content
// — the same text, image path AND reply target, preferring the
// temp nearest the newest end so an older failed duplicate can
// never swallow a fresh send's echo. The adopted row keeps the
// temp's key and local photo so the bubble does not remount.
//
// Used by:
//   - useChatMessages (below) — echo handler, resync merge
//   - __tests__/useChatMessages.test.ts — pure-function suite
// -----------------------------------------------------------

export function findTempFor(list: ChatMessage[], incoming: ChatMessage): number {
  // Nonce match: the echoed clientMsgId is authoritative — the
  // temp that minted it or nothing
  if (incoming.clientId) {
    return list.findIndex(
      (m) => m.id.startsWith(TEMP_ID_PREFIX) && (m.clientId ?? m.id) === incoming.clientId,
    );
  }

  // Content fallback (rows without the nonce): the list is
  // newest-first, so the front-most hit is the newest temp
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (
      m.id.startsWith(TEMP_ID_PREFIX) &&
      m.text === incoming.text &&
      (m.imageUrl ?? '') === (incoming.imageUrl ?? '') &&
      (m.replyTo?.id ?? '') === (incoming.replyTo?.id ?? '')
    ) {
      return i;
    }
  }
  return -1;
}

export function adoptTemp(incoming: ChatMessage, temp: ChatMessage): ChatMessage {
  return { ...incoming, clientId: temp.clientId ?? temp.id, localImageUri: temp.localImageUri };
}







// -----------------------------------------------------------
// toChatMessage
// -----------------------------------------------------------
//
// ApiMessage → ChatMessage. Drops the server-preformatted
// `time` field on the floor (it is UTC-wrong; display formats
// createdAt via services/format.ts) and defends against the
// backend's null text on image-only messages. The echoed
// clientMsgId (temp adoption) and readBy (receipt tracking)
// ride through.
//
// Used by:
//   - useChatMessages (below) — every REST page
// -----------------------------------------------------------

function toChatMessage(m: ApiMessage): ChatMessage {
  return {
    id: m.id,
    clientId: m.clientMsgId || undefined,
    conversationId: m.conversationId,
    senderId: m.senderId,
    senderName: m.senderName,
    senderAvatar: m.senderAvatar || undefined,
    text: m.text ?? '',
    imageUrl: m.imageUrl || undefined,
    createdAt: m.createdAt,
    isOwn: m.isOwn,
    status: m.status ?? (m.isOwn ? 'sent' : 'read'),
    readBy: m.readBy,
    reactions: m.reactions.map((r) => ({
      emoji: r.emoji,
      count: r.count,
      bySelf: r.bySelf,
      byUserIds: r.byUserIds,
    })),
    replyTo: mapReply(m.replyTo),
    deleted: !!m.deleted,
  };
}







// -----------------------------------------------------------
// readOutboxTemps
// -----------------------------------------------------------
//
// Rehydrates the composer's persisted failed-send queue
// (AsyncStorage 'outbox:<conversationId>', written by
// useChatComposer) into failed temp bubbles for the first
// page, so a send that died with the app stays visible and
// retryable. Tolerates both persisted shapes (id → payload
// object, or an entries array) and answers [] to anything
// unreadable — the outbox is a convenience, never a crash.
//
// Used by:
//   - useChatMessages (below) — first load
// -----------------------------------------------------------

type OutboxPayload = {
  text?: string;
  imageUrl?: string;
  replyToId?: string;
  createdAt?: string;
  asset?: { uri?: string };
};

async function readOutboxTemps(
  conversationId: string,
  sender: { id: string; displayName: string; avatarUrl?: string } | null,
): Promise<ChatMessage[]> {
  if (!sender) return [];
  try {
    const raw = await AsyncStorage.getItem(`outbox:${conversationId}`);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    const entries: [string, OutboxPayload][] = Array.isArray(parsed)
      ? (parsed as [string, OutboxPayload][]).filter((e) => Array.isArray(e) && typeof e[0] === 'string')
      : parsed && typeof parsed === 'object'
        ? Object.entries(parsed as Record<string, OutboxPayload>)
        : [];

    return entries
      .filter(([tempId, payload]) => tempId.startsWith(TEMP_ID_PREFIX) && !!payload && typeof payload === 'object')
      .map(([tempId, payload]) => ({
        id: tempId,
        clientId: tempId,
        conversationId,
        senderId: sender.id,
        senderName: sender.displayName,
        senderAvatar: sender.avatarUrl,
        text: typeof payload.text === 'string' ? payload.text : '',
        imageUrl: typeof payload.imageUrl === 'string' && payload.imageUrl ? payload.imageUrl : undefined,
        localImageUri: typeof payload.asset?.uri === 'string' ? payload.asset.uri : undefined,
        createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : new Date().toISOString(),
        isOwn: true,
        status: 'failed' as const,
        reactions: [],
        deleted: false,
      }));
  } catch {
    return [];
  }
}







// -----------------------------------------------------------
// UseChatMessagesResult
// -----------------------------------------------------------
//
// Used by:
//   - useChatMessages (below)
//   - app/(main)/chat-room/index.tsx — screen state typing
// -----------------------------------------------------------

// A conversation member as the history endpoint lists them —
// the room header and intro card draw avatars from this
export interface ParticipantProfile {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

const toProfile = (p: { id: string; displayName: string; avatarUrl?: string | null }): ParticipantProfile => ({
  id: p.id,
  displayName: p.displayName,
  avatarUrl: p.avatarUrl || undefined,
});

// The conversation row as GET /messages returns it — the source
// of type/title for a room opened from a push notification
export interface ConversationMeta {
  id: string;
  type: 'direct' | 'group';
  title?: string | null;
  avatarEmoji?: string | null;
}

export interface UseChatMessagesResult {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  participants: Record<string, string>;
  profiles: ParticipantProfile[];
  conversation: ConversationMeta | null;
  loading: boolean;
  // 'load' is retryable; 'denied' (401/403/404) is terminal —
  // the viewer lost access and only a back action helps
  error: 'load' | 'denied' | null;
  retry: () => void;
  resync: () => Promise<void>;
  // Resolves once the older page has been applied, so callers
  // (the in-chat search jump) can await successive pages
  loadOlder: () => Promise<void>;
  loadingOlder: boolean;
  hasMore: boolean;
  deleteMessage: (messageId: string) => void;
}







// -----------------------------------------------------------
// useChatMessages
// -----------------------------------------------------------
//
//   const {
//     messages,       — ChatMessage[], NEWEST-FIRST
//     setMessages,    — shared with composer/reactions hooks
//     participants,   — senderId → displayName map
//     profiles,       — members with avatars (first page)
//     loading, error, retry
//                     — first-load lifecycle (spinner /
//                       ErrorState / reload with spinner);
//                       error 'denied' is terminal — no retry
//     conversation    — type/title of the room (first page)
//     resync          — merge the newest page after a socket
//                       drop or network restore (automatic)
//     loadOlder, loadingOlder, hasMore
//                     — before-cursor paging for the inverted
//                       list's onEndReached
//   } = useChatMessages(conversationId)
//
// Used by:
//   - app/(main)/chat-room/index.tsx — the chat room screen
// -----------------------------------------------------------

// Blank a message (and every quote of it) after an unsend
export const markDeleted = (m: ChatMessage, messageId: string): ChatMessage => {
  let next = m;
  if (m.id === messageId && !m.deleted) {
    next = { ...m, text: '', imageUrl: undefined, reactions: [], deleted: true };
  }
  if (next.replyTo && next.replyTo.id === messageId && !next.replyTo.deleted) {
    next = { ...next, replyTo: { ...next.replyTo, text: '', imageUrl: undefined, deleted: true } };
  }
  return next;
};


// After a failed older-history page, automatic onEndReached
// retries stay blocked this long — the reader parked near the
// visual top must not storm a failing endpoint on every bounce
const OLDER_RETRY_BACKOFF_MS = 4000;





export function useChatMessages(conversationId: string): UseChatMessagesResult {
  const { t } = useTranslation();
  const { user } = useAuth();


  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<ParticipantProfile[]>([]);
  const profilesRef = useRef<ParticipantProfile[]>([]);
  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);
  const [conversation, setConversation] = useState<ConversationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'load' | 'denied' | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);


  // Refs mirror state for reads inside long-lived socket
  // handlers and async paging, where closures would be stale
  const selfIdRef = useRef<string | null>(user?.id ?? null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const hasMoreRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const mountedRef = useRef(true);
  // Older-paging failure latch: the stamp blocks automatic
  // onEndReached retries for a short backoff and the flag keeps
  // a failing run down to ONE toast — both clear on success
  const olderFailedAtRef = useRef(0);
  const olderToastedRef = useRef(false);
  // The LIVE conversation id — in-flight resync/loadOlder pages
  // compare their creation-time id against it on resume, so a
  // page fetched for the previous room can never land in this one
  const conversationIdRef = useRef(conversationId);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  useEffect(() => {
    selfIdRef.current = user?.id ?? null;
  }, [user]);
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
  // ?conversationId query changes in place without a remount) —
  // wipe every per-room state before the new fetch, so the old
  // room's messages never render under the new header and a send
  // in the fetch window cannot land beside foreign rows
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
    olderToastedRef.current = false;
  }, [conversationId]);


  // Fold a page's senders into the id → name map (the viewer
  // sheet resolves reactor ids through it)
  const mergeParticipants = useCallback((rows: ApiMessage[]) => {
    setParticipants((prev) => {
      const next = { ...prev };
      for (const m of rows) next[m.senderId] = m.senderName;
      return next;
    });
  }, []);


  // Read acknowledgements are gated and batched: nothing is
  // acknowledged while the app is backgrounded or another
  // screen covers this room — arrivals only mark the state
  // dirty, and the buffered acknowledgement flushes when the
  // room regains focus AND when the reader leaves it (blur,
  // room switch, unmount), so a debounced ack never dies with
  // the screen. While focused, a burst of arrivals collapses
  // into ONE trailing emit; the emit is volatile (socket.io
  // drops it whenever the polling transport is mid-write), so
  // the durable REST mark always rides along — and nothing at
  // all goes out when no new message arrived since the last
  // mark.
  const isFocused = useIsFocused();
  const focusedRef = useRef(isFocused);
  const appActiveRef = useRef(AppState.currentState === 'active');
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
    emitMarkRead(conversationId);
    markConversationRead(conversationId).catch(() => {});
  }, [conversationId]);

  const scheduleMarkRead = useCallback(() => {
    readDirtyRef.current = true;
    // Unfocused/backgrounded: stay dirty until the refocus flush
    if (!focusedRef.current || !appActiveRef.current) return;
    if (readTimerRef.current) return;
    readTimerRef.current = setTimeout(() => {
      readTimerRef.current = null;
      flushMarkRead();
    }, 1500);
  }, [flushMarkRead]);

  // Refocus and foreground transitions flush the buffer — and
  // so does LEAVING (blur, room switch, unmount): the cleanup
  // runs while focusedRef still says focused, so an ack the
  // debounce is holding goes out instead of dying with the
  // screen. A pending timer never outlives the room or a
  // conversation switch
  useEffect(() => {
    focusedRef.current = isFocused;
    if (isFocused) flushMarkRead();
    return flushMarkRead;
  }, [isFocused, flushMarkRead]);

  // While focused this room IS the active conversation: the
  // unread badge (hooks/useUnreadCount.ts) skips its optimistic
  // bump for messages landing here, because the mark-read above
  // is already claiming them as read
  useEffect(() => {
    if (!conversationId || !isFocused) return;
    setActiveConversation(conversationId);
    return () => clearActiveConversation(conversationId);
  }, [conversationId, isFocused]);
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


  // First load per conversation (and per retry): full spinner,
  // error only when nothing could be shown
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
        const resp = await fetchMessages(conversationId);
        if (cancelled) return;

        const page = resp.messages.map(toChatMessage).reverse();

        // Failed sends persisted by the composer come back as
        // failed temp bubbles on top of the page
        const selfId = selfIdRef.current;
        const self = resp.participants.find((p) => p.id === selfId);
        const outbox =
          selfId
            ? await readOutboxTemps(conversationId, {
                id: selfId,
                displayName: self?.displayName ?? '',
                avatarUrl: self?.avatarUrl || undefined,
              })
            : [];
        if (cancelled) return;

        // MERGE the page instead of replacing state: live socket
        // rows that landed during the fetch (and pending temps)
        // stay on top. A temp whose send actually committed —
        // its clientMsgId echoes in the page — is dropped, not
        // shown beside its server row.
        setMessages((prev) => {
          const known = new Set(page.map((m) => m.id));
          const committed = new Set(page.map((m) => m.clientId).filter(Boolean));
          const kept = prev.filter(
            (m) =>
              m.conversationId === conversationId &&
              !known.has(m.id) &&
              !(m.id.startsWith(TEMP_ID_PREFIX) && committed.has(m.clientId ?? m.id)),
          );
          const keptIds = new Set(kept.map((m) => m.id));
          const restored = outbox.filter(
            (m) => !known.has(m.id) && !keptIds.has(m.id) && !committed.has(m.id),
          );
          return [...restored, ...kept, ...page];
        });
        setHasMore(resp.hasMore);
        hasMoreRef.current = resp.hasMore;
        mergeParticipants(resp.messages);
        setProfiles(resp.participants.map(toProfile));
        setConversation(resp.conversation);

        // Opening the room clears its unread state — buffered
        // through the focus-gated acknowledgement above
        scheduleMarkRead();
      } catch (err) {
        // 401/403/404 are terminal — the viewer lost access (or
        // the conversation is gone) and a retry can never win
        if (!cancelled) {
          setError(
            err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 404)
              ? 'denied'
              : 'load',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, reloadKey, mergeParticipants, scheduleMarkRead]);


  // Live delivery. The on* helpers register synchronously into
  // the module registry (they work while the socket is still
  // null), so there is no async-subscribe race to cancel —
  // only the join after connect needs the cancelled flag.
  useEffect(() => {
    if (!conversationId) return;

    let cancelled = false;


    const unsubMessage = onNewMessage((data: SocketMessage) => {
      if (data.conversationId !== conversationId) return;

      const selfId = selfIdRef.current;
      const isOwn = !!selfId && data.senderId === selfId;
      const incoming: ChatMessage = {
        id: data.id,
        // The echoed send nonce (when the backend carries it)
        // names the exact temp this row must replace
        clientId: (data as SocketMessage & { clientMsgId?: string | null }).clientMsgId || undefined,
        conversationId: data.conversationId,
        senderId: data.senderId,
        senderName: data.senderName,
        // The socket payload carries no portrait — the member list does
        senderAvatar:
          data.senderAvatar || profilesRef.current.find((p) => p.id === data.senderId)?.avatarUrl || undefined,
        text: data.text ?? '',
        imageUrl: data.imageUrl || undefined,
        createdAt: data.createdAt,
        isOwn,
        status: isOwn ? 'sent' : 'read',
        replyTo: mapReply(data.replyTo),
        deleted: !!data.deleted,
        reactions: (data.reactions ?? []).map((r) => ({
          emoji: r.emoji,
          count: r.count,
          bySelf: !!selfId && r.byUserIds.includes(selfId),
          byUserIds: r.byUserIds,
        })),
      };

      setMessages((prev) => {
        // The composer's REST response may have landed first
        if (prev.some((m) => m.id === data.id)) return prev;

        // Own echo: adopt the temp the nonce names (or the
        // newest content match — see findTempFor). Failed temps
        // match too: a timeout whose request actually reached
        // the server still echoes, and replacing beats
        // duplicating.
        if (isOwn) {
          const i = findTempFor(prev, incoming);
          if (i >= 0) {
            const next = [...prev];
            next[i] = adoptTemp(incoming, prev[i]);
            return next;
          }
        }

        return [incoming, ...prev];
      });

      // Bail when the name is already right — no allocation per
      // incoming message
      setParticipants((prev) =>
        prev[data.senderId] === data.senderName ? prev : { ...prev, [data.senderId]: data.senderName },
      );

      // An arrival only counts as read while the room is
      // actually being looked at — the gate and the burst
      // debounce live in scheduleMarkRead
      if (!isOwn) scheduleMarkRead();
    });


    const unsubReaction = onReactionUpdate((data: ReactionUpdate) => {
      if (data.conversationId !== conversationId) return;

      const selfId = selfIdRef.current;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId
            ? {
                ...m,
                reactions: (data.reactions ?? []).map((r) => ({
                  emoji: r.emoji,
                  count: r.count,
                  bySelf: !!selfId && r.byUserIds.includes(selfId),
                  byUserIds: r.byUserIds,
                })),
              }
            : m,
        ),
      );
    });


    // An unsend anywhere in the room blanks that message here
    // too, and any reply quoting it flips to the placeholder
    const unsubDeleted = onMessageDeleted((data: MessageDeletedEvent) => {
      if (data.conversationId !== conversationId) return;
      setMessages((prev) => prev.map((m) => markDeleted(m, data.messageId)));
    });

    // A receipt names ONE reader — accumulate readers per own
    // message and only claim 'read' once every OTHER member has
    // read it; the first reader promotes 'sent' → 'delivered'
    const unsubRead = onMessagesRead((data: MessagesReadEvent) => {
      if (data.conversationId !== conversationId) return;
      if (data.readerId === selfIdRef.current) return;

      const readSet = new Set(data.messageIds);
      const memberCount = profilesRef.current.length;
      setMessages((prev) =>
        prev.map((m) => {
          if (!m.isOwn || !readSet.has(m.id)) return m;
          if (m.status !== 'sent' && m.status !== 'delivered') return m;

          const readBy = m.readBy?.includes(data.readerId)
            ? m.readBy
            : [...(m.readBy ?? []), data.readerId];
          const others = readBy.filter((id) => id !== m.senderId).length;
          const status: ChatMessage['status'] =
            memberCount > 1 && others >= memberCount - 1 ? 'read' : 'delivered';

          if (status === m.status && readBy === m.readBy) return m;
          return { ...m, status, readBy };
        }),
      );
    });


    // Conversations created after socket connect are not in the
    // backend's auto-joined rooms — join explicitly once the
    // connection exists (null for guests: no realtime; a failed
    // connect is swallowed — the status listener retries)
    void connectSocket()
      .then((sock) => {
        if (!cancelled && sock) joinConversation(conversationId);
      })
      .catch(() => {});


    return () => {
      cancelled = true;
      unsubMessage();
      unsubReaction();
      unsubRead();
      unsubDeleted();
      // No leave_conversation here: the server joins every room
      // of the member at connect, and leaving would silence this
      // conversation for the list previews and the unread badge
      // until the next reconnect
    };
  }, [conversationId, scheduleMarkRead]);


  // After a socket drop or a network restore the newest page is
  // fetched again and MERGED by id — unknown rows slot in by
  // stamp, known rows take the server's version, temps and paged
  // history stay put — so a gap of missed messages closes without
  // the list jumping. One resync runs at a time; a superseded
  // response is never applied.
  const resyncingRef = useRef(false);
  const resyncSeqRef = useRef(0);
  const resync = useCallback(async () => {
    if (!conversationId) return;
    if (resyncingRef.current) return;
    resyncingRef.current = true;
    const seq = ++resyncSeqRef.current;
    try {
      const resp = await fetchMessages(conversationId);
      // A stale resume — unmounted, superseded, or the instance
      // now shows a DIFFERENT room — must not touch state
      if (!mountedRef.current || seq !== resyncSeqRef.current || conversationId !== conversationIdRef.current) return;

      const page = resp.messages.map(toChatMessage);

      // hasMore only resets on a fresh head. The authoritative
      // gap decision is re-derived from `prev` INSIDE the
      // updater (the ref can trail live inserts by a commit);
      // this outer mirror of it exists only because the paging
      // flag cannot be set from within a pure updater.
      const knownRows = messagesRef.current.filter((m) => !m.id.startsWith(TEMP_ID_PREFIX));
      const knownIds = new Set(knownRows.map((m) => m.id));
      if (knownRows.length === 0 || (resp.hasMore && !page.some((row) => knownIds.has(row.id)))) {
        setHasMore(resp.hasMore);
        hasMoreRef.current = resp.hasMore;
      }

      setMessages((prev) => {
        // A gap wider than one page: the newest page shares
        // nothing with the loaded history, which therefore
        // cannot be stitched to it — start over from this head
        // and let paging refill downwards (an empty room simply
        // takes the page)
        const loadedServerRows = prev.filter((m) => !m.id.startsWith(TEMP_ID_PREFIX));
        const loadedIds = new Set(loadedServerRows.map((m) => m.id));
        const freshHead =
          loadedServerRows.length === 0 || (resp.hasMore && !page.some((row) => loadedIds.has(row.id)));

        if (freshHead) {
          // Temps stay pending on top (those whose server row is
          // in the page adopt it), and so does any live row NEWER
          // than the fetched head — a socket delivery racing the
          // fetch must not be dropped
          const newestStamp =
            page.length > 0 ? (parseStamp(page[page.length - 1].createdAt)?.getTime() ?? 0) : 0;
          const pageIds = new Set(page.map((row) => row.id));
          let kept = prev.filter(
            (m) =>
              m.id.startsWith(TEMP_ID_PREFIX) ||
              (!pageIds.has(m.id) && (parseStamp(m.createdAt)?.getTime() ?? 0) > newestStamp),
          );
          const head = page.slice().reverse().map((row) => {
            if (!row.isOwn) return row;
            const i = findTempFor(kept, row);
            if (i < 0) return row;
            const adopted = adoptTemp(row, kept[i]);
            kept = kept.filter((_, index) => index !== i);
            return adopted;
          });
          return [...kept, ...head];
        }

        // Copy-on-first-write merge: the array is copied at most
        // once, and the re-sort below runs only when an unknown
        // row was actually inserted
        let next: ChatMessage[] | null = null;
        let inserted = false;
        for (const row of page) {
          const base = next ?? prev;
          const index = base.findIndex((m) => m.id === row.id);
          if (index >= 0) {
            // Always the server's version (reactions, quotes, status)
            const known = base[index];
            if (!next) next = prev.slice();
            next[index] = { ...row, clientId: known.clientId, localImageUri: known.localImageUri };
            continue;
          }
          const tempIndex = row.isOwn ? findTempFor(base, row) : -1;
          if (!next) next = prev.slice();
          if (tempIndex >= 0) {
            next[tempIndex] = adoptTemp(row, next[tempIndex]);
          } else {
            next.push(row);
            inserted = true;
          }
        }
        if (!next) return prev;
        if (!inserted) return next;

        // Decorate–sort–undecorate: each stamp parses once,
        // temps pin to the newest end, ties keep their order
        const decorated: [number, ChatMessage][] = next.map((m) => [
          m.id.startsWith(TEMP_ID_PREFIX) ? Number.POSITIVE_INFINITY : (parseStamp(m.createdAt)?.getTime() ?? 0),
          m,
        ]);
        decorated.sort((a, b) => (a[0] === b[0] ? 0 : b[0] - a[0]));
        return decorated.map((entry) => entry[1]);
      });
      mergeParticipants(resp.messages);
      setProfiles(resp.participants.map(toProfile));
      setConversation(resp.conversation);
      scheduleMarkRead();
    } catch {
      // Silent: the live feed keeps working and the next reconnect retries
    } finally {
      resyncingRef.current = false;
    }
  }, [conversationId, mergeParticipants, scheduleMarkRead]);


  // Reconnect (after a drop) and network restore both resync
  const wasDownRef = useRef(false);
  useEffect(() => {
    if (!conversationId) return;
    return onSocketStatusChange((status) => {
      if (status !== 'connected') {
        wasDownRef.current = true;
        return;
      }
      if (wasDownRef.current) {
        wasDownRef.current = false;
        void resync();
      }
    });
  }, [conversationId, resync]);
  useNetworkRestore(() => void resync());


  // Older-history paging for the inverted list's onEndReached.
  // Cursor = the oldest REAL message id (temps only live at the
  // newest end, but skip them defensively); the in-flight ref
  // absorbs the event's repeat firing. Resolves once the page
  // has been applied, so the in-chat search jump can await
  // successive pages while hunting an old hit.
  const loadOlder = useCallback(async () => {
    if (!conversationId) return;
    if (loadingOlderRef.current || !hasMoreRef.current) return;
    // Failure backoff: onEndReached keeps firing while the reader
    // sits near the visual top — after a failed page, automatic
    // re-requests stay blocked for a beat instead of storming the
    // endpoint with a toast per bounce
    if (Date.now() - olderFailedAtRef.current < OLDER_RETRY_BACKOFF_MS) return;

    let cursor: ChatMessage | undefined;
    for (let i = messagesRef.current.length - 1; i >= 0; i--) {
      if (!messagesRef.current[i].id.startsWith(TEMP_ID_PREFIX)) {
        cursor = messagesRef.current[i];
        break;
      }
    }
    if (!cursor) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      // The server pages on (created_at, id), so the cursor is
      // the oldest loaded message's stamp PLUS its id — the id
      // tiebreak keeps an equal-stamp sibling from being
      // skipped across the page boundary
      const resp = await fetchMessages(conversationId, cursor.createdAt, 50, cursor.id);
      // A stale resume — unmounted, or the instance now shows a
      // DIFFERENT room — must not merge a foreign page
      if (!mountedRef.current || conversationId !== conversationIdRef.current) return;

      const page = resp.messages.map(toChatMessage).reverse();
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        return [...prev, ...page.filter((m) => !known.has(m.id))];
      });
      setHasMore(resp.hasMore);
      hasMoreRef.current = resp.hasMore;
      mergeParticipants(resp.messages);
      olderFailedAtRef.current = 0;
      olderToastedRef.current = false;
    } catch {
      if (!mountedRef.current || conversationId !== conversationIdRef.current) return;
      olderFailedAtRef.current = Date.now();
      // One toast per failing run — the first failure says it,
      // the retries that follow stay quiet until a page succeeds
      if (!olderToastedRef.current) {
        olderToastedRef.current = true;
        showToast('error', t('chat.loadError'));
      }
    } finally {
      loadingOlderRef.current = false;
      if (mountedRef.current) setLoadingOlder(false);
    }
  }, [conversationId, mergeParticipants, t]);


  const retry = useCallback(() => setReloadKey((k) => k + 1), []);


  // Optimistic unsend: the placeholder shows at once and the
  // original comes back (with a toast) if the backend refuses
  const deleteMessage = useCallback(
    (messageId: string) => {
      const target = messagesRef.current.find((m) => m.id === messageId);
      if (!target || target.deleted) return;
      // Snapshot the whole list: the optimistic pass also flips
      // every quote of this message, and a failure restores them all
      const snapshot = messagesRef.current;
      setMessages((prev) => prev.map((m) => markDeleted(m, messageId)));
      deleteMessageApi(conversationId, messageId).catch(() => {
        if (!mountedRef.current) return;
        // Put back only what the optimistic pass touched — the
        // text, image, reactions and deleted flag plus each
        // reply's OWN captured quote (one message can be quoted
        // by many replies); receipts that landed meanwhile stay
        const original = snapshot.find((m) => m.id === messageId);
        const quotes = new Map(
          snapshot
            .filter((m) => m.replyTo?.id === messageId)
            .map((m): [string, ChatReplyRef | undefined] => [m.id, m.replyTo]),
        );
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === messageId && original) {
              return {
                ...m,
                text: original.text,
                imageUrl: original.imageUrl,
                reactions: original.reactions,
                deleted: original.deleted,
              };
            }
            if (m.replyTo && m.replyTo.id === messageId) {
              const quote = quotes.get(m.id);
              if (quote) {
                return { ...m, replyTo: { ...m.replyTo, text: quote.text, imageUrl: quote.imageUrl, deleted: quote.deleted } };
              }
            }
            return m;
          }),
        );
        showToast('error', t('chat.deleteError'));
      });
    },
    [conversationId, t],
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
