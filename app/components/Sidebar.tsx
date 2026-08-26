// -----------------------------------------------------------
//  [*] Sidebar — the slide-over navigation drawer
//
//  Opened by the hamburger in the tab-screen Header: a panel
//  over a scrim listing all six app surfaces. Stars pin and
//  unpin tabs on the bottom tab bar; news and messages are the
//  app's core surfaces and can never be unpinned, so their
//  rows carry no star.
//
//  Navigating to an UNPINNED tab pins it first — the tab bar
//  gives unpinned tabs href:null, so routing there without
//  pinning would dead-end.
//
//  The Modal stays mounted while hidden: an early
//  `if (!visible) return null` would unmount it on close and
//  kill the fade-out animation, so visibility is left entirely
//  to the Modal itself. onRequestClose keeps the Android back
//  button able to dismiss the drawer.
//
//  Split into (root component last):
//
//    ALL_ITEMS   — the six drawer rows (key, icon, route)
//    HARD_PINNED — tabs whose rows never show a star
//    SidebarRow  — one tappable row with its pin star
//    Sidebar     — the modal drawer itself (default export)
// -----------------------------------------------------------

// Pinned-tab state and the JS-side palette
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';

// Rendering and navigation
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


// The six app surfaces in tab-bar order; keys double as both
// the pinnedTabs entries and the tabs.* i18n lookup
const ALL_ITEMS: { key: string; icon: keyof typeof Ionicons.glyphMap; route: Href }[] = [
  { key: 'news', icon: 'newspaper-outline', route: '/(main)/tabs/news' },
  { key: 'messages', icon: 'chatbubbles-outline', route: '/(main)/tabs/messages' },
  { key: 'schedule', icon: 'calendar-outline', route: '/(main)/tabs/schedule' },
  { key: 'map', icon: 'map-outline', route: '/(main)/tabs/map' },
  { key: 'id', icon: 'id-card-outline', route: '/(main)/tabs/id' },
  { key: 'settings', icon: 'settings-outline', route: '/(main)/tabs/settings' },
];

// Core surfaces that can never be unpinned — AppContext
// enforces this in state too; here it only hides the star
const HARD_PINNED = new Set(['news', 'messages']);







// -----------------------------------------------------------
// SidebarRow
// -----------------------------------------------------------
//
// One drawer row: icon tile, tab name and — for soft-pinned
// tabs — the star that toggles tab-bar pinning. The star stops
// event propagation so toggling a pin never also navigates.
//
// Used by:
//   - Sidebar (below)
// -----------------------------------------------------------

function SidebarRow({
  item,
  pinned,
  onOpen,
  onTogglePin,
}: {
  item: (typeof ALL_ITEMS)[number];
  pinned: boolean;
  onOpen: () => void;
  onTogglePin: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  const label = t(`tabs.${item.key}`);


  return (
    <Pressable
      className="flex-row items-center justify-between py-3.5 border-b border-line"
      onPress={onOpen}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceSoft } : null)}
    >
      <View className="flex-row items-center">
        <View className="w-8 h-8 rounded-lg bg-brand-soft items-center justify-center">
          <Ionicons name={item.icon} size={20} color={colors.brand} />
        </View>
        <Text className="text-ink font-raleway-medium ml-3 text-base">{label}</Text>
      </View>

      {!HARD_PINNED.has(item.key) && (
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={
            pinned ? t('menu.unpinTab', { tab: label }) : t('menu.pinTab', { tab: label })
          }
        >
          <Ionicons
            name={pinned ? 'star' : 'star-outline'}
            size={22}
            color={pinned ? colors.warning : colors.inkFaint}
          />
        </Pressable>
      )}
    </Pressable>
  );
}







// -----------------------------------------------------------
// Sidebar (default export)
// -----------------------------------------------------------
//
// Used by:
//   - components/ui/Header.tsx — the hamburger on every tab
//     screen
// -----------------------------------------------------------

export default function Sidebar({ visible, onClose }: { visible: boolean; onClose: () => void }) {

  const router = useRouter();
  const { pinnedTabs, setPinnedTabs } = useApp();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();


  // Close first so the drawer isn't left open behind the tab
  // switch; unpinned targets are pinned before navigating —
  // their tab-bar entry has href:null until they are pinned
  const open = (item: (typeof ALL_ITEMS)[number]) => {
    if (!pinnedTabs.includes(item.key)) {
      setPinnedTabs([...pinnedTabs, item.key]);
    }
    onClose();
    router.navigate(item.route);
  };


  const togglePin = (key: string) => {
    setPinnedTabs(
      pinnedTabs.includes(key)
        ? pinnedTabs.filter((k) => k !== key)
        : [...pinnedTabs, key],
    );
  };


  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable className="flex-1 bg-scrim" onPress={onClose}>
        <Pressable
          className="absolute left-0 top-0 bottom-0 w-[300px] bg-surface"
          onPress={(e) => e.stopPropagation()}
        >

          {/* Brand header — inset padding keeps it clear of the notch */}
          <View className="bg-brand-header px-lg pb-lg" style={{ paddingTop: insets.top + 16 }}>
            <Text className="text-on-brand text-xs tracking-widest uppercase font-raleway-medium">
              {t('id.university')}
            </Text>
            <Text className="text-on-brand text-2xl font-raleway-bold mt-1">{t('menu.title')}</Text>
            <Text className="text-on-brand opacity-70 font-raleway text-sm mt-1">
              {t('menu.subtitle')}
            </Text>
          </View>

          {/* The six navigation rows */}
          <View className="px-lg pt-lg pb-md">
            {ALL_ITEMS.map((item) => (
              <SidebarRow
                key={item.key}
                item={item}
                pinned={pinnedTabs.includes(item.key)}
                onOpen={() => open(item)}
                onTogglePin={() => togglePin(item.key)}
              />
            ))}
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
}
