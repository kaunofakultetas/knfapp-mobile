// -----------------------------------------------------------
//  [*] Tests — useAssistantFailure at its seams
//
//  The mapping the runtime suite exercises end to end, pinned
//  at the hook itself: a healthy thread answers null, and the
//  hook mounted OUTSIDE any assistant runtime throws the
//  upstream's provider error like every other assistant hook —
//  a screen mounts it under the provider, never above it.
// -----------------------------------------------------------

import { renderHook } from '@testing-library/react-native';

import { useAssistantFailure } from '../useAssistantFailure';
import { createKnfAssistantTransport } from '../../core/transport';
import { createFakeAssistantServer, mountAssistantProbe } from '../../testing';


describe('useAssistantFailure', () => {
  it('outside any assistant runtime throws the upstream\'s provider error — never a silent null', async () => {
    // The provider error is logged by the renderer before it
    // propagates — kept out of the run's output
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(renderHook(() => useAssistantFailure())).rejects.toThrow(/AuiProvider/);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('answers null on a healthy, idle thread', async () => {
    const server = createFakeAssistantServer();
    const transport = createKnfAssistantTransport({
      baseUrl: 'https://knf.example.lt',
      fetch: server.fetch,
      getAuthToken: async () => null,
      language: () => 'lt',
      clientVersion: '1.2.3',
    });
    const probe = await mountAssistantProbe({ transport });
    try {
      expect(probe.failure()).toBeNull();
      expect(probe.error()).toBeUndefined();
    } finally {
      await probe.unmount();
    }
  });
});
