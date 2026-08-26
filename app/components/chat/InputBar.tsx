// -----------------------------------------------------------
//  [*] Chat — InputBar
//
//  The composer strip: attach-image, emoji-row toggle, the
//  multiline draft input and a send button that turns into a
//  quick-👍 while the draft is empty. Owns the BOTTOM safe-
//  area inset itself (edges=['bottom']) — the screen applies
//  no inset of its own, so nothing is padded twice.
//
//  While an image uploads the attach button shows a spinner
//  and stops accepting taps. The 500-character limit gets a
//  live counter once the draft passes 400 characters instead
//  of the old silent truncation.
//
//  Split into (root component last):
//
//    RoundButton — one 44 pt circular icon action
//    InputBar    — the strip itself (default export)
// -----------------------------------------------------------

// Theme-side icon and placeholder colors
import { useTheme } from '@/hooks/useTheme';

// Primitives
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';


// Backend caps message text; the counter appears near the end
// instead of letting maxLength truncate silently
const MAX_MESSAGE_LENGTH = 500;
const COUNTER_THRESHOLD = 400;







// -----------------------------------------------------------
// RoundButton
// -----------------------------------------------------------
//
// One circular 44 pt icon action — the shared shape of the
// attach/emoji/send/like buttons, with role+label wired in.
//
// Used by:
//   - InputBar (below)
// -----------------------------------------------------------

function RoundButton({
  icon,
  label,
  onPress,
  brand = false,
  disabled = false,
  loading = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  brand?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {

  const { colors } = useTheme();


  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading }}
      className={
        brand
          ? 'h-11 w-11 items-center justify-center rounded-full bg-brand'
          : 'h-11 w-11 items-center justify-center rounded-full bg-surface-soft'
      }
    >
      {loading ? (
        <ActivityIndicator size="small" color={brand ? colors.onBrand : colors.brand} />
      ) : (
        <Ionicons name={icon} size={20} color={brand ? colors.onBrand : colors.brand} />
      )}
    </Pressable>
  );
}







// -----------------------------------------------------------
// InputBar (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/chat-room/index.tsx — the chat room screen
// -----------------------------------------------------------

export default function InputBar({
  value,
  onChangeText,
  onSend,
  onQuickLike,
  onAttachImage,
  onToggleEmoji,
  uploadingImage,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onQuickLike: () => void;
  onAttachImage: () => void;
  onToggleEmoji: () => void;
  uploadingImage: boolean;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  const hasText = value.trim().length > 0;
  const nearLimit = value.length > COUNTER_THRESHOLD;


  return (
    <SafeAreaView edges={['bottom']} className="border-t border-line bg-surface">

      {/* Live counter — visible only near the 500-char cap */}
      {nearLimit && (
        <Text className="px-md pt-xs text-right font-raleway text-xs text-ink-faint">
          {value.length}/{MAX_MESSAGE_LENGTH}
        </Text>
      )}

      <View className="flex-row items-end px-md py-sm">

        <View className="mr-sm">
          <RoundButton
            icon="image"
            label={uploadingImage ? t('chat.uploadingImage') : t('chat.attachImage')}
            onPress={onAttachImage}
            loading={uploadingImage}
          />
        </View>

        <View className="mr-sm">
          <RoundButton icon="happy" label={t('chat.chooseEmoji')} onPress={onToggleEmoji} />
        </View>

        <TextInput
          className="mr-sm max-h-24 flex-1 rounded-xl border border-line bg-surface-soft px-md py-sm font-raleway text-base text-ink"
          value={value}
          onChangeText={onChangeText}
          placeholder={t('chat.inputPlaceholder')}
          placeholderTextColor={colors.inkFaint}
          accessibilityLabel={t('chat.inputPlaceholder')}
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
        />

        {hasText ? (
          <RoundButton icon="send" label={t('common.send')} onPress={onSend} brand />
        ) : (
          <RoundButton icon="thumbs-up" label={t('chat.quickLike')} onPress={onQuickLike} brand />
        )}

      </View>

    </SafeAreaView>
  );
}
