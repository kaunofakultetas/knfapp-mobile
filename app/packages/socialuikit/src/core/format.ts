// -----------------------------------------------------------
//  [*] socialuikit — formatters
//
//  The two pure helpers the cards share: compacting a tally so
//  the action row never blows its column, and cutting a long
//  text at a word so the fold never splits one. No locale in
//  either — 'k'/'M' and the ellipsis read the same in both
//  catalogs, so these stay out of labels.
//
//  Used by:
//    - post/ActionRow.tsx — like and comment tallies
//    - post/PostCard.tsx — the folded body above 'read more'
//    - notifications/NotificationRow.tsx — the subject snippet
//    - social/ProfileHeader.tsx — post and connection counts
// -----------------------------------------------------------



// -----------------------------------------------------------
// formatCount
// -----------------------------------------------------------
//
// '0'..'999' exact, then '1.2k' / '1.2M' with one decimal and
// a trailing .0 dropped. The decimal is FLOORED, not rounded:
// 1999 is '1.9k' because a tally may never show more than the
// post actually has. Anything non-finite or negative renders
// as '0' — a defensive face, never NaN in the UI.
//
// Used by:
//   - post/ActionRow.tsx, social/ProfileHeader.tsx
// -----------------------------------------------------------

export function formatCount(n: number): string {

  const whole = Number.isFinite(n) ? Math.floor(n) : 0;
  if (whole <= 0) return '0';
  if (whole < 1000) return String(whole);


  // floor(n / scale·10) / 10 keeps exactly one floored decimal;
  // Number→string drops a whole value's '.0' by itself. Every
  // magnitude has a rung — without the B step a viral count
  // prints a four-digit mantissa ('1500M')
  if (whole < 1_000_000) return `${Math.floor(whole / 100) / 10}k`;
  if (whole < 1_000_000_000) return `${Math.floor(whole / 100_000) / 10}M`;
  return `${Math.floor(whole / 100_000_000) / 10}B`;
}







// -----------------------------------------------------------
// clampSnippet
// -----------------------------------------------------------
//
// At most `max` visible characters plus one ellipsis, cut at
// the last word boundary so no word is ever split — except a
// single unbroken run longer than max, which is hard-cut
// because there is no boundary to retreat to. Trailing
// whitespace and light punctuation are shaved before the
// ellipsis ('word,…' reads worse than 'word…'). Text already
// within max comes back untouched, ellipsis-free.
//
// Used by:
//   - post/PostCard.tsx, notifications/NotificationRow.tsx
// -----------------------------------------------------------

export function clampSnippet(text: string, max = 150): string {

  if (text.length <= max) return text;


  // A word ending exactly at the cut survives whole: only when
  // the cut lands INSIDE a word do we retreat to the boundary
  const head = text.slice(0, max);
  let cut = head;
  if (!/\s/.test(text.charAt(max))) {
    const boundary = head.search(/\s+\S*$/);
    if (boundary > 0) cut = head.slice(0, boundary);
  }


  return `${text.slice(0, retreatToGrapheme(text, cut.length)).replace(/[\s.,;:!?–—-]+$/, '')}…`;
}


// The cut position is a UTF-16 index, and UTF-16 indices are
// not characters: an emoji run has no whitespace to retreat to,
// so the head can end mid-surrogate, mid-flag or mid-family and
// render mojibake (or a mutated emoji) before the ellipsis. The
// retreat looks at BOTH sides of the cut and walks back past: a
// split surrogate pair; a joiner on either side of the cut —
// half a 👩‍💻 must drop WHOLLY, a bare 👩 would silently change
// the author's meaning; an odd run of regional indicators (a
// flag is a PAIR). Ordinary text is untouched — the loop exits
// on the first sound boundary
const JOINER = 0x200d;
const REGIONAL = /[\uD83C][\uDDE6-\uDDFF]/g;

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;

function retreatToGrapheme(text: string, end: number): number {
  for (; end > 0; ) {
    // Mid-surrogate: the kept side holds a dangling high half
    if (isHigh(text.charCodeAt(end - 1))) {
      end -= 1;
      continue;
    }
    // A joiner right AFTER the cut: the kept side ends with the
    // first half of a family — peel the preceding code point
    if (text.charCodeAt(end) === JOINER) {
      end -= isHigh(text.charCodeAt(end - 2)) ? 2 : 1;
      continue;
    }
    // A joiner right BEFORE the cut: peel it and loop back to
    // peel the code point it was joining from
    if (text.charCodeAt(end - 1) === JOINER) {
      end -= 1;
      continue;
    }
    break;
  }


  // Flags travel as regional-indicator PAIRS — an odd trailing
  // run means the last flag was halved; drop the orphan half
  const tail = text.slice(0, end).match(/(?:[\uD83C][\uDDE6-\uDDFF])+$/);
  if (tail) {
    const count = (tail[0].match(REGIONAL) ?? []).length;
    if (count % 2 === 1) end -= 2;
  }
  return Math.max(0, end);
}






// -----------------------------------------------------------
// parseServerStamp
// -----------------------------------------------------------
//
// Server stamps, read the way the SERVER meant them. A naive
// ISO datetime (no Z, no ±hh:mm — what SQLite column defaults
// and scraped rows carry) spec-parses as DEVICE-LOCAL time, so
// a just-posted row would read hours old anywhere east or west
// of the server; this parser treats zone-less stamps as UTC.
// Space-form 'YYYY-MM-DD HH:MM:SS' is folded to T-form first
// (bare new Date() rejects it on some engines). Unparseable
// input answers NaN — callers show their calm default.
//
// Used by:
//   - time/RelativeTime.tsx — every band computation
//   - hosts mapping wire rows outside the kit
// -----------------------------------------------------------

const ZONE_DESIGNATOR = /(?:Z|[+-]\d{2}:?\d{2})$/i;

export function parseServerStamp(iso: string): number {
  if (typeof iso !== 'string' || iso.trim() === '') return NaN;


  let normalized = iso.trim();
  if (normalized.includes(' ') && !normalized.includes('T')) normalized = normalized.replace(' ', 'T');
  // A date-only stamp already means midnight UTC to new Date();
  // only a datetime missing its zone needs the pin
  if (normalized.includes('T') && !ZONE_DESIGNATOR.test(normalized)) normalized += 'Z';
  return new Date(normalized).getTime();
}
