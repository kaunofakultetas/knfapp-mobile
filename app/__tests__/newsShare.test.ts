// -----------------------------------------------------------
//  [*] Tests — components/news/sharePost
//
//  One share message for the feed card and the article screen
//  (the article used to share a bare title): a scraped article
//  shares its web address; an app-native post shares its
//  title — unless the title is just the body's head — an
//  excerpt and the app's deep link, and a list page's cut body
//  (truncated) keeps its ellipsis even when it is exactly the
//  excerpt's length. A dismissal of the sheet is a verdict,
//  not an error; a real failure rejects.
// -----------------------------------------------------------

jest.mock('expo-linking', () => ({
  createURL: (path: string, options: { queryParams: Record<string, string> }) =>
    `knfapp://${path.replace(/^\//, '')}?postId=${options.queryParams.postId}`,
}));

import { Share } from 'react-native';

import { openShareSheet, sharePayload } from '@/components/news/sharePost';
import type { NewsPost } from '@/types';







// -----------------------------------------------------------
// post
// -----------------------------------------------------------
//
// One app-native post, overridable.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const post = (over: Partial<NewsPost> = {}): NewsPost => ({
  id: 'p1',
  title: 'Šašlykai penktadienį',
  content: 'Visi kviečiami prie bendrabučio.',
  date: '2026-09-20T10:00:00Z',
  likes: 0,
  comments: 0,
  shares: 0,
  source: 'user',
  ...over,
});


describe('sharePayload', () => {
  it('a scraped article shares its web address', () => {
    const payload = sharePayload(post({ source: 'knf.vu.lt', sourceUrl: 'https://knf.vu.lt/n/1' }));
    expect(payload).toEqual({
      title: 'Šašlykai penktadienį',
      message: 'Šašlykai penktadienį\nhttps://knf.vu.lt/n/1',
      url: 'https://knf.vu.lt/n/1',
    });
  });

  it('an app-native post shares title, excerpt and the deep link', () => {
    expect(sharePayload(post()).message).toBe(
      'Šašlykai penktadienį\nVisi kviečiami prie bendrabučio.\nknfapp://news-post?postId=p1',
    );
  });

  it('a title that only repeats the body head is not said twice', () => {
    const body = 'Rytoj paskaitos nebus, dėstytojas serga.';
    const message = sharePayload(post({ title: body.slice(0, 20), content: body })).message;
    expect(message.startsWith(body)).toBe(true);
    expect(message.split('\n')).toHaveLength(2);
  });

  it('a long body is cut with an ellipsis, and so is a list page body cut at exactly the length', () => {
    const long = sharePayload(post({ content: 'a'.repeat(260) })).message.split('\n')[1];
    expect(long).toBe(`${'a'.repeat(200)}…`);

    const cut = sharePayload(post({ content: 'b'.repeat(200), truncated: true })).message.split('\n')[1];
    expect(cut).toBe(`${'b'.repeat(200)}…`);

    const whole = sharePayload(post({ content: 'c'.repeat(200) })).message.split('\n')[1];
    expect(whole).toBe('c'.repeat(200));
  });
});


describe('openShareSheet', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports a completed share and a dismissal', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValueOnce({ action: Share.sharedAction });
    await expect(openShareSheet(post())).resolves.toBe('shared');
    share.mockResolvedValueOnce({ action: Share.dismissedAction });
    await expect(openShareSheet(post())).resolves.toBe('dismissed');
  });

  it("reads the web's AbortError as a dismissal and rejects a real failure", async () => {
    jest.spyOn(Share, 'share')
      .mockRejectedValueOnce(Object.assign(new Error('closed'), { name: 'AbortError' }))
      .mockRejectedValueOnce(new Error('no sheet'));
    await expect(openShareSheet(post())).resolves.toBe('dismissed');
    await expect(openShareSheet(post())).rejects.toThrow('no sheet');
  });
});
