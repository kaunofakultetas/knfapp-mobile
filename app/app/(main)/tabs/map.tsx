// -----------------------------------------------------------
//  [*] Tabs — Map
//
//  Indoor navigation for the faculty building on the two
//  wayfinding packages: the engine routes over the building
//  graph (bundled seed, then the server's published one) and
//  the kit draws the route. Destination first — the tab opens
//  on "Where do you want to go?", a searchable room list
//  grouped by floor — then the route preview (distance, time,
//  the steps, the accessible switch) and, once started, the
//  walk: the panorama stage at the current node with the
//  marker on the next one, or the floor plan with the route,
//  the walker's dot and the floor switcher, over the you-are-
//  here bar and the kit's route sheet (Back / Next / Done).
//  The header's close action ends the route from anywhere.
//
//  The engine hands over ids and the kit reads display truth,
//  so the three small mappers below turn instructions, the
//  route and the navigation state into the kit's shapes —
//  exactly the pairing the kit's README prescribes. Room
//  names come through i18n where a room carries a nameKey,
//  else in English from the room's own nameEn when it has one.
//
//  Works fully logged out and offline — the seed ships with
//  the app; the plan view follows the walker's floor unless a
//  floor was pinned by hand. Routing is synchronous, so a
//  picked room with no route is said at once, with the way
//  out that fits: back to the list, or — when the step-free
//  switch is what ruled the route out — the stairs route.
//
//  Split into (root component last):
//
//    kitStep / kitSummary / kitState — engine → kit mappers
//    planPolygon     — a room outline the plan can draw, or null
//    RoomRow         — one destination row
//    DestinationList — search field + grouped room list
//    ViewToggle      — the photo / plan chips over the stage
//    PhotoStage      — the panorama at the current node
//    PlanDrawing     — the level's SVG, or the parse-failure notice
//    PlanStage       — the floor plan with the route
//    MapScreen       — the tab itself (default export)
// -----------------------------------------------------------

// The app's providers for the two packages
// The shipping gate — features.json decides whether this
// module renders or shows the not-ready screen
import withFeature from '@/components/FeatureGate';

import WayfindHost from '@/components/map/WayfindHost';
// App chrome and shared states
import { EmptyState, Header, Screen } from '@/components/ui';
// A level's drawing, bundled or served
import { usePlanXml } from '@/hooks/usePlanXml';
// JS-side colors for icons, rows and the search field
import { useTheme } from '@/hooks/useTheme';
// A plan that will not parse leaves a diagnosable trace
import { logError } from '@/services/log';
// The bundled panoramas the seed's nodes point at
import { BUNDLED_PANOS } from '@/services/wayfind/seed';
// Screen primitives
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, FlatList, Keyboard, Platform, Pressable, ScrollView, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { SvgXml } from 'react-native-svg';

import {
  nodeForRoom,
  useNavigation,
  useRoomSearch,
  useRoute,
  useWayfind,
  type Instruction,
  type NavigationState,
  type Room,
  type RoomMatch,
  type Route,
  type WayfindEnv,
} from '@knf/wayfindengine';
import {
  FloorPlan,
  FloorSwitcher,
  PanoramaStage,
  RoutePreview,
  RouteSheet,
  YouAreHereBar,
  type KitInstruction,
  type KitNavigationState,
  type KitRouteSummary,
} from '@knf/wayfinduikit';


// The grouped list renders floor headers between rooms
type ListRow = { type: 'header'; key: string; label: string } | { type: 'room'; key: string; match: RoomMatch };

// What the mappers need to turn an id into words
interface Names {
  roomName: (id: string | null | undefined) => string | null;
  levelLabel: (id: string) => string;
}







// -----------------------------------------------------------
// tick
// -----------------------------------------------------------
//
// Light selection tick on iOS; Android's own feedback covers
// taps.
//
// Used by:
//   - MapScreenInner (below) — selection and step handlers
// -----------------------------------------------------------

const tick = () => {
  if (Platform.OS === 'ios') void Haptics.selectionAsync();
};







// -----------------------------------------------------------
// kitStep
// -----------------------------------------------------------
//
// One engine instruction as the kit's display shape: room ids
// become names, a level id its label. Pure.
//
// Used by:
//   - kitSummary, kitState (below)
// -----------------------------------------------------------

function kitStep(step: Instruction, names: Names): KitInstruction {
  switch (step.type) {
    case 'depart':
    case 'continue':
    case 'door':
      return { type: step.type, distanceM: step.distanceM, towardsRoom: names.roomName(step.towardsRoomId) };
    case 'turn':
      return { type: 'turn', direction: step.direction, distanceM: step.distanceM, towardsRoom: names.roomName(step.towardsRoomId), landmark: step.landmark ?? null };
    case 'connector':
      return { type: 'connector', via: step.via, toLevelLabel: names.levelLabel(step.toLevel), direction: step.direction, distanceM: step.distanceM };
    case 'arrive':
      return { type: 'arrive', roomName: names.roomName(step.roomId), side: step.side ?? null };
  }
}







// -----------------------------------------------------------
// kitSummary
// -----------------------------------------------------------
//
// The engine's route as the kit's summary shape — endpoints
// carry their level so the plan ignores them on other floors.
// Pure — memoised by the screen on its inputs.
//
// Used by:
//   - MapScreenInner (below)
// -----------------------------------------------------------

function kitSummary(route: Route, names: Names): KitRouteSummary {
  const first = route.points[0];
  const last = route.points[route.points.length - 1];
  return {
    distanceM: route.distanceM,
    etaSeconds: route.etaSeconds,
    levels: route.levels,
    steps: route.steps.map((step) => kitStep(step, names)),
    start: first ? { level: first.level, x: first.x, y: first.y } : null,
    end: last ? { level: last.level, x: last.x, y: last.y } : null,
  };
}







// -----------------------------------------------------------
// kitState
// -----------------------------------------------------------
//
// The engine's navigation state as the kit's display shape —
// the walker's position is the route point under the cursor
// (with its level, so the plan ignores it on other floors).
// Pure — memoised by the screen on its inputs.
//
// Used by:
//   - MapScreenInner (below)
// -----------------------------------------------------------

function kitState(state: NavigationState, route: Route, names: Names, place: string | null): KitNavigationState {
  const at = route.points[state.index];
  return {
    stepIndex: state.stepIndex,
    stepCount: route.steps.length,
    step: state.step ? kitStep(state.step, names) : null,
    currentLevel: state.currentLevel,
    nextLevel: state.nextLevel,
    remainingM: state.remainingM,
    remainingSeconds: state.remainingSeconds,
    arrived: state.arrived,
    currentPlace: place,
    position: at ? { level: at.level, x: at.x, y: at.y } : null,
  };
}







// -----------------------------------------------------------
// planPolygon
// -----------------------------------------------------------
//
// A room's outline as the plan may draw it — three or more
// [x, y] pairs of finite numbers — else null. The graph is
// server data a phone caches for months, so a malformed
// outline is left undrawn instead of taking the whole tab's
// render down with it.
//
// Used by:
//   - PlanStage (below) — the rooms handed to the plan
// -----------------------------------------------------------

function planPolygon(polygon: unknown): [number, number][] | null {
  if (!Array.isArray(polygon) || polygon.length < 3) return null;
  const drawable = polygon.every((point) => Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]));
  return drawable ? (polygon as [number, number][]) : null;
}







// -----------------------------------------------------------
// RoomRow
// -----------------------------------------------------------
//
// One destination: pin tile, room name, its floor, chevron.
// Memoized — the list re-renders per search keystroke and a
// row only changes with its match.
//
// Used by:
//   - DestinationList (below)
// -----------------------------------------------------------

const RoomRow = memo(function RoomRow({
  match,
  name,
  onSelect,
}: {
  match: RoomMatch;
  name: string;
  onSelect: (roomId: string) => void;
}) {

  const { colors } = useTheme();


  return (
    <Pressable
      onPress={() => onSelect(match.room.id)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${match.level.label}`}
      testID={`map-room-${match.room.id}`}
      className="flex-row items-center px-md py-sm active:bg-surface-soft"
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-soft">
        <Ionicons name="location" size={20} color={colors.brand} />
      </View>
      <View className="ml-md flex-1">
        <Text className="font-raleway-bold text-base text-ink" numberOfLines={1}>{name}</Text>
        <Text className="mt-0.5 font-raleway text-xs text-ink-soft" numberOfLines={1}>{match.level.label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
    </Pressable>
  );
});







// -----------------------------------------------------------
// DestinationList
// -----------------------------------------------------------
//
// The picker: a headline, the search field, and the rooms
// grouped under floor headers — the engine's search (diacritic
// folded, every token, aliases, both language names). It owns
// the query so returning from a route starts clean.
//
// Used by:
//   - MapScreen (below) — while no destination is chosen
// -----------------------------------------------------------

function DestinationList({
  localize,
  onSelect,
}: {
  localize: (room: Room) => string;
  onSelect: (roomId: string) => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const { grouped, count } = useRoomSearch(query, { localize });


  const rows = useMemo<ListRow[]>(() => {
    const out: ListRow[] = [];
    for (const section of grouped) {
      out.push({ type: 'header', key: `h-${section.level.id}`, label: section.level.label });
      for (const match of section.matches) out.push({ type: 'room', key: `r-${match.room.id}`, match });
    }
    return out;
  }, [grouped]);


  // Stable renderItem so the memoized rows survive keystrokes
  const renderRow = useCallback(
    ({ item }: { item: ListRow }) =>
      item.type === 'header' ? (
        <Text className="mb-xs mt-sm px-md font-raleway-bold text-xs uppercase tracking-widest text-ink-soft">{item.label}</Text>
      ) : (
        <RoomRow match={item.match} name={localize(item.match.room)} onSelect={onSelect} />
      ),
    [localize, onSelect],
  );


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
            <Pressable onPress={() => setQuery('')} hitSlop={13} accessibilityRole="button" accessibilityLabel={t('navigation.clearSearch')}>
              <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
        ListHeaderComponent={
          <Text className="px-md pb-xs font-raleway-medium text-xs text-ink-faint">
            {query.trim() ? t('navigation.searchResults', { count }) : t('navigation.allRooms', { count })}
          </Text>
        }
        ListEmptyComponent={<EmptyState icon="search-outline" title={t('navigation.noResults')} />}
      />
    </View>
  );
}







// -----------------------------------------------------------
// ViewToggle
// -----------------------------------------------------------
//
// Two chips over the stage: the photo at the node, or the
// plan of the floor. Hidden when the node has no photo — the
// plan is then the only view. A chip is ~28 pt tall; the slop
// takes each to the 44 pt touch floor.
//
// Used by:
//   - MapScreen (below)
// -----------------------------------------------------------

function ViewToggle({ view, onChange }: { view: 'photo' | 'plan'; onChange: (view: 'photo' | 'plan') => void }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  const chip = (which: 'photo' | 'plan', label: string, icon: keyof typeof Ionicons.glyphMap) => {
    const active = view === which;
    return (
      <Pressable
        onPress={() => onChange(which)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        hitSlop={8}
        testID={`map-view-${which}`}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: active ? colors.brand : colors.scrim }}
      >
        <Ionicons name={icon} size={14} color={colors.onBrand} />
        <Text style={{ marginLeft: 6, color: colors.onBrand, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      </Pressable>
    );
  };


  return (
    <View style={{ position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 8 }} pointerEvents="box-none">
      {chip('photo', t('navigation.photoView'), 'image')}
      {chip('plan', t('navigation.planView'), 'map')}
    </View>
  );
}







// -----------------------------------------------------------
// PhotoStage
// -----------------------------------------------------------
//
// The panorama at the node the walker stands in, with the
// marker on the next point: the engine's panoYawToNext is the
// kit's targetYaw as it is. A bundled reference resolves to
// its asset here; a server reference goes through the kit's
// resolver.
//
// Used by:
//   - MapScreen (below)
// -----------------------------------------------------------

function PhotoStage({
  env,
  state,
  targetLabel,
  height,
}: {
  env: WayfindEnv;
  state: NavigationState;
  targetLabel: string | null;
  height: number;
}) {

  const node = env.index.nodes.get(state.currentNodeId);
  if (!node?.pano) return null;
  const source = BUNDLED_PANOS[node.pano] ?? node.pano;


  return (
    <PanoramaStage
      source={source}
      geometry={node.panoGeometry ?? null}
      targetYaw={state.arrived ? null : state.panoYawToNext}
      targetLabel={targetLabel}
      height={height}
      renderer="auto"
    />
  );
}







// -----------------------------------------------------------
// PlanDrawing
// -----------------------------------------------------------
//
// The level's SVG text drawn, or — when it does not parse — a
// small notice in its place, so a broken plan reads as a
// broken plan and not as an empty floor. SvgXml reports a
// parse failure from INSIDE its own render (onError fires
// synchronously and it returns `fallback`), so the failure is
// logged with the plan's reference and the state flip is
// deferred past the render; from then on the drawing is not
// mounted again for that text, otherwise every re-render
// would re-parse and re-log the same broken plan. A new text
// gets a fresh attempt. Memoised on its two props: the walk
// re-renders the plan on every step, and a real floor's
// drawing is thousands of shapes that have not changed.
//
// Used by:
//   - PlanStage (below)
// -----------------------------------------------------------

const PlanDrawing = memo(function PlanDrawing({ xml, reference }: { xml: string; reference: string | null | undefined }) {

  const { t } = useTranslation();
  const [failedXml, setFailedXml] = useState<string | null>(null);


  const onError = useCallback(
    (error: Error) => {
      logError('map.plan', error, reference ?? undefined);
      setTimeout(() => setFailedXml(xml), 0);
    },
    [reference, xml],
  );


  const notice = (
    <View style={{ flex: 1 }} className="items-center justify-center px-md" testID="map-plan-failed">
      <Text className="text-center font-raleway text-sm text-ink-soft">{t('common.error')}</Text>
    </View>
  );
  if (failedXml === xml) return notice;
  return <SvgXml xml={xml} width="100%" height="100%" onError={onError} fallback={notice} />;
});







// -----------------------------------------------------------
// PlanStage
// -----------------------------------------------------------
//
// The floor plan of the shown level with every stretch of the
// route on it — the whole floor list goes to the kit, which
// draws the ones on this level, so a route that leaves a
// floor and comes back keeps its line to the destination pin
// — the start and end pins, the walker's dot (followed by the
// camera) and the floor switcher, which scrolls once the floors
// outgrow the stage (three already do on a 320 pt phone under
// the route sheet — clipped pills could not be reached). Points
// name their level, so a dot on another floor simply is not
// drawn.
//
// Used by:
//   - MapScreen (below)
// -----------------------------------------------------------

function PlanStage({
  env,
  localize,
  route,
  summary,
  kit,
  shownLevel,
  onSelectLevel,
  height,
}: {
  env: WayfindEnv;
  localize: (room: Room) => string;
  route: Route;
  summary: KitRouteSummary;
  kit: KitNavigationState;
  shownLevel: string;
  onSelectLevel: (id: string) => void;
  height: number;
}) {

  const level = env.index.levels.get(shownLevel) ?? env.index.orderedLevels[0];
  const xml = usePlanXml(level?.plan);
  const rooms = useMemo(
    () =>
      level
        ? env.graph.rooms.flatMap((room) => {
            const polygon = room.level === level.id ? planPolygon(room.polygon) : null;
            return polygon ? [{ id: room.id, polygon, label: localize(room) }] : [];
          })
        : [],
    [env, level, localize],
  );
  if (!level) return null;


  return (
    <View style={{ height }}>
      <FloorPlan
        level={level}
        plan={xml ? <PlanDrawing xml={xml} reference={level.plan} /> : null}
        rooms={rooms}
        route={route.floors}
        start={summary.start}
        end={summary.end}
        youAreHere={kit.position}
        focus={kit.position}
        style={{ height }}
      />
      {/* The padding leaves the switcher's shadow room inside the
          scroll's bounds; the pills still sit 12 pt from the right
          and 56 pt from the top */}
      <ScrollView
        style={{ position: 'absolute', right: 2, top: 46, maxHeight: Math.max(0, height - 56) }}
        contentContainerStyle={{ padding: 10 }}
        showsVerticalScrollIndicator={false}
        testID="map-floor-scroll"
      >
        <FloorSwitcher levels={env.index.orderedLevels} current={level.id} enabled={route.levels} onSelect={onSelectLevel} />
      </ScrollView>
    </View>
  );
}







// -----------------------------------------------------------
// MapScreenInner
// -----------------------------------------------------------
//
// The whole screen, inside the WayfindHost the default export
// mounts — split out so the hooks can read useWayfind().
//
// Used by:
//   - MapScreen (below)
// -----------------------------------------------------------

function MapScreenInner() {

  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const env = useWayfind();


  const [roomId, setRoomId] = useState<string | null>(null);
  const [walking, setWalking] = useState(false);
  const [accessible, setAccessible] = useState(false);
  const [view, setView] = useState<'photo' | 'plan'>('photo');
  const [pinnedLevel, setPinnedLevel] = useState<string | null>(null);
  const [stageHeight, setStageHeight] = useState(0);


  // Names: a room through its i18n key when it carries one, else
  // its second-language name in English, else its own; a level
  // through its label. The language flip re-creates them
  const english = i18n.language === 'en';
  const localize = useCallback((room: Room) => (room.nameKey ? t(room.nameKey) : (english && room.nameEn) || room.name), [t, english]);
  const names = useMemo<Names>(
    () => ({
      roomName: (id) => {
        const room = id ? env.index.rooms.get(id) : null;
        return room ? localize(room) : null;
      },
      levelLabel: (id) => env.index.levels.get(id)?.label ?? id,
    }),
    [env, localize],
  );


  // The route from the entrance to the room's node, under the
  // accessible switch; the cursor over it
  const toNode = roomId ? nodeForRoom(env.index, roomId) : null;
  const { route } = useRoute(roomId ? (env.graph.entranceNodeId ?? null) : null, toNode, { accessibility: accessible ? 'accessible' : 'shortest' });
  const nav = useNavigation(route);
  const state = nav.state;

  const destinationName = names.roomName(roomId) ?? '';
  const summary = useMemo(() => (route ? kitSummary(route, names) : null), [route, names]);
  const place = state ? (names.roomName(state.currentRoomId) ?? names.levelLabel(state.currentLevel)) : null;
  const kit = useMemo(() => (route && state ? kitState(state, route, names, place) : null), [route, state, names, place]);
  const nextRoom = state?.step && 'towardsRoomId' in state.step ? names.roomName(state.step.towardsRoomId) : null;


  // The plan follows the walker's floor until a floor is pinned
  // by hand; a floor change while walking un-pins
  const walkerLevel = state?.currentLevel ?? null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the walker changing floors is the event; the hand-pin releases in response
    setPinnedLevel(null);
  }, [walkerLevel]);
  const shownLevel = pinnedLevel ?? walkerLevel ?? env.index.orderedLevels[0]?.id ?? '';
  const currentNode = state ? env.index.nodes.get(state.currentNodeId) : null;
  const hasPhoto = Boolean(currentNode?.pano);


  const pickRoom = useCallback((id: string) => {
    tick();
    Keyboard.dismiss();
    setRoomId(id);
    setWalking(false);
  }, []);

  const endRoute = useCallback(() => {
    setRoomId(null);
    setWalking(false);
    setPinnedLevel(null);
    setView('photo');
    nav.reset();
  }, [nav]);

  const startWalk = useCallback(() => {
    tick();
    setWalking(true);
  }, []);

  const goNext = useCallback(() => {
    tick();
    nav.next();
  }, [nav]);

  const goBack = useCallback(() => {
    tick();
    nav.back();
  }, [nav]);


  // Arrival is felt as well as seen: one success tap when the
  // walk reaches the room (iOS, like the selection ticks)
  const arrived = walking && Boolean(state?.arrived);
  useEffect(() => {
    if (arrived && Platform.OS === 'ios') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [arrived]);


  // Android back ends the route instead of leaving the screen
  // — the same pattern the Sidebar drawer uses
  useEffect(() => {
    if (!roomId || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      endRoute();
      return true;
    });
    return () => sub.remove();
  }, [roomId, endRoute]);


  const handleStageLayout = (event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.height);
    setStageHeight((prev) => (prev === measured ? prev : measured));
  };


  const endRouteButton = roomId ? (
    <Pressable
      onPress={endRoute}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('navigation.endRoute')}
      testID="map-end-route"
      style={({ pressed }) => [
        { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Ionicons name="close" size={24} color={colors.onBrand} />
    </Pressable>
  ) : undefined;


  let body;
  if (!roomId) {
    body = <DestinationList localize={localize} onSelect={pickRoom} />;
  } else if (!route || !summary || !kit) {
    // Routing is synchronous: no route here is an answer, never
    // a wait ('idle' only means an end is missing — a building
    // without an entrance, a room without a node). The way out
    // fits the cause: the step-free switch can be undone right
    // here, anything else goes back to the list
    body = accessible ? (
      <EmptyState
        icon="accessibility-outline"
        title={t('navigation.noAccessibleRoute')}
        hint={t('navigation.noAccessibleRouteHint')}
        action={{ label: t('navigation.allowStairs'), onPress: () => setAccessible(false) }}
      />
    ) : (
      <EmptyState icon="navigate-outline" title={t('navigation.noRoute')} hint={t('navigation.noRouteHint')} action={{ label: t('navigation.backToRooms'), onPress: endRoute }} />
    );
  } else if (!walking) {
    // Scrolls: an unfolded step list on a 320 pt phone would
    // push Start off the bottom of the screen
    body = (
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 }} testID="map-preview">
        <RoutePreview
          roomName={destinationName}
          summary={summary}
          levelLabels={names.levelLabel}
          accessible={accessible}
          onToggleAccessible={setAccessible}
          onStart={startWalk}
          onClose={endRoute}
        />
      </ScrollView>
    );
  } else {
    const showPhoto = view === 'photo' && hasPhoto && state;
    body = (
      <>
        <View className="flex-1 overflow-hidden" style={{ backgroundColor: colors.surfaceSoft }} onLayout={handleStageLayout} testID="map-stage">
          {stageHeight > 0 ? (
            showPhoto && state ? (
              <PhotoStage env={env} state={state} targetLabel={nextRoom ?? destinationName} height={stageHeight} />
            ) : (
              <PlanStage env={env} localize={localize} route={route} summary={summary} kit={kit} shownLevel={shownLevel} onSelectLevel={setPinnedLevel} height={stageHeight} />
            )
          ) : null}
          {hasPhoto ? <ViewToggle view={view} onChange={setView} /> : null}
        </View>
        <YouAreHereBar place={place} />
        <RouteSheet state={kit} onNext={goNext} onBack={goBack} onDone={endRoute} onEnd={endRoute} />
      </>
    );
  }


  return (
    <Screen>
      <Header title={roomId ? destinationName : t('navigation.title')} right={endRouteButton} />
      {body}
    </Screen>
  );
}







// -----------------------------------------------------------
// MapScreen (default export)
// -----------------------------------------------------------
//
// Exists only to mount WayfindHost between the route and the
// inner screen: MapScreenInner calls the wayfinding hooks on
// its first render, so the providers must already be above it
// — the split is structural, not cosmetic.
//
// Used by:
//   - expo-router — the (main)/tabs/map route
// -----------------------------------------------------------

function MapScreen() {
  return (
    <WayfindHost>
      <MapScreenInner />
    </WayfindHost>
  );
}


// The gate wraps the export, so a disabled module's tab
// screen never mounts even on a direct navigation
export default withFeature('map', MapScreen);
