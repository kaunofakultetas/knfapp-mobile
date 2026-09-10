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
//  eaten. Links open in the system browser and only http(s)
//  targets are tappable — anything else renders as plain
//  text. Unknown or torn markdown (a cap can cut a body) is
//  never an error: whatever fails to parse stays visible as
//  the literal characters.
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
// InlineText
// -----------------------------------------------------------
//
// One block rendered as nested Text: bold spans go semibold,
// italics ride fontStyle (synthesized where Raleway lacks a
// face — a silent no-op on platforms that refuse, never a
// crash), links are brand-tinted, underlined and tappable.
// openURL rejection is swallowed: no browser is not a crash.
//
// Used by:
//   - NewsBody (below) — paragraphs and list items
// -----------------------------------------------------------

function InlineText({ text, className }: { text: string; className: string }) {

  return (
    <Text className={className}>
      {parseInline(text).map((segment, index) => {
        if (segment.url) {
          const url = segment.url;
          return (
            <Text
              key={index}
              className="text-brand underline"
              accessibilityRole="link"
              onPress={() => {
                Linking.openURL(url).catch(() => {
                  // No handler for the URL — nothing more to do
                });
              }}
            >
              {segment.text}
            </Text>
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
// Used by:
//   - app/(main)/news-post/index.tsx — the article body
// -----------------------------------------------------------

export default function NewsBody({ text, markdown }: { text: string; markdown: boolean }) {

  const paragraphClasses = 'font-raleway text-base leading-6 text-ink';


  // A hand-written post renders exactly as typed
  if (!markdown) {
    return <Text className={`px-md pt-sm ${paragraphClasses}`}>{text}</Text>;
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
