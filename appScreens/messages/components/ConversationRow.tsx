import type { Conversation } from '@/types';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

export default function ConversationRow({
  item,
  onPress,
  onLongPress,
  onTogglePin,
  onDelete,
}: {
  item: Conversation;
  onPress: () => void;
  onLongPress: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const lastMessage = item.messages[item.messages.length - 1];
  const renderRightActions = () => (
    <View className="flex-row h-full">
      <Pressable className="bg-gray-200 w-[70px] items-center justify-center" onPress={onTogglePin}>
        <Text>{item.pinned ? t('messages.unpin') : t('messages.pin')}</Text>
      </Pressable>
      <Pressable className="bg-danger w-[70px] items-center justify-center" onPress={onDelete}>
        <Text className="text-white">{t('messages.delete')}</Text>
      </Pressable>
    </View>
  );

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false} friction={2}>
      <Pressable className="flex-row justify-between items-center rounded-md p-4 bg-white shadow-sm my-1" onPress={onPress} onLongPress={onLongPress}>
        <View className="w-11 h-11 rounded-full bg-gray-100 items-center justify-center mr-3">
          <Text className="text-xl">{item.type === 'group' ? (item.avatarEmoji || '👥') : '💬'}</Text>
        </View>

        <View className="flex-row justify-between flex-1">
          <View>
            <Text className="text-gray-800 text-lg font-bold">{item.title}</Text>
            <Text className="text-gray-800 text-sm opacity-70 mt-1.5" numberOfLines={1}>
              {lastMessage?.text ? lastMessage.text : t('messages.tapToStart')}
            </Text>
            {item.type === 'group' && (
              <Text className="text-[11px] text-gray-500 mt-0.5">{t('messages.members', { count: item.participants.length })}</Text>
            )}
          </View>
          <View className="items-end">
            <Text className="opacity-50 text-xs">
              {lastMessage?.time ? lastMessage.time : t('messages.now')}
            </Text>
            <Pressable className="mt-1" onPress={onTogglePin} hitSlop={8}>
              <Text className="text-xs" style={{ color: item.pinned ? '#7B003F' : '#757575' }}>{item.pinned ? t('messages.unpin') : t('messages.pin')}</Text>
            </Pressable>
            {item.unreadCount ? (
              <View className="bg-primary rounded-full mt-1 self-end px-2 py-0.5">
                <Text className="text-white text-xs">{item.unreadCount}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Swipeable>
  );
}


