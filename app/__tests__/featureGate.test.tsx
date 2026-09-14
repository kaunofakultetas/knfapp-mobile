// -----------------------------------------------------------
//  [*] Tests — the route-level shipping gate
//
//  Pins withFeature's whole contract: an enabled flag hands
//  back the screen itself (zero wrapper, zero cost), a
//  disabled one swaps in the not-ready screen and the gated
//  component never MOUNTS — its effects must not run.
// -----------------------------------------------------------

const mockEnabled = jest.fn();
jest.mock('@/services/features', () => ({
  isFeatureEnabled: (feature: string) => mockEnabled(feature),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/components/ui', () => {
  const { Text, View } = require('react-native');
  return {
    Screen: ({ children }: { children?: unknown }) => <View>{children as never}</View>,
    EmptyState: ({ title }: { title: string }) => <Text>{title}</Text>,
  };
});

import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import withFeature from '@/components/FeatureGate';

const mounted = jest.fn();

function RealScreen() {
  mounted();
  return <Text>the real screen</Text>;
}

beforeEach(() => {
  mockEnabled.mockReset();
  mounted.mockReset();
});

describe('withFeature', () => {
  it('an enabled flag returns the component itself', async () => {
    mockEnabled.mockReturnValue(true);
    const Gated = withFeature('chat', RealScreen);
    expect(Gated).toBe(RealScreen);
    const view = await render(<Gated />);
    expect(view.getByText('the real screen')).toBeTruthy();
  });

  it('a disabled flag shows the not-ready screen and never mounts the module', async () => {
    mockEnabled.mockReturnValue(false);
    const Gated = withFeature('chat', RealScreen);
    const view = await render(<Gated />);
    expect(view.getByText('common.featureUnavailableTitle')).toBeTruthy();
    expect(view.queryByText('the real screen')).toBeNull();
    expect(mounted).not.toHaveBeenCalled();
    expect(mockEnabled).toHaveBeenCalledWith('chat');
  });
});
