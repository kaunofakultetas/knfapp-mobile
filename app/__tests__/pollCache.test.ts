// -----------------------------------------------------------
//  [*] Tests — the poll request cache
//
//  One shared request per post, a real 404 cached as "no
//  poll", real failures evicting themselves so the next mount
//  retries — and clearPollCache purging everything so the next
//  viewer never inherits the previous account's userVote.
// -----------------------------------------------------------

const mockGet = jest.fn();
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
    api: { get: (...args: unknown[]) => mockGet(...args), post: jest.fn(), delete: jest.fn() },
    // request() unwraps the axios-shaped { data } envelope
    request: async (call: Promise<{ data: unknown }>) => (await call).data,
  };
});

import { ApiError } from '@/services/api/client';
import { clearPollCache, fetchPoll } from '@/services/api/news';


const pollBody = (id: string, userVote: string | null = null) => ({
  data: { id, title: 'Kur važiuojam?', options: [], userVote },
});


beforeEach(() => {
  clearPollCache();
  mockGet.mockReset();
});


describe('poll request cache', () => {
  it('serves concurrent and repeat mounts from one request', async () => {
    mockGet.mockResolvedValue(pollBody('poll-1'));

    const [a, b] = await Promise.all([fetchPoll('post-1'), fetchPoll('post-1')]);
    const c = await fetchPoll('post-1');

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(c?.id).toBe('poll-1');
  });

  it('caches per post, not globally', async () => {
    mockGet.mockResolvedValueOnce(pollBody('poll-1')).mockResolvedValueOnce(pollBody('poll-2'));

    const one = await fetchPoll('post-1');
    const two = await fetchPoll('post-2');
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(one?.id).toBe('poll-1');
    expect(two?.id).toBe('poll-2');
  });

  it('keeps a 404 as the cached "no poll" answer', async () => {
    mockGet.mockRejectedValue(new ApiError('Not found', 404, 'http'));

    expect(await fetchPoll('post-1')).toBeNull();
    expect(await fetchPoll('post-1')).toBeNull();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('evicts a real failure so the next mount retries', async () => {
    mockGet.mockRejectedValueOnce(new ApiError('Down', 500, 'http'));
    await expect(fetchPoll('post-1')).rejects.toThrow('Down');

    mockGet.mockResolvedValueOnce(pollBody('poll-1'));
    const retried = await fetchPoll('post-1');
    expect(retried?.id).toBe('poll-1');
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('clearPollCache forces a refetch — the next account never inherits userVote', async () => {
    mockGet.mockResolvedValueOnce(pollBody('poll-1', 'option-a'));
    expect((await fetchPoll('post-1'))?.userVote).toBe('option-a');

    clearPollCache();

    mockGet.mockResolvedValueOnce(pollBody('poll-1', null));
    expect((await fetchPoll('post-1'))?.userVote).toBeNull();
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
