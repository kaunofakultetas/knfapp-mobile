import { decodeHtmlEntities } from '@/services/htmlDecode';
import type { Conversation } from '@/types';
import { Ionicons } from '@expo/vector-icons';
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

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false} friction={2}>
      <Pressable
        className="flex-row items-center rounded-xl p-3.5 bg-white my-1"
        style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}
        onPress={onPress}
        onLongPress={onLongPress}
      >
        <View className="w-12 h-12 rounded-full bg-primary/10 items-center justify-center mr-3">
          <Ionicons
            name={item.type === 'group' ? 'people' : 'chatbubble-ellipses'}
            size={22}
            color="#7B003F"
          />
        </View>

        <View className="flex-row justify-between flex-1">
          <View className="flex-1 mr-3">
            <Text className="text-text-primary text-base font-raleway-bold" numberOfLines={1}>{decodeHtmlEntities(item.title)}</Text>
            <Text className="text-text-secondary text-sm font-raleway mt-1" numberOfLines={1}>
              {lastMessage?.text ? decodeHtmlEntities(lastMessage.text) : t('messages.tapToStart')}
            </Text>
            {item.type === 'group' && (
              <Text className="text-xs text-text-secondary font-raleway mt-0.5">{t('messages.members', { count: item.participants.length })}</Text>
            )}
          </View>
          <View className="items-end ml-2">
            <Text className="text-text-secondary text-xs font-raleway">
              {lastMessage?.time ? lastMessage.time : t('messages.now')}
            </Text>
            {item.pinned && (
              <Ionicons name="pin" size={11} color="#7B003F" style={{ marginTop: 4 }} />
            )}
            {item.unreadCount ? (
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


