// -----------------------------------------------------------
//  [*] Tests — app/+not-found
//
//  The catch-all route is a branded empty state, not the Expo
//  template: the brand band names what happened (as a header
//  for screen readers), the body explains it in one line, and
//  the one action REPLACES the dead route with the entry
//  redirect — a push would leave the dead link one back press
//  away.
// -----------------------------------------------------------

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// The REAL EmptyState (and its Button), without the rest of the
// UI barrel — Avatar there drags the whole API client in
jest.mock('@/components/ui', () => ({
  EmptyState: jest.requireActual('@/components/ui/EmptyState').default,
}));

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: mockPush }) }));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      brand: '#7B003F', onBrand: '#FFFFFF', ink: '#111111', inkSoft: '#555555', inkFaint: '#999999',
      surface: '#FFFFFF', surfaceSoft: '#F5F5F5', line: '#DDDDDD', brandSoft: '#F3E0EA',
    },
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) => <View {...props}>{children}</View>,
  };
});

import { fireEvent, render } from '@testing-library/react-native';

// Relative on purpose: under jest the '@/' mapper resolves
// '@/app/…' entries to app.json, not to the route files
import NotFoundScreen from '../app/+not-found';


describe('NotFoundScreen', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
  });

  it('names what happened in the brand band — a header — and explains it in one line', async () => {
    const { getByText } = await render(<NotFoundScreen />);

    expect(getByText('notFound.title').props.accessibilityRole).toBe('header');
    expect(getByText('notFound.heading')).toBeTruthy();
    expect(getByText('notFound.hint')).toBeTruthy();
  });

  it('the button replaces the dead route with the entry redirect — back can never return to it', async () => {
    const { getByText } = await render(<NotFoundScreen />);

    await fireEvent.press(getByText('notFound.action'));
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(mockPush).not.toHaveBeenCalled();
  });
});
