import { useChatComposer } from './useChatComposer';
import { useChatMessages } from './useChatMessages';
import { useChatReactions } from './useChatReactions';
import { useChatViewer } from './useChatViewer';

export function useChatRoom(conversationId: string) {
  const { messages, setMessages, participants } = useChatMessages(conversationId);
  const composer = useChatComposer(conversationId, setMessages);
  const reactions = useChatReactions(conversationId, messages, setMessages, participants);
  const viewer = useChatViewer(messages);

  return {
    messages,
    newMessage: composer.newMessage,
    emojiBarOpen: composer.emojiBarOpen,
    reactionOptions: reactions.reactionOptions,
    reactionPickerOpen: reactions.reactionPickerOpen,
    reactionTargetId: reactions.reactionTargetId,
    reactionViewerOpen: reactions.reactionViewerOpen,
    reactionViewerRows: reactions.reactionViewerRows,
    imageViewerOpen: viewer.imageViewerOpen,
    imageViewerIndex: viewer.imageViewerIndex,
    imageUrls: viewer.imageUrls,
    setNewMessage: composer.setNewMessage,
    setEmojiBarOpen: composer.setEmojiBarOpen,
    setReactionPickerOpen: reactions.setReactionPickerOpen,
    setReactionViewerOpen: reactions.setReactionViewerOpen,
    setImageViewerOpen: viewer.setImageViewerOpen,
    setImageViewerIndex: viewer.setImageViewerIndex,
    sendMessage: composer.sendMessage,
    sendThumbsUp: composer.sendThumbsUp,
    attachImage: composer.attachImage,
    openReactionPicker: reactions.openReactionPicker,
    applyReaction: reactions.applyReaction,
    clearReaction: reactions.clearReaction,
    openReactionsViewer: reactions.openReactionsViewer,
    openImageViewer: viewer.openImageViewer,
  } as const;
}


