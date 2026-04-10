import { searchMessagesApi, type MessageSearchResult } from '@/services/api';
import { decodeHtmlEntities } from '@/services/htmlDecode';
import { Ionicons } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ImageViewerModal from './components/ImageViewerModal';
import InputBar from './components/InputBar';
import MessageList from './components/MessageList';
import ReactionsPicker from './components/ReactionsPicker';
import ReactionsViewer from './components/ReactionsViewer';
import type { ChatUIMessage } from './components/types';
import { useChatRoom } from './hooks/useChatRoom';

type UIMessage = ChatUIMessage;

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
    typingText,
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
    retryMessage,
  } = useChatRoom(conversationId as string);

  // ── Message search state ────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MessageSearchResult[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim() || !conversationId) {
      setSearchResults([]);
      setSearchTotal(0);
      return;
    }
    setSearchLoading(true);
    try {
      const resp = await searchMessagesApi(conversationId, q.trim(), 30);
      setSearchResults(resp.messages);
      setSearchTotal(resp.total);
    } catch {
      setSearchResults([]);
      setSearchTotal(0);
    } finally {
      setSearchLoading(false);
    }
  }, [conversationId]);

  const onSearchTextChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => doSearch(text), 400);
  }, [doSearch]);

  const toggleSearch = useCallback(() => {
    if (searchOpen) {
      setSearchOpen(false);
      setSearchQuery('');
      setSearchResults([]);
      setSearchTotal(0);
    } else {
      setSearchOpen(true);
    }
  }, [searchOpen]);

  // Screen-level concern: set the header title and search button
  useEffect(() => {
    navigation.setOptions({
      title: (title as string) || t('chat.title'),
      headerRight: () => (
        <Pressable onPress={toggleSearch} hitSlop={8} style={{ marginRight: 8 }}>
          <Ionicons
            name={searchOpen ? 'close' : 'search'}
            size={22}
            color="#7B003F"
          />
        </Pressable>
      ),
    });
  }, [navigation, title, t, searchOpen, toggleSearch]);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-100"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <SafeAreaView className="flex-1">
        {/* Message search bar */}
        {searchOpen && (
          <View className="bg-white border-b border-gray-200 px-3 py-2">
            <View className="flex-row items-center bg-gray-50 rounded-lg px-3 py-2">
              <Ionicons name="search" size={16} color="#9E9E9E" />
              <TextInput
                className="flex-1 text-text-primary font-raleway text-sm ml-2"
                placeholder={t('chat.searchPlaceholder')}
                placeholderTextColor="#9E9E9E"
                value={searchQuery}
                onChangeText={onSearchTextChange}
                autoFocus
              />
              {searchLoading && <ActivityIndicator size="small" color="#7B003F" />}
            </View>
            {searchQuery.trim().length > 0 && !searchLoading && (
              <Text className="text-xs text-text-secondary font-raleway mt-1.5 ml-1">
                {searchTotal > 0
                  ? t('chat.searchResults', { count: searchTotal })
                  : t('chat.noSearchResults')}
              </Text>
            )}
          </View>
        )}

        {/* Search results list (replaces chat when searching) */}
        {searchOpen && searchResults.length > 0 ? (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            className="flex-1 bg-gray-50"
            renderItem={({ item }) => (
              <View
                className={`mx-3 my-1.5 p-3 rounded-xl ${item.isOwn ? 'bg-primary/10' : 'bg-white'}`}
              >
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-xs font-raleway-bold text-primary">
                    {decodeHtmlEntities(item.senderName)}
                  </Text>
                  <Text className="text-xs text-text-secondary font-raleway">{item.time}</Text>
                </View>
                <Text className="text-sm text-text-primary font-raleway">
                  {decodeHtmlEntities(item.text)}
                </Text>
              </View>
            )}
          />
        ) : (
          <>
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
              onRetry={retryMessage}
            />
            {/* Typing indicator */}
            {typingText && (
              <View className="px-4 py-1.5 bg-gray-50 border-t border-gray-100">
                <Text className="text-xs text-text-secondary italic font-raleway">{typingText}</Text>
              </View>
            )}
            {/* Emoji pick row (inline) */}
            {emojiBarOpen && (
              <View className="px-4 py-2 bg-white border-t border-gray-200">
                <View className="flex-row">
                  {['\u{1F600}','\u{1F602}','\u{1F60D}','\u{1F62E}','\u{1F622}','\u{1F621}','\u{1F44D}','\u{1F64F}'].map(e => (
                    <Pressable key={e} className="mr-2" onPress={() => setNewMessage(newMessage + e)}>
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
          </>
        )}

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

