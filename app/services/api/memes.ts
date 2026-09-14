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







// -----------------------------------------------------------
// ApiMeme
// -----------------------------------------------------------
//
// One library meme as stored — url/preview are relative upload
// paths (resolve with getUploadUrl), tags is one search string.
//
// Used by:
//   - MemesResponse, pushMemeApi (below)
//   - app/(main)/chat-room/index.tsx — the GIF tab's grid
// -----------------------------------------------------------

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







// -----------------------------------------------------------
// MemesResponse
// -----------------------------------------------------------
//
// One offset page of the grid — the server fixes the page
// size; `hasMore` says whether asking again at offset +
// memes.length yields anything, sparing an empty tail fetch.
//
// Used by:
//   - fetchMemesApi (below) — the list/search page shape
// -----------------------------------------------------------

export interface MemesResponse {
  memes: ApiMeme[];
  hasMore: boolean;
}







// -----------------------------------------------------------
// fetchMemesApi
// -----------------------------------------------------------
//
// List or search the library — the query never leaves this
// origin; offset pages the grid.
//
// Used by:
//   - app/(main)/chat-room/index.tsx — the GIF tab
// -----------------------------------------------------------

export const fetchMemesApi = (q: string, offset = 0) =>
  request(api.get<MemesResponse>('/memes', { params: { ...(q ? { q } : {}), ...(offset ? { offset } : {}) } }));







// -----------------------------------------------------------
// pushMemeApi
// -----------------------------------------------------------
//
// The push: multipart like every upload; native takes the RN
// file object shape, web materializes the picked URI as a Blob.
//
// Used by:
//   - app/(main)/chat-room/index.tsx — the GIF tab's add flow
// -----------------------------------------------------------

export async function pushMemeApi(uri: string, filename?: string, mimeType?: string, title?: string, tags?: string): Promise<{ meme: ApiMeme }> {
  const name = filename || uri.split('/').pop() || 'memas.gif';
  const formData = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    formData.append('file', blob, name);
  } else {
    formData.append('file', { uri, name, type: mimeType || 'image/gif' } as unknown as Blob);
  }
  // The pusher's own words are what make the meme findable —
  // a filename stem is a poor title and no tags at all
  if (title?.trim()) formData.append('title', title.trim());
  if (tags?.trim()) formData.append('tags', tags.trim());
  return request(
    api.post<{ meme: ApiMeme }>('/memes', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30_000,
    }),
  );
}







// -----------------------------------------------------------
// deleteMemeApi
// -----------------------------------------------------------
//
// Remove an own meme — the backend refuses someone else's.
//
// Used by:
//   - app/(main)/chat-room/index.tsx — the GIF tab's delete
// -----------------------------------------------------------

export const deleteMemeApi = (memeId: string) => request(api.delete<{ ok: boolean }>(`/memes/${encodeURIComponent(memeId)}`));
