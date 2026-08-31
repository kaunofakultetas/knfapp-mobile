// -----------------------------------------------------------
//  [*] socialuikit — RelativeTime
//
//  The self-updating stamp under posts, comments and activity
//  rows: "Ką tik", "5 min.", "3 val.", "2 d.", then the plain
//  date once a week has passed (with the year appended only
//  when it differs from today's). With hasFuture the same
//  component reads a deadline instead — a poll countdown
//  through "Liko 2 dienos" / "Liko 5 valandos" / "Liko 1
//  minutė" down to "Netrukus baigsis"; a future stamp WITHOUT
//  hasFuture is clock skew between device and server, shown as
//  "Ką tik" rather than a nonsense negative age.
//
//  The stamp keeps itself honest with one setTimeout aimed at
//  the next boundary where its text can change (the current
//  band's unit edge), never sooner than 10 s and never later
//  than a day, cleared on unmount and re-aimed after every
//  fire. Time comes from env.now(), so a test freezes the
//  clock through the provider and the stamp follows it.
//
//  Used by:
//    - post/PostCard.tsx — the byline stamp
//    - comments/CommentRow.tsx — under each comment
//    - notifications/NotificationRow.tsx — the row's age
//    - poll/PollBlock.tsx — the countdown (hasFuture)
// -----------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { useKitEnv, useKitLabels, useKitTheme } from '../provider';
import { parseServerStamp } from '../core/format';
import type { KitLabels } from '../provider/labels';


const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

// A feed of fifty stamps must not wake fifty times a second,
// so no wake comes sooner than 10 s; the day ceiling keeps the
// wait far under the 32-bit timer limit
const MIN_WAIT_MS = 10 * SECOND;

const clampWait = (ms: number): number => Math.min(Math.max(ms, MIN_WAIT_MS), DAY);







// -----------------------------------------------------------
// dateLocale
// -----------------------------------------------------------
//
// The provider's resolved locale, mapped to the BCP 47 tag the
// date formatter wants. No guessing: the env carries the
// provider's own word, custom catalogs included.
//
// Used by:
//   - RelativeTime — the absolute band and the a11y datetime
// -----------------------------------------------------------

function dateLocale(locale: 'lt' | 'en'): string {
  return locale === 'en' ? 'en-GB' : 'lt-LT';
}







// -----------------------------------------------------------
// composeStamp
// -----------------------------------------------------------
//
// One pure pass answers both what to show and when to look
// again, so render and reschedule can never disagree. Counts
// floor in both directions: an age reads as the full units
// elapsed, a countdown as the full units remaining (the safe
// understatement for a deadline). Past waits aim at the next
// unit edge (unit minus the remainder); future waits aim at
// the remainder itself, and an exact-edge zero leans on the
// 10 s floor to catch the band change just after it.
//
// Used by:
//   - RelativeTime below
// -----------------------------------------------------------

function composeStamp(
  date: Date,
  now: Date,
  hasFuture: boolean,
  labels: KitLabels,
  locale: string,
): { text: string; waitMs: number } {

  const delta = now.getTime() - date.getTime();

  // A malformed iso must never spin the timer: show the calm
  // default and look again tomorrow
  if (Number.isNaN(delta)) return { text: labels.justNow, waitMs: DAY };


  if (delta < 0) {
    const left = -delta;

    // Skew clamp: a "future" post is just an unsynced clock;
    // re-check when the skew should have resolved
    if (!hasFuture) return { text: labels.justNow, waitMs: clampWait(left) };

    if (left >= 2 * DAY) return { text: labels.pollEndsInDays(Math.floor(left / DAY)), waitMs: clampWait(left % DAY) };
    if (left >= HOUR) return { text: labels.pollEndsInHours(Math.floor(left / HOUR)), waitMs: clampWait(left % HOUR) };
    if (left >= MINUTE) return { text: labels.pollEndsInMinutes(Math.floor(left / MINUTE)), waitMs: clampWait(left % MINUTE) };
    return { text: labels.pollEndsSoon, waitMs: clampWait(left) };
  }


  // Anything under a minute reads as now — second-by-second
  // ages are noise under a post
  if (delta < MINUTE) return { text: labels.justNow, waitMs: clampWait(MINUTE - delta) };
  if (delta < HOUR) return { text: labels.minutesShort(Math.floor(delta / MINUTE)), waitMs: clampWait(MINUTE - (delta % MINUTE)) };
  if (delta < DAY) return { text: labels.hoursShort(Math.floor(delta / HOUR)), waitMs: clampWait(HOUR - (delta % HOUR)) };
  if (delta < WEEK) return { text: labels.daysShort(Math.floor(delta / DAY)), waitMs: clampWait(DAY - (delta % DAY)) };


  // Past a week the age stops mattering and the date takes
  // over; the year earns its place only across a year boundary
  const absolute = date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  const text = date.getFullYear() === now.getFullYear() ? absolute : `${absolute}, ${date.getFullYear()}`;
  return { text, waitMs: clampWait(DAY - (delta % DAY)) };
}







// -----------------------------------------------------------
// RelativeTime
// -----------------------------------------------------------
//
//   <RelativeTime iso={post.createdAt} />
//   <RelativeTime iso={poll.endsAt} hasFuture />
//
// The tick counter only forces the re-render; the effect keys
// on it too because two consecutive waits can be equal (one
// minute, then one minute again) and the timer must be re-aimed
// after every fire regardless.
//
// Used by:
//   - post/PostCard.tsx, comments/CommentRow.tsx,
//     notifications/NotificationRow.tsx, poll/PollBlock.tsx
// -----------------------------------------------------------

export default function RelativeTime({
  iso,
  hasFuture = false,
  style,
}: {
  iso: string;
  hasFuture?: boolean;
  style?: StyleProp<TextStyle>;
}) {

  const labels = useKitLabels();
  const env = useKitEnv();
  const { colors, fonts } = useKitTheme();
  const [tick, setTick] = useState(0);


  // parseServerStamp pins zone-less stamps to UTC — a naive
  // SQLite default must never read as device-local time
  const date = useMemo(() => new Date(parseServerStamp(iso)), [iso]);
  const locale = dateLocale(env.locale);
  const { text, waitMs } = composeStamp(date, env.now(), hasFuture, labels, locale);


  useEffect(() => {
    const timer = setTimeout(() => setTick((count) => count + 1), waitMs);
    return () => clearTimeout(timer);
  }, [tick, waitMs, iso, hasFuture]);


  return (
    <Text
      style={[{ color: colors.inkFaint, fontFamily: fonts.regular, fontSize: 13 }, style]}
      accessibilityLabel={labels.timeA11y(date.toLocaleString(locale))}
    >
      {text}
    </Text>
  );
}
