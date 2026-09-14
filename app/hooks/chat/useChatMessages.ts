// -----------------------------------------------------------
//  [*] useChatMessages — the room's data spine
//
//  @knf/chatengine's useConversation, bound to this app: the
//  navigation focus flag gates read acknowledgements. The
//  reducers and the temp-id marker are re-exported under the
//  names the screens and older tests use.
//
//  Used by:
//    - app/(main)/chat-room/index.tsx
// -----------------------------------------------------------

import { useIsFocused } from "expo-router/react-navigation";

import { useConversation, type UseConversationResult } from '@knf/chatengine';

export {
  TEMP_ID_PREFIX,
  adoptTemp,
  findTempFor,
  markDeleted,
  markEdited,
  type ConversationMeta,
  type Participant as ParticipantProfile,
} from '@knf/chatengine';







// -----------------------------------------------------------
// UseChatMessagesResult
// -----------------------------------------------------------
//
// The engine's result under the app's historical name.
//
// Used by:
//   - useChatMessages (below) — the return shape
//   - app/(main)/chat-room/index.tsx — the room state
// -----------------------------------------------------------

export type UseChatMessagesResult = UseConversationResult;







// -----------------------------------------------------------
// useChatMessages
// -----------------------------------------------------------
//
//   useChatMessages(conversationId)                  — the room
//   useChatMessages(id, { atLatest: false })         — reading
//     history: read acks stay off until back at the tail
//
// Used by:
//   - app/(main)/chat-room/index.tsx
// -----------------------------------------------------------

export function useChatMessages(conversationId: string, options: { atLatest?: boolean } = {}): UseChatMessagesResult {
  const focused = useIsFocused();
  return useConversation(conversationId, { focused, atLatest: options.atLatest });
}
