// -----------------------------------------------------------
//  [*] Tests — error log ring buffer
//
//  The one error sink: entries keep scope and context, the
//  buffer is bounded at 50 (oldest dropped), readers get a
//  copy, and logging itself never throws — the guarantee that
//  lets every swallow-with-log catch stay safe. Expected,
//  UI-handled outcomes go through logExpected: marked in the
//  trail, and never console.error (the dev LogBox's red toast).
// -----------------------------------------------------------

import { getErrorLog, logError, logExpected } from '@/services/log';


// __DEV__ is true under jest-expo, so both sinks mirror to the
// console — silence it without losing the assertions
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  (console.error as jest.Mock).mockRestore();
  (console.info as jest.Mock).mockRestore();
});


describe('logError', () => {
  it('records scope, message and extra context', () => {
    logError('api', new Error('boom'), '/news/7');
    const last = getErrorLog().at(-1)!;
    expect(last).toContain('[api]');
    expect(last).toContain('Error: boom');
    expect(last).toContain('/news/7');
  });

  it('stringifies non-Error values', () => {
    logError('socket', 'plain failure');
    expect(getErrorLog().at(-1)).toContain('plain failure');
  });

  it('caps the buffer at 50 entries, dropping the oldest', () => {
    for (let i = 0; i < 60; i += 1) logError('cap', new Error(`e${i}`));
    const log = getErrorLog();
    expect(log.length).toBeLessThanOrEqual(50);
    expect(log.at(-1)).toContain('e59');
    expect(log.some((line) => line.includes('e0:') || line.includes('Error: e0 '))).toBe(false);
  });

  it('hands out a copy, not the live buffer', () => {
    logError('copy', new Error('original'));
    const snapshot = getErrorLog();
    snapshot.push('tampered');
    expect(getErrorLog()).not.toContain('tampered');
  });

  it('never throws, even for hostile values', () => {
    const evil = {
      toString() {
        throw new Error('no string for you');
      },
    };
    expect(() => logError('evil', evil)).not.toThrow();
  });
});


describe('logExpected', () => {
  it('keeps a handled outcome in the trail, marked, and off console.error', () => {
    logExpected('api', new Error('Invalid credentials'), '/auth/login');
    const last = getErrorLog().at(-1)!;
    expect(last).toContain('[api] (expected)');
    expect(last).toContain('Invalid credentials');
    expect(last).toContain('/auth/login');
    expect(console.error).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith('[api] Error: Invalid credentials', '/auth/login');
  });

  it('a fault still goes to console.error, unmarked', () => {
    logError('api', new Error('HTTP 500'));
    expect(getErrorLog().at(-1)).not.toContain('(expected)');
    expect(console.error).toHaveBeenCalled();
  });

  it('never throws either', () => {
    const evil = {
      toString() {
        throw new Error('no string for you');
      },
    };
    expect(() => logExpected('evil', evil)).not.toThrow();
  });
});
