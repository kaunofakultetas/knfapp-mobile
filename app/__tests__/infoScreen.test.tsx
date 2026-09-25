// -----------------------------------------------------------
//  [*] Tests — the Info screen, honest in every language
//
//  KNF-124 / KNF-127 / KNF-129 on the client: a programme
//  without a duration renders no blank line, a name kept in
//  another language than the UI's gets that screen-reader
//  voice and the section says so in one line (and only then),
//  the "taught in English" note renders, and external link
//  cards announce as links that leave the app.
// -----------------------------------------------------------

import { render, screen } from '@testing-library/react-native';

import i18n from '@/i18n';
import InfoScreen from '@/app/(main)/info/index';
import { fetchFacultyInfo, type FacultyInfoResponse } from '@/services/api';


// The settings the screen reads — each test sets the language
const mockApp = { language: 'en', hydrated: true, scheme: 'light' as const };

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/context/AppContext', () => ({
  useApp: () => mockApp,
}));
jest.mock('@/context/NetworkContext', () => ({
  showToast: jest.fn(),
  useNetwork: () => ({ isConnected: true }),
}));
jest.mock('@knf/dataengine', () => ({
  useDataEngine: () => ({ cache: { get: jest.fn(async () => null), set: jest.fn(async () => {}) } }),
  useNetworkRestore: () => {},
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('@/services/api', () => ({
  ...jest.requireActual('@/services/api'),
  fetchFacultyInfo: jest.fn(),
}));


// The handbook fetch, answered per test
const mockFetch = fetchFacultyInfo as jest.Mock;

// What GET /api/info?lang=en now serves off the Lithuanian scrape
const englishPayload: FacultyInfoResponse = {
  links: [{ title: 'VU Website', url: 'https://www.vu.lt', icon: 'school' }],
  programs: [
    { name: 'Audiovizualinis vertimas', degree: "Bachelor's", nameLang: 'lt' },
    {
      name: 'Kalba ir dirbtinio intelekto valdymas',
      degree: "Master's",
      duration: '1.5 years',
      note: 'Taught in English',
      nameLang: 'lt',
    },
  ],
};


// The rendered JSON tree toJSON() hands back
type JsonNode = { type: string; children: (JsonNode | string)[] | null } | JsonNode[] | string | null;







// -----------------------------------------------------------
// emptyTexts
// -----------------------------------------------------------
//
// Host Text nodes rendered with nothing inside — each one is a
// blank line on screen
//
// Used by:
//   - the duration test below
// -----------------------------------------------------------

const emptyTexts = (node: JsonNode): number => {
  if (node === null || typeof node === 'string') return 0;
  if (Array.isArray(node)) return node.reduce((sum, child) => sum + emptyTexts(child), 0);
  const own = node.type === 'Text' && (!node.children || node.children.length === 0) ? 1 : 0;
  return own + (node.children ?? []).reduce((sum: number, child) => sum + emptyTexts(child), 0);
};







// -----------------------------------------------------------
// showInfo
// -----------------------------------------------------------
//
// Render the screen in a language over a payload and wait
// for its first programme to land
//
// Used by:
//   - every test below
// -----------------------------------------------------------

const showInfo = async (language: 'lt' | 'en', payload: FacultyInfoResponse) => {
  mockApp.language = language;
  await i18n.changeLanguage(language);
  mockFetch.mockResolvedValueOnce(payload);
  await render(<InfoScreen />);
  await screen.findByText(payload.programs?.[0]?.name ?? '');
};


describe('Info screen', () => {
  beforeEach(() => mockFetch.mockReset());


  it('omits the duration line a programme does not have — no blank row', async () => {
    await showInfo('en', englishPayload);
    expect(screen.getByText('1.5 years')).toBeTruthy();
    // Exactly one duration Text for two programmes — and no
    // empty Text anywhere (the old card rendered {undefined}
    // into a blank third line)
    expect(screen.queryAllByText(/years?$/)).toHaveLength(1);
    expect(emptyTexts(screen.toJSON())).toBe(0);
    expect(screen.getByText('Taught in English')).toBeTruthy();
  });

  it('flags Lithuanian registered names on the English screen, once, with a Lithuanian voice', async () => {
    await showInfo('en', englishPayload);
    expect(screen.getAllByText(i18n.t('info.programNamesNote'))).toHaveLength(1);
    expect(screen.getByText('Audiovizualinis vertimas').props.accessibilityLanguage).toBe('lt');
  });

  it('says nothing and changes no voice when the names are in the UI language', async () => {
    await showInfo('lt', {
      programs: [{ name: 'Audiovizualinis vertimas', degree: 'Bakalauras', duration: '4 metai' }],
    });
    expect(screen.queryByText(i18n.t('info.programNamesNote'))).toBeNull();
    expect(screen.getByText('Audiovizualinis vertimas').props.accessibilityLanguage).toBeUndefined();
  });

  it('announces a link card as a link that leaves the app', async () => {
    await showInfo('en', englishPayload);
    const link = screen.getByLabelText('VU Website');
    expect(link.props.accessibilityRole).toBe('link');
    expect(link.props.accessibilityHint).toBe(i18n.t('info.opensInBrowser'));
  });
});
