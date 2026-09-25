// -----------------------------------------------------------
//  [*] Tests — API wrapper wire contracts
//
//  The exact URLs and body keys the backend routes expect —
//  the seam where a silent rename (user_id) turns a feature
//  off without any type error. The chat send's wire shape
//  (client_msg_id) is pinned on the live path, in
//  packages/chatengine/src/adapters/knf/__tests__/
//  rest.wire.test.ts.
// -----------------------------------------------------------

// The HTTP verbs the mocked client routes to — each records
// the path and body a wrapper sent
const mockPost = jest.fn(async () => ({ data: {} }));
// DELETE requests
const mockDelete = jest.fn(async () => ({ data: {} }));
// GET requests
const mockGet = jest.fn(async () => ({ data: {} }));
jest.mock('@/services/api/client', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    constructor(message: string, status: number, code: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return {
    ApiError,
    api: {
      post: (...args: unknown[]) => mockPost(...(args as [])),
      delete: (...args: unknown[]) => mockDelete(...(args as [])),
      get: (...args: unknown[]) => mockGet(...(args as [])),
    },
    request: async (call: Promise<{ data: unknown }>) => (await call).data,
    getUploadUrl: (path: string) => path,
    API_BASE_URL: 'https://api.test/api',
  };
});

import { sharePostApi } from '@/services/api/news';
import { deleteUploadApi } from '@/services/api/uploads';
import { acceptFriendRequest, sendFriendRequest } from '@/services/api/social';


beforeEach(() => {
  mockPost.mockClear();
  mockDelete.mockClear();
  mockGet.mockClear();
});


describe('social wire shape', () => {
  it('sends friend requests with the snake_case user id', async () => {
    await sendFriendRequest('user-7');
    expect(mockPost).toHaveBeenCalledWith('/social/friends/request', { user_id: 'user-7' });
  });

  it('passes both success shapes through untouched', async () => {
    // 201: a fresh pending request
    mockPost.mockResolvedValueOnce({ data: { id: 'req-1', status: 'pending' } });
    await expect(sendFriendRequest('u1')).resolves.toEqual({ id: 'req-1', status: 'pending' });

    // 200: the auto-accept branch — no id at all
    mockPost.mockResolvedValueOnce({ data: { status: 'accepted' } });
    await expect(sendFriendRequest('u1')).resolves.toEqual({ status: 'accepted' });
  });

  it('accepts a request by its id', async () => {
    await acceptFriendRequest('req 5');
    expect(mockPost).toHaveBeenCalledWith('/social/friends/requests/req%205/accept');
  });
});


describe('news wire shape', () => {
  it('records shares against the post id', async () => {
    await sharePostApi('post-4');
    expect(mockPost).toHaveBeenCalledWith('/news/post-4/share');
  });
});


describe('admin wire shape', () => {
  it('creates invitations with the exact snake_case params', async () => {
    const { createInvitation } = require('@/services/api/admin');
    await createInvitation({ role: 'teacher', max_uses: 5, expires_hours: 48 });
    expect(mockPost).toHaveBeenCalledWith('/admin/invitations', {
      role: 'teacher',
      max_uses: 5,
      expires_hours: 48,
    });
  });

  it('revokes invitations by encoded id', async () => {
    const { revokeInvitation } = require('@/services/api/admin');
    await revokeInvitation('code 9');
    expect(mockDelete).toHaveBeenCalledWith('/admin/invitations/code%209');
  });
});


describe('uploads wire shape', () => {
  it('deletes a stored upload by its bare name, from a url or the name itself', async () => {
    const name = '0123456789abcdef0123456789abcdef.jpg';
    await deleteUploadApi(`/api/uploads/${name}`);
    await deleteUploadApi(`https://api.test/api/uploads/${name}?s=thumb`);
    await deleteUploadApi(name);
    expect(mockDelete.mock.calls).toEqual([[`/uploads/${name}`], [`/uploads/${name}`], [`/uploads/${name}`]]);
  });

  it('never sends a path that is not a stored upload', async () => {
    await expect(deleteUploadApi('/api/memes/file/memas.jpg')).rejects.toBeTruthy();
    await expect(deleteUploadApi('../../etc/passwd')).rejects.toBeTruthy();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
