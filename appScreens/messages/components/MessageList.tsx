// Renders the scrollable list of chat messages and encapsulates all scroll UX rules
// (auto-scroll only when appropriate, show jump-to-latest when user is reading history).
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, View } from 'react-native';
import MessageBubble from './MessageBubble';
import ScrollToBottomButton from './ScrollToBottomButton';
import type { ChatUIMessage } from './types';

export default function MessageList({
  messages,
  bottomInset,
  scrollButtonLabel,
  onLongPress,
  onPressReactions,
  onPressImage,
}: {
  messages: ChatUIMessage[];
  bottomInset: number;
  scrollButtonLabel?: string;
  onLongPress: (item: ChatUIMessage) => void;
  onPressReactions: (item: ChatUIMessage) => void;
  onPressImage: (uri: string) => void;
}) {
  const listRef = useRef<FlatList<ChatUIMessage>>(null);
  const isAtBottomRef = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const pendingAutoScrollRef = useRef(false);
  const prevMessagesLenRef = useRef(0);

  // Start at the latest messages. We avoid animation here to prevent a visible jump on mount.
  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: false });
    isAtBottomRef.current = true;
    setShowScrollToBottom(false);
  }, []);

  // Decide whether to auto-scroll (only if the user is already at bottom or it's our own message)
  // otherwise surface an unobtrusive jump-to-latest affordance.
  useEffect(() => {
    const prevLen = prevMessagesLenRef.current;
    const currLen = messages.length;
    if (currLen > prevLen) {
      const last = messages[currLen - 1];
      const lastIsOwn = !!last?.isOwn;
      if (lastIsOwn || isAtBottomRef.current) {
        pendingAutoScrollRef.current = true;
        setShowScrollToBottom(false);
      } else {
        setShowScrollToBottom(true);
      }
    }
    prevMessagesLenRef.current = currLen;
  }, [messages]);

  return (
    <View className="flex-1">
      <FlatList
        className="flex-1 px-4 py-2.5"
        data={messages}
        keyExtractor={(item) => item.id}
        // Perform deferred scrolling only after layout settles to avoid fighting RN layout
        onContentSizeChange={() => {
          if (pendingAutoScrollRef.current) {
            pendingAutoScrollRef.current = false;
            requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
            isAtBottomRef.current = true;
            setShowScrollToBottom(false);
          }
        }}
        // Track whether the user is near the end; a small threshold keeps the button from flickering
        onScroll={(e) => {
          const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
          const paddingToBottom = 60;
          const atBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - paddingToBottom;
          if (atBottom !== isAtBottomRef.current) {
            isAtBottomRef.current = atBottom;
            if (atBottom) setShowScrollToBottom(false);
          }
        }}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <MessageBubble
            item={item}
            onLongPress={() => onLongPress(item)}
            onPressReactions={() => onPressReactions(item)}
            onPressImage={(uri) => onPressImage(uri)}
          />
        )}
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={() => Keyboard.dismiss()}
        showsVerticalScrollIndicator={false}
        ref={listRef}
        keyboardShouldPersistTaps="handled"
      />

      {showScrollToBottom && (
        <ScrollToBottomButton
          bottomInset={bottomInset}
          label={scrollButtonLabel}
          onPress={() => {
            pendingAutoScrollRef.current = false;
            requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
            isAtBottomRef.current = true;
            setShowScrollToBottom(false);
          }}
        />
      )}
    </View>
  );
}


