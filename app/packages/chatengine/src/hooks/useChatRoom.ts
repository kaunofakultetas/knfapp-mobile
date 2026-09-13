// -----------------------------------------------------------
//  [*] chatengine — useChatRoom
//
//  The four room hooks wired the way every screen wires them:
//  the conversation owns the list, the composer, reactions and
//  typing share it. One call for the common case; the parts
//  stay exported for screens that need them apart.
//
//  Used by:
//    - the example rooms — the app wires the four parts
//      itself (hooks/chat/*) to interleave its own pickers
// -----------------------------------------------------------

import { useComposer, type UseComposerResult } from './useComposer';
import { useConversation, type UseConversationResult } from './useConversation';
import { useReactions, type UseReactionsResult } from './useReactions';
import { useTyping, type TypingUser } from './useTyping';







// -----------------------------------------------------------
// UseChatRoomResult
// -----------------------------------------------------------
//
// The four parts, already wired together.
//
// Used by:
//   - useChatRoom (below) — the return shape
// -----------------------------------------------------------

export interface UseChatRoomResult {
  conversation: UseConversationResult;
  composer: UseComposerResult;
  reactions: UseReactionsResult;
  typingUsers: TypingUser[];
}







// -----------------------------------------------------------
// useChatRoom
// -----------------------------------------------------------
//
//   const { conversation, composer,
//           reactions, typingUsers }
//     = useChatRoom(id)                    — the common wiring
//   useChatRoom(id, { focused: true })     — mark reads while
//                                            the screen is front
//   useChatRoom(id, { reactionOptions })   — the host's emoji row
//
// Used by:
//   - the example rooms (chatengine/example/ExampleRoom.tsx,
//     chatuikit/example/ExampleRoom.tsx) — the app's own chat
//     room wires the four parts itself instead
// -----------------------------------------------------------

export function useChatRoom(conversationId: string, options: { focused?: boolean; reactionOptions?: string[] } = {}): UseChatRoomResult {
  const conversation = useConversation(conversationId, { focused: options.focused });
  const composer = useComposer(conversationId, conversation.setMessages, conversation.messages);
  const reactions = useReactions(conversationId, conversation.messages, conversation.setMessages, { reactionOptions: options.reactionOptions });
  const { typingUsers } = useTyping(conversationId, conversation.profiles);
  return { conversation, composer, reactions, typingUsers };
}
