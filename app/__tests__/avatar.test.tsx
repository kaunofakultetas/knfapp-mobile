// -----------------------------------------------------------
//  [*] Tests — the Avatar primitive
//
//  The portrait asks for the server's small derivative when
//  the disc is small enough for it (KNF-136) and keeps the
//  decoded image in expo-image's memory cache (KNF-189); the
//  no-photo initial is decorative — hidden from screen
//  readers and fixed in size, since the disc cannot grow with
//  a scaled letter — and survives a payload with no name.
// -----------------------------------------------------------

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import Avatar from '@/components/ui/Avatar';
import { API_BASE_URL } from '@/services/api';


jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// A host stand-in that keeps every prop assertable
jest.mock('expo-image', () => {
  const { View } = jest.requireActual('react-native');
  return { Image: (props: Record<string, unknown> & { children?: ReactNode }) => <View testID="avatar-photo" {...props} /> };
});


// A stored upload's uuid part — the shape the thumb URL needs
const stored = '0123456789abcdef0123456789abcdef';


describe('Avatar', () => {
  it('a small disc requests the derivative and caches it in memory too', async () => {
    await render(<Avatar uri={`/api/uploads/${stored}.jpg`} name="Ona" size={40} />);
    const photo = screen.getByTestId('avatar-photo');
    expect(photo.props.source).toEqual({ uri: `${API_BASE_URL}/uploads/${stored}.jpg?s=thumb` });
    expect(photo.props.cachePolicy).toBe('memory-disk');
    // Recycling keys on the STORED path, whatever size is fetched
    expect(photo.props.recyclingKey).toBe(`/api/uploads/${stored}.jpg`);
  });

  it('a disc wider than the derivative keeps the original', async () => {
    await render(<Avatar uri={`/api/uploads/${stored}.jpg`} name="Ona" size={400} />);
    expect(screen.getByTestId('avatar-photo').props.source).toEqual({
      uri: `${API_BASE_URL}/uploads/${stored}.jpg`,
    });
  });

  it('the initial is decorative: hidden from screen readers, never font-scaled', async () => {
    await render(<Avatar name="žydrūnė" size={40} />);
    const letter = screen.getByText('Ž', { includeHiddenElements: true });
    expect(letter.props.allowFontScaling).toBe(false);
    expect(screen.queryByText('Ž')).toBeNull();
  });

  it('a payload with no name still renders a disc, never a crash', async () => {
    await render(<Avatar name={undefined as unknown as string} />);
    expect(screen.getByText('?', { includeHiddenElements: true })).toBeTruthy();
  });
});
