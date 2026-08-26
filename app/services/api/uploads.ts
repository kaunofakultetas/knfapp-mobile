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
//    UploadResponse — relative url + stored filename
//    uploadImageApi — multipart upload of a local image
// -----------------------------------------------------------

// Shared client core
import { api, request } from './client';







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
// uploadImageApi
// -----------------------------------------------------------
//
//   uploadImageApi(uri)                      — infer name/type
//   uploadImageApi(uri, 'a.png', 'image/png') — explicit
//
// Takes a local file URI from expo-image-picker and posts it
// as multipart/form-data with a longer 30 s timeout. The
// { uri, name, type } object is the React Native FormData
// file shape — the Blob cast only satisfies the DOM typings.
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
): Promise<UploadResponse> {

  const name = filename || uri.split('/').pop() || 'photo.jpg';
  const type = mimeType || (name.endsWith('.png') ? 'image/png' : 'image/jpeg');


  const formData = new FormData();
  formData.append('file', { uri, name, type } as unknown as Blob);


  return request(
    api.post<UploadResponse>('/uploads', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30_000, // images over mobile links outlive the 15 s default
    }),
  );
}
