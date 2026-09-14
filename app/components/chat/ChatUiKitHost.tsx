// -----------------------------------------------------------
//  [*] ChatUiKitHost — the app's ChatUiKitProvider
//
//  Feeds the standalone chatuikit everything it is not allowed to
//  reach for itself: our theme palette and Raleway families as
//  the kit theme, the catalog strings as labels, the active
//  locale, getUploadUrl as the image resolver and formatTime
//  as the time formatter. Mounted once in the (main) layout,
//  above every screen that renders kit components (the room,
//  the messages tab, conversation rows).
//
//  The theme object is memoised on the palette so the kit's
//  memoised rows only re-render on a real scheme change.
//
//  Used by:
//    - app/(main)/_layout.tsx
// -----------------------------------------------------------

import { useMemo, type ReactNode } from 'react';

import { ChatUiKitProvider, type KitTheme } from '@knf/chatuikit';

import { fonts } from '@/constants/theme';
import useChatUiKitLabels from '@/hooks/chat/useChatUiKitLabels';
import { useTheme } from '@/hooks/useTheme';
import { getUploadUrl } from '@/services/api';
import { activeLocale, formatTime } from '@/services/format';







// -----------------------------------------------------------
// ChatUiKitHost (default export)
// -----------------------------------------------------------
//
// One KitTheme memoized on the palette — the colors ride in
// wholesale (the kit's token names match the app's) with the
// four Raleway roles named; labels, locale, image resolver
// and time formatter pass straight through.
//
// Used by:
//   - app/(main)/_layout.tsx — above every kit-rendering screen
// -----------------------------------------------------------

export default function ChatUiKitHost({ children }: { children: ReactNode }) {

  const { colors } = useTheme();
  const labels = useChatUiKitLabels();


  const theme = useMemo<KitTheme>(
    () => ({
      colors,
      fonts: {
        regular: fonts.regular,
        medium: fonts.medium,
        semiBold: fonts.semiBold,
        bold: fonts.bold,
      },
    }),
    [colors],
  );


  return (
    <ChatUiKitProvider
      theme={theme}
      labels={labels}
      locale={activeLocale()}
      resolveImageUrl={getUploadUrl}
      formatTime={formatTime}
    >
      {children}
    </ChatUiKitProvider>
  );
}
