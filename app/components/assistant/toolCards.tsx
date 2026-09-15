// -----------------------------------------------------------
//  [*] Assistant — the three humanized tool cards
//
//  What a student sees while the agent works its tools: a
//  small card per call with the app's own iconography and a
//  localized, status-shaped title — "Ieškoma
//  tvarkaraštyje…", never the raw `lookupSchedule` the
//  generic fallback card would print — plus a one-line
//  natural-language summary of what was asked (the group
//  and range, the search words). A failed call shows its
//  error text in the danger ink: errors stay VISIBLE on
//  purpose, screenshots are how problems reach us.
//
//  The renderers are PLAIN FUNCTIONS by the kit's contract
//  (the card shell calls them, they may not hold hooks), so
//  the factory closes over everything render-time: the
//  theme colors and the already-translated strings the
//  screen resolves per render.
//
//  Split into:
//
//    ToolCardStrings           — what the screen translates
//    summarizeScheduleInput    — group/teacher/range → line
//    summarizeQueryInput       — query → quoted line
//    ToolCardFrame             — the shared card look
//    createAssistantToolCards  — the registry factory
// -----------------------------------------------------------

// The kit's renderer contract and the app's icon set
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import type { AssistantColors, ToolCardPart, ToolCardRenderer } from '@knf/assistantuikit';


type IoniconName = keyof typeof Ionicons.glyphMap;

// One icon per tool — the same glyph language as the tabs
const TOOL_ICONS: Record<string, IoniconName> = {
  lookupSchedule: 'calendar-outline',
  searchNews: 'newspaper-outline',
  searchHandbook: 'book-outline',
};







// -----------------------------------------------------------
// ToolCardStrings
// -----------------------------------------------------------
//
// What the screen hands over, already through i18n — one
// running/done pair per tool, the shared failed label, and
// the two range words the schedule summary composes with.
//
// Used by:
//   - createAssistantToolCards (below) — the factory input
//   - app/(main)/tabs/assistant.tsx — built off t()
// -----------------------------------------------------------

export interface ToolCardStrings {
  scheduleRunning: string;
  scheduleDone: string;
  newsRunning: string;
  newsDone: string;
  handbookRunning: string;
  handbookDone: string;
  failed: string;
  week: string;
  day: string;
}







// -----------------------------------------------------------
// summarizeScheduleInput
// -----------------------------------------------------------
//
// The lookupSchedule call as one human line: group and/or
// teacher, the range word, the date when one was named —
// "FT-1 · savaitė · 2026-09-15". Empty input answers ''
// and the summary line simply does not render.
//
// Used by:
//   - createAssistantToolCards (below)
// -----------------------------------------------------------

export function summarizeScheduleInput(input: unknown, strings: ToolCardStrings): string {
  const shaped = (input ?? {}) as { group?: unknown; teacher?: unknown; date?: unknown; range?: unknown };
  const parts = [
    typeof shaped.group === 'string' && shaped.group,
    typeof shaped.teacher === 'string' && shaped.teacher,
    shaped.range === 'week' ? strings.week : shaped.range === 'day' ? strings.day : null,
    typeof shaped.date === 'string' && shaped.date,
  ].filter((part): part is string => typeof part === 'string' && part.length > 0);
  return parts.join(' · ');
}







// -----------------------------------------------------------
// summarizeQueryInput
// -----------------------------------------------------------
//
// The search tools' input as the quoted words the model
// asked with — the student sees what was searched, not a
// JSON blob.
//
// Used by:
//   - createAssistantToolCards (below)
// -----------------------------------------------------------

export function summarizeQueryInput(input: unknown): string {
  const query = (input as { query?: unknown } | null)?.query;
  return typeof query === 'string' && query.trim() ? `„${query.trim()}“` : '';
}







// -----------------------------------------------------------
// ToolCardFrame
// -----------------------------------------------------------
//
// The shared look of all three cards: icon in a soft chip,
// the status-shaped title, the summary line under it, and —
// only when the call failed — the error text in danger ink,
// verbatim, because a screenshot must name the failure.
//
// Used by:
//   - createAssistantToolCards (below)
// -----------------------------------------------------------

function ToolCardFrame({ icon, title, summary, part, colors }: {
  icon: IoniconName;
  title: string;
  summary: string;
  part: ToolCardPart;
  colors: AssistantColors;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 6,
        backgroundColor: colors.surfaceSoft,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
          marginRight: 8,
        }}
      >
        <Ionicons name={icon} size={16} color={part.status === 'failed' ? colors.danger : colors.brand} />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: part.status === 'failed' ? colors.danger : colors.ink }}>
          {title}
        </Text>
        {summary ? (
          <Text style={{ fontSize: 12, color: colors.inkSoft }} numberOfLines={1}>
            {summary}
          </Text>
        ) : null}
        {part.status === 'failed' && part.errorText ? (
          <Text style={{ fontSize: 12, lineHeight: 16, color: colors.danger }}>{part.errorText}</Text>
        ) : null}
      </View>
    </View>
  );
}







// -----------------------------------------------------------
// createAssistantToolCards
// -----------------------------------------------------------
//
//   createAssistantToolCards(strings, colors)
//     → { lookupSchedule, searchNews, searchHandbook }
//
// The registry the screen memoizes and hands the kit's
// `tools` prop. A failed call keeps its tool's own title
// with the shared failed label — "Tvarkaraštis — nepavyko"
// — so the card still says WHAT failed.
//
// Used by:
//   - app/(main)/tabs/assistant.tsx
// -----------------------------------------------------------

export function createAssistantToolCards(
  strings: ToolCardStrings,
  colors: AssistantColors,
): Record<string, ToolCardRenderer> {
  const card = (
    icon: IoniconName,
    running: string,
    done: string,
    summarize: (input: unknown) => string,
  ): ToolCardRenderer => {
    const AssistantToolCard: ToolCardRenderer = (part) => (
      <ToolCardFrame
        icon={icon}
        title={part.status === 'running' ? running : part.status === 'failed' ? `${done} — ${strings.failed}` : done}
        summary={summarize(part.input)}
        part={part}
        colors={colors}
      />
    );
    return AssistantToolCard;
  };

  return {
    lookupSchedule: card(TOOL_ICONS.lookupSchedule, strings.scheduleRunning, strings.scheduleDone,
                         (input) => summarizeScheduleInput(input, strings)),
    searchNews: card(TOOL_ICONS.searchNews, strings.newsRunning, strings.newsDone, summarizeQueryInput),
    searchHandbook: card(TOOL_ICONS.searchHandbook, strings.handbookRunning, strings.handbookDone, summarizeQueryInput),
  };
}
