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
//  the backend); leave_conversation is emitted on cleanup.
//
//  Own-message echo dedupe: the backend broadcasts new_message
//  to the whole room INCLUDING the sender, and the composer's
//  REST response races that echo. An incoming own message
//  first matches by id, then replaces the oldest optimistic
//  temp bubble with the same text+image — whichever side lands
//  first wins and the other becomes a no-op, so the list never
//  holds duplicate keys.
//
//  Self detection uses useAuth().user through a ref — never an
//  AsyncStorage read that could still be in flight when the
//  first echo arrives.
//
//  Split into:
//
//    TEMP_ID_PREFIX        — optimistic-id marker (composer)
//    toChatMessage         — ApiMessage → ChatMessage mapper
//    UseChatMessagesResult — the hook's return shape
//    useChatMessages       — the hook itself
// -----------------------------------------------------------

// History REST endpoints and their row shape
import { deleteMessageApi, fetchMessages, markConversationRead, type ApiMessage } from '@/services/api';
import { useNetworkRestore } from '@/hooks/useNetworkRestore';
import { parseStamp } from '@/chatkit/timeline';

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

// Self identity for echo dedupe and bySelf reaction flags
import { useAuth } from '@/context/AuthContext';

// User-facing failure toasts
import { showToast } from '@/context/NetworkContext';
import { useTranslation } from 'react-i18next';

// The unified UI message shape
import type { ChatMessage, ChatReplyRef } from '@/types';

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
// that produced it — never sit beside it. Temps carry no server
// id, so the match is by content: the oldest temp with the same
// text and image path (echoes and pages arrive in send order;
// the list is newest-first, so scan from the end). The adopted
// row keeps the temp's key and local photo so the bubble does
// not remount.
//
// Used by:
//   - useChatMessages (below) — echo handler, resync merge
// -----------------------------------------------------------

function findTempFor(list: ChatMessage[], incoming: ChatMessage): number {
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (
      m.id.startsWith(TEMP_ID_PREFIX) &&
      m.text === incoming.text &&
      (m.imageUrl ?? '') === (incoming.imageUrl ?? '')
    ) {
      return i;
    }
  }
  return -1;
}

function adoptTemp(incoming: ChatMessage, temp: ChatMessage): ChatMessage {
  return { ...incoming, clientId: temp.clientId ?? temp.id, localImageUri: temp.localImageUri };
}







// -----------------------------------------------------------
// toChatMessage
// -----------------------------------------------------------
//
// ApiMessage → ChatMessage. Drops the server-preformatted
// `time` field on the floor (it is UTC-wrong; display formats
// createdAt via services/format.ts) and defends against the
// backend's null text on image-only messages.
//
// Used by:
//   - useChatMessages (below) — every REST page
// -----------------------------------------------------------

function toChatMessage(m: ApiMessage): ChatMessage {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    senderName: m.senderName,
    senderAvatar: m.senderAvatar || undefined,
    text: m.text ?? '',
    imageUrl: m.imageUrl || undefined,
    createdAt: m.createdAt,
    isOwn: m.isOwn,
    status: m.status ?? (m.isOwn ? 'sent' : 'read'),
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
  error: boolean;
  retry: () => void;
  resync: () => Promise<void>;
  loadOlder: () => void;
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
//                       ErrorState / reload with spinner)
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
const markDeleted = (m: ChatMessage, messageId: string): ChatMessage => {
  let next = m;
  if (m.id === messageId && !m.deleted) {
    next = { ...m, text: '', imageUrl: undefined, reactions: [], deleted: true };
  }
  if (next.replyTo && next.replyTo.id === messageId && !next.replyTo.deleted) {
    next = { ...next, replyTo: { ...next.replyTo, text: '', imageUrl: undefined, deleted: true } };
  }
  return next;
};







export function useChatMessages(conversationId: string): UseChatMessagesResult {
  const { t } = useTranslation();
  const { user } = useAuth();


  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<ParticipantProfile[]>([]);
  const profilesRef = useRef<ParticipantProfile[]>([]);
  profilesRef.current = profiles;
  const [conversation, setConversation] = useState<ConversationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
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


  // Fold a page's senders into the id → name map (the viewer
  // sheet resolves reactor ids through it)
  const mergeParticipants = useCallback((rows: ApiMessage[]) => {
    setParticipants((prev) => {
      const next = { ...prev };
      for (const m of rows) next[m.senderId] = m.senderName;
      return next;
    });
  }, []);


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
      setError(false);
      try {
        const resp = await fetchMessages(conversationId);
        if (cancelled) return;

        const page = resp.messages.map(toChatMessage).reverse();
        setMessages(page);
        setHasMore(resp.hasMore);
        hasMoreRef.current = resp.hasMore;
        mergeParticipants(resp.messages);
        setProfiles(resp.participants.map(toProfile));
        setConversation(resp.conversation);

        // Opening the room clears its unread state — socket for
        // speed, REST as the fallback when realtime is down
        emitMarkRead(conversationId);
        markConversationRead(conversationId).catch(() => {});
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, reloadKey, mergeParticipants]);


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
        reactions: data.reactions.map((r) => ({
          emoji: r.emoji,
          count: r.count,
          bySelf: !!selfId && r.byUserIds.includes(selfId),
          byUserIds: r.byUserIds,
        })),
      };

      setMessages((prev) => {
        // The composer's REST response may have landed first
        if (prev.some((m) => m.id === data.id)) return prev;

        // Own echo: replace the OLDEST matching optimistic temp
        // (echoes arrive in send order; the list is newest-
        // first, so scan from the end). Failed temps match too:
        // a timeout whose request actually reached the server
        // still echoes, and replacing beats duplicating.
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

      setParticipants((prev) => ({ ...prev, [data.senderId]: data.senderName }));

      // The room is open, so anything that arrives is read
      if (!isOwn) {
        emitMarkRead(conversationId);
        markConversationRead(conversationId).catch(() => {});
      }
    });


    const unsubReaction = onReactionUpdate((data: ReactionUpdate) => {
      if (data.conversationId !== conversationId) return;

      const selfId = selfIdRef.current;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId
            ? {
                ...m,
                reactions: data.reactions.map((r) => ({
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

    const unsubRead = onMessagesRead((data: MessagesReadEvent) => {
      if (data.conversationId !== conversationId) return;
      if (data.readerId === selfIdRef.current) return;

      const readSet = new Set(data.messageIds);
      setMessages((prev) =>
        prev.map((m) =>
          m.isOwn && readSet.has(m.id) && (m.status === 'sent' || m.status === 'delivered')
            ? { ...m, status: 'read' }
            : m,
        ),
      );
    });


    // Conversations created after socket connect are not in the
    // backend's auto-joined rooms — join explicitly once the
    // connection exists (null for guests: no realtime)
    void connectSocket().then((sock) => {
      if (!cancelled && sock) joinConversation(conversationId);
    });


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
  }, [conversationId]);


  // After a socket drop or a network restore the newest page is
  // fetched again and MERGED by id — unknown rows slot in by
  // stamp, known rows take the server's version, temps and paged
  // history stay put — so a gap of missed messages closes without
  // the list jumping
  const resync = useCallback(async () => {
    if (!conversationId) return;
    try {
      const resp = await fetchMessages(conversationId);
      if (!mountedRef.current) return;

      const page = resp.messages.map(toChatMessage);

      // A gap wider than one page: the newest page shares nothing
      // with the loaded history, which therefore cannot be stitched
      // to it — start over from this head and let paging refill
      // downwards (an empty room simply takes the page)
      const loadedServerRows = messagesRef.current.filter((m) => !m.id.startsWith(TEMP_ID_PREFIX));
      const loadedIds = new Set(loadedServerRows.map((m) => m.id));
      const freshHead = loadedServerRows.length === 0 || (resp.hasMore && !page.some((row) => loadedIds.has(row.id)));
      if (freshHead) {
        setHasMore(resp.hasMore);
        hasMoreRef.current = resp.hasMore;
      }

      setMessages((prev) => {
        if (freshHead) {
          // Temps whose server row is in the page adopt it; the rest
          // stay pending on top
          let temps = prev.filter((m) => m.id.startsWith(TEMP_ID_PREFIX));
          const head = page.slice().reverse().map((row) => {
            if (!row.isOwn) return row;
            const i = findTempFor(temps, row);
            if (i < 0) return row;
            const adopted = adoptTemp(row, temps[i]);
            temps = temps.filter((_, index) => index !== i);
            return adopted;
          });
          return [...temps, ...head];
        }

        let next = prev;
        for (const row of page) {
          const index = next.findIndex((m) => m.id === row.id);
          if (index >= 0) {
            // Always the server's version (reactions, quotes, status)
            const known = next[index];
            next = next.slice();
            next[index] = { ...row, clientId: known.clientId, localImageUri: known.localImageUri };
            continue;
          }
          const tempIndex = row.isOwn ? findTempFor(next, row) : -1;
          next = next.slice();
          if (tempIndex >= 0) next[tempIndex] = adoptTemp(row, next[tempIndex]);
          else next.push(row);
        }
        if (next === prev) return prev;

        const stamp = (m: ChatMessage) =>
          m.id.startsWith(TEMP_ID_PREFIX) ? Number.POSITIVE_INFINITY : (parseStamp(m.createdAt)?.getTime() ?? 0);
        return next.sort((a, b) => {
          const ta = stamp(a);
          const tb = stamp(b);
          return ta === tb ? 0 : tb - ta;
        });
      });
      mergeParticipants(resp.messages);
      setProfiles(resp.participants.map(toProfile));
      setConversation(resp.conversation);
      emitMarkRead(conversationId);
      markConversationRead(conversationId).catch(() => {});
    } catch {
      // Silent: the live feed keeps working and the next reconnect retries
    }
  }, [conversationId, mergeParticipants]);


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
  // absorbs the event's repeat firing.
  const loadOlder = useCallback(() => {
    if (!conversationId) return;
    if (loadingOlderRef.current || !hasMoreRef.current) return;

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
    void (async () => {
      try {
        // The server pages on created_at, so the cursor is the
        // oldest loaded stamp — never an id
        const resp = await fetchMessages(conversationId, cursor.createdAt);
        if (!mountedRef.current) return;

        const page = resp.messages.map(toChatMessage).reverse();
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id));
          return [...prev, ...page.filter((m) => !known.has(m.id))];
        });
        setHasMore(resp.hasMore);
        hasMoreRef.current = resp.hasMore;
        mergeParticipants(resp.messages);
      } catch {
        if (mountedRef.current) showToast('error', t('chat.loadError'));
      } finally {
        loadingOlderRef.current = false;
        if (mountedRef.current) setLoadingOlder(false);
      }
    })();
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
        // Put back only what the optimistic pass touched — live
        // reactions / receipts that landed meanwhile stay
        const original = snapshot.find((m) => m.id === messageId);
        const quote = snapshot.find((m) => m.replyTo?.id === messageId)?.replyTo;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === messageId && original) {
              return { ...m, text: original.text, imageUrl: original.imageUrl, deleted: original.deleted };
            }
            if (m.replyTo?.id === messageId && quote) {
              return { ...m, replyTo: { ...m.replyTo, text: quote.text, imageUrl: quote.imageUrl, deleted: quote.deleted } };
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
