// -----------------------------------------------------------
//  [*] Sidebar — the app navigation drawer
//
//  One drawer for the whole signed-in area, mounted once by
//  app/(main)/_layout.tsx and driven by DrawerContext: the
//  hamburger in any Header opens it, the scrim, a swipe to the
//  left and the Android back button close it.
//
//  Motion is deliberately fluid rather than snappy: the panel
//  rides a soft spring in and out, the scrim's opacity is
//  derived from the panel's own position (so they can never
//  disagree), and a pan gesture lets the reader drag the panel
//  with their finger and fling it shut. Nothing here is a
//  Modal — the drawer is an absolutely positioned layer over
//  the stack, which keeps the theme variables reachable on
//  web and lets Reanimated own every frame.
//
//  Content, top to bottom:
//    - identity — avatar, name and role for a signed-in
//      user (tap → own profile), or a guest card with a
//      sign-in button;
//    - sections — the six app surfaces with the active one
//      washed in brand; pins decide which appear in the bottom
//      tab bar (news and messages are always pinned);
//    - more — faculty info, friends, admin for the roles that
//      have it;
//    - footer — theme and language quick switches, version.
//
//  Split into (root component last):
//
//    SECTIONS / MORE — the drawer's row tables
//    IdentityCard    — signed-in header or guest card
//    SectionRow      — a surface row with its pin toggle
//    MoreRow         — a plain destination row
//    QuickSwitches   — theme + language footer controls
//    Sidebar         — the animated layer (default export)
// -----------------------------------------------------------

// Drawer state, settings, auth and theme
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useDrawer } from '@/context/DrawerContext';
import { useTheme } from '@/hooks/useTheme';
import type { ThemeSetting } from '@/types';

// UI kit
import { Avatar } from '@/components/ui';

// Rendering, navigation and motion
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useRouter, usePathname, type Href } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


type IoniconName = keyof typeof Ionicons.glyphMap;

// The six app surfaces in tab-bar order; keys double as the
// pinnedTabs entries and the tabs.* i18n lookup
const SECTIONS: { key: string; icon: IoniconName; route: Href }[] = [
  { key: 'news', icon: 'newspaper-outline', route: '/(main)/tabs/news' },
  { key: 'messages', icon: 'chatbubbles-outline', route: '/(main)/tabs/messages' },
  { key: 'schedule', icon: 'calendar-outline', route: '/(main)/tabs/schedule' },
  { key: 'id', icon: 'id-card-outline', route: '/(main)/tabs/id' },
  { key: 'map', icon: 'map-outline', route: '/(main)/tabs/map' },
  { key: 'settings', icon: 'settings-outline', route: '/(main)/tabs/settings' },
];

// Core surfaces that can never be unpinned — AppContext
// enforces it in state; here it only swaps the toggle for a
// muted "always pinned" mark
const HARD_PINNED = new Set(['news', 'messages']);

// Pushed destinations; `auth` rows need a session, `roles`
// rows need one of the listed roles
const MORE: { key: string; icon: IoniconName; route: Href; labelKey: string; auth?: boolean; roles?: string[] }[] = [
  { key: 'info', icon: 'information-circle-outline', route: '/(main)/info', labelKey: 'info.title' },
  { key: 'friends', icon: 'people-outline', route: '/(main)/friends', labelKey: 'friends.title', auth: true },
  { key: 'admin', icon: 'shield-checkmark-outline', route: '/(main)/admin', labelKey: 'admin.title', roles: ['admin', 'curator'] },
];

// The panel: most of the screen on phones, capped on tablets
const MAX_PANEL_WIDTH = 320;

// Soft, critically-damped springs — the panel glides, never snaps
const OPEN_SPRING = { damping: 26, stiffness: 230, mass: 1, overshootClamping: true };
const CLOSE_SPRING = { damping: 30, stiffness: 260, mass: 1, overshootClamping: true };

// A leftward fling faster than this closes regardless of position
const FLING_VELOCITY = -450;

const THEME_OPTIONS: { key: ThemeSetting; icon: IoniconName; labelKey: string }[] = [
  { key: 'light', icon: 'sunny-outline', labelKey: 'settings.light' },
  { key: 'dark', icon: 'moon-outline', labelKey: 'settings.dark' },
  { key: 'system', icon: 'phone-portrait-outline', labelKey: 'settings.system' },
];

const ROLE_KEYS: Record<string, string> = {
  student: 'admin.roleStudent',
  teacher: 'admin.roleTeacher',
  curator: 'admin.roleCurator',
  admin: 'admin.roleAdmin',
};

// Light selection tick on iOS; Android's own feedback covers taps
const tick = () => {
  if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
};







// -----------------------------------------------------------
// IdentityCard
// -----------------------------------------------------------
//
// The brand-colored top of the drawer: who is signed in (tap
// opens the own profile), or a guest card whose sign-in
// button carries the current path back as returnTo.
//
// Used by:
//   - Sidebar (below)
// -----------------------------------------------------------

function IdentityCard({ onNavigate }: { onNavigate: (route: Href) => void }) {

  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();


  if (!isAuthenticated || !user) {
    return (
      <View className="bg-brand-header px-md pb-md" style={{ paddingTop: insets.top + 12 }}>
        <Text className="font-raleway-medium text-xs uppercase tracking-widest text-on-brand opacity-80">
          {t('id.university')}
        </Text>
        <Text className="mt-0.5 font-raleway-bold text-xl text-on-brand">{t('menu.guest')}</Text>
        <Text className="mt-xs font-raleway text-sm text-on-brand opacity-80" numberOfLines={2}>
          {t('settings.guestMessage')}
        </Text>
        {/* A white pill on the burgundy card — the kit's variants
            are all designed for surfaces, not for brand backgrounds */}
        <Pressable
          className="mt-sm h-10 self-start justify-center rounded-full bg-on-brand px-lg"
          style={({ pressed }) => (pressed ? { opacity: 0.85 } : null)}
          onPress={() => onNavigate({ pathname: '/login', params: { returnTo: pathname } } as Href)}
          accessibilityRole="button"
          accessibilityLabel={t('settings.login')}
        >
          <Text className="font-raleway-bold text-sm text-brand">{t('settings.login')}</Text>
        </Pressable>
      </View>
    );
  }


  return (
    <Pressable
      className="bg-brand-header px-md pb-md"
      style={({ pressed }) => [{ paddingTop: insets.top + 12 }, pressed && { opacity: 0.85 }]}
      onPress={() => onNavigate('/(main)/profile')}
      accessibilityRole="button"
      accessibilityLabel={t('menu.myProfile')}
    >
      <View className="flex-row items-center">
        <Avatar uri={user.avatarUrl} name={user.displayName} size={44} />
        <View className="ml-md flex-1">
          <Text className="font-raleway-bold text-lg text-on-brand" numberOfLines={1}>
            {user.displayName}
          </Text>
          <Text className="mt-0.5 font-raleway text-sm text-on-brand opacity-80" numberOfLines={1}>
            {t(ROLE_KEYS[user.role] ?? 'admin.roleStudent')} · @{user.username}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.onBrand} style={{ opacity: 0.7 }} />
      </View>
    </Pressable>
  );
}







// -----------------------------------------------------------
// SectionRow
// -----------------------------------------------------------
//
// One app surface: icon tile, name, and on the right either
// the pin toggle or the muted "always pinned" mark. The active
// surface gets the brand wash and a left accent bar so the
// reader always knows where they are. The pin stops
// propagation so toggling never also navigates.
//
// Used by:
//   - Sidebar (below)
// -----------------------------------------------------------

function SectionRow({
  item,
  active,
  pinned,
  onOpen,
  onTogglePin,
}: {
  item: (typeof SECTIONS)[number];
  active: boolean;
  pinned: boolean;
  onOpen: () => void;
  onTogglePin: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  const label = t(`tabs.${item.key}`);
  const locked = HARD_PINNED.has(item.key);


  return (
    <Pressable
      className={active ? 'flex-row items-center rounded-xl bg-brand-soft px-2 py-2' : 'flex-row items-center rounded-xl px-2 py-2'}
      style={({ pressed }) => (pressed && !active ? { backgroundColor: colors.surfaceSoft } : null)}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <View
        className={
          active
            ? 'h-9 w-9 items-center justify-center rounded-lg bg-brand'
            : 'h-9 w-9 items-center justify-center rounded-lg bg-surface-soft'
        }
      >
        <Ionicons name={item.icon} size={20} color={active ? colors.onBrand : colors.inkSoft} />
      </View>
      <Text
        className={
          active
            ? 'ml-3 flex-1 font-raleway-bold text-base text-brand'
            : 'ml-3 flex-1 font-raleway-medium text-base text-ink'
        }
      >
        {label}
      </Text>

      {locked ? (
        <Ionicons
          name="pin"
          size={18}
          color={colors.inkFaint}
          accessibilityLabel={t('menu.alwaysPinned')}
        />
      ) : (
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full"
          style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceSoft } : null)}
          accessibilityRole="switch"
          accessibilityState={{ checked: pinned }}
          accessibilityLabel={pinned ? t('menu.unpinTab', { tab: label }) : t('menu.pinTab', { tab: label })}
        >
          <Ionicons
            name={pinned ? 'pin' : 'pin-outline'}
            size={20}
            color={pinned ? colors.brand : colors.inkFaint}
          />
        </Pressable>
      )}
    </Pressable>
  );
}







// -----------------------------------------------------------
// MoreRow
// -----------------------------------------------------------
//
// A plain pushed destination with a chevron.
//
// Used by:
//   - Sidebar (below)
// -----------------------------------------------------------

function MoreRow({ item, onOpen }: { item: (typeof MORE)[number]; onOpen: () => void }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <Pressable
      className="flex-row items-center rounded-xl px-2 py-2"
      style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceSoft } : null)}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={t(item.labelKey)}
    >
      <View className="h-9 w-9 items-center justify-center rounded-lg bg-surface-soft">
        <Ionicons name={item.icon} size={20} color={colors.inkSoft} />
      </View>
      <Text className="ml-3 flex-1 font-raleway-medium text-base text-ink">{t(item.labelKey)}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
    </Pressable>
  );
}







// -----------------------------------------------------------
// QuickSwitches
// -----------------------------------------------------------
//
// The footer: a three-way theme control and the LT / EN
// toggle, the two settings people reach for most, plus the
// app version. Everything writes straight to AppContext.
//
// Used by:
//   - Sidebar (below)
// -----------------------------------------------------------

function QuickSwitches() {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { theme, setTheme, language, setLanguage } = useApp();
  const insets = useSafeAreaInsets();


  const version = Constants.expoConfig?.version ?? '1.0.0';


  return (
    <View className="border-t border-line px-lg pt-md" style={{ paddingBottom: insets.bottom + 16 }}>
      <View className="flex-row items-center justify-between">

        {/* Theme — icon segments */}
        <View className="flex-row rounded-full bg-surface-soft p-1">
          {THEME_OPTIONS.map((option) => {
            const selected = theme === option.key;
            return (
              <Pressable
                key={option.key}
                className={selected ? 'h-9 w-11 items-center justify-center rounded-full bg-surface' : 'h-9 w-11 items-center justify-center rounded-full'}
                onPress={() => {
                  tick();
                  setTheme(option.key);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={t(option.labelKey)}
              >
                <Ionicons name={option.icon} size={18} color={selected ? colors.brand : colors.inkFaint} />
              </Pressable>
            );
          })}
        </View>

        {/* Language — text segments */}
        <View className="flex-row rounded-full bg-surface-soft p-1">
          {(['lt', 'en'] as const).map((code) => {
            const selected = language === code;
            return (
              <Pressable
                key={code}
                className={selected ? 'h-9 w-12 items-center justify-center rounded-full bg-brand' : 'h-9 w-12 items-center justify-center rounded-full'}
                onPress={() => {
                  tick();
                  setLanguage(code);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={code.toUpperCase()}
              >
                <Text className={selected ? 'font-raleway-bold text-sm text-on-brand' : 'font-raleway-medium text-sm text-ink-soft'}>
                  {code.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text className="mt-md font-raleway text-xs text-ink-faint">
        VU KNF · {t('menu.version', { version })}
      </Text>
    </View>
  );
}







// -----------------------------------------------------------
// Sidebar (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/_layout.tsx — mounted once beside the stack
// -----------------------------------------------------------

export default function Sidebar() {

  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { isOpen, close } = useDrawer();
  const { pinnedTabs, setPinnedTabs } = useApp();
  const { user, isAuthenticated } = useAuth();
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();


  const panelWidth = Math.min(MAX_PANEL_WIDTH, Math.round(windowWidth * 0.84));


  // 0 = closed (panel parked off-screen left), 1 = open. The
  // pan gesture writes it directly so the panel follows the
  // finger; open/close spring it home.
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withSpring(isOpen ? 1 : 0, isOpen ? OPEN_SPRING : CLOSE_SPRING);
  }, [isOpen, progress]);


  // Android back closes the drawer instead of leaving the screen
  useEffect(() => {
    if (!isOpen || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [isOpen, close]);


  // Drag the panel shut: it tracks the finger, then either
  // flings closed or eases back open on release
  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onUpdate((event) => {
      progress.value = Math.min(1, Math.max(0, 1 + event.translationX / panelWidth));
    })
    .onEnd((event) => {
      if (event.velocityX < FLING_VELOCITY || progress.value < 0.5) {
        runOnJS(close)();
      } else {
        progress.value = withSpring(1, OPEN_SPRING);
      }
    });


  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-panelWidth, 0]) }],
  }));

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  // The layer swallows touches only while it is visible at all
  const layerStyle = useAnimatedStyle(() => ({
    pointerEvents: progress.value > 0.01 ? 'auto' : 'none',
  }));


  // Close first, navigate after — the panel is already gliding
  // out while the new screen mounts. Unpinned surfaces are
  // pinned on the way (their tab-bar entry has href null).
  const navigate = (route: Href) => {
    close();
    router.navigate(route);
  };

  const openSection = (item: (typeof SECTIONS)[number]) => {
    if (!pinnedTabs.includes(item.key)) setPinnedTabs([...pinnedTabs, item.key]);
    navigate(item.route);
  };

  const togglePin = (key: string) => {
    tick();
    setPinnedTabs(
      pinnedTabs.includes(key) ? pinnedTabs.filter((k) => k !== key) : [...pinnedTabs, key],
    );
  };


  const moreRows = MORE.filter((item) => {
    if (item.auth && !isAuthenticated) return false;
    if (item.roles && !(user && item.roles.includes(user.role))) return false;
    return true;
  });


  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, layerStyle]}
      accessibilityViewIsModal={isOpen}
    >

      {/* Scrim — tap anywhere outside the panel to close */}
      <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
        <Pressable
          className="flex-1 bg-scrim"
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t('menu.close')}
        />
      </Animated.View>

      {/* The panel */}
      {/* Plain styles here on purpose: className is not applied to
          Reanimated's Animated.View */}
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: panelWidth,
              backgroundColor: colors.surface,
            },
            panelStyle,
          ]}
        >
          <IdentityCard onNavigate={navigate} />

          <ScrollView className="flex-1" contentContainerClassName="px-md pt-md pb-sm" showsVerticalScrollIndicator={false}>

            <Text className="mb-0.5 px-2 font-raleway-bold text-xs uppercase tracking-widest text-ink-soft">
              {t('menu.sections')}
            </Text>
            <Text className="mb-xs px-2 font-raleway text-xs text-ink-faint">{t('menu.pinnedHint')}</Text>
            {SECTIONS.map((item) => (
              <SectionRow
                key={item.key}
                item={item}
                active={pathname.endsWith(`/tabs/${item.key}`)}
                pinned={pinnedTabs.includes(item.key)}
                onOpen={() => openSection(item)}
                onTogglePin={() => togglePin(item.key)}
              />
            ))}

            <Text className="mb-xs mt-md px-2 font-raleway-bold text-xs uppercase tracking-widest text-ink-soft">
              {t('menu.more')}
            </Text>
            {moreRows.map((item) => (
              <MoreRow key={item.key} item={item} onOpen={() => navigate(item.route)} />
            ))}

          </ScrollView>

          <QuickSwitches />
        </Animated.View>
      </GestureDetector>

    </Animated.View>
  );
}
