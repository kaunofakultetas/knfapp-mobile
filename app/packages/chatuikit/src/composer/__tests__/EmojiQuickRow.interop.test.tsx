// -----------------------------------------------------------
//  [*] Tests — the emoji row survives the DEVICE style path
//
//  NativeWind's JSX runtime registers Pressable with its css
//  interop, which rebuilds `style` from its own rules — and a
//  style FUNCTION has none, so on device the whole object
//  (the 44pt box, centring, radius, pressed wash) was dropped
//  while jest, which skips the registration under NODE_ENV
//  test, rendered it fine (KNF-096). This file installs the
//  registration by hand, so it tests what the phone runs; a
//  source scan then keeps the banned form out of the whole
//  chat territory.
// -----------------------------------------------------------

// The device path — jest skips this require (NODE_ENV === 'test')
require('react-native-css-interop/dist/runtime/components');

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import EmojiQuickRow from '../EmojiQuickRow';







// -----------------------------------------------------------
// sources
// -----------------------------------------------------------
//
// Every .ts/.tsx source file under a directory, tests and
// node_modules excluded.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}


describe('EmojiQuickRow under the css interop', () => {
  it('every emoji keeps its 44pt round target', async () => {
    await render(<EmojiQuickRow onPick={() => {}} emojis={['👍', '❤️']} />);
    for (const emoji of ['👍', '❤️']) {
      const style = StyleSheet.flatten(screen.getByLabelText(emoji).props.style);
      expect(style).toEqual(expect.objectContaining({ height: 44, width: 44, borderRadius: 22 }));
    }
  });
});


describe('no Pressable style function anywhere in the chat territory', () => {
  it('the kit and the chat screens use static styles only', () => {
    const app = join(__dirname, '../../../../..');
    const roots = [
      join(app, 'packages/chatuikit/src'),
      join(app, 'components/chat'),
      join(app, 'app/(main)/chat-room'),
      join(app, 'app/(main)/new-chat'),
    ];
    const files = [...roots.flatMap(sources), join(app, 'app/(main)/tabs/messages.tsx')];
    const offenders = files.filter((file) => /style=\{\(\{/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
