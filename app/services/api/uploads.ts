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
//    deleteUploadApi   — give back an upload nothing will use
// -----------------------------------------------------------

// Shared client core
import { ApiError, api, request } from './client';

// FormData file shape differs between native and web
import { Platform } from 'react-native';







// -----------------------------------------------------------
// UploadResponse
// -----------------------------------------------------------
//
// `url` is a RELATIVE path ('/api/uploads/…') and must be
// persisted exactly as received — getUploadUrl resolves it at
// render time (see the header). width/height exist for photos
// only, measured AFTER the server's re-encode.
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
  // Photos only: a ~14px data-URI blur of the stored image — a
  // placeholder to paint while the real bytes download
  preview?: string | null;
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
// MAX_VIDEO_UPLOAD_BYTES
// -----------------------------------------------------------
//
// Videos get their own, larger cap (backend VIDEO_MAX_SIZE).
//
// Used by:
//   - components/chat/ChatEngineHost.tsx — the video preflight
// -----------------------------------------------------------

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
// anything over MAX_UPLOAD_BYTES throws BEFORE the request as
// the same shape the backend answers an oversize body with —
// ApiError status 400, serverCode 'file_too_large' — so
// screens key ONE branch on the code. A 413 from the backend
// is never about size: it is the account's storage quota
// (serverCode 'quota_exceeded'), and it resolves through the
// catalog like every other machine code.
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
    throw new ApiError('File too large', 400, 'http', undefined, 'file_too_large');
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


  return request(
    api.post<UploadResponse>('/uploads', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30_000, // images over mobile links outlive the 15 s default
    }),
  );
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
// cap and a longer timeout. Same oversize preflight as photos.
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
    throw new ApiError('File too large', 400, 'http', undefined, 'file_too_large');
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


  return request(
    api.post<UploadResponse>('/uploads', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: options.kind === 'video' ? 120_000 : 45_000,
    }),
  );
}







// -----------------------------------------------------------
// deleteUploadApi
// -----------------------------------------------------------
//
//   deleteUploadApi('/api/uploads/<name>.jpg')  — url or bare name
//
// DELETE /api/uploads/<name> — hands back an upload the caller
// will never reference (a send refused for good, an abandoned
// pick), so it stops counting against the account's 100 MB
// quota at once instead of waiting for the server's orphan
// sweep (KNF-118). The route answers 409 still_referenced when
// a record shows the file and 403/404 for someone else's —
// both a no-op for this purpose, so callers may treat any
// failure as "leave it to the sweep". Anything that is not a
// stored upload path is refused locally, never sent.
//
// Used by:
//   - nothing yet — the chat composer's refused-send and
//     re-upload paths are its intended callers
// -----------------------------------------------------------

export async function deleteUploadApi(url: string): Promise<void> {
  const name = url.split('?')[0].split('/').pop() ?? '';
  if (!/^[0-9a-f]{32}\.[a-z0-9]{2,5}$/.test(name)) {
    throw new ApiError('Not a stored upload', 400, 'http', undefined, 'bad_filename');
  }
  await request(api.delete(`/uploads/${name}`));
}

