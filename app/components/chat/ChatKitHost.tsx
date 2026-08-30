// -----------------------------------------------------------
//  [*] ChatKitHost — the app's ChatKitProvider
//
//  Feeds the standalone chatkit everything it is not allowed to
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

import { ChatKitProvider, type KitTheme } from '@knf/chatkit';

import { fonts } from '@/constants/theme';
import useChatKitLabels from '@/hooks/chat/useChatKitLabels';
import { useTheme } from '@/hooks/useTheme';
import { getUploadUrl } from '@/services/api';
import { activeLocale, formatTime } from '@/services/format';


export default function ChatKitHost({ children }: { children: ReactNode }) {

  const { colors } = useTheme();
  const labels = useChatKitLabels();


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
    <ChatKitProvider
      theme={theme}
      labels={labels}
      locale={activeLocale()}
      resolveImageUrl={getUploadUrl}
      formatTime={formatTime}
    >
      {children}
    </ChatKitProvider>
  );
}
