// -----------------------------------------------------------
//  [*] chatTransport — the app's ChatTransport
//
//  @knf/chatengine's KNF adapter over the app's own HTTP
//  client (auth header, base URL, entity decoding, the ApiError
//  shape the engine's retry policy reads) and the shared socket
//  singleton. One instance for the app; ChatEngineHost hands it
//  to the engine.
//
//  Used by:
//    - components/chat/ChatEngineHost.tsx
// -----------------------------------------------------------

import { Platform } from 'react-native';

import { api, request } from '@/services/api/client';
import { socketClient } from '@/services/socket';

import { createKnfTransport, type HttpClient } from '@knf/chatengine/adapters/knf';


// axios → the adapter's HttpClient. request() already throws
// ApiError { status, code, serverCode }, which toTransportError
// reads as-is
const http: HttpClient = {
  get: (path, options) => request(api.get(path, { params: options?.params, timeout: options?.timeoutMs })),
  post: (path, body, options) =>
    request(
      api.post(path, body, {
        timeout: options?.timeoutMs,
        ...(options?.multipart ? { headers: { 'Content-Type': 'multipart/form-data' } } : {}),
      }),
    ),
  put: (path, body, options) => request(api.put(path, body, { timeout: options?.timeoutMs })),
  delete: (path, options) => request(api.delete(path, { timeout: options?.timeoutMs })),
};


export const chatTransport = createKnfTransport({
  http,
  socket: socketClient,
  // Web: the picker URI (blob:/data:) must be materialised as a
  // Blob — the RN object shape serialises to '[object Object]'
  filePart:
    Platform.OS === 'web'
      ? async (asset) => (await fetch(asset.uri)).blob()
      : undefined,
});
