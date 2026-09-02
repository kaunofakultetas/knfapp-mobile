// -----------------------------------------------------------
//  [*] notifyengine — preferences
//
//  Three layers with three different truths:
//
//    master switch — CLIENT truth, one boolean in storage
//      (absent means enabled); ON re-registers, OFF detaches;
//    channel opt-outs — SERVER truth: flips apply
//      optimistically, debounce into ONE merged PUT, and the
//      response's full state becomes the confirmed truth. On
//      failure only the FAILED BATCH's keys revert — a flip
//      made while the batch was in flight keeps its optimistic
//      value (the three-way merge the tests pin);
//    chat preview — a privacy flag, optimistic with revert,
//      cache committed only after transport success.
//
//  Unknown channel keys are rejected before any write, by
//  name — the union mirrors the server's list and garbage
//  never reaches the wire.
//
//  Used by:
//    - engine.ts — snapshot store + master-switch reader for
//      the token machine's gates
// -----------------------------------------------------------

import { createStore, type MutableStore } from './store';
import type { ChannelKey, KeyValueStorage, NotifyTransport, PrefsSnapshot } from './types';


const MASTER_KEY = 'notify.masterEnabled';
const DEBOUNCE_MS = 300;

export const CHANNEL_KEYS: readonly ChannelKey[] = ['news', 'chat', 'schedule', 'admin'];

const ALL_ON: Record<ChannelKey, boolean> = { news: true, chat: true, schedule: true, admin: true };


export interface PrefsMachine {
  store: MutableStore<PrefsSnapshot>;
  isMasterEnabled(): Promise<boolean>;
  setMasterEnabled(on: boolean): Promise<void>;
  setChannelEnabled(key: ChannelKey, on: boolean): void;
  setChatPreview(on: boolean): Promise<void>;
  refresh(): Promise<void>;
  dispose(): void;
}

export function createPrefsMachine(deps: {
  transport: NotifyTransport;
  storage: KeyValueStorage;
}): PrefsMachine {
  const { transport, storage } = deps;

  const store = createStore<PrefsSnapshot>({
    masterEnabled: true,
    channels: { ...ALL_ON },
    chatPreview: true,
    syncState: 'stale',
  });

  // confirmed = the last full server state; pending = flips not
  // yet flushed. The visible snapshot is confirmed ⊕ pending.
  let confirmed: Record<ChannelKey, boolean> = { ...ALL_ON };
  let pending: Partial<Record<ChannelKey, boolean>> = {};
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const project = (syncState: PrefsSnapshot['syncState']) => {
    store.set({
      ...store.get(),
      channels: { ...confirmed, ...pending },
      syncState,
    });
  };


  const isMasterEnabled = async (): Promise<boolean> => {
    try {
      const raw = await storage.get(MASTER_KEY);
      // Absent means enabled — new installs deliver by default
      return raw === null ? true : raw === '1';
    } catch {
      // Storage down: the SNAPSHOT still carries this session's
      // explicit intent — a user's OFF must gate registers even
      // when the disk cannot say so
      return store.get().masterEnabled;
    }
  };

  const setMasterEnabled = async (on: boolean): Promise<void> => {
    try {
      await storage.set(MASTER_KEY, on ? '1' : '0');
    } catch {
      // The store still reflects the intent this session
    }
    store.set({ ...store.get(), masterEnabled: on });
  };


  // One wire operation at a time: flushes chain, and refresh()
  // waits its turn — a GET must not install pre-PUT truth while
  // the PUT is still on the wire
  let wireLock: Promise<void> = Promise.resolve();

  const flush = async (): Promise<void> => {
    flushTimer = null;
    const batch = pending;
    pending = {};
    if (Object.keys(batch).length === 0) return;

    // The optimistic view holds through the whole flight: the
    // batch merges into confirmed BEFORE the projection, so a
    // flip never visibly snaps back while its PUT is in the air
    const before: Partial<Record<ChannelKey, boolean>> = {};
    for (const key of Object.keys(batch) as ChannelKey[]) before[key] = confirmed[key];
    confirmed = { ...confirmed, ...batch };
    project('flushing');

    try {
      confirmed = await transport.putChannels(batch);
      // Flips made during the flight are still unflushed —
      // 'fresh' would be a lie until their batch lands too
      project(Object.keys(pending).length === 0 ? 'fresh' : 'stale');
    } catch {
      // Revert ONLY the failed batch's keys; flips made during
      // the flight are in `pending` and keep their value
      for (const key of Object.keys(before) as ChannelKey[]) {
        confirmed[key] = before[key] as boolean;
      }
      project('error');
    }
  };

  const setChannelEnabled = (key: ChannelKey, on: boolean): void => {
    if (!CHANNEL_KEYS.includes(key)) {
      throw new Error(`Unknown notification channel "${String(key)}"`);
    }
    pending[key] = on;
    project(store.get().syncState === 'fresh' ? 'stale' : store.get().syncState);
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      wireLock = wireLock.then(() => flush());
    }, DEBOUNCE_MS);
  };


  const setChatPreview = async (on: boolean): Promise<void> => {
    const before = store.get().chatPreview;
    store.set({ ...store.get(), chatPreview: on });
    try {
      const confirmedValue = await transport.putChatPreview(on);
      store.set({ ...store.get(), chatPreview: confirmedValue });
    } catch {
      store.set({ ...store.get(), chatPreview: before });
    }
  };


  const refresh = async (): Promise<void> => {
    // Wait out any PUT in flight — its answer is newer truth
    // than whatever this GET is about to fetch
    await wireLock.catch(() => undefined);
    const masterEnabled = await isMasterEnabled();
    try {
      const [channels, chatPreview] = await Promise.all([transport.getChannels(), transport.getChatPreview()]);
      // Validate shape before trusting — a garbage body must
      // not blank the toggles
      const next = { ...ALL_ON };
      for (const key of CHANNEL_KEYS) {
        if (typeof channels[key] === 'boolean') next[key] = channels[key];
      }
      confirmed = next;
      store.set({
        masterEnabled,
        channels: { ...confirmed, ...pending },
        chatPreview: typeof chatPreview === 'boolean' ? chatPreview : store.get().chatPreview,
        syncState: Object.keys(pending).length === 0 ? 'fresh' : 'stale',
      });
    } catch {
      store.set({ ...store.get(), masterEnabled, syncState: 'error' });
    }
  };

  const dispose = (): void => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  return { store, isMasterEnabled, setMasterEnabled, setChannelEnabled, setChatPreview, refresh, dispose };
}
