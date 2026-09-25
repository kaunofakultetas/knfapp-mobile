// -----------------------------------------------------------
//  [*] assistantuikit — markdown
//
//  The pure parser under MarkdownText: the model's reply in as
//  a string, a tree of blocks out, nothing rendered here. The
//  dialect is the small one a chat answer actually uses —
//  paragraphs with bold / italic / inline code / links,
//  headings 1-3, fenced code, ordered and unordered lists
//  nested one level, blockquotes, horizontal rules, and pipe
//  tables (header + :---: delimiter + rows, GFM-style, after
//  a blank line; a line being written that carries a pipe
//  stays wholly in the streaming tail) — plus the
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
//      a URL never closes the construct around it;
//    - a bare http(s) URL (also "<…>"-wrapped) and a bare
//      e-mail address are links on their own — atomic, so a
//      _ inside one never opens emphasis, and the sentence's
//      closing punctuation stays outside — except inside a
//      link's own label (no link in a link) and inside code;
//    - a nested list that switches marker kind under one item
//      ("  1. …" then "  - …") becomes a SECOND nested list
//      (`next`), never bullets numbered as steps (KNF-161).
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
//  Streaming cost is kept LINEAR in the answer (KNF-088): a
//  growing answer re-parses only what follows its last SAFE
//  block boundary (createStreamingParser — the blocks before
//  it are cached, and a boundary is only a blank line no
//  construct can reach across), and an emphasis opener gives
//  up at once when no run after it could ever close — a
//  paragraph of "*.pdf, *.docx" globs used to cost a scan to
//  the paragraph's end per star.
//
//  Used by:
//    - MarkdownText.tsx — parseMarkdown, createStreamingParser,
//      splitStreamingTail, appendStreamTail
// -----------------------------------------------------------







// -----------------------------------------------------------
// MarkdownInline
// -----------------------------------------------------------
//
// One span of a line's text — plain text, an inline code run,
// or bold / italic / link carrying spans of their own.
//
// Used by:
//   - MarkdownListItem, MarkdownBlock, parseInline (below)
//   - MarkdownText.tsx — the Inline renderer
// -----------------------------------------------------------

export type MarkdownInline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'bold'; spans: MarkdownInline[] }
  | { type: 'italic'; spans: MarkdownInline[] }
  | { type: 'link'; url: string; title: string | null; spans: MarkdownInline[] };







// -----------------------------------------------------------
// MarkdownListItem
// -----------------------------------------------------------
//
// One item of a list: its spans, and the nested list under it
// when one opened.
//
// Used by:
//   - MarkdownList (below) — the items array
//   - nothing imports it directly at the moment — consumers
//     reach it through MarkdownList
// -----------------------------------------------------------

export interface MarkdownListItem {
  spans: MarkdownInline[];
  // One level only — an even deeper indent joins this same list
  nested: MarkdownList | null;
}







// -----------------------------------------------------------
// MarkdownList
// -----------------------------------------------------------
//
// A whole list block — its kind, its start number and its
// items; a nested one may chain the list of the other kind
// that follows it under the same item.
//
// Used by:
//   - MarkdownBlock (below) — the list variant
//   - MarkdownText.tsx — the ListBlock renderer
// -----------------------------------------------------------

export interface MarkdownList {
  type: 'list';
  ordered: boolean;
  // The first item's number for an ordered list, 1 otherwise
  start: number;
  items: MarkdownListItem[];
  // A NESTED list only: the list that follows it under the
  // same parent item after the marker kind switched ("  1."
  // then "  - ") — absent everywhere else
  next?: MarkdownList;
}







// -----------------------------------------------------------
// MarkdownBlock
// -----------------------------------------------------------
//
// One block of the parsed tree — the union parseMarkdown
// returns.
//
// Used by:
//   - parseBlocks / appendStreamTail (below)
//   - MarkdownText.tsx — the Block renderer
//   - hosts, through the root export (with parseMarkdown)
// -----------------------------------------------------------

export type MarkdownBlock =
  | { type: 'paragraph'; spans: MarkdownInline[] }
  | { type: 'heading'; level: 1 | 2 | 3; spans: MarkdownInline[] }
  | { type: 'code'; language: string | null; code: string }
  | { type: 'quote'; blocks: MarkdownBlock[] }
  | { type: 'rule' }
  | { type: 'table'; align: MarkdownTableAlign[]; header: MarkdownInline[][]; rows: MarkdownInline[][][] }
  | MarkdownList;







// -----------------------------------------------------------
// MarkdownTableAlign
// -----------------------------------------------------------
//
// One column's alignment, read from the delimiter row's
// colons; null renders as the platform default (left).
//
// Used by:
//   - MarkdownBlock (above) — the table block's align list
//   - readTableAlign (below) and MarkdownText's TableBlock
// -----------------------------------------------------------

export type MarkdownTableAlign = 'left' | 'center' | 'right' | null;


// The block openers, matched against a line already stripped
// of trailing whitespace. A fence's info string may not hold a
// backtick — that is how "```code```" on one line stays inline
const FENCE_OPEN_RE = /^ {0,3}(`{3,})[ \t]*([^`\s]*)[^`]*$/;
// A closing fence carries NOTHING after its backticks
const FENCE_CLOSE_RE = /^ {0,3}(`{3,})[ \t]*$/;
// One to six hashes with a space after; the level clamps to 3
// below. "#hashtag" has no space and stays prose
const HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?$/;
// Three or more of one of - * _, spaces allowed between
const RULE_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}$/;
// '>' with an optional single space eaten — '>text' quotes too
const QUOTE_RE = /^ {0,3}> ?(.*)$/;
// A table's delimiter row: cells of dashes with optional
// alignment colons. The pipe requirement lives in the table
// branch (both the header and this row must carry one), which
// is also what keeps "---" a rule, never a one-column table
const TABLE_DELIM_RE = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

// List markers keep their leading whitespace — nesting depth
// is read from it by indentWidth below
const BULLET_RE = /^([ \t]*)([-*+])[ \t]+(.*)$/;
// Up to nine digits, '.' or ')' — the start number is kept
const ORDERED_RE = /^([ \t]*)(\d{1,9})[.)][ \t]+(.*)$/;

// The characters a backslash may escape — ASCII punctuation
const ESCAPABLE_RE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
// Letters, digits and combining marks — a decomposed ž (z +
// caron) must flank _ the way the precomposed one does
const WORD_CHAR_RE = /[\p{L}\p{M}\p{N}]/u;

// A bare web address at a position: the scheme, then
// everything up to whitespace or a character no URL carries
// bare (quotes, angle brackets, a backtick)
const BARE_URL_RE = /^https?:\/\/[^\s<>"'„“”`]+/i;

// A bare e-mail address anywhere in a text run
const BARE_EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;

// Sentence punctuation that trails a bare address without
// belonging to it
const TRAILING_PUNCT_RE = /[.,;:!?'"»“”‘’)\]}]$/;

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







// -----------------------------------------------------------
// toLines
// -----------------------------------------------------------
//
// The document into lines: trailing whitespace gone per line,
// CR endings normalised to LF.
//
// Used by:
//   - parseMarkdown (below)
// -----------------------------------------------------------

const toLines = (text: string): string[] =>
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''));







// -----------------------------------------------------------
// indentWidth
// -----------------------------------------------------------
//
// A tab counts as two spaces of indent, matching ItemLine.
//
// Used by:
//   - readItem (below)
// -----------------------------------------------------------

const indentWidth = (ws: string): number => ws.replace(/\t/g, '  ').length;







// -----------------------------------------------------------
// runLength
// -----------------------------------------------------------
//
// How many of `ch` sit at `at` — delimiter runs (*, _, `).
//
// Used by:
//   - settledEndOfLine, hasOpenConstruct, parseInline,
//     readCodeSpan, readEmphasis, findEmphasisClose (below)
// -----------------------------------------------------------

const runLength = (src: string, at: number, ch: string): number => {
  let n = 0;
  while (src.charAt(at + n) === ch) n += 1;
  return n;
};







// -----------------------------------------------------------
// isSpace
// -----------------------------------------------------------
//
// End of string counts as whitespace on both sides.
//
// Used by:
//   - settledEndOfLine, canOpen, canClose (below)
// -----------------------------------------------------------

const isSpace = (ch: string): boolean => ch === '' || /\s/.test(ch);







// -----------------------------------------------------------
// isWordChar
// -----------------------------------------------------------
//
// Word characters per WORD_CHAR_RE — what _ may not flank.
//
// Used by:
//   - settledEndOfLine, canOpen, canClose (below)
// -----------------------------------------------------------

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
// createStreamingParser
// -----------------------------------------------------------
//
//   const parse = createStreamingParser();
//   parse('# A\n\nB')        → the same tree parseMarkdown gives
//   parse('# A\n\nB and C')  → '# A' reused, only 'B and C'
//                              parsed again
//
// A parser for ONE growing text (a streaming answer). It
// remembers the blocks before the text's last SAFE boundary
// (safeBoundaryAfter) and, while the next text still starts
// with that prefix, re-parses only what follows it — the
// answer stops re-walking its own history on every delta. A
// text that is not an extension (an edit, a different answer)
// drops the cache and parses whole. The result always equals
// parseMarkdown's; its LAST block is always freshly parsed
// (the part after a boundary is never empty), so
// appendStreamTail may mutate it without touching the cache.
//
// Used by:
//   - MarkdownText.tsx — one per streaming text part
// -----------------------------------------------------------

export function createStreamingParser(): (text: string) => MarkdownBlock[] {
  let cachedSource = '';
  let cachedBlocks: MarkdownBlock[] = [];

  return (text: string) => {
    const src = text.replace(/\r\n?/g, '\n');
    if (cachedSource === '' || !src.startsWith(cachedSource)) {
      cachedSource = '';
      cachedBlocks = [];
    }

    // Everything between the cached prefix and the newest
    // boundary joins the cache; the rest parses fresh
    const boundary = safeBoundaryAfter(src, cachedSource.length);
    if (boundary > cachedSource.length) {
      cachedBlocks = [...cachedBlocks, ...parseBlocks(toLines(src.slice(cachedSource.length, boundary)), 0)];
      cachedSource = src.slice(0, boundary);
    }
    return [...cachedBlocks, ...parseBlocks(toLines(src.slice(cachedSource.length)), 0)];
  };
}







// -----------------------------------------------------------
// safeBoundaryAfter
// -----------------------------------------------------------
//
//   safeBoundaryAfter('A\n\nB', 0)     → 3   (B's line start)
//   safeBoundaryAfter('- a\n\n- b', 0) → 0   (a loose list goes on)
//
// The offset of the LAST line start, at or after `from`,
// where parsing may begin afresh without changing the tree:
// the line before it is blank, the line itself is not blank,
// no fence is open across it, and it is no list marker (a
// blank line between same-kind markers keeps ONE list, so a
// marker line may belong to the list above it). Every block
// ends at a blank line except an open fence and a loose list,
// which is why exactly these two are excluded — and a
// boundary, once found, stays one as the text grows, because
// nothing before it or at its line's start can change. `from`
// must itself be 0 or such a boundary (fences closed there);
// answers `from` when there is none after it.
//
// Used by:
//   - createStreamingParser (above)
// -----------------------------------------------------------

function safeBoundaryAfter(src: string, from: number): number {
  let boundary = from;
  let fenceLength = 0;
  let previousBlank = false;
  let offset = from;
  while (offset < src.length) {
    const newline = src.indexOf('\n', offset);
    const end = newline === -1 ? src.length : newline;
    const line = src.slice(offset, end).replace(/[ \t]+$/, '');

    if (fenceLength > 0) {
      // Inside a fence nothing is a boundary — only a closer at
      // least as long as the opener ends it
      const close = FENCE_CLOSE_RE.exec(line);
      if (close && close[1].length >= fenceLength) fenceLength = 0;
    } else {
      if (line !== '' && previousBlank && readItem(line) === null) boundary = offset;
      const open = FENCE_OPEN_RE.exec(line);
      if (open) fenceLength = open[1].length;
    }
    previousBlank = line === '';
    if (newline === -1) break;
    offset = newline + 1;
  }
  return boundary;
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
  // A line-in-progress that carries a pipe may be a table row
  // whose cells the next delta reshapes — the whole line stays
  // in the tail until its newline settles it
  const lastLine = src.slice(lineStart);
  if (hasTablePipe(lastLine)) {
    return { settled: src.slice(0, lineStart), tail: lastLine };
  }

  const cut = lineStart + settledEndOfLine(lastLine);
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







// -----------------------------------------------------------
// hasOpenConstruct
// -----------------------------------------------------------
//
// Does the slice hold a ` or [ that fails to complete inside
// it? Emphasis needs no check — its inside is parsed as a
// bounded slice — but code spans and links match on the whole
// line, so an open one here could reach across the boundary.
//
// Used by:
//   - settledEndOfLine (above) — the inner-construct guard
// -----------------------------------------------------------

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
// last item of a list (its nested item when one is open — the
// LAST of a `next` chain), the last leaf inside a quote — so
// the line being written keeps flowing after its settled
// constructs instead of dropping to a line of its own.
// Mutates the tree in place: the caller hands it a tree whose
// LAST block is freshly parsed (the streaming parser caches
// only blocks before a boundary, never the last one). True
// when a leaf took the tail; false on an empty tree or a
// block that cannot end mid-line, and the caller shows the
// tail on its own then.
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
    let nested = item.nested;
    while (nested?.next) nested = nested.next;
    const leaf = nested ? (nested.items[nested.items.length - 1] ?? item) : item;
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

    // A pipe table: this line as the header when the NEXT line
    // is a matching delimiter row — both must carry a real
    // pipe, and the delimiter must agree on the column count,
    // or the lines stay the prose they were
    if (hasTablePipe(line) && TABLE_DELIM_RE.test(lines[i + 1] ?? '') && hasTablePipe(lines[i + 1] ?? '')) {
      const headerCells = splitTableRow(line);
      const align = readTableAlign(lines[i + 1] ?? '');
      if (headerCells.length === align.length) {
        const rows: MarkdownInline[][][] = [];
        let j = i + 2;
        while (j < lines.length && hasTablePipe(lines[j] ?? '')) {
          const cells = splitTableRow(lines[j] ?? '');
          // Ragged rows normalise to the header's width — GFM
          // pads the short and drops the overflow
          while (cells.length < headerCells.length) cells.push('');
          rows.push(cells.slice(0, headerCells.length).map((cell) => parseInline(cell, depth)));
          j += 1;
        }
        blocks.push({
          type: 'table',
          align,
          header: headerCells.map((cell) => parseInline(cell, depth)),
          rows,
        });
        i = j;
        continue;
      }
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







// -----------------------------------------------------------
// findFenceClose
// -----------------------------------------------------------
//
// The closer must be at least as long as the opener; -1 when
// the fence never closes.
//
// Used by:
//   - parseBlocks (above) — the fence branch
// -----------------------------------------------------------

function findFenceClose(lines: readonly string[], from: number, minLength: number): number {
  for (let j = from; j < lines.length; j += 1) {
    const close = FENCE_CLOSE_RE.exec(lines[j] ?? '');
    if (close && close[1].length >= minLength) return j;
  }
  return -1;
}







// -----------------------------------------------------------
// startsBlock
// -----------------------------------------------------------
//
// Would this line open a block of its own? Ends a paragraph.
// An ordered marker interrupts only from 1 — "2025. rugsėjo
// 1 d." after a sentence is a date, not a list — the way the
// common renderers read it; after a blank line any number may
// open a list (parseBlocks reads the marker itself there).
//
// Used by:
//   - parseBlocks (above) — ends a paragraph
//   - parseList (below) — ends a continuation line
// -----------------------------------------------------------

const startsBlock = (line: string): boolean => {
  if (FENCE_OPEN_RE.test(line) || HEADING_RE.test(line) || RULE_RE.test(line) || QUOTE_RE.test(line)) return true;
  const item = readItem(line);
  return item !== null && (!item.ordered || item.start === 1);
};







// -----------------------------------------------------------
// hasTablePipe
// -----------------------------------------------------------
//
// Whether a line carries a REAL pipe — `\|` is an escaped
// character inside a cell, so the walk skips escaped pairs.
// This is both the "is this a table row at all" question and
// the streaming guard's "could this line still become one".
//
// Used by:
//   - parseBlocks (below) — the table branch
//   - splitStreamingTail (above) — the whole-line tail guard
// -----------------------------------------------------------

function hasTablePipe(line: string): boolean {
  for (let i = 0; i < line.length; i += 1) {
    const ch = line.charAt(i);
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '|') return true;
  }
  return false;
}







// -----------------------------------------------------------
// splitTableRow
// -----------------------------------------------------------
//
// One row line into trimmed cell texts: unescaped pipes cut,
// escaped pairs are copied through for parseInline to
// unescape, and only UNESCAPED outer pipes drop as
// decoration.
//
// Used by:
//   - parseBlocks (below) — header and body rows
//   - readTableAlign (below)
// -----------------------------------------------------------

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  // Only an UNESCAPED trailing pipe is decoration
  if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) trimmed = trimmed.slice(0, -1);

  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed.charAt(i);
    if (ch === '\\') {
      current += ch + trimmed.charAt(i + 1);
      i += 1;
      continue;
    }
    if (ch === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}







// -----------------------------------------------------------
// readTableAlign
// -----------------------------------------------------------
//
// The delimiter row's colons as one alignment per column —
// :--- left, ---: right, :---: center, bare dashes null.
//
// Used by:
//   - parseBlocks (below) — the table branch
// -----------------------------------------------------------

function readTableAlign(line: string): MarkdownTableAlign[] {
  return splitTableRow(line).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}







// -----------------------------------------------------------
// readItem
// -----------------------------------------------------------
//
// A marker line into an ItemLine — null when the line opens
// no item.
//
// Used by:
//   - parseBlocks, startsBlock (above), parseList (below)
// -----------------------------------------------------------

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
// them — one level, so anything deeper lands in the same
// nested level. The nested level keeps each marker's KIND: a
// run of one kind is one nested list, and a marker of the
// other kind closes it and opens the next (chained as `next`)
// — the top level's own rule, one level down, so a bullet is
// never numbered as a step. An indented plain line continues
// the innermost item on a line break. Blank lines stay inside the list when
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

// One run of same-kind markers at the nested level
interface NestedRun {
  ordered: boolean;
  start: number;
  texts: string[];
}

interface ItemDraft {
  text: string;
  // The nested level's runs, in order — empty when none opened
  nested: NestedRun[];
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
        // A marker of the other kind opens a run of its own
        const run = last.nested[last.nested.length - 1];
        if (run && run.ordered === item.ordered) run.texts.push(item.content);
        else last.nested.push({ ordered: item.ordered, start: item.start, texts: [item.content] });
      } else if (item.ordered === head.ordered) {
        drafts.push({ text: item.content, nested: [] });
      } else {
        // The other kind of marker starts a list of its own
        break;
      }
      i += 1;
      continue;
    }

    if (!last || !/^[ \t]/.test(line) || startsBlock(line)) break;
    // Continuation prose joins the innermost open item
    const run = last.nested[last.nested.length - 1];
    if (run && run.texts.length > 0) {
      run.texts[run.texts.length - 1] += `\n${line.trim()}`;
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
      nested: nestedChain(draft.nested, depth),
    })),
  };
  return { list, next: i };
}







// -----------------------------------------------------------
// nestedChain
// -----------------------------------------------------------
//
// An item's nested runs as the list the renderer walks: the
// first run is `nested`, each later run hangs off the one
// before as `next`. null when no nested marker ever opened.
//
// Used by:
//   - parseList (above)
// -----------------------------------------------------------

function nestedChain(runs: readonly NestedRun[], depth: number): MarkdownList | null {
  let chain: MarkdownList | null = null;
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index];
    const list: MarkdownList = {
      type: 'list',
      ordered: run.ordered,
      start: run.start,
      items: run.texts.map((text) => ({ spans: parseInline(text, depth), nested: null })),
    };
    if (chain) list.next = chain;
    chain = list;
  }
  return chain;
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
// text span, escapes included. The last position where a *
// and a _ run COULD close is found once per call
// (lastCloserIndex), so every opener after it fails at once
// instead of scanning to the end of the paragraph. With
// `autolink` (everywhere but a link's own label) a bare URL
// is read whole the moment it starts (readBareUrl) and the
// text runs split out their e-mail addresses (autolinkEmails).
//
// Used by:
//   - parseBlocks / parseList (above) — headings, paragraphs,
//     items; readLink / readEmphasis (below) — their insides
// -----------------------------------------------------------

function parseInline(src: string, depth: number, autolink = true): MarkdownInline[] {
  if (depth > NEST_CAP) return src === '' ? [] : [{ type: 'text', text: src }];
  const spans: MarkdownInline[] = [];
  let text = '';
  const flush = () => {
    if (text === '') return;
    if (autolink) spans.push(...autolinkEmails(text));
    else spans.push({ type: 'text', text });
    text = '';
  };

  // The last run of each marker that could close anything —
  // computed on first need, -1 when there is none
  const closers: Record<string, number | undefined> = {};
  const lastCloser = (marker: string) => (closers[marker] ??= lastCloserIndex(src, marker));

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

    const hit =
      ch === '[' ? readLink(src, i, depth)
      : ch === '*' || ch === '_' ? readEmphasis(src, i, depth, lastCloser(ch), autolink)
      : autolink && (ch === 'h' || ch === 'H' || ch === '<') ? readBareUrl(src, i)
      : null;
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







// -----------------------------------------------------------
// readBareUrl
// -----------------------------------------------------------
//
//   'žr. https://knf.vu.lt/studentams.' → link to
//       https://knf.vu.lt/studentams, the period left outside
//   '<https://vu.lt>'                   → link, brackets gone
//
// A bare web address as a link span, read whole: it must
// start a word (not "xhttps://"), it ends at whitespace or a
// character no bare URL carries, and trailing sentence
// punctuation is handed back to the text — a closing paren
// only when the URL holds no matching opener (Wikipedia's
// "…_(miestas)" keeps its own). Wrapped in <…>, both brackets
// are consumed. A scheme with nothing behind it is text.
//
// Used by:
//   - parseInline (above)
// -----------------------------------------------------------

function readBareUrl(src: string, at: number): InlineHit | null {
  const bracketed = src.charAt(at) === '<';
  const start = bracketed ? at + 1 : at;
  if (!bracketed && isWordChar(src.charAt(at - 1))) return null;
  const match = BARE_URL_RE.exec(src.slice(start));
  if (!match) return null;

  let url = match[0];
  while (TRAILING_PUNCT_RE.test(url)) {
    const last = url.charAt(url.length - 1);
    if (last === ')' && (url.match(/\(/g)?.length ?? 0) >= (url.match(/\)/g)?.length ?? 0)) break;
    url = url.slice(0, -1);
  }
  if (!/^https?:\/\/[^/]/i.test(url)) return null;

  const closesBracket = bracketed && src.charAt(start + url.length) === '>';
  if (bracketed && !closesBracket) return null;
  return {
    span: { type: 'link', url, title: null, spans: [{ type: 'text', text: url }] },
    end: start + url.length + (closesBracket ? 1 : 0),
  };
}







// -----------------------------------------------------------
// autolinkEmails
// -----------------------------------------------------------
//
//   autolinkEmails('rašykite knf@knf.vu.lt.')
//     → [text 'rašykite ', link mailto:knf@knf.vu.lt, text '.']
//
// A plain text run with its bare e-mail addresses turned into
// mailto links — the rest of the run stays one text span per
// stretch. An address ends at its last letter, so a sentence's
// period stays text.
//
// Used by:
//   - parseInline (above) — every flushed text run
// -----------------------------------------------------------

function autolinkEmails(value: string): MarkdownInline[] {
  const spans: MarkdownInline[] = [];
  let last = 0;
  for (const match of value.matchAll(BARE_EMAIL_RE)) {
    const at = match.index ?? 0;
    if (at > last) spans.push({ type: 'text', text: value.slice(last, at) });
    spans.push({ type: 'link', url: `mailto:${match[0]}`, title: null, spans: [{ type: 'text', text: match[0] }] });
    last = at + match[0].length;
  }
  if (last < value.length) spans.push({ type: 'text', text: value.slice(last) });
  return spans;
}







// -----------------------------------------------------------
// readCodeSpan
// -----------------------------------------------------------
//
// A code span closes on a backtick run of exactly the opening
// length; one space is shaved off each end when both carry one
// (the way "`` `x` ``" is written), never from an all-space
// span.
//
// Used by:
//   - settledEndOfLine, hasOpenConstruct, parseInline (above),
//     findEmphasisClose (below)
// -----------------------------------------------------------

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
// bold may hold italic, code and links. `limit` is the last
// position a closer could sit at — an opener at or past it is
// text without a scan.
//
// Used by:
//   - parseInline (above)
// -----------------------------------------------------------

function readEmphasis(src: string, at: number, depth: number, limit: number, autolink: boolean): InlineHit | null {
  const marker = src.charAt(at);
  const run = runLength(src, at, marker);
  if (run > 3 || at >= limit || !canOpen(src, at, run, marker)) return null;

  for (let count = run; count >= 1; count -= 1) {
    const close = findEmphasisClose(src, at + count, marker, count, limit);
    if (close === -1) continue;
    const inner = parseInline(src.slice(at + count, close), depth + 1, autolink);
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







// -----------------------------------------------------------
// canOpen
// -----------------------------------------------------------
//
// A run may open when the next character is not whitespace —
// and for _ when the previous one is not a word character, so
// snake_case stays whole.
//
// Used by:
//   - readEmphasis (above), findEmphasisClose (below)
// -----------------------------------------------------------

function canOpen(src: string, at: number, run: number, marker: string): boolean {
  if (isSpace(src.charAt(at + run))) return false;
  return marker === '*' || !isWordChar(src.charAt(at - 1));
}







// -----------------------------------------------------------
// canClose
// -----------------------------------------------------------
//
// The mirror of canOpen: a run may close when the character
// before it is not whitespace — and for _ when the one after
// the run is not a word character.
//
// Used by:
//   - findEmphasisClose (below)
// -----------------------------------------------------------

function canClose(src: string, at: number, run: number, marker: string): boolean {
  if (isSpace(src.charAt(at - 1))) return false;
  return marker === '*' || !isWordChar(src.charAt(at + run));
}







// -----------------------------------------------------------
// findEmphasisClose
// -----------------------------------------------------------
//
// The first run of `marker` that closes OUR construct: at
// least `count` long, able to close, with something before it.
// One linear pass — escapes, code spans and complete links are
// stepped over (a _ or * inside a URL closes nothing), and
// inner openers of the same marker go on a stack that a closer
// pays off first (nearest open one first), so in "*a *b* c*"
// the star after b closes b and the last star closes ours. A
// run over three long never opens — readEmphasis reads it as
// text — but it still pays and closes. `limit` (default: the
// end) is the last position any closer can sit at: past it the
// answer is -1 without walking further.
//
// Used by:
//   - settledEndOfLine, readEmphasis (above)
// -----------------------------------------------------------

function findEmphasisClose(src: string, from: number, marker: string, count: number, limit: number = src.length): number {
  const pending: number[] = [];
  let j = from;
  while (j < src.length && j <= limit) {
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
// lastCloserIndex
// -----------------------------------------------------------
//
//   lastCloserIndex('a *b* c', '*')     → 4
//   lastCloserIndex('*.pdf *.doc', '*') → -1  (every star
//                                             follows a space)
//
// The last position holding `marker` where a run could close
// (canClose there), or -1. A SUPERSET of the closers
// findEmphasisClose can accept — it checks every marker
// character, escaped and in-code ones too — so an opener at
// or after it provably closes nothing, and a scan stops there.
//
// Used by:
//   - parseInline (above) — once per marker per call
// -----------------------------------------------------------

function lastCloserIndex(src: string, marker: string): number {
  for (let p = src.length - 1; p >= 0; p -= 1) {
    if (src.charAt(p) === marker && canClose(src, p, runLength(src, p, marker), marker)) return p;
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
    // No link inside a link: the label never autolinks
    span: { type: 'link', url: shape.url, title: shape.title, spans: parseInline(src.slice(at + 1, shape.labelEnd), depth + 1, false) },
    end: shape.end,
  };
}







// -----------------------------------------------------------
// readLinkShape
// -----------------------------------------------------------
//
// The [label](destination "title") structure alone, label
// unparsed — so the emphasis closer scan and the streaming
// scan can step over a link without recursing into it.
//
// Used by:
//   - readLink (above) — then parses the label itself
//   - settledEndOfLine, hasOpenConstruct, findEmphasisClose
//     (above) — the shape alone
// -----------------------------------------------------------

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







// -----------------------------------------------------------
// findBracketClose
// -----------------------------------------------------------
//
// The bracket that closes the one at `at`, nesting counted,
// escapes stepped over; -1 when the label never closes.
//
// Used by:
//   - readLinkShape (above)
// -----------------------------------------------------------

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
