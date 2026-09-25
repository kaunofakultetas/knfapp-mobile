// -----------------------------------------------------------
//  [*] UI — ErrorState
//
//  What a screen shows when a load failed and no cache could
//  fill in. Two flavors: the plain unexpected error (alert
//  icon on a danger wash) and `offline` (cloud icon on a
//  neutral wash) — the default message follows the flavor
//  when the caller passes none. The retry button is not
//  optional: a failure is never a dead end. The message is
//  announced when it appears (a screen reader would otherwise
//  sit on a vanished spinner in silence) and read in the
//  app's language.
// -----------------------------------------------------------

// JS-side icon color
import { useTheme } from '@/hooks/useTheme';

// Layout + the retry button
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Text, View } from 'react-native';
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
// Everything derives from the single `offline` flag — icon,
// wash and the default copy when no message is passed; the
// retry Button always renders, with `retrying` threaded
// through as its spinner so a slow retry is visibly in
// flight.
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
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();


  // Offline reads as circumstance (neutral), failure as danger
  const icon = offline ? 'cloud-offline-outline' : 'alert-circle-outline';
  const text = message ?? (offline ? t('error.offline') : t('error.unexpected'));


  // The failure is a status change the screen reader must hear —
  // once per message, not on every re-render
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(text);
  }, [text]);


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

      <Text
        className="text-center font-raleway-semibold text-lg text-ink"
        accessibilityLanguage={i18n?.language}
      >
        {text}
      </Text>

      <View className="mt-lg">
        <Button title={t('common.tryAgain')} onPress={onRetry} loading={retrying} />
      </View>

    </View>
  );
}
