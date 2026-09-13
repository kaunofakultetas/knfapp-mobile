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

// Module-level on purpose: one app, one screen on top
let activeConversationId: string | null = null;







// -----------------------------------------------------------
// setActiveConversation
// -----------------------------------------------------------
//
// Used by:
//   - hooks/useConversation.ts — the focus effect claims the
//     room it is rendering
// -----------------------------------------------------------

export function setActiveConversation(conversationId: string): void {
  activeConversationId = conversationId;
}







// -----------------------------------------------------------
// clearActiveConversation
// -----------------------------------------------------------
//
// Used by:
//   - hooks/useConversation.ts — the focus effect's cleanup
// -----------------------------------------------------------

export function clearActiveConversation(conversationId: string): void {
  // Only the holder releases — a room blurring AFTER the next
  // one focused must not wipe the newer claim
  if (activeConversationId === conversationId) activeConversationId = null;
}







// -----------------------------------------------------------
// getActiveConversation
// -----------------------------------------------------------
//
// Used by:
//   - the host's unread counter (hooks/useUnreadCount.ts) and
//     conversation list (app/(main)/tabs/messages.tsx) — both
//     skip arrivals for the room already on screen
// -----------------------------------------------------------

export function getActiveConversation(): string | null {
  return activeConversationId;
}
