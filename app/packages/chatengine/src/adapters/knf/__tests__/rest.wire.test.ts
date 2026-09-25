// -----------------------------------------------------------
//  [*] Tests — the knf REST adapter's send wire shape
//
//  The exact URL and body keys the backend's send route
//  expects — the seam where a silent rename (client_msg_id)
//  turns idempotent retries off without any type error. This
//  is the LIVE send path (the app's older sendMessageApi
//  wrapper had no caller and is gone).
// -----------------------------------------------------------

import { createKnfRest, type HttpClient } from '../rest';







// -----------------------------------------------------------
// harness
// -----------------------------------------------------------
//
// The adapter over a recording HttpClient: every POST body and
// every DELETE path lands in a list the tests read back.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function harness() {
  const posts: [string, unknown][] = [];
  const deletes: string[] = [];
  const http: HttpClient = {
    get: async () => ({}) as never,
    post: async (path, body) => {
      posts.push([path, body]);
      return { message: { id: 'srv-1', conversationId: 'c1', senderId: 'me', senderName: 'Me', text: '', time: '00:00', createdAt: '2026-09-19T10:00:00' } } as never;
    },
    put: async () => ({}) as never,
    delete: async (path) => {
      deletes.push(path);
      return {} as never;
    },
  };
  return { rest: createKnfRest({ http }), posts, deletes };
}






describe('knf REST send wire shape', () => {
  it('maps the optimistic clientId onto the snake_case idempotency key and escapes the id', async () => {
    const { rest, posts } = harness();
    await rest.sendMessage('conv 1', { text: 'labas', clientId: 'temp-42' });
    expect(posts).toEqual([['/chat/conversations/conv%201/messages', { text: 'labas', client_msg_id: 'temp-42' }]]);
  });

  it('omits every empty optional instead of sending null keys', async () => {
    const { rest, posts } = harness();
    await rest.sendMessage('c1', { text: '', clientId: 'temp-1', imageUrl: '/api/uploads/p.jpg' });
    expect(posts[0][1]).toEqual({ imageUrl: '/api/uploads/p.jpg', client_msg_id: 'temp-1' });
  });

  it('sends the reply target, the media frame, the kind and the forwarded mark together', async () => {
    const { rest, posts } = harness();
    await rest.sendMessage('c1', {
      text: '', clientId: 'temp-2', replyToId: 'msg-9', kind: 'audio', forwarded: true,
      attachment: { url: '/api/uploads/v.m4a', name: 'v.m4a', size: 3, mime: 'audio/mp4' },
      media: { duration: 3.5, waveform: [0.1, 0.9] },
    });
    expect(posts[0][1]).toEqual({
      replyToId: 'msg-9', client_msg_id: 'temp-2', forwarded: true, kind: 'audio',
      attachment: { url: '/api/uploads/v.m4a', name: 'v.m4a', size: 3, mime: 'audio/mp4' },
      media: { duration: 3.5, waveform: [0.1, 0.9] },
    });
  });
});


describe('knf REST deleteUpload', () => {
  it('hands the stored NAME to the uploads route, in either url form', async () => {
    const { rest, deletes } = harness();
    await rest.deleteUpload?.('/api/uploads/0123456789abcdef0123456789abcdef.jpg');
    await rest.deleteUpload?.('https://knfapp.test/api/uploads/fedcba9876543210fedcba9876543210.m4a');
    expect(deletes).toEqual(['/uploads/0123456789abcdef0123456789abcdef.jpg', '/uploads/fedcba9876543210fedcba9876543210.m4a']);
  });

  it('leaves anything that is not an upload alone — a library meme, a local file', async () => {
    const { rest, deletes } = harness();
    await rest.deleteUpload?.('/api/memes/file/abc.gif');
    await rest.deleteUpload?.('file:///p1.jpg');
    expect(deletes).toEqual([]);
  });
});
