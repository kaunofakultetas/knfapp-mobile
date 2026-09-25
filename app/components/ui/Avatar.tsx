// -----------------------------------------------------------
//  [*] UI kit — Avatar
//
//  User portrait with graceful degradation: expo-image (with
//  its disk cache) when a photo exists, otherwise the first
//  initial on a brand-soft disc — also when the photo FAILS to
//  load (a dead URL must never leave a blank hole in a row).
//  `uri` is usually the RELATIVE path the backend stores for
//  uploads — getUploadUrl resolves it against API_BASE_URL,
//  passes local picker schemes through and returns null for
//  absolute http(s) URLs outside the API origin, so a crafted
//  avatar_url can never beacon a viewer's IP to a foreign
//  host: the initial disc renders instead.
//
//  The optional online dot sits on the bottom-right edge with
//  a surface ring, so it separates cleanly from any photo
//  underneath in both schemes.
//
//  Bytes and memory: a portrait small enough for the server's
//  320 px derivative requests it (?s=thumb) instead of the
//  2048 px original (KNF-136), and decoded images stay in
//  expo-image's MEMORY cache as well as on disk — the disk-
//  only default re-decoded every row a recycling list brought
//  back into view (KNF-189, the policy the rest of the tree
//  already used).
// -----------------------------------------------------------

// Cached remote image rendering
import { Image } from 'expo-image';

// Fallback disc and online dot primitives
import { useState } from 'react';
import { PixelRatio, Text, View } from 'react-native';

// Resolves relative backend upload paths to absolute URLs
import { getUploadThumbUrl, getUploadUrl } from '@/services/api';

// The presence dot's spoken name
import { useTranslation } from 'react-i18next';


interface AvatarProps {
  uri?: string | null;
  name: string;
  size?: number;
  online?: boolean;
}

// The server's derivative edge (uploads/storage.py THUMB_EDGE)
// — a disc drawn wider than this in device pixels keeps the
// original
const THUMB_EDGE_PX = 320;







// -----------------------------------------------------------
// Avatar (default export)
// -----------------------------------------------------------
//
// Renders the photo only when the uri resolves AND no load
// failure is recorded for it — the failed flag is re-keyed to
// the uri during render, so a changed photo gets a fresh
// attempt without any effect plumbing. The initial is
// decorative (the name always sits beside the portrait), so
// it is hidden from screen readers and does not scale with
// the system text size — the disc cannot grow with it, and a
// scaled letter overflowed it at the largest settings.
//
// Used by:
//   - components/chat/ConversationRow.tsx — list portraits
//     with the online dot
//   - components/chat/ConversationRow.tsx — conversation rows
//   - app/(main)/friends/, app/(main)/friend-requests/ — rows
//   - app/(main)/profile/ — the profile header portrait
//   - app/(main)/admin-users/ — user management rows
// -----------------------------------------------------------

export default function Avatar({ uri, name, size = 40, online = false }: AvatarProps) {

  const { t } = useTranslation();


  // Single uppercase initial as the no-photo fallback — the
  // spread takes a whole code POINT, so an emoji or other
  // non-BMP first character stays one glyph instead of half a
  // surrogate pair; '?' covers blank names from incomplete
  // registrations (and a payload that omitted the name)
  const initial = [...(name ?? '').trim()][0]?.toUpperCase() ?? '?';


  // Dot scales with the avatar but never below a visible 10px
  const dotSize = Math.max(10, Math.round(size * 0.28));


  // A photo that cannot load falls back to the initial; a new
  // uri gets a fresh try
  const [failed, setFailed] = useState(false);
  const [triedUri, setTriedUri] = useState(uri);
  if (triedUri !== uri) {
    setTriedUri(uri);
    setFailed(false);
  }


  // null for a foreign-origin http(s) URL — defence in depth
  // on top of the backend's avatar_url validation, rendering
  // the initial disc instead of a tracking beacon. A disc the
  // derivative covers at this screen's density asks for it
  const thumbFits = size * PixelRatio.get() <= THUMB_EDGE_PX;
  const resolvedUri = uri ? (thumbFits ? getUploadThumbUrl(uri) : getUploadUrl(uri)) : null;


  return (
    <View style={{ width: size, height: size }}>

      {resolvedUri && !failed ? (
        // recyclingKey stops FlatList row reuse from flashing
        // the previous user's photo while the next one loads
        <Image
          source={{ uri: resolvedUri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={uri}
          transition={100}
          onError={() => setFailed(true)}
        />
      ) : (
        <View
          className="items-center justify-center rounded-full bg-brand-soft"
          style={{ width: size, height: size }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text
            className="font-raleway-bold text-brand"
            style={{ fontSize: size * 0.4 }}
            allowFontScaling={false}
          >
            {initial}
          </Text>
        </View>
      )}

      {online && (
        <View
          className="absolute bottom-0 right-0 rounded-full border-2 border-surface bg-success"
          style={{ width: dotSize, height: dotSize }}
          accessible
          accessibilityLabel={t('chat.online')}
        />
      )}
    </View>
  );
}
