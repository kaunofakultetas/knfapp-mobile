// -----------------------------------------------------------
//  [*] useRouteParam — one string out of expo-router params
//
//  Screens like to type useLocalSearchParams<{ id: string }>
//  the way they wish params worked, but at runtime a param can
//  be an array (a repeated ?id=) or missing entirely (a deep
//  link, restored navigation state). Code trusting the cast
//  then crashes or fetches the literal "undefined". This hook
//  owns the honest shape — string | string[] | undefined in,
//  the first string (or undefined) out — so screens branch on
//  a real value instead of a wishful type. An EMPTY or blank
//  value (?postId=) is no id either and reads as undefined: a
//  screen asking the API for "/news/" gets the whole feed
//  back where it expected one post.
// -----------------------------------------------------------

// The raw params for the current route
import { useLocalSearchParams } from 'expo-router';







// -----------------------------------------------------------
// useRouteParam
// -----------------------------------------------------------
//
//   const postId = useRouteParam('postId')  — string, or
//                                             undefined when
//                                             the param is
//                                             absent
//
// Used by:
//   - app/(main)/news-post — postId
//   - app/(main)/news-comments — postId
//   - app/(main)/profile — userId
//   - app/(main)/chat-room — conversationId, type, unread
//   - app/(main)/new-chat — prefillUserId, prefillName
//   - app/(main)/friends — view
//   - app/(main)/create-post — editPostId
//   - app/(main)/map-editor/capture and align — node, nodeId,
//     baseRevision (align also neighbours)
// -----------------------------------------------------------

export function useRouteParam(name: string): string | undefined {
  const params = useLocalSearchParams();


  // Repeated query params arrive as arrays — the first value
  // is the one the navigation intended; a blank one is absent
  const raw = params[name] as string | string[] | undefined;
  const first = Array.isArray(raw) ? raw[0] : raw;
  return typeof first === 'string' && first.trim() !== '' ? first : undefined;
}
