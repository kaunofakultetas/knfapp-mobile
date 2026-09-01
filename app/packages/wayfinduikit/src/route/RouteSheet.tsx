// -----------------------------------------------------------
//  [*] wayfinduikit — RouteSheet
//
//  The walking face: one step at a time, big enough to read
//  mid-stride. Above the step, where the walker is in the
//  list and what is left of the route (metres, then the ETA);
//  below it, where they are right now when the host knows
//  ('You are in …'), and on a long empty corridor the
//  reassurance line the host asks for by handing metres. Back
//  and Next move through the host's navigation state — the
//  sheet never counts steps itself, so Back locks at the first
//  step and Next stays Next to the end: arrival is the host's
//  verdict (state.arrived), not the last index. Arrived, the
//  sheet turns into the arrival card — the room named off the
//  final step, its side when known, and Done. End route is the
//  walking face's way out and is offered only when the host
//  wires it; the arrival card's Done already ends everything.
//
//  Split into (root component last):
//
//    roundMetres   — the sign-style rounding for whole metres
//    SheetButton   — a primary or secondary pill
//    ArrivalCard   — the arrived face
//    RouteSheet    — the sheet (default export)
// -----------------------------------------------------------

import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { formatEta } from '../core/format';
import type { KitInstruction, KitNavigationState } from '../core/types';
import { useKitLabels, useKitTheme } from '../provider';
import InstructionLine from './InstructionLine';


// labels.remaining and labels.reassurance take WHOLE metres,
// and core/format.ts keeps its rounder private — the same two
// rungs are repeated here (exact under 10 m, the nearest 5 m
// from there) so the sheet's 'left' never disagrees with the
// preview's total by a metre
const roundMetres = (metres: number): number => {
  const safe = Number.isFinite(metres) && metres > 0 ? metres : 0;
  if (safe < 10) return Math.round(safe);
  return Math.round(safe / 5) * 5;
};







// -----------------------------------------------------------
// SheetButton
// -----------------------------------------------------------
//
// Primary is the brand pill, secondary the quiet one on the
// canvas colour. `disabled` is guarded inside the handler too,
// because a host element's onPress can be invoked straight
// past the prop.
//
// Used by:
//   - ArrivalCard (below) — Done
//   - RouteSheet (below) — Back / Next
// -----------------------------------------------------------

function SheetButton({
  label,
  onPress,
  primary = false,
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  testID: string;
}) {

  const { colors, fonts, radii } = useKitTheme();


  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        if (!disabled) onPress();
      }}
      style={{
        flex: primary ? 2 : 1,
        height: 46,
        borderRadius: radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: primary ? colors.brand : colors.bg,
        borderWidth: primary ? 0 : 1,
        borderColor: colors.line,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ fontSize: 16, fontFamily: fonts.medium, fontWeight: '600', color: primary ? colors.onBrand : colors.ink }}>{label}</Text>
    </Pressable>
  );
}







// -----------------------------------------------------------
// ArrivalCard
// -----------------------------------------------------------
//
// The room comes off the final step when the host's state
// holds it (the engine parks stepIndex on the arrive step at
// the destination); a state arriving with any other step, or
// none, reads the plain arrival. The side line is the arrive
// step's own sentence and only exists with both a room and a
// side.
//
// Used by:
//   - RouteSheet (below) — when state.arrived
// -----------------------------------------------------------

function ArrivalCard({ step, onDone }: { step: KitInstruction | null; onDone: () => void }) {

  const { colors, fonts } = useKitTheme();
  const labels = useKitLabels();


  const room = step?.type === 'arrive' ? (step.roomName ?? null) : null;
  const side = step?.type === 'arrive' && room && step.side ? labels.arriveSide(room, step.side) : null;


  return (
    <View testID="wayfinduikit-sheet-arrival" style={{ alignItems: 'center', paddingVertical: 8 }}>

      <Ionicons name="checkmark-circle" size={44} color={colors.success} />

      <Text style={{ marginTop: 8, fontSize: 20, fontFamily: fonts.bold, fontWeight: '700', color: colors.ink, textAlign: 'center' }}>
        {labels.arrive(room)}
      </Text>

      {side ? (
        <Text testID="wayfinduikit-sheet-arrival-side" style={{ marginTop: 4, fontSize: 15, fontFamily: fonts.regular, color: colors.inkSoft, textAlign: 'center' }}>
          {side}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', alignSelf: 'stretch', marginTop: 16 }}>
        <SheetButton testID="wayfinduikit-sheet-done" label={labels.done} onPress={onDone} primary />
      </View>

    </View>
  );
}







// -----------------------------------------------------------
// RouteSheet (default export)
// -----------------------------------------------------------
//
//   <RouteSheet state={nav.state} onNext={nav.next}
//               onBack={nav.back} onDone={finish} onEnd={abort}
//               reassuranceM={longStretchLeft} />
//
// Used by:
//   - src/index.ts — the public surface; hosts pin one at the
//     bottom of the walking screen
// -----------------------------------------------------------

export default function RouteSheet({
  state,
  onNext,
  onBack,
  onDone,
  onEnd,
  reassuranceM,
}: {
  state: KitNavigationState;
  onNext: () => void;
  onBack: () => void;
  onDone: () => void;
  onEnd?: () => void;
  // Metres still to walk on the current stretch; given → the
  // reassurance line shows
  reassuranceM?: number | null;
}) {

  const { colors, fonts, radii } = useKitTheme();
  const labels = useKitLabels();


  const sheetStyle = {
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  } as const;


  if (state.arrived) {
    return (
      <View testID="wayfinduikit-sheet" style={sheetStyle}>
        <ArrivalCard step={state.step} onDone={onDone} />
      </View>
    );
  }


  const atFirst = state.stepIndex <= 0;
  const remainingLine = `${labels.remaining(roundMetres(state.remainingM))} · ${formatEta(state.remainingSeconds, labels)}`;


  return (
    <View testID="wayfinduikit-sheet" style={sheetStyle}>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text testID="wayfinduikit-sheet-progress" style={{ fontSize: 13, fontFamily: fonts.medium, color: colors.inkSoft }}>
          {labels.stepOf(state.stepIndex + 1, state.stepCount)}
        </Text>
        <Text testID="wayfinduikit-sheet-remaining" style={{ fontSize: 13, fontFamily: fonts.regular, color: colors.inkSoft }}>
          {remainingLine}
        </Text>
      </View>

      {/* A step change is news — the live region lets a reader
          hear the new instruction without moving focus */}
      <View accessibilityLiveRegion="polite" style={{ marginTop: 6 }}>
        {state.step ? <InstructionLine step={state.step} emphasis /> : null}
      </View>

      {state.currentPlace ? (
        <Text testID="wayfinduikit-sheet-place" numberOfLines={1} style={{ marginTop: 2, fontSize: 13, fontFamily: fonts.regular, color: colors.inkSoft }}>
          {labels.youAreIn(state.currentPlace)}
        </Text>
      ) : null}

      {reassuranceM != null ? (
        <Text testID="wayfinduikit-sheet-reassurance" style={{ marginTop: 6, fontSize: 14, fontFamily: fonts.medium, color: colors.brand }}>
          {labels.reassurance(roundMetres(reassuranceM))}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', marginTop: 14, gap: 10 }}>
        <SheetButton testID="wayfinduikit-sheet-back" label={labels.back} onPress={onBack} disabled={atFirst} />
        <SheetButton testID="wayfinduikit-sheet-next" label={labels.next} onPress={onNext} primary />
      </View>

      {onEnd ? (
        <Pressable
          testID="wayfinduikit-sheet-end"
          accessibilityRole="button"
          accessibilityLabel={labels.endRoute}
          onPress={onEnd}
          style={{ alignSelf: 'center', marginTop: 10, paddingVertical: 6, paddingHorizontal: 12 }}
        >
          <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: colors.inkSoft }}>{labels.endRoute}</Text>
        </Pressable>
      ) : null}

    </View>
  );
}
