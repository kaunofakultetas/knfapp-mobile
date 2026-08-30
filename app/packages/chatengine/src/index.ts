// -----------------------------------------------------------
//  [*] chatengine — public surface
//
//  Pinned by __tests__/chatengineSurface.test.ts — adding an
//  export is a deliberate act, removing one is a breaking change.
// -----------------------------------------------------------

// The domain model and the transport contract
export type {
  ChatFile,
  ChatLinkPreview,
  ChatMessage,
  ChatMessageKind,
  ChatMessageStatus,
  ChatReaction,
  ChatReplyRef,
  ChatUser,
  ChatVideo,
  ConversationMeta,
  Participant,
  ReactionGroup,
} from './core/types';
export { TEMP_ID_PREFIX, isTempId } from './core/types';
export type {
  ChatEvent,
  ChatRealtime,
  ChatTransport,
  ChangesPage,
  EngineNotice,
  MessagesPage,
  NoticeCode,
  OutgoingMessage,
  PageCursor,
  RealtimeStatus,
  UploadAsset,
  UploadResult,
} from './core/transport';
export { TransportError, isRetryable, sendFailureCode, toTransportError, type TransportErrorKind } from './core/errors';
export { parseStamp, stampMs } from './core/time';
export {
  adoptTemp,
  appendOlderPage,
  applyChanges,
  applyReceipt,
  findTempFor,
  markDeleted,
  markEdited,
  mergeFirstPage,
  mergeResyncPage,
  normalizeForViewer,
  olderCursor,
  reactionsForViewer,
  restoreDeleted,
  sameRow,
  validateIngest,
  withSelfReaction,
} from './core/reducers';
export { draftKey, draftReplyKey, outboxKey, readOutbox, readOutboxTemps, writeOutbox, type OutboxEntry, type PickedAsset } from './core/outbox';
export { normalizeAssetName } from './core/assets';
export { forwardPayload, type ForwardSource } from './core/forward';
export { TaskQueue, getTaskQueue, taskKey, tasksStorageKey, type PendingTask } from './core/tasks';
export { clearActiveConversation, getActiveConversation, setActiveConversation } from './core/activeConversation';

// The host seam
export { ChatEngineProvider, defaultLimits, useChatEngine, type ChatEngineEnv, type EngineLimits } from './provider';
export { memoryStorage, type KeyValueStorage } from './provider/storage';

// The hooks
export { useConversation, type UseConversationResult } from './hooks/useConversation';
export { useComposer, type EditTarget, type ReplyTarget, type RetryTarget, type UseComposerResult } from './hooks/useComposer';
export { usePins, type UsePinsResult } from './hooks/usePins';
export { useRealtimeStatus } from './hooks/useRealtimeStatus';
export { DEFAULT_REACTION_OPTIONS, useReactions, type UseReactionsResult } from './hooks/useReactions';
export { useTyping, type TypingUser } from './hooks/useTyping';
export { useChatRoom, type UseChatRoomResult } from './hooks/useChatRoom';

// Testing aids (no jest dependency at import time; the contract
// suite only calls describe/it when invoked)
export { fakeTransport, type FakeTransport, type FakeTransportOptions } from './testing/fakeTransport';
export { describeTransportContract, type TransportHarness } from './testing/transportContract';
