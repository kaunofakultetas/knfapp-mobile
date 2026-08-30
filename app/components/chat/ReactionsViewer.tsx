// -----------------------------------------------------------
//  [*] Chat — ReactionsViewer
//
//  The "who reacted" bottom sheet: one row per emoji group
//  with name chips for every reactor. Names arrive already
//  resolved — the screen maps user ids through the room's
//  participant map (and its own displayName for self), so this
//  component stays dumb.
//
//  The rows scroll inside a capped-height ScrollView, so a
//  message with many reactors can no longer push the close
//  button off screen; the card is a SIBLING of the scrim
//  Pressable, so taps on the card content never bubble out and
//  close the sheet.
// -----------------------------------------------------------

// Primitives
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


// Rows taller than this scroll instead of growing the card
const ROWS_MAX_HEIGHT = 320;







// -----------------------------------------------------------
// ReactionsViewer (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/chat-room/index.tsx — the chat room screen
// -----------------------------------------------------------

export default function ReactionsViewer({
  visible,
  rows,
  onClose,
}: {
  visible: boolean;
  rows: { emoji: string; names: string[] }[];
  onClose: () => void;
}) {

  const { t } = useTranslation();
  const insets = useSafeAreaInsets();


  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">

        {/* Scrim — tap outside the card to dismiss; hidden from
            assistive tech, which dismisses via the footer Close */}
        <Pressable
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
          className="absolute bottom-0 left-0 right-0 top-0 bg-scrim"
        />

        <View
          className="mx-md rounded-2xl bg-surface p-md"
          style={{ marginBottom: insets.bottom + 24 }}
          accessibilityViewIsModal
        >

          <Text
            className="mb-sm font-raleway-bold text-lg text-ink"
            accessibilityRole="header"
          >
            {t('chat.reactionsTitle')}
          </Text>

          {rows.length === 0 ? (
            <Text className="font-raleway text-base text-ink-soft">
              {t('chat.noReactions')}
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: ROWS_MAX_HEIGHT }}>
              {rows.map((row) => (
                <View key={row.emoji} className="mb-sm">
                  {/* Emoji + count as ONE accessible node — a bare
                      number means nothing to a screen reader */}
                  <View
                    className="mb-xs flex-row items-center"
                    accessible
                    accessibilityLabel={t('chat.reactionCount', {
                      emoji: row.emoji,
                      count: row.names.length,
                    })}
                  >
                    <Text style={{ fontSize: 20 }} className="mr-sm">
                      {row.emoji}
                    </Text>
                    <Text className="font-raleway text-sm text-ink-soft">
                      {row.names.length}
                    </Text>
                  </View>
                  <View className="flex-row flex-wrap">
                    {row.names.map((name, idx) => (
                      <View
                        key={`${row.emoji}-${idx}`}
                        className="mb-sm mr-sm rounded-full bg-surface-soft px-sm py-xs"
                      >
                        <Text className="font-raleway text-sm text-ink">{name}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          <View className="mt-sm items-end">
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              className="h-11 items-center justify-center rounded-full bg-brand px-lg"
            >
              <Text className="font-raleway-bold text-base text-on-brand">
                {t('common.close')}
              </Text>
            </Pressable>
          </View>

        </View>

      </View>
    </Modal>
  );
}
