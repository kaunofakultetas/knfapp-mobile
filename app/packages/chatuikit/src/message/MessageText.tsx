// -----------------------------------------------------------
//  [*] chatuikit — MessageText
//
//  Body text with URLs, e-mails and phone numbers rendered as
//  underlined, tappable runs. MessageBubble hands down the
//  segments it already computed for the accessibility link
//  actions; the context menu's floating copy has none and
//  linkifies here instead.
//
//  Used by:
//    - message/MessageBubble.tsx (BubbleBody)
// -----------------------------------------------------------

// Theme + labels
import { useKitTheme } from '../provider';
import type { KitLabels } from '../provider/labels';

// Rendering
import { useMemo } from 'react';
import { Text } from 'react-native';

import { linkify, type TextSegment } from '../core/linkify';


export default function MessageText({
  text,
  color,
  linkColor,
  labels,
  segments: segmentsProp,
  onPressLink,
}: {
  text: string;
  color: string;
  linkColor: string;
  labels: KitLabels;
  segments?: TextSegment[];
  onPressLink?: (href: string) => void;
}) {

  const { fonts, text: textStyles } = useKitTheme();


  const computed = useMemo(() => (segmentsProp ? null : linkify(text)), [segmentsProp, text]);
  const segments = segmentsProp ?? computed ?? [];


  return (
    <Text style={[textStyles.body, { color }]}>
      {segments.map((segment, index) =>
        segment.type === 'link' ? (
          <Text
            key={index}
            style={{ textDecorationLine: 'underline', fontFamily: fonts.medium, color: linkColor }}
            onPress={onPressLink ? () => onPressLink(segment.href) : undefined}
            accessibilityLabel={`${labels.openLink}: ${segment.value}`}
          >
            {segment.value}
          </Text>
        ) : (
          segment.value
        ),
      )}
    </Text>
  );
}
