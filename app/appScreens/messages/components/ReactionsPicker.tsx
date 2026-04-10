// Lightweight emoji picker. Selection semantics are enforced in the hook,
// this component only renders state and reports intent.
import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

export default function ReactionsPicker({
  visible,
  options,
  selectedBySelf,
  onPick,
  onClear,
  onClose,
}: {
  visible: boolean;
  options: string[];
  selectedBySelf: (emoji: string) => boolean;
  onPick: (emoji: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/30 items-center justify-end" onPress={onClose}>
        <View className="mb-24 bg-white rounded-xl px-3 py-2 flex-row items-center">
          {options.map((e) => {
            const selected = selectedBySelf(e);
            return (
              <Pressable key={e} onPress={() => onPick(e)} className="px-2 py-1">
                {selected ? (
                  <View className="w-9 h-9 rounded-full bg-gray-700 items-center justify-center">
                    <Text style={{ fontSize: 20, color: 'white' }}>{e}</Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 28 }}>{e}</Text>
                )}
              </Pressable>
            );
          })}
          <Pressable onPress={onClear} className="px-2 py-1 ml-1 rounded-full bg-gray-100">
            <Text style={{ fontSize: 22, color: '#6B7280' }}>🚫</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}


