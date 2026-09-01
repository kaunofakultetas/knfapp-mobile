// -----------------------------------------------------------
//  [*] wayfindengine — example: a wayfinding screen with no plan
//
//  The engine driving a deliberately plain UI — a ScrollView of
//  text rows in bare React Native, no plan drawing, no
//  panorama — over sampleBuilding(), so nothing outside this
//  file is needed: no floor plans, no UI kit, no host app.
//  Paste it into a blank Expo project and it runs. It shows
//  the complete contract a UI consumes:
//
//    useRoomSearch — the destination list under the search
//                    box, sectioned by floor
//    useRoute      — the entrance to the picked room, re-run
//                    the moment the "avoid stairs" switch flips
//    useNavigation — Back / Next over the route's points, the
//                    level under the walker and the metres left
//
//  Instructions are rendered as their raw fields on purpose:
//  turning a step into a sentence (and translating it) is the
//  UI kit's job, and the fields are exactly what it has to
//  work with — a host reading this sees what a step carries.
//
//  Split into (root component last):
//
//    useDemoBuilding      — one graph object for the demo's life
//    rawStep              — an instruction's fields as one line
//    RoomPicker           — search box + the ranked, sectioned list
//    StepList             — every step, the walker's next one marked
//    Walker               — level, metres left, Back / Next
//    Screen               — the state the three hooks share
//    ExampleWayfindScreen — provider wiring (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import {
  WayfindProvider,
  nodeForRoom,
  sampleBuilding,
  useNavigation,
  useRoomSearch,
  useRoute,
  useWayfind,
  type BuildingGraph,
  type Instruction,
  type Route,
} from '../src';


const BRAND = '#7B003F';







// -----------------------------------------------------------
// useDemoBuilding
// -----------------------------------------------------------
//
// sampleBuilding() builds a fresh object on every call, and the
// provider indexes, validates and memoises per graph IDENTITY —
// a new object each render would re-index every render and
// restart every route and walker beneath it, so the graph is
// built exactly once.
//
// Used by:
//   - ExampleWayfindScreen (below)
// -----------------------------------------------------------

function useDemoBuilding(): BuildingGraph {
  const [graph] = useState(() => sampleBuilding());
  return graph;
}







// -----------------------------------------------------------
// rawStep
// -----------------------------------------------------------
//
// The type first, then every field the step carries as
// key=value, absent fields left out. Metres are rounded to a
// decimal so a plan-scaled length reads as a length rather
// than as float noise.
//
// Used by:
//   - StepList (below)
// -----------------------------------------------------------

function rawStep(step: Instruction): string {
  const fields = Object.entries(step)
    .filter(([key, value]) => key !== 'type' && value != null)
    .map(([key, value]) => `${key}=${typeof value === 'number' ? Math.round(value * 10) / 10 : value}`);
  return [step.type, ...fields].join(' ');
}







// -----------------------------------------------------------
// RoomPicker
// -----------------------------------------------------------
//
// The search box and what it finds, sectioned by floor in
// floor order. Every match is a row; the picked one reads in
// the brand colour so the list doubles as the "going to" line.
//
// Used by:
//   - Screen (below)
// -----------------------------------------------------------

function RoomPicker({ query, picked, onQuery, onPick }: { query: string; picked: string | null; onQuery: (q: string) => void; onPick: (roomId: string) => void }) {

  const { grouped, count } = useRoomSearch(query);


  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
      <TextInput
        testID="search"
        value={query}
        onChangeText={onQuery}
        placeholder="Ieškoti patalpos"
        autoCapitalize="none"
        autoCorrect={false}
        style={{ borderWidth: 1, borderColor: '#DDD', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
      />
      <Text testID="count" style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{`${count} rooms`}</Text>

      {grouped.map(({ level, matches }) => (
        <View key={level.id}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#666', marginTop: 8 }}>{level.label}</Text>
          {matches.map(({ room }) => (
            <Pressable key={room.id} testID={`room-${room.id}`} onPress={() => onPick(room.id)} style={{ paddingVertical: 6 }}>
              <Text style={{ color: room.id === picked ? BRAND : '#333', fontWeight: room.id === picked ? '600' : '400' }}>{room.name}</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}







// -----------------------------------------------------------
// StepList
// -----------------------------------------------------------
//
// Used by:
//   - Walker (below), under the controls
// -----------------------------------------------------------

function StepList({ steps, activeIndex }: { steps: Instruction[]; activeIndex: number }) {
  return (
    <View style={{ marginTop: 8 }}>
      {steps.map((step, i) => (
        <Text
          key={i}
          testID={`step-${i}`}
          style={{ fontSize: 12, paddingVertical: 3, color: i === activeIndex ? BRAND : '#333', fontWeight: i === activeIndex ? '700' : '400' }}
        >
          {rawStep(step)}
        </Text>
      ))}
    </View>
  );
}







// -----------------------------------------------------------
// Walker
// -----------------------------------------------------------
//
// One cursor per Route object: a new route (another room, the
// switch flipped) starts the walk over from the entrance, which
// is what the hook does on its own when the route's identity
// changes. The level label comes off the index; the engine only
// ever names a level by id.
//
// Used by:
//   - Screen (below), once there is a route
// -----------------------------------------------------------

function Walker({ route }: { route: Route }) {

  const { index } = useWayfind();
  const nav = useNavigation(route);
  const state = nav.state;
  if (!state) return null;


  const level = index.levels.get(state.currentLevel)?.label ?? state.currentLevel;
  const room = state.currentRoomId ? ` (in ${state.currentRoomId})` : '';


  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#EEE', marginTop: 12 }}>
      <Text testID="level" style={{ fontSize: 16, fontWeight: '700', color: BRAND }}>{level}</Text>
      <Text testID="remaining" style={{ marginTop: 2 }}>{`${Math.round(state.remainingM)} m left · ${Math.round(state.remainingSeconds)} s`}</Text>
      <Text testID="position" style={{ fontSize: 12, color: '#666' }}>{`at ${state.currentNodeId}${room} · step ${state.stepIndex + 1} / ${route.steps.length}`}</Text>
      {state.arrived ? <Text testID="arrived" style={{ marginTop: 4, fontWeight: '600', color: BRAND }}>Arrived</Text> : null}

      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        <Pressable
          testID="back"
          disabled={state.index === 0}
          onPress={nav.back}
          style={{ borderWidth: 1, borderColor: BRAND, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4, opacity: state.index === 0 ? 0.4 : 1 }}
        >
          <Text style={{ color: BRAND }}>Back</Text>
        </Pressable>
        <Pressable
          testID="next"
          disabled={state.arrived}
          onPress={nav.next}
          style={{ marginLeft: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4, backgroundColor: BRAND, opacity: state.arrived ? 0.4 : 1 }}
        >
          <Text style={{ color: '#FFF' }}>Next</Text>
        </Pressable>
      </View>

      <StepList steps={route.steps} activeIndex={state.stepIndex} />
    </View>
  );
}







// -----------------------------------------------------------
// Screen
// -----------------------------------------------------------
//
// The route starts at the graph's entrance and ends at the
// picked room's node; "avoid stairs" is the 'accessible' mode
// (elevators and ramps only). The options literal is inline —
// useRoute compares options by content, so the Route object
// holds across renders and the walker beneath it keeps its
// place until something real changes.
//
// Used by:
//   - ExampleWayfindScreen (below), inside the provider
// -----------------------------------------------------------

function Screen() {

  const { graph, index } = useWayfind();
  const [query, setQuery] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [avoidStairs, setAvoidStairs] = useState(false);


  const toNodeId = roomId ? nodeForRoom(index, roomId) : null;
  const { route, reason } = useRoute(graph.entranceNodeId ?? null, toNodeId, { accessibility: avoidStairs ? 'accessible' : 'shortest' });


  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#FFF' }} keyboardShouldPersistTaps="handled">

      <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEE' }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: BRAND }}>Kaip nueiti</Text>
      </View>


      <RoomPicker query={query} picked={roomId} onQuery={setQuery} onPick={setRoomId} />


      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 12 }}>
        <Text>Avoid stairs</Text>
        <Switch testID="avoid-stairs" value={avoidStairs} onValueChange={setAvoidStairs} />
      </View>


      {/* 'idle' is the screen's own state (nothing picked yet);
          'unknown_node' and 'no_path' are the router's word */}
      {route ? (
        <Walker route={route} />
      ) : (
        <Text testID="route-reason" style={{ padding: 12, color: '#999' }}>{reason === 'idle' ? 'Pick a room' : `No route: ${reason}`}</Text>
      )}
    </ScrollView>
  );
}







// -----------------------------------------------------------
// ExampleWayfindScreen (default export)
// -----------------------------------------------------------
//
// The provider takes the graph and nothing else here — routing
// defaults, the stride length and the issue sink all have
// defaults. Everything a real host wires is visible here.
// -----------------------------------------------------------

export default function ExampleWayfindScreen() {

  const graph = useDemoBuilding();


  return (
    <WayfindProvider graph={graph}>
      <Screen />
    </WayfindProvider>
  );
}
