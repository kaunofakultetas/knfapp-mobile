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

import { useIsFocused } from '@react-navigation/native';

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

export type UseChatMessagesResult = UseConversationResult;

export function useChatMessages(conversationId: string): UseChatMessagesResult {
  const focused = useIsFocused();
  return useConversation(conversationId, { focused });
}
