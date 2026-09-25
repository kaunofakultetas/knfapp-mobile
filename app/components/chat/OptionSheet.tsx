// -----------------------------------------------------------
//  [*] OptionSheet — one bottom sheet, many small choices
//
//  The chat room's generic picker card: a title, a scrollable
//  list of rows (optional detail line, a checkmark on the
//  active one) and the scrim to dismiss. Serves the
//  disappearing-messages window, the forward-to-room picker
//  and the seen-by list — anything that is "pick one row or
//  close". Rows without onPick are read-only (seen-by). Rows
//  are 44pt targets, and a footer Close (plus the iOS escape
//  gesture) dismisses without the scrim — hidden from screen
//  readers, the scrim once left VoiceOver no way out of the
//  read-only seen-by list.
//
//  Used by:
//    - app/(main)/chat-room/index.tsx
// -----------------------------------------------------------

import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/useTheme';


// The row list scrolls past this height instead of growing
// the card off-screen
const ROWS_MAX_HEIGHT = 340;







// -----------------------------------------------------------
// OptionRow
// -----------------------------------------------------------
//
// One pickable row — optional detail line, a checkmark when
// active.
//
// Used by:
//   - OptionSheet (below) — the rows prop
//   - app/(main)/chat-room/index.tsx — builds the row lists
// -----------------------------------------------------------

export interface OptionRow {
  id: string;
  label: string;
  detail?: string;
  active?: boolean;
}







// -----------------------------------------------------------
// OptionSheet (default export)
// -----------------------------------------------------------
//
// Fully controlled, no state of its own: without onPick the
// rows render read-only (text role, press disabled),
// emptyLabel stands in for an empty list, and the row
// ScrollView caps at ROWS_MAX_HEIGHT so a long list scrolls
// instead of pushing the card off screen.
//
// Used by:
//   - app/(main)/chat-room/index.tsx — window / forward /
//     seen-by pickers
// -----------------------------------------------------------

export default function OptionSheet({
  visible,
  title,
  rows,
  emptyLabel,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  rows: OptionRow[];
  // Shown instead of rows when there are none
  emptyLabel?: string;
  // Omitted, the rows are read-only
  onPick?: (id: string) => void;
  onClose: () => void;
}) {

  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();


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
          onAccessibilityEscape={onClose}
          testID="option-sheet"
        >

          <Text className="mb-sm font-raleway-bold text-lg text-ink" accessibilityRole="header">
            {title}
          </Text>

          {rows.length === 0 ? (
            <Text className="font-raleway text-base text-ink-soft">{emptyLabel ?? ''}</Text>
          ) : (
            <ScrollView style={{ maxHeight: ROWS_MAX_HEIGHT }}>
              {rows.map((row) => (
                <Pressable
                  key={row.id}
                  onPress={onPick ? () => onPick(row.id) : undefined}
                  disabled={!onPick}
                  accessibilityRole={onPick ? 'button' : 'text'}
                  accessibilityLabel={row.detail ? `${row.label}, ${row.detail}` : row.label}
                  accessibilityState={row.active ? { selected: true } : undefined}
                  testID={`option-${row.id}`}
                  className="min-h-11 flex-row items-center py-sm"
                >
                  <View className="flex-1">
                    <Text className="font-raleway text-base text-ink" numberOfLines={1}>
                      {row.label}
                    </Text>
                    {row.detail ? (
                      <Text className="font-raleway text-xs text-ink-soft" numberOfLines={1}>
                        {row.detail}
                      </Text>
                    ) : null}
                  </View>
                  {row.active ? <Ionicons name="checkmark" size={18} color={colors.brand} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View className="mt-sm items-end">
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              testID="option-sheet-close"
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
