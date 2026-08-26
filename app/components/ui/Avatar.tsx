// -----------------------------------------------------------
//  [*] UI kit — Avatar
//
//  User portrait with graceful degradation: expo-image (with
//  its disk cache) when a photo exists, otherwise the first
//  initial on a brand-soft disc. `uri` is usually the
//  RELATIVE path the backend stores for uploads —
//  getUploadUrl resolves it against API_BASE_URL and passes
//  absolute http(s) URLs through untouched.
//
//  The optional online dot sits on the bottom-right edge with
//  a surface ring, so it separates cleanly from any photo
//  underneath in both schemes.
// -----------------------------------------------------------

// Cached remote image rendering
import { Image } from 'expo-image';

// Fallback disc and online dot primitives
import { Text, View } from 'react-native';

// Resolves relative backend upload paths to absolute URLs
import { getUploadUrl } from '@/services/api';


interface AvatarProps {
  uri?: string | null;
  name: string;
  size?: number;
  online?: boolean;
}







// -----------------------------------------------------------
// Avatar (default export)
// -----------------------------------------------------------
//
// Used by:
//   - components/chat/ConversationRow.tsx — list portraits
//     with the online dot
//   - components/chat/MessageBubble.tsx — group senders
//   - components/news/CommentRow.tsx — comment authors
//   - app/(main)/friends/, app/(main)/friend-requests/ — rows
//   - app/(main)/profile/ — the profile header portrait
//   - app/(main)/admin-users/ — user management rows
// -----------------------------------------------------------

export default function Avatar({ uri, name, size = 40, online = false }: AvatarProps) {

  // Single uppercase initial as the no-photo fallback; '?'
  // covers blank names from incomplete registrations
  const initial = name.trim().charAt(0).toUpperCase() || '?';


  // Dot scales with the avatar but never below a visible 10px
  const dotSize = Math.max(10, Math.round(size * 0.28));


  return (
    <View style={{ width: size, height: size }}>

      {uri ? (
        // recyclingKey stops FlatList row reuse from flashing
        // the previous user's photo while the next one loads
        <Image
          source={{ uri: getUploadUrl(uri) }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          recyclingKey={uri}
          transition={100}
        />
      ) : (
        <View
          className="items-center justify-center rounded-full bg-brand-soft"
          style={{ width: size, height: size }}
        >
          <Text className="font-raleway-bold text-brand" style={{ fontSize: size * 0.4 }}>
            {initial}
          </Text>
        </View>
      )}

      {online && (
        <View
          className="absolute bottom-0 right-0 rounded-full border-2 border-surface bg-success"
          style={{ width: dotSize, height: dotSize }}
        />
      )}
    </View>
  );
}

// Named alongside the default so the ui barrel can `export *`
export { Avatar };
