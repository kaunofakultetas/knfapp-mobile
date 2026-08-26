// -----------------------------------------------------------
//  [*] Chat — MessageList
//
//  The room's message feed as an INVERTED FlatList over
//  newest-first data — stick-to-bottom, keyboard behavior and
//  history paging all fall out of the platform instead of the
//  old manual scrollToEnd bookkeeping (which animated through
//  the whole history on open). Reaching the visual top
//  (onEndReached in inverted coordinates) asks for the next
//  older page through the before-cursor.
//
//  New messages: at offset 0 the list is pinned to the bottom
//  and shows them by itself; an own send scrolls back down
//  from anywhere. New-message detection compares the newest
//  message ID — length checks broke as soon as paging could
//  append at the other end. The jump-to-latest button appears
//  purely from scroll position (offset past a threshold).
//
//  Scrolling does NOT force-dismiss the keyboard —
//  keyboardDismissMode 'interactive' ('on-drag' on Android)
//  lets the reader keep composing while browsing history.
//
//  Used by:
//    - app/(main)/chat-room/index.tsx — the chat room screen
// -----------------------------------------------------------

// Bubble renderer, jump button and the message shape
import MessageBubble from '@/components/chat/MessageBubble';
import ScrollToBottomButton from '@/components/chat/ScrollToBottomButton';
import type { ChatMessage } from '@/types';

// Brand tints for the paging spinner and pull-to-refresh
import { useTheme } from '@/hooks/useTheme';

// Primitives
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Platform, RefreshControl, View } from 'react-native';


// Inverted offset past which the reader counts as "away from
// the latest messages" and the jump button appears
const AWAY_FROM_BOTTOM_OFFSET = 200;







// -----------------------------------------------------------
// MessageList (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/chat-room/index.tsx — the chat room screen
// -----------------------------------------------------------

export default function MessageList({
  messages,
  refreshing,
  onRefresh,
  loadingOlder,
  hasMore,
  onLoadOlder,
  onLongPress,
  onPressReactions,
  onPressImage,
  onRetry,
}: {
  messages: ChatMessage[];
  refreshing: boolean;
  onRefresh: () => void;
  loadingOlder: boolean;
  hasMore: boolean;
  onLoadOlder: () => void;
  onLongPress: (message: ChatMessage) => void;
  onPressReactions: (message: ChatMessage) => void;
  onPressImage: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);


  // Newest message ID — the length-proof new-message detector
  // (older pages append at the other end and never change it)
  const newestIdRef = useRef<string | null>(messages[0]?.id ?? null);


  // An own send pulls the view back to the latest; incoming
  // messages only appear in place (the inverted list is pinned
  // at offset 0 anyway when the reader is at the bottom)
  useEffect(() => {
    const newest = messages[0];
    if (!newest || newest.id === newestIdRef.current) return;

    newestIdRef.current = newest.id;
    if (newest.isOwn) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [messages]);


  const jumpToLatest = () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setAwayFromBottom(false);
  };


  return (
    <View className="flex-1">

      <FlatList
        ref={listRef}
        inverted
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            onLongPress={onLongPress}
            onPressReactions={onPressReactions}
            onPressImage={onPressImage}
            onRetry={onRetry}
          />
        )}
        className="flex-1"
        contentContainerClassName="px-md py-sm"
        // Visual top of the inverted list → page in older history
        onEndReached={() => {
          if (hasMore && !loadingOlder) onLoadOlder();
        }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loadingOlder ? (
            <View className="items-center py-sm">
              <ActivityIndicator size="small" color={colors.brand} />
            </View>
          ) : null
        }
        // In inverted coordinates offset 0 IS the newest message
        onScroll={(e) => {
          const away = e.nativeEvent.contentOffset.y > AWAY_FROM_BOTTOM_OFFSET;
          setAwayFromBottom((prev) => (prev === away ? prev : away));
        }}
        scrollEventThrottle={100}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
            progressBackgroundColor={colors.surface}
          />
        }
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />

      {awayFromBottom && (
        <ScrollToBottomButton
          bottomInset={0}
          label={t('chat.scrollToLatest')}
          onPress={jumpToLatest}
        />
      )}

    </View>
  );
}
