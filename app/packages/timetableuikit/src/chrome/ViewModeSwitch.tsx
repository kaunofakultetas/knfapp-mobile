// -----------------------------------------------------------
//  [*] timetableuikit — ViewModeSwitch
//
//  The list / day / week segment. Icons only — the row it
//  usually shares with a filter summary is tight — with the
//  mode name riding the accessibility label from the kit's
//  catalog. The kit stays dependency-free: a host with an
//  icon set passes renderIcon; without it, plain text glyphs
//  stand in.
//
//  Used by:
//    - hosts, beside their filter row
// -----------------------------------------------------------

import { Pressable, Text, View, type ColorValue } from 'react-native';
import type { ReactNode } from 'react';

import { useTimetableLabels, useTimetableTheme } from '../provider';







// -----------------------------------------------------------
// TimetableViewMode
// -----------------------------------------------------------
//
// The three ways a timetable screen shows its data.
//
// Used by:
//   - GLYPHS / MODES and ViewModeSwitch (below)
//   - re-exported through the package surface; no host
//     imports it directly today
// -----------------------------------------------------------

export type TimetableViewMode = 'list' | 'day' | 'week';

// The dependency-free stand-ins when the host renders no icons
const GLYPHS: Record<TimetableViewMode, string> = { list: '≡', day: '◷', week: '⊞' };

// Segment order, fixed — matches the glyphs and the catalog
const MODES: readonly TimetableViewMode[] = ['list', 'day', 'week'];







// -----------------------------------------------------------
// ViewModeSwitch (default export)
// -----------------------------------------------------------
//
// The active segment gets the raised surface chip; a press
// always calls onChange, the already-active mode included —
// ignoring the no-op change is the host's concern.
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — beside the filter row
// -----------------------------------------------------------

export default function ViewModeSwitch({
  mode,
  onChange,
  renderIcon,
}: {
  mode: TimetableViewMode;
  onChange: (mode: TimetableViewMode) => void;
  renderIcon?: (mode: TimetableViewMode, color: ColorValue, size: number) => ReactNode;
}) {

  const { colors } = useTimetableTheme();
  const labels = useTimetableLabels();
  const labelOf: Record<TimetableViewMode, string> = {
    list: labels.viewList,
    day: labels.viewDay,
    week: labels.viewWeek,
  };


  return (
    <View style={{ flexDirection: 'row', borderRadius: 8, backgroundColor: colors.surfaceSoft, padding: 2 }}>
      {MODES.map((candidate) => {
        const active = candidate === mode;
        const color = active ? colors.brand : colors.inkFaint;
        return (
          <Pressable
            key={candidate}
            onPress={() => onChange(candidate)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={labelOf[candidate]}
            style={{
              height: 32,
              width: 36,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              backgroundColor: active ? colors.surface : 'transparent',
            }}
          >
            {renderIcon ? renderIcon(candidate, color, 16) : <Text style={{ color, fontSize: 14 }}>{GLYPHS[candidate]}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}
