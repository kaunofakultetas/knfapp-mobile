// Summarizes who reacted with what. The grouping and name resolution are computed upstream.
import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

export default function ReactionsViewer({
  visible,
  rows,
  onClose,
}: {
  visible: boolean;
  rows: Array<{ emoji: string; names: string[] }>;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/30" onPress={onClose}>
        <View className="mt-auto mb-14 mx-4 bg-white rounded-2xl p-4">
          <Text className="text-lg font-raleway-bold text-text-primary mb-2">Reactions</Text>
          {rows.length === 0 ? (
            <Text className="text-text-secondary font-raleway">No reactions</Text>
          ) : (
            rows.map((row) => (
              <View key={row.emoji} className="mb-2">
                <View className="flex-row items-center mb-1">
                  <Text style={{ fontSize: 20, marginRight: 8 }}>{row.emoji}</Text>
                  <Text className="text-sm text-text-secondary font-raleway">{row.names.length}</Text>
                </View>
                <View className="flex-row flex-wrap">
                  {row.names.map((n, idx) => (
                    <View key={`${row.emoji}-${idx}`} className="px-2 py-1 mr-2 mb-2 bg-gray-100 rounded-full">
                      <Text className="text-sm text-text-primary font-raleway">{n}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
          <View className="mt-2 items-end">
            <Pressable onPress={onClose} className="px-4 py-2 bg-primary rounded-full">
              <Text className="text-white font-raleway-bold">Close</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}


