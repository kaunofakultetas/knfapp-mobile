// -----------------------------------------------------------
//  [*] News — NewsBody
//
//  The article body of the news detail screen. Scraped
//  articles arrive as the scraper's light markdown
//  (paragraphs split by blank lines, "## "/"### " headings,
//  "- " list lines, **bold**, *italic*, [text](url) links)
//  and render as structured blocks; community/faculty/app
//  posts pass markdown=false and render as one plain text
//  block, so a member literally typing ** never sees it
//  eaten — only their bare http(s) addresses turn into links
//  (a pasted form or event page is the commonest thing a
//  student shares). Links open in the system browser and only
//  http(s) targets are tappable — anything else renders as
//  plain text; they are drawn in the AA-checked brand TEXT
//  ink. Unknown or torn markdown (a cap can cut a body) is
//  never an error: whatever fails to parse stays visible as
//  the literal characters. The body is selectable, so a
//  reader can copy a phone number or an address out of it.
//
//  Split into:
//
//    Segment / INLINE_RE / BARE_URL_RE — the parse vocabulary
//    parseInline    — markdown inline → segments
//    parsePlainLinks — a typed post's bare URLs → segments
//    LinkText       — one tappable link span
//    InlineText     — one markdown block as nested Text
//    NewsBody       — the body (default export)
// -----------------------------------------------------------

// Link taps go to the system browser
import * as Linking from 'expo-linking';

import React from 'react';
import { Text, View } from 'react-native';


// One parsed inline piece: exactly one of url/bold/italic is
// set, or none for plain text
interface Segment {
  text: string;
  url?: string;
  bold?: boolean;
  italic?: boolean;
}

// Links, then bold, then italic — longest markers first so
// ** is never half-eaten by the italic branch
const INLINE_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;

// A bare http(s) address in typed text — up to whitespace;
// trailing sentence punctuation is peeled off in
// parsePlainLinks ("žr. https://vu.lt." links vu.lt)
const BARE_URL_RE = /https?:\/\/[^\s<>"]+/gi;







// -----------------------------------------------------------
// parseInline
// -----------------------------------------------------------
//
// One block's text as a flat Segment list. Anything the
// regex does not match stays plain text — a torn "[Vilnius"
// tail from a capped body renders literally instead of
// disappearing.
//
// Used by:
//   - InlineText (below)
// -----------------------------------------------------------

function parseInline(text: string): Segment[] {

  const segments: Segment[] = [];
  let last = 0;

  for (const match of text.matchAll(INLINE_RE)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ text: text.slice(last, index) });

    if (match[1]) segments.push({ text: match[1], url: match[2] });
    else if (match[3]) segments.push({ text: match[3], bold: true });
    else segments.push({ text: match[4], italic: true });

    last = index + match[0].length;
  }

  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}







// -----------------------------------------------------------
// parsePlainLinks
// -----------------------------------------------------------
//
// A hand-written post's text as plain segments with its bare
// http(s) addresses cut out as links. Trailing punctuation a
// sentence puts after an address stays text, and a closing
// parenthesis stays with the link only when the address
// opened one itself (a Wikipedia-style path).
//
// Used by:
//   - NewsBody (below) — the markdown=false branch
// -----------------------------------------------------------

export function parsePlainLinks(text: string): Segment[] {

  const segments: Segment[] = [];
  let last = 0;

  for (const match of text.matchAll(BARE_URL_RE)) {
    const index = match.index ?? 0;
    let url = match[0];
    // Peel sentence punctuation; a ')' only when unbalanced
    while (url.length > 0) {
      const tail = url[url.length - 1];
      if ('.,;:!?\'"'.includes(tail)) url = url.slice(0, -1);
      else if (tail === ')' && (url.match(/\(/g) ?? []).length < (url.match(/\)/g) ?? []).length) url = url.slice(0, -1);
      else break;
    }
    if (!/^https?:\/\/[^/\s]+\.[^/\s]/i.test(url)) continue;

    if (index > last) segments.push({ text: text.slice(last, index) });
    segments.push({ text: url, url });
    last = index + url.length;
  }

  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}







// -----------------------------------------------------------
// LinkText
// -----------------------------------------------------------
//
// One tappable link span inside a Text: brand text ink,
// underlined, announced as a link; openURL rejection is
// swallowed — no browser is not a crash.
//
// Used by:
//   - InlineText, NewsBody (below)
// -----------------------------------------------------------

function LinkText({ url, children }: { url: string; children: string }) {
  return (
    <Text
      className="text-brand-text underline"
      accessibilityRole="link"
      onPress={() => {
        Linking.openURL(url).catch(() => {
          // No handler for the URL — nothing more to do
        });
      }}
    >
      {children}
    </Text>
  );
}







// -----------------------------------------------------------
// InlineText
// -----------------------------------------------------------
//
// One block rendered as nested Text: bold spans go semibold,
// italics ride fontStyle (synthesized where Raleway lacks a
// face — a silent no-op on platforms that refuse, never a
// crash), links are LinkText spans.
//
// Used by:
//   - NewsBody (below) — paragraphs and list items
// -----------------------------------------------------------

function InlineText({ text, className }: { text: string; className: string }) {

  return (
    <Text className={className} selectable>
      {parseInline(text).map((segment, index) => {
        if (segment.url) {
          return (
            <LinkText key={index} url={segment.url}>
              {segment.text}
            </LinkText>
          );
        }
        if (segment.bold) {
          return (
            <Text key={index} className="font-raleway-semibold">
              {segment.text}
            </Text>
          );
        }
        if (segment.italic) {
          return (
            <Text key={index} style={{ fontStyle: 'italic' }}>
              {segment.text}
            </Text>
          );
        }
        return <Text key={index}>{segment.text}</Text>;
      })}
    </Text>
  );
}







// -----------------------------------------------------------
// NewsBody (default export)
// -----------------------------------------------------------
//
// The markdown flag decides everything: false returns the
// text as ONE literal Text block; true splits on blank lines
// and maps each block to heading, bullet list or paragraph,
// with all inline styling delegated to InlineText.
//
// Used by:
//   - app/(main)/news-post/index.tsx — the article body
// -----------------------------------------------------------

export default function NewsBody({ text, markdown }: { text: string; markdown: boolean }) {

  const paragraphClasses = 'font-raleway text-base leading-6 text-ink';


  // A hand-written post renders exactly as typed — its bare
  // addresses tappable, nothing else touched
  if (!markdown) {
    return (
      <Text className={`px-md pt-sm ${paragraphClasses}`} selectable>
        {parsePlainLinks(text).map((segment, index) =>
          segment.url ? (
            <LinkText key={index} url={segment.url}>
              {segment.text}
            </LinkText>
          ) : (
            segment.text
          ),
        )}
      </Text>
    );
  }


  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return (
    <View className="px-md pt-sm gap-md">
      {blocks.map((block, index) => {
        if (block.startsWith('## ')) {
          return (
            <InlineText
              key={index}
              text={block.slice(3)}
              className="pt-xs text-xl font-raleway-bold leading-7 text-ink"
            />
          );
        }
        if (block.startsWith('### ')) {
          return (
            <InlineText
              key={index}
              text={block.slice(4)}
              className="pt-xs text-lg font-raleway-semibold leading-6 text-ink"
            />
          );
        }
        if (block.startsWith('- ')) {
          return (
            <View key={index} className="gap-xs">
              {block.split('\n').map((line, lineIndex) => (
                <View key={lineIndex} className="flex-row">
                  <Text className={`w-5 ${paragraphClasses}`}>•</Text>
                  <View className="flex-1">
                    <InlineText text={line.replace(/^- /, '')} className={paragraphClasses} />
                  </View>
                </View>
              ))}
            </View>
          );
        }
        return <InlineText key={index} text={block} className={paragraphClasses} />;
      })}
    </View>
  );
}
