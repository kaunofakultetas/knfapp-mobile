// -----------------------------------------------------------
//  [*] API — uploads
//
//  Image upload for avatars, posts and chat. The response
//  `url` is a RELATIVE path ('/api/uploads/…') and that is
//  exactly what callers must persist (avatar_url, image_url,
//  chat imageUrl) — resolving to an absolute URL happens only
//  at render time via getUploadUrl, so the stored value
//  survives host and deployment changes.
//
//  Split into:
//
//    UploadResponse    — relative url + stored filename
//    MAX_UPLOAD_BYTES  — the backend's 5 MB cap, mirrored
//    uploadImageApi    — multipart upload of a local image
// -----------------------------------------------------------

// Shared client core
import { ApiError, api, request } from './client';

// FormData file shape differs between native and web
import { Platform } from 'react-native';







// -----------------------------------------------------------
// UploadResponse
// -----------------------------------------------------------
//
// Used by:
//   - uploadImageApi (below)
//   - app/(main)/tabs/id.tsx — persists url as avatar_url
//   - app/(main)/create-post/index.tsx — persists url as image_url
//   - hooks/chat/useChatComposer.ts — sends url as imageUrl
// -----------------------------------------------------------

export interface UploadResponse {
  url: string;
  filename: string;
}







// -----------------------------------------------------------
// MAX_UPLOAD_BYTES
// -----------------------------------------------------------
//
// Mirrors the backend's 5 MB upload cap so an oversized pick
// is rejected BEFORE spooling megabytes over a mobile link
// only to be refused server-side.
//
// Used by:
//   - uploadImageApi (below)
//   - picker call sites — pass asset.fileSize for the preflight
// -----------------------------------------------------------

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;







// -----------------------------------------------------------
// uploadImageApi
// -----------------------------------------------------------
//
//   uploadImageApi(uri)                        — infer name/type
//   uploadImageApi(uri, 'a.png', 'image/png')  — explicit
//   uploadImageApi(uri, name, type, fileSize)  — with preflight
//
// Takes a local file URI from expo-image-picker and posts it
// as multipart/form-data with a longer 30 s timeout. On
// native the { uri, name, type } object is the React Native
// FormData file shape (the Blob cast only satisfies the DOM
// typings); on web the picker URI is fetched into a real Blob
// — the RN object shape serializes to '[object Object]' there
// and breaks every upload.
//
// Oversize handling: when the caller passes asset.fileSize,
// anything over MAX_UPLOAD_BYTES throws BEFORE the request;
// the backend's own 'File too large' rejection is tagged the
// same way — both surface as ApiError status 413 with
// serverCode 'file_too_large', so screens can toast an
// actionable size message (apiErrorKey) instead of a generic
// failure.
//
// Used by:
//   - app/(main)/tabs/id.tsx — avatar change
//   - app/(main)/profile/index.tsx — avatar change
//   - app/(main)/create-post/index.tsx — post image
//   - hooks/chat/useChatComposer.ts — chat image
// -----------------------------------------------------------

export async function uploadImageApi(
  uri: string,
  filename?: string,
  mimeType?: string,
  fileSize?: number,
): Promise<UploadResponse> {

  // Preflight: refuse a known-oversized asset without spending
  // the user's data on a doomed upload
  if (typeof fileSize === 'number' && fileSize > MAX_UPLOAD_BYTES) {
    throw new ApiError('File too large', 413, 'http', undefined, 'file_too_large');
  }


  const name = filename || uri.split('/').pop() || 'photo.jpg';
  const type = mimeType || (name.endsWith('.png') ? 'image/png' : 'image/jpeg');


  const formData = new FormData();
  if (Platform.OS === 'web') {
    // Web: materialize the picked URI (blob:/data:) as a Blob
    const blob = await (await fetch(uri)).blob();
    formData.append('file', blob, name);
  } else {
    formData.append('file', { uri, name, type } as unknown as Blob);
  }


  try {
    return await request(
      api.post<UploadResponse>('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30_000, // images over mobile links outlive the 15 s default
      }),
    );
  } catch (err) {
    // Tag the backend's post-hoc size rejection like the
    // preflight one, so callers handle a single shape
    if (
      err instanceof ApiError &&
      err.code === 'http' &&
      !err.serverCode &&
      /too large/i.test(err.message)
    ) {
      throw new ApiError(err.message, err.status, 'http', err.data, 'file_too_large');
    }
    throw err;
  }
}
