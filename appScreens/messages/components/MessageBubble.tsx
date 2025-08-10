import { Ionicons } from '@expo/vector-icons';
// Visual representation of a single chat message (text/image/status/reactions).
// Keeps presentation concerns decoupled from data flow.
import React from 'react';
import { Image, Pressable, Text, TouchableOpacity, View } from 'react-native';
import type { ChatUIMessage } from './types';

export default function MessageBubble({
  item,
  onLongPress,
  onPressReactions,
  onPressImage,
}: {
  item: ChatUIMessage;
  onLongPress: () => void;
  onPressReactions: () => void;
  onPressImage: (uri: string) => void;
}) {
  const isImage = !!item.imageUrl;
  const bubbleBase = `${item.isOwn ? 'self-end bg-primary' : 'self-start bg-white border border-gray-200'}`;
  return (
    <TouchableOpacity activeOpacity={0.9} onLongPress={onLongPress} className={`my-1 p-2.5 rounded-lg max-w-[80%] ${bubbleBase}`}>
      {!item.isOwn && (
        <Text className="text-xs font-bold text-primary mb-1">{item.user}</Text>
      )}
      {isImage ? (
        <View>
          <Pressable onPress={() => onPressImage(item.imageUrl!)} onLongPress={onLongPress}>
            <Image
              source={{ uri: item.imageUrl! }}
              style={{ width: 240, height: 180, borderRadius: 12 }}
              resizeMode="cover"
            />
          </Pressable>
          {!!item.reactions?.length && (
            <Pressable onPress={onPressReactions} className="absolute bottom-1 right-1 bg-white/90 px-1.5 py-0.5 rounded-full border border-gray-200 flex-row items-center">
              {item.reactions.map((r) => (
                <Text key={r.emoji} className="text-xs mr-1">
                  {r.emoji} {r.count ?? r.byUserIds?.length ?? 1}
                </Text>
              ))}
            </Pressable>
          )}
        </View>
      ) : (
        <View>
          <Text className={`text-base ${item.isOwn ? 'text-white' : 'text-black'}`}>
            {item.text} {item.liked ? '❤️' : ''}
          </Text>
          {!!item.reactions?.length && (
            <Pressable onPress={onPressReactions} className={`self-${item.isOwn ? 'end' : 'start'} mt-1 bg-white/90 px-1.5 py-0.5 rounded-full border border-gray-200 flex-row items-center`}>
              {item.reactions.map((r) => (
                <Text key={r.emoji} className="text-xs mr-1">
                  {r.emoji} {r.count ?? r.byUserIds?.length ?? 1}
                </Text>
              ))}
            </Pressable>
          )}
        </View>
      )}
      <View className={`flex-row items-center mt-1 ${item.isOwn ? 'self-end' : ''}`}>
        <Text className={`text-xs ${item.isOwn ? 'text-white/70' : 'text-gray-500'}`}>{item.time}</Text>
        {item.isOwn && (
          <Ionicons name={item.status === 'read' ? 'checkmark-done' : 'checkmark'} size={14} color={'white'} style={{ marginLeft: 6 }} />
        )}
      </View>
    </TouchableOpacity>
  );
}


