// -----------------------------------------------------------
//  [*] Navigation — TabBar
//
//  The floating tab CHIP (the Reddit pattern): a rounded
//  semi-transparent rectangle hovering above the bottom edge —
//  never mounted to it — with the content scrolling away
//  behind its blur. Scrolling DOWN folds the whole row
//  fluently into the round faculty badge (the KnF gothic-
//  window mark, circle-cropped); scrolling up (or tapping
//  the badge) expands it back. The fold rides the shared
//  collapse signal in tabBarCollapse.ts, which the scrolling
//  screens feed; the morph itself is one spring driving
//  width, height, corner radius and the two cross-fading
//  faces. Whatever moves the focused route — a tab press, a
//  drawer jump, a notification tap, a deep link — the bar
//  re-expands: a fresh screen starts at its top, with the bar.
//
//  Inside the chip: BURGUNDY glass in both schemes, and a
//  WHITE capsule springs in behind the selected tab — icon
//  and label together in brand ink, its corners nesting
//  inside the chip's own radius; unselected tabs sit in
//  white on the burgundy. The glyph swaps to its filled
//  variant, unpinned tabs never render, and the messages tab
//  carries the live unread badge (palette-swapped on the
//  capsule) — folded, the badge keeps an unread dot. Springs
//  are critically damped — fluid, never bouncy.
//
//  Labels never truncate: every label sets in ONE weight
//  (selection is the capsule, the filled glyph and the ink,
//  never a wider face), and a hidden measurer reads each
//  label's natural width so the whole row shares the one font
//  size its widest label fits at — down to a 9pt floor after
//  the OS text scale. On a screen too narrow for the preferred
//  slots the chip also trades a little edge margin and capsule
//  inset for label room, which is what lets Lithuanian's
//  "Tvarkaraštis" fit five pinned tabs on a 320pt phone.
//
//  Split into (root component last):
//
//    TAB_ICONS        — glyph pairs derived from the shared roster
//    withAlpha        — hex color + opacity → rgba()
//    fitLabelFontSize — the row's shared label size
//    LabelMeasurer    — the hidden natural-width probe
//    TabItem          — one animated tab
//    TabBar           — the floating chip (default export)
// -----------------------------------------------------------

/* eslint-disable react-hooks/immutability -- reanimated shared
   values are mutable boxes by contract (`.value` writes are the
   documented API); the compiler rule reads them as frozen */

// The shared tab roster and the pinned-tab setting
import { TABS } from '@/constants/tabs';
import { ENABLED_TAB_KEYS } from '@/services/features';
import { useApp } from '@/context/AppContext';

// The collapse signal the scrolling screens feed
import {
  holdTabBarExpanded,
  setTabBarCollapsed,
  tabBarCollapse,
  useTabBarCollapsed,
} from '@/components/navigation/tabBarCollapse';

// Unread badge and theme
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { useTheme } from '@/hooks/useTheme';

// Navigation types and rendering
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';


type IoniconName = keyof typeof Ionicons.glyphMap;

// Glyph pairs keyed by route name, derived from the shared
// roster — a route without an entry falls back to a neutral
// ellipsis so a new tab still renders
const TAB_ICONS: Record<string, { filled: IoniconName; outline: IoniconName }> =
  Object.fromEntries(
    TABS.map((tab) => [tab.key, { filled: tab.iconFilled, outline: tab.icon }]),
  );

// Critically damped — the pill glides in, the press eases down
const PILL_SPRING = { damping: 20, stiffness: 240, mass: 0.8, overshootClamping: true };

// Snappier than PILL_SPRING — the press-down scale, not the glide
const PRESS_SPRING = { damping: 18, stiffness: 320, mass: 0.6, overshootClamping: true };

// How far the selected tab's brand capsule stands in from its
// slot — the capsule wraps ICON AND LABEL together, and its
// corner radius is the chip's minus this inset, so the two
// rounded rectangles nest concentrically
const PILL_INSET = 4;

// Each tab's preferred fixed slot width — the row's width is
// slots × this (flexed slots would squish instead of clipping
// during the fold); slots shrink evenly only when the roster
// would overflow the screen
const ITEM_WIDTH = 76;

// The expanded chip's height — one row of glyph + label
const EXPANDED_HEIGHT = 64;

// The collapsed circle the whole bar folds into (diameter)
const COLLAPSED_SIZE = 56;

// The expanded chip is a ROUNDED RECTANGLE, not a capsule —
// the fold morphs this into the collapsed circle's radius
const CHIP_RADIUS = 18;

// The chip's clearance from the screen's side edges — also
// where the collapsed button PARKS (the fold anchors LEFT,
// the Reddit way, so the thumb finds the round button in the
// same corner every time)
const EDGE_MARGIN = 14;

// On a screen too narrow for the preferred slots (320pt with
// five tabs), the edge margin gives up a few points — every
// one of them is label room
const NARROW_EDGE_MARGIN = 8;

// ...and so does the capsule inset, on the same screens
const NARROW_PILL_INSET = 3;

// The label size when the slot has room for it (points)
const LABEL_FONT_SIZE = 12;

// The smallest RENDERED label size — after the OS text scale;
// a row that would need less clips instead of turning to dust
const MIN_LABEL_FONT_SIZE = 9;

// Tab-bar chrome cannot grow much — labels (and the measurer,
// which must see what they render) cap accessibility scaling
const LABEL_MAX_FONT_SCALE = 1.2;

// Breathing room (points) between a label and its capsule's
// edge, each side
const LABEL_GUTTER = 1;

// Text does not shrink linearly: at 9–11pt a renderer rounds
// glyph advances, and the verification pass measured labels up
// to ~9% wider than their 12pt width scaled down ("AI Suppo…"
// at 320pt). A SHRUNK size therefore fits this share of the
// box; the full size needs no margin — it is what was measured
const LABEL_FIT_SAFETY = 0.9;

// The unread dot on the folded badge (diameter, points)
const COLLAPSED_DOT_SIZE = 12;







// -----------------------------------------------------------
// withAlpha
// -----------------------------------------------------------
//
// '#RGB'/'#RRGGBB' + 0..1 → 'rgba(...)' — the chip's tint is
// the theme surface at partial opacity over the blur, and hex
// alpha suffixes break on the 3-digit shorthand some palettes
// use.
//
// Used by:
//   - TabBar (below) — the tint layer and the rim
// -----------------------------------------------------------

function withAlpha(hex: string, opacity: number): string {
  const raw = hex.replace('#', '');
  const wide = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const number = parseInt(wide.slice(0, 6), 16);
  if (Number.isNaN(number)) return hex;
  return `rgba(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}, ${opacity})`;
}







// -----------------------------------------------------------
// fitLabelFontSize
// -----------------------------------------------------------
//
//   fitLabelFontSize(labels, widths, box, fontScale) → points
//
// The ONE label size the whole row shares: the widest label's
// natural width at LABEL_FONT_SIZE (as the measurer rendered
// it, OS scale included) scaled down to LABEL_FIT_SAFETY of the
// label box, rounded DOWN to a quarter point, never above
// LABEL_FONT_SIZE and never below the size that RENDERS at
// MIN_LABEL_FONT_SIZE once the capped OS scale applies. A row
// whose widest label fits the box at full size keeps it — that
// width was measured, not extrapolated. An unmeasured label
// counts as fitting — the first frame renders at the full size
// and the measurement corrects it.
//
// Used by:
//   - TabBar (below) — every render, off the measured widths
// -----------------------------------------------------------

function fitLabelFontSize(labels: string[], widths: Record<string, number>, box: number, fontScale: number): number {
  const widest = Math.max(0, ...labels.map((label) => widths[label] ?? 0));
  if (widest <= box) return LABEL_FONT_SIZE;
  const renderScale = Math.min(fontScale > 0 ? fontScale : 1, LABEL_MAX_FONT_SCALE);
  const fitted = Math.floor(((LABEL_FONT_SIZE * Math.max(box, 0) * LABEL_FIT_SAFETY) / widest) * 4) / 4;
  return Math.min(LABEL_FONT_SIZE, Math.max(fitted, MIN_LABEL_FONT_SIZE / renderScale));
}







// -----------------------------------------------------------
// LabelMeasurer
// -----------------------------------------------------------
//
// Renders every visible label ONCE, invisibly, inside a
// zero-size horizontal ScrollView — a scroll container lays
// its content out with unbounded width, so each Text reports
// its NATURAL width through onLayout, whatever the chip would
// clip it to. Same face, size and scale cap as the real
// labels, so the numbers are what the row would render.
// Hidden from touch and from assistive tech.
//
// Used by:
//   - TabBar (below) — beside the chip, outside its clip
// -----------------------------------------------------------

function LabelMeasurer({
  labels,
  onMeasured,
}: {
  labels: string[];
  onMeasured: (label: string, width: number) => void;
}) {
  return (
    <ScrollView
      horizontal
      scrollEnabled={false}
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, opacity: 0 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="tabbar-label-measurer"
    >
      {labels.map((label, index) => (
        <Text
          key={`${index}:${label}`}
          testID={`tabbar-label-measure-${label}`}
          className="font-raleway-semibold"
          style={{ fontSize: LABEL_FONT_SIZE }}
          maxFontSizeMultiplier={LABEL_MAX_FONT_SCALE}
          numberOfLines={1}
          onLayout={(event) => onMeasured(label, event.nativeEvent.layout.width)}
        >
          {label}
        </Text>
      ))}
    </ScrollView>
  );
}







// -----------------------------------------------------------
// TabItem
// -----------------------------------------------------------
//
// One tab: colors and the glyph swap follow `focused`, the
// press-down scale follows the finger; the selected CAPSULE
// itself lives in the row (TabBar) and slides between slots.
// The label's size is the row's (fitLabelFontSize) and its
// weight never changes with focus — a bolder selected face
// once pushed "Tvarkaraštis" past its capsule. Badge counts
// cap at 99+ so the badge never stretches.
//
// Used by:
//   - TabBar (below)
// -----------------------------------------------------------

function TabItem({
  routeName,
  label,
  focused,
  badge,
  width,
  pillInset,
  labelFontSize,
  onPress,
  onLongPress,
}: {
  routeName: string;
  label: string;
  focused: boolean;
  badge: number;
  width: number;
  pillInset: number;
  labelFontSize: number;
  onPress: () => void;
  onLongPress: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  const pressed = useSharedValue(0);

  const itemStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressed.value, [0, 1], [1, 0.92]) }],
  }));


  const icons = TAB_ICONS[routeName] ?? { filled: 'ellipsis-horizontal', outline: 'ellipsis-horizontal' };
  const badgeText = badge > 99 ? '99+' : String(badge);

  // The badge is visual only; its count rides the tab's own
  // label so screen readers hear "Žinutės, 3 neskaitytos
  // žinutės" as one element
  const a11yLabel = badge > 0 ? `${label}, ${t('tabs.messagesUnread', { count: badge })}` : label;


  return (
    <Pressable
      className="items-center justify-center"
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        pressed.value = withSpring(1, PRESS_SPRING);
        if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
      }}
      onPressOut={() => {
        pressed.value = withSpring(0, PRESS_SPRING);
      }}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={a11yLabel}
      style={{ height: EXPANDED_HEIGHT, width }}
    >
      {/* The slot content — the shared capsule slides in the
          ROW underneath (one indicator travelling tab to tab,
          never fading out of one and into another) */}
      <Animated.View
        style={[
          {
            width: width - pillInset * 2,
            height: EXPANDED_HEIGHT - pillInset * 2,
            alignItems: 'center',
            justifyContent: 'center',
          },
          itemStyle,
        ]}
      >
        {/* Glyph + badge */}
        <View style={{ width: 32, height: 26, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons
            name={focused ? icons.filled : icons.outline}
            size={24}
            color={focused ? colors.brand : colors.onBrand}
          />
          {badge > 0 ? (
            <View
              className="absolute items-center justify-center rounded-full px-1"
              style={{
                top: -4,
                right: -8,
                minWidth: 18,
                height: 18,
                borderWidth: 2,
                // The badge swaps its palette on the brand
                // capsule — brand-on-brand would vanish
                backgroundColor: focused ? colors.brand : colors.onBrand,
                borderColor: focused ? colors.onBrand : colors.brand,
              }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {/* Fixed 18px badge — cap accessibility scaling
                  so the count cannot burst out of the dot */}
              <Text
                className="font-raleway-bold"
                style={{ fontSize: 10, lineHeight: 12, color: focused ? colors.onBrand : colors.brand }}
                maxFontSizeMultiplier={1.2}
              >
                {badgeText}
              </Text>
            </View>
          ) : null}
        </View>

        {/* One weight whatever the focus, at the row's fitted
            size; the native shrink-to-fit stays as the net for
            the first frame, before the measurer has answered */}
        <Text
          className="mt-0.5 font-raleway-semibold"
          style={{ fontSize: labelFontSize, color: focused ? colors.brand : colors.onBrand }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          maxFontSizeMultiplier={LABEL_MAX_FONT_SCALE}
        >
          {label}
        </Text>

      </Animated.View>
    </Pressable>
  );
}







// -----------------------------------------------------------
// TabBar (default export)
// -----------------------------------------------------------
//
// Filters the row to pinnedTabs PLUS whichever route is
// focused, so a screen opened from the drawer while unpinned
// still keeps a selected tab under the reader; presses follow
// react-navigation's contract — emit tabPress first so
// listeners can preventDefault, then navigate. Any change of
// the focused route expands the chip.
//
// A focused route whose module the build ships OFF is still
// dropped from the row (the shipping gate wins), which leaves
// NO tab selected: the travelling capsule then fades out
// rather than parking white-on-white under slot 0 (KNF-170).
//
// The fold: the capsule's width interpolates from the row's
// natural width (slots × item width) down to the circle, the
// row face fades out in the first half of the travel while
// the active-glyph face fades in over the second half, and
// the two faces swap pointer events AND assistive visibility
// on the boolean mirror, so neither a mid-morph tap nor a
// screen reader can land on the hidden face.
//
// Used by:
//   - app/(main)/tabs/_layout.tsx — the Tabs `tabBar` prop
// -----------------------------------------------------------

export default function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { count: unreadCount } = useUnreadCount();
  const { pinnedTabs } = useApp();
  const collapsed = useTabBarCollapsed();


  // Visibility comes from the app's own pinned-tab setting AND
  // the shipping flags — never from sniffing how expo-router
  // happens to represent `href: null` in the descriptors (an
  // undocumented internal; the router registers a route per
  // FILE, so a disabled module's tab still rides the state).
  // A hidden-but-enabled route can still be the focused one
  // (opened from the drawer while unpinned): keep it in the bar
  // while it is, so the reader never stands on a screen with no
  // selected tab
  const focusedKey = state.routes[state.index]?.key;
  const visibleRoutes = state.routes.filter(
    (route) =>
      ENABLED_TAB_KEYS.has(route.name) &&
      (focusedKey === route.key || pinnedTabs.includes(route.name)),
  );

  const labelOf = (routeKey: string, routeName: string): string => {
    const { options } = descriptors[routeKey];
    return typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? routeName;
  };
  const labels = visibleRoutes.map((route) => labelOf(route.key, route.name));


  // Whatever moved the focus — a tab press, a drawer jump, a
  // notification tap, a deep link — the screen it lands on
  // starts at its top, and so with the full bar
  useEffect(() => {
    setTabBarCollapsed(false);
  }, [focusedKey]);


  // Plain numbers the worklet captures per render: slots take
  // their preferred width but shrink evenly when the pinned
  // roster would overflow the screen — and then the chip also
  // narrows its edge margin and capsule inset for label room.
  // The expanded chip sits CENTERED, and the fold slides it to
  // the LEFT edge while it shrinks — the collapsed button
  // parks in the corner
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const squeezed = visibleRoutes.length * ITEM_WIDTH > windowWidth - EDGE_MARGIN * 2;
  const edgeMargin = squeezed ? NARROW_EDGE_MARGIN : EDGE_MARGIN;
  const pillInset = squeezed ? NARROW_PILL_INSET : PILL_INSET;
  const available = windowWidth - edgeMargin * 2;
  const itemWidth = Math.min(ITEM_WIDTH, Math.floor(available / Math.max(visibleRoutes.length, 1)));
  const expandedChipWidth = visibleRoutes.length * itemWidth;
  const centerOffset = Math.max((available - expandedChipWidth) / 2, 0);


  // Natural label widths, keyed by the label text itself — a
  // language switch brings new texts, which measure afresh
  const [labelWidths, setLabelWidths] = useState<Record<string, number>>({});
  const onMeasured = useCallback((label: string, width: number) => {
    setLabelWidths((previous) => (previous[label] === width ? previous : { ...previous, [label]: width }));
  }, []);
  const labelFontSize = fitLabelFontSize(labels, labelWidths, itemWidth - pillInset * 2 - LABEL_GUTTER * 2, fontScale);


  // ONE selected-tab capsule for the whole row, sliding from
  // slot to slot — never collapsing on the old tab to grow on
  // the new one. Index -1 DOES happen: a focused route whose
  // module ships off is dropped from the row (KNF-170). The
  // spring then still targets a real slot, but the capsule is
  // transparent, so no label ever sits white-on-white and no
  // slot pretends to be selected
  const selectedIndex = visibleRoutes.findIndex((route) => focusedKey === route.key);
  const pillX = useSharedValue(Math.max(selectedIndex, 0) * itemWidth + pillInset);
  useEffect(() => {
    pillX.value = withSpring(Math.max(selectedIndex, 0) * itemWidth + pillInset, PILL_SPRING);
  }, [selectedIndex, itemWidth, pillInset, pillX]);

  const travellingPillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
  }));

  // The rim rides OVER the content as an overlay — a real
  // border would inset the content box by its width and skew
  // the capsule's top/bottom margins
  const rimStyle = useAnimatedStyle(() => ({
    borderRadius: interpolate(tabBarCollapse.value, [0, 1], [CHIP_RADIUS, COLLAPSED_SIZE / 2]),
  }));

  const chipStyle = useAnimatedStyle(() => {
    const height = interpolate(tabBarCollapse.value, [0, 1], [EXPANDED_HEIGHT, COLLAPSED_SIZE]);
    return {
      width: interpolate(tabBarCollapse.value, [0, 1], [expandedChipWidth, COLLAPSED_SIZE]),
      height,
      // Rounded rectangle open, full circle closed
      borderRadius: interpolate(tabBarCollapse.value, [0, 1], [CHIP_RADIUS, COLLAPSED_SIZE / 2]),
      transform: [{ translateX: interpolate(tabBarCollapse.value, [0, 1], [centerOffset, 0]) }],
    };
  }, [expandedChipWidth, centerOffset]);

  // The two faces cross-fade in opposite halves of the travel
  // so there is never a frame carrying both at strength
  const rowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tabBarCollapse.value, [0, 0.5], [1, 0], Extrapolation.CLAMP),
  }));
  const collapsedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tabBarCollapse.value, [0.5, 1], [0, 1], Extrapolation.CLAMP),
  }));


  // Folded, the row's unread badge is gone — the dot on the
  // round button keeps the news, and its label carries the count
  const expandLabel =
    unreadCount > 0 ? `${t('tabs.expand')}, ${t('tabs.messagesUnread', { count: unreadCount })}` : t('tabs.expand');


  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: edgeMargin,
        right: edgeMargin,
        // Low, the Reddit way — the chip overlaps the home
        // indicator band instead of stacking on top of it
        bottom: Math.max(insets.bottom - 18, 10),
        alignItems: 'flex-start',
      }}
    >
      <LabelMeasurer labels={labels} onMeasured={onMeasured} />

      <Animated.View
        style={[
          {
            overflow: 'hidden',
            // The chip floats — it needs the shadow the mounted
            // bar never did
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
            elevation: 10,
            // BURGUNDY glass in both schemes — the selected
            // tab answers in white
            backgroundColor: withAlpha(colors.brand, 0.9),
          },
          chipStyle,
        ]}
      >
        {/* Semi-transparent glass: the blur samples the content
            scrolling behind, the tint keeps icons legible on
            busy imagery (Android without a blur implementation
            still gets the translucent tint) */}
        <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />

        {/* Face one: the full row */}
        <Animated.View
          pointerEvents={collapsed ? 'none' : 'auto'}
          accessibilityElementsHidden={collapsed}
          importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'}
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              height: EXPANDED_HEIGHT,
              // Fixed-slot children with no shrink: a narrowing
              // capsule CLIPS the row instead of squishing it
              flexShrink: 0,
              width: expandedChipWidth,
            },
            rowStyle,
          ]}
          accessibilityRole="tablist"
        >
          {/* The travelling capsule — behind every slot, and
              transparent while no visible slot is selected */}
          <Animated.View
            testID="tabbar-capsule"
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: pillInset,
                left: 0,
                width: itemWidth - pillInset * 2,
                height: EXPANDED_HEIGHT - pillInset * 2,
                borderRadius: CHIP_RADIUS - pillInset,
                backgroundColor: colors.onBrand,
                opacity: selectedIndex < 0 ? 0 : 1,
              },
              travellingPillStyle,
            ]}
          />
          {visibleRoutes.map((route, index) => {
            const focused = focusedKey === route.key;

            // react-navigation's contract: emit tabPress first so
            // listeners (scroll-to-top, guards) can preventDefault
            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
                // Expanded at once — the focus effect above
                // would do it a commit later
                setTabBarCollapsed(false);
              }
            };
            const onLongPress = () => {
              navigation.emit({ type: 'tabLongPress', target: route.key });
            };

            return (
              <TabItem
                key={route.key}
                routeName={route.name}
                label={labels[index]}
                focused={focused}
                badge={route.name === 'messages' ? unreadCount : 0}
                width={itemWidth}
                pillInset={pillInset}
                labelFontSize={labelFontSize}
                onPress={onPress}
                onLongPress={onLongPress}
              />
            );
          })}
        </Animated.View>

        {/* Face two: the round faculty badge — a tap brings the
            row back. Hidden from readers while the row shows */}
        <Animated.View
          pointerEvents={collapsed ? 'auto' : 'none'}
          accessibilityElementsHidden={!collapsed}
          importantForAccessibility={collapsed ? 'auto' : 'no-hide-descendants'}
          style={[
            StyleSheet.absoluteFill,
            { alignItems: 'center', justifyContent: 'center' },
            collapsedStyle,
          ]}
        >
          <Pressable
            testID="tabbar-collapsed-button"
            // HOLD, not just expand: the fling whose momentum is
            // still running would re-collapse the chip a frame
            // later — the tap's verdict stands until that scroll
            // is over
            onPress={() => holdTabBarExpanded()}
            accessibilityRole="button"
            accessibilityLabel={expandLabel}
            style={{
              width: COLLAPSED_SIZE,
              height: COLLAPSED_SIZE,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* The square artwork cropped to the circle — the
                chip's own radius clips it too, but the explicit
                one keeps the crop during the morph */}
            <Image
              source={require('../../assets/images/nav-chip-logo.png')}
              style={{
                width: COLLAPSED_SIZE,
                height: COLLAPSED_SIZE,
                borderRadius: COLLAPSED_SIZE / 2,
              }}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
            {/* The unread dot — the row badge's own palette,
                inside the circle so the chip's clip keeps it */}
            {unreadCount > 0 ? (
              <View
                testID="tabbar-collapsed-unread"
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 7,
                  right: 7,
                  width: COLLAPSED_DOT_SIZE,
                  height: COLLAPSED_DOT_SIZE,
                  borderRadius: COLLAPSED_DOT_SIZE / 2,
                  borderWidth: 2,
                  borderColor: colors.brand,
                  backgroundColor: colors.onBrand,
                }}
              />
            ) : null}
          </Pressable>
        </Animated.View>

        {/* The rim — a light edge against the burgundy glass,
            drawn over the content so it costs no layout */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderWidth: 1, borderColor: withAlpha('#FFFFFF', 0.28) },
            rimStyle,
          ]}
        />
      </Animated.View>
    </View>
  );
}
