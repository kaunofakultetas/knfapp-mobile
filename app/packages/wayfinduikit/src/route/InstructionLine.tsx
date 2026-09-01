// -----------------------------------------------------------
//  [*] wayfinduikit — InstructionLine
//
//  One step as one row: a glyph that shows the shape of the
//  action before the words do, the sentence from
//  instructionText, and two margins the sentence leaves out.
//  A turn's landmark has no key in the catalog, so it sits
//  under the sentence exactly as the host names it. The metres
//  are the step's OWN measure — every step carries the walk
//  from its node to the next step's node — so a turn's '25 m'
//  reads 'then 25 m on'; a continue already says its metres in
//  the sentence (and a 'straight' turn IS a continue to the
//  formatter) and arrive measures nothing, so none of those
//  repeats the figure. `emphasis` is the walking sheet's
//  current step: larger type, the glyph on a brand wash.
//
//  The row is ONE accessibility element whose label is exactly
//  the sentence — a screen reader hears the instruction, never
//  the chrome around it.
//
//  Split into (root component last):
//
//    stepGlyph        — the glyph name per step
//    InstructionLine  — the row (default export)
// -----------------------------------------------------------

import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';

import { formatDistance, instructionText } from '../core/format';
import type { KitInstruction } from '../core/types';
import { useKitLabels, useKitTheme } from '../provider';


export type StepGlyph = ComponentProps<typeof MaterialCommunityIcons>['name'];







// -----------------------------------------------------------
// stepGlyph
// -----------------------------------------------------------
//
// One glyph family for every step, so the arrows share one
// stroke: a walker for depart, the plain up arrow for a
// continue and a 'straight' turn, right-angled arrows for the
// turns, diagonals for the slight ones, the U for a U-turn.
// Connectors say what they are and which way — a ramp has no
// up/down face, the step-free glyph IS its point — a door is
// a door, arrival is the flag.
//
// Used by:
//   - InstructionLine (below)
//   - tests pinning the glyph per step
// -----------------------------------------------------------

export function stepGlyph(step: KitInstruction): StepGlyph {
  switch (step.type) {
    case 'depart':
      return 'walk';

    case 'continue':
      return 'arrow-up';

    case 'turn':
      switch (step.direction) {
        case 'left':
          return 'arrow-left-top';
        case 'right':
          return 'arrow-right-top';
        case 'slight-left':
          return 'arrow-top-left';
        case 'slight-right':
          return 'arrow-top-right';
        case 'u-turn':
          return 'arrow-u-left-top';
        case 'straight':
          return 'arrow-up';
      }

    case 'door':
      return 'door-open';

    case 'connector':
      if (step.via === 'ramp') return 'wheelchair-accessibility';
      if (step.via === 'elevator') return step.direction === 'up' ? 'elevator-up' : 'elevator-down';
      return step.direction === 'up' ? 'stairs-up' : 'stairs-down';

    case 'arrive':
      return 'flag';
  }
}







// -----------------------------------------------------------
// InstructionLine (default export)
// -----------------------------------------------------------
//
//   <InstructionLine step={step} />            — a list row
//   <InstructionLine step={step} emphasis />   — the current step
//
// Used by:
//   - route/RoutePreview.tsx — the folded step list
//   - route/RouteSheet.tsx — the current step, emphasised
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export default function InstructionLine({ step, emphasis = false }: { step: KitInstruction; emphasis?: boolean }) {

  const { colors, fonts } = useKitTheme();
  const labels = useKitLabels();
  const text = instructionText(step, labels);


  // The margin figure is the walk to the NEXT step. Wherever
  // the sentence already reads the metres — a continue, and a
  // 'straight' turn that instructionText words as one — the
  // margin would only repeat them; arrive carries none at all
  const saysMetres = step.type === 'continue' || (step.type === 'turn' && step.direction === 'straight');
  const distanceM = saysMetres || step.type === 'arrive' ? 0 : step.distanceM;
  const landmark = step.type === 'turn' ? (step.landmark ?? null) : null;
  const disc = emphasis ? 44 : 36;


  return (
    <View
      testID="wayfinduikit-instruction"
      accessible
      accessibilityLabel={text}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: emphasis ? 6 : 8 }}
    >

      <View
        style={{
          width: disc,
          height: disc,
          borderRadius: disc / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: emphasis ? colors.brandSoft : colors.bg,
        }}
      >
        <MaterialCommunityIcons
          testID="wayfinduikit-instruction-glyph"
          name={stepGlyph(step)}
          size={emphasis ? 26 : 20}
          color={emphasis ? colors.brand : colors.inkSoft}
        />
      </View>

      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text
          testID="wayfinduikit-instruction-text"
          style={{
            fontSize: emphasis ? 18 : 15,
            fontFamily: emphasis ? fonts.medium : fonts.regular,
            fontWeight: emphasis ? '600' : '400',
            color: colors.ink,
          }}
        >
          {text}
        </Text>
        {landmark ? (
          <Text testID="wayfinduikit-instruction-landmark" numberOfLines={1} style={{ marginTop: 2, fontSize: 13, fontFamily: fonts.regular, color: colors.inkSoft }}>
            {landmark}
          </Text>
        ) : null}
      </View>

      {distanceM > 0 ? (
        <Text testID="wayfinduikit-instruction-distance" style={{ marginLeft: 10, fontSize: 13, fontFamily: fonts.regular, color: colors.inkFaint }}>
          {formatDistance(distanceM, labels)}
        </Text>
      ) : null}

    </View>
  );
}
