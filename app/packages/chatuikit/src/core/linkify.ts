// -----------------------------------------------------------
//  [*] chatuikit — linkify
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
//  With mentionNames, "@Display Name" runs that match one of
//  the room's members (case- and diacritic-insensitively,
//  longest name first) become mention segments — the names are
//  matched in place, never re-indexed through normalization,
//  so Lithuanian diacritics cannot shift a span.
//
//  Used by:
//    - MessageBubble.tsx — the tappable body
//    - MessageContextMenu.tsx — the floating copy
// -----------------------------------------------------------







// -----------------------------------------------------------
// LinkKind
// -----------------------------------------------------------
//
// Which matcher claimed a link segment — url, email or phone.
//
// Used by:
//   - TextSegment (below) — the link variant's `kind`
//   - exported through the kit's barrel for hosts
// -----------------------------------------------------------

export type LinkKind = 'url' | 'email' | 'phone';







// -----------------------------------------------------------
// TextSegment
// -----------------------------------------------------------
//
// One piece of a split message body: plain text, a tappable
// link with its href, or a mention run with the member's name.
//
// Used by:
//   - linkify (below) — the return shape
//   - message/MessageText.tsx / message/MessageBubble.tsx —
//     render the pieces
// -----------------------------------------------------------

export type TextSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string; kind?: LinkKind }
  | { type: 'mention'; value: string; name: string };


// Texts longer than this are returned as one plain segment —
// the regexes are linear, but rendering many segments is not
const MAX_LINKIFY_LENGTH = 2000;

// Web URLs: a scheme, www., or a bare host on a known TLD
const URL_RE = /((?:https?:\/\/|www\.)[^\s<>]+|(?:[a-z0-9-]{1,63}\.){1,6}(?:lt|com|org|net|eu|io|edu|gov|dev|app)(?:\/[^\s<>]*)?)/gi;
// E-mail addresses — become mailto: links
const EMAIL_RE = /[\w.+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;
// Phones: a leading + and 7–15 digits — the only phone shape
// that is unambiguous inside prose; becomes a tel: link
const PHONE_RE = /\+\d(?:[\d\s()-]{5,17}\d)/g;

// Sentence punctuation stripped off a match's tail and handed
// back to the prose
const TRAILING_RE = /[.,;:!?)\]'"»]+$/;
// A character that glues a match to the preceding word or @ —
// such matches are skipped rather than half-linked
const GLUED_BEFORE_RE = /[\w@.-]/;







// -----------------------------------------------------------
// trimUrlTail
// -----------------------------------------------------------
//
// Sentence punctuation goes back to the prose — but a closing
// paren only while UNBALANCED, so an encyclopedia path that
// opened one keeps it and a link merely wrapped in parens does
// not drag the wrapper along.
//
// Used by:
//   - collect (below) — every URL match's tail
// -----------------------------------------------------------

function trimUrlTail(raw: string): string {
  let out = raw;
  for (;;) {
    const last = out[out.length - 1];
    if (!last) return out;
    if (/[.,;:!?\]'"»]/.test(last)) {
      out = out.slice(0, -1);
      continue;
    }
    if (last === ')') {
      const opens = (out.match(/\(/g) ?? []).length;
      const closes = (out.match(/\)/g) ?? []).length;
      if (closes > opens) {
        out = out.slice(0, -1);
        continue;
      }
    }
    return out;
  }
}


interface Match {
  start: number;
  end: number;
  value: string;
  href: string;
  kind: LinkKind;
}

interface MentionMatch {
  start: number;
  end: number;
  value: string;
  name: string;
}







// -----------------------------------------------------------
// fold
// -----------------------------------------------------------
//
// Case- and diacritic-insensitive comparison key. Only ever
// applied to SLICES being compared, never to the whole text —
// NFD changes string length, which would shift every index.
//
// Used by:
//   - collectMentions (below) — the name comparison
// -----------------------------------------------------------

const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();







// -----------------------------------------------------------
// collectMentions
// -----------------------------------------------------------
//
// An @ at a word boundary followed by one of the names, longest
// name first so "@Vardenis Pavardenis" never stops at a member
// called "Vardenis"; the run must END at a boundary too, so
// "@Onaitė" never claims the "Ona" of another member.
//
// Used by:
//   - linkify (below) — the mention side of the claim pass
// -----------------------------------------------------------

function collectMentions(text: string, names: readonly string[]): MentionMatch[] {
  const sorted = [...new Set(names.filter((name) => name && name.length <= 60))].sort((a, b) => b.length - a.length);
  if (sorted.length === 0) return [];
  const found: MentionMatch[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@') continue;
    if (i > 0 && !/\s/.test(text[i - 1])) continue;
    for (const name of sorted) {
      const slice = text.slice(i + 1, i + 1 + name.length);
      if (slice.length !== name.length || fold(slice) !== fold(name)) continue;
      const after = text[i + 1 + name.length];
      if (after !== undefined && /[\p{L}\p{N}_]/u.test(after)) continue;
      found.push({ start: i, end: i + 1 + name.length, value: text.slice(i, i + 1 + name.length), name });
      break;
    }
  }
  return found;
}







// -----------------------------------------------------------
// collect
// -----------------------------------------------------------
//
// The three link matchers over one text: e-mails (a typed
// mailto: absorbed into its address), URLs (skipped when glued
// to a word or an @), phones (E.164's 7–15 digits) — then one
// claim pass: earliest first, the longer span on a tie,
// overlaps drop, so an address's domain is never also a link.
//
// Used by:
//   - linkify (below) — the link side of the claim pass
// -----------------------------------------------------------

function collect(text: string): Match[] {
  const found: Match[] = [];

  for (const match of text.matchAll(EMAIL_RE)) {
    let start = match.index ?? 0;
    const raw = match[0].replace(TRAILING_RE, '');
    if (!raw) continue;
    // A typed "mailto:" belongs to its address — one link, the
    // prefix never doubled and never stranded as prose
    let value = raw;
    if (text.slice(Math.max(0, start - 7), start).toLowerCase() === 'mailto:') {
      start -= 7;
      value = text.slice(start, start + 7) + raw;
    }
    found.push({ start, end: start + value.length, value, href: `mailto:${raw}`, kind: 'email' });
  }

  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    if (start > 0 && GLUED_BEFORE_RE.test(text[start - 1])) continue;
    const raw = trimUrlTail(match[0]);
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







// -----------------------------------------------------------
// linkify
// -----------------------------------------------------------
//
//   linkify(text)                    — links only
//   linkify(text, { mentionNames })  — links + mention runs
//
// Links and mentions share one claim pass: earliest first, the
// longer span on a tie, overlaps drop. A text beyond 2000
// chars comes back as a single plain segment — the regexes are
// linear, the render is not.
//
// Used by:
//   - message/MessageText.tsx — the tappable body (also the
//     context menu's floating copy, through BubbleBody)
//   - message/MessageBubble.tsx — pre-splits the segments
// -----------------------------------------------------------

export function linkify(text: string, options: { mentionNames?: readonly string[] } = {}): TextSegment[] {
  if (text.length > MAX_LINKIFY_LENGTH) return text ? [{ type: 'text', value: text }] : [];

  // Links and mentions share one claim pass: earliest first, the
  // longer span on a tie, overlaps drop — an e-mail's @ is glued
  // to its word, so it can never double as a mention
  const matches: (Match | MentionMatch)[] = [...collect(text), ...collectMentions(text, options.mentionNames ?? [])];
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: (Match | MentionMatch)[] = [];
  let claimed = 0;
  for (const match of matches) {
    if (match.start < claimed) continue;
    kept.push(match);
    claimed = match.end;
  }

  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const match of kept) {
    if (match.start > cursor) segments.push({ type: 'text', value: text.slice(cursor, match.start) });
    if ('name' in match) segments.push({ type: 'mention', value: match.value, name: match.name });
    else segments.push({ type: 'link', value: match.value, href: match.href, kind: match.kind });
    cursor = match.end;
  }

  if (cursor < text.length) segments.push({ type: 'text', value: text.slice(cursor) });
  return segments;
}
