/**
 * Socket.IO client for real-time chat messaging.
 *
 * Connects to the backend WebSocket server with the user's auth token.
 * Provides event emitters and listeners for chat features:
 * - new_message: Incoming messages in conversations
 * - reaction_update: Emoji reaction changes
 * - user_typing / user_stop_typing: Typing indicators
 */

import { API_BASE_URL } from '@/constants/Api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';

// Strip /api suffix to get the base server URL for socket.io
const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, '');

let socket: Socket | null = null;
let currentToken: string | null = null;

export interface SocketMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  text: string;
  imageUrl?: string;
  time: string;
  createdAt: string;
  reactions: {
    emoji: string;
    count: number;
    byUserIds: string[];
  }[];
}

export interface ReactionUpdate {
  conversationId: string;
  messageId: string;
  reactions: {
    emoji: string;
    count: number;
    byUserIds: string[];
  }[];
}

export interface TypingEvent {
  conversationId: string;
  userId: string;
  displayName: string;
}

export interface StopTypingEvent {
  conversationId: string;
  userId: string;
}

/**
 * Connect to the socket.io server using the stored auth token.
 * Disconnects any existing connection first.
 */
export async function connectSocket(): Promise<Socket | null> {
  // Get token from stored auth
  try {
    const raw = await AsyncStorage.getItem('auth');
    if (!raw) return null;
    const { token } = JSON.parse(raw) as { token: string };
    if (!token) return null;

    // Already connected with same token
    if (socket?.connected && currentToken === token) {
      return socket;
    }

    // Disconnect existing
    disconnectSocket();

    currentToken = token;
    socket = io(SOCKET_URL, {
      query: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 15000,
    });

    return socket;
  } catch {
    return null;
  }
}

/**
 * Get the current socket instance (may be null if not connected).
 */
export function getSocket(): Socket | null {
  return socket;
}

/**
 * Disconnect and clean up the socket connection.
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    currentToken = null;
  }
}

/**
 * Join a conversation room (needed for new conversations created after initial connect).
 */
export function joinConversation(conversationId: string): void {
  socket?.emit('join_conversation', { conversationId });
}

/**
 * Leave a conversation room.
 */
export function leaveConversation(conversationId: string): void {
  socket?.emit('leave_conversation', { conversationId });
}

/**
 * Emit typing indicator for a conversation.
 */
export function emitTyping(conversationId: string): void {
  socket?.emit('typing', { conversationId });
}

/**
 * Emit stop typing indicator for a conversation.
 */
export function emitStopTyping(conversationId: string): void {
  socket?.emit('stop_typing', { conversationId });
}

// Event listener helpers

type Listener<T> = (data: T) => void;

export function onNewMessage(listener: Listener<SocketMessage>): () => void {
  socket?.on('new_message', listener);
  return () => { socket?.off('new_message', listener); };
}

export function onReactionUpdate(listener: Listener<ReactionUpdate>): () => void {
  socket?.on('reaction_update', listener);
  return () => { socket?.off('reaction_update', listener); };
}

export function onTyping(listener: Listener<TypingEvent>): () => void {
  socket?.on('user_typing', listener);
  return () => { socket?.off('user_typing', listener); };
}

export function onStopTyping(listener: Listener<StopTypingEvent>): () => void {
  socket?.on('user_stop_typing', listener);
  return () => { socket?.off('user_stop_typing', listener); };
}
