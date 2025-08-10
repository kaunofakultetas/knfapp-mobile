import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

export default function ScrollToBottomButton({
  bottomInset,
  onPress,
  label,
}: {
  bottomInset: number;
  onPress: () => void;
  label?: string;
}) {
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: bottomInset + 72,
        alignItems: 'center',
      }}
    >
      <Pressable
        onPress={onPress}
        style={{
          backgroundColor: '#7B003F',
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
          elevation: 3,
        }}
        accessibilityRole="button"
        accessibilityLabel={label || 'Scroll to latest'}
      >
        <Ionicons name="chevron-down" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}


