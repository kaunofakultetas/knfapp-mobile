// -----------------------------------------------------------
//  [*] notifyengine — the token machine
//
//  The lifecycle of one push token against one backend:
//
//    idle ─register()─▶ acquiring ─▶ syncing ─▶ registered
//                            │            │
//                            ▼            ▼
//                        failed(reason)  detached ◀─detach()
//
//  The hard-won rules, each pinned by a test:
//    - concurrent register() calls COALESCE into one attempt;
//      a NEWER call supersedes — the older resolves
//      {ok:false,'superseded'} and a generation counter makes
//      a stale completion physically unable to overwrite state;
//    - a watchdog forces settlement — register() never hangs
//      on a device that never answers;
//    - the master switch is re-read right before the POST: an
//      in-flight registration must not resurrect a token the
//      user just toggled off;
//    - the {token, platform, language} tuple is persisted and
//      diffed with a TTL — same tuple young enough skips the
//      POST, but 'login' and 'toggle' always re-assert (a new
//      session must claim the token even if the tuple looks
//      identical), and any storage error fails OPEN;
//    - detach() never throws and never prompts: token comes
//      from memory, then the stored copy, then the device only
//      if permission is already granted; a failed DELETE keeps
//      the stored token so the next detach can retry; the
//      whole thing is time-boxed and waits for any in-flight
//      register first, so the two can never interleave.
//
//  Used by:
//    - engine.ts — register/detach/rotation/TTL reconcile
// -----------------------------------------------------------

import { createStore, type MutableStore } from './store';
import type {
  DeviceAdapter,
  KeyValueStorage,
  Language,
  NotifyTransport,
  RegisterFailure,
  RegisterReason,
  RegisterResult,
  RegistrationSnapshot,
} from './types';


const TUPLE_KEY = 'notify.lastRegistration';
// The legacy key older app code reads on unregister — kept in
// sync so the fallback chain works across versions
const LEGACY_TOKEN_KEY = 'push_last_token';

const TUPLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REGISTER_WATCHDOG_MS = 10_000;
const DETACH_TIMEBOX_MS = 5_000;

const IDLE: RegistrationSnapshot = { phase: 'idle', token: null, lastError: null, registeredAt: null };

// The Expo push-token grammar — anything else never reaches
// the wire and fails typed locally
const TOKEN_RE = /^ExponentPushToken\[[^\s\]]+\]$/;


interface StoredTuple {
  token: string;
  platform: string;
  language: string;
  registeredAt: number;
}

// Reasons that always re-assert against the server, even when
// the persisted tuple looks identical — a fresh session must
// claim the token, and an explicit toggle is a user order
const FORCE_REASONS: ReadonlySet<RegisterReason> = new Set(['login', 'toggle']);


export interface RegistrationMachine {
  store: MutableStore<RegistrationSnapshot>;
  register(reason: RegisterReason, deliveredToken?: string): Promise<RegisterResult>;
  detach(opts?: { authToken?: string }): Promise<void>;
}

export function createRegistrationMachine(deps: {
  device: DeviceAdapter;
  transport: NotifyTransport;
  storage: KeyValueStorage;
  language: () => Language;
  canDeliver: () => boolean;
  isMasterEnabled: () => Promise<boolean>;
  now: () => number;
}): RegistrationMachine {
  const { device, transport, storage, language, canDeliver, isMasterEnabled, now } = deps;

  const store = createStore<RegistrationSnapshot>(IDLE);

  // The supersede mechanism: every register() bumps the
  // generation; only the newest generation may write state
  let generation = 0;
  let inFlight: Promise<RegisterResult> | null = null;
  // A detach in progress — register() waits for it, so a fresh
  // POST can never race the DELETE on the wire
  let detachInFlight: Promise<void> | null = null;

  const fail = (gen: number, reason: RegisterFailure['reason']): RegisterFailure => {
    const failure: RegisterFailure = { ok: false, reason };
    if (gen === generation) {
      const prev = store.get();
      store.set({ ...prev, phase: reason === 'superseded' ? prev.phase : 'failed', lastError: failure });
    }
    return failure;
  };

  // A gate rejection BEFORE anything started: pure typed
  // result, zero store writes — a background lane bouncing off
  // the master switch must not stamp 'failed' over 'detached'
  const reject = (reason: RegisterFailure['reason']): RegisterFailure => ({ ok: false, reason });

  const readTuple = async (): Promise<StoredTuple | null> => {
    try {
      const raw = await storage.get(TUPLE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed && typeof parsed === 'object' &&
        typeof (parsed as StoredTuple).token === 'string' &&
        typeof (parsed as StoredTuple).platform === 'string' &&
        typeof (parsed as StoredTuple).language === 'string' &&
        typeof (parsed as StoredTuple).registeredAt === 'number'
      ) {
        return parsed as StoredTuple;
      }
      return null;
    } catch {
      // Fail OPEN: an unreadable record must cause a POST, not
      // silently suppress one
      return null;
    }
  };

  const attempt = async (gen: number, reason: RegisterReason, deliveredToken?: string): Promise<RegisterResult> => {
    // STEP 0: never overtake a logout's DELETE
    // ========================================
    if (detachInFlight) await detachInFlight.catch(() => undefined);
    if (gen !== generation) return { ok: false, reason: 'superseded' };

    // STEP 1: the gates — typed failures, never throws, and
    // NEVER store writes: nothing has started yet
    // =====================================================
    if (!device.supportsRemotePush()) return reject('unsupported');
    if (!(await isMasterEnabled())) return reject('disabled');
    if (!canDeliver()) return reject('permission');
    if (gen !== generation) return reject('superseded');

    // STEP 2: the token — a rotation DELIVERS its value, and
    // using it (instead of re-acquiring) is what breaks the
    // fetch→event→fetch echo loop real devices produce
    // ======================================================
    store.set({ ...store.get(), phase: 'acquiring', lastError: null });
    let token: string;
    if (deliveredToken !== undefined) {
      token = deliveredToken;
    } else {
      try {
        token = await device.getPushToken();
      } catch {
        return fail(gen, 'network');
      }
    }
    if (gen !== generation) return { ok: false, reason: 'superseded' };
    if (!TOKEN_RE.test(token)) return fail(gen, 'network');

    // STEP 3: dedupe against the persisted tuple — unless the
    // reason demands a fresh claim
    // =======================================================
    const lang = language();
    if (!FORCE_REASONS.has(reason)) {
      const stored = await readTuple();
      if (
        stored &&
        stored.token === token &&
        stored.platform === device.platform &&
        stored.language === lang &&
        now() - stored.registeredAt < TUPLE_TTL_MS
      ) {
        if (gen === generation) {
          store.set({ phase: 'registered', token, lastError: null, registeredAt: stored.registeredAt });
        }
        return { ok: true, tokenId: 'cached' };
      }
    }

    // STEP 4: the master switch, re-read at the last moment —
    // an in-flight attempt must not outlive a toggle-off
    // ======================================================
    if (!(await isMasterEnabled())) return fail(gen, 'disabled');
    if (gen !== generation) return { ok: false, reason: 'superseded' };

    // STEP 5: sync to the backend
    // ===========================
    store.set({ ...store.get(), phase: 'syncing' });
    let tokenId: string;
    try {
      const answer = await transport.register({ token, platform: device.platform, language: lang });
      tokenId = answer.tokenId;
    } catch {
      return fail(gen, 'network');
    }
    if (gen !== generation) return { ok: false, reason: 'superseded' };

    // STEP 6: the commit — guarded across EVERY await. A bump
    // landing during the storage writes means a newer attempt
    // (or a detach) owns the truth now; this one neither
    // persists a stale tuple nor stamps the store nor claims
    // success to its caller
    // ======================================================
    if (gen !== generation) return reject('superseded');
    const registeredAt = now();
    const tuple: StoredTuple = { token, platform: device.platform, language: lang, registeredAt };
    try {
      await storage.set(TUPLE_KEY, JSON.stringify(tuple));
      await storage.set(LEGACY_TOKEN_KEY, token);
    } catch {
      // Storage loss only costs a redundant POST next time
    }
    if (gen !== generation) return reject('superseded');

    store.set({ phase: 'registered', token, lastError: null, registeredAt });
    return { ok: true, tokenId };
  };

  const register = (reason: RegisterReason, deliveredToken?: string): Promise<RegisterResult> => {
    const gen = ++generation;

    // The watchdog guarantees settlement even when the device
    // never answers — and is CLEARED on settlement, so a slow
    // timer can never stamp 'failed' over a finished attempt
    const run = new Promise<RegisterResult>((resolve) => {
      const timer = setTimeout(() => {
        const failure = fail(gen, 'network');
        // The attempt is DEAD from here: bumping the generation
        // makes any late device/transport answer land as
        // superseded — the settled result and the wire agree
        if (gen === generation) generation += 1;
        resolve(failure);
      }, REGISTER_WATCHDOG_MS);
      attempt(gen, reason, deliveredToken).then(
        (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        () => {
          // attempt() is written never to throw; this is the
          // belt for the guarantee that register() settles
          clearTimeout(timer);
          resolve(fail(gen, 'network'));
        },
      );
    });

    inFlight = run;
    void run.finally(() => {
      if (inFlight === run) inFlight = null;
    });
    return run;
  };

  const detach = async (opts?: { authToken?: string }): Promise<void> => {
    const work = (async () => {
      // Never interleave with a registration in flight
      if (inFlight) await inFlight.catch(() => undefined);
      generation += 1; // anything still running is superseded
      const detachGen = generation;

      // Token fallback chain: memory → stored copy → device,
      // and the device only when it will not prompt
      let token = store.get().token;
      if (!token) {
        try {
          token = await storage.get(LEGACY_TOKEN_KEY);
        } catch {
          token = null;
        }
      }
      if (!token && canDeliver() && device.supportsRemotePush()) {
        try {
          token = await device.getPushToken();
        } catch {
          token = null;
        }
      }

      if (token) {
        try {
          await transport.unregister({ token, authToken: opts?.authToken });
          // Only a CONFIRMED delete forgets the stored copy —
          // a failed one keeps it for the next retry
          try {
            await storage.del(LEGACY_TOKEN_KEY);
            await storage.del(TUPLE_KEY);
          } catch {
            // Losing the cleanup only costs a retried DELETE
          }
        } catch {
          // Deliberately kept: the stored token retries later
        }
      }

      // A register() issued while the DELETE was on the wire
      // bumped the generation — its newer truth wins, and this
      // detach must not stamp over it
      if (generation === detachGen) {
        store.set({ phase: 'detached', token: null, lastError: null, registeredAt: null });
      }
    })();

    detachInFlight = work;
    void work.finally(() => {
      if (detachInFlight === work) detachInFlight = null;
    });

    // Logout must never hang on the network — and the timer is
    // cleared when the work wins, leaving nothing ticking
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, DETACH_TIMEBOX_MS);
      void work.finally(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  };

  return { store, register, detach };
}
