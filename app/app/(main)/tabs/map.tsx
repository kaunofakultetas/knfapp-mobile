// -----------------------------------------------------------
//  [*] Tabs — Map
//
//  Indoor navigation for the faculty building: a curated
//  panorama walk rendered by PanoramaNavigator, plus a themed
//  search overlay that jumps straight to any waypoint. Works
//  fully logged out — the dataset ships with the app.
//
//  The header is measured with onLayout (no guessed heights):
//  its real height anchors the search overlay's top edge, and
//  window height minus header minus tab bar gives the panorama
//  its exact usable space on every device.
//
//  Opening search mounts the overlay fresh each time, so the
//  query always starts empty and the input can just autoFocus;
//  matching folds diacritics ("rysiai" finds "Ryšiai") and
//  requires every typed token, in any order.
//
//  Split into (root component last):
//
//    PANO_STEPS       — the curated demo walk (typed steps)
//    foldForSearch    — lowercase + diacritic-stripping fold
//    matchesAllTokens — per-token search predicate
//    SearchToggle     — search/close button in the header
//    ResultRow        — one room row in the results list
//    SearchOverlay    — themed full-height search layer
//    MapScreen        — the tab itself (default export)
// -----------------------------------------------------------

// The immersive panorama stage this screen drives
import PanoramaNavigator from '@/components/map/PanoramaNavigator';

// App chrome and the no-results body
import { EmptyState, Header, Screen } from '@/components/ui';

// JS-side colors for icons, rows and the search field
import { useTheme } from '@/hooks/useTheme';

// Real tab bar height for the usable-space math
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

// Screen primitives
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type LayoutChangeEvent,
} from 'react-native';


// One waypoint of the walk: which panorama to stand in, where
// the next target sits inside it, and the room it leads to.
// Building and floor stay numeric so the visible label can be
// translated at render time.
interface PanoStep {
  panoSource: ImageSourcePropType;
  targetAzimuth: number;
  room: { name: string; building: number; floor: number; distanceMeters?: number };
}


// A step joined with its translated floor label and the folded
// text the search matches against
interface SearchEntry {
  step: PanoStep;
  index: number;
  floorLabel: string;
  haystack: string;
}







// -----------------------------------------------------------
// PANO_STEPS
// -----------------------------------------------------------
//
// Curated demo-route content — one hand-made walk through the
// faculty, pending a real backend source with actual routing
// from a start point to a destination. Each step stands inside
// one bundled 4096px-wide panorama from assets/navigation/;
// targetAzimuth says where the next waypoint sits in it
// (0–360° across the image width). Room names are Lithuanian
// proper names and stay untranslated on purpose.
//
// Used by:
//   - MapScreen (below) — stage props + the search index
// -----------------------------------------------------------

const PANO_STEPS: PanoStep[] = [
  {
    panoSource: require('@/assets/navigation/1.1.03.jpg'),
    targetAzimuth: 230,
    room: { name: 'Viešųjų Ryšių Skyrius', building: 1, floor: 1, distanceMeters: 37 },
  },
  {
    panoSource: require('@/assets/navigation/1.1.00.jpg'),
    targetAzimuth: 10,
    room: { name: 'Koridorius', building: 1, floor: 1, distanceMeters: 22 },
  },
  {
    panoSource: require('@/assets/navigation/1.2.01.jpg'),
    targetAzimuth: 190,
    room: { name: '1 AUD ir 2 AUD', building: 1, floor: 2, distanceMeters: 10 },
  },
  {
    panoSource: require('@/assets/navigation/1.2.05.jpg'),
    targetAzimuth: 225,
    room: { name: 'Tarptautiniai Ryšiai', building: 1, floor: 2, distanceMeters: 10 },
  },
  {
    panoSource: require('@/assets/navigation/2.2.04.jpg'),
    targetAzimuth: 210,
    room: { name: 'AVL2', building: 1, floor: 2, distanceMeters: 10 },
  },
  {
    panoSource: require('@/assets/navigation/2.2.05.jpg'),
    targetAzimuth: 245,
    room: { name: 'VeGa Auditorija', building: 1, floor: 2, distanceMeters: 10 },
  },
  {
    panoSource: require('@/assets/navigation/2.2.02.jpg'),
    targetAzimuth: 45,
    room: { name: '5 AUD', building: 1, floor: 2, distanceMeters: 10 },
  },
  {
    panoSource: require('@/assets/navigation/2.2.01.jpg'),
    targetAzimuth: 10,
    room: { name: 'Gronsko Auditorija', building: 1, floor: 2, distanceMeters: 10 },
  },
];


// Fold away diacritics so "rysiai" finds "Ryšiai" — NFD splits
// the marks off the letters, the regex strips them
const foldForSearch = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();


// Every whitespace-separated token must appear somewhere in the
// folded haystack — "auditorija vega" matches "VeGa Auditorija"
const matchesAllTokens = (haystack: string, query: string) =>
  query.split(/\s+/).filter(Boolean).every((token) => haystack.includes(token));







// -----------------------------------------------------------
// SearchToggle
// -----------------------------------------------------------
//
// The header's right action: a 44pt search / close flip whose
// a11y label announces which of the two it currently is.
//
// Used by:
//   - MapScreen (below) — Header right slot
// -----------------------------------------------------------

function SearchToggle({ open, onPress }: { open: boolean; onPress: () => void }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t(open ? 'navigation.closeSearch' : 'navigation.openSearch')}
      style={({ pressed }) => [
        { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={open ? 'close' : 'search'} size={22} color={colors.onBrand} />
    </Pressable>
  );
}







// -----------------------------------------------------------
// ResultRow
// -----------------------------------------------------------
//
// One room in the results list. The active row gets the brand
// wash and a left accent bar; colors come from useTheme because
// the pressed state needs a JS-side style function.
//
// Used by:
//   - SearchOverlay (below)
// -----------------------------------------------------------

function ResultRow({ entry, active, onPress }: { entry: SearchEntry; active: boolean; onPress: () => void }) {

  const { colors } = useTheme();


  const subtitle =
    entry.step.room.distanceMeters != null
      ? `${entry.floorLabel} · ${entry.step.room.distanceMeters} m`
      : entry.floorLabel;


  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${entry.step.room.name}, ${subtitle}`}
      style={({ pressed }) => [
        {
          minHeight: 60,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
          borderLeftWidth: active ? 3 : 0,
          borderLeftColor: colors.brand,
          backgroundColor: pressed ? colors.surfaceSoft : active ? colors.brandSoft : 'transparent',
        },
      ]}
    >

      <View
        className={
          active
            ? 'items-center justify-center rounded-full bg-brand'
            : 'items-center justify-center rounded-full bg-surface-soft'
        }
        style={{ width: 38, height: 38, marginRight: 14 }}
      >
        <Ionicons
          name={active ? 'location' : 'location-outline'}
          size={18}
          color={active ? colors.onBrand : colors.inkSoft}
        />
      </View>

      <View className="flex-1">
        <Text
          className={active ? 'font-raleway-bold text-base text-brand' : 'font-raleway-semibold text-base text-ink'}
          numberOfLines={1}
        >
          {entry.step.room.name}
        </Text>
        <Text className="mt-xs font-raleway text-xs text-ink-soft" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
    </Pressable>
  );
}







// -----------------------------------------------------------
// SearchOverlay
// -----------------------------------------------------------
//
// The full-height search layer below the header — ordinary
// themed UI on bg-canvas, unlike the dark stage it covers. It
// owns the query state, so mounting fresh on every open resets
// the search for free and lets the input autoFocus.
//
// Used by:
//   - MapScreen (below)
// -----------------------------------------------------------

function SearchOverlay({
  topOffset,
  bottomPadding,
  entries,
  activeIndex,
  onSelect,
}: {
  topOffset: number;
  bottomPadding: number;
  entries: SearchEntry[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');


  // Fold the query once per keystroke, then require every token
  // — word order and diacritics stop mattering
  const filtered = useMemo(() => {
    const folded = foldForSearch(query.trim());
    if (!folded) return entries;
    return entries.filter((entry) => matchesAllTokens(entry.haystack, folded));
  }, [entries, query]);


  return (
    <View className="absolute bg-canvas" style={{ top: topOffset, left: 0, right: 0, bottom: 0, zIndex: 50 }}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Search field — autoFocus works because the overlay
            mounts fresh on every open */}
        <View className="mx-md mb-sm mt-md h-12 flex-row items-center rounded-lg border border-line-strong bg-surface px-md">
          <Ionicons name="search" size={18} color={colors.inkSoft} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('navigation.searchPlaceholder')}
            placeholderTextColor={colors.inkFaint}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={t('navigation.searchPlaceholder')}
            className="ml-sm flex-1 py-0 font-raleway text-base text-ink"
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('navigation.clearSearch')}
            >
              <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
            </Pressable>
          ) : null}
        </View>

        <Text className="px-md pb-sm font-raleway-medium text-xs text-ink-soft">
          {filtered.length === entries.length
            ? t('navigation.allRooms', { count: entries.length })
            : t('navigation.searchResults', { count: filtered.length })}
        </Text>

        <FlatList
          data={filtered}
          keyExtractor={(entry) => String(entry.index)}
          renderItem={({ item }) => (
            <ResultRow entry={item} active={item.index === activeIndex} onPress={() => onSelect(item.index)} />
          )}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, paddingBottom: bottomPadding }}
          ListEmptyComponent={<EmptyState icon="search-outline" title={t('navigation.noResults')} />}
        />
      </KeyboardAvoidingView>
    </View>
  );
}







// -----------------------------------------------------------
// MapScreen (default export)
// -----------------------------------------------------------
//
// Used by:
//   - expo-router — the (main)/tabs/map route
// -----------------------------------------------------------

export default function MapScreen() {

  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const tabBarHeight = useBottomTabBarHeight();


  const [stepIndex, setStepIndex] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);


  // Floor labels are translated, so the search haystack is
  // rebuilt whenever the language flips
  const entries = useMemo<SearchEntry[]>(
    () =>
      PANO_STEPS.map((step, index) => {
        const floorLabel = t('navigation.floorLabel', {
          building: step.room.building,
          floor: step.room.floor,
        });
        return { step, index, floorLabel, haystack: foldForSearch(`${step.room.name} ${floorLabel}`) };
      }),
    [t],
  );


  const atEnd = stepIndex === PANO_STEPS.length - 1;
  const current = PANO_STEPS[stepIndex] ?? PANO_STEPS[0];
  const currentEntry = entries[stepIndex] ?? entries[0];


  // Step 0 passes no onBack below — the stage hides its pill
  // instead of ever popping router history out of a tab
  const handleBack = () => setStepIndex((index) => Math.max(0, index - 1));


  const handleNext = () => {
    if (!atEnd) setStepIndex((index) => Math.min(PANO_STEPS.length - 1, index + 1));
  };


  const handleSelectRoom = (index: number) => {
    setStepIndex(index);
    setSearchOpen(false);
    Keyboard.dismiss();
  };


  const toggleSearch = () => {
    setSearchOpen((open) => {
      if (open) Keyboard.dismiss();
      return !open;
    });
  };


  // The real header height, not a per-platform guess — anchors
  // the search overlay and the usable-space math below
  const handleHeaderLayout = (event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.height);
    setHeaderHeight((prev) => (prev === measured ? prev : measured));
  };


  const panoHeight = Math.max(0, windowHeight - headerHeight - tabBarHeight);

  // iOS floats the tab bar over the screen, so the results list
  // pads past it; elsewhere the layout already stops above it
  const listBottomPadding = Platform.OS === 'ios' ? tabBarHeight : 0;


  return (
    <Screen>

      <View onLayout={handleHeaderLayout}>
        <Header title={t('navigation.title')} right={<SearchToggle open={searchOpen} onPress={toggleSearch} />} />
      </View>

      {/* Immersive stage — deliberately dark in both themes */}
      <View className="flex-1 overflow-hidden bg-black">
        {headerHeight > 0 ? (
          <PanoramaNavigator
            panoSource={current.panoSource}
            targetAzimuth={current.targetAzimuth}
            containerHeight={panoHeight}
            room={{
              name: current.room.name,
              floorLabel: currentEntry.floorLabel,
              distanceMeters: current.room.distanceMeters,
            }}
            onBack={stepIndex > 0 ? handleBack : undefined}
            onNext={handleNext}
            atEnd={atEnd}
          />
        ) : null}
      </View>

      {searchOpen ? (
        <SearchOverlay
          topOffset={headerHeight}
          bottomPadding={listBottomPadding}
          entries={entries}
          activeIndex={stepIndex}
          onSelect={handleSelectRoom}
        />
      ) : null}
    </Screen>
  );
}
