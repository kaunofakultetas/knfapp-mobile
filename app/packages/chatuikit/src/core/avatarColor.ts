// -----------------------------------------------------------
//  [*] chatuikit — avatarColor
//
//  A stable colour per sender: a small hash of the key (the
//  sender id, falling back to the name) indexes the theme's
//  palette, so one person keeps their disc colour across rooms
//  and sessions, and two members of a group never look alike
//  by accident. The palette comes in as an argument — no theme
//  import, so the module stays pure and tests can hand it any
//  colours.
//
//  Used by:
//    - avatar/KitAvatar.tsx
// -----------------------------------------------------------







// -----------------------------------------------------------
// hashKey
// -----------------------------------------------------------
//
// djb2 — tiny, deterministic, spreads short ids evenly.
//
// Used by:
//   - avatarColorFor (below); exported through the kit's
//     barrel, but no host calls it directly at the moment
// -----------------------------------------------------------

export function hashKey(key: string): number {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) + hash + key.charCodeAt(i)) >>> 0;
  return hash;
}







// -----------------------------------------------------------
// avatarColorFor
// -----------------------------------------------------------
//
// The stable pick: hash the key (sender id, falling back to
// the name) and index the theme's palette; an empty palette
// falls back to a neutral grey instead of crashing the disc.
//
// Used by:
//   - avatar/KitAvatar.tsx — the initial disc's ground
// -----------------------------------------------------------

export function avatarColorFor(key: string, palette: readonly string[]): string {
  if (palette.length === 0) return '#888888';
  return palette[hashKey(key || '?') % palette.length];
}
