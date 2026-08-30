// -----------------------------------------------------------
//  [*] activeConversation — which room is on screen right now
//
//  A module-level marker the chat room raises while it is the
//  focused screen, so code far from the navigator — the unread
//  badge above all — can tell "a message for the room being
//  read" from a genuinely unread one without any context
//  plumbing. The release is id-checked, so two rooms racing a
//  navigation transition can never wipe each other's claim.
// -----------------------------------------------------------







// -----------------------------------------------------------
// setActiveConversation / clearActiveConversation /
// getActiveConversation
// -----------------------------------------------------------
//
// Used by:
//   - hooks/chat/useChatMessages.ts — claims on focus,
//     releases on blur and unmount
//   - hooks/useUnreadCount.ts — skips the optimistic badge
//     bump for messages landing in the room being read
//   - app/(main)/tabs/messages.tsx — skips the list's unread
//     bump for the room being read
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
