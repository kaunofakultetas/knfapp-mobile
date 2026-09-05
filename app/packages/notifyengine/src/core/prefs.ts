// -----------------------------------------------------------
//  [*] notifyengine — preferences
//
//  Three layers with three different truths:
//
//    master switch — CLIENT truth, one boolean in storage
//      (absent means enabled); ON re-registers, OFF detaches.
//      hydrate() projects the stored value into the snapshot
//      once at init, and from then on the SNAPSHOT is the
//      session's truth — a refresh() never re-reads the disk
//      for it, so a toggle made while a GET is in flight, or
//      one the disk failed to record, is never reverted;
//    channel opt-outs — SERVER truth: flips apply
//      optimistically, debounce into ONE merged PUT, and the
//      response's full state becomes the confirmed truth. On
//      failure only the FAILED BATCH's keys revert — a flip
//      made while the batch was in flight keeps its optimistic
//      value (the three-way merge the tests pin);
//    chat preview — a privacy flag, optimistic with revert,
//      cache committed only after transport success; the
//      caller learns whether the wire agreed (true) or the
//      switch snapped back (false).
//
//  Unknown channel keys are rejected before any write, by
//  name — the union mirrors the server's list and garbage
//  never reaches the wire.
//
//  Used by:
//    - engine.ts — snapshot store, hydrate() at init, and the
//      master-switch reader for the token machine's gates
// -----------------------------------------------------------

import { createStore, type MutableStore } from './store';
import type { ChannelKey, KeyValueStorage, NotifyTransport, PrefsSnapshot } from './types';


const MASTER_KEY = 'notify.masterEnabled';
const DEBOUNCE_MS = 300;

export const CHANNEL_KEYS: readonly ChannelKey[] = ['news', 'chat', 'schedule', 'admin'];

const ALL_ON: Record<ChannelKey, boolean> = { news: true, chat: true, schedule: true, admin: true };


export interface PrefsMachine {
  store: MutableStore<PrefsSnapshot>;
  hydrate(): Promise<void>;
  isMasterEnabled(): Promise<boolean>;
  setMasterEnabled(on: boolean): Promise<void>;
  setChannelEnabled(key: ChannelKey, on: boolean): void;
  setChatPreview(on: boolean): Promise<boolean>;
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

  // Counts explicit toggles so a hydrate() that started before
  // one cannot land its older disk value on top of it
  let masterWrites = 0;

  const setMasterEnabled = async (on: boolean): Promise<void> => {
    masterWrites += 1;
    try {
      await storage.set(MASTER_KEY, on ? '1' : '0');
    } catch {
      // The store still reflects the intent this session
    }
    store.set({ ...store.get(), masterEnabled: on });
  };

  // The one disk→snapshot projection of the master switch — a
  // persisted OFF is visible the moment init() resolves, with
  // no wire round-trip needed
  const hydrate = async (): Promise<void> => {
    const writesBefore = masterWrites;
    const masterEnabled = await isMasterEnabled();
    if (masterWrites !== writesBefore) return;
    store.set({ ...store.get(), masterEnabled });
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


  // Resolves true only when the wire agreed with the request —
  // a revert AND a server that answered the other value both
  // read false, since either way the switch did not take
  const setChatPreview = async (on: boolean): Promise<boolean> => {
    const before = store.get().chatPreview;
    store.set({ ...store.get(), chatPreview: on });
    try {
      const confirmedValue = await transport.putChatPreview(on);
      store.set({ ...store.get(), chatPreview: confirmedValue });
      return confirmedValue === on;
    } catch {
      store.set({ ...store.get(), chatPreview: before });
      return false;
    }
  };


  // Server truth only: channels and the preview flag. The
  // master switch is never part of the write — the snapshot's
  // value at commit time IS the session's, and a copy taken
  // before the GET would revert a toggle made during it
  const refresh = async (): Promise<void> => {
    // Wait out any PUT in flight — its answer is newer truth
    // than whatever this GET is about to fetch
    await wireLock.catch(() => undefined);
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
        ...store.get(),
        channels: { ...confirmed, ...pending },
        chatPreview: typeof chatPreview === 'boolean' ? chatPreview : store.get().chatPreview,
        syncState: Object.keys(pending).length === 0 ? 'fresh' : 'stale',
      });
    } catch {
      store.set({ ...store.get(), syncState: 'error' });
    }
  };

  const dispose = (): void => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  return { store, hydrate, isMasterEnabled, setMasterEnabled, setChannelEnabled, setChatPreview, refresh, dispose };
}
