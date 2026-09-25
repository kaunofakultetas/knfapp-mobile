// -----------------------------------------------------------
//  [*] Session — the one place the stored session lives
//
//  Owns persistence of the signed-in session: the Bearer
//  token goes to expo-secure-store on native (hardware-backed,
//  WHEN_UNLOCKED_THIS_DEVICE_ONLY — never in a cloud backup)
//  and to AsyncStorage on web, where SecureStore does not
//  exist; the non-secret user profile stays in AsyncStorage
//  on every platform. AuthContext, services/api/client.ts and
//  services/socket.ts read and write ONLY through this module
//  — no other file touches the storage keys.
//
//  The token is also cached in a module variable, so after
//  the first read every request/connect gets it without a
//  storage round trip (and a hung storage read can no longer
//  outlive the axios timeout).
//
//  A read that THROWS is kept apart from "nothing stored":
//  readStoredToken answers { ok:false }, getStoredToken answers
//  null, and neither caches the miss — a keychain blip costs
//  one anonymous request, never the stored session. Only
//  AuthContext's hydration needs the distinction: a record is
//  declared partial (and cleared) only after a read that
//  SUCCEEDED.
//
//  Migration: older builds kept { user, token } as one JSON
//  blob under the AsyncStorage 'auth' key. The first read
//  moves the token into SecureStore, the user under its own
//  key, and deletes the legacy record — one way, one time.
//
//  Split into:
//
//    storage keys + token cache — module state
//    readTokenFromStore         — platform-branched raw read
//    writeTokenToStore          — platform-branched raw write
//    deleteTokenFromStore       — platform-branched raw delete
//    migrateLegacySession       — one-time 'auth' blob split
//    readStoredToken            — cached token read, outcome-aware
//    getStoredToken             — cached token accessor
//    getStoredUser              — persisted profile accessor
//    setStoredSession           — persist a fresh login
//    clearStoredSession         — full teardown, never throws
// -----------------------------------------------------------

// Non-secret storage (user profile, web token fallback)
import AsyncStorage from '@react-native-async-storage/async-storage';

// Hardware-backed token storage on iOS/Android
import * as SecureStore from 'expo-secure-store';

// SecureStore is unavailable on web — branch per platform
import { Platform } from 'react-native';

// The profile shape stored alongside the token
import type { User } from '@/types';


// Legacy single-blob key ({ user, token } JSON) older builds
// wrote — read once by the migration below, then deleted
const LEGACY_AUTH_KEY = 'auth';

// Where the token lives now (SecureStore native, AsyncStorage web)
const TOKEN_KEY = 'auth.token';

// Where the non-secret user profile lives (AsyncStorage, all platforms)
const USER_KEY = 'auth.user';

// In-memory token cache: undefined = not read yet, null = no
// session. Set by every read/write below so the hot path
// (request interceptor, socket connect) never hits storage twice.
let cachedToken: string | null | undefined;

// Single-flight guard so concurrent first reads share one
// storage round trip (and run the migration exactly once)
let tokenRead: Promise<StoredTokenRead> | null = null;

// One token read's outcome: ok=false means the store threw —
// the token may well still be there, it just could not be read
export interface StoredTokenRead {
  ok: boolean;
  token: string | null;
}







// -----------------------------------------------------------
// readTokenFromStore
// -----------------------------------------------------------
//
// With its two siblings below, the only lines that know WHERE
// the token is: SecureStore on native, AsyncStorage
// (localStorage) on web.
//
// Used by:
//   - readStoredToken (below) — the first, uncached read
// -----------------------------------------------------------

async function readTokenFromStore(): Promise<string | null> {
  if (Platform.OS === 'web') return AsyncStorage.getItem(TOKEN_KEY);
  return SecureStore.getItemAsync(TOKEN_KEY);
}







// -----------------------------------------------------------
// writeTokenToStore
// -----------------------------------------------------------
//
// The raw platform-branched write — native writes carry
// WHEN_UNLOCKED_THIS_DEVICE_ONLY, so the token never lands in
// a cloud backup.
//
// Used by:
//   - migrateLegacySession, setStoredSession (below)
// -----------------------------------------------------------

async function writeTokenToStore(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}







// -----------------------------------------------------------
// deleteTokenFromStore
// -----------------------------------------------------------
//
// The raw platform-branched delete.
//
// Used by:
//   - clearStoredSession (below)
// -----------------------------------------------------------

async function deleteTokenFromStore(): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}







// -----------------------------------------------------------
// migrateLegacySession
// -----------------------------------------------------------
//
// Splits the pre-secure-store 'auth' blob: token into the
// secure token slot, user under USER_KEY, then deletes the
// blob so the plaintext token stops existing. Returns what it
// found so the caller can serve the read that triggered it.
//
// Used by:
//   - readStoredToken, getStoredUser (below)
// -----------------------------------------------------------

async function migrateLegacySession(): Promise<{
  token: string | null;
  user: User | null;
}> {
  let token: string | null = null;
  let user: User | null = null;

  try {
    const raw = await AsyncStorage.getItem(LEGACY_AUTH_KEY);
    if (!raw) return { token, user };

    const stored = JSON.parse(raw) as { token?: string; user?: User };
    token = stored.token ?? null;
    user = stored.user ?? null;

    if (token) await writeTokenToStore(token);
    if (user) await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    await AsyncStorage.removeItem(LEGACY_AUTH_KEY);
  } catch {
    // Unreadable or unwritable — treat as signed out; the blob
    // (if any) is overwritten by the next successful login
  }

  return { token, user };
}







// -----------------------------------------------------------
// readStoredToken
// -----------------------------------------------------------
//
// The one storage read behind every token accessor, with its
// outcome: { ok:true, token } is what the store holds (null
// for a guest), { ok:false, token:null } means the read THREW
// — a locked or hiccuping keychain — and says nothing about
// what is stored. After the first successful read this is the
// in-memory cache, no storage I/O; a failure caches nothing,
// so the next read tries the store again.
//
// Used by:
//   - context/AuthContext.tsx — startup hydration (the only
//     caller that must tell "nothing stored" from "unreadable")
//   - getStoredToken (below)
// -----------------------------------------------------------

export function readStoredToken(): Promise<StoredTokenRead> {
  if (cachedToken !== undefined) return Promise.resolve({ ok: true, token: cachedToken });

  if (!tokenRead) {
    tokenRead = (async () => {
      try {
        let token = await readTokenFromStore();
        if (!token) token = (await migrateLegacySession()).token;
        cachedToken = token ?? null;
        return { ok: true, token: cachedToken };
      } catch {
        return { ok: false, token: null };
      } finally {
        tokenRead = null;
      }
    })();
  }
  return tokenRead;
}







// -----------------------------------------------------------
// getStoredToken
// -----------------------------------------------------------
//
// Resolves the session token or null for guests. After the
// first call this is the in-memory cache — no storage I/O —
// so per-request and per-connect reads are effectively free.
// A failed read resolves null WITHOUT caching, so a transient
// storage error only costs one anonymous request (callers that
// must know WHY it is null use readStoredToken).
//
// Used by:
//   - services/api/client.ts — request interceptor
//   - services/socket.ts — connect-time auth
//   - context/AuthContext.tsx — the /me correlation reads
// -----------------------------------------------------------

export function getStoredToken(): Promise<string | null> {
  if (cachedToken !== undefined) return Promise.resolve(cachedToken);
  return readStoredToken().then((read) => read.token);
}







// -----------------------------------------------------------
// getStoredUser
// -----------------------------------------------------------
//
// The persisted profile for optimistic session restore, or
// null when signed out / unreadable. Falls back to the legacy
// blob (migrating it) for the first launch after the update.
//
// Used by:
//   - context/AuthContext.tsx — startup hydration
// -----------------------------------------------------------

export async function getStoredUser(): Promise<User | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    if (raw) return JSON.parse(raw) as User;
    return (await migrateLegacySession()).user;
  } catch {
    return null;
  }
}







// -----------------------------------------------------------
// setStoredSession
// -----------------------------------------------------------
//
// Persists a fresh login/register (or a refreshed profile —
// same token, new user). The cache is updated FIRST so the
// api/socket layers see the token without waiting on the
// write; a token write that FAILS rolls the cache back to
// what it held before and rejects, so a token the store never
// took cannot keep answering requests and the socket as that
// account. The caller owns the rest of the teardown —
// AuthContext's establishSession clears the record and drops
// the socket on this rejection — the rollback only closes the
// window until it does.
//
// Used by:
//   - context/AuthContext.tsx — establishSession, setUser
// -----------------------------------------------------------

export async function setStoredSession(token: string, user: User): Promise<void> {
  const previous = cachedToken;
  cachedToken = token;
  try {
    await writeTokenToStore(token);
  } catch (err) {
    cachedToken = previous;
    throw err;
  }
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));

  try {
    await AsyncStorage.removeItem(LEGACY_AUTH_KEY);
  } catch {
    // Stale blob only — the migration path also deletes it
  }
}







// -----------------------------------------------------------
// clearStoredSession
// -----------------------------------------------------------
//
// Full storage teardown for logout / session invalidation.
// Never throws — every slot is cleared best-effort and the
// in-memory cache is nulled first, so the app is signed out
// even when storage misbehaves.
//
// Used by:
//   - context/AuthContext.tsx — logout, clearSession
// -----------------------------------------------------------

export async function clearStoredSession(): Promise<void> {
  cachedToken = null;

  try {
    await deleteTokenFromStore();
  } catch {
    // Overwritten by the next login
  }
  try {
    await AsyncStorage.removeItem(USER_KEY);
  } catch {
    // Non-secret profile only
  }
  try {
    await AsyncStorage.removeItem(LEGACY_AUTH_KEY);
  } catch {
    // Legacy blob only exists on un-migrated installs
  }
}
