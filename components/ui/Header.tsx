import Sidebar from '@/components/Drawer/Sidebar';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View, ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface HeaderProps extends ViewProps {
  title: string;
  right?: React.ReactNode;
  left?: React.ReactNode;
}

export default function Header({ title, right, left, style, ...props }: HeaderProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { t } = useTranslation();
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: '#7B003F' }}>
      <View className="bg-primary px-lg py-md flex-row items-center" style={style} {...props}>
        <Pressable
          onPress={() => setDrawerOpen(true)}
          onPressIn={() => {
            if (process.env.EXPO_OS === 'ios') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('header.openMenu')}
          style={({ pressed }) => [
            {
              width: 44,
              height: 44,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 16,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="menu" size={24} color="#FFFFFF" />
        </Pressable>
        <Text className="text-white text-xl font-raleway-bold flex-1" style={{ marginLeft: 4 }}>{title}</Text>
        {right ? <View>{right}</View> : null}
      </View>
      <Sidebar visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </SafeAreaView>
  );
}

