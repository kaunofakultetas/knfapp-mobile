// -----------------------------------------------------------
//  [*] Tests — components/news/commentActions
//
//  News-comment deletion was a finished backend route with a
//  tested kit face and nothing between them (KNF-141). The
//  long-press action now follows the rule the backend
//  enforces on DELETE: the comment's author, the post's
//  author and an admin delete (a confirm, the call, the row
//  out with the server's recount); every other signed-in
//  reader reports — one ledger row on the post naming the
//  commenter and carrying an excerpt. A guest gets no action,
//  a 404 means "already gone" (the row drops, no error), a
//  declined confirm does nothing, and a second long-press on
//  a row still on its way is ignored.
// -----------------------------------------------------------

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
  }),
}));
// The confirm dialog — answers yes unless a test says no
const mockConfirm = jest.fn(async (_options: unknown) => true);
jest.mock('@/components/ui', () => ({ confirmAction: (options: unknown) => mockConfirm(options) }));
let mockUser: { id: string; role: string } | null = { id: 'me', role: 'student' };
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
// Every toast the actions raise
const mockToast = jest.fn();
jest.mock('@/context/NetworkContext', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));
// The router push of the author link
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

// DELETE /news/<post>/comments/<id>
const mockDelete = jest.fn();
// POST /social/reports
const mockReport = jest.fn(async () => {});
jest.mock('@/services/api', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
      this.code = 'http';
    }
  }
  return {
    ApiError,
    deleteCommentApi: (...args: unknown[]) => mockDelete(...args),
    reportTarget: (...args: unknown[]) => mockReport(...(args as [])),
  };
});

import { act, renderHook } from '@testing-library/react-native';

import { toKitComment, useCommentActions, useOpenCommentAuthor } from '@/components/news/commentActions';
import { ApiError } from '@/services/api';







// -----------------------------------------------------------
// wire
// -----------------------------------------------------------
//
// One wire comment row by the given user.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const wire = (id: string, userId: string, text = 'Labas') => ({ id, text, time: '2026-09-01T10:00:00', userName: `User ${userId}`, userId });







// -----------------------------------------------------------
// mount
// -----------------------------------------------------------
//
// The hook for post p1 with the given post author, and the
// onDeleted spy (RNTL 14 renders asynchronously — awaited).
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const mount = async (postAuthorId: string | null = 'author') => {
  const onDeleted = jest.fn();
  const hook = await renderHook(() => useCommentActions({ postId: 'p1', postAuthorId, onDeleted }));
  return { onDeleted, hook };
};







// -----------------------------------------------------------
// flush
// -----------------------------------------------------------
//
// Drains the confirm → call → toast chain.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });


beforeEach(() => {
  mockUser = { id: 'me', role: 'student' };
  mockConfirm.mockReset().mockResolvedValue(true);
  mockDelete.mockReset().mockResolvedValue({ status: 'deleted', comments: 4 });
  mockReport.mockClear();
  mockToast.mockClear();
  mockPush.mockClear();
});


describe('the comment row mapping', () => {
  it("marks the viewer's own comment and keeps the raw stamp", () => {
    expect(toKitComment(wire('c1', 'me'), 'me')).toMatchObject({ id: 'c1', isOwn: true, createdAt: '2026-09-01T10:00:00' });
    expect(toKitComment(wire('c1', 'ona'), 'me').isOwn).toBe(false);
    expect(toKitComment(wire('c1', 'me'), null).isOwn).toBe(false);
  });
});


describe('the long-press action', () => {
  it('the author of a comment deletes it — confirm, call, the row out with the recount', async () => {
    const { onDeleted, hook } = await mount();
    await act(async () => hook.result.current!(toKitComment(wire('c1', 'me'), 'me')));
    await flush();

    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'newsPost.deleteCommentTitle', destructive: true }));
    expect(mockDelete).toHaveBeenCalledWith('p1', 'c1');
    expect(onDeleted).toHaveBeenCalledWith('c1', 4);
    expect(mockToast).toHaveBeenCalledWith('success', 'newsPost.commentDeleted');
    expect(mockReport).not.toHaveBeenCalled();
  });

  it("the post's author deletes anyone's comment under it; an admin deletes anything", async () => {
    mockUser = { id: 'author', role: 'student' };
    const owner = await mount('author');
    await act(async () => owner.hook.result.current!(toKitComment(wire('c2', 'ona'), 'author')));
    await flush();
    expect(mockDelete).toHaveBeenCalledWith('p1', 'c2');

    mockDelete.mockClear();
    mockUser = { id: 'boss', role: 'admin' };
    const admin = await mount('author');
    await act(async () => admin.hook.result.current!(toKitComment(wire('c3', 'ona'), 'boss')));
    await flush();
    expect(mockDelete).toHaveBeenCalledWith('p1', 'c3');
  });

  it("any other reader reports — the post lane, the commenter's name and an excerpt", async () => {
    const long = 'ž'.repeat(400);
    const { onDeleted, hook } = await mount('author');
    await act(async () => hook.result.current!(toKitComment(wire('c4', 'ona', long), 'me')));
    await flush();

    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'newsPost.reportCommentTitle' }));
    const [type, id, reason] = mockReport.mock.calls[0] as unknown as [string, string, string];
    expect([type, id]).toEqual(['post', 'p1']);
    expect(reason).toContain('User ona');
    expect(reason).toContain(`${'ž'.repeat(300)}…`);
    expect(reason).not.toContain('ž'.repeat(301));
    expect(mockToast).toHaveBeenCalledWith('success', 'profile.reported');
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('a comment already gone (404) simply drops its row — no error toast', async () => {
    mockDelete.mockRejectedValueOnce(new (ApiError as unknown as new (m: string, s: number) => Error)('gone', 404));
    const { onDeleted, hook } = await mount();
    await act(async () => hook.result.current!(toKitComment(wire('c5', 'me'), 'me')));
    await flush();
    expect(onDeleted).toHaveBeenCalledWith('c5', null);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('a refusal keeps the row and toasts; a declined confirm does nothing at all', async () => {
    mockDelete.mockRejectedValueOnce(new (ApiError as unknown as new (m: string, s: number) => Error)('no', 403));
    const { onDeleted, hook } = await mount();
    await act(async () => hook.result.current!(toKitComment(wire('c6', 'me'), 'me')));
    await flush();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith('error', 'newsPost.commentDeleteError');

    mockConfirm.mockResolvedValueOnce(false);
    mockDelete.mockClear();
    await act(async () => hook.result.current!(toKitComment(wire('c7', 'me'), 'me')));
    await flush();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('a second long-press on a row still on its way is ignored', async () => {
    let release: (value: boolean) => void = () => {};
    mockConfirm.mockImplementationOnce(() => new Promise<boolean>((resolve) => { release = resolve; }));
    const { hook } = await mount();
    const row = toKitComment(wire('c8', 'me'), 'me');
    await act(async () => {
      hook.result.current!(row);
      hook.result.current!(row);
    });
    await act(async () => release(true));
    await flush();
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('a guest gets no action — the kit row stays inert', async () => {
    mockUser = null;
    const { hook } = await mount();
    expect(hook.result.current).toBeUndefined();
  });

  it("a commenter's portrait opens their profile", async () => {
    const hook = await renderHook(() => useOpenCommentAuthor());
    hook.result.current({ id: 'ona', displayName: 'Ona' });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(main)/profile', params: { userId: 'ona' } });
  });
});
