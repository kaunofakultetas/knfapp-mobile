// -----------------------------------------------------------
//  [*] wayfinduikit — RoutePreview
//
//  The card between choosing a room and walking to it: what
//  the route costs (one line, ETA first — a walker asks 'how
//  long' before 'how far'), which floors it crosses in walking
//  order, the step-free switch, the steps folded away behind
//  one link, and Start. The kit shows; the host decides — the
//  switch reports the NEXT value and the host answers with a
//  new summary (recomputing the route is its job), and the
//  fold is the card's only own state. The fold closes again
//  when the destination changes, so a recycled card never
//  opens on the previous room's steps — keyed on the room
//  name, not the summary object, because a host rebuilding
//  the summary each render must not slam it shut.
//
//  The image slot is the host's — a room photo, a panorama
//  still, nothing — wrapped as one labelled image element so
//  a reader hears whose photo it is. The close button borrows
//  labels.back for its name: the catalog has no 'close' key
//  (its key list is pinned), and dismissing the card IS going
//  back to the search.
//
//  Split into (root component last):
//
//    LevelChips    — the floors crossed, in walking order
//    RoutePreview  — the card (default export)
// -----------------------------------------------------------

import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import { formatDistance, formatEta } from '../core/format';
import type { KitRouteSummary } from '../core/types';
import { useKitLabels, useKitTheme } from '../provider';
import InstructionLine from './InstructionLine';







// -----------------------------------------------------------
// LevelChips
// -----------------------------------------------------------
//
// One chip per level the route walks, in the order it walks
// them, a chevron between — a route going 1 → 2 → 1 shows
// three chips, so keys and testIDs are positional. The row is
// one accessibility element reading the chain as a sentence.
//
// Used by:
//   - RoutePreview (below)
// -----------------------------------------------------------

function LevelChips({ levels, levelLabels }: { levels: string[]; levelLabels: (id: string) => string }) {

  const { colors, fonts, radii } = useKitTheme();
  const names = levels.map(levelLabels);


  return (
    <View
      testID="wayfinduikit-preview-levels"
      accessible
      accessibilityLabel={names.join(' → ')}
      style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}
    >
      {names.map((name, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4, marginBottom: 4 }}>
          {i > 0 ? <Ionicons name="chevron-forward" size={14} color={colors.inkFaint} style={{ marginRight: 4 }} /> : null}
          <View
            testID={`wayfinduikit-preview-level-${i}`}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: radii.chip,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.bg,
            }}
          >
            <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: colors.ink }}>{name}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}







// -----------------------------------------------------------
// RoutePreview (default export)
// -----------------------------------------------------------
//
//   <RoutePreview roomName="114" summary={route}
//                 levelLabels={(id) => levels[id].label}
//                 accessible={avoidStairs}
//                 onToggleAccessible={(next) => setAvoidStairs(next)}
//                 onStart={begin} onClose={dismiss}
//                 imageSlot={<Image … />} />
//
// Used by:
//   - src/index.ts — the public surface; hosts show one when
//     a destination is picked
// -----------------------------------------------------------

export default function RoutePreview({
  roomName,
  summary,
  imageSlot,
  levelLabels,
  accessible = false,
  onToggleAccessible,
  onStart,
  onClose,
}: {
  roomName: string;
  summary: KitRouteSummary;
  imageSlot?: ReactNode;
  levelLabels: (id: string) => string;
  accessible?: boolean;
  // Present → the avoid-stairs row shows; receives the NEXT value
  onToggleAccessible?: (next: boolean) => void;
  onStart: () => void;
  onClose?: () => void;
}) {

  const { colors, fonts, radii } = useKitTheme();
  const labels = useKitLabels();


  // The fold is one-way per destination: a new room closes it
  // during render, a re-rendered route to the same room keeps it
  const [stepsOpen, setStepsOpen] = useState(false);
  const [stateRoom, setStateRoom] = useState(roomName);
  if (stateRoom !== roomName) {
    setStateRoom(roomName);
    setStepsOpen(false);
  }


  const summaryLine = `${formatEta(summary.etaSeconds, labels)} · ${formatDistance(summary.distanceM, labels)}`;
  const hasSteps = summary.steps.length > 0;


  return (
    <View
      testID="wayfinduikit-preview"
      style={{
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radii.card,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >

      {imageSlot ? (
        <View
          testID="wayfinduikit-preview-image"
          accessible
          accessibilityRole="image"
          accessibilityLabel={labels.previewImageA11y(roomName)}
          style={{ backgroundColor: colors.bg }}
        >
          {imageSlot}
        </View>
      ) : null}

      <View style={{ padding: 14 }}>

        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Text
            testID="wayfinduikit-preview-title"
            numberOfLines={2}
            style={{ flex: 1, fontSize: 17, fontFamily: fonts.bold, fontWeight: '700', color: colors.ink }}
          >
            {labels.routeTo(roomName)}
          </Text>
          {onClose ? (
            <Pressable
              testID="wayfinduikit-preview-close"
              accessibilityRole="button"
              accessibilityLabel={labels.back}
              onPress={onClose}
              hitSlop={8}
              style={{ marginLeft: 8, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}
            >
              <Ionicons name="close" size={18} color={colors.inkSoft} />
            </Pressable>
          ) : null}
        </View>

        <Text testID="wayfinduikit-preview-summary" style={{ marginTop: 4, fontSize: 15, fontFamily: fonts.medium, color: colors.inkSoft }}>
          {summaryLine}
        </Text>

        {summary.levels.length > 0 ? <LevelChips levels={summary.levels} levelLabels={levelLabels} /> : null}

        {/* The row exists only when the host can act on it — a
            switch nobody listens to would be a lie */}
        {onToggleAccessible ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 12,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: colors.line,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: fonts.regular, color: colors.ink }}>{labels.avoidStairs}</Text>
              <Text testID="wayfinduikit-preview-mode" style={{ marginTop: 2, fontSize: 12, fontFamily: fonts.regular, color: colors.inkFaint }}>
                {accessible ? labels.accessibleRoute : labels.shortestRoute}
              </Text>
            </View>
            <Switch
              testID="wayfinduikit-preview-accessible"
              accessibilityLabel={labels.avoidStairs}
              value={accessible}
              onValueChange={(next) => onToggleAccessible(next)}
              trackColor={{ false: colors.line, true: colors.brand }}
              ios_backgroundColor={colors.line}
            />
          </View>
        ) : null}

        {hasSteps ? (
          <Pressable
            testID="wayfinduikit-preview-steps"
            accessibilityRole="button"
            accessibilityState={{ expanded: stepsOpen }}
            onPress={() => setStepsOpen((open) => !open)}
            style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingVertical: 6 }}
          >
            <Text style={{ fontSize: 14, fontFamily: fonts.medium, color: colors.brand }}>{stepsOpen ? labels.stepsHide : labels.stepsShow}</Text>
            <Ionicons name={stepsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.brand} style={{ marginLeft: 4 }} />
          </Pressable>
        ) : null}

        {hasSteps && stepsOpen ? (
          <View testID="wayfinduikit-preview-step-list">
            {summary.steps.map((step, i) => (
              <View key={i} style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.line }}>
                <InstructionLine step={step} />
              </View>
            ))}
          </View>
        ) : null}

        <Pressable
          testID="wayfinduikit-preview-start"
          accessibilityRole="button"
          accessibilityLabel={labels.start}
          onPress={onStart}
          style={{
            marginTop: 14,
            height: 46,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.brand,
          }}
        >
          <Text style={{ fontSize: 16, fontFamily: fonts.medium, fontWeight: '600', color: colors.onBrand }}>{labels.start}</Text>
        </Pressable>

      </View>
    </View>
  );
}
