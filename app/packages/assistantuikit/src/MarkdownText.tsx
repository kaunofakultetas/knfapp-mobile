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
//  scrolls. Every colour is a token from AssistantColors; the
//  kit owns no string, and the only glyphs it draws are the
//  list markers.
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
//  tail Text when the whole line is still unsettled. When the
//  stream ends the whole text parses.
//
//  Split into (root component last):
//
//    MONO         — the platform's monospace family
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

import { useMemo } from 'react';
import { Platform, Text, View } from 'react-native';

import { appendStreamTail, parseMarkdown, splitStreamingTail, type MarkdownBlock, type MarkdownInline, type MarkdownList } from './core/markdown';
import { defaultColors, type AssistantColors } from './core/types';


// Neither platform knows the other's family: iOS has no generic
// 'monospace', Android no Menlo, and an unknown family falls
// back to the proportional system font without a word
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

const BODY_SIZE = 15;
const BODY_LINE = 22;
const CODE_SIZE = 13;
const CODE_LINE = 18;
// Space above a block that follows another; headings breathe more
const BLOCK_GAP = 8;
const HEADING_GAP = 14;
const ITEM_GAP = 4;

const HEADING_TYPE: Record<1 | 2 | 3, { fontSize: number; lineHeight: number }> = {
  1: { fontSize: 20, lineHeight: 26 },
  2: { fontSize: 17, lineHeight: 23 },
  3: { fontSize: 15, lineHeight: 21 },
};

// What every renderer below needs from the root
interface RenderProps {
  colors: AssistantColors;
  onPressLink?: (url: string) => void;
}

// The body text style, in the given ink
const body = (colors: AssistantColors) => ({ fontSize: BODY_SIZE, lineHeight: BODY_LINE, color: colors.ink });







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

function Inline({ spans, colors, onPressLink }: RenderProps & { spans: MarkdownInline[] }) {
  return (
    <>
      {spans.map((span, index) => {
        if (span.type === 'text') return span.text;
        if (span.type === 'code') {
          return (
            <Text key={index} style={{ fontFamily: MONO, fontSize: CODE_SIZE, backgroundColor: colors.surfaceSoft }}>
              {span.text}
            </Text>
          );
        }
        if (span.type === 'bold') {
          return (
            <Text key={index} style={{ fontWeight: '700' }}>
              <Inline spans={span.spans} colors={colors} onPressLink={onPressLink} />
            </Text>
          );
        }
        if (span.type === 'italic') {
          return (
            <Text key={index} style={{ fontStyle: 'italic' }}>
              <Inline spans={span.spans} colors={colors} onPressLink={onPressLink} />
            </Text>
          );
        }
        return (
          <Text
            key={index}
            accessibilityRole="link"
            onPress={onPressLink ? () => onPressLink(span.url) : undefined}
            style={{ color: colors.brand, textDecorationLine: 'underline' }}
          >
            <Inline spans={span.spans} colors={colors} onPressLink={onPressLink} />
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

function CodeBlock({ code, colors, gap }: { code: string; colors: AssistantColors; gap: number }) {
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
      <Text style={{ fontFamily: MONO, fontSize: CODE_SIZE, lineHeight: CODE_LINE, color: colors.ink }}>{code}</Text>
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
// component; the parser guarantees nested items carry no list
// of their own, so the recursion is one level deep.
//
// Used by:
//   - Block (below), and itself for the nested level
// -----------------------------------------------------------

function ListBlock({ list, colors, onPressLink, gap }: RenderProps & { list: MarkdownList; gap: number }) {
  return (
    <View style={{ marginTop: gap }}>
      {list.items.map((item, index) => (
        <View key={index} style={{ flexDirection: 'row', marginTop: index === 0 ? 0 : ITEM_GAP }}>
          <Text style={[body(colors), { color: colors.inkSoft, minWidth: list.ordered ? 26 : 18 }]}>
            {list.ordered ? `${list.start + index}.` : '•'}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={body(colors)}>
              <Inline spans={item.spans} colors={colors} onPressLink={onPressLink} />
            </Text>
            {item.nested ? <ListBlock list={item.nested} colors={colors} onPressLink={onPressLink} gap={ITEM_GAP} /> : null}
          </View>
        </View>
      ))}
    </View>
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

function QuoteBlock({ blocks, colors, onPressLink, gap }: RenderProps & { blocks: MarkdownBlock[]; gap: number }) {
  const muted = { ...colors, ink: colors.inkSoft };
  return (
    <View style={{ marginTop: gap, borderLeftWidth: 3, borderLeftColor: colors.line, paddingLeft: 12 }}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} colors={muted} onPressLink={onPressLink} first={index === 0} />
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

function Block({ block, colors, onPressLink, first }: RenderProps & { block: MarkdownBlock; first: boolean }) {
  const gap = first ? 0 : block.type === 'heading' ? HEADING_GAP : BLOCK_GAP;

  if (block.type === 'paragraph') {
    return (
      <Text style={[body(colors), { marginTop: gap }]}>
        <Inline spans={block.spans} colors={colors} onPressLink={onPressLink} />
      </Text>
    );
  }
  if (block.type === 'heading') {
    return (
      <Text accessibilityRole="header" style={[HEADING_TYPE[block.level], { fontWeight: '700', color: colors.ink, marginTop: gap }]}>
        <Inline spans={block.spans} colors={colors} onPressLink={onPressLink} />
      </Text>
    );
  }
  if (block.type === 'code') return <CodeBlock code={block.code} colors={colors} gap={gap} />;
  if (block.type === 'list') return <ListBlock list={block} colors={colors} onPressLink={onPressLink} gap={gap} />;
  if (block.type === 'quote') return <QuoteBlock blocks={block.blocks} colors={colors} onPressLink={onPressLink} gap={gap} />;
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
//
// Used by:
//   - AssistantMessage.tsx — the assistant bubble's Text part
// -----------------------------------------------------------

export default function MarkdownText({
  text,
  colors = defaultColors,
  onPressLink,
  isStreaming = false,
}: {
  text: string;
  colors?: AssistantColors;
  // The host opens the destination — the kit never navigates
  onPressLink?: (url: string) => void;
  // true while the part is still arriving: the open line's
  // mutable suffix stays plain until it closes
  isStreaming?: boolean;
}) {

  // Parsed once per text change — a colour swap never re-walks
  // the string, and a streaming delta re-parses only the text
  const { blocks, tail, tailGap } = useMemo(() => {
    const split = isStreaming ? splitStreamingTail(text) : { settled: text, tail: '' };
    const parsed = parseMarkdown(split.settled);
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
  }, [text, isStreaming]);


  return (
    <View testID="assistantuikit-markdown">
      {blocks.map((block, index) => (
        <Block key={index} block={block} colors={colors} onPressLink={onPressLink} first={index === 0} />
      ))}
      {tail === '' ? null : (
        <Text testID="assistantuikit-markdown-tail" style={[body(colors), { marginTop: tailGap }]}>
          {tail}
        </Text>
      )}
    </View>
  );
}
