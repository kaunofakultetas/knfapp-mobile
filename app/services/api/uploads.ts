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
//    UploadResponse    — relative url + stored filename (+ name,
//                        size, mime, photo pixel size)
//    MAX_UPLOAD_BYTES  — the backend's 5 MB cap, mirrored
//    MAX_VIDEO_UPLOAD_BYTES — the 50 MB video cap
//    uploadImageApi    — multipart upload of a local image
//    uploadFileApi     — a document or a video (kind=file|video)
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
  // Additive since v57: the name the sender chose, the byte size
  // and the canonical mime — what a file / video message carries
  name: string;
  size: number;
  mime: string;
  // Photos only: the stored pixel size after the re-encode
  width?: number | null;
  height?: number | null;
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

// Videos get their own, larger cap (backend VIDEO_MAX_SIZE)
export const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024;







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







// -----------------------------------------------------------
// uploadFileApi
// -----------------------------------------------------------
//
//   uploadFileApi(uri, { name, mimeType, fileSize, kind: 'file' })
//   uploadFileApi(uri, { …, kind: 'video' })
//
// A document or a video, posted as multipart with the `kind`
// form field the backend branches on (stored as sent once the
// bytes prove the type — no re-encode). Videos get the larger
// cap and a longer timeout. Same oversize tagging as photos.
//
// Used by:
//   - hooks/chat/useChatComposer.ts — attachFile / attachMedia
// -----------------------------------------------------------

export async function uploadFileApi(
  uri: string,
  options: { name?: string; mimeType?: string; fileSize?: number; kind: 'file' | 'video' },
): Promise<UploadResponse> {

  const cap = options.kind === 'video' ? MAX_VIDEO_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
  if (typeof options.fileSize === 'number' && options.fileSize > cap) {
    throw new ApiError('File too large', 413, 'http', undefined, 'file_too_large');
  }


  const name = options.name || uri.split('/').pop() || (options.kind === 'video' ? 'video.mp4' : 'file');
  const type = options.mimeType || (options.kind === 'video' ? 'video/mp4' : 'application/octet-stream');


  const formData = new FormData();
  formData.append('kind', options.kind);
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    formData.append('file', blob, name);
  } else {
    formData.append('file', { uri, name, type } as unknown as Blob);
  }


  try {
    return await request(
      api.post<UploadResponse>('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: options.kind === 'video' ? 120_000 : 45_000,
      }),
    );
  } catch (err) {
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
