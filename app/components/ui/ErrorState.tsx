// -----------------------------------------------------------
//  [*] UI — ErrorState
//
//  What a screen shows when a load failed and no cache could
//  fill in. Two flavors: the plain unexpected error (alert
//  icon on a danger wash) and `offline` (cloud icon on a
//  neutral wash) — the default message follows the flavor
//  when the caller passes none. The retry button is not
//  optional: a failure is never a dead end.
// -----------------------------------------------------------

// JS-side icon color
import { useTheme } from '@/hooks/useTheme';

// Layout + the retry button
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Button } from './Button';


interface ErrorStateProps {
  message?: string;
  offline?: boolean;
  // While true the retry button shows its loading spinner —
  // screens pass their refreshing flag so a slow retry is
  // visibly in flight instead of silently pending
  retrying?: boolean;
  onRetry: () => void;
}







// -----------------------------------------------------------
// ErrorState (default export)
// -----------------------------------------------------------
//
// Used by:
//   - every data screen when useLoad/useFeed reports error
// -----------------------------------------------------------

export default function ErrorState({
  message,
  offline = false,
  retrying = false,
  onRetry,
}: ErrorStateProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();


  // Offline reads as circumstance (neutral), failure as danger
  const icon = offline ? 'cloud-offline-outline' : 'alert-circle-outline';
  const text = message ?? (offline ? t('error.offline') : t('error.unexpected'));


  return (
    <View className="flex-1 items-center justify-center px-xl py-2xl">

      {/* Decorative icon — hidden from assistive tech */}
      <View
        className={
          offline
            ? 'mb-md items-center justify-center rounded-full bg-surface-soft'
            : 'mb-md items-center justify-center rounded-full bg-danger-soft'
        }
        style={{ width: 72, height: 72 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Ionicons
          name={icon}
          size={32}
          color={offline ? colors.inkSoft : colors.danger}
        />
      </View>

      <Text className="text-center font-raleway-semibold text-lg text-ink">
        {text}
      </Text>

      <View className="mt-lg">
        <Button title={t('common.tryAgain')} onPress={onRetry} loading={retrying} />
      </View>

    </View>
  );
}
