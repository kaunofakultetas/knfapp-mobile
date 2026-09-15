// -----------------------------------------------------------
//  [*] AssistantThreads — the AI chat history service
//
//  The REST client for the assistant container's thread
//  routes plus the GUEST REGISTRY: an AsyncStorage list of
//  the thread uuids this device created while signed out.
//  A guest's threads live server-side under no owner — the
//  unguessable uuid is the credential — so the device's own
//  registry is the only map back to them; the signed-in
//  list comes from the server instead. On login the app
//  offers the registry to the claim endpoint once, the
//  server adopts what is still ownerless, and the registry
//  empties — pre-login history follows the person into the
//  account.
//
//  Every call rides the shared axios client, so the bearer
//  attaches exactly like every other API call and the
//  session-expiry interceptor stays one place.
//
//  Split into:
//
//    AssistantThreadSummary  — one thread list row
//    readRegistry / writeRegistry — the AsyncStorage list
//    rememberGuestThread     — registry add
//    createThread            — POST, registry-aware
//    listThreads             — signed-in list OR guest lookup
//    fetchThreadMessages     — the stored transcript
//    deleteThread            — soft delete + registry drop
//    claimGuestThreads       — login adopts the registry
// -----------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, request } from '@/services/api/client';


// The registry's storage key — versioned like the app's
// other AsyncStorage keys so a future shape change can
// migrate instead of misparse
const REGISTRY_KEY = 'assistant-guest-threads-v1';

// The most ids the registry keeps (and the lookup cap the
// backend mirrors) — oldest fall off first
const REGISTRY_MAX = 100;







// -----------------------------------------------------------
// AssistantThreadSummary
// -----------------------------------------------------------
//
// One row of the thread list, exactly as the wire answers
// it — the screen renders these untouched.
//
// Used by:
//   - createThread / listThreads (below) — the answer shape
//   - app/(main)/assistant-threads — the list rows
// -----------------------------------------------------------

export interface AssistantThreadSummary {
  id: string;
  title: string | null;
  // The newest answer's first words — the list's second line
  preview: string | null;
  language: 'lt' | 'en';
  createdAt: string;
  lastMessageAt: string;
}







// -----------------------------------------------------------
// AssistantStoredMessage
// -----------------------------------------------------------
//
// One stored transcript message — content is the UIMessage
// the runtime replays, opaque to this service on purpose.
//
// Used by:
//   - fetchThreadMessages (below) — the answer shape
//   - the assistant tab — seeds initialMessages from content
// -----------------------------------------------------------

export interface AssistantStoredMessage {
  id: string;
  format: string;
  content: unknown;
  createdAt: string;
}







// -----------------------------------------------------------
// readRegistry
// -----------------------------------------------------------
//
// The device's guest thread ids, newest first. Storage can
// be absent or throwing (private mode, cleared data) — a
// failed read is an empty registry: the worst outcome is a
// guest losing the map to an old thread, never a crash.
//
// Used by:
//   - rememberGuestThread / listThreads / deleteThread /
//     claimGuestThreads (below)
// -----------------------------------------------------------

async function readRegistry(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(REGISTRY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((one): one is string => typeof one === 'string') : [];
  } catch {
    return [];
  }
}







// -----------------------------------------------------------
// writeRegistry
// -----------------------------------------------------------
//
// The registry's one writer — capped at REGISTRY_MAX,
// oldest ids falling off first. A throwing storage drops
// the write silently: a registry that cannot persist
// simply forgets, it never crashes a chat.
//
// Used by:
//   - rememberGuestThread / listThreads / deleteThread /
//     claimGuestThreads (below)
// -----------------------------------------------------------

async function writeRegistry(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(ids.slice(0, REGISTRY_MAX)));
  } catch {
    // A registry that cannot persist simply forgets
  }
}







// -----------------------------------------------------------
// rememberGuestThread
// -----------------------------------------------------------
//
// Front-inserts a freshly minted thread id. Called for
// guests only — a signed-in creation is already listed by
// the server under the account.
//
// Used by:
//   - createThread (below)
// -----------------------------------------------------------

async function rememberGuestThread(id: string): Promise<void> {
  const ids = await readRegistry();
  await writeRegistry([id, ...ids.filter((one) => one !== id)]);
}







// -----------------------------------------------------------
// createThread
// -----------------------------------------------------------
//
//   createThread('lt', { signedIn: false }) → the new row
//
// Mints the server-side thread. For a guest the id lands in
// the registry immediately — before the first message, so
// even an answer that never arrives leaves the thread
// reachable.
//
// Used by:
//   - the assistant tab — lazily, on the first send
// -----------------------------------------------------------

export async function createThread(
  language: 'lt' | 'en',
  { signedIn }: { signedIn: boolean },
): Promise<AssistantThreadSummary> {
  const created = await request<AssistantThreadSummary>(
    api.post('/assistant/threads', { language }),
  );
  if (!signedIn) {
    await rememberGuestThread(created.id);
  }
  return created;
}







// -----------------------------------------------------------
// listThreads
// -----------------------------------------------------------
//
//   listThreads({ signedIn: true })  → the account's list
//   listThreads({ signedIn: false }) → the registry, looked up
//
// The guest path also PRUNES: ids the server no longer
// answers (pruned by retention, deleted elsewhere, claimed
// into some account) drop out of the registry, so the list
// and the registry converge on every open.
//
// Used by:
//   - app/(main)/assistant-threads — the screen's load
// -----------------------------------------------------------

export async function listThreads({ signedIn }: { signedIn: boolean }): Promise<AssistantThreadSummary[]> {
  if (signedIn) {
    const answer = await request<{ threads: AssistantThreadSummary[] }>(
      api.get('/assistant/threads'),
    );
    return answer.threads;
  }

  const ids = await readRegistry();
  if (ids.length === 0) return [];
  const answer = await request<{ threads: AssistantThreadSummary[] }>(
    api.post('/assistant/threads/lookup', { ids }),
  );
  const alive = new Set(answer.threads.map((thread) => thread.id));
  await writeRegistry(ids.filter((one) => alive.has(one)));
  return answer.threads;
}







// -----------------------------------------------------------
// fetchThreadMessages
// -----------------------------------------------------------
//
// The stored transcript, oldest first — the content fields
// seed the runtime's initialMessages untouched.
//
// Used by:
//   - the assistant tab — opening a thread from the list
// -----------------------------------------------------------

export async function fetchThreadMessages(threadId: string): Promise<AssistantStoredMessage[]> {
  const answer = await request<{ messages: AssistantStoredMessage[] }>(
    api.get(`/assistant/threads/${threadId}/messages`),
  );
  return answer.messages;
}







// -----------------------------------------------------------
// deleteThread
// -----------------------------------------------------------
//
// Soft-deletes server-side and drops the id from the
// registry in the same breath — the list the screen reloads
// afterwards agrees with both stores.
//
// Used by:
//   - app/(main)/assistant-threads — swipe-to-delete
// -----------------------------------------------------------

export async function deleteThread(threadId: string): Promise<void> {
  await request(api.post(`/assistant/threads/${threadId}/delete`, {}));
  const ids = await readRegistry();
  await writeRegistry(ids.filter((one) => one !== threadId));
}







// -----------------------------------------------------------
// clearGuestThreadRegistry
// -----------------------------------------------------------
//
// The logout hygiene: whatever guest ids a departing session
// left unclaimed (a failed claim keeps them) must not sit on
// the device for the NEXT person — a shared phone's second
// user would list them as a guest and absorb them into their
// own account on login. The server-side threads survive
// untouched; only the device's map to them is dropped.
//
// Used by:
//   - context/AuthContext.tsx — clearSession
// -----------------------------------------------------------

export async function clearGuestThreadRegistry(): Promise<void> {
  await writeRegistry([]);
}


// -----------------------------------------------------------
// claimGuestThreads
// -----------------------------------------------------------
//
// The login hand-over: offer every registry id to the claim
// endpoint; the server adopts what is still ownerless, and
// the registry empties either way — from here on the
// account's server list is the one truth. Failures keep the
// registry (the next login tries again); an empty registry
// costs no request at all.
//
// Used by:
//   - the auth flow after a successful login
// -----------------------------------------------------------

export async function claimGuestThreads(): Promise<number> {
  const ids = await readRegistry();
  if (ids.length === 0) return 0;
  const answer = await request<{ claimed: number }>(
    api.post('/assistant/threads/claim', { ids }),
  );
  await writeRegistry([]);
  return answer.claimed;
}
