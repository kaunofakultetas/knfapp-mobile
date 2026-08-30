// -----------------------------------------------------------
//  [*] chatengine — activeConversation
//
//  Which room is on screen right now. useConversation claims it
//  while focused (its read acknowledgement is already marking
//  arrivals read), so an unread-badge counter elsewhere in the
//  host can skip messages landing in that room.
//
//  Used by:
//    - hooks/useConversation.ts — claim / release on focus
//    - the host's unread counter
// -----------------------------------------------------------

let activeConversationId: string | null = null;

export function setActiveConversation(conversationId: string): void {
  activeConversationId = conversationId;
}

export function clearActiveConversation(conversationId: string): void {
  // Only the holder releases — a room blurring AFTER the next
  // one focused must not wipe the newer claim
  if (activeConversationId === conversationId) activeConversationId = null;
}

export function getActiveConversation(): string | null {
  return activeConversationId;
}
