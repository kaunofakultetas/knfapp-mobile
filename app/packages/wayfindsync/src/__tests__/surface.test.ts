// -----------------------------------------------------------
//  [*] Tests — @knf/wayfindsync public surface
// -----------------------------------------------------------

import * as sync from '../index';


describe('@knf/wayfindsync surface', () => {
  it('exports exactly these runtime members', () => {
    expect(Object.keys(sync).sort()).toEqual(['RETRY_DELAYS_MS', 'SyncRejected', 'WayfindSyncProvider', 'createOutbox', 'createUploadQueue', 'useWayfindSync'].sort());
  });
});
