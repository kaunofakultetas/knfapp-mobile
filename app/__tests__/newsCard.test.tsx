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

// This suite pins its module's BEHAVIOR, so the shipping
// flags are pinned all-on — the real features.json (whatever
// the current release preset says) must never decide whether
// these tests see their subject
jest.mock('@/services/features', () => {
  const { TABS } = require('@/constants/tabs');
  return {
    isFeatureEnabled: () => true,
    FEATURES: { accounts: true, news: true, chat: true, social: true, schedule: true, assistant: true, studentId: true, map: true },
    ENABLED_TABS: TABS,
    ENABLED_TAB_KEYS: new Set(TABS.map((tab: { key: string }) => tab.key)),
    TAB_FEATURES: {},
  };
});

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
jest.mock('@/services/format', () => ({
  formatDate: () => '2026-09-01',
  formatTime: () => '10:00',
  parseIso: (iso: string) => new Date(iso),
}));
jest.mock('expo-image', () => ({ Image: () => null }));

import { fireEvent, render } from '@testing-library/react-native';

import NewsCard from '@/components/news/NewsCard';
import type { SocialFeedPost } from '@/services/api';


// One scraped faculty article, the row every case starts from
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







// -----------------------------------------------------------
// makeHandlers
// -----------------------------------------------------------
//
// A fresh set of the card's four handlers, each a spy.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

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

    // Awaited: RNTL 14's fireEvent is async, and an un-awaited
    // press leaves an act() open that blanks the NEXT test's
    // render (overlapping act calls)
    await fireEvent.press(r.getByTestId('socialuikit-action-like'));
    await fireEvent.press(r.getByTestId('socialuikit-action-comment'));
    await fireEvent.press(r.getByTestId('socialuikit-action-share'));

    expect(handlers.onToggleLike).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenComments).toHaveBeenCalledTimes(1);
    expect(handlers.onShare).toHaveBeenCalledTimes(1);
    expect(handlers.onPress).not.toHaveBeenCalled();

    // The title block is the open-post button
    await fireEvent.press(r.getByLabelText('Fakulteto naujiena. news.a11yOpenPost'));
    expect(handlers.onPress).toHaveBeenCalledTimes(1);
  });
});







// -----------------------------------------------------------
// textNodes
// -----------------------------------------------------------
//
// How many rendered Text nodes carry exactly this string. The
// title sits inside the labelled open-post button, which the
// text queries treat as one accessibility element, so the
// rendered tree is walked directly.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const textNodes = (tree: unknown, text: string): number => {
  if (!tree || typeof tree !== 'object') return 0;
  if (Array.isArray(tree)) return tree.reduce<number>((sum, child) => sum + textNodes(child, text), 0);
  const node = tree as { type?: string; children?: unknown[] | null };
  const own = node.type === 'Text' && node.children?.length === 1 && node.children[0] === text ? 1 : 0;
  return own + textNodes(node.children ?? [], text);
};


describe('NewsCard text', () => {
  it("an untitled post prints its words once — the title, no teaser repeating it", async () => {
    const short = 'Gal kas žinote, iki kada šiandien dirba biblioteka? 📚🙏';
    const r = await render(
      <NewsCard post={{ ...post, source: 'user', title: short, content: short, summary: short }} liked={false} likeCount={0} {...makeHandlers()} />,
    );
    expect(textNodes(r.toJSON(), short)).toBe(1);
  });

  it('a real title keeps its teaser', async () => {
    const r = await render(
      <NewsCard post={{ ...post, source: 'user', title: 'Rastas USB raktas', content: 'Radau jį 305 auditorijoje.', summary: 'Radau jį 305 auditorijoje.' }} liked={false} likeCount={0} {...makeHandlers()} />,
    );
    const tree = r.toJSON();
    expect(textNodes(tree, 'Rastas USB raktas')).toBe(1);
    expect(textNodes(tree, 'Radau jį 305 auditorijoje.')).toBe(1);
  });
});
