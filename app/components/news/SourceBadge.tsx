// -----------------------------------------------------------
//  [*] News — SourceBadge
//
//  The origin chip on every feed card: KNF / VU / Fakultetas /
//  Programa / Vartotojas. Two placements share one component —
//  `overlay` pins a solid brand chip onto the corner of the
//  card's cover image, the default renders an inline
//  brand-soft chip on the date line when a post has no image.
//
//  Unknown source values render verbatim instead of hiding —
//  a new backend source must never silently disappear.
// -----------------------------------------------------------

// Label lookup in the active language
import { useTranslation } from 'react-i18next';

// Chip primitives
import { Text, View } from 'react-native';


// i18n keys per known backend source value; anything else
// falls through and renders as-is
const SOURCE_LABEL_KEYS: Record<string, string> = {
  'knf.vu.lt': 'news.sourceKnf',
  'vu.lt': 'news.sourceVu',
  faculty: 'news.sourceFaculty',
  app: 'news.sourceApp',
  user: 'news.sourceUser',
};

interface SourceBadgeProps {
  source?: string;
  overlay?: boolean;
}







// -----------------------------------------------------------
// SourceBadge (default export)
// -----------------------------------------------------------
//
// Used by:
//   - components/news/NewsCard.tsx — image corner (overlay)
//     and the date line (inline)
// -----------------------------------------------------------

export default function SourceBadge({ source, overlay = false }: SourceBadgeProps) {

  const { t } = useTranslation();


  if (!source) return null;


  const labelKey = SOURCE_LABEL_KEYS[source];
  const label = labelKey ? t(labelKey) : source;


  // On a photo the chip needs a solid fill to stay readable
  // over any image; inline it softens to the brand wash
  if (overlay) {
    return (
      <View className="absolute right-2.5 top-2.5 rounded-md bg-brand px-2.5 py-1">
        <Text className="font-raleway-bold text-xs text-on-brand">{label}</Text>
      </View>
    );
  }


  return (
    <View className="rounded-md bg-brand-soft px-2.5 py-1">
      <Text className="font-raleway-bold text-xs text-brand">{label}</Text>
    </View>
  );
}
