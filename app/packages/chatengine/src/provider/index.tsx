// -----------------------------------------------------------
//  [*] chatengine — provider
//
//  The single seam between the engine and its host: one context
//  carrying the transport, who is signed in, where to persist,
//  how to tell the user something went wrong, when the network
//  came back, and (optionally) how to extract a video poster.
//  Mount ChatEngineProvider above the chat screens; the hooks
//  read it with useChatEngine(). Without a provider the hooks
//  throw a clear error — an engine without a transport is a
//  bug, not a default.
//
//  Split into:
//
//    ChatEngineEnv       — what the context carries
//    ChatEngineProvider  — the host mounts it once
//    useChatEngine       — what the hooks read
// -----------------------------------------------------------

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { ChatTransport, EngineNotice } from '../core/transport';
import type { ChatUser } from '../core/types';
import { memoryStorage, type KeyValueStorage } from './storage';


export interface EngineLimits {
  // The composer clamps drafts to this many characters
  maxMessageLength: number;
  // Refused before the upload starts
  maxUploadBytes: number;
  maxVideoBytes: number;
  maxVideoSeconds: number;
}

export const defaultLimits: EngineLimits = {
  maxMessageLength: 5000,
  maxUploadBytes: 5 * 1024 * 1024,
  maxVideoBytes: 50 * 1024 * 1024,
  maxVideoSeconds: 180,
};


export interface ChatEngineEnv {
  transport: ChatTransport;
  // Null for a guest: no optimistic rows, no receipts
  currentUser: ChatUser | null;
  storage: KeyValueStorage;
  // The engine's only voice — codes, never strings
  notify: (notice: EngineNotice) => void;
  // Subscribe to "connectivity came back" — the outbox sweep
  // and the resync run on it. Default: never fires
  onNetworkRestore: (listener: () => void) => () => void;
  // Videos: the host extracts a poster frame (expo-video-
  // thumbnails, ffmpeg…); absent, videos ship without a poster
  makeVideoPoster?: (uri: string) => Promise<{ uri: string; width?: number; height?: number } | null>;
  limits: EngineLimits;
}


const ChatEngineContext = createContext<ChatEngineEnv | null>(null);







// -----------------------------------------------------------
// ChatEngineProvider
// -----------------------------------------------------------
//
// Used by:
//   - the host app, once, above its chat screens
// -----------------------------------------------------------

export function ChatEngineProvider({
  transport,
  currentUser,
  storage,
  notify,
  onNetworkRestore,
  makeVideoPoster,
  limits,
  children,
}: {
  transport: ChatTransport;
  currentUser: ChatUser | null;
  storage?: KeyValueStorage;
  notify?: (notice: EngineNotice) => void;
  onNetworkRestore?: (listener: () => void) => () => void;
  makeVideoPoster?: ChatEngineEnv['makeVideoPoster'];
  limits?: Partial<EngineLimits>;
  children: ReactNode;
}) {

  // A memory store per provider instance — tests and demos need
  // nothing, and a host that wants persistence passes its own
  const fallbackStorage = useMemo(() => memoryStorage(), []);

  const value = useMemo<ChatEngineEnv>(
    () => ({
      transport,
      currentUser,
      storage: storage ?? fallbackStorage,
      notify: notify ?? (() => {}),
      onNetworkRestore: onNetworkRestore ?? (() => () => {}),
      makeVideoPoster,
      limits: { ...defaultLimits, ...(limits ?? {}) },
    }),
    [transport, currentUser, storage, fallbackStorage, notify, onNetworkRestore, makeVideoPoster, limits],
  );

  return <ChatEngineContext.Provider value={value}>{children}</ChatEngineContext.Provider>;
}







// -----------------------------------------------------------
// useChatEngine
// -----------------------------------------------------------
//
// Used by:
//   - every engine hook
// -----------------------------------------------------------

export function useChatEngine(): ChatEngineEnv {
  const env = useContext(ChatEngineContext);
  if (!env) {
    throw new Error('chatengine: mount <ChatEngineProvider transport={…}> above the chat screens');
  }
  return env;
}
