// -----------------------------------------------------------
//  [*] Tests — components/social/SocialUiKitHost
//
//  The kit speaks the app's language, LIVE (KNF-130): the host
//  once compared activeLocale() — a BCP-47 tag like 'en-GB' —
//  with the bare 'en', which is never equal, so the News,
//  post, comments, profile and activity surfaces stayed
//  Lithuanian whatever the setting. Pinned against a REAL
//  i18next instance behind react-i18next's provider: the kit's
//  catalog and its env locale follow a switch without a
//  remount, in both directions, and the relationship faces
//  and request lines speak the app's FRIENDS vocabulary from
//  the app catalog.
// -----------------------------------------------------------

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    scheme: 'light',
    colors: {
      canvas: '#F5F6F8', surface: '#FFFFFF', ink: '#111827', inkSoft: '#4B5563', inkFaint: '#6B7280',
      line: '#E5E7EB', brand: '#7B003F', brandText: '#7B003F', onBrand: '#FFFFFF', brandSoft: '#F5E4EC',
      accent: '#E0245E', danger: '#DC2626', success: '#16A34A', surfaceSoft: '#F3F4F6', scrim: 'rgba(0,0,0,0.4)',
      shadow: '#000000',
    },
  }),
}));
jest.mock('@/services/api', () => ({ getUploadUrl: (url: string) => url }));
jest.mock('@knf/chatuikit', () => ({ openHref: () => {} }));

import { act, render } from '@testing-library/react-native';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { Text } from 'react-native';

import SocialUiKitHost from '@/components/social/SocialUiKitHost';
import lt from '@/i18n/lt.json';
import en from '@/i18n/en.json';

import { useKitEnv, useKitLabels } from '@knf/socialuikit';







// -----------------------------------------------------------
// KitProbe
// -----------------------------------------------------------
//
// What a kit component reads, as one line of text: the env
// locale, two kit labels and a request line.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function KitProbe() {
  const labels = useKitLabels();
  const env = useKitEnv();
  return <Text testID="probe">{`${env.locale}|${labels.like}|${labels.connect}|${labels.notifConnectRequest('Ona')}`}</Text>;
}







// -----------------------------------------------------------
// mount
// -----------------------------------------------------------
//
// The real host under a REAL i18next instance in the given
// language — the instance comes back for switching.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

async function mount(language: 'lt' | 'en') {
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'lt',
    resources: { lt: { translation: lt }, en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  const view = await render(
    <I18nextProvider i18n={i18n}>
      <SocialUiKitHost>
        <KitProbe />
      </SocialUiKitHost>
    </I18nextProvider>,
  );
  return { i18n, view };
}


describe('SocialUiKitHost', () => {
  it('a cold start in English is English — the kit, its env locale and the friends vocabulary', async () => {
    const { view } = await mount('en');
    expect(view.getByTestId('probe').props.children).toBe('en|Like|Add friend|Ona sent you a friend request');
  });

  it('follows a live switch both ways without a remount', async () => {
    const { i18n, view } = await mount('lt');
    expect(view.getByTestId('probe').props.children).toBe('lt|Patinka|Pridėti draugą|Ona atsiuntė jums draugystės užklausą');

    await act(async () => {
      await i18n.changeLanguage('en');
    });
    expect(view.getByTestId('probe').props.children).toBe('en|Like|Add friend|Ona sent you a friend request');

    await act(async () => {
      await i18n.changeLanguage('lt');
    });
    expect(view.getByTestId('probe').props.children).toBe('lt|Patinka|Pridėti draugą|Ona atsiuntė jums draugystės užklausą');
  });
});
