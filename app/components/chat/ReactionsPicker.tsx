// -----------------------------------------------------------
//  [*] Chat — ReactionsPicker
//
//  The long-press emoji strip. Selection semantics live in
//  useChatReactions — this component only shows state and
//  reports intent. The currently selected emoji is derived by
//  the CALLER from the target message's `bySelf` flags (the
//  legacy literal-'self' lookup never highlighted anything for
//  server-loaded messages) and is rendered as a brand-soft
//  ring plus an accessibilityState so the selection is not
//  color-only.
//
//  The scrim is the close control; the strip card itself is a
//  sibling of the scrim, so taps inside it never fall through
//  and close the modal.
// -----------------------------------------------------------

// Theme-side icon color
import { useTheme } from '@/hooks/useTheme';

// Primitives
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';







// -----------------------------------------------------------
// ReactionsPicker (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/chat-room/index.tsx — the chat room screen
// -----------------------------------------------------------

export default function ReactionsPicker({
  visible,
  options,
  isSelected,
  onPick,
  onClear,
  onClose,
}: {
  visible: boolean;
  options: string[];
  isSelected: (emoji: string) => boolean;
  onPick: (emoji: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-end">

        {/* Scrim — tap anywhere outside the strip to dismiss */}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          className="absolute bottom-0 left-0 right-0 top-0 bg-scrim"
        />

        <View className="mb-3xl flex-row items-center rounded-full bg-surface px-sm py-xs">

          {options.map((emoji) => {
            const selected = isSelected(emoji);
            return (
              <Pressable
                key={emoji}
                onPress={() => onPick(emoji)}
                accessibilityRole="button"
                accessibilityLabel={emoji}
                accessibilityState={{ selected }}
                className={
                  selected
                    ? 'h-11 w-11 items-center justify-center rounded-full border border-brand bg-brand-soft'
                    : 'h-11 w-11 items-center justify-center rounded-full'
                }
              >
                <Text style={{ fontSize: 24 }}>{emoji}</Text>
              </Pressable>
            );
          })}

          <Pressable
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel={t('chat.removeReaction')}
            className="ml-xs h-11 w-11 items-center justify-center rounded-full bg-surface-soft"
          >
            <Ionicons name="ban" size={20} color={colors.inkSoft} />
          </Pressable>

        </View>

      </View>
    </Modal>
  );
}
