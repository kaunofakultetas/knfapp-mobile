// -----------------------------------------------------------
//  [*] assistantuikit — MarkdownText
//
//  The assistant's prose, rendered from parseMarkdown's tree
//  with Text and View alone — no web view, no scroll view, no
//  renderer dependency — so a reply lays out like every other
//  native text on the screen. Paragraphs carry bold, italic,
//  inline code and links (a link is a nested Text; the HOST's
//  onPressLink decides what opening means — the kit never
//  navigates); headings, quotes, rules and lists are Views;
//  fenced code is a monospace box that wraps rather than
//  scrolls. Every colour is a token from AssistantColors and
//  every face comes from the host's AssistantFonts (bold is
//  the host's bold FAMILY, not a synthesized weight); the kit
//  owns no string, and the only glyphs it draws are the list
//  markers.
//
//  isStreaming is the one behaviour switch. The parser is
//  tolerant on its own — an open ** or ``` is text until it
//  closes — but a half-typed line can still read as a FINISHED
//  construct for a frame ("**bold*" is a star and an italic).
//  So while streaming, the settled prefix — whole lines,
//  closed fences, and the open line up to its last finished,
//  stable construct — parses as markdown, so a closed **bold**
//  or [link] renders rich as it arrives, and the mutable
//  suffix stays plain: spliced into the last leaf as text when
//  it continues the line being written, or shown as a plain
//  tail Text when the whole line is still unsettled. While it
//  streams, the settled prefix goes through ONE incremental
//  parser per text part (createStreamingParser): the blocks
//  before the answer's last safe boundary are reused, so a
//  delta re-parses only the block being written, not the whole
//  answer (KNF-088). When the stream ends the whole text parses
//  once more, plainly.
//
//  Split into (root component last):
//
//    body         — the shared prose text style
//    Inline       — spans into nested Text
//    CodeBlock    — the fenced code box
//    ListBlock    — bullets / numbers, one nested level
//    QuoteBlock   — the left-ruled quote
//    Block        — one block by type
//    MarkdownText — the component (default export)
//
//  Used by:
//    - AssistantMessage.tsx — the assistant bubble's Text part
// -----------------------------------------------------------

import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import {
  appendStreamTail,
  createStreamingParser,
  parseMarkdown,
  splitStreamingTail,
  type MarkdownBlock,
  type MarkdownInline,
  type MarkdownList,
} from './core/markdown';
import { monoFamily, typeface } from './core/typography';
import { defaultColors, defaultFonts, type AssistantColors, type AssistantFonts } from './core/types';


// The type scale, in dp — body matches the bubbles around it,
// code steps down so a snippet fits the narrow bubble
const BODY_SIZE = 15;
// Body line height — the same 22 dp every block builds on
const BODY_LINE = 22;
// Code font size, inline and fenced alike
const CODE_SIZE = 13;
// Fenced-code line height, tighter than prose on purpose
const CODE_LINE = 18;
// Space above a block that follows another; headings breathe more
const BLOCK_GAP = 8;
// Headings breathe more than ordinary blocks (BLOCK_GAP)
const HEADING_GAP = 14;
// Space between list items, and above a nested list
const ITEM_GAP = 4;

// One size per heading level — the parser clamps deeper
// headings to level 3, so three rows cover everything
const HEADING_TYPE: Record<1 | 2 | 3, { fontSize: number; lineHeight: number }> = {
  1: { fontSize: 20, lineHeight: 26 },
  2: { fontSize: 17, lineHeight: 23 },
  3: { fontSize: 15, lineHeight: 21 },
};

// Tables with more columns than this scroll horizontally
// instead of squeezing every cell to a one-word sliver
const TABLE_SQUEEZE_MAX_COLUMNS = 3;

// A scrolling table's fixed column width — fixed, not flexed:
// a wrapping Text column with flex inside an intrinsic-width
// row is the iOS Fabric measurement trap
const TABLE_SCROLL_COLUMN_WIDTH = 140;

// What every renderer below needs from the root
interface RenderProps {
  colors: AssistantColors;
  fonts: AssistantFonts;
  onPressLink?: (url: string) => void;
}







// -----------------------------------------------------------
// body
// -----------------------------------------------------------
//
// The body text style, in the given ink and the host's
// regular face — the prose blocks and the streaming tail all
// build on it.
//
// Used by:
//   - ListBlock, TableBlock, Block, MarkdownText (below)
// -----------------------------------------------------------

const body = (colors: AssistantColors, fonts: AssistantFonts) => ({
  fontSize: BODY_SIZE,
  lineHeight: BODY_LINE,
  ...typeface(fonts, 'regular'),
  color: colors.ink,
});







// -----------------------------------------------------------
// Inline
// -----------------------------------------------------------
//
// A span list into the children of a Text: plain text as bare
// strings, marks as nested Texts that recurse for their own
// spans. A link is a nested Text with the link role; it presses
// only when the host gave an onPressLink, and then with the
// destination only — the kit opens nothing itself.
//
// Used by:
//   - Block, ListBlock (below) — paragraphs, headings, items
// -----------------------------------------------------------

function Inline({ spans, colors, fonts, onPressLink }: RenderProps & { spans: MarkdownInline[] }) {
  return (
    <>
      {spans.map((span, index) => {
        if (span.type === 'text') return span.text;
        if (span.type === 'code') {
          return (
            <Text key={index} style={{ fontFamily: monoFamily(fonts), fontSize: CODE_SIZE, backgroundColor: colors.surfaceSoft }}>
              {span.text}
            </Text>
          );
        }
        if (span.type === 'bold') {
          return (
            <Text key={index} style={typeface(fonts, 'bold')}>
              <Inline spans={span.spans} colors={colors} fonts={fonts} onPressLink={onPressLink} />
            </Text>
          );
        }
        if (span.type === 'italic') {
          return (
            <Text key={index} style={{ fontStyle: 'italic' }}>
              <Inline spans={span.spans} colors={colors} fonts={fonts} onPressLink={onPressLink} />
            </Text>
          );
        }
        return (
          <Text
            key={index}
            accessibilityRole="link"
            onPress={onPressLink ? () => onPressLink(span.url) : undefined}
            style={{ color: colors.brandText, textDecorationLine: 'underline' }}
          >
            <Inline spans={span.spans} colors={colors} fonts={fonts} onPressLink={onPressLink} />
          </Text>
        );
      })}
    </>
  );
}







// -----------------------------------------------------------
// CodeBlock
// -----------------------------------------------------------
//
// The fenced code box: recessed fill, hairline border, the
// body verbatim in the monospace family. Long lines wrap — a
// horizontal scroll inside a chat bubble fights the list's own
// gestures, and a wrapped line is still readable code.
//
// Used by:
//   - Block (below)
// -----------------------------------------------------------

function CodeBlock({ code, colors, fonts, gap }: { code: string; colors: AssistantColors; fonts: AssistantFonts; gap: number }) {
  return (
    <View
      testID="assistantuikit-markdown-code"
      style={{
        marginTop: gap,
        backgroundColor: colors.surfaceSoft,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <Text selectable style={{ fontFamily: monoFamily(fonts), fontSize: CODE_SIZE, lineHeight: CODE_LINE, color: colors.ink }}>{code}</Text>
    </View>
  );
}







// -----------------------------------------------------------
// ListBlock
// -----------------------------------------------------------
//
// One row per item: the marker in the soft ink on a fixed
// gutter — a bullet, or the item's number counted up from the
// list's start — and the item's spans beside it. An item's
// nested list renders under its spans through this same
// component, and so does the `next` list a marker-kind switch
// chained after it (the marker glyph always follows its OWN
// list's kind); the parser guarantees nested items carry no
// list of their own, so the recursion is one level deep.
//
// Used by:
//   - Block (below), and itself for the nested level
// -----------------------------------------------------------

function ListBlock({ list, colors, fonts, onPressLink, gap }: RenderProps & { list: MarkdownList; gap: number }) {
  return (
    <View style={{ marginTop: gap }}>
      {list.items.map((item, index) => (
        <View key={index} style={{ flexDirection: 'row', marginTop: index === 0 ? 0 : ITEM_GAP }}>
          <Text style={[body(colors, fonts), { color: colors.inkSoft, minWidth: list.ordered ? 26 : 18 }]}>
            {list.ordered ? `${list.start + index}.` : '•'}
          </Text>
          {/* grow+shrink with basis AUTO, never flex:1 — a
              basis-0 column re-measured after growing makes
              iOS Fabric cache the wrong wrapped-text height
              inside the intrinsic-width bubble (text painted
              over the action bar on device) */}
          <View style={{ flexGrow: 1, flexShrink: 1 }}>
            <Text style={body(colors, fonts)}>
              <Inline spans={item.spans} colors={colors} fonts={fonts} onPressLink={onPressLink} />
            </Text>
            {item.nested ? <ListBlock list={item.nested} colors={colors} fonts={fonts} onPressLink={onPressLink} gap={ITEM_GAP} /> : null}
          </View>
        </View>
      ))}
      {list.next ? <ListBlock list={list.next} colors={colors} fonts={fonts} onPressLink={onPressLink} gap={ITEM_GAP} /> : null}
    </View>
  );
}







// -----------------------------------------------------------
// TableBlock
// -----------------------------------------------------------
//
// The pipe table as a bordered grid: bold header row on the
// soft surface, hairline rules between rows. Up to three
// columns the cells share the bubble's width (flex-equal,
// wrapping) — no scroll. FOUR or more columns squeezed into
// a phone bubble left every cell a one-word-per-line sliver,
// so a wide table rides in a horizontal ScrollView instead,
// each column at a fixed readable width. Column alignment
// comes from the delimiter row's colons.
//
// Used by:
//   - Block (below) — the 'table' branch
// -----------------------------------------------------------

function TableBlock({ table, colors, fonts, onPressLink, gap }: RenderProps & {
  table: Extract<MarkdownBlock, { type: 'table' }>;
  gap: number;
}) {
  const wide = table.header.length > TABLE_SQUEEZE_MAX_COLUMNS;
  const cellStyle = (column: number) => ({
    ...(wide ? { width: TABLE_SCROLL_COLUMN_WIDTH } : { flex: 1 }),
    paddingVertical: 6,
    paddingHorizontal: 8,
    textAlign: table.align[column] ?? ('left' as const),
  });
  const grid = (
    <View
      testID="assistantuikit-markdown-table"
      style={{
        marginTop: wide ? 0 : gap,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceSoft }}>
        {table.header.map((spans, column) => (
          <Text key={column} style={[body(colors, fonts), typeface(fonts, 'bold'), cellStyle(column)]}>
            <Inline spans={spans} colors={colors} fonts={fonts} onPressLink={onPressLink} />
          </Text>
        ))}
      </View>
      {table.rows.map((row, rowIndex) => (
        <View key={rowIndex} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line }}>
          {row.map((spans, column) => (
            <Text key={column} style={[body(colors, fonts), cellStyle(column)]}>
              <Inline spans={spans} colors={colors} fonts={fonts} onPressLink={onPressLink} />
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
  if (!wide) return grid;
  return (
    <ScrollView
      testID="assistantuikit-markdown-table-scroll"
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginTop: gap }}
    >
      {grid}
    </ScrollView>
  );
}







// -----------------------------------------------------------
// QuoteBlock
// -----------------------------------------------------------
//
// The quoted blocks behind a left rule, in the soft ink: the
// palette is swapped for the inner render, not the renderer,
// so a quote holds headings, lists and code like the body does.
//
// Used by:
//   - Block (below)
// -----------------------------------------------------------

function QuoteBlock({ blocks, colors, fonts, onPressLink, gap }: RenderProps & { blocks: MarkdownBlock[]; gap: number }) {
  const muted = { ...colors, ink: colors.inkSoft };
  return (
    <View style={{ marginTop: gap, borderLeftWidth: 3, borderLeftColor: colors.line, paddingLeft: 12 }}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} colors={muted} fonts={fonts} onPressLink={onPressLink} first={index === 0} />
      ))}
    </View>
  );
}







// -----------------------------------------------------------
// Block
// -----------------------------------------------------------
//
// One block by type. The first block of a run sits flush; any
// later one carries its gap above, so the tree stacks without
// a trailing margin at the bottom of a bubble.
//
// Used by:
//   - MarkdownText (below), QuoteBlock (above)
// -----------------------------------------------------------

function Block({ block, colors, fonts, onPressLink, first }: RenderProps & { block: MarkdownBlock; first: boolean }) {
  const gap = first ? 0 : block.type === 'heading' ? HEADING_GAP : BLOCK_GAP;

  if (block.type === 'paragraph') {
    return (
      <Text style={[body(colors, fonts), { marginTop: gap }]}>
        <Inline spans={block.spans} colors={colors} fonts={fonts} onPressLink={onPressLink} />
      </Text>
    );
  }
  if (block.type === 'heading') {
    return (
      <Text accessibilityRole="header" style={[HEADING_TYPE[block.level], typeface(fonts, 'bold'), { color: colors.ink, marginTop: gap }]}>
        <Inline spans={block.spans} colors={colors} fonts={fonts} onPressLink={onPressLink} />
      </Text>
    );
  }
  if (block.type === 'code') return <CodeBlock code={block.code} colors={colors} fonts={fonts} gap={gap} />;
  if (block.type === 'list') return <ListBlock list={block} colors={colors} fonts={fonts} onPressLink={onPressLink} gap={gap} />;
  if (block.type === 'quote') return <QuoteBlock blocks={block.blocks} colors={colors} fonts={fonts} onPressLink={onPressLink} gap={gap} />;
  if (block.type === 'table') return <TableBlock table={block} colors={colors} fonts={fonts} onPressLink={onPressLink} gap={gap} />;
  return <View style={{ marginTop: gap, height: 1, backgroundColor: colors.line }} />;
}







// -----------------------------------------------------------
// MarkdownText (default export)
// -----------------------------------------------------------
//
//   <MarkdownText text={part.text} />                 — final text
//   <MarkdownText text={part.text} isStreaming />     — mutable
//                                                       suffix plain
//   <MarkdownText text={t} onPressLink={open} />      — links press
//   <MarkdownText text={t} fonts={hostFonts} />       — host faces
//
// Used by:
//   - AssistantMessage.tsx — the assistant bubble's Text part
// -----------------------------------------------------------

export default function MarkdownText({
  text,
  colors = defaultColors,
  fonts = defaultFonts,
  onPressLink,
  isStreaming = false,
}: {
  text: string;
  colors?: AssistantColors;
  fonts?: AssistantFonts;
  // The host opens the destination — the kit never navigates
  onPressLink?: (url: string) => void;
  // true while the part is still arriving: the open line's
  // mutable suffix stays plain until it closes
  isStreaming?: boolean;
}) {

  // This part's incremental parser — made once per mounted
  // text part, it keeps the blocks before the last safe
  // boundary between deltas
  const [parseStreaming] = useState(createStreamingParser);


  // Parsed once per text change — a colour swap never re-walks
  // the string, and a streaming delta re-parses only the block
  // being written
  const { blocks, tail, tailGap } = useMemo(() => {
    const split = isStreaming ? splitStreamingTail(text) : { settled: text, tail: '' };
    const parsed = isStreaming ? parseStreaming(split.settled) : parseMarkdown(split.settled);
    // A settled half ending mid-line means the tail continues
    // the line being written — splice it into the last leaf so
    // the visual line keeps flowing after its settled marks
    const midLine = split.tail !== '' && split.settled !== '' && !split.settled.endsWith('\n');
    if (midLine && appendStreamTail(parsed, split.tail)) {
      return { blocks: parsed, tail: '', tailGap: 0 };
    }
    // The tail continues the block above it unless a blank line
    // already closed that block — then it is a block of its own
    const gap = parsed.length > 0 && split.settled.endsWith('\n\n') ? BLOCK_GAP : 0;
    return { blocks: parsed, tail: split.tail, tailGap: gap };
  }, [text, isStreaming, parseStreaming]);


  return (
    <View testID="assistantuikit-markdown">
      {blocks.map((block, index) => (
        <Block key={index} block={block} colors={colors} fonts={fonts} onPressLink={onPressLink} first={index === 0} />
      ))}
      {tail === '' ? null : (
        <Text testID="assistantuikit-markdown-tail" style={[body(colors, fonts), { marginTop: tailGap }]}>
          {tail}
        </Text>
      )}
    </View>
  );
}
