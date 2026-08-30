// -----------------------------------------------------------
//  [*] useChatComposer — the engine's composer + the pickers
//
//  @knf/chatengine's useComposer (optimistic sends, the outbox,
//  retries, uploads, edit mode, typing) joined with the device
//  pickers (useAttachmentPicker), so the screen keeps its two
//  attach buttons. The engine's `attach(asset)` stays exposed
//  for callers that already hold an asset.
//
//  Used by:
//    - app/(main)/chat-room/index.tsx
// -----------------------------------------------------------

import { useMemo } from 'react';

import { useAttachmentPicker } from '@/hooks/chat/useAttachmentPicker';
import type { ChatMessage } from '@/types';

import { useComposer, type UseComposerResult } from '@knf/chatengine';

export type { PickedAsset } from '@knf/chatengine';


export interface UseChatComposerResult extends UseComposerResult {
  // Pick a photo or a video from the library, then upload + send
  attachMedia: () => Promise<void>;
  // Pick a document, then upload + send
  attachFile: () => Promise<void>;
}

export function useChatComposer(
  conversationId: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  messages: ChatMessage[],
): UseChatComposerResult {
  const composer = useComposer(conversationId, setMessages, messages);
  const { pickMedia, pickFile } = useAttachmentPicker(composer.attach);
  return useMemo(() => ({ ...composer, attachMedia: pickMedia, attachFile: pickFile }), [composer, pickMedia, pickFile]);
}
