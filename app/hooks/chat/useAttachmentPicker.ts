// -----------------------------------------------------------
//  [*] useAttachmentPicker — the device pickers
//
//  The half of "attach" that belongs to the device, not the
//  chat: the photo/video library (expo-image-picker) and the
//  document picker (expo-document-picker). Each pick becomes a
//  PickedAsset the engine's composer uploads and sends; the
//  library allows up to 8 picks at once — several photos land
//  as ONE gallery message (the engine's attachMany decides).
//  Nothing is cropped — the old square crop is what made every
//  photo square. Pick failures toast here; size and duration
//  caps are the engine's (composer.attach refuses with a
//  notice). The re-entry guard covers the PICKER only — the
//  upload that follows can take minutes, and the attach tiles
//  must work again the moment the picker closes.
//
//  Used by:
//    - hooks/chat/useChatComposer.ts
// -----------------------------------------------------------

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { showToast } from '@/context/NetworkContext';

import type { PickedAsset } from '@knf/chatengine';


// The document types the backend stores (uploads/routes.py
// ALLOWED_DOC_EXTENSIONS)
const DOCUMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'text/plain',
];

// The camera/library cap — matches the engine's limits object
// in components/chat/ChatEngineHost.tsx
const MAX_VIDEO_SECONDS = 180;







// -----------------------------------------------------------
// handOff
// -----------------------------------------------------------
//
// Runs the engine's attach for picks the picker already
// returned. The engine reports its own upload failures as
// notices; anything that still throws gets the generic send
// toast instead of an unhandled rejection — never the "could
// not pick" wording, since the pick itself succeeded.
//
// Used by:
//   - useAttachmentPicker (below) — all three pickers
// -----------------------------------------------------------

async function handOff(run: () => Promise<void>, failure: string) {
  try {
    await run();
  } catch {
    showToast('error', failure);
  }
}







// -----------------------------------------------------------
// useAttachmentPicker
// -----------------------------------------------------------
//
//   const { pickMedia, pickDocument } = useAttachmentPicker(
//     onPicked,        — one asset → one message
//     onPickedMany?,   — several picks → one gallery message
//   )
//
// Used by:
//   - hooks/chat/useChatComposer.ts
// -----------------------------------------------------------

export function useAttachmentPicker(onPicked: (asset: PickedAsset) => Promise<void>, onPickedMany?: (assets: PickedAsset[]) => Promise<void>) {

  const { t } = useTranslation();
  // Re-entry guard set synchronously — a double tap must not
  // open two pickers. Released when the picker closes, before
  // the upload starts
  const pickingRef = useRef(false);


  const pickMedia = useCallback(async () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    let picked: PickedAsset[];
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: false,
        // Up to a gallery's worth in one visit, in pick order
        allowsMultipleSelection: true,
        selectionLimit: 8,
        orderedSelection: true,
        quality: 0.8,
        videoMaxDuration: MAX_VIDEO_SECONDS,
        // iOS: an H.264 mp4 rather than an HEVC .mov the backend and
        // Android readers cannot play
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode?.Compatible,
      });
      if (result.canceled || !result.assets?.length) return;
      picked = result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.fileName || undefined,
        mimeType: asset.mimeType || undefined,
        size: asset.fileSize ?? undefined,
        kind: asset.type === 'video' ? 'video' : 'image',
        width: asset.width || undefined,
        height: asset.height || undefined,
        duration: typeof asset.duration === 'number' && asset.duration > 0 ? asset.duration / 1000 : undefined,
      }));
    } catch {
      showToast('error', t('chat.mediaPickError'));
      return;
    } finally {
      pickingRef.current = false;
    }
    await handOff(async () => {
      if (picked.length > 1 && onPickedMany) await onPickedMany(picked);
      else for (const asset of picked) await onPicked(asset);
    }, t('chat.sendError'));
  }, [onPicked, onPickedMany, t]);


  const pickFile = useCallback(async () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    let picked: PickedAsset;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: DOCUMENT_TYPES, copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      picked = {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType || undefined,
        size: asset.size ?? undefined,
        kind: 'file',
      };
    } catch {
      showToast('error', t('chat.filePickError'));
      return;
    } finally {
      pickingRef.current = false;
    }
    await handOff(() => onPicked(picked), t('chat.sendError'));
  }, [onPicked, t]);


  const pickCamera = useCallback(async () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    let picked: PickedAsset;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showToast('error', t('chat.cameraPermission'));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.8 });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      picked = {
        uri: asset.uri,
        name: asset.fileName || undefined,
        mimeType: asset.mimeType || undefined,
        size: asset.fileSize ?? undefined,
        kind: 'image',
        width: asset.width || undefined,
        height: asset.height || undefined,
      };
    } catch {
      showToast('error', t('chat.mediaPickError'));
      return;
    } finally {
      pickingRef.current = false;
    }
    await handOff(() => onPicked(picked), t('chat.sendError'));
  }, [onPicked, t]);


  return { pickMedia, pickFile, pickCamera };
}
