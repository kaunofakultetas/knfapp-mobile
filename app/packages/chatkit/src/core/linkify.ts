// -----------------------------------------------------------
//  [*] chatkit — linkify
//
//  Splits message text into plain and tappable segments: web
//  URLs (scheme, www., or a bare host on a known TLD), e-mail
//  addresses (mailto:) and international phone numbers (tel:,
//  a leading + and 7–15 digits — the only phone shape that is
//  unambiguous inside prose). Matches are collected from the
//  three matchers, sorted, and the first to claim a span wins,
//  so an address's domain is never also a link. A URL glued to
//  a word or an @ is left alone, trailing punctuation is given
//  back to the sentence, and very long texts are not scanned
//  at all (the regexes are linear, the render is not).
//
//  Used by:
//    - MessageBubble.tsx — the tappable body
//    - MessageContextMenu.tsx — the floating copy
// -----------------------------------------------------------

export type LinkKind = 'url' | 'email' | 'phone';

export type TextSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string; kind?: LinkKind };


const MAX_LINKIFY_LENGTH = 2000;

const URL_RE = /((?:https?:\/\/|www\.)[^\s<>()]+|(?:[a-z0-9-]{1,63}\.){1,6}(?:lt|com|org|net|eu|io|edu|gov|dev|app)(?:\/[^\s<>()]*)?)/gi;
const EMAIL_RE = /[\w.+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;
const PHONE_RE = /\+\d(?:[\d\s()-]{5,17}\d)/g;

const TRAILING_RE = /[.,;:!?)\]'"»]+$/;
const GLUED_BEFORE_RE = /[\w@.-]/;


interface Match {
  start: number;
  end: number;
  value: string;
  href: string;
  kind: LinkKind;
}


function collect(text: string): Match[] {
  const found: Match[] = [];

  for (const match of text.matchAll(EMAIL_RE)) {
    const start = match.index ?? 0;
    const raw = match[0].replace(TRAILING_RE, '');
    if (!raw) continue;
    found.push({ start, end: start + raw.length, value: raw, href: `mailto:${raw}`, kind: 'email' });
  }

  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    if (start > 0 && GLUED_BEFORE_RE.test(text[start - 1])) continue;
    const trailing = match[0].match(TRAILING_RE)?.[0] ?? '';
    const raw = match[0].slice(0, match[0].length - trailing.length);
    if (!raw) continue;
    found.push({
      start,
      end: start + raw.length,
      value: raw,
      href: /^https?:\/\//i.test(raw) ? raw : `https://${raw}`,
      kind: 'url',
    });
  }

  for (const match of text.matchAll(PHONE_RE)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const digits = raw.replace(/[^\d+]/g, '');
    // 7–15 digits after the plus: E.164's range, nothing shorter
    if (digits.length < 8 || digits.length > 16) continue;
    if (start > 0 && /\w/.test(text[start - 1])) continue;
    found.push({ start, end: start + raw.length, value: raw, href: `tel:${digits}`, kind: 'phone' });
  }

  // Earliest first; on a tie the longer claim wins; overlaps drop
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Match[] = [];
  let cursor = 0;
  for (const match of found) {
    if (match.start < cursor) continue;
    kept.push(match);
    cursor = match.end;
  }
  return kept;
}


export function linkify(text: string): TextSegment[] {
  if (text.length > MAX_LINKIFY_LENGTH) return text ? [{ type: 'text', value: text }] : [];

  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const match of collect(text)) {
    if (match.start > cursor) segments.push({ type: 'text', value: text.slice(cursor, match.start) });
    segments.push({ type: 'link', value: match.value, href: match.href, kind: match.kind });
    cursor = match.end;
  }

  if (cursor < text.length) segments.push({ type: 'text', value: text.slice(cursor) });
  return segments;
}
