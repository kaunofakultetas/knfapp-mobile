// -----------------------------------------------------------
//  [*] Tests — the assistant thread service and its registry
//
//  The guest registry is PRIVACY logic: the AsyncStorage id
//  list is a guest's only map to their server threads, the
//  unguessable ids are credentials, and the lifecycle rules
//  pinned here are what keeps one person's chats from
//  leaking to the next — remember on create, prune to what
//  the server still answers, empty on a successful claim,
//  KEEP on a failed claim (the next login retries), and
//  CLEAR on logout so a shared phone's second user cannot
//  absorb the first one's history. Storage is the official
//  in-memory AsyncStorage mock; the axios layer is a thin
//  fake recording what each call sent.
// -----------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// The axios client — api.* answers the mockScripted value (or
// throws), request() unwraps it exactly like the real one
const mockCalls: { method: string; path: string; body?: unknown }[] = [];
let mockScripted: unknown = null;
let mockFailNext: Error | null = null;
const mockAnswer = async (method: string, path: string, body?: unknown) => {
  mockCalls.push({ method, path, body });
  if (mockFailNext) {
    const boom = mockFailNext;
    mockFailNext = null;
    throw boom;
  }
  return mockScripted;
};
jest.mock('@/services/api/client', () => ({
  api: {
    get: (path: string) => mockAnswer('get', path),
    post: (path: string, body?: unknown) => mockAnswer('post', path, body),
  },
  request: async (promise: Promise<unknown>) => promise,
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  claimGuestThreads,
  clearGuestThreadRegistry,
  createThread,
  deleteThread,
  listThreads,
} from '@/services/assistantThreads';


const REGISTRY_KEY = 'assistant-guest-threads-v1';

const registry = async (): Promise<string[]> =>
  JSON.parse((await AsyncStorage.getItem(REGISTRY_KEY)) ?? '[]');

const seedRegistry = (ids: string[]) => AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(ids));

const thread = (id: string) => ({
  id, title: null, preview: null, language: 'lt' as const,
  createdAt: '2026-09-15T10:00:00Z', lastMessageAt: '2026-09-15T10:00:00Z',
});


beforeEach(async () => {
  await AsyncStorage.clear();
  mockCalls.length = 0;
  mockScripted = null;
  mockFailNext = null;
});


describe('createThread and the registry', () => {
  it('a guest creation lands in the registry, newest first', async () => {
    await seedRegistry(['old-1']);
    mockScripted = thread('new-1');
    await createThread('lt', { signedIn: false });
    expect(await registry()).toEqual(['new-1', 'old-1']);
  });

  it('a signed-in creation stays OUT of the registry — the account list owns it', async () => {
    mockScripted = thread('new-2');
    await createThread('lt', { signedIn: true });
    expect(await registry()).toEqual([]);
  });

  it('the registry caps at 100 — the oldest id falls off, never the newest', async () => {
    await seedRegistry(Array.from({ length: 100 }, (_, index) => `id-${index}`));
    mockScripted = thread('newest');
    await createThread('lt', { signedIn: false });

    const ids = await registry();
    expect(ids).toHaveLength(100);
    expect(ids[0]).toBe('newest');
    expect(ids).not.toContain('id-99');
    expect(ids).toContain('id-98');
  });
});


describe('listThreads', () => {
  it('signed in reads the server list and never touches the registry', async () => {
    await seedRegistry(['guest-1']);
    mockScripted = { threads: [thread('server-1')] };
    const listed = await listThreads({ signedIn: true });

    expect(mockCalls).toEqual([{ method: 'get', path: '/assistant/threads', body: undefined }]);
    expect(listed.map((row) => row.id)).toEqual(['server-1']);
    expect(await registry()).toEqual(['guest-1']);
  });

  it('a guest looks the registry up and PRUNES ids the server no longer answers', async () => {
    await seedRegistry(['alive-1', 'pruned-2', 'alive-3']);
    mockScripted = { threads: [thread('alive-1'), thread('alive-3')] };
    const listed = await listThreads({ signedIn: false });

    expect(mockCalls[0]).toEqual({
      method: 'post', path: '/assistant/threads/lookup',
      body: { ids: ['alive-1', 'pruned-2', 'alive-3'] },
    });
    expect(listed.map((row) => row.id)).toEqual(['alive-1', 'alive-3']);
    // The claimed/pruned id is gone — registry and list converge
    expect(await registry()).toEqual(['alive-1', 'alive-3']);
  });

  it('an empty registry costs no request at all', async () => {
    expect(await listThreads({ signedIn: false })).toEqual([]);
    expect(mockCalls).toHaveLength(0);
  });

  it('a corrupted registry reads as empty — never a crash', async () => {
    await AsyncStorage.setItem(REGISTRY_KEY, '{not json[');
    expect(await listThreads({ signedIn: false })).toEqual([]);
    expect(mockCalls).toHaveLength(0);
  });
});


describe('deleteThread', () => {
  it('soft-deletes server-side and drops the id from the registry in the same breath', async () => {
    await seedRegistry(['keep-1', 'gone-2']);
    mockScripted = { deleted: true };
    await deleteThread('gone-2');

    expect(mockCalls[0].path).toBe('/assistant/threads/gone-2/delete');
    expect(await registry()).toEqual(['keep-1']);
  });
});


describe('claimGuestThreads — the login hand-over', () => {
  it('offers the whole registry once and empties it on success', async () => {
    await seedRegistry(['g-1', 'g-2']);
    mockScripted = { claimed: 2 };
    expect(await claimGuestThreads()).toBe(2);

    expect(mockCalls[0]).toEqual({
      method: 'post', path: '/assistant/threads/claim', body: { ids: ['g-1', 'g-2'] },
    });
    expect(await registry()).toEqual([]);
  });

  it('an empty registry claims nothing and sends nothing', async () => {
    expect(await claimGuestThreads()).toBe(0);
    expect(mockCalls).toHaveLength(0);
  });

  it('a FAILED claim keeps the registry — the next login simply tries again', async () => {
    await seedRegistry(['g-1']);
    mockFailNext = new Error('502');
    await expect(claimGuestThreads()).rejects.toThrow('502');
    expect(await registry()).toEqual(['g-1']);
  });
});


describe('clearGuestThreadRegistry — the logout hygiene', () => {
  it('empties the registry so the phone\'s next user cannot absorb the previous one\'s threads', async () => {
    await seedRegistry(['a-1', 'b-2']);
    await clearGuestThreadRegistry();
    expect(await registry()).toEqual([]);
    // Only the device's MAP is dropped — no server call, the
    // threads themselves survive for their owner
    expect(mockCalls).toHaveLength(0);
  });
});
