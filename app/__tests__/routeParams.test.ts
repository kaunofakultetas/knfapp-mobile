// -----------------------------------------------------------
//  [*] Tests — useRouteParam + useReturnHref
//
//  The two navigation helpers born from the returnTo bugs:
//  params can be arrays or missing at runtime, and the login
//  round-trip href must carry the query string usePathname
//  strips — encoded, and always starting with '/'.
// -----------------------------------------------------------

const mockRoute = {
  pathname: '/chat-room',
  params: {} as Record<string, string | string[] | undefined>,
};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRoute.params,
  useGlobalSearchParams: () => mockRoute.params,
  usePathname: () => mockRoute.pathname,
}));

import { renderHook } from '@testing-library/react-native';

import { useReturnHref } from '@/hooks/useReturnHref';
import { useRouteParam } from '@/hooks/useRouteParam';


beforeEach(() => {
  mockRoute.pathname = '/chat-room';
  mockRoute.params = {};
});


describe('useRouteParam', () => {
  it('returns a plain string param', async () => {
    mockRoute.params = { postId: 'p7' };
    const { result } = await renderHook(() => useRouteParam('postId'));
    expect(result.current).toBe('p7');
  });

  it('takes the first value of a repeated param', async () => {
    mockRoute.params = { postId: ['p1', 'p2'] };
    const { result } = await renderHook(() => useRouteParam('postId'));
    expect(result.current).toBe('p1');
  });

  it('returns undefined for a missing param', async () => {
    const { result } = await renderHook(() => useRouteParam('postId'));
    expect(result.current).toBeUndefined();
  });
});


describe('useReturnHref', () => {
  it('serialises params back onto the pathname', async () => {
    mockRoute.params = { conversationId: 'abc', type: 'group' };
    const { result } = await renderHook(() => useReturnHref());
    expect(result.current).toBe('/chat-room?conversationId=abc&type=group');
  });

  it('returns the bare pathname when there are no params', async () => {
    const { result } = await renderHook(() => useReturnHref());
    expect(result.current).toBe('/chat-room');
  });

  it('percent-encodes values and repeats array params', async () => {
    mockRoute.params = { q: 'labas rytas', tag: ['a b', 'c'] };
    const { result } = await renderHook(() => useReturnHref());
    expect(result.current).toBe('/chat-room?q=labas%20rytas&tag=a%20b&tag=c');
  });

  it('skips null-ish params and always starts with /', async () => {
    mockRoute.params = { gone: undefined, kept: 'x' };
    const { result } = await renderHook(() => useReturnHref());
    expect(result.current).toBe('/chat-room?kept=x');
    expect(result.current.startsWith('/')).toBe(true);
  });
});
