// -----------------------------------------------------------
//  [*] chatuikit — avatarColor
//
//  A stable colour per sender: a small hash of the key (the
//  sender id, falling back to the name) indexes the theme's
//  palette, so one person keeps their disc colour across rooms
//  and sessions, and two members of a group never look alike
//  by accident.
//
//  Used by:
//    - avatar/KitAvatar.tsx
// -----------------------------------------------------------

// djb2 — tiny, deterministic, spreads short ids evenly
export function hashKey(key: string): number {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) + hash + key.charCodeAt(i)) >>> 0;
  return hash;
}

export function avatarColorFor(key: string, palette: readonly string[]): string {
  if (palette.length === 0) return '#888888';
  return palette[hashKey(key || '?') % palette.length];
}
