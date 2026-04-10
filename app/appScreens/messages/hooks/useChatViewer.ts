// Drives the fullscreen image viewer and computes the image URI dataset.
import { useMemo, useState } from 'react';
import type { ChatUIMessage } from '../components/types';

export function useChatViewer(messages: ChatUIMessage[]) {
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageViewerIndex, setImageViewerIndex] = useState(0);

  const imageUrls = useMemo(() => messages.filter((m) => m.imageUrl).map((m) => m.imageUrl!), [messages]);

  const openImageViewer = (uri: string) => {
    const idx = messages.filter((m) => m.imageUrl).findIndex((m) => m.imageUrl === uri);
    setImageViewerIndex(Math.max(0, idx));
    setImageViewerOpen(true);
  };

  return {
    imageViewerOpen,
    imageViewerIndex,
    imageUrls,
    setImageViewerOpen,
    setImageViewerIndex,
    openImageViewer,
  } as const;
}


