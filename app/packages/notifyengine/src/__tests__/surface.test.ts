// -----------------------------------------------------------
//  [*] Tests — the public surface, pinned
//
//  A new export is a deliberate act: it must land here first.
// -----------------------------------------------------------

import * as pkg from '../index';

describe('@knf/notifyengine surface', () => {
  it('exports exactly the pinned names', () => {
    expect(Object.keys(pkg).sort()).toEqual([
      'CHANNEL_KEYS',
      'ChannelImportance',
      'TransportFailure',
      'createExpoDevice',
      'createForegroundHandler',
      'createKnfNotifyTransport',
      'createNotifyEngine',
      'createStore',
      'normalizeData',
      'validateChannelSpecs',
    ]);
  });
});
