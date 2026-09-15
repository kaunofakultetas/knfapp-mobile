// -----------------------------------------------------------
//  [*] AssistantWire — the live-container conformance job
//
//  The engine's own tools-contract describe, pointed at the
//  REAL assistant container instead of the reference fake —
//  the integration half contract.ts promises. Opt-in: the
//  suite runs only when ASSISTANT_WIRE_URL names a live
//  base (inside the dev stack that is
//  http://knfapp-assistant:3000) and skips silently in the
//  ordinary jest run, so CI without the stack stays green.
//
//    ASSISTANT_WIRE_URL=http://knfapp-assistant:3000 \
//      npx jest services/__tests__/assistantWire
// -----------------------------------------------------------

import { describeToolsContract, fetchAssistantTools } from '@knf/assistantengine';


const wireUrl = process.env.ASSISTANT_WIRE_URL;

if (wireUrl) {
  // jest-expo replaces global fetch with the XHR polyfill,
  // which cannot reach a network from node — the engine's
  // fetch seam takes undici's real one instead
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { fetch: nodeFetch } = require('undici');

  describeToolsContract('live container', () =>
    fetchAssistantTools({
      baseUrl: wireUrl,
      fetch: nodeFetch as unknown as typeof fetch,
      getAuthToken: async () => null,
      language: () => 'lt',
      clientVersion: 'wire-test',
    }),
  );
} else {
  describe('assistant wire conformance', () => {
    it.skip('runs only with ASSISTANT_WIRE_URL set (see the header)', () => {});
  });
}
