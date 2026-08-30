// -----------------------------------------------------------
//  [*] Tests — socialuikit provider
//
//  The seam's promises, pinned: sensible answers with no
//  provider at all, a deep partial theme merged over the
//  scheme's base, a partial label set merged over the locale's
//  defaults, both catalogs carrying the same keys, and the env
//  defaults (identity URL resolver, no-op link opener, the
//  real clock).
// -----------------------------------------------------------

import { renderHook } from '@testing-library/react-native';
import type { ComponentProps, ReactNode } from 'react';

import { defaultLabels } from '../labels';
import { darkTheme, defaultTheme } from '../theme';
import {
  SocialUiKitProvider,
  useKitComponents,
  useKitEnv,
  useKitLabels,
  useKitTheme,
} from '../index';


// One hook reading the whole seam, so each test renders once
const useSeam = () => ({
  theme: useKitTheme(),
  labels: useKitLabels(),
  components: useKitComponents(),
  env: useKitEnv(),
});

const wrap = (props: Omit<ComponentProps<typeof SocialUiKitProvider>, 'children'>) => {
  const Wrapper = ({ children }: { children: ReactNode }) => <SocialUiKitProvider {...props}>{children}</SocialUiKitProvider>;
  return Wrapper;
};




describe('SocialUiKitProvider', () => {

  it('answers the neutral defaults with no provider mounted', async () => {
    const h = await renderHook(() => useSeam());

    expect(h.result.current.theme).toBe(defaultTheme);
    expect(h.result.current.theme.colors.brand).toBe('#7B003F');
    expect(h.result.current.theme.scheme).toBe('light');
    expect(h.result.current.labels).toBe(defaultLabels.lt);
    expect(h.result.current.components).toEqual({});

    expect(h.result.current.env.resolveImageUrl('/uploads/a.jpg')).toBe('/uploads/a.jpg');
    expect(h.result.current.env.openHref('https://knf.vu.lt')).toBeUndefined();
    const before = Date.now();
    expect(h.result.current.env.now().getTime()).toBeGreaterThanOrEqual(before);
  });


  it('deep-merges a partial theme over the light base', async () => {
    const h = await renderHook(() => useSeam(), {
      wrapper: wrap({ theme: { colors: { brand: '#123456' }, radii: { card: 20 } } }),
    });

    expect(h.result.current.theme.colors.brand).toBe('#123456');
    expect(h.result.current.theme.colors.bg).toBe(defaultTheme.colors.bg);
    expect(h.result.current.theme.radii.card).toBe(20);
    expect(h.result.current.theme.radii.pill).toBe(defaultTheme.radii.pill);
    expect(h.result.current.theme.fonts).toEqual(defaultTheme.fonts);
    expect(h.result.current.theme.scheme).toBe('light');
  });


  it("scheme 'dark' swaps the base under the same override", async () => {
    const h = await renderHook(() => useSeam(), {
      wrapper: wrap({ scheme: 'dark', theme: { colors: { brand: '#123456' } } }),
    });

    expect(h.result.current.theme.scheme).toBe('dark');
    expect(h.result.current.theme.colors.brand).toBe('#123456');
    expect(h.result.current.theme.colors.bg).toBe(darkTheme.colors.bg);
    expect(h.result.current.theme.colors.ink).toBe(darkTheme.colors.ink);
  });


  it('merges a partial label set over the chosen locale', async () => {
    const h = await renderHook(() => useSeam(), {
      wrapper: wrap({ locale: 'en', labels: { share: 'Pass it on' } }),
    });

    expect(h.result.current.labels.share).toBe('Pass it on');
    expect(h.result.current.labels.like).toBe('Like');
    expect(h.result.current.labels.newPosts(2)).toBe('2 new posts');
  });


  it('defaults the locale to Lithuanian', async () => {
    const h = await renderHook(() => useSeam(), { wrapper: wrap({}) });

    expect(h.result.current.labels.like).toBe('Patinka');
    expect(h.result.current.labels.signIn).toBe('Prisijungti');
  });


  it('declines Lithuanian counts through all three forms', async () => {
    const lt = defaultLabels.lt;

    expect(lt.newPosts(1)).toBe('1 naujas įrašas');
    expect(lt.newPosts(2)).toBe('2 nauji įrašai');
    expect(lt.newPosts(10)).toBe('10 naujų įrašų');
    // Teens take the 'other' form; x1 past the teens returns to 'one'
    expect(lt.newPosts(11)).toBe('11 naujų įrašų');
    expect(lt.newPosts(21)).toBe('21 naujas įrašas');

    expect(lt.pollVotes(1)).toBe('1 balsas');
    expect(lt.pollVotes(5)).toBe('5 balsai');
    expect(lt.pollVotes(12)).toBe('12 balsų');
  });


  it('carries every label key in both catalogs with matching shapes', async () => {
    const lt = defaultLabels.lt as unknown as Record<string, unknown>;
    const en = defaultLabels.en as unknown as Record<string, unknown>;

    expect(Object.keys(lt).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(lt)) {
      expect(typeof lt[key]).toBe(typeof en[key]);
      if (typeof lt[key] === 'string') {
        expect((lt[key] as string).length).toBeGreaterThan(0);
        expect((en[key] as string).length).toBeGreaterThan(0);
      }
    }
  });


  it('fills only the env functions the host leaves out', async () => {
    const openHref = jest.fn();
    const frozen = new Date(Date.UTC(2026, 7, 30, 12, 0, 0));
    const h = await renderHook(() => useSeam(), {
      wrapper: wrap({ env: { openHref, now: () => frozen } }),
    });

    expect(h.result.current.env.resolveImageUrl('x.png')).toBe('x.png');
    h.result.current.env.openHref('https://knf.vu.lt');
    expect(openHref).toHaveBeenCalledWith('https://knf.vu.lt');
    expect(h.result.current.env.now()).toBe(frozen);
  });


  it('hands the host-swapped components through untouched', async () => {
    const EmptyState = (_props: { label: string }) => null;
    const h = await renderHook(() => useSeam(), {
      wrapper: wrap({ components: { EmptyState } }),
    });

    expect(h.result.current.components.EmptyState).toBe(EmptyState);
    expect(h.result.current.components.Avatar).toBeUndefined();
  });
});
