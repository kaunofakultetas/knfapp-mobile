// -----------------------------------------------------------
//  [*] Tests — the public surface, pinned
//
//  A new export is a deliberate act: it must land here first.
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
});
