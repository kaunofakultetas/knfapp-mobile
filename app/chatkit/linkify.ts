// -----------------------------------------------------------
//  [*] chatkit — linkify
//
//  Splits message text into plain and link segments so bubbles
//  can render URLs as tappable, underlined runs. Recognises
//  http(s) URLs and bare www./domain.tld hosts; trailing
//  punctuation stays outside the link. A match glued to a
//  preceding word character or @ is left as text (so an email's
//  domain half never becomes a web link), and a text longer
//  than the cap is not scanned at all — the bounded host
//  pattern plus the cap keep the regex work linear.
//
//  Used by:
//    - chatkit/MessageBubble.tsx
// -----------------------------------------------------------


export type TextSegment = { type: 'text'; value: string } | { type: 'link'; value: string; href: string };


// Past this length a message renders as plain text — nobody
// taps links in a wall of text, and the scan stays cheap
const MAX_LINKIFY_LENGTH = 2000;

// Host labels are bounded ({1,63} chars, at most 6 deep) so a
// long dotted run cannot make the matcher backtrack quadratically
const URL_RE = /((?:https?:\/\/|www\.)[^\s<>()]+|(?:[a-z0-9-]{1,63}\.){1,6}(?:lt|com|org|net|eu|io|edu|gov|dev|app)(?:\/[^\s<>()]*)?)/gi;
const TRAILING_RE = /[.,;:!?)\]'"»]+$/;
const GLUED_BEFORE_RE = /[\w@.-]/;


export function linkify(text: string): TextSegment[] {
  if (text.length > MAX_LINKIFY_LENGTH) return text ? [{ type: 'text', value: text }] : [];

  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    let raw = match[0];

    // A match glued to a word character, dot, dash or @ is not a
    // link — it is the tail of an email address or of a longer word
    if (start > 0 && GLUED_BEFORE_RE.test(text[start - 1])) continue;

    // Keep sentence punctuation out of the link
    const trailing = raw.match(TRAILING_RE)?.[0] ?? '';
    raw = raw.slice(0, raw.length - trailing.length);
    if (!raw) continue;

    if (start > cursor) segments.push({ type: 'text', value: text.slice(cursor, start) });
    segments.push({ type: 'link', value: raw, href: /^https?:\/\//i.test(raw) ? raw : `https://${raw}` });
    cursor = start + raw.length;
  }

  if (cursor < text.length) segments.push({ type: 'text', value: text.slice(cursor) });
  return segments;
}
