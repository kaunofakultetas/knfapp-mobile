// -----------------------------------------------------------
//  [*] Tests — API wrapper wire contracts
//
//  The exact URLs and body keys the backend routes expect —
//  the seam where a silent rename (client_msg_id, user_id)
//  turns a feature off without any type error.
// -----------------------------------------------------------

const mockPost = jest.fn(async () => ({ data: {} }));
const mockDelete = jest.fn(async () => ({ data: {} }));
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

import { sendMessageApi } from '@/services/api/chat';
import { sharePostApi } from '@/services/api/news';
import { acceptFriendRequest, sendFriendRequest } from '@/services/api/social';


beforeEach(() => {
  mockPost.mockClear();
  mockDelete.mockClear();
  mockGet.mockClear();
});


describe('chat send wire shape', () => {
  it('maps the optimistic clientId onto the snake_case idempotency key', async () => {
    await sendMessageApi('conv 1', 'labas', undefined, undefined, 'temp-42');
    expect(mockPost).toHaveBeenCalledWith('/chat/conversations/conv%201/messages', {
      text: 'labas',
      client_msg_id: 'temp-42',
    });
  });

  it('omits every empty optional instead of sending null keys', async () => {
    await sendMessageApi('c1', 'labas');
    expect(mockPost).toHaveBeenCalledWith('/chat/conversations/c1/messages', { text: 'labas' });
  });

  it('sends image, reply target and nonce together when present', async () => {
    await sendMessageApi('c1', '', '/api/uploads/p.jpg', 'msg-9', 'temp-1');
    expect(mockPost).toHaveBeenCalledWith('/chat/conversations/c1/messages', {
      imageUrl: '/api/uploads/p.jpg',
      replyToId: 'msg-9',
      client_msg_id: 'temp-1',
    });
  });
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


describe('admin and schedule wire shape', () => {
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

  it('drops unset schedule filters instead of sending empty params', async () => {
    const { fetchSchedule } = require('@/services/api/schedule');
    await fetchSchedule(2, '', undefined);
    expect(mockGet).toHaveBeenCalledWith('/schedule', { params: { day: 2 } });

    mockGet.mockClear();
    await fetchSchedule(undefined, 'IF-23', '2026-ruduo');
    expect(mockGet).toHaveBeenCalledWith('/schedule', {
      params: { group: 'IF-23', semester: '2026-ruduo' },
    });
  });

  it('keeps day 0 (Monday) distinct from an unset day', async () => {
    const { fetchSchedule } = require('@/services/api/schedule');
    await fetchSchedule(0);
    expect(mockGet).toHaveBeenCalledWith('/schedule', { params: { day: 0 } });
  });
});
