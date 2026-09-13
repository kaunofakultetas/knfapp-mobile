// -----------------------------------------------------------
//  [*] timetableuikit — LessonCard
//
//  One timetable entry as a list card: left accent bar, title
//  + person line, a room chip, and a footer with the time
//  range and a free-form footnote (a group · semester pair, a
//  program name — the host's business). A conflicting lesson
//  flips to the danger wash with a bordered clash chip — the
//  wash alone is easy to miss, and a soft-on-soft chip would
//  vanish into the card's own danger ground.
//
//  The prop shape is NEUTRAL on purpose: plain strings, no
//  wire type from any backend — the same mirrored-shapes rule
//  the kit keeps toward the engine. Times render exactly as
//  handed (wall-clock "HH:MM" strings).
//
//  Used by:
//    - hosts — a FlatList renderItem over their day's rows
// -----------------------------------------------------------

import { Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { useTimetableLabels, useTimetableTheme } from '../provider';


export interface LessonCardProps {
  title: string;
  // The teacher line under the title (or a group line — the
  // host picks whose name goes here per perspective)
  person: string;
  room: string;
  timeStart: string;
  timeEnd: string;
  // The footer's right side — "IT-3 · 2026-R" and the like
  footnote?: string;
  conflict?: boolean;
  // Optional host icons for the clash chip and the time range
  conflictIcon?: ReactNode;
  timeIcon?: ReactNode;
}


export default function LessonCard({
  title,
  person,
  room,
  timeStart,
  timeEnd,
  footnote,
  conflict = false,
  conflictIcon,
  timeIcon,
}: LessonCardProps) {

  const { colors, fonts } = useTimetableTheme();
  const labels = useTimetableLabels();
  const accent = conflict ? colors.danger : colors.brand;


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

          {conflict && (
            <View
              style={{
                marginBottom: 8,
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
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
          )}

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ marginRight: 12, flex: 1 }}>
              <Text numberOfLines={2} style={{ fontFamily: fonts.bold, fontSize: 16, lineHeight: 24, color: colors.ink }}>
                {title}
              </Text>
              <Text numberOfLines={1} style={{ marginTop: 6, fontFamily: fonts.regular, fontSize: 14, color: colors.inkSoft }}>
                {person}
              </Text>
            </View>
            <View style={{ maxWidth: 130, borderRadius: 8, backgroundColor: colors.brandSoft, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.brand }}>
                {room}
              </Text>
            </View>
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
              <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: accent }}>
                {timeStart} {'–'} {timeEnd}
              </Text>
            </View>
            {footnote ? (
              <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.inkSoft }}>{footnote}</Text>
            ) : null}
          </View>

        </View>

      </View>
    </View>
  );
}
