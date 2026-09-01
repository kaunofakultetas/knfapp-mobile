// -----------------------------------------------------------
//  [*] Tests — @knf/wayfindeditor public surface
//
//  The package's runtime exports pinned. Adding is deliberate;
//  removing or renaming is a breaking change for every host.
// -----------------------------------------------------------

import * as editor from '../index';


describe('@knf/wayfindeditor surface', () => {
  it('exports exactly these runtime members', () => {
    expect(Object.keys(editor).sort()).toEqual(
      [
        'HISTORY_CAP',
        'addEdge',
        'addLevel',
        'addNode',
        'addRoom',
        'applyChanges',
        'begin',
        'beginClosing',
        'buildingFields',
        'changesToOps',
        'coalesce',
        'deleteEdge',
        'deleteLevel',
        'deleteNode',
        'deleteRoom',
        'emptyHistory',
        'end',
        'endClosing',
        'entityId',
        'getEntity',
        'invert',
        'issueId',
        'moveNode',
        'normaliseDocument',
        'record',
        'recordClosing',
        'redo',
        'revisionKey',
        'setBuilding',
        'undo',
        'updateEdge',
        'updateLevel',
        'updateNode',
        'updateRoom',
        'useEditor',
      ].sort(),
    );
  });
});
