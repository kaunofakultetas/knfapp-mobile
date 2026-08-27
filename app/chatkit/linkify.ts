// -----------------------------------------------------------
//  [*] chatkit — linkify
//
//  Splits message text into plain and link segments so bubbles
//  can render URLs as tappable, underlined runs. Recognises
//  http(s) URLs and bare www./domain.tld hosts; trailing
//  punctuation stays outside the link.
//
//  Used by:
//    - chatkit/MessageBubble.tsx
// -----------------------------------------------------------


export type TextSegment = { type: 'text'; value: string } | { type: 'link'; value: string; href: string };


const URL_RE = /((?:https?:\/\/|www\.)[^\s<>()]+|(?:[a-z0-9-]+\.)+(?:lt|com|org|net|eu|io|edu|gov|dev|app)(?:\/[^\s<>()]*)?)/gi;
const TRAILING_RE = /[.,;:!?)\]'"»]+$/;


export function linkify(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    let raw = match[0];

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
