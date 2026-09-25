// -----------------------------------------------------------
//  [*] Tests — the meme push's local size preflight
//
//  pushMemeApi refuses an oversize pick BEFORE the bytes leave
//  the phone, as the same shape the backend refuses one with
//  (ApiError 400, serverCode file_too_large): a GIF against
//  the GIF cap, anything else against the image cap, and a
//  pick under the cap (or one without a known size) goes up.
// -----------------------------------------------------------

const mockPost = jest.fn(async (..._args: unknown[]) => ({ data: { meme: { id: 'm1' } } }));
jest.mock('@/services/api/client', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    data: unknown;
    serverCode?: string;
    constructor(message: string, status: number, code: string, data?: unknown, serverCode?: string) {
      super(message);
      this.status = status;
      this.code = code;
      this.data = data;
      this.serverCode = serverCode;
    }
  }
  return {
    ApiError,
    api: { post: (...args: unknown[]) => mockPost(...(args as [])) },
    request: async (call: Promise<{ data: unknown }>) => (await call).data,
  };
});

import { ApiError } from '@/services/api/client';
import { MAX_MEME_GIF_BYTES, MAX_MEME_IMAGE_BYTES, pushMemeApi } from '@/services/api/memes';


beforeEach(() => mockPost.mockClear());


describe('pushMemeApi preflight', () => {
  it('mirrors the caps the wire actually lets through: 6 MB for a GIF, 5 MB for a picture', () => {
    expect(MAX_MEME_GIF_BYTES).toBe(6 * 1024 * 1024);
    expect(MAX_MEME_IMAGE_BYTES).toBe(5 * 1024 * 1024);
  });

  it('refuses an oversize GIF locally as a 400 file_too_large and never posts', async () => {
    const attempt = pushMemeApi('file:///big.gif', 'big.gif', 'image/gif', 'title', 'tags', MAX_MEME_GIF_BYTES + 1);
    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await expect(attempt).rejects.toMatchObject({ status: 400, serverCode: 'file_too_large' });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('judges a static picture against the smaller image cap', async () => {
    // Between the two caps: fine for a GIF, too big for a JPEG
    const size = MAX_MEME_IMAGE_BYTES + 1;
    await expect(pushMemeApi('file:///a.jpg', 'a.jpg', 'image/jpeg', undefined, undefined, size)).rejects.toMatchObject({
      serverCode: 'file_too_large',
    });
    expect(mockPost).not.toHaveBeenCalled();

    await pushMemeApi('file:///a.gif', 'a.gif', 'image/gif', undefined, undefined, size);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('posts a pick under the cap, and one whose size the picker did not report', async () => {
    await pushMemeApi('file:///a.gif', 'a.gif', 'image/gif', 'title', undefined, 1024);
    await pushMemeApi('file:///b.gif', 'b.gif', 'image/gif');
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost.mock.calls[0][0]).toBe('/memes');
  });
});
