// -----------------------------------------------------------
//  [*] Tests — wayfinduikit provider
//
//  The seam's promises, pinned: sensible answers with no
//  provider at all, a deep partial theme merged over the
//  scheme's base, a partial label set merged over the locale's
//  defaults, both catalogs carrying the same FINAL key list
//  with matching shapes, and the env defaults (identity URL
//  resolver, the real clock, the resolved locale).
// -----------------------------------------------------------

import { renderHook } from '@testing-library/react-native';
import type { ComponentProps, ReactNode } from 'react';

import { defaultLabels } from '../labels';
import { darkTheme, defaultTheme, resolveTheme } from '../theme';
import { WayfindUiKitProvider, useKitEnv, useKitLabels, useKitTheme } from '../index';


// One hook reading the whole seam, so each test renders once
const useSeam = () => ({
  theme: useKitTheme(),
  labels: useKitLabels(),
  env: useKitEnv(),
});

const wrap = (props: Omit<ComponentProps<typeof WayfindUiKitProvider>, 'children'>) => {
  const Wrapper = ({ children }: { children: ReactNode }) => <WayfindUiKitProvider {...props}>{children}</WayfindUiKitProvider>;
  return Wrapper;
};


// The label list is final: a later component may read any of
// these and none other. Order here is alphabetical for the diff
const FINAL_LABEL_KEYS = [
  'accessibleRoute', 'allRooms', 'arrive', 'arriveSide', 'avoidStairs', 'back', 'clearSearch', 'continueFor', 'depart', 'done',
  'endRoute', 'floor', 'floorA11y', 'floorSwitcherA11y', 'hudA11y', 'hudProgress', 'hudRollHint', 'kilometers', 'lessThanMinute', 'markerA11y', 'markerAligned', 'meters',
  'minutes', 'nearestExit', 'nearestWc', 'next', 'noResults', 'offRoute', 'pickLocation', 'planA11y', 'previewImageA11y',
  'reassurance', 'remaining', 'rerouting', 'routeOnPlanA11y', 'routeTo', 'scanQr', 'searchPlaceholder', 'searchResults',
  'shortestRoute', 'slightLeft', 'slightRight', 'stageA11y', 'stageHint360', 'start', 'stepOf', 'stepsHide', 'stepsShow',
  'takeElevatorDown', 'takeElevatorUp', 'takeRamp', 'takeStairsDown', 'takeStairsUp', 'throughDoor', 'title', 'turnLeft',
  'turnRight', 'turnTowards', 'uTurn', 'whereTo', 'whereToHint', 'youAreHere', 'youAreHereA11y', 'youAreIn', 'zoomIn', 'zoomOut',
];




describe('WayfindUiKitProvider', () => {

  it('answers the neutral defaults with no provider mounted', async () => {
    const h = await renderHook(() => useSeam());

    expect(h.result.current.theme).toBe(defaultTheme);
    expect(h.result.current.theme.colors.brand).toBe('#7B003F');
    expect(h.result.current.theme.scheme).toBe('light');
    expect(h.result.current.labels).toBe(defaultLabels.lt);

    expect(h.result.current.env.resolveImageUrl('/plans/level-1.png')).toBe('/plans/level-1.png');
    expect(h.result.current.env.locale).toBe('lt');
    const before = Date.now();
    expect(h.result.current.env.now().getTime()).toBeGreaterThanOrEqual(before);
  });


  it('draws the route in the brand and arrival in green, in both schemes', async () => {
    expect(defaultTheme.colors.route).toBe(defaultTheme.colors.brand);
    expect(defaultTheme.colors.success).toBe('#16A34A');
    expect(darkTheme.colors.route).toBe(darkTheme.colors.brand);
    expect(darkTheme.scheme).toBe('dark');

    // The two schemes carry the same token set — no colour
    // exists in one and not the other
    expect(Object.keys(darkTheme.colors).sort()).toEqual(Object.keys(defaultTheme.colors).sort());
    expect(darkTheme.fonts).toEqual(defaultTheme.fonts);
    expect(darkTheme.radii).toEqual(defaultTheme.radii);
  });


  it('deep-merges a partial theme over the light base', async () => {
    const h = await renderHook(() => useSeam(), {
      wrapper: wrap({ theme: { colors: { route: '#123456' }, radii: { card: 20 } } }),
    });

    expect(h.result.current.theme.colors.route).toBe('#123456');
    expect(h.result.current.theme.colors.brand).toBe(defaultTheme.colors.brand);
    expect(h.result.current.theme.colors.plan).toBe(defaultTheme.colors.plan);
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
    expect(h.result.current.theme.colors.stageBg).toBe(darkTheme.colors.stageBg);
    // The route is the dark base's, not the overridden brand —
    // the two are equal by convention, never bound
    expect(h.result.current.theme.colors.route).toBe(darkTheme.colors.route);
  });


  it('resolveTheme hands the base back untouched without an override', async () => {
    expect(resolveTheme(defaultTheme)).toBe(defaultTheme);
    expect(resolveTheme(darkTheme, { scheme: 'light' }).scheme).toBe('light');
    expect(resolveTheme(darkTheme, { fonts: { bold: 'Inter-Bold' } }).fonts).toEqual({ ...darkTheme.fonts, bold: 'Inter-Bold' });
  });


  it('leaves the base token in place under an explicit undefined at any depth of the theme', async () => {
    // Top level: a host's `scheme: config.scheme` with the option
    // unset must not blank the branch it sits in
    const top = resolveTheme(darkTheme, { scheme: undefined, colors: undefined, fonts: undefined, radii: undefined });
    expect(top.scheme).toBe('dark');
    expect(top.colors).toEqual(darkTheme.colors);
    expect(top.fonts).toEqual(darkTheme.fonts);
    expect(top.radii).toEqual(darkTheme.radii);

    // Inside a branch: the unset token falls through, the set
    // one beside it still lands
    const inner = resolveTheme(defaultTheme, { colors: { brand: undefined, route: '#123456' }, radii: { card: undefined }, fonts: { bold: undefined } });
    expect(inner.colors.brand).toBe('#7B003F');
    expect(inner.colors.route).toBe('#123456');
    expect(inner.radii.card).toBe(defaultTheme.radii.card);
    expect(inner.fonts.bold).toBe(defaultTheme.fonts.bold);

    // And through the provider, where a host actually hands it in
    const h = await renderHook(() => useSeam(), {
      wrapper: wrap({ theme: { colors: { brand: undefined } } }),
    });
    expect(h.result.current.theme.colors.brand).toBe('#7B003F');
  });


  it('merges a partial label set over the chosen locale', async () => {
    const h = await renderHook(() => useSeam(), {
      wrapper: wrap({ locale: 'en', labels: { whereTo: 'Where are you headed?' } }),
    });

    expect(h.result.current.labels.whereTo).toBe('Where are you headed?');
    expect(h.result.current.labels.start).toBe('Start');
    expect(h.result.current.labels.stepOf(2, 5)).toBe('Step 2 of 5');
  });


  it('lets an explicit undefined in the label override fall through to the default', async () => {
    const h = await renderHook(() => useSeam(), {
      wrapper: wrap({ labels: { start: undefined, next: 'Pirmyn' } }),
    });

    expect(h.result.current.labels.start).toBe('Pradėti');
    expect(h.result.current.labels.next).toBe('Pirmyn');
  });


  it('defaults the locale to Lithuanian', async () => {
    const h = await renderHook(() => useSeam(), { wrapper: wrap({}) });

    expect(h.result.current.labels).toBe(defaultLabels.lt);
    expect(h.result.current.labels.whereTo).toBe('Kur einate?');
    expect(h.result.current.env.locale).toBe('lt');
  });


  it('declines Lithuanian counts through all three forms', async () => {
    const lt = defaultLabels.lt;

    expect(lt.searchResults(1)).toBe('Rastas 1 rezultatas');
    expect(lt.searchResults(2)).toBe('Rasti 2 rezultatai');
    expect(lt.searchResults(10)).toBe('Rasta 10 rezultatų');
    // Teens take the 'other' form; x1 past the teens returns to 'one'
    expect(lt.searchResults(11)).toBe('Rasta 11 rezultatų');
    expect(lt.searchResults(21)).toBe('Rastas 21 rezultatas');
    expect(lt.searchResults(0)).toBe('Rasta 0 rezultatų');

    expect(lt.minutes(1)).toBe('1 minutė');
    expect(lt.minutes(5)).toBe('5 minutės');
    expect(lt.minutes(12)).toBe('12 minučių');

    expect(defaultLabels.en.minutes(1)).toBe('1 minute');
    expect(defaultLabels.en.minutes(2)).toBe('2 minutes');
  });


  it('writes kilometres with the locale decimal separator', async () => {
    expect(defaultLabels.lt.kilometers(1.2)).toBe('1,2 km');
    expect(defaultLabels.lt.kilometers(1)).toBe('1,0 km');
    expect(defaultLabels.en.kilometers(1.2)).toBe('1.2 km');
    expect(defaultLabels.en.kilometers(1)).toBe('1.0 km');
  });


  it('reads the direction marker offset as a side, never as a signed number', async () => {
    const { lt, en } = defaultLabels;

    expect(lt.markerA11y(0)).toBe('Maršrutas tiesiai priešais');
    expect(lt.markerA11y(0.3)).toBe('Maršrutas tiesiai priešais');
    expect(lt.markerA11y(42.4)).toBe('Maršrutas 42° dešiniau');
    expect(lt.markerA11y(-15)).toBe('Maršrutas 15° kairiau');
    expect(lt.markerA11y(Number.NaN)).toBe('Maršrutas tiesiai priešais');

    expect(en.markerA11y(0)).toBe('Route straight ahead');
    expect(en.markerA11y(90)).toBe('Route 90° to the right');
    expect(en.markerA11y(-90)).toBe('Route 90° to the left');
  });


  it('names the arrival side with the room as the subject', async () => {
    const { lt, en } = defaultLabels;

    expect(lt.arriveSide('114', 'left')).toBe('114 yra kairėje');
    expect(lt.arriveSide('114', 'right')).toBe('114 yra dešinėje');
    expect(lt.arriveSide('114', 'ahead')).toBe('114 yra tiesiai priešais');
    expect(en.arriveSide('114', 'left')).toBe('114 is on your left');
    expect(en.arriveSide('114', 'right')).toBe('114 is on your right');
    expect(en.arriveSide('114', 'ahead')).toBe('114 is straight ahead');

    expect(lt.floorA11y('2 aukštas', true)).toBe('2 aukštas, pasirinktas');
    expect(lt.floorA11y('2 aukštas', false)).toBe('2 aukštas');
    expect(en.floorA11y('Floor 2', true)).toBe('Floor 2, selected');
  });


  it('carries exactly the final key list in both catalogs with matching shapes', async () => {
    const lt = defaultLabels.lt as unknown as Record<string, unknown>;
    const en = defaultLabels.en as unknown as Record<string, unknown>;

    expect(Object.keys(lt).sort()).toEqual(FINAL_LABEL_KEYS);
    expect(Object.keys(en).sort()).toEqual(FINAL_LABEL_KEYS);
    for (const key of FINAL_LABEL_KEYS) {
      expect(typeof lt[key]).toBe(typeof en[key]);
      if (typeof lt[key] === 'string') {
        expect((lt[key] as string).length).toBeGreaterThan(0);
        expect((en[key] as string).length).toBeGreaterThan(0);
      } else {
        // Same arity, so a component calling one catalog calls
        // the other identically
        expect((lt[key] as (...args: unknown[]) => string).length).toBe((en[key] as (...args: unknown[]) => string).length);
      }
    }
  });


  it('fills only the env functions the host leaves out and carries the resolved locale', async () => {
    const frozen = new Date(Date.UTC(2026, 8, 1, 12, 0, 0));
    const h = await renderHook(() => useSeam(), {
      wrapper: wrap({ locale: 'en', env: { resolveImageUrl: (url) => `https://cdn.example/${url}`, now: () => frozen } }),
    });

    expect(h.result.current.env.resolveImageUrl('pano/1.jpg')).toBe('https://cdn.example/pano/1.jpg');
    expect(h.result.current.env.now()).toBe(frozen);
    expect(h.result.current.env.locale).toBe('en');
  });


  it('never lets an explicit undefined in env shadow a default', async () => {
    const h = await renderHook(() => useSeam(), {
      wrapper: wrap({ env: { resolveImageUrl: undefined, now: undefined } }),
    });

    expect(h.result.current.env.resolveImageUrl('x.png')).toBe('x.png');
    expect(h.result.current.env.now()).toBeInstanceOf(Date);
    expect(h.result.current.env.locale).toBe('lt');
  });
});
