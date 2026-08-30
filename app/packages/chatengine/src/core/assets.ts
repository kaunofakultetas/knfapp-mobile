// -----------------------------------------------------------
//  [*] chatengine — assets
//
//  What a picked asset needs before it is uploaded: a name that
//  agrees with its bytes. iOS hands a JPEG-converted photo over
//  with its original .HEIC name; a backend that trusts the
//  extension refuses it (or serves it under the wrong type).
//
//  Used by:
//    - hooks/useComposer.ts — attach()
// -----------------------------------------------------------

import type { PickedAsset } from './outbox';


const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
};

// The name the upload carries: when the mime type is known and
// the extension disagrees with it (HEIC → JPEG is the common
// case), the extension follows the bytes
export function normalizeAssetName(asset: Pick<PickedAsset, 'name' | 'mimeType' | 'uri' | 'kind'>): string | undefined {
  const name = asset.name?.trim();
  const ext = asset.mimeType ? EXT_BY_MIME[asset.mimeType.toLowerCase()] : undefined;
  if (!name) return ext ? `${asset.kind}.${ext}` : undefined;
  if (!ext) return name;
  const dot = name.lastIndexOf('.');
  const current = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  const stem = dot >= 0 ? name.slice(0, dot) : name;
  const equivalent = current === ext || (ext === 'jpg' && current === 'jpeg') || (ext === 'mov' && current === 'qt');
  return equivalent ? name : `${stem || asset.kind}.${ext}`;
}
