// -----------------------------------------------------------
//  [*] API — the shared meme library
//
//  The self-hosted meme collection: list/search (the query
//  never leaves this origin), push a meme everyone will see,
//  remove an own one. Sending a library meme is NOT here —
//  that is an ordinary chat message whose imageUrl carries the
//  library path (the engine's sendStoredImage).
//
//  Used by:
//    - app/(main)/chat-room/index.tsx — the composer's GIF tab
// -----------------------------------------------------------

import { Platform } from 'react-native';

import { api, request } from '@/services/api/client';


export interface ApiMeme {
  id: string;
  url: string;
  title: string;
  tags: string;
  width?: number | null;
  height?: number | null;
  preview?: string | null;
  addedBy?: string | null;
  createdAt: string;
}

export interface MemesResponse {
  memes: ApiMeme[];
  hasMore: boolean;
}


export const fetchMemesApi = (q: string, offset = 0) =>
  request(api.get<MemesResponse>('/memes', { params: { ...(q ? { q } : {}), ...(offset ? { offset } : {}) } }));


// The push: multipart like every upload; native takes the RN
// file object shape, web materializes the picked URI as a Blob
export async function pushMemeApi(uri: string, filename?: string, mimeType?: string): Promise<{ meme: ApiMeme }> {
  const name = filename || uri.split('/').pop() || 'memas.gif';
  const formData = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    formData.append('file', blob, name);
  } else {
    formData.append('file', { uri, name, type: mimeType || 'image/gif' } as unknown as Blob);
  }
  return request(
    api.post<{ meme: ApiMeme }>('/memes', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30_000,
    }),
  );
}


export const deleteMemeApi = (memeId: string) => request(api.delete<{ ok: boolean }>(`/memes/${encodeURIComponent(memeId)}`));
