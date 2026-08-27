// -----------------------------------------------------------
//  [*] Tabs — Map
//
//  Indoor navigation for the faculty building, destination
//  first: the tab opens on "Where do you want to go?" — a
//  searchable room list grouped by floor with each room's
//  distance from the main entrance — and picking a room turns
//  the screen into a step-by-step route. The route view is a
//  photo stage (PanoramaNavigator) over a sheet that carries
//  everything the walker needs: progress through the steps,
//  the remaining distance, the current instruction ("go
//  straight" / "turn left 40°" towards the next waypoint)
//  and Back / Next. At the destination the sheet becomes an
//  arrival card with Done. The header's close action ends the
//  route from anywhere.
//
//  Routing model: the waypoints are one curated walk from the
//  entrance through the building, so the route to a room is
//  the walk's prefix up to that room — every destination gets
//  a real start, a real end and a real step count without a
//  routing graph. The instruction reads the angle the stage
//  reports (rounded, throttled) so the sheet stays light.
//
//  Search folds diacritics ("rysiai" finds "Ryšiai") and
//  requires every typed token, in any order. Works fully
//  logged out — the dataset ships with the app.
//
//  Split into (root component last):
//
//    WAYPOINTS       — the curated walk (typed steps)
//    foldForSearch   — lowercase + diacritic-stripping fold
//    matchesAllTokens— per-token search predicate
//    RoomRow         — one destination row
//    DestinationList — search field + grouped room list
//    RouteSheet      — progress, instruction, Back / Next
//    MapScreen       — the tab itself (default export)
// -----------------------------------------------------------

// The photo stage this screen drives
import PanoramaNavigator, { ALIGNED_TOLERANCE_DEG } from '@/components/map/PanoramaNavigator';

// App chrome and shared states
import { Button, EmptyState, Header, Screen } from '@/components/ui';

// JS-side colors for icons, rows and the search field
import { useTheme } from '@/hooks/useTheme';

// Screen primitives
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';


// One waypoint of the walk: which panorama to stand in, where
// the next target sits inside it, and the room it leads to.
// Building and floor stay numeric so the label is translated
// at render time.
interface Waypoint {
  panoSource: ImageSourcePropType;
  targetAzimuth: number;
  room: { name: string; building: number; floor: number; distanceMeters: number };
}

// A waypoint joined with its translated floor label, cumulative
// distance from the entrance and the folded search text
interface Destination {
  waypoint: Waypoint;
  index: number;
  floorLabel: string;
  distanceFromEntrance: number;
  haystack: string;
}

// The grouped list renders floor headers between rooms
type ListRow = { type: 'header'; key: string; label: string } | { type: 'room'; key: string; destination: Destination };

// The sheet's shadow — '#000' is the sanctioned raw-hex exception
const SHEET_SHADOW: ViewStyle = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: -4 },
  shadowOpacity: 0.12,
  shadowRadius: 12,
  elevation: 12,
};







// -----------------------------------------------------------
// WAYPOINTS
// -----------------------------------------------------------
//
// Curated content — one hand-made walk from the main entrance
// through the faculty, pending a real backend source with a
// routing graph. Each waypoint stands inside one bundled
// 4096px-wide panorama from assets/navigation/; targetAzimuth
// says where the next waypoint sits in it (0–360° across the
// image width); distanceMeters is the leg to that waypoint.
// Room names are Lithuanian proper names and stay untranslated
// on purpose.
//
// Used by:
//   - MapScreen (below) — destinations + the route prefix
// -----------------------------------------------------------

const WAYPOINTS: Waypoint[] = [
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


// Light selection tick on iOS; Android's own feedback covers taps
const tick = () => {
  if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
};







// -----------------------------------------------------------
// RoomRow
// -----------------------------------------------------------
//
// One destination: pin tile, room name, floor and distance
// from the entrance, chevron. Colors come from useTheme
// because the pressed state needs a JS-side style function.
//
// Used by:
//   - DestinationList (below)
// -----------------------------------------------------------

function RoomRow({ destination, onPress }: { destination: Destination; onPress: () => void }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  const subtitle = `${destination.floorLabel} · ${t('navigation.fromEntrance', { distance: destination.distanceFromEntrance })}`;


  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${destination.waypoint.room.name}, ${subtitle}`}
      className="mx-md mb-sm flex-row items-center rounded-xl bg-surface px-md py-3"
      style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceSoft } : null)}
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-soft">
        <Ionicons name="location" size={18} color={colors.brand} />
      </View>

      <View className="ml-md flex-1">
        <Text className="font-raleway-semibold text-base text-ink" numberOfLines={1}>
          {destination.waypoint.room.name}
        </Text>
        <Text className="mt-0.5 font-raleway text-xs text-ink-soft" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
    </Pressable>
  );
}







// -----------------------------------------------------------
// DestinationList
// -----------------------------------------------------------
//
// The picker: a headline, the search field, and the rooms
// grouped under floor headers. It owns the query so returning
// from a route starts clean.
//
// Used by:
//   - MapScreen (below) — while no destination is chosen
// -----------------------------------------------------------

function DestinationList({
  destinations,
  onSelect,
}: {
  destinations: Destination[];
  onSelect: (destination: Destination) => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');


  // Fold the query once per keystroke, then require every token
  const rows = useMemo<ListRow[]>(() => {
    const folded = foldForSearch(query.trim());
    const matches = folded
      ? destinations.filter((d) => matchesAllTokens(d.haystack, folded))
      : destinations;

    const out: ListRow[] = [];
    let lastFloor = '';
    for (const destination of matches) {
      if (destination.floorLabel !== lastFloor) {
        lastFloor = destination.floorLabel;
        out.push({ type: 'header', key: `h-${lastFloor}`, label: lastFloor });
      }
      out.push({ type: 'room', key: `r-${destination.index}`, destination });
    }
    return out;
  }, [destinations, query]);


  const matchCount = rows.filter((row) => row.type === 'room').length;


  return (
    <View className="flex-1">

      {/* Headline + search */}
      <View className="px-md pb-sm pt-md">
        <Text className="font-raleway-bold text-2xl text-ink">{t('navigation.whereTo')}</Text>
        <Text className="mt-xs font-raleway text-sm text-ink-soft">{t('navigation.whereToHint')}</Text>

        <View className="mt-md h-12 flex-row items-center rounded-xl border border-line-strong bg-surface px-md">
          <Ionicons name="search" size={18} color={colors.inkSoft} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('navigation.searchPlaceholder')}
            placeholderTextColor={colors.inkFaint}
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
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <Text className="mb-xs mt-sm px-md font-raleway-bold text-xs uppercase tracking-widest text-ink-soft">
              {item.label}
            </Text>
          ) : (
            <RoomRow destination={item.destination} onPress={() => onSelect(item.destination)} />
          )
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
        ListHeaderComponent={
          <Text className="px-md pb-xs font-raleway-medium text-xs text-ink-faint">
            {query.trim()
              ? t('navigation.searchResults', { count: matchCount })
              : t('navigation.allRooms', { count: destinations.length })}
          </Text>
        }
        ListEmptyComponent={<EmptyState icon="search-outline" title={t('navigation.noResults')} />}
      />
    </View>
  );
}







// -----------------------------------------------------------
// RouteSheet
// -----------------------------------------------------------
//
// The card under the photo: a progress bar with the step
// counter and the remaining distance, the current instruction
// (direction icon + text, "towards <next waypoint>"), and the
// Back / Next pair — or, at the destination, the arrival card
// with Done. The instruction follows the angle the stage
// reports: inside the tolerance it says "go straight".
//
// Used by:
//   - MapScreen (below) — while a destination is chosen
// -----------------------------------------------------------

function RouteSheet({
  step,
  totalSteps,
  waypoint,
  floorLabel,
  remainingMeters,
  deltaDeg,
  arrived,
  onBack,
  onNext,
  onDone,
}: {
  step: number;
  totalSteps: number;
  waypoint: Waypoint;
  floorLabel: string;
  remainingMeters: number;
  deltaDeg: number;
  arrived: boolean;
  onBack: () => void;
  onNext: () => void;
  onDone: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  const aligned = Math.abs(deltaDeg) <= ALIGNED_TOLERANCE_DEG;
  const instruction = aligned
    ? t('navigation.goStraight')
    : deltaDeg < 0
      ? t('navigation.turnLeft', { deg: Math.abs(deltaDeg) })
      : t('navigation.turnRight', { deg: deltaDeg });
  const instructionIcon: keyof typeof Ionicons.glyphMap = aligned
    ? 'arrow-up'
    : deltaDeg < 0
      ? 'arrow-undo'
      : 'arrow-redo';


  const progress = totalSteps > 1 ? step / (totalSteps - 1) : 1;


  return (
    <View className="rounded-t-2xl bg-surface px-lg pb-md pt-md" style={SHEET_SHADOW}>

      {/* Progress */}
      <View className="h-1.5 overflow-hidden rounded-full bg-surface-soft">
        <View className="h-full rounded-full bg-brand" style={{ width: `${Math.round(progress * 100)}%` }} />
      </View>
      <View className="mt-sm flex-row items-center justify-between">
        <Text className="font-raleway-medium text-xs text-ink-soft">
          {t('navigation.stepOf', { current: step + 1, total: totalSteps })}
        </Text>
        {!arrived ? (
          <Text className="font-raleway-medium text-xs text-ink-soft">
            {t('navigation.remaining', { distance: remainingMeters })}
          </Text>
        ) : null}
      </View>

      {/* Instruction or arrival */}
      <View className="mt-md flex-row items-center">
        <View
          className="h-12 w-12 items-center justify-center rounded-xl"
          style={{ backgroundColor: arrived ? colors.successSoft : aligned ? colors.successSoft : colors.brandSoft }}
        >
          <Ionicons
            name={arrived ? 'checkmark-circle' : instructionIcon}
            size={26}
            color={arrived || aligned ? colors.success : colors.brand}
          />
        </View>
        <View className="ml-md flex-1">
          <Text className="font-raleway-bold text-lg text-ink" numberOfLines={1}>
            {arrived ? t('navigation.arrived') : instruction}
          </Text>
          <Text className="mt-0.5 font-raleway text-sm text-ink-soft" numberOfLines={1}>
            {arrived
              ? t('navigation.arrivedHint', { room: waypoint.room.name })
              : `${t('navigation.towards', { room: waypoint.room.name })} · ${floorLabel}`}
          </Text>
        </View>
      </View>

      {/* Controls */}
      <View className="mt-md flex-row gap-sm">
        {arrived ? (
          <>
            <View className="flex-1">
              <Button title={t('common.back')} variant="outline" onPress={onBack} disabled={step === 0} />
            </View>
            <View style={{ flex: 2 }}>
              <Button title={t('navigation.done')} onPress={onDone} leftIcon="checkmark" />
            </View>
          </>
        ) : (
          <>
            <View className="flex-1">
              <Button title={t('common.back')} variant="outline" onPress={onBack} disabled={step === 0} />
            </View>
            <View style={{ flex: 2 }}>
              <Button title={t('common.next')} onPress={onNext} />
            </View>
          </>
        )}
      </View>

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
  const { colors } = useTheme();


  const [destination, setDestination] = useState<Destination | null>(null);
  const [step, setStep] = useState(0);
  const [deltaDeg, setDeltaDeg] = useState(0);
  const [stageHeight, setStageHeight] = useState(0);


  // Floor labels are translated, so the list is rebuilt when
  // the language flips; distances accumulate along the walk
  const destinations = useMemo<Destination[]>(() => {
    let distance = 0;
    return WAYPOINTS.map((waypoint, index) => {
      distance += waypoint.room.distanceMeters;
      const floorLabel = t('navigation.floorLabel', {
        building: waypoint.room.building,
        floor: waypoint.room.floor,
      });
      return {
        waypoint,
        index,
        floorLabel,
        distanceFromEntrance: distance,
        haystack: foldForSearch(`${waypoint.room.name} ${floorLabel}`),
      };
    });
  }, [t]);


  // The route is the walk's prefix up to the destination
  const totalSteps = destination ? destination.index + 1 : 0;
  const current = destination ? WAYPOINTS[Math.min(step, destination.index)] : null;
  const currentFloorLabel = destination ? destinations[Math.min(step, destination.index)].floorLabel : '';
  const arrived = destination !== null && step >= destination.index;
  const remainingMeters = destination
    ? WAYPOINTS.slice(step, destination.index + 1).reduce((sum, w) => sum + w.room.distanceMeters, 0)
    : 0;


  const startRoute = (target: Destination) => {
    tick();
    Keyboard.dismiss();
    setDestination(target);
    setStep(0);
    setDeltaDeg(0);
  };

  const endRoute = () => {
    setDestination(null);
    setStep(0);
  };

  const goBack = () => {
    tick();
    setStep((s) => Math.max(0, s - 1));
  };

  const goNext = () => {
    if (!destination) return;
    tick();
    setStep((s) => Math.min(destination.index, s + 1));
  };


  const handleStageLayout = (event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.height);
    setStageHeight((prev) => (prev === measured ? prev : measured));
  };


  const endRouteButton = destination ? (
    <Pressable
      onPress={endRoute}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('navigation.endRoute')}
      style={({ pressed }) => [
        { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Ionicons name="close" size={24} color={colors.onBrand} />
    </Pressable>
  ) : undefined;


  return (
    <Screen>

      <Header
        title={destination ? destination.waypoint.room.name : t('navigation.title')}
        right={endRouteButton}
      />

      {!destination || !current ? (
        <DestinationList destinations={destinations} onSelect={startRoute} />
      ) : (
        <>
          {/* Photo stage — fills what the sheet leaves; deliberately
              dark in both themes */}
          <View className="flex-1 overflow-hidden bg-black" onLayout={handleStageLayout}>
            {stageHeight > 0 ? (
              <PanoramaNavigator
                panoSource={current.panoSource}
                targetAzimuth={current.targetAzimuth}
                containerHeight={stageHeight}
                stepLabel={t('navigation.stepCounter', { current: step + 1, total: totalSteps })}
                onDeltaChange={setDeltaDeg}
              />
            ) : null}
          </View>

          <RouteSheet
            step={step}
            totalSteps={totalSteps}
            waypoint={current}
            floorLabel={currentFloorLabel}
            remainingMeters={remainingMeters}
            deltaDeg={deltaDeg}
            arrived={arrived}
            onBack={goBack}
            onNext={goNext}
            onDone={endRoute}
          />
        </>
      )}

    </Screen>
  );
}
