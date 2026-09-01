// -----------------------------------------------------------
//  [*] wayfinduikit — example
//
//  The whole kit on one screen, with no host app, no engine
//  and no server: two hand-drawn floors, one route climbing
//  from 114 on the first to 214 on the second, its six steps
//  written out by hand, and every piece of state a useState in
//  this file, so a reader sees the full loop in one place. The
//  plan draws whichever floor is shown with that floor's
//  stretch of the route on it; the switcher asks for a floor
//  and the screen answers; Start turns the preview card into
//  the walking sheet; Next and Back move a cursor down the
//  step list and the screen follows the walker — the floor
//  flips when they climb, the dot and the panorama move with
//  them, the marker on the stage points where the step goes;
//  arrival shows the card and Done hands the screen back to
//  the preview. The flat stage is used on purpose: the example
//  must run without the GL peers.
//
//  A real host swaps three things and keeps the wiring: its
//  engine's route and navigation state for STEPS, WALK and the
//  cursor (one small mapping each — see the README), its
//  bundled drawings for PlanDrawing, and its scanner and
//  picker behind the you-are-here bar's buttons — left unwired
//  here, because a button nobody answers would be a lie.
//
//  Split into (root component last):
//
//    ENV, LEVELS, SEGMENTS, STEPS, WALK — the in-file dataset
//    metresFrom / SUMMARY / stateAt  — the engine's answers, written down
//    PlanDrawing                     — the host's drawing per floor
//    Wayfinder                       — the screen under the provider
//    ExampleWayfindScreen            — provider + screen (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';

// The kit — this package
import {
  defaultLabels,
  FlatPanorama,
  FloorPlan,
  FloorSwitcher,
  RoutePreview,
  RouteSheet,
  useKitLabels,
  useKitTheme,
  WayfindUiKitProvider,
  YouAreHereBar,
  type KitInstruction,
  type KitLevel,
  type KitNavigationState,
  type KitRouteSegment,
  type KitRouteSummary,
} from '../src';


// Module-level so the provider's memo sees one stable object;
// the resolver shows the seam a real host fills with its CDN.
// The panoramas below are names, not files, so the stage stays
// dark here — the marker over it still does its job
const ENV = {
  resolveImageUrl: (url: string) => (url.startsWith('http') ? url : `https://demo.invalid${url}`),
};

const DESTINATION = '214';


// Two floors sharing one drawing size, so a plan coordinate
// means the same thing on both. The labels are bare numerals
// here, which is why the screen wraps them with the catalog's
// floor() below; a host whose levels already carry a display
// label ("2 aukštas") hands it over as it is
const LEVELS: KitLevel[] = [
  { id: 'l1', label: '1', viewBox: [0, 0, 400, 240], ordinal: 1 },
  { id: 'l2', label: '2', viewBox: [0, 0, 400, 240], ordinal: 2 },
];

// The route in plan pixels, one stretch per floor: out of 114
// into the corridor and east to the stairs; upstairs west
// along the corridor and into 214
const SEGMENTS: KitRouteSegment[] = [
  { level: 'l1', points: [[80, 110], [80, 120], [360, 120]] },
  { level: 'l2', points: [[360, 120], [120, 120], [120, 150]] },
];

// The steps as an engine would write them, but carrying names
// rather than ids — the kit reads display truth, so a host
// maps room and level ids to names before handing steps over.
// The connector's floor label is the level's display label;
// with the bare numerals above that means the catalog's floor()
const STEPS: KitInstruction[] = [
  { type: 'depart', distanceM: 8, towardsRoom: DESTINATION },
  { type: 'turn', direction: 'right', distanceM: 45, landmark: 'ties biblioteka' },
  { type: 'connector', via: 'stairs', toLevelLabel: defaultLabels.lt.floor('2'), direction: 'up', distanceM: 12 },
  { type: 'continue', distanceM: 60 },
  { type: 'turn', direction: 'left', distanceM: 6, towardsRoom: DESTINATION },
  { type: 'arrive', roomName: DESTINATION, side: 'left' },
];


// Where the walker stands while each step is the current one:
// the floor and plan point for the dot, the place for the bar
// and the sheet, the panorama at that node and the yaw inside
// it where the route continues (null once arrived — nothing
// left to point at), and the seconds an engine would say are
// left — written down, not priced: the kit prices nothing and
// neither does its demo. The yaw is in the photo's own frame,
// the one the stage and the engine share: 0 is the photo's
// centre column, growing to the right, in [0, 360). The long
// corridor carries its metres for the sheet's reassurance line
interface WalkPoint {
  level: string;
  x: number;
  y: number;
  place: string;
  panorama: string;
  yaw: number | null;
  secondsLeft: number;
  stretchM?: number;
}

const WALK: WalkPoint[] = [
  { level: 'l1', x: 80, y: 110, place: '114', panorama: '/panos/114-door.jpg', yaw: 0, secondsLeft: 112 },
  { level: 'l1', x: 80, y: 120, place: '1 aukšto koridorius', panorama: '/panos/l1-corridor.jpg', yaw: 270, secondsLeft: 106 },
  { level: 'l1', x: 360, y: 120, place: 'Laiptinė', panorama: '/panos/l1-stairs.jpg', yaw: 180, secondsLeft: 71 },
  { level: 'l2', x: 360, y: 120, place: 'Laiptinė', panorama: '/panos/l2-stairs.jpg', yaw: 90, secondsLeft: 51, stretchM: 60 },
  { level: 'l2', x: 120, y: 120, place: '2 aukšto koridorius', panorama: '/panos/l2-corridor.jpg', yaw: 20, secondsLeft: 5 },
  { level: 'l2', x: 120, y: 150, place: DESTINATION, panorama: '/panos/214-door.jpg', yaw: null, secondsLeft: 0 },
];

const positionOf = (point: WalkPoint) => ({ level: point.level, x: point.x, y: point.y });







// -----------------------------------------------------------
// metresFrom / SUMMARY / stateAt
// -----------------------------------------------------------
//
// The two answers a host takes from its engine, written down
// by hand: what the route costs as a whole (the preview card)
// and what is left of it from any step (the walking sheet).
// Every step carries the walk to the next one, so the metres
// left are a tail sum and arrival carries nothing; the seconds
// are the walk points' authored figures, because how a route
// is priced is the engine's business, not a demo's.
//
// Used by:
//   - Wayfinder (below)
// -----------------------------------------------------------

const metresFrom = (stepIndex: number): number =>
  STEPS.slice(stepIndex).reduce((sum, step) => sum + (step.type === 'arrive' ? 0 : step.distanceM), 0);


const SUMMARY: KitRouteSummary = {
  distanceM: metresFrom(0),
  etaSeconds: WALK[0].secondsLeft,
  levels: ['l1', 'l2'],
  steps: STEPS,
  start: positionOf(WALK[0]),
  end: positionOf(WALK[WALK.length - 1]),
};


function stateAt(stepIndex: number): KitNavigationState {

  const walker = WALK[stepIndex];
  const remainingM = metresFrom(stepIndex);


  return {
    stepIndex,
    stepCount: STEPS.length,
    step: STEPS[stepIndex],
    currentLevel: walker.level,
    nextLevel: WALK.slice(stepIndex + 1).find((point) => point.level !== walker.level)?.level ?? null,
    remainingM,
    remainingSeconds: walker.secondsLeft,
    arrived: stepIndex === STEPS.length - 1,
    currentPlace: walker.place,
    position: positionOf(walker),
  };
}







// -----------------------------------------------------------
// PlanDrawing
// -----------------------------------------------------------
//
// The host's drawing — the kit never draws walls. An inline
// Svg in the floor's own viewBox, filling the box the plan
// gives it, so the route's points and the drawing agree with
// no conversion: an outer wall, the corridor as a wash, the
// rooms with their numbers, the stairwell hatched at the east
// end. A real host hands the plan whatever it bundles (an SVG
// string, a raster) sized the same way.
//
// Used by:
//   - Wayfinder (below) — FloorPlan's plan slot
// -----------------------------------------------------------

interface Room {
  label: string;
  x: number;
  y: number;
}

const ROOM = 80;

const ROOMS: Record<string, Room[]> = {
  l1: [
    { label: '114', x: 40, y: 20 },
    { label: '116', x: 130, y: 20 },
    { label: '118', x: 220, y: 20 },
    { label: '111', x: 40, y: 140 },
    { label: '113', x: 130, y: 140 },
    { label: '115', x: 220, y: 140 },
  ],
  l2: [
    { label: '212', x: 40, y: 20 },
    { label: '216', x: 130, y: 20 },
    { label: '218', x: 220, y: 20 },
    { label: '214', x: 80, y: 140 },
    { label: '217', x: 220, y: 140 },
  ],
};


function PlanDrawing({ levelId }: { levelId: string }) {

  const { colors } = useKitTheme();
  const ink = colors.planInk;


  return (
    <Svg viewBox="0 0 400 240" width="100%" height="100%">

      <Rect x={20} y={20} width={360} height={200} fill="none" stroke={ink} strokeWidth={2} />
      <Rect x={20} y={100} width={360} height={40} fill={ink} fillOpacity={0.1} />

      {(ROOMS[levelId] ?? []).map((room) => (
        <G key={room.label}>
          <Rect x={room.x} y={room.y} width={ROOM} height={ROOM} fill="none" stroke={ink} strokeWidth={1} />
          <SvgText x={room.x + ROOM / 2} y={room.y + ROOM / 2 + 5} fontSize={14} fill={ink} textAnchor="middle">
            {room.label}
          </SvgText>
        </G>
      ))}

      <Rect x={340} y={100} width={40} height={40} fill="none" stroke={ink} strokeWidth={1} />
      {[108, 116, 124, 132].map((y) => (
        <Line key={y} x1={340} y1={y} x2={380} y2={y} stroke={ink} strokeWidth={1} />
      ))}

    </Svg>
  );
}







// -----------------------------------------------------------
// Wayfinder
// -----------------------------------------------------------
//
// The screen a host writes, under the provider so it reads the
// same theme and labels the kit does. Three pieces of state —
// the floor on show, whether the walk has started, the cursor
// into the step list — and the cursor's move is the one place
// the screen follows the walker: the floor flips to theirs.
// Everything else is derived per render: which stretch of the
// route belongs to the shown floor, the sheet's state off the
// cursor, the stage's photo and target off the same. The
// route's ends and the walker's dot go to the plan as they
// are — each names its floor, and the plan draws the ones on
// the floor it shows.
//
// Used by:
//   - ExampleWayfindScreen (below)
// -----------------------------------------------------------

function Wayfinder() {

  const { colors } = useKitTheme();
  const labels = useKitLabels();
  const [levelId, setLevelId] = useState(WALK[0].level);
  const [walking, setWalking] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);


  // Moving the cursor is what a real host does through its
  // engine (nav.next / nav.back); following the walker onto
  // their floor is the screen's own choice, in either case
  const goTo = (index: number) => {
    setStepIndex(index);
    setLevelId(WALK[index].level);
  };

  const start = () => {
    setWalking(true);
    goTo(0);
  };

  // Done and End meet here: the route stays picked, the walker
  // is back at the start, the preview card is up again
  const finish = () => {
    setWalking(false);
    goTo(0);
  };

  const next = () => goTo(Math.min(stepIndex + 1, STEPS.length - 1));
  const back = () => goTo(Math.max(stepIndex - 1, 0));


  const level = LEVELS.find((candidate) => candidate.id === levelId) ?? LEVELS[0];
  const walker = WALK[stepIndex];
  const nav = stateAt(stepIndex);

  // The preview's chips: the level's label, wrapped only
  // because this demo's labels are bare numerals
  const levelLabel = (id: string) => labels.floor(LEVELS.find((candidate) => candidate.id === id)?.label ?? id);


  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 12, gap: 12 }}>

      <YouAreHereBar place={walker.place} />

      {/* The switcher floats over the plan's corner; as the
          later sibling it takes the tap before the plan's
          responder can */}
      <View>
        <FloorPlan
          level={level}
          plan={<PlanDrawing levelId={levelId} />}
          route={SEGMENTS.find((segment) => segment.level === levelId) ?? null}
          start={SUMMARY.start}
          end={SUMMARY.end}
          youAreHere={nav.position}
          focus={walking ? nav.position : null}
        />
        <FloorSwitcher
          levels={LEVELS}
          current={levelId}
          enabled={SUMMARY.levels}
          onSelect={setLevelId}
          style={{ position: 'absolute', top: 8, right: 8 }}
        />
      </View>

      {/* The flat stage places the marker itself: targetYaw is
          where the current step continues inside this node's
          photo (the engine's panoYawToNext, handed over as it
          is), and goes once arrived */}
      <FlatPanorama source={walker.panorama} targetYaw={walker.yaw} targetLabel={DESTINATION} height={220} />

      {walking ? (
        <RouteSheet state={nav} onNext={next} onBack={back} onDone={finish} onEnd={finish} reassuranceM={walker.stretchM ?? null} />
      ) : (
        <RoutePreview roomName={DESTINATION} summary={SUMMARY} levelLabels={levelLabel} onStart={start} />
      )}

    </ScrollView>
  );
}







// -----------------------------------------------------------
// ExampleWayfindScreen (default export)
// -----------------------------------------------------------
//
// The one wrapper a real host mounts once at its root —
// WayfindUiKitProvider with Lithuanian defaults and only the
// image resolver filled in — around the screen. A host swaps
// the useState cursor for its engine's hooks; the kit wiring
// stays exactly this.
//
// Used by:
//   - example/__tests__/example.test.tsx — mounts it whole
//   - anyone dropping the kit into a route to see it work
// -----------------------------------------------------------

export default function ExampleWayfindScreen() {
  return (
    <WayfindUiKitProvider env={ENV}>
      <Wayfinder />
    </WayfindUiKitProvider>
  );
}
