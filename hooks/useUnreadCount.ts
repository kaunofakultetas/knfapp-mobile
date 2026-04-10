/**
 * Tracks the total unread message count across all conversations.
 * Fetches from backend on mount and refreshes on socket events.
 * Used for the Messages tab badge.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchTotalUnreadCount } from '@/services/api';
import {
  connectSocket,
  onNewMessage,
  onMessagesRead,
  type SocketMessage,
  type MessagesReadEvent,
} from '@/services/socket';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useUnreadCount() {
  const [count, setCount] = useState(0);
  const currentUserIdRef = useRef<string | null>(null);

  // Load current user ID
  useEffect(() => {
    AsyncStorage.getItem('auth').then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          currentUserIdRef.current = parsed.user?.id ?? null;
        } catch { /* ignore */ }
      }
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const resp = await fetchTotalUnreadCount();
      setCount(resp.unreadCount);
    } catch {
      // API unavailable — keep current count
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for new messages and read events to keep count fresh
  useEffect(() => {
    let unsubMessage: (() => void) | undefined;
    let unsubRead: (() => void) | undefined;

    (async () => {
      const sock = await connectSocket();
      if (!sock) return;

      // New message from someone else = increment
      unsubMessage = onNewMessage((data: SocketMessage) => {
        const myId = currentUserIdRef.current;
        if (data.senderId !== myId) {
          // Quick increment, then refresh from server for accuracy
          setCount((prev) => prev + 1);
        }
      });

      // Messages read = refresh from server
      unsubRead = onMessagesRead((_data: MessagesReadEvent) => {
        // We marked something as read — refresh
        refresh();
      });
    })();

    return () => {
      unsubMessage?.();
      unsubRead?.();
    };
  }, [refresh]);

  return { count, refresh };
}
