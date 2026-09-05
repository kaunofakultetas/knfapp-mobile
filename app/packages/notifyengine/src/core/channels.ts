// -----------------------------------------------------------
//  [*] notifyengine — the channel registry
//
//  Android freezes a channel's importance/sound/vibration the
//  moment it is created — "just change the setting" silently
//  does nothing. The registry therefore treats channel ids as
//  VERSIONED ('default.v1' → 'default.v2'): changing behavior
//  means declaring a new id; the applier diffs desired against
//  installed, creates what is missing, renames what only needs
//  a new localized name, and deletes ONLY ids it has owned —
//  a persisted ownership set keeps it from ever touching a
//  channel someone else created. One guaranteed default
//  channel always exists, so a payload with an unknown or
//  legacy channelId still displays. On every platform that is
//  not Android the whole module is a silent typed no-op —
//  hosts never write a platform branch.
//
//  Used by:
//    - engine.ts — exposes applyChannels; the HOST calls it
//      (names ride its i18n effect, at startup and on switch)
// -----------------------------------------------------------

import type { ChannelSpec, DeviceAdapter, KeyValueStorage } from './types';


const OWNED_KEY = 'notify.ownedChannels';

// [a-z0-9.] — survives every store, log and diff readably;
// ':' '-' '|' are the separators other systems claim
const ID_RE = /^[a-z0-9.]+$/;


// Throws with the offending id named — config errors must die
// loudly at development time, not at apply time on a device
export function validateChannelSpecs(specs: readonly ChannelSpec[]): void {
  if (!specs.some((spec) => spec.nameKey === 'default')) {
    throw new Error('Channel registry needs the guaranteed default channel (nameKey "default")');
  }
  for (const spec of specs) {
    if (!ID_RE.test(spec.id)) {
      throw new Error(`Channel id "${spec.id}" is invalid — allowed charset is [a-z0-9.]`);
    }
  }
  const seen = new Set<string>();
  for (const spec of specs) {
    if (seen.has(spec.id)) throw new Error(`Channel id "${spec.id}" is declared twice`);
    seen.add(spec.id);
  }
  // The platform takes the pattern as millisecond durations —
  // a negative or non-finite entry is a native exception at
  // apply time, on a device, with the id long forgotten
  for (const spec of specs) {
    const pattern = spec.vibrationPattern;
    if (pattern === undefined) continue;
    if (pattern.length === 0 || pattern.some((ms) => !Number.isFinite(ms) || ms < 0)) {
      throw new Error(`Channel "${spec.id}" vibrationPattern must be non-empty, finite, non-negative milliseconds`);
    }
  }
}


export interface ChannelApplier {
  // names: nameKey → localized display name, supplied by the
  // host at apply time (the engine has no strings)
  apply(names: Record<string, string>): Promise<void>;
}

export function createChannelApplier(deps: {
  device: DeviceAdapter;
  storage: KeyValueStorage;
  specs: readonly ChannelSpec[];
}): ChannelApplier {
  const { device, storage, specs } = deps;

  const readOwned = async (): Promise<Set<string>> => {
    try {
      const raw = await storage.get(OWNED_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
    } catch {
      return new Set();
    }
  };

  const writeOwned = async (owned: Set<string>): Promise<void> => {
    try {
      await storage.set(OWNED_KEY, JSON.stringify([...owned].sort()));
    } catch {
      // Losing ownership records only makes future deletes shyer
    }
  };

  const apply = async (names: Record<string, string>): Promise<void> => {
    if (device.platform !== 'android') return;

    const installed = await device.getChannels().catch(() => []);
    const installedIds = new Set(installed.map((channel) => channel.id));
    const desiredIds = new Set(specs.map((spec) => spec.id));
    const owned = await readOwned();

    // STEP 1: create or rename every desired channel. Creating
    // an existing id with the same settings is a rename-in-
    // place on Android — importance stays frozen either way.
    // ========================================================
    let everyCreateLanded = true;
    for (const spec of specs) {
      const name = names[spec.nameKey] ?? spec.nameKey;
      try {
        await device.setChannel({ ...spec, name });
        owned.add(spec.id);
      } catch {
        // One broken channel must not sink the rest — and it
        // must PROTECT the delete pass below
        everyCreateLanded = false;
      }
    }

    // STEP 2: delete stale versions — ONLY ids this registry
    // has ever owned, and ONLY when every replacement landed:
    // deleting v1 while v2 failed to create would leave the
    // guaranteed default channel not existing at all
    // ======================================================
    if (everyCreateLanded) {
      for (const id of installedIds) {
        if (desiredIds.has(id) || !owned.has(id)) continue;
        try {
          await device.deleteChannel(id);
          owned.delete(id);
        } catch {
          // Kept in the owned set — retried next apply
        }
      }
    }

    await writeOwned(owned);
  };

  return { apply };
}
