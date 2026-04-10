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
    <TouchableOpacity activeOpacity={0.9} onLongPress={onLongPress} className={`my-1 px-3 py-2.5 rounded-xl max-w-[80%] ${bubbleBase}`}>
      {!item.isOwn && (
        <Text className="text-xs font-raleway-bold text-primary mb-1">{item.user}</Text>
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
          <Text className={`text-base font-raleway ${item.isOwn ? 'text-white' : 'text-text-primary'}`}>
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
        <Text className={`text-xs ${item.isOwn ? 'text-white/70' : 'text-gray-500'} font-raleway`}>{item.time}</Text>
        {item.isOwn && item.status === 'failed' && (
          <Ionicons name="alert-circle" size={14} color="#fca5a5" style={{ marginLeft: 4 }} />
        )}
        {item.isOwn && item.status === 'read' && (
          <Ionicons name="checkmark-done" size={14} color="#60a5fa" style={{ marginLeft: 4 }} />
        )}
        {item.isOwn && item.status === 'delivered' && (
          <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.8)" style={{ marginLeft: 4 }} />
        )}
        {item.isOwn && item.status === 'sent' && (
          <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.8)" style={{ marginLeft: 4 }} />
        )}
      </View>
    </TouchableOpacity>
  );
}


