import { fireEvent, render } from '@testing-library/react-native';

import { DEFAULT_AVATAR_COLORS } from '../../provider/theme';
import { avatarColorFor, hashKey } from '../../core/avatarColor';
import KitAvatar from '../KitAvatar';

describe('avatarColorFor', () => {
  it('is stable per key, spread across the palette, and safe on an empty palette', async () => {
    expect(avatarColorFor('u1', DEFAULT_AVATAR_COLORS)).toBe(avatarColorFor('u1', DEFAULT_AVATAR_COLORS));
    const seen = new Set(Array.from({ length: 40 }, (_, i) => avatarColorFor(`user-${i}`, DEFAULT_AVATAR_COLORS)));
    expect(seen.size).toBeGreaterThan(4);
    expect(avatarColorFor('x', [])).toBe('#888888');
    expect(hashKey('')).toBe(hashKey(''));
  });
});

describe('KitAvatar', () => {
  it('draws the initial by code point on the sender\'s colour and reacts to a tap', async () => {
    const onPress = jest.fn();
    const { getByText, getByRole } = await render(<KitAvatar name="🙂 Ona" size={28} colorKey="u2" onPress={onPress} accessibilityLabel="Open profile, Ona" />);
    expect(getByText('🙂')).toBeTruthy();
    await fireEvent.press(getByRole('button', { name: 'Open profile, Ona' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('falls back to the initial when the image fails, and uses the group glyph', async () => {
    const { getByText, queryByText, getByTestId } = await render(<KitAvatar name="Ona" size={28} uri="https://x/dead.jpg" />);
    expect(queryByText('O')).toBeNull();
    await fireEvent(getByTestId('chatuikit-avatar-image'), 'error', { nativeEvent: { error: 'dead' } });
    expect(getByText('O')).toBeTruthy();
    const group = await render(<KitAvatar name="Kursiokai" size={28} group />);
    expect(group.queryByText('K')).toBeNull();
  });
});
