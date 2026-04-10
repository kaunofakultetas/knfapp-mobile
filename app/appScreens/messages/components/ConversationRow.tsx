import { decodeHtmlEntities } from '@/services/htmlDecode';
import type { Conversation } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

/** Get the avatar URL for a direct conversation (other participant's avatar). */
function getDirectAvatar(item: Conversation, currentUserId?: string): string | undefined {
  if (item.type !== 'direct') return undefined;
  const other = item.participants.find((p) => p.id !== currentUserId);
  return other?.avatarUrl || undefined;
}

export default function ConversationRow({
  item,
  onPress,
  onLongPress,
  onTogglePin,
  onDelete,
  isOnline,
  currentUserId,
}: {
  item: Conversation;
  onPress: () => void;
  onLongPress: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  isOnline?: boolean;
  currentUserId?: string;
}) {
  const { t } = useTranslation();
  const lastMessage = item.messages[item.messages.length - 1];
  const avatarUrl = getDirectAvatar(item, currentUserId);
  const hasUnread = !!item.unreadCount && item.unreadCount > 0;

  const renderRightActions = () => (
    <View className="flex-row h-full">
      <Pressable className="bg-gray-100 w-[70px] items-center justify-center" onPress={onTogglePin}>
        <Ionicons name={item.pinned ? 'pin-outline' : 'pin'} size={18} color="#757575" />
        <Text className="text-xs text-text-secondary font-raleway mt-1">{item.pinned ? t('messages.unpin') : t('messages.pin')}</Text>
      </Pressable>
      <Pressable className="bg-danger w-[70px] items-center justify-center rounded-r-xl" onPress={onDelete}>
        <Ionicons name="trash-outline" size={18} color="white" />
        <Text className="text-xs text-white font-raleway mt-1">{t('messages.delete')}</Text>
      </Pressable>
    </View>
  );

  // Build last message preview with sender name for group chats
  let messagePreview = '';
  if (lastMessage?.text) {
    const decoded = decodeHtmlEntities(lastMessage.text);
    if (item.type === 'group' && lastMessage.senderName) {
      messagePreview = `${lastMessage.senderName}: ${decoded}`;
    } else {
      messagePreview = decoded;
    }
  }

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false} friction={2}>
      <Pressable
        className="flex-row items-center rounded-xl p-3.5 bg-white my-1"
        style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}
        onPress={onPress}
        onLongPress={onLongPress}
      >
        {/* Avatar with online indicator */}
        <View className="relative mr-3">
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              className="w-12 h-12 rounded-full"
              style={{ backgroundColor: '#f3f4f6' }}
            />
          ) : (
            <View className="w-12 h-12 rounded-full bg-primary/10 items-center justify-center">
              {item.avatarEmoji ? (
                <Text style={{ fontSize: 22 }}>{item.avatarEmoji}</Text>
              ) : (
                <Ionicons
                  name={item.type === 'group' ? 'people' : 'chatbubble-ellipses'}
                  size={22}
                  color="#7B003F"
                />
              )}
            </View>
          )}
          {/* Online status dot for direct chats */}
          {item.type === 'direct' && isOnline && (
            <View
              className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-white"
            />
          )}
        </View>

        <View className="flex-row justify-between flex-1">
          <View className="flex-1 mr-3">
            <Text
              className={`text-base ${hasUnread ? 'font-raleway-bold text-text-primary' : 'font-raleway-bold text-text-primary'}`}
              numberOfLines={1}
            >
              {decodeHtmlEntities(item.title)}
            </Text>
            <Text
              className={`text-sm mt-1 ${hasUnread ? 'font-raleway-bold text-text-primary' : 'font-raleway text-text-secondary'}`}
              numberOfLines={1}
            >
              {messagePreview || t('messages.tapToStart')}
            </Text>
            {item.type === 'group' && (
              <Text className="text-xs text-text-secondary font-raleway mt-0.5">
                {t('messages.members', { count: item.participants.length })}
              </Text>
            )}
          </View>
          <View className="items-end ml-2">
            <Text className={`text-xs ${hasUnread ? 'font-raleway-bold text-primary' : 'font-raleway text-text-secondary'}`}>
              {lastMessage?.time ? lastMessage.time : t('messages.now')}
            </Text>
            {item.pinned && (
              <Ionicons name="pin" size={11} color="#7B003F" style={{ marginTop: 4 }} />
            )}
            {hasUnread ? (
              <View className="bg-primary rounded-full mt-1.5 self-end min-w-[22px] h-[22px] px-1.5 items-center justify-center">
                <Text className="text-white text-xs font-raleway-bold">{item.unreadCount}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Swipeable>
  );
}
