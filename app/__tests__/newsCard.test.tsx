// -----------------------------------------------------------
//  [*] Tests — NewsCard action strip
//
//  The card's footer is the social kit's ActionRow: the like
//  and comment targets carry the feed row's tallies and the
//  kit's stateful Lithuanian spoken names (the default catalog
//  — no app provider mounted), the share target mounts where a
//  sheet exists, and each target reaches its OWN handler — a
//  like or comment tap never fires the card's open-post press,
//  while the title block still does.
// -----------------------------------------------------------

jest.mock('@/services/api', () => ({
  getUploadUrl: (path: string) => `https://api.test/${path.replace(/^\//, '')}`,
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The import chain reaches i18n/index.ts, whose @formatjs
// polyfill imports only Metro can resolve
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { language: 'lt', t: (key: string) => key, changeLanguage: async () => {} },
  deviceLanguage: 'lt',
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'lt' } }),
}));

// Siblings with their own engines and native pieces are
// stood in for — the strip is what this file pins
jest.mock('@/components/news/PollWidget', () => () => null);
jest.mock('@/components/ui', () => ({ Avatar: () => null }));
jest.mock('@/services/format', () => ({ formatDate: () => '2026-09-01' }));
jest.mock('expo-image', () => ({ Image: () => null }));

import { fireEvent, render } from '@testing-library/react-native';

import NewsCard from '@/components/news/NewsCard';
import type { SocialFeedPost } from '@/services/api';


const post: SocialFeedPost = {
  id: 'p1',
  title: 'Fakulteto naujiena',
  content: 'Ilgas įrašo tekstas apie fakulteto gyvenimą.',
  date: '2026-09-01T10:00:00',
  source: 'knf.vu.lt',
  likes: 3,
  comments: 2,
  shares: 1,
};

const makeHandlers = () => ({
  onPress: jest.fn(),
  onToggleLike: jest.fn(),
  onOpenComments: jest.fn(),
  onShare: jest.fn(),
});


describe('NewsCard action strip', () => {

  it('renders the kit strip with the row tallies and stateful spoken names', async () => {
    const r = await render(
      <NewsCard post={post} liked={false} likeCount={3} {...makeHandlers()} />,
    );

    expect(r.getByTestId('socialuikit-action-like').props.accessibilityLabel).toBe('Patinka, 3 patiktukai');
    expect(r.getByTestId('socialuikit-action-comment').props.accessibilityLabel).toBe('2 komentarai');
    expect(r.getByTestId('socialuikit-action-share')).toBeTruthy();

    // The like state is the screen's word, not the row's field
    await r.rerender(<NewsCard post={post} liked likeCount={4} {...makeHandlers()} />);
    expect(r.getByTestId('socialuikit-action-like').props.accessibilityLabel).toBe('Nebepatinka, 4 patiktukai');
  });


  it('routes each target to its own handler, never to the card press', async () => {
    const handlers = makeHandlers();
    const r = await render(<NewsCard post={post} liked={false} likeCount={3} {...handlers} />);

    fireEvent.press(r.getByTestId('socialuikit-action-like'));
    fireEvent.press(r.getByTestId('socialuikit-action-comment'));
    fireEvent.press(r.getByTestId('socialuikit-action-share'));

    expect(handlers.onToggleLike).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenComments).toHaveBeenCalledTimes(1);
    expect(handlers.onShare).toHaveBeenCalledTimes(1);
    expect(handlers.onPress).not.toHaveBeenCalled();

    // The title block is the open-post button
    fireEvent.press(r.getByLabelText('Fakulteto naujiena. news.a11yOpenPost'));
    expect(handlers.onPress).toHaveBeenCalledTimes(1);
  });
});
