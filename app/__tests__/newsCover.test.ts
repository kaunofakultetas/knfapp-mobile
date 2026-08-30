// -----------------------------------------------------------
//  [*] Tests — NewsCard cover defence
//
//  resolveCoverUri rules: own uploads resolve against the API
//  origin; scraped knf.vu.lt / vu.lt articles may point
//  anywhere under the university domain (newshub.vu.lt hosts
//  the VU covers); foreign hosts, lookalike domains and user
//  posts with absolute URLs render no image at all.
// -----------------------------------------------------------

jest.mock('@/services/api', () => ({
  getUploadUrl: (path: string) => `https://api.test/${path.replace(/^\//, '')}`,
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The NewsCard import chain reaches i18n/index.ts, whose
// @formatjs polyfill imports only Metro can resolve
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { language: 'lt', t: (key: string) => key, changeLanguage: async () => {} },
  deviceLanguage: 'lt',
}));

import { resolveCoverUri } from '@/components/news/NewsCard';


const post = (imageUrl: string | null, source: string) =>
  ({ id: 'p1', imageUrl, source }) as never;


describe('resolveCoverUri', () => {
  it('resolves own uploads against the API origin', () => {
    expect(resolveCoverUri(post('/api/uploads/a.jpg', 'user'))).toBe(
      'https://api.test/api/uploads/a.jpg',
    );
  });

  it('passes university-hosted covers for scraped articles', () => {
    expect(resolveCoverUri(post('https://newshub.vu.lt/x.jpg', 'vu.lt'))).toBe(
      'https://newshub.vu.lt/x.jpg',
    );
    expect(resolveCoverUri(post('https://www.knf.vu.lt/y.png', 'knf.vu.lt'))).toBe(
      'https://www.knf.vu.lt/y.png',
    );
    expect(resolveCoverUri(post('https://vu.lt/z.jpg', 'vu.lt'))).toBe('https://vu.lt/z.jpg');
  });

  it('refuses foreign and lookalike hosts', () => {
    expect(resolveCoverUri(post('https://evil.example/px.png', 'vu.lt'))).toBeNull();
    expect(resolveCoverUri(post('https://evilvu.lt/px.png', 'vu.lt'))).toBeNull();
  });

  it('refuses absolute URLs on user posts', () => {
    expect(resolveCoverUri(post('https://newshub.vu.lt/x.jpg', 'user'))).toBeNull();
  });

  it('returns null for missing images', () => {
    expect(resolveCoverUri(post(null, 'vu.lt'))).toBeNull();
  });
});
