// -----------------------------------------------------------
//  [*] Tests — @knf/wayfindcapture public surface
//
//  The package's runtime exports pinned, plus the promises a
//  host leans on straight off the barrel: the full plan is the
//  contract's 44 targets, a session built from it shoots, and
//  a fresh tracker settles. Adding is deliberate; removing or
//  renaming is a breaking change for the capture screen, the
//  import flow and the HUD.
// -----------------------------------------------------------

import * as capture from '../index';


describe('@knf/wayfindcapture surface', () => {
  it('exports exactly these runtime members', () => {
    expect(Object.keys(capture).sort()).toEqual(
      [
        'angularDistanceDeg',
        'createCaptureSession',
        'createPoseTracker',
        'fromAxisAngle',
        'identity',
        'multiply',
        'normalize',
        'parsePanoMetadata',
        'planTargets',
        'poseFromQuat',
        'rotateVector',
        'useCaptureSession',
      ].sort(),
    );
  });

  it('the contract plan, session and tracker work straight off the barrel', () => {
    const targets = capture.planTargets({ mode: 'full' });
    expect(targets).toHaveLength(44);

    let t = 0;
    const session = capture.createCaptureSession({ targets, now: () => t });
    const events: capture.CaptureEvent[] = [];
    session.subscribe((event) => {
      if (event) events.push(event);
    });
    session.begin();
    session.feed({ yawDeg: 0, pitchDeg: 0, rollDeg: 0 }, { x: 0, y: 0, z: 0 });
    t += 300;
    session.feed({ yawDeg: 0, pitchDeg: 0, rollDeg: 0 }, { x: 0, y: 0, z: 0 });
    expect(events).toEqual([{ type: 'shoot', targetId: 'r0-0' }]);

    const tracker = capture.createPoseTracker();
    expect(tracker.state()).toBe('settling');
  });

  it('the pose convention round-trips through the quaternion helpers', () => {
    // Yaw 90 clockwise from above is a rotation about world -y
    const q = capture.fromAxisAngle({ x: 0, y: 1, z: 0 }, -Math.PI / 2);
    expect(capture.poseFromQuat(q).yawDeg).toBeCloseTo(90, 6);
  });
});
