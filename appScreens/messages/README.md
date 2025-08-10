### Chat module architecture

This folder contains all code for the Messages feature (list of conversations and the chat room). The goal is to keep screens very thin, move logic into focused hooks, and keep UI in small, testable components.

### Entry points

- `messages.tsx`: Conversations list screen (rendered by `app/(main)/tabs/messages.tsx`).
- `chat-room.tsx`: Single conversation screen (navigated via `/(main)/chat-room?...`).

Routes are preserved under `app/(main)/*` as tiny re-export files so URL structure stays stable.

### Folder layout

- `components/`
  - `ConversationRow.tsx`: Single row in the conversations list.
  - `MessageList.tsx`: Renders chat messages. Owns FlatList behavior, auto-scroll, and the floating “scroll to bottom” button.
  - `MessageBubble.tsx`: UI for an individual message (text/image variants, timestamp, status).
  - `InputBar.tsx`: Composer (attach image, emojis toggle, send, thumbs-up).
  - `ImageViewerModal.tsx`: Fullscreen viewer with thumbnails (uses `react-native-awesome-gallery`).
  - `ReactionsPicker.tsx`: Bottom-sheet style emoji picker.
  - `ReactionsViewer.tsx`: Modal listing who reacted with which emoji.
  - `ScrollToBottomButton.tsx`: Floating button to jump to latest messages.
  - `types.ts`: UI-only types used by chat components.

- `hooks/`
  - `useChatRoom.ts`: Orchestrator hook. Composes smaller hooks below and exposes a clean API for the screen.
  - `useChatMessages.ts`: Loads messages/participants from storage, seeds mocks if needed, clears unread on enter.
  - `useChatComposer.ts`: Manages composer state and sending flows (text, 👍, image). Persists to storage.
  - `useChatReactions.ts`: Handles reaction picker/viewer state; applies/clears reactions and persists to storage.
  - `useChatViewer.ts`: Manages fullscreen image viewer state and derives `imageUrls`.

- `lib/`
  - `storage.ts`: AsyncStorage helpers: get/seed conversations, update one conversation, clear unread.
  - `mappers.ts`: Maps persisted `ChatMessage` to lightweight UI shape used by components.

### Data flow (chat room)

1) Screen (`chat-room.tsx`) calls `useChatRoom(conversationId)` → returns:
   - State: `messages`, `newMessage`, picker/viewer flags, `imageUrls`, indices, etc.
   - Actions: `sendMessage`, `sendThumbsUp`, `attachImage`, `openReactionPicker`, `applyReaction`, `clearReaction`, `openReactionsViewer`, `openImageViewer`.

2) UI wiring:
   - `MessageList` receives `messages` and handlers. It owns FlatList scrolling and the “scroll to bottom” button.
   - `InputBar` binds to composer actions/state.
   - `ImageViewerModal` shows fullscreen images with thumbnails, swipe-to-close, and a close button.
   - `ReactionsPicker` and `ReactionsViewer` are controlled by the hook.

3) Persistence:
   - All writes go through `lib/storage.ts` (`updateConversation`, etc.).
   - Mapping from persisted types to UI types is centralized in `lib/mappers.ts`.

### Key behaviors

- Auto-scroll: Only auto-scrolls when the user is already at bottom or when sending own messages; otherwise shows a floating jump-to-latest button.
- Image viewing: Uses `react-native-awesome-gallery` with `maxScale={5}` and a thumbnail rail that centers the active item and greys others.
- Reactions: Single-emoji-per-user behavior is enforced; picker highlights the selected emoji; viewer lists participants per emoji.
- Storage: Uses AsyncStorage; seeds with `MOCK_CONVERSATIONS` when empty; clears unread on entering a chat.

### Extending the module

- New message UI (e.g., file/audio):
  - Add rendering to `MessageBubble` (or create a specialized cell).
  - Extend composer/hook (`useChatComposer`) and `storage.ts` update payloads accordingly.

- Delivery/read receipts:
  - Update `storage.ts` to persist status and `mapChatMessageToUI` to surface it.
  - Render status in `MessageBubble`.

- System messages or events:
  - Define a message subtype in `types.ts` and render in `MessageBubble`.

- Performance:
  - `MessageList` already uses FlatList. For very long threads, consider pagination and windowed rendering; the hooks can expose `loadMore()` entry points.

### Conventions

- Keep chat-specific UI inside `appScreens/messages/components`.
- Keep storage and mapping in `lib/` and avoid direct AsyncStorage calls in screens/components.
- Put all side-effects and business logic in hooks; keep screens declarative.
- Use UI-only types from `components/types.ts` in the UI layer.

### Routing

- Conversations list is rendered by `app/(main)/tabs/messages.tsx` and delegates to `appScreens/messages/messages.tsx`.
- The route files under `app/(main)/chat-room/index.tsx` and `app/(main)/new-chat/index.tsx` re-export colocated screens to keep routes stable.

### Quick start

- Open a conversation: the list screen pushes `/(main)/chat-room?conversationId=...&title=...`.
- `chat-room.tsx` calls `useChatRoom(conversationId)` and wires returned state/actions to the components in `components/`.
- All storage reads/writes go through `lib/storage.ts`; do not call `AsyncStorage` directly in screens/components.

### Hook APIs (summary)

- `useChatRoom(conversationId)` returns a single object composed from smaller hooks:
  - State: `messages`, `newMessage`, `emojiBarOpen`, `reactionOptions`, `reactionPickerOpen`, `reactionTargetId`, `reactionViewerOpen`, `reactionViewerRows`, `imageViewerOpen`, `imageViewerIndex`, `imageUrls`
  - Setters: `setNewMessage`, `setEmojiBarOpen`, `setReactionPickerOpen`, `setReactionViewerOpen`, `setImageViewerOpen`, `setImageViewerIndex`
  - Actions: `sendMessage`, `sendThumbsUp`, `attachImage`, `openReactionPicker`, `applyReaction`, `clearReaction`, `openReactionsViewer`, `openImageViewer`

- `useChatMessages(conversationId)`
  - Returns: `{ messages, setMessages, participants }`
  - Loads/seeds conversations and clears unread on mount.

- `useChatComposer(conversationId, setMessages)`
  - Returns: `{ newMessage, setNewMessage, emojiBarOpen, setEmojiBarOpen, sendMessage, sendThumbsUp, attachImage }`
  - Appends new items to UI state and persists to storage.

- `useChatReactions(conversationId, messages, setMessages, participants)`
  - Returns: `{ reactionOptions, reactionPickerOpen, reactionTargetId, reactionViewerOpen, reactionViewerRows, setReactionPickerOpen, setReactionViewerOpen, openReactionPicker, openReactionsViewer, applyReaction, clearReaction }`
  - Enforces single-emoji-per-user and keeps counts in sync.

- `useChatViewer(messages)`
  - Returns: `{ imageViewerOpen, imageViewerIndex, imageUrls, setImageViewerOpen, setImageViewerIndex, openImageViewer }`

### Component props (summary)

- `MessageList`
  - Props: `messages`, `bottomInset`, `scrollButtonLabel`, `onLongPress(item)`, `onPressReactions(item)`, `onPressImage(uri)`
  - Owns FlatList config, “scroll to bottom” visibility and behavior.

- `MessageBubble`
  - Props: `item`, `onLongPress()`, `onPressReactions()`, `onPressImage(uri)`

- `InputBar`
  - Props: `value`, `onChange`, `onSend`, `onSendThumbsUp`, `onAttachImage`, `onToggleEmojiBar`, `bottomInset`, `placeholder`

- `ImageViewerModal`
  - Props: `visible`, `imageUris`, `initialIndex`, `topInset`, `bottomInset`, `onRequestClose`
  - Uses `react-native-awesome-gallery` and a centered thumbnail rail.

- `ReactionsPicker`, `ReactionsViewer`, `ScrollToBottomButton`
  - Small, focused primitives controlled by the hook state.

### Storage contract (AsyncStorage)

- Key: `conversations`
  - Value: `Conversation[]`
  - Conversation: `{ id, type: 'direct'|'group', title, participants: {id, displayName}[], messages: ChatMessage[], unreadCount?, lastUpdatedMs?, pinned?, avatarEmoji? }`
  - ChatMessage: `{ id, conversationId, senderId, senderName, text, time, status?: 'sent'|'read', liked?, imageUrl?, reactions?: Reaction[] }`
  - Reaction: `{ emoji: string, count?: number, bySelf?: boolean, byUserIds?: string[] }`

All reads/writes are implemented in `lib/storage.ts`:
- `getConversationsWithSeed()` seeds with `MOCK_CONVERSATIONS` on empty store
- `updateConversation(id, updater)` applies an immutable update
- `clearUnread(id)` sets `unreadCount` to 0 for a given conversation

### Sequence flows

- Enter chat
  - `useChatMessages` loads and maps messages, builds participants map, and clears unread.

- Send message/👍/image
  - `useChatComposer` appends UI item, schedules local “read” update for own message, then persists via `updateConversation`.
  - `MessageList` auto-scrolls only if the user is already at bottom (or message is own); otherwise shows the jump button.

- Reactions
  - `useChatReactions` opens picker, enforces single selection, updates counts and storage; viewer modal shows aggregated names.

- Images
  - `useChatViewer` opens modal with correct index and drives `ImageViewerModal`.

### Performance and UX

- FlatList is used with stable keys; heavy logic moved to hooks; scroll updates use `requestAnimationFrame` where appropriate.
- For very large threads, consider pagination and `getItemLayout`/windowing; a future `loadMore` API can be exposed from `useChatMessages`.
- The thumbnail rail centers the active image and prevents initial sliding with symmetric side insets.

### Accessibility & i18n

- Buttons include `accessibilityRole`/labels where relevant; extend as needed for your app’s a11y goals.
- All user-facing strings come from `i18n` (e.g., `chat.inputPlaceholder`, `messages.system`).

### Styling & theming

- Tailwind-style classes are used for consistency; primary color `#7B003F` is used in key accents.
- Components are UI-only and easy to restyle in isolation.

### Error handling & logging

- Storage helpers use try/catch and fall back to mocks on catastrophic errors.
- For production, consider adding a logger (Sentry, etc.) and surfacing non-fatal errors to the user when appropriate.

### Extending

- New message kinds (files/audio): extend `MessageBubble`, composer, and `updateConversation` payloads.
- Delivery receipts/typing indicators: add fields to `ChatMessage` and enhance `MessageBubble`.
- Real backend: swap storage helpers with API calls; keep the same `mappers.ts` boundary for consistent UI types.

### Dependencies & compatibility

- Expo SDK `~53`, React Native `0.79.x`, Reanimated `~3.17`, Gesture Handler `~2.24`.
- Fullscreen gallery: `react-native-awesome-gallery@^0.4` (configurable `maxScale`).

### Known limitations

- No pagination or message editing/deleting yet.
- Reactions are stored inline on messages; a normalized store may be preferable at scale.
- Mock data is in-memory + AsyncStorage; replace with API-backed sync for production.

### FAQ

- Why colocate `appScreens/messages/*` instead of routes?
  - Screens stay close to their components/hooks; routes are small re-export shims to keep URLs stable.

- Where should I put business logic?
  - In hooks under `hooks/` and data helpers under `lib/`. Keep screens declarative.

- How do I change max zoom or thumbnail size?
  - `ImageViewerModal` sets `maxScale={5}` and thumbnail sizing; adjust there.


