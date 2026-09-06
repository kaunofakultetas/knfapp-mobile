// -----------------------------------------------------------
//  [*] assistantuikit — markdown
//
//  The pure parser under MarkdownText: the model's reply in as
//  a string, a tree of blocks out, nothing rendered here. The
//  dialect is the small one a chat answer actually uses —
//  paragraphs with bold / italic / inline code / links,
//  headings 1-3, fenced code, ordered and unordered lists
//  nested one level, blockquotes, horizontal rules — plus the
//  rules that keep it honest while the text is still ARRIVING,
//  each pinned by a test:
//
//    - an unterminated marker is text, not a construct: an
//      open ** / _ / ` renders its characters literally, and
//      an open ``` fence renders the fence line and everything
//      after it as ONE plain paragraph until the closer lands
//      (a code sample must not italicise itself mid-stream);
//    - a single newline inside a paragraph is a line break
//      (models break lines on purpose — addresses, verses), a
//      blank line is a new block;
//    - blank lines between top-level items of the same kind
//      stay inside ONE list — models blank-separate items and
//      often number each one "1.", and the renderer counts on
//      from the list's start;
//    - only "1." or "1)" may interrupt a paragraph — a year at
//      a line start ("2025. rugsėjo 1 d.") is prose — while
//      any start number may open a list after a blank line;
//    - CRLF and lone CR normalise to LF, trailing whitespace
//      drops per line, empty input parses to no blocks;
//    - a backslash before ASCII punctuation escapes it, an
//      underscore inside a word (snake_case) is a character,
//      and combining marks count as word characters, so NFD
//      Lithuanian parses like NFC;
//    - emphasis steps over complete links, so a _ or * inside
//      a URL never closes the construct around it.
//
//  splitStreamingTail is the streaming seam: the settled
//  prefix — whole lines, closed fences, and on the line still
//  being written everything up to its last finished, stable
//  construct — parses as markdown, so a closed **bold** or
//  [link] renders rich as it streams, while the tail (the
//  mutable rest of that line, or the open fence) shows as
//  plain text until it closes — a half-typed marker is never
//  read as a finished one. appendStreamTail splices that plain
//  tail back onto the tree's last leaf so the visual line
//  never breaks in two.
//
//  Used by:
//    - MarkdownText.tsx — parseMarkdown, splitStreamingTail,
//      appendStreamTail
// -----------------------------------------------------------

export type MarkdownInline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'bold'; spans: MarkdownInline[] }
  | { type: 'italic'; spans: MarkdownInline[] }
  | { type: 'link'; url: string; title: string | null; spans: MarkdownInline[] };

export interface MarkdownListItem {
  spans: MarkdownInline[];
  // One level only — an even deeper indent joins this same list
  nested: MarkdownList | null;
}

export interface MarkdownList {
  type: 'list';
  ordered: boolean;
  // The first item's number for an ordered list, 1 otherwise
  start: number;
  items: MarkdownListItem[];
}

export type MarkdownBlock =
  | { type: 'paragraph'; spans: MarkdownInline[] }
  | { type: 'heading'; level: 1 | 2 | 3; spans: MarkdownInline[] }
  | { type: 'code'; language: string | null; code: string }
  | { type: 'quote'; blocks: MarkdownBlock[] }
  | { type: 'rule' }
  | MarkdownList;


// The block openers, matched against a line already stripped
// of trailing whitespace. A fence's info string may not hold a
// backtick — that is how "```code```" on one line stays inline
const FENCE_OPEN_RE = /^ {0,3}(`{3,})[ \t]*([^`\s]*)[^`]*$/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,})[ \t]*$/;
// One to six hashes with a space after; the level clamps to 3
// below. "#hashtag" has no space and stays prose
const HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?$/;
const RULE_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}$/;
const QUOTE_RE = /^ {0,3}> ?(.*)$/;
const BULLET_RE = /^([ \t]*)([-*+])[ \t]+(.*)$/;
const ORDERED_RE = /^([ \t]*)(\d{1,9})[.)][ \t]+(.*)$/;

// The characters a backslash may escape — ASCII punctuation
const ESCAPABLE_RE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
// Letters, digits and combining marks — a decomposed ž (z +
// caron) must flank _ the way the precomposed one does
const WORD_CHAR_RE = /[\p{L}\p{M}\p{N}]/u;

// How deep quotes and marks may nest before the rest is read
// as characters — a matched construct parses its inside
// recursively, and a wall of "> > > >" or a thousand matched
// stars must parse, not overflow
const NEST_CAP = 8;

// A marker line, read once: how deep it sits, which kind it is,
// and what it carries. A tab counts as two spaces of indent
interface ItemLine {
  indent: number;
  ordered: boolean;
  start: number;
  content: string;
}

// An inline construct found at a position, and where it ends
interface InlineHit {
  span: MarkdownInline;
  end: number;
}

// One line, trailing whitespace gone, CR endings normalised
const toLines = (text: string): string[] =>
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''));

const indentWidth = (ws: string): number => ws.replace(/\t/g, '  ').length;

const runLength = (src: string, at: number, ch: string): number => {
  let n = 0;
  while (src.charAt(at + n) === ch) n += 1;
  return n;
};

// End of string counts as whitespace on both sides
const isSpace = (ch: string): boolean => ch === '' || /\s/.test(ch);
const isWordChar = (ch: string): boolean => WORD_CHAR_RE.test(ch);







// -----------------------------------------------------------
// parseMarkdown
// -----------------------------------------------------------
//
// The whole document into blocks. Pure and total: any string
// parses, an unterminated construct is text, and the output
// for a prefix of the stream never throws or hangs.
//
// Used by:
//   - MarkdownText.tsx — every render
// -----------------------------------------------------------

export function parseMarkdown(text: string): MarkdownBlock[] {
  return parseBlocks(toLines(text), 0);
}







// -----------------------------------------------------------
// splitStreamingTail
// -----------------------------------------------------------
//
// Where the settled text ends and the still-arriving tail
// begins. Whole lines are settled — a closing fence as the
// last line included (the block just closed) — except that an
// OPEN fence pulls the split back to its opener so the whole
// unfinished code block stays plain. On the last line, when no
// newline has closed it yet, the split sits right after the
// line's last finished construct that appended text cannot
// reshape (settledEndOfLine below), so a closed **bold** or
// [link] renders rich mid-stream while the mutable suffix
// stays plain. Both halves come back CR-normalised, and the
// settled half re-parses as a prefix of the final tree.
//
// Used by:
//   - MarkdownText.tsx — while isStreaming
// -----------------------------------------------------------

export function splitStreamingTail(text: string): { settled: string; tail: string } {
  const src = text.replace(/\r\n?/g, '\n');

  let fenceStart = -1;
  let fenceLength = 0;
  let closedOnLastLine = false;
  let offset = 0;
  for (const rawLine of src.split('\n')) {
    const line = rawLine.replace(/[ \t]+$/, '');
    closedOnLastLine = false;
    if (fenceStart === -1) {
      const open = FENCE_OPEN_RE.exec(line);
      if (open) {
        fenceStart = offset;
        fenceLength = open[1].length;
      }
    } else {
      const close = FENCE_CLOSE_RE.exec(line);
      if (close && close[1].length >= fenceLength) {
        fenceStart = -1;
        closedOnLastLine = true;
      }
    }
    offset += rawLine.length + 1;
  }

  if (fenceStart !== -1) return { settled: src.slice(0, fenceStart), tail: src.slice(fenceStart) };
  if (src.endsWith('\n') || closedOnLastLine) return { settled: src, tail: '' };
  const lineStart = src.lastIndexOf('\n') + 1;
  const cut = lineStart + settledEndOfLine(src.slice(lineStart));
  return { settled: src.slice(0, cut), tail: src.slice(cut) };
}







// -----------------------------------------------------------
// settledEndOfLine
// -----------------------------------------------------------
//
// How much of the line still being written is safe to parse:
// the index right after its last finished construct whose
// meaning no appended text can change. One parseInline-shaped
// pass — a closed code span, a complete link, or a full-run
// emphasis pair settles and moves the mark; the first marker
// that is open, or could still open, stops the walk. Three
// guards keep "finished" honest: a marker run touching the
// line's end is whatever the next delta says; a _ or ` whose
// CLOSER touches the end can still be unclosed by one glued-on
// character ("_a_" + "x" is prose, "`a`" + "`" re-opens),
// where a * closer cannot; and a closed emphasis holding an
// open ` or [ inside waits, because that inner construct's own
// closer could land beyond ours and swallow it. Plain text
// after the last construct stays in the tail — it renders
// identically plain either way, and holding it spares deciding
// whether a trailing backslash or half-typed word is done.
// Space-flanked runs, runs over three long and intraword
// underscores can never open, so they settle as the prose they
// are.
//
// Used by:
//   - splitStreamingTail (above)
// -----------------------------------------------------------

function settledEndOfLine(line: string): number {
  let settled = 0;
  let i = 0;
  while (i < line.length) {
    const ch = line.charAt(i);

    if (ch === '\\' && ESCAPABLE_RE.test(line.charAt(i + 1))) {
      i += 2;
      continue;
    }

    if (ch === '`') {
      const code = readCodeSpan(line, i, runLength(line, i, '`'));
      if (!code || code.end === line.length) return settled;
      i = code.end;
      settled = i;
      continue;
    }

    if (ch === '[') {
      // A complete link is fixed — appended text lands after
      // its closing paren. An incomplete one may yet close
      const link = readLinkShape(line, i);
      if (!link) return settled;
      i = link.end;
      settled = i;
      continue;
    }

    if (ch === '*' || ch === '_') {
      const run = runLength(line, i, ch);
      const next = line.charAt(i + run);
      if (next === '') return settled;
      if (run > 3 || isSpace(next) || (ch === '_' && isWordChar(line.charAt(i - 1)))) {
        i += run;
        continue;
      }
      const close = findEmphasisClose(line, i + run, ch, run);
      if (close === -1) return settled;
      if (ch === '_' && close + runLength(line, close, ch) === line.length) return settled;
      if (hasOpenConstruct(line.slice(i + run, close))) return settled;
      i = close + run;
      settled = i;
      continue;
    }

    i += 1;
  }
  return settled;
}

// Does the slice hold a ` or [ that fails to complete inside
// it? Emphasis needs no check — its inside is parsed as a
// bounded slice — but code spans and links match on the whole
// line, so an open one here could reach across the boundary
function hasOpenConstruct(slice: string): boolean {
  let i = 0;
  while (i < slice.length) {
    const ch = slice.charAt(i);
    if (ch === '\\' && ESCAPABLE_RE.test(slice.charAt(i + 1))) {
      i += 2;
      continue;
    }
    if (ch === '`') {
      const code = readCodeSpan(slice, i, runLength(slice, i, '`'));
      if (!code) return true;
      i = code.end;
      continue;
    }
    if (ch === '[') {
      const link = readLinkShape(slice, i);
      if (!link) return true;
      i = link.end;
      continue;
    }
    i += 1;
  }
  return false;
}







// -----------------------------------------------------------
// appendStreamTail
// -----------------------------------------------------------
//
// The plain tail spliced back into the tree when the settled
// half ends mid-line: pushed as a text span onto the last
// inline-bearing leaf — a paragraph's or heading's spans, the
// last item of a list (its nested item when one is open), the
// last leaf inside a quote — so the line being written keeps
// flowing after its settled constructs instead of dropping to
// a line of its own. Mutates the tree in place (the caller
// parses fresh per render). True when a leaf took the tail;
// false on an empty tree or a block that cannot end mid-line,
// and the caller shows the tail on its own then.
//
// Used by:
//   - MarkdownText.tsx — while isStreaming, when the settled
//     half ends mid-line
// -----------------------------------------------------------

export function appendStreamTail(blocks: MarkdownBlock[], tail: string): boolean {
  const last = blocks[blocks.length - 1];
  if (!last) return false;
  if (last.type === 'paragraph' || last.type === 'heading') {
    last.spans.push({ type: 'text', text: tail });
    return true;
  }
  if (last.type === 'list') {
    const item = last.items[last.items.length - 1];
    if (!item) return false;
    const leaf = item.nested ? (item.nested.items[item.nested.items.length - 1] ?? item) : item;
    leaf.spans.push({ type: 'text', text: tail });
    return true;
  }
  if (last.type === 'quote') return appendStreamTail(last.blocks, tail);
  return false;
}







// -----------------------------------------------------------
// parseBlocks
// -----------------------------------------------------------
//
// The line walker. Each iteration reads one block from the
// current line: a fence (closed ⇒ code, open ⇒ the rest of the
// document as one plain paragraph), a heading, a rule, a run of
// quote lines (re-parsed recursively, so a quote may hold a
// list), a list, or a paragraph that runs until a blank line
// or the next block opener. Blank lines separate and are never
// content. `depth` counts the quotes above this walk; past the
// cap a quote line is prose.
//
// Used by:
//   - parseMarkdown (above), the quote branch and parseList
//     (below)
// -----------------------------------------------------------

function parseBlocks(lines: readonly string[], depth: number): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line === '') {
      i += 1;
      continue;
    }

    const fence = FENCE_OPEN_RE.exec(line);
    if (fence) {
      const close = findFenceClose(lines, i + 1, fence[1].length);
      if (close === -1) {
        // Open fence: the opener and everything after it stay
        // literal, line breaks kept, until a closer arrives
        blocks.push({ type: 'paragraph', spans: [{ type: 'text', text: lines.slice(i).join('\n') }] });
        break;
      }
      blocks.push({ type: 'code', language: fence[2] || null, code: lines.slice(i + 1, close).join('\n') });
      i = close + 1;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({ type: 'heading', level, spans: parseInline(heading[2] ?? '', depth) });
      i += 1;
      continue;
    }

    if (RULE_RE.test(line)) {
      blocks.push({ type: 'rule' });
      i += 1;
      continue;
    }

    if (depth < NEST_CAP && QUOTE_RE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length) {
        const quoted = QUOTE_RE.exec(lines[i] ?? '');
        if (!quoted) break;
        inner.push(quoted[1]);
        i += 1;
      }
      blocks.push({ type: 'quote', blocks: parseBlocks(inner, depth + 1) });
      continue;
    }

    const head = readItem(line);
    if (head) {
      const { list, next } = parseList(lines, i, head, depth);
      blocks.push(list);
      i = next;
      continue;
    }

    // A paragraph: this line, then every following line until
    // a blank one or a block opener. Leading indent is prose
    // indent, not code — there is no indented-code form here
    const prose: string[] = [line.trim()];
    i += 1;
    while (i < lines.length) {
      const next = lines[i] ?? '';
      if (next === '' || startsBlock(next)) break;
      prose.push(next.trim());
      i += 1;
    }
    blocks.push({ type: 'paragraph', spans: parseInline(prose.join('\n'), depth) });
  }
  return blocks;
}

// The closer must be at least as long as the opener; -1 when
// the fence never closes
function findFenceClose(lines: readonly string[], from: number, minLength: number): number {
  for (let j = from; j < lines.length; j += 1) {
    const close = FENCE_CLOSE_RE.exec(lines[j] ?? '');
    if (close && close[1].length >= minLength) return j;
  }
  return -1;
}

// Would this line open a block of its own? Ends a paragraph.
// An ordered marker interrupts only from 1 — "2025. rugsėjo
// 1 d." after a sentence is a date, not a list — the way the
// common renderers read it; after a blank line any number may
// open a list (parseBlocks reads the marker itself there)
const startsBlock = (line: string): boolean => {
  if (FENCE_OPEN_RE.test(line) || HEADING_RE.test(line) || RULE_RE.test(line) || QUOTE_RE.test(line)) return true;
  const item = readItem(line);
  return item !== null && (!item.ordered || item.start === 1);
};

function readItem(line: string): ItemLine | null {
  const bullet = BULLET_RE.exec(line);
  if (bullet) return { indent: indentWidth(bullet[1]), ordered: false, start: 1, content: bullet[3] };
  const ordered = ORDERED_RE.exec(line);
  if (ordered) return { indent: indentWidth(ordered[1]), ordered: true, start: Number(ordered[2]), content: ordered[3] };
  return null;
}







// -----------------------------------------------------------
// parseList
// -----------------------------------------------------------
//
// One list from its first marker line. Markers indented two or
// more past the first item's indent nest under the item above
// them — one level, so anything deeper lands in that same
// nested list, and the nested list takes its kind from its own
// first marker. An indented plain line continues the innermost
// item on a line break. Blank lines stay inside the list when
// the next non-blank line is a top-level marker of the same
// kind (a loose list — models blank-separate items and number
// each one "1."); otherwise a blank line, a rule, a marker of
// the other kind at the top level or an unindented plain line
// ends the list. Item text is gathered raw and parsed for
// inline marks once the item is complete. `head` is the first
// marker line, already read by the caller that chose this
// branch.
//
// Used by:
//   - parseBlocks (above)
// -----------------------------------------------------------

interface ItemDraft {
  text: string;
  nested: { ordered: boolean; start: number; texts: string[] } | null;
}

function parseList(
  lines: readonly string[],
  from: number,
  head: ItemLine,
  depth: number,
): { list: MarkdownList; next: number } {
  const base = head.indent;
  const drafts: ItemDraft[] = [];

  let i = from;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line === '') {
      // A loose list: the blank run stays inside when another
      // top-level marker of this kind follows — two lists
      // would restart the renderer's count
      let j = i + 1;
      while (j < lines.length && (lines[j] ?? '') === '') j += 1;
      const after = j < lines.length ? readItem(lines[j] ?? '') : null;
      if (!after || after.ordered !== head.ordered || after.indent >= base + 2) break;
      i = j;
      continue;
    }
    if (RULE_RE.test(line)) break;

    const item = readItem(line);
    const last = drafts[drafts.length - 1];
    if (item) {
      if (last && item.indent >= base + 2) {
        if (!last.nested) last.nested = { ordered: item.ordered, start: item.start, texts: [] };
        last.nested.texts.push(item.content);
      } else if (item.ordered === head.ordered) {
        drafts.push({ text: item.content, nested: null });
      } else {
        // The other kind of marker starts a list of its own
        break;
      }
      i += 1;
      continue;
    }

    if (!last || !/^[ \t]/.test(line) || startsBlock(line)) break;
    // Continuation prose joins the innermost open item
    if (last.nested && last.nested.texts.length > 0) {
      last.nested.texts[last.nested.texts.length - 1] += `\n${line.trim()}`;
    } else {
      last.text += `\n${line.trim()}`;
    }
    i += 1;
  }

  const list: MarkdownList = {
    type: 'list',
    ordered: head.ordered,
    start: head.start,
    items: drafts.map((draft) => ({
      spans: parseInline(draft.text, depth),
      nested: draft.nested
        ? {
            type: 'list',
            ordered: draft.nested.ordered,
            start: draft.nested.start,
            items: draft.nested.texts.map((text) => ({ spans: parseInline(text, depth), nested: null })),
          }
        : null,
    })),
  };
  return { list, next: i };
}







// -----------------------------------------------------------
// parseInline
// -----------------------------------------------------------
//
// A paragraph's text into spans. One pass left to right: a
// backslash escapes punctuation; a backtick run opens a code
// span if a run of the SAME length closes it (else the run is
// text); a bracket opens a link if the whole [label](url
// "title") shape follows; * and _ open emphasis if a matching
// run closes it. Anything that fails to close is emitted as
// its own characters — that is the streaming tolerance — and
// adjacent characters merge into one text span. `depth` counts
// the constructs this text sits inside; past the cap it is one
// text span, escapes included.
//
// Used by:
//   - parseBlocks / parseList (above) — headings, paragraphs,
//     items; readLink / readEmphasis (below) — their insides
// -----------------------------------------------------------

function parseInline(src: string, depth: number): MarkdownInline[] {
  if (depth > NEST_CAP) return src === '' ? [] : [{ type: 'text', text: src }];
  const spans: MarkdownInline[] = [];
  let text = '';
  const flush = () => {
    if (text === '') return;
    spans.push({ type: 'text', text });
    text = '';
  };

  let i = 0;
  while (i < src.length) {
    const ch = src.charAt(i);

    if (ch === '\\' && ESCAPABLE_RE.test(src.charAt(i + 1))) {
      text += src.charAt(i + 1);
      i += 2;
      continue;
    }

    if (ch === '`') {
      const run = runLength(src, i, '`');
      const code = readCodeSpan(src, i, run);
      if (code) {
        flush();
        spans.push(code.span);
        i = code.end;
      } else {
        // The whole run is text — the next backtick starts fresh
        text += src.slice(i, i + run);
        i += run;
      }
      continue;
    }

    const hit = ch === '[' ? readLink(src, i, depth) : ch === '*' || ch === '_' ? readEmphasis(src, i, depth) : null;
    if (hit) {
      flush();
      spans.push(hit.span);
      i = hit.end;
      continue;
    }

    text += ch;
    i += 1;
  }
  flush();
  return spans;
}

// A code span closes on a backtick run of exactly the opening
// length; one space is shaved off each end when both carry one
// (the way "`` `x` ``" is written), never from an all-space span
function readCodeSpan(src: string, at: number, run: number): InlineHit | null {
  let j = at + run;
  while (j < src.length) {
    if (src.charAt(j) !== '`') {
      j += 1;
      continue;
    }
    const length = runLength(src, j, '`');
    if (length === run) {
      let inner = src.slice(at + run, j).replace(/\n/g, ' ');
      if (inner.length >= 2 && inner.startsWith(' ') && inner.endsWith(' ') && inner.trim() !== '') {
        inner = inner.slice(1, -1);
      }
      return { span: { type: 'code', text: inner }, end: j + length };
    }
    j += length;
  }
  return null;
}







// -----------------------------------------------------------
// readEmphasis
// -----------------------------------------------------------
//
// * or _ at a position: the run (capped at three; a longer run
// is text) may open when the next character is not whitespace
// — and for _ the previous one is not a word character, so
// snake_case stays whole — and the construct exists when a run
// at least as long closes it. Three marks nest bold around
// italic; when no closer of that length exists the shorter
// constructs are tried at the same position, and a run that
// closes nothing at all is text. The inside is parsed again, so
// bold may hold italic, code and links.
//
// Used by:
//   - parseInline (above)
// -----------------------------------------------------------

function readEmphasis(src: string, at: number, depth: number): InlineHit | null {
  const marker = src.charAt(at);
  const run = runLength(src, at, marker);
  if (run > 3 || !canOpen(src, at, run, marker)) return null;

  for (let count = run; count >= 1; count -= 1) {
    const close = findEmphasisClose(src, at + count, marker, count);
    if (close === -1) continue;
    const inner = parseInline(src.slice(at + count, close), depth + 1);
    const span: MarkdownInline =
      count === 3
        ? { type: 'bold', spans: [{ type: 'italic', spans: inner }] }
        : count === 2
          ? { type: 'bold', spans: inner }
          : { type: 'italic', spans: inner };
    return { span, end: close + count };
  }
  return null;
}

function canOpen(src: string, at: number, run: number, marker: string): boolean {
  if (isSpace(src.charAt(at + run))) return false;
  return marker === '*' || !isWordChar(src.charAt(at - 1));
}

function canClose(src: string, at: number, run: number, marker: string): boolean {
  if (isSpace(src.charAt(at - 1))) return false;
  return marker === '*' || !isWordChar(src.charAt(at + run));
}

// The first run of `marker` that closes OUR construct: at least
// `count` long, able to close, with something before it. One
// linear pass — escapes, code spans and complete links are
// stepped over (a _ or * inside a URL closes nothing), and
// inner openers of the same marker go on a stack that a closer
// pays off first (nearest open one first), so in "*a *b* c*"
// the star after b closes b and the last star closes ours. A
// run over three long never opens — readEmphasis reads it as
// text — but it still pays and closes
function findEmphasisClose(src: string, from: number, marker: string, count: number): number {
  const pending: number[] = [];
  let j = from;
  while (j < src.length) {
    const ch = src.charAt(j);
    if (ch === '\\') {
      j += 2;
      continue;
    }
    if (ch === '`') {
      const run = runLength(src, j, '`');
      const code = readCodeSpan(src, j, run);
      j = code ? code.end : j + run;
      continue;
    }
    if (ch === '[') {
      const link = readLinkShape(src, j);
      j = link ? link.end : j + 1;
      continue;
    }
    if (ch !== marker) {
      j += 1;
      continue;
    }

    const run = runLength(src, j, marker);
    const closes = j > from && canClose(src, j, run, marker);
    const opens = run <= 3 && canOpen(src, j, run, marker);
    let left = run;
    if (closes) {
      while (left > 0 && pending.length > 0) {
        const top = pending[pending.length - 1];
        const used = Math.min(left, top);
        left -= used;
        if (used === top) pending.pop();
        else pending[pending.length - 1] = top - used;
      }
      if (pending.length === 0 && left >= count) return j + (run - left);
    }
    // What no inner opener claimed may open a new inner one
    if (opens && left > 0) pending.push(left);
    j += run;
  }
  return -1;
}







// -----------------------------------------------------------
// readLink
// -----------------------------------------------------------
//
// [label](destination "title") at a bracket. The label may
// nest brackets and holds inline marks of its own; the
// destination runs to whitespace or the closing paren (balanced
// parens inside it are allowed, and <angle> destinations may
// hold spaces); the title is optional in double or single
// quotes. A destination is required — "[x]()" is prose. Any
// shape short of the closing paren is prose, bracket included.
// readLinkShape reads the structure alone, label unparsed, so
// the emphasis closer scan and the streaming scan can step
// over a link without recursing into it.
//
// Used by:
//   - parseInline (above); findEmphasisClose, settledEndOfLine
//     and hasOpenConstruct (above) — the shape alone
// -----------------------------------------------------------

// Where the label, destination, title and closing paren sit
interface LinkShape {
  labelEnd: number;
  url: string;
  title: string | null;
  end: number;
}

function readLink(src: string, at: number, depth: number): InlineHit | null {
  const shape = readLinkShape(src, at);
  if (!shape) return null;
  return {
    span: { type: 'link', url: shape.url, title: shape.title, spans: parseInline(src.slice(at + 1, shape.labelEnd), depth + 1) },
    end: shape.end,
  };
}

function readLinkShape(src: string, at: number): LinkShape | null {
  const labelEnd = findBracketClose(src, at);
  if (labelEnd === -1 || src.charAt(labelEnd + 1) !== '(') return null;

  let j = labelEnd + 2;
  while (src.charAt(j) === ' ') j += 1;

  let url = '';
  if (src.charAt(j) === '<') {
    const end = src.indexOf('>', j + 1);
    if (end === -1) return null;
    url = src.slice(j + 1, end);
    j = end + 1;
  } else {
    const start = j;
    let parens = 0;
    while (j < src.length) {
      const ch = src.charAt(j);
      if (/\s/.test(ch)) break;
      if (ch === '(') parens += 1;
      if (ch === ')') {
        if (parens === 0) break;
        parens -= 1;
      }
      j += 1;
    }
    url = src.slice(start, j);
  }
  if (url === '') return null;
  while (src.charAt(j) === ' ') j += 1;

  let title: string | null = null;
  const quote = src.charAt(j);
  if (quote === '"' || quote === "'") {
    const end = src.indexOf(quote, j + 1);
    if (end === -1) return null;
    title = src.slice(j + 1, end);
    j = end + 1;
    while (src.charAt(j) === ' ') j += 1;
  }

  if (src.charAt(j) !== ')') return null;
  return { labelEnd, url, title, end: j + 1 };
}

// The bracket that closes the one at `at`, nesting counted,
// escapes stepped over; -1 when the label never closes
function findBracketClose(src: string, at: number): number {
  let depth = 0;
  for (let j = at; j < src.length; j += 1) {
    const ch = src.charAt(j);
    if (ch === '\\') {
      j += 1;
      continue;
    }
    if (ch === '[') depth += 1;
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) return j;
    }
  }
  return -1;
}
