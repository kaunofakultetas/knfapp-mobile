// -----------------------------------------------------------
//  [*] chatengine — forward
//
//  Turns a held message into the OutgoingMessage that re-sends
//  its content to ANOTHER room, marked `forwarded`. The server
//  never copies anything — the stored upload paths ride along
//  as they are (same origin, same beacon guard), only the mark
//  is new. Quotes never travel (a reply belongs to its room),
//  neither does the link card (the target room unfurls its
//  own). The caller supplies the clientId nonce and hands the
//  result to transport.sendMessage(targetConversationId, …).
//
//  Used by:
//    - the host's forward flow (pick a room → send)
// -----------------------------------------------------------

import type { OutgoingMessage } from './transport';
import type { ChatMessage } from './types';


// Only the CONTENT travels — a structural subset, so a host's
// UI row (chatuikit's KitMessage) forwards without a cast
export type ForwardSource = Pick<ChatMessage, 'text'> &
  Partial<Pick<ChatMessage, 'imageUrl' | 'gallery' | 'video' | 'audio' | 'file' | 'kind' | 'mediaSize' | 'mediaPreview'>>;


export function forwardPayload(message: ForwardSource, clientId: string): OutgoingMessage {

  const attachment =
    message.video?.uri
      ? { url: message.video.uri, name: message.video.name ?? 'video.mp4', size: message.video.size ?? 0, mime: message.video.mimeType ?? 'video/mp4' }
      : message.audio?.uri
        ? { url: message.audio.uri, name: message.audio.name ?? 'voice.m4a', size: message.audio.size ?? 0, mime: message.audio.mimeType ?? 'audio/mp4' }
        : message.file?.uri
          ? { url: message.file.uri, name: message.file.name || 'file', size: message.file.size ?? 0, mime: message.file.mimeType ?? 'application/octet-stream' }
          : undefined;


  const media = {
    ...(message.mediaSize ? { width: message.mediaSize.width, height: message.mediaSize.height } : {}),
    ...(message.video?.duration ? { duration: message.video.duration } : {}),
    ...(message.audio?.duration ? { duration: message.audio.duration } : {}),
    ...(message.video?.thumbnailUri ? { thumbnailUrl: message.video.thumbnailUri } : {}),
    ...(message.mediaPreview ? { preview: message.mediaPreview } : {}),
    ...(message.audio?.waveform?.length ? { waveform: message.audio.waveform } : {}),
  };


  return {
    text: message.text,
    clientId,
    forwarded: true,
    ...(message.imageUrl ? { imageUrl: message.imageUrl } : {}),
    ...(message.gallery?.length ? { gallery: message.gallery.map((item) => ({ url: item.url, width: item.width ?? undefined, height: item.height ?? undefined, preview: item.preview ?? undefined })) } : {}),
    ...(attachment ? { attachment } : {}),
    ...(Object.keys(media).length ? { media } : {}),
    ...(message.kind && message.kind !== 'text' && message.kind !== 'system' && message.kind !== 'custom' ? { kind: message.kind } : {}),
  };
}
