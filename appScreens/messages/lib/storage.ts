// Thin storage layer over AsyncStorage. Keeps the rest of the code unaware of
// the underlying storage format and provides seed/clear/update helpers.
import { MOCK_CONVERSATIONS } from '@/constants/Data';
import type { Conversation } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'conversations';

export async function getConversationsWithSeed(): Promise<Conversation[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const list: Conversation[] = raw ? JSON.parse(raw) : [];
    if (!raw || (Array.isArray(list) && list.length === 0)) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(MOCK_CONVERSATIONS));
      return MOCK_CONVERSATIONS;
    }
    return list;
  } catch {
    return MOCK_CONVERSATIONS;
  }
}

export async function setConversations(list: Conversation[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export async function updateConversation(
  conversationId: string,
  updater: (conv: Conversation) => Conversation
): Promise<Conversation[] | undefined> {
  try {
    const list = await getConversationsWithSeed();
    const next = list.map((c) => (c.id === conversationId ? updater(c) : c));
    await setConversations(next);
    return next;
  } catch {
    return undefined;
  }
}

export async function clearUnread(conversationId: string): Promise<void> {
  try {
    const list = await getConversationsWithSeed();
    const next = list.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c));
    await setConversations(next);
  } catch {}
}


