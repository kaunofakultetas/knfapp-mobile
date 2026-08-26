// -----------------------------------------------------------
//  [*] useChatMessages — history, live delivery and paging
//
//  The data spine of the chat room: loads the newest history
//  page over REST, keeps it live through the socket registry,
//  and pages older messages with the before-cursor. The list
//  is held NEWEST-FIRST — exactly what the inverted FlatList
//  in components/chat/MessageList.tsx renders — so "prepend a
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
import { fetchMessages, markConversationRead, type ApiMessage } from '@/services/api';

// Live delivery — registry-backed subscriptions and room emits
import {
  connectSocket,
  emitMarkRead,
  joinConversation,
  leaveConversation,
  onMessagesRead,
  onNewMessage,
  onReactionUpdate,
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
import type { ChatMessage } from '@/types';

// State and lifecycle plumbing
import { useCallback, useEffect, useRef, useState } from 'react';







// -----------------------------------------------------------
// TEMP_ID_PREFIX
// -----------------------------------------------------------
//
// Marks optimistic messages that only exist client-side; the
// echo dedupe above and the pull-to-refresh reconcile both key
// off it.
//
// Used by:
//   - useChatMessages (below) — echo replace, refresh keep
//   - hooks/chat/useChatComposer.ts — temp id minting
// -----------------------------------------------------------

export const TEMP_ID_PREFIX = 'temp-';







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

export interface UseChatMessagesResult {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  participants: Record<string, string>;
  loading: boolean;
  error: boolean;
  retry: () => void;
  refreshing: boolean;
  refresh: () => Promise<void>;
  loadOlder: () => void;
  loadingOlder: boolean;
  hasMore: boolean;
}







// -----------------------------------------------------------
// useChatMessages
// -----------------------------------------------------------
//
//   const {
//     messages,       — ChatMessage[], NEWEST-FIRST
//     setMessages,    — shared with composer/reactions hooks
//     participants,   — senderId → displayName map
//     loading, error, retry
//                     — first-load lifecycle (spinner /
//                       ErrorState / reload with spinner)
//     refreshing, refresh
//                     — pull-to-refresh: refetch newest page,
//                       keep pending optimistic bubbles
//     loadOlder, loadingOlder, hasMore
//                     — before-cursor paging for the inverted
//                       list's onEndReached
//   } = useChatMessages(conversationId)
//
// Used by:
//   - app/(main)/chat-room/index.tsx — the chat room screen
// -----------------------------------------------------------

export function useChatMessages(conversationId: string): UseChatMessagesResult {
  const { t } = useTranslation();
  const { user } = useAuth();


  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
        senderAvatar: data.senderAvatar || undefined,
        text: data.text ?? '',
        imageUrl: data.imageUrl || undefined,
        createdAt: data.createdAt,
        isOwn,
        status: isOwn ? 'sent' : 'read',
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
          for (let i = prev.length - 1; i >= 0; i--) {
            const m = prev[i];
            if (
              m.id.startsWith(TEMP_ID_PREFIX) &&
              m.text === incoming.text &&
              (m.imageUrl ?? '') === (incoming.imageUrl ?? '')
            ) {
              const next = [...prev];
              next[i] = incoming;
              return next;
            }
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
      leaveConversation(conversationId);
    };
  }, [conversationId]);


  // Pull-to-refresh: refetch the newest page silently, keeping
  // optimistic temps (pending or failed sends the server page
  // cannot contain) at the newest end
  const refresh = useCallback(async () => {
    if (!conversationId) return;

    setRefreshing(true);
    try {
      const resp = await fetchMessages(conversationId);
      if (!mountedRef.current) return;

      const page = resp.messages.map(toChatMessage).reverse();
      setMessages((prev) => [
        ...prev.filter((m) => m.id.startsWith(TEMP_ID_PREFIX)),
        ...page,
      ]);
      setHasMore(resp.hasMore);
      hasMoreRef.current = resp.hasMore;
      mergeParticipants(resp.messages);
      emitMarkRead(conversationId);
      markConversationRead(conversationId).catch(() => {});
    } catch {
      if (mountedRef.current) showToast('error', t('chat.loadError'));
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [conversationId, mergeParticipants, t]);


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
        const resp = await fetchMessages(conversationId, cursor.id);
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


  return {
    messages,
    setMessages,
    participants,
    loading,
    error,
    retry,
    refreshing,
    refresh,
    loadOlder,
    loadingOlder,
    hasMore,
  };
}
