// -----------------------------------------------------------
//  [*] Tests — the public surface, pinned
//
//  A new export is a deliberate act: it must land here first.
//  Both doors are pinned — the package the app imports, and
//  the testing doubles hosts reach through
//  '@knf/assistantengine/testing'. Nothing DOM-shaped leaves
//  either. Type-only exports are erased at runtime, so the
//  local-runtime door's types are pinned by compilation below,
//  not by the key list.
// -----------------------------------------------------------

import * as pkg from '../index';
import * as testing from '../testing';

describe('@knf/assistantengine surface', () => {
  it('exports exactly the pinned names', () => {
    expect(Object.keys(pkg).sort()).toEqual([
      'ASSISTANT_CHAT_PATH',
      'ASSISTANT_CLIENT_HEADER',
      'ASSISTANT_TOOLS_PATH',
      'ASSISTANT_TOOL_NAMES',
      'ASSISTANT_TOOL_SCHEMAS',
      'AssistantRuntimeProvider',
      'AssistantTransportError',
      'buildAssistantHeaders',
      'createAssistantFetch',
      'createKnfAssistantTransport',
      'describeToolsContract',
      'fetchAssistantTools',
      'isAssistantToolName',
      'isAssistantTransportError',
      'joinUrl',
      'normalizeToolSchema',
      'parseRetryAfter',
      'readFailureBody',
      'resolveFetch',
      'toAssistantFailure',
      'useAssistantFailure',
      'useAssistantTokenUsage',
      'useKnfAssistantRuntime',
      'useLocalRuntime',
    ]);
  });

  it('the local-runtime door types ride through', () => {
    // Object.keys cannot see type-only exports — this adapter is
    // typed against the door instead, so an upstream rename of
    // ChatModelAdapter / ChatModelRunOptions / ChatModelRunResult /
    // LocalRuntimeOptions fails compilation here, not in a host
    const adapter: pkg.ChatModelAdapter = {
      async *run(options: pkg.ChatModelRunOptions): AsyncGenerator<pkg.ChatModelRunResult, void> {
        yield { content: [{ type: 'text', text: 'Labas! ' }] };
      },
    };
    const runtimeOptions: pkg.LocalRuntimeOptions = { initialMessages: [] };
    expect(typeof adapter.run).toBe('function');
    expect(runtimeOptions.initialMessages).toEqual([]);
  });
});

describe('@knf/assistantengine/testing surface', () => {
  it('exports exactly the pinned names', () => {
    expect(Object.keys(testing).sort()).toEqual([
      'CONTRACT_PROMPTS',
      'CONTRACT_REPLIES',
      'createFakeAssistantServer',
      'createRecordingFetch',
      'createScriptedModelAdapter',
      'describeTransportContract',
      'errorReply',
      'fixtureHandbookEntries',
      'fixtureLessons',
      'fixtureNewsPosts',
      'hangForever',
      'jsonReply',
      'mountAssistantProbe',
      'mountRuntimeProbe',
      'networkFailure',
      'referenceTools',
      'streamReply',
      'textOf',
      'textReply',
      'toolCallsOf',
      'toolReply',
      'useLocalRuntime',
    ]);
  });

  it('the fixtures are in the tool output shapes, Lithuanian first', () => {
    expect(testing.fixtureLessons.length).toBeGreaterThan(0);
    for (const lesson of testing.fixtureLessons) {
      expect(typeof lesson.title).toBe('string');
      expect(lesson.start < lesson.end).toBe(true);
    }
    expect(testing.fixtureNewsPosts.every((post) => typeof post.id === 'string' && typeof post.date === 'string' && typeof post.source === 'string')).toBe(true);
    expect(testing.fixtureHandbookEntries.map((entry) => entry.language)).toEqual(['lt', 'en']);
    expect(testing.CONTRACT_REPLIES.tool.output.lessons).toBe(testing.fixtureLessons);
  });
});
