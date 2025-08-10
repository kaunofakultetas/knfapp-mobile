import { useHeaderHeight } from '@react-navigation/elements';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ImageViewerModal from './components/ImageViewerModal';
import InputBar from './components/InputBar';
import MessageList from './components/MessageList';
import ReactionsPicker from './components/ReactionsPicker';
import ReactionsViewer from './components/ReactionsViewer';
import type { ChatUIMessage } from './components/types';
import { useChatRoom } from './hooks/useChatRoom';

type UIMessage = ChatUIMessage;

// MessageBubble now used inside MessageList

export default function ChatRoomScreen() {
  const { conversationId, title } = useLocalSearchParams<{ conversationId: string; title: string }>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const {
    messages,
    newMessage,
    emojiBarOpen,
    reactionOptions,
    reactionPickerOpen,
    reactionViewerOpen,
    reactionViewerRows,
    imageViewerOpen,
    imageViewerIndex,
    imageUrls,
    setNewMessage,
    setEmojiBarOpen,
    setReactionPickerOpen,
    setReactionViewerOpen,
    setImageViewerOpen,
    setImageViewerIndex,
    sendMessage,
    sendThumbsUp,
    attachImage,
    openReactionPicker,
    applyReaction,
    clearReaction,
    openReactionsViewer,
    openImageViewer,
    reactionTargetId,
  } = useChatRoom(conversationId as string);

  // Image viewer centering handled inside ImageViewerModal

  // handled by MessageList

  // Screen-level concern: set the header title from route param or fallback
  useEffect(() => {
    navigation.setOptions({ title: (title as string) || t('chat.title') });
  }, [navigation, title, t]);

  // data loading handled by useChatRoom

  // handled by MessageList

  // sending/attachments handled by useChatRoom

  // Picker open handled by hook's openReactionPicker

  // reactions handled by useChatRoom

  // reactions handled by useChatRoom

  // Like toggling could be implemented similarly via hook if needed

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-100"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <SafeAreaView className="flex-1">
        <MessageList
          messages={messages}
          bottomInset={insets.bottom}
          scrollButtonLabel={t('common.next') || 'Scroll to latest'}
          onLongPress={(item) => openReactionPicker(item.id)}
          onPressReactions={(item) => {
            openReactionsViewer(item);
          }}
          onPressImage={(uri) => {
            openImageViewer(uri);
          }}
        />
        {/* Emoji pick row (inline) */}
        {emojiBarOpen && (
          <View className="px-4 py-2 bg-white border-t border-gray-200">
            <View className="flex-row">
              {['😀','😂','😍','😮','😢','😡','👍','🙏'].map(e => (
                <Pressable key={e} className="mr-2" onPress={() => setNewMessage(v => (v || '') + e)}>
                  <Text style={{ fontSize: 22 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        <InputBar
          value={newMessage}
          onChange={setNewMessage}
          onSend={sendMessage}
          onSendThumbsUp={sendThumbsUp}
          onAttachImage={attachImage}
          onToggleEmojiBar={() => setEmojiBarOpen((v) => !v)}
          bottomInset={insets.bottom}
          placeholder={t('chat.inputPlaceholder')}
        />

        <ReactionsPicker
          visible={reactionPickerOpen}
          options={reactionOptions}
          selectedBySelf={(e) => (messages.find((m) => m.id === reactionTargetId)?.reactions || []).some((r) => r.emoji === e && (r.byUserIds || []).includes('self'))}
          onPick={(e) => applyReaction(e)}
          onClear={clearReaction}
          onClose={() => setReactionPickerOpen(false)}
        />

        <ReactionsViewer
          visible={reactionViewerOpen}
          rows={reactionViewerRows}
          onClose={() => setReactionViewerOpen(false)}
        />

        <ImageViewerModal
          visible={imageViewerOpen}
          imageUris={imageUrls}
          initialIndex={imageViewerIndex}
          topInset={insets.top}
          bottomInset={insets.bottom}
          onRequestClose={() => setImageViewerOpen(false)}
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

