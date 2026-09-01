// -----------------------------------------------------------
//  [*] Tests — wayfindcapture session
//
//  The auto-shutter rules on an injected clock: stability
//  needs 300 ms of fed quiet, one shoot per attempt however
//  the aim jitters around the thresholds, fail re-arms only
//  after 500 ms, nearest-unaccepted target selection, aim
//  signs (shortest yaw arc), retake reopening a done capture,
//  and a full synthetic walkthrough of the 36-target walls
//  plan ending in the manifest with the P1 centre column
//  (firstYawDeg = the first accepted frame's yaw).
// -----------------------------------------------------------

import { planTargets, type CaptureTarget } from '../plan';
import type { Pose, Vec3 } from '../quat';
import { createCaptureSession, type CaptureEvent } from '../session';


const QUIET: Vec3 = { x: 0, y: 0, z: 0 };
const LOUD: Vec3 = { x: 0.2, y: 0, z: 0 };

const poseAt = (yawDeg: number, pitchDeg: number, rollDeg = 0): Pose => ({ yawDeg, pitchDeg, rollDeg });

// A session on a hand-cranked clock, with every event recorded
const harness = (targets: CaptureTarget[]) => {
  let t = 0;
  const events: CaptureEvent[] = [];
  const session = createCaptureSession({ targets, now: () => t });
  session.subscribe((event) => {
    if (event) events.push(event);
  });
  return { session, events, tick: (ms: number) => (t += ms) };
};

const shoots = (events: CaptureEvent[]) => events.filter((event) => event.type === 'shoot');


describe('stability and the shoot-once rule', () => {
  const targets = planTargets({ mode: 'walls' });

  it('does not shoot before 300 ms of fed quiet, then shoots exactly once', () => {
    const { session, events, tick } = harness(targets);
    session.begin();

    const aim1 = session.feed(poseAt(0, 0), QUIET);
    expect(aim1?.aligned).toBe(true);
    expect(aim1?.stable).toBe(false);
    tick(150);
    expect(session.feed(poseAt(0, 0), QUIET)?.stable).toBe(false);
    tick(150);
    expect(session.feed(poseAt(0, 0), QUIET)?.stable).toBe(true);
    expect(shoots(events)).toEqual([{ type: 'shoot', targetId: 'r0-0' }]);

    // Aligned and stable again and again — the attempt latch
    // holds until the host answers
    tick(50);
    session.feed(poseAt(1, 0), QUIET);
    tick(50);
    session.feed(poseAt(0, 1), QUIET);
    expect(shoots(events)).toHaveLength(1);
  });

  it('jitter out of alignment and back does not re-fire the pending attempt', () => {
    const { session, events, tick } = harness(targets);
    session.begin();
    session.feed(poseAt(0, 0), QUIET);
    tick(300);
    session.feed(poseAt(0, 0), QUIET);
    expect(shoots(events)).toHaveLength(1);

    tick(50);
    session.feed(poseAt(7, 0), QUIET); // out (distance 7 > 6)
    tick(50);
    session.feed(poseAt(0, 0), QUIET); // back in
    expect(shoots(events)).toHaveLength(1);
  });

  it('a loud sample restarts the 300 ms clock', () => {
    const { session, events, tick } = harness(targets);
    session.begin();
    session.feed(poseAt(0, 0), QUIET);
    tick(250);
    session.feed(poseAt(0, 0), LOUD);
    tick(250);
    session.feed(poseAt(0, 0), QUIET);
    expect(shoots(events)).toHaveLength(0);

    tick(300);
    session.feed(poseAt(0, 0), QUIET);
    expect(shoots(events)).toHaveLength(1);
  });

  it('fail re-arms the attempt only after 500 ms', () => {
    const { session, events, tick } = harness(targets);
    session.begin();
    session.feed(poseAt(0, 0), QUIET);
    tick(300);
    session.feed(poseAt(0, 0), QUIET);
    expect(shoots(events)).toHaveLength(1);

    tick(100);
    session.fail('r0-0');
    tick(400); // 400 < 500 since the fail
    session.feed(poseAt(0, 0), QUIET);
    expect(shoots(events)).toHaveLength(1);

    tick(150); // 550 since the fail
    session.feed(poseAt(0, 0), QUIET);
    expect(shoots(events)).toHaveLength(2);
    expect(shoots(events)[1]).toEqual({ type: 'shoot', targetId: 'r0-0' });
  });

  it('never shoots before begin(), and roll beyond tolerance blocks alignment', () => {
    const { session, events, tick } = harness(targets);
    session.feed(poseAt(0, 0), QUIET);
    tick(400);
    session.feed(poseAt(0, 0), QUIET);
    expect(shoots(events)).toHaveLength(0);
    expect(session.phase()).toBe('idle');

    session.begin();
    tick(50);
    // Aligned in distance but rolled 9° — no shoot
    expect(session.feed(poseAt(0, 0, 9), QUIET)?.aligned).toBe(false);
    expect(shoots(events)).toHaveLength(0);
    tick(50);
    expect(session.feed(poseAt(0, 0, 8), QUIET)?.aligned).toBe(true);
  });
});


describe('targeting and aim', () => {
  const targets = planTargets({ mode: 'walls' });

  it('the current target is the nearest unaccepted by great-circle distance', () => {
    const { session } = harness(targets);
    session.begin();
    session.feed(poseAt(100, 5), QUIET);
    expect(session.current()).toBe('r0-3'); // yaw 90 is 10° off, yaw 120 is 20°

    // Once r0-3 is accepted the same pose aims at the next ring
    session.accept('r0-3', poseAt(90, 0));
    session.feed(poseAt(100, 5), QUIET);
    expect(session.current()).toBe('r0-4');
  });

  it('the aim reports the shortest signed arcs', () => {
    const { session } = harness(targets);
    session.begin();
    const aim = session.feed(poseAt(100, -3), QUIET);
    expect(aim?.dYawDeg).toBeCloseTo(-10, 6); // 100 → 90 is a left turn
    expect(aim?.dPitchDeg).toBeCloseTo(3, 6); // target pitch 0, pose -3
    expect(aim?.distanceDeg).toBeGreaterThan(10);

    // Wraparound: 355 → r0-0 at 0 is +5, not -355
    expect(session.feed(poseAt(355, 0), QUIET)?.dYawDeg).toBeCloseTo(5, 6);
  });
});


describe('accept, retake, done and the manifest', () => {
  // A tiny plan keeps the walkthroughs readable
  const tiny: CaptureTarget[] = [
    { id: 'r0-0', yawDeg: 0, pitchDeg: 0 },
    { id: 'r0-1', yawDeg: 120, pitchDeg: 0 },
    { id: 'r0-2', yawDeg: 240, pitchDeg: 0 },
  ];

  it('records shots, emits accepted then done, and answers the manifest', () => {
    const { session, events, tick } = harness(tiny);
    session.begin();

    session.accept('r0-0', poseAt(2, 1));
    tick(10);
    session.accept('r0-1', poseAt(121, -1));
    tick(10);
    session.accept('r0-2', poseAt(239, 0));
    expect(events).toEqual([
      { type: 'accepted', targetId: 'r0-0' },
      { type: 'accepted', targetId: 'r0-1' },
      { type: 'accepted', targetId: 'r0-2' },
      { type: 'done' },
    ]);
    expect(session.phase()).toBe('done');

    const manifest = session.finish();
    expect(manifest.targets).toEqual(tiny);
    expect(manifest.frames.map((frame) => frame.targetId)).toEqual(['r0-0', 'r0-1', 'r0-2']);
    expect(manifest.frames[0].at).toBe(0);
    expect(manifest.firstYawDeg).toBe(2); // the first ACCEPTED yaw — the pano's centre column
  });

  it('a double accept and an unknown id change nothing', () => {
    const { session, events } = harness(tiny);
    session.begin();
    session.accept('r0-0', poseAt(0, 0));
    session.accept('r0-0', poseAt(5, 0));
    session.accept('ghost', poseAt(0, 0));
    expect(session.shots()).toHaveLength(1);
    expect(events.filter((event) => event.type === 'accepted')).toHaveLength(1);
  });

  it('retake un-accepts, reopens a done capture, and done fires again on re-accept', () => {
    const { session, events } = harness(tiny);
    session.begin();
    for (const target of tiny) session.accept(target.id, poseAt(target.yawDeg, 0));
    expect(session.phase()).toBe('done');

    session.retake('r0-1');
    expect(session.phase()).toBe('capturing');
    expect(session.shots().map((shot) => shot.targetId)).toEqual(['r0-0', 'r0-2']);
    session.feed(poseAt(119, 0), QUIET);
    expect(session.current()).toBe('r0-1');

    session.accept('r0-1', poseAt(118, 0));
    expect(events.filter((event) => event.type === 'done')).toHaveLength(2);
    // The retaken frame re-enters the manifest at the END
    expect(session.finish().frames.map((frame) => frame.targetId)).toEqual(['r0-0', 'r0-2', 'r0-1']);
  });

  it('with everything accepted the aim is null and the current target gone', () => {
    const { session } = harness(tiny);
    session.begin();
    for (const target of tiny) session.accept(target.id, poseAt(target.yawDeg, 0));
    expect(session.feed(poseAt(0, 0), QUIET)).toBeNull();
    expect(session.current()).toBeNull();
    expect(session.snapshot().aim).toBeNull();
  });
});


describe('the walls walkthrough', () => {
  it('shoots and accepts all 36 targets in plan order and finishes clean', () => {
    const targets = planTargets({ mode: 'walls' });
    const { session, events, tick } = harness(targets);
    session.begin();

    // Settle the stillness clock once; it survives across shots
    session.feed(poseAt(0, 0), QUIET);
    tick(300);

    for (const target of targets) {
      session.feed(poseAt(target.yawDeg, target.pitchDeg), QUIET);
      const fired = shoots(events);
      expect(fired[fired.length - 1]).toEqual({ type: 'shoot', targetId: target.id });
      session.accept(target.id, poseAt(target.yawDeg, target.pitchDeg));
      tick(50);
    }

    expect(shoots(events)).toHaveLength(36);
    expect(session.phase()).toBe('done');
    const manifest = session.finish();
    expect(manifest.frames).toHaveLength(36);
    expect(manifest.firstYawDeg).toBe(0);
    expect(session.snapshot()).toMatchObject({ shotsDone: 36, shotsTotal: 36, phase: 'done' });
  });
});
