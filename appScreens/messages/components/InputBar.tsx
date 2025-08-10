import { Ionicons } from '@expo/vector-icons';
// Composer for the chat. Keeps all layout and interaction details here so
// the screen only wires state and actions.
import React from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';

export default function InputBar({
  value,
  onChange,
  onSend,
  onSendThumbsUp,
  onAttachImage,
  onToggleEmojiBar,
  bottomInset,
  placeholder,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  onSendThumbsUp: () => void;
  onAttachImage: () => void;
  onToggleEmojiBar: () => void;
  bottomInset: number;
  placeholder: string;
}) {
  const hasText = value.trim().length > 0;
  return (
    <View className="flex-row items-end px-4 py-2.5 bg-white border-t border-gray-200" style={{ paddingBottom: Math.max(bottomInset, 8) }}>
      <TouchableOpacity onPress={onAttachImage} className="mr-2 w-10 h-10 rounded-full bg-gray-100 items-center justify-center">
        <Ionicons name="image" size={20} color={'#7B003F'} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onToggleEmojiBar} className="mr-2 w-10 h-10 rounded-full bg-gray-100 items-center justify-center">
        <Ionicons name="happy" size={20} color={'#7B003F'} />
      </TouchableOpacity>
      <TextInput
        className="flex-1 border border-gray-200 rounded-full px-4 py-2.5 mr-2.5 max-h-20 text-base"
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        multiline
        maxLength={500}
      />
      {hasText ? (
        <TouchableOpacity className={`bg-primary rounded-full w-10 h-10 justify-center items-center`} onPress={onSend}>
          <Ionicons name="send" size={20} color={'white'} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity className={`bg-primary/90 rounded-full w-10 h-10 justify-center items-center`} onPress={onSendThumbsUp}>
          <Ionicons name="thumbs-up" size={20} color={'white'} />
        </TouchableOpacity>
      )}
    </View>
  );
}


