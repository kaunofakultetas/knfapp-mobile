// -----------------------------------------------------------
//  [*] Tests — the shared UI primitives' small contracts
//
//  The rules every screen inherits from the kit:
//    - Badge never prints "NaN" (an unread total computed off
//      a missing field) and still collapses past `max`;
//    - SectionTitle is a real heading for rotor navigation;
//    - ErrorState is announced once when it appears;
//    - text-bearing primitives declare the APP language to
//      the screen reader (KNF-129) — a phone in English with
//      the app in Lithuanian read every label with English
//      phonetics;
//    - a Card can announce as an external link, not a button.
// -----------------------------------------------------------

import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import i18n from '@/i18n';
import { Badge, Button, Card, EmptyState, ErrorState, SectionTitle } from '@/components/ui';


jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ scheme: 'light', colors: jest.requireActual('@/constants/theme').palettes.light }),
}));


beforeEach(async () => {
  await i18n.changeLanguage('lt');
});


describe('Badge', () => {
  it('renders nothing for zero, negatives and non-finite counts', async () => {
    for (const count of [0, -3, NaN, Infinity]) {
      const view = await render(<Badge count={count} />);
      expect(view.toJSON()).toBeNull();
      await view.unmount();
    }
  });

  it('collapses past max', async () => {
    await render(<Badge count={250} />);
    expect(screen.getByText('99+')).toBeTruthy();
  });
});


describe('SectionTitle', () => {
  it('is a heading, declared in the app language', async () => {
    await render(<SectionTitle>Kontaktai</SectionTitle>);
    const title = screen.getByText('Kontaktai');
    expect(title.props.accessibilityRole).toBe('header');
    expect(title.props.accessibilityLanguage).toBe('lt');
  });
});


describe('ErrorState', () => {
  it('announces its message once when it appears, and not again on a re-render', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    try {
      const view = await render(<ErrorState message="Nepavyko" onRetry={() => {}} />);
      await view.rerender(<ErrorState message="Nepavyko" onRetry={() => {}} retrying />);
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith('Nepavyko');
    } finally {
      announce.mockRestore();
    }
  });
});


describe('the declared app language', () => {
  it('follows the active language on buttons and empty states', async () => {
    await i18n.changeLanguage('en');
    await render(
      <>
        <Button title="Sign in" onPress={() => {}} />
        <EmptyState icon="newspaper-outline" title="Nothing here" hint="Pull to refresh" />
      </>,
    );
    expect(screen.getByLabelText('Sign in').props.accessibilityLanguage).toBe('en');
    expect(screen.getByText('Nothing here').props.accessibilityLanguage).toBe('en');
    expect(screen.getByText('Pull to refresh').props.accessibilityLanguage).toBe('en');
  });
});


describe('Card', () => {
  it('is a button by default and can announce as an external link', async () => {
    await render(
      <>
        <Card onPress={() => {}} accessibilityLabel="Nustatymai">{null}</Card>
        <Card onPress={() => {}} accessibilityRole="link" accessibilityLabel="VU svetainė" accessibilityHint="Atidaroma naršyklėje">
          {null}
        </Card>
      </>,
    );
    expect(screen.getByLabelText('Nustatymai').props.accessibilityRole).toBe('button');
    const link = screen.getByLabelText('VU svetainė');
    expect(link.props.accessibilityRole).toBe('link');
    expect(link.props.accessibilityHint).toBe('Atidaroma naršyklėje');
  });
});
