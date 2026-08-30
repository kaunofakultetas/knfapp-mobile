// -----------------------------------------------------------
//  [*] Tests — socialuikit LinkCard
//
//  The preview's three faces, pinned: large when the unfurler
//  found an image, compact on text only, one minimal line on a
//  bare url+title; the site line preferring siteName with the
//  www-stripped hostname as fallback; and the tap going to the
//  host's onPress when given, else to env.openHref — never
//  both.
// -----------------------------------------------------------

import { fireEvent, render } from '@testing-library/react-native';

import type { KitLinkPreview } from '../../core/types';
import { SocialUiKitProvider } from '../../provider';
import LinkCard from '../LinkCard';


const base: KitLinkPreview = {
  url: 'https://www.example.org/x',
  title: 'Straipsnis apie fakultetą',
  description: 'Trumpas aprašymas',
  siteName: 'Example',
  imageUrl: '/uploads/preview.jpg',
};




describe('LinkCard', () => {

  it('switches variants on what the preview carries', async () => {
    const large = await render(<LinkCard link={base} />);
    expect(large.getByTestId('socialuikit-link-image')).toBeTruthy();
    expect(large.queryByTestId('socialuikit-link-thumb')).toBeNull();
    expect(large.getByText('Trumpas aprašymas').props.numberOfLines).toBe(2);
    expect(large.getByText('Straipsnis apie fakultetą').props.numberOfLines).toBe(2);

    const compact = await render(<LinkCard link={{ ...base, imageUrl: null }} />);
    expect(compact.getByTestId('socialuikit-link-thumb')).toBeTruthy();
    expect(compact.queryByTestId('socialuikit-link-image')).toBeNull();

    const minimal = await render(<LinkCard link={{ url: base.url, title: base.title }} />);
    expect(minimal.getByTestId('socialuikit-link-minimal')).toBeTruthy();
    expect(minimal.queryByTestId('socialuikit-link-image')).toBeNull();
    expect(minimal.queryByTestId('socialuikit-link-thumb')).toBeNull();
    expect(minimal.getByText(base.title).props.numberOfLines).toBe(1);

    // Every face is the same card to a test harness
    expect(minimal.getByTestId('socialuikit-link-card')).toBeTruthy();
  });


  it('falls back to the hostname stripped of www., spoken as site — title', async () => {
    const r = await render(<LinkCard link={{ url: 'https://www.example.org/x', title: 'T', description: 'd' }} />);

    expect(r.getByText('example.org')).toBeTruthy();
    expect(r.getByLabelText('example.org — T')).toBeTruthy();

    // siteName wins over the hostname when the unfurler had one
    const named = await render(<LinkCard link={base} />);
    expect(named.getByText('Example')).toBeTruthy();
    expect(named.getByLabelText('Example — Straipsnis apie fakultetą')).toBeTruthy();
  });


  it('opens through env.openHref when the host gave no handler', async () => {
    const openHref = jest.fn();
    const r = await render(
      <SocialUiKitProvider env={{ openHref }}>
        <LinkCard link={base} />
      </SocialUiKitProvider>,
    );

    await fireEvent.press(r.getByTestId('socialuikit-link-card'));
    expect(openHref).toHaveBeenCalledWith(base.url);
  });


  it('a host handler takes the tap whole', async () => {
    const openHref = jest.fn();
    const onPress = jest.fn();
    const r = await render(
      <SocialUiKitProvider env={{ openHref }}>
        <LinkCard link={base} onPress={onPress} />
      </SocialUiKitProvider>,
    );

    await fireEvent.press(r.getByTestId('socialuikit-link-card'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(openHref).not.toHaveBeenCalled();
  });
});
