// -----------------------------------------------------------
//  [*] Tests — components/news/PollWidget
//
//  The widget as a seam between the social engine and the
//  kit: a post without a poll renders nothing, a rejected load
//  shows the retry row and refresh() recovers, a signed-in tap
//  reaches transport.vote and the results face follows the
//  server's answer, and a guest's sign-in hint routes to
//  /login with the current href as returnTo.
// -----------------------------------------------------------

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { SocialEngineProvider, fakeSocialTransport, type Poll } from '@knf/socialengine';
import { SocialUiKitProvider } from '@knf/socialuikit';

import PollWidget from '@/components/news/PollWidget';


jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/hooks/useReturnHref', () => ({ useReturnHref: () => '/news-post?postId=post-1' }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ scheme: 'light', colors: { danger: '#b00020', brand: '#7B003F' } }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

let mockAuthenticated = true;
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: mockAuthenticated }),
}));


const VIEWER = { id: 'u1', displayName: 'Me', avatarUrl: null };

// The KNF adapter keys a poll by its post id — the fixture does too
const makePoll = (over: Partial<Poll> = {}): Poll => ({
  id: 'post-1',
  question: 'Kava ar arbata?',
  options: [
    { id: 'o1', text: 'Kava', voteCount: 2, votedByMe: false },
    { id: 'o2', text: 'Arbata', voteCount: 1, votedByMe: false },
  ],
  answerType: 'single',
  totalVotes: 3,
  voterCount: 3,
  expiresAt: null,
  closed: false,
  votedByMe: false,
  ...over,
});

const wrap = (ui: ReactElement, transport: ReturnType<typeof fakeSocialTransport>, signedIn = true) =>
  render(
    <SocialEngineProvider transport={transport} currentUser={signedIn ? VIEWER : null}>
      <SocialUiKitProvider locale="en">{ui}</SocialUiKitProvider>
    </SocialEngineProvider>,
  );

// RNTL 14 renders and fires asynchronously — the awaits on
// wrap() and fireEvent.press() are the library's contract
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });


beforeEach(() => {
  mockPush.mockReset();
  mockAuthenticated = true;
});


describe('PollWidget', () => {
  it('renders nothing for a post without a poll', async () => {
    const transport = fakeSocialTransport();
    const screen = await wrap(<PollWidget postId="post-1" />, transport);
    await flush();

    expect(transport.calls.map((c) => c.method)).toEqual(['fetchPoll']);
    expect(screen.queryByTestId('socialuikit-poll')).toBeNull();
    expect(screen.queryByText('news.pollLoadError')).toBeNull();
  });

  it('shows the retry row on a failed load and recovers through refresh', async () => {
    const transport = fakeSocialTransport({ polls: [makePoll()] });
    transport.fail('fetchPoll', { status: 500, code: 'server_error' });
    const screen = await wrap(<PollWidget postId="post-1" />, transport);
    await flush();

    expect(screen.queryByTestId('socialuikit-poll')).toBeNull();
    await fireEvent.press(screen.getByText('news.pollLoadError'));
    await flush();

    await waitFor(() => expect(screen.getByTestId('socialuikit-poll')).toBeTruthy());
    expect(screen.queryByText('news.pollLoadError')).toBeNull();
    expect(screen.getByText('Kava ar arbata?')).toBeTruthy();
  });

  it('votes through the transport and shows the results face once the server answers', async () => {
    const transport = fakeSocialTransport({ polls: [makePoll()] });
    const screen = await wrap(<PollWidget postId="post-1" />, transport);
    await flush();

    // Ballot face first — no tallies, the rows are radios
    expect(screen.queryByText('67%')).toBeNull();
    await fireEvent.press(screen.getByTestId('socialuikit-poll-option-o1'));
    await flush();

    expect(transport.calls.map((c) => c.method)).toEqual(['fetchPoll', 'vote']);
    expect(transport.calls[1].args).toEqual(['post-1', ['o1']]);
    // 3 of 4 votes now on o1 — the server's tally, not a local guess
    await waitFor(() => expect(screen.getByText('75%')).toBeTruthy());
  });

  it("routes a guest's sign-in hint to /login with returnTo", async () => {
    mockAuthenticated = false;
    const transport = fakeSocialTransport({ polls: [makePoll()] });
    const screen = await wrap(<PollWidget postId="post-1" />, transport, false);
    await flush();

    await fireEvent.press(screen.getByText('Sign in to vote'));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/login', params: { returnTo: '/news-post?postId=post-1' } });
    expect(transport.calls.map((c) => c.method)).toEqual(['fetchPoll']);
  });
});
