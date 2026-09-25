// -----------------------------------------------------------
//  [*] timetableuikit — LessonCard
//
//  One timetable entry as a list card: left accent bar, title
//  + person line, a room chip, and a footer with the time
//  range and, on its right, the lesson's everyday kind
//  ("Pratybos"), a free-form footnote (a group name, a
//  program name — the host's business) and the subgroups the
//  lesson names. A conflicting lesson flips to the danger
//  wash with a bordered clash chip — the wash alone is easy
//  to miss, and a soft-on-soft chip would vanish into the
//  card's own danger ground. A lesson of a badge kind (an
//  exam, a retake, … — core/kinds) leads with a FILLED brand
//  chip naming it, beside the clash chip when both apply. A
//  host that ticks a clock may add a STATUS chip ahead of
//  both: the lecture under way (a soft brand chip with a dot
//  in the now line's colour — the grid's own "now") or the
//  next one's countdown (a quiet outlined chip).
//
//  The prop shape is NEUTRAL on purpose: plain strings, no
//  wire type from any backend — the same mirrored-shapes rule
//  the kit keeps toward the engine. Times render exactly as
//  handed (wall-clock "HH:MM" strings). Brand-toned TEXT
//  (the time, the room) uses brandText — the fill brand
//  fails AA as small text on dark surfaces (3.06–3.57:1). The
//  footer's right side shrinks and wraps: a teacher card's
//  "FT-1, ISKS-1, MV-1 · 1 pogrupis" must never push past a
//  320 pt card edge. On a phone narrower than 360 pt the room
//  chip leaves the title's side for a row under the teacher:
//  beside a 130 pt chip the title column was ~110 pt, and
//  both the title and the teacher were cut to a few words.
//
//  Used by:
//    - hosts — a FlatList renderItem over their day's rows
// -----------------------------------------------------------

import { Text, View, useWindowDimensions, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { isBadgeKind, kindBadge } from '../core/kinds';
import { useTimetableLabels, useTimetableTheme } from '../provider';







// -----------------------------------------------------------
// LessonCardProps
// -----------------------------------------------------------
//
// Plain strings on purpose — no wire type from any backend;
// times render exactly as handed.
//
// Used by:
//   - LessonCard (below)
//   - app/(main)/tabs/schedule.tsx — the list view's rows
// -----------------------------------------------------------

export interface LessonCardProps {
  title: string;
  // The teacher line under the title (or a group line — the
  // host picks whose name goes here per perspective)
  person: string;
  room: string;
  timeStart: string;
  timeEnd: string;
  // The footer's right side — "IT-3" and the like
  footnote?: string;
  // The engine's canonical kind — a badge kind leads the card
  kind?: string;
  // The subgroups the lesson names; appended to the footnote
  subgroups?: readonly string[];
  conflict?: boolean;
  // Optional host icons for the clash chip and the time range
  conflictIcon?: ReactNode;
  timeIcon?: ReactNode;
  // The live status chip — label already worded; live marks
  // the lecture under way, else it is the next one's countdown
  status?: { label: string; live: boolean };
}







// -----------------------------------------------------------
// RoomChip
// -----------------------------------------------------------
//
// The room in a soft brand chip, one line — beside the title
// (capped at 130 pt) or, on a narrow phone, on its own row
// (as wide as the card allows).
//
// Used by:
//   - LessonCard (below)
// -----------------------------------------------------------

function RoomChip({ room, style }: { room: string; style: ViewStyle }) {

  const { colors, fonts } = useTimetableTheme();


  return (
    <View style={[{ borderRadius: 8, backgroundColor: colors.brandSoft, paddingHorizontal: 14, paddingVertical: 8 }, style]}>
      <Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.brandText }}>
        {room}
      </Text>
    </View>
  );
}







// -----------------------------------------------------------
// LessonCard (default export)
// -----------------------------------------------------------
//
// Purely presentational — no Pressable inside; a host that
// wants tappable rows wraps the card itself. The accent bar
// and the time range share one conflict-aware hue (the bar
// in the fill brand, the time in the AA-safe brandText).
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — the list view's
//     renderItem
// -----------------------------------------------------------

export default function LessonCard({
  title,
  person,
  room,
  timeStart,
  timeEnd,
  footnote,
  kind,
  subgroups = [],
  conflict = false,
  conflictIcon,
  timeIcon,
  status,
}: LessonCardProps) {

  const { colors, fonts } = useTimetableTheme();
  const labels = useTimetableLabels();
  const { width: windowWidth } = useWindowDimensions();
  // The narrow-phone layout: the room under the teacher line
  const stackRoom = windowWidth < 360;
  const accent = conflict ? colors.danger : colors.brand;
  const accentText = conflict ? colors.danger : colors.brandText;
  const badge = kindBadge(labels, kind);
  // The everyday kind names itself quietly here — a badge
  // kind already did, at the top
  const everydayKind = kind && !isBadgeKind(kind) ? (labels.kinds[kind] ?? null) : null;
  const footer = [everydayKind, footnote, subgroups.length > 0 ? labels.subgroups(subgroups) : null]
    .filter(Boolean)
    .join(' · ');


  return (
    <View
      style={{
        overflow: 'hidden',
        borderRadius: 12,
        backgroundColor: conflict ? colors.dangerSoft : colors.surface,
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      <View style={{ flexDirection: 'row' }}>

        <View style={{ width: 4, backgroundColor: accent }} />

        <View style={{ flex: 1, padding: 16 }}>

          {badge || conflict || status ? (
            <View style={{ marginBottom: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>

              {status ? (
                <View
                  testID="timetableuikit-status"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: status.live ? colors.brandSoft : colors.line,
                    backgroundColor: status.live ? colors.brandSoft : 'transparent',
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  {status.live ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.nowLine }} /> : null}
                  <Text
                    style={{
                      fontFamily: status.live ? fonts.bold : fonts.medium,
                      fontSize: 12,
                      color: status.live ? colors.brandText : colors.inkSoft,
                    }}
                  >
                    {status.label}
                  </Text>
                </View>
              ) : null}

              {badge ? (
                <View
                  testID="timetableuikit-kind-badge"
                  style={{
                    justifyContent: 'center',
                    borderRadius: 8,
                    backgroundColor: colors.brand,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.onBrand }}>{badge}</Text>
                </View>
              ) : null}

              {conflict ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.danger,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  {conflictIcon}
                  <Text
                    style={{
                      marginLeft: conflictIcon ? 6 : 0,
                      fontFamily: fonts.bold,
                      fontSize: 12,
                      color: colors.danger,
                    }}
                  >
                    {labels.conflictBadge}
                  </Text>
                </View>
              ) : null}

            </View>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ marginRight: stackRoom ? 0 : 12, flex: 1 }}>
              <Text numberOfLines={2} style={{ fontFamily: fonts.bold, fontSize: 16, lineHeight: 24, color: colors.ink }}>
                {title}
              </Text>
              <Text numberOfLines={1} style={{ marginTop: 6, fontFamily: fonts.regular, fontSize: 14, color: colors.inkSoft }}>
                {person}
              </Text>
              {stackRoom && room ? <RoomChip room={room} style={{ alignSelf: 'flex-start', maxWidth: '100%', marginTop: 10 }} /> : null}
            </View>
            {!stackRoom && room ? <RoomChip room={room} style={{ maxWidth: 130 }} /> : null}
          </View>

          <View
            style={{
              marginTop: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTopWidth: 1,
              borderTopColor: conflict ? colors.danger : colors.line,
              paddingTop: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {timeIcon}
              <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: accentText }}>
                {timeStart} {'–'} {timeEnd}
              </Text>
            </View>
            {footer ? (
              <Text
                numberOfLines={2}
                style={{
                  flexShrink: 1,
                  marginLeft: 12,
                  textAlign: 'right',
                  fontFamily: fonts.regular,
                  fontSize: 12,
                  color: colors.inkSoft,
                }}
              >
                {footer}
              </Text>
            ) : null}
          </View>

        </View>

      </View>
    </View>
  );
}
