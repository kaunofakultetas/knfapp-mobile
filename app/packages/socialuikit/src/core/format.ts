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
  // Number→string drops a whole value's '.0' by itself
  if (whole < 1_000_000) return `${Math.floor(whole / 100) / 10}k`;
  return `${Math.floor(whole / 100_000) / 10}M`;
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


  return `${cut.replace(/[\s.,;:!?–—-]+$/, '')}…`;
}
