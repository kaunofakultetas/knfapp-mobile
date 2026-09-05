// -----------------------------------------------------------
//  [*] Tests — the public surface, pinned
//
//  A new export is a deliberate act: it must land here first.
//  Runtime names are compared exactly; type-only exports leave
//  no runtime trace, so the 1.1 prop types are pinned as
//  annotations the host's tsc run refuses to compile without.
// -----------------------------------------------------------

import * as pkg from '../index';

describe('@knf/notifyuikit surface', () => {
  it('exports exactly the pinned names', () => {
    expect(Object.keys(pkg).sort()).toEqual([
      'NotifySettingsPanel',
      'PermissionGate',
      'defaultColors',
      'useStoreValue',
    ]);
  });

  it('types the 1.1 settings props — icons by row, hints by channel', () => {
    const icons: pkg.NotifySettingsIcons = { master: null, chatPreview: null, news: null, chat: null, schedule: null, admin: null };
    const hints: pkg.NotifyChannelHints = { news: 'n', chat: 'c', schedule: 's', admin: 'a' };
    expect(Object.keys(icons)).toEqual(['master', 'chatPreview', 'news', 'chat', 'schedule', 'admin']);
    expect(Object.keys(hints)).toEqual(['news', 'chat', 'schedule', 'admin']);
  });
});
