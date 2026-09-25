// -----------------------------------------------------------
//  [*] useImageViewer — the room's fullscreen photo gallery
//
//  The dataset and the cursor behind components/chat/
//  ImageViewerModal. The cursor is the photo ON SCREEN, not
//  the one that was tapped: the viewer reports every swipe
//  back (view), so a photo removed elsewhere in the room — or
//  an older page landing under the viewer — keeps the viewed
//  photo in place instead of snapping back to the tapped one,
//  and only the viewed photo vanishing closes the viewer (with
//  a toast). Split out of the room screen so these rules have
//  a test.
//
//  Used by:
//    - app/(main)/chat-room/index.tsx
// -----------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ViewerImage } from '@/components/chat/ImageViewerModal';
import { showToast } from '@/context/NetworkContext';
import { getUploadUrl } from '@/services/api';

import type { KitMessage } from '@knf/chatuikit';







// -----------------------------------------------------------
// useImageViewer
// -----------------------------------------------------------
//
//   const viewer = useImageViewer(chat.messages)
//   <MessageList onPressImage={viewer.openImage} onPressGalleryImage={viewer.openGalleryImage} … />
//   <ImageViewerModal visible={viewer.visible} images={viewer.images} initialIndex={Math.max(0, viewer.index)}
//                     onViewChange={viewer.view} onClose={viewer.close} />
//
// The images are chronological (list state is newest-first),
// resolved with getUploadUrl at render time and keyed by
// MESSAGE id so duplicate URLs land on the right entry —
// `clientId ?? id` keeps an own send's entry stable across the
// temp → server id swap, and a refused foreign-origin URL
// (getUploadUrl → null) simply never enters. A gallery message
// contributes one entry per tile, keyed <rowKey>#<index>;
// local uris of a still-uploading send resolve to null and
// stay out (the kit disables those taps).
//
// `visible` already drops the render the viewed photo
// vanishes in, so the modal never flashes the first photo
// before the close.
//
// Used by:
//   - app/(main)/chat-room/index.tsx — ChatRoom
// -----------------------------------------------------------

export function useImageViewer(messages: KitMessage[]) {

  const { t } = useTranslation();
  // The photo on screen: the tapped one, then every swipe
  const [viewedId, setViewedId] = useState<string | null>(null);


  const images = useMemo<ViewerImage[]>(() => {
    const rows: ViewerImage[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.imageUrl && !m.deleted) {
        const uri = getUploadUrl(m.imageUrl);
        if (uri) rows.push({ id: m.clientId ?? m.id, uri });
      }
      if (m.gallery && !m.deleted) {
        m.gallery.forEach((item, index) => {
          const uri = getUploadUrl(item.url);
          if (uri) rows.push({ id: `${m.clientId ?? m.id}#${index}`, uri });
        });
      }
    }
    return rows;
  }, [messages]);
  const index = images.findIndex((img) => img.id === viewedId);
  useEffect(() => {
    if (viewedId !== null && index < 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the unsend that removed the photo is the event; the close rides it together with the toast
      setViewedId(null);
      showToast('info', t('chat.imageRemoved'));
    }
  }, [viewedId, index, t]);


  const openImage = useCallback((m: KitMessage) => setViewedId(m.clientId ?? m.id), []);
  const openGalleryImage = useCallback((m: KitMessage, tile: number) => setViewedId(`${m.clientId ?? m.id}#${tile}`), []);
  const view = useCallback((id: string) => setViewedId(id), []);
  const close = useCallback(() => setViewedId(null), []);


  return { images, index, visible: viewedId !== null && index >= 0, openImage, openGalleryImage, view, close };
}
