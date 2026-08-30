// -----------------------------------------------------------
//  [*] useReturnHref — the current location as a returnTo value
//
//  usePathname() alone strips the query string, so a login
//  round-trip built from it lands back on parameterised
//  screens (chat room, profile, …) with their params gone —
//  the chat room, for one, reopened as an empty fake room.
//  This hook serialises the current search params back onto
//  the pathname, producing an app-internal href
//  ("/chat-room?conversationId=…") that login.tsx can
//  router.replace after a successful sign-in. The value
//  always starts with '/', which is exactly what login's
//  returnTo validation checks for.
// -----------------------------------------------------------

// Location primitives
import { useGlobalSearchParams, usePathname } from 'expo-router';







// -----------------------------------------------------------
// useReturnHref
// -----------------------------------------------------------
//
//   const returnTo = useReturnHref()
//     → "/chat-room?conversationId=abc&type=group"
//
// Used by:
//   - app/(main)/chat-room/index.tsx — LoginPrompt
//   - components/LoginRequiredOverlay.tsx
//   - every other screen that pushes /login with ?returnTo
// -----------------------------------------------------------

export function useReturnHref(): string {
  const pathname = usePathname();
  const params = useGlobalSearchParams();


  // Route params already baked into the pathname re-serialise
  // harmlessly — expo-router lets path segments win on re-entry
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }


  return pairs.length > 0 ? `${pathname}?${pairs.join('&')}` : pathname;
}
