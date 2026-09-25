// -----------------------------------------------------------
//  [*] Tests — the read-only news feed
//
//  A build shipping WITHOUT the social module must serve news
//  as pure reading: the card renders its content but carries
//  no like / comments / share strip. The flag is mocked off
//  for this whole file — the flags-on behavior lives in
//  newsCard.test.tsx, which runs against the real (all-true)
//  features.json.
// -----------------------------------------------------------

jest.mock('@/services/features', () => ({
  isFeatureEnabled: () => false,
}));
// The same seam mocks newsCard.test.tsx uses — the card pulls
// theme/context chains this suite has no business booting
jest.mock('@/services/api', () => ({
  getUploadUrl: (path: string) => `https://api.test/${path.replace(/^\//, '')}`,
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { language: 'lt', t: (key: string) => key, changeLanguage: async () => {} },
  deviceLanguage: 'lt',
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'lt' } }),
}));
jest.mock('@/components/news/PollWidget', () => () => null);
jest.mock('@/components/ui', () => ({ Avatar: () => null }));
// The card's date line (components/news/cardDate) reads the
// stamp through parseIso and formats a today/yesterday time
jest.mock('@/services/format', () => ({
  formatDate: () => '2026-09-01',
  formatTime: () => '10:00',
  parseIso: (iso: string) => new Date(iso),
}));
jest.mock('expo-image', () => ({ Image: () => null }));

import { render } from '@testing-library/react-native';

import NewsCard from '@/components/news/NewsCard';
import type { SocialFeedPost } from '@/services/api/social';

// One scraped faculty article in the wire shape the card takes
const post = {
  id: 'p1',
  title: 'Fakulteto naujiena',
  content: 'Tekstas apie fakultetą.',
  imageUrl: null,
  createdAt: '2026-09-14T10:00:00Z',
  postType: 'news',
  source: 'knf.vu.lt',
  sourceUrl: null,
  author: null,
  likes: 3,
  likedByMe: false,
  comments: 2,
  shares: 1,
} as unknown as SocialFeedPost;

describe('the read-only feed', () => {
  it('a social-less build renders the card without the action strip', async () => {
    const view = await render(
      <NewsCard
        post={post}
        liked={false}
        likeCount={3}
        onPress={jest.fn()}
        onToggleLike={jest.fn()}
        onOpenComments={jest.fn()}
        onShare={jest.fn()}
      />,
    );
    expect(view.getByText('Fakulteto naujiena')).toBeTruthy();
    expect(view.queryByTestId('socialuikit-action-like')).toBeNull();
    expect(view.queryByTestId('socialuikit-action-comment')).toBeNull();
    expect(view.queryByTestId('socialuikit-action-share')).toBeNull();
  });
});
