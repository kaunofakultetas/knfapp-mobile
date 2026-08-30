// -----------------------------------------------------------
//  [*] chatengine — useChatRoom
//
//  The four room hooks wired the way every screen wires them:
//  the conversation owns the list, the composer, reactions and
//  typing share it. One call for the common case; the parts
//  stay exported for screens that need them apart.
//
//  Used by:
//    - hosts' chat room screens
// -----------------------------------------------------------

import { useComposer, type UseComposerResult } from './useComposer';
import { useConversation, type UseConversationResult } from './useConversation';
import { useReactions, type UseReactionsResult } from './useReactions';
import { useTyping, type TypingUser } from './useTyping';


export interface UseChatRoomResult {
  conversation: UseConversationResult;
  composer: UseComposerResult;
  reactions: UseReactionsResult;
  typingUsers: TypingUser[];
}

export function useChatRoom(conversationId: string, options: { focused?: boolean; reactionOptions?: string[] } = {}): UseChatRoomResult {
  const conversation = useConversation(conversationId, { focused: options.focused });
  const composer = useComposer(conversationId, conversation.setMessages, conversation.messages);
  const reactions = useReactions(conversationId, conversation.messages, conversation.setMessages, { reactionOptions: options.reactionOptions });
  const { typingUsers } = useTyping(conversationId, conversation.profiles);
  return { conversation, composer, reactions, typingUsers };
}
