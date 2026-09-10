// -----------------------------------------------------------
//  [*] Tests — the assistant tab over the real stub runtime
//
//  The seams the wiring promises: the screen mounts the REAL
//  kit thread under the REAL engine local runtime with the
//  REAL stub adapter (only its two test seams are fixed — the
//  reply index and a zero pause), a send lands exactly one
//  user and one assistant message whose text is the pinned
//  pool reply, that reply arrives THROUGH markdown (the bold
//  opener is a bolded segment), a suggestion chip sends its
//  prompt as the user turn, and the shared roster carries the
//  assistant entry with its glyph pair right after schedule.
//  Chrome (Screen/Header/theme/i18n) is mocked the way the
//  schedule screen's suite mocks it — those seams are pinned
//  by their own suites.
// -----------------------------------------------------------

// Imports sit ABOVE the mock blocks (jest hoists every
// jest.mock above them anyway) so the lint's import order and
// the runtime order agree
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import AssistantScreen from '@/app/(main)/tabs/assistant';
import { TABS } from '@/constants/tabs';
import { ASSISTANT_STUB_REPLIES } from '@/services/assistantStub';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'lt' },
  }),
}));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    scheme: 'light',
    colors: {
      brand: '#7B003F', onBrand: '#FFF', ink: '#111', inkSoft: '#666', inkFaint: '#999',
      surface: '#FFF', surfaceSoft: '#EEE', line: '#DDD', danger: '#C00',
    },
  }),
}));

jest.mock('@/components/ui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a mock factory runs before the module graph loads; only require() can reach the primitives
  const { Text, View } = require('react-native');
  return {
    Screen: ({ children }: { children?: unknown }) => <View>{children as never}</View>,
    Header: ({ title }: { title: string }) => <Text>{title}</Text>,
  };
});

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-linking', () => ({ openURL: jest.fn(async () => {}) }));

// The REAL stub with its two test seams fixed: always the pool's
// first reply, and no inter-word pauses — the suite streams the
// same markdown the app does, just deterministically and now
jest.mock('@/services/assistantStub', () => {
  const actual = jest.requireActual<typeof import('@/services/assistantStub')>('@/services/assistantStub');
  return {
    ...actual,
    createAssistantStubAdapter: (deps: Parameters<typeof actual.createAssistantStubAdapter>[0]) =>
      actual.createAssistantStubAdapter({ ...deps, pick: () => 0, delayMs: 0 }),
  };
});

// The reply every run streams under the fixed pick — the
// mocked i18n stays 'lt', so it is the Lithuanian pool's first
const FIXED_REPLY = ASSISTANT_STUB_REPLIES.lt[0];

type View = Awaited<ReturnType<typeof render>>;

// The last words of the fixed reply close its final bullet —
// once that whole line reads, the stream has fully landed
const settled = (view: View) =>
  waitFor(() => expect(view.getByText('Studijų tvarka ir dokumentai')).toBeTruthy());


describe('the assistant screen', () => {
  it('mounts the thread, the composer and the three suggestion chips', async () => {
    const view = await render(<AssistantScreen />);

    expect(view.getByText('assistant.title')).toBeTruthy();
    expect(view.getByTestId('assistantuikit-thread')).toBeTruthy();
    expect(view.getByTestId('assistantuikit-composer-input')).toBeTruthy();
    expect(view.getByTestId('assistantuikit-composer-send')).toBeTruthy();
    expect(view.getByTestId('assistantuikit-suggestion-0')).toBeTruthy();
    expect(view.getByTestId('assistantuikit-suggestion-1')).toBeTruthy();
    expect(view.getByTestId('assistantuikit-suggestion-2')).toBeTruthy();
    expect(view.queryByTestId('assistantuikit-suggestion-3')).toBeNull();
  });

  it('a send lands exactly one user and one assistant message carrying the fixed reply', async () => {
    const view = await render(<AssistantScreen />);

    await fireEvent.changeText(view.getByTestId('assistantuikit-composer-input'), 'Kada paskaitos?');
    await fireEvent.press(view.getByTestId('assistantuikit-composer-send'));
    await settled(view);

    expect(view.getAllByTestId('assistantuikit-message-user')).toHaveLength(1);
    expect(view.getAllByTestId('assistantuikit-message-assistant')).toHaveLength(1);
    expect(view.getByText('Kada paskaitos?')).toBeTruthy();

    // The whole pinned reply, block by block: the opening
    // paragraph (bold folded into the composed text) and every
    // bullet — the last one is what settled() already waited on
    expect(FIXED_REPLY.startsWith('**Sveiki!**')).toBe(true);
    expect(
      view.getByText(
        'Sveiki! Aš — fakulteto pagalbininkas. Kol kas atsakau iš anksto paruoštais tekstais, bet jau galiu parodyti, apie ką kalbėsimės:',
      ),
    ).toBeTruthy();
    expect(view.getByText('Paskaitų tvarkaraščiai ir auditorijos')).toBeTruthy();
    expect(view.getByText('Fakulteto naujienos ir renginiai')).toBeTruthy();

    // Idle again — the composer offers Send, not Cancel
    expect(view.getByTestId('assistantuikit-composer-send')).toBeTruthy();
    expect(view.queryByTestId('assistantuikit-composer-cancel')).toBeNull();
  });

  it('the reply renders through markdown — the bold opener is a bolded segment', async () => {
    const view = await render(<AssistantScreen />);

    await fireEvent.changeText(view.getByTestId('assistantuikit-composer-input'), 'Labas');
    await fireEvent.press(view.getByTestId('assistantuikit-composer-send'));
    await settled(view);

    expect(view.getByText('Sveiki!')).toHaveStyle({ fontWeight: '700' });
  });

  it('a suggestion chip sends its PROMPT as the user turn', async () => {
    const view = await render(<AssistantScreen />);

    await fireEvent.press(view.getByTestId('assistantuikit-suggestion-0'));
    await settled(view);

    // The mocked t answers keys, so the prompt key IS the text
    expect(view.getAllByTestId('assistantuikit-message-user')).toHaveLength(1);
    expect(view.getByText('assistant.suggestionSchedulePrompt')).toBeTruthy();
    expect(view.getAllByTestId('assistantuikit-message-assistant')).toHaveLength(1);
  });
});


describe('the shared tab roster', () => {
  it('carries the assistant surface with the sparkles glyph pair, unpinned, after schedule', () => {
    const entry = TABS.find((tab) => tab.key === 'assistant');

    expect(entry).toMatchObject({
      key: 'assistant',
      icon: 'sparkles-outline',
      iconFilled: 'sparkles',
      route: '/(main)/tabs/assistant',
      hardPinned: false,
    });
    expect(TABS.findIndex((tab) => tab.key === 'assistant')).toBe(
      TABS.findIndex((tab) => tab.key === 'schedule') + 1,
    );
  });
});
