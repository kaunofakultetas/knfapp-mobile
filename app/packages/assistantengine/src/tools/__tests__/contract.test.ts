// -----------------------------------------------------------
//  [*] Tests — the tool contract, both sides held together
//
//  The frozen names and their guard; a mirror for every name
//  with the field names, kinds, closed value sets and required
//  lists the container must serve; the normalized form that
//  makes the comparison structural (documentation keys gone,
//  required/enum order free, schema-list order kept); the GET
//  that fetches the served contract with the chat's headers
//  and turns every wire problem into the same typed error; and
//  the conformance describe itself — run for real against the
//  reference fake at the end, and run under stand-in jest
//  globals against a drifted server to prove it goes RED on
//  exactly the cases that drifted.
// -----------------------------------------------------------

import {
  ASSISTANT_TOOL_NAMES,
  ASSISTANT_TOOL_SCHEMAS,
  describeToolsContract,
  fetchAssistantTools,
  isAssistantToolName,
  normalizeToolSchema,
  type AssistantToolDescriptor,
  type AssistantToolName,
  type AssistantToolsConfig,
} from '../contract';
import { AssistantTransportError } from '../../core/types';
import { createFakeAssistantServer, errorReply, jsonReply, networkFailure, referenceTools } from '../../testing';


const BASE = 'https://knf.example.lt';

const config = (server: ReturnType<typeof createFakeAssistantServer>, token: string | null = null): AssistantToolsConfig => ({
  baseUrl: BASE,
  fetch: server.fetch,
  getAuthToken: async () => token,
  language: () => 'en',
  clientVersion: '1.2.3',
});

// Await a promise that MUST reject with our error and hand it back
const rejection = async (promise: Promise<unknown>): Promise<AssistantTransportError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AssistantTransportError) return error;
    throw new Error(`expected an AssistantTransportError, got ${String(error)}`);
  }
  throw new Error('expected a rejection');
};

const propertyNames = (schema: { properties: Record<string, unknown> }) => Object.keys(schema.properties).sort();


describe('the frozen names', () => {
  it('are exactly the three, in the order the kit and the container know', () => {
    expect(ASSISTANT_TOOL_NAMES).toEqual(['lookupSchedule', 'searchNews', 'searchHandbook']);
  });

  it.each(['lookupSchedule', 'searchNews', 'searchHandbook'])('isAssistantToolName accepts %s', (name) => {
    expect(isAssistantToolName(name)).toBe(true);
  });

  it.each(['lookupschedule', 'LookupSchedule', 'lookup_schedule', 'searchnews', '', 'tool-lookupSchedule'])('isAssistantToolName rejects %s', (name) => {
    expect(isAssistantToolName(name)).toBe(false);
  });
});


describe('the schema mirrors', () => {
  it('cover every frozen name with an object schema on both sides', () => {
    for (const name of ASSISTANT_TOOL_NAMES) {
      expect(ASSISTANT_TOOL_SCHEMAS[name].input.type).toBe('object');
      expect(ASSISTANT_TOOL_SCHEMAS[name].output.type).toBe('object');
    }
    expect(Object.keys(ASSISTANT_TOOL_SCHEMAS).sort()).toEqual([...ASSISTANT_TOOL_NAMES].sort());
  });

  it('lookupSchedule: the input fields, the range enum, nothing required; the output lessons with their required trio and the source enum', () => {
    const { input, output } = ASSISTANT_TOOL_SCHEMAS.lookupSchedule;
    expect(propertyNames(input)).toEqual(['date', 'group', 'range', 'teacher']);
    expect(input.properties.range).toEqual({ type: 'string', enum: ['day', 'week'] });
    expect(input.required).toBeUndefined();

    expect(propertyNames(output)).toEqual(['lessons', 'note', 'source']);
    expect(output.required).toEqual(['lessons', 'source']);
    expect(output.properties.source).toEqual({ type: 'string', enum: ['live', 'cache'] });
    const lessons = output.properties.lessons as { type: 'array'; items: { properties: Record<string, unknown>; required?: string[] } };
    expect(lessons.type).toBe('array');
    expect(propertyNames(lessons.items)).toEqual(['end', 'group', 'kind', 'room', 'start', 'teacher', 'title']);
    expect(lessons.items.required).toEqual(['title', 'start', 'end']);
  });

  it('searchNews: query/source/limit in, limit an integer; posts out with the required quartet', () => {
    const { input, output } = ASSISTANT_TOOL_SCHEMAS.searchNews;
    expect(propertyNames(input)).toEqual(['limit', 'query', 'source']);
    expect(input.properties.limit).toEqual({ type: 'integer' });
    expect(input.required).toBeUndefined();

    expect(propertyNames(output)).toEqual(['posts']);
    expect(output.required).toEqual(['posts']);
    const posts = output.properties.posts as { type: 'array'; items: { properties: Record<string, unknown>; required?: string[] } };
    expect(propertyNames(posts.items)).toEqual(['date', 'id', 'source', 'summary', 'title', 'url']);
    expect(posts.items.required).toEqual(['id', 'title', 'date', 'source']);
  });

  it('searchHandbook: query required in; entries out with the language enum and the required quartet', () => {
    const { input, output } = ASSISTANT_TOOL_SCHEMAS.searchHandbook;
    expect(propertyNames(input)).toEqual(['limit', 'query']);
    expect(input.required).toEqual(['query']);

    expect(output.required).toEqual(['entries']);
    const entries = output.properties.entries as { type: 'array'; items: { properties: Record<string, unknown>; required?: string[] } };
    expect(propertyNames(entries.items)).toEqual(['excerpt', 'id', 'language', 'section', 'title']);
    expect(entries.items.properties.language).toEqual({ type: 'string', enum: ['lt', 'en'] });
    expect(entries.items.required).toEqual(['id', 'title', 'excerpt', 'language']);
  });

  it('carry nothing but type / properties / required / enum / items — small enough to serve verbatim', () => {
    const allowed = new Set(['type', 'properties', 'required', 'enum', 'items']);
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key !== 'properties') expect(allowed.has(key)).toBe(true);
        if (key === 'properties') Object.values(value as Record<string, unknown>).forEach(walk);
        else walk(value);
      }
    };
    for (const name of ASSISTANT_TOOL_NAMES) {
      walk(ASSISTANT_TOOL_SCHEMAS[name].input);
      walk(ASSISTANT_TOOL_SCHEMAS[name].output);
    }
  });

  it('are what the reference fake serves, one descriptor per name', () => {
    expect(referenceTools()).toEqual(ASSISTANT_TOOL_NAMES.map((name) => ({ name, input: ASSISTANT_TOOL_SCHEMAS[name].input, output: ASSISTANT_TOOL_SCHEMAS[name].output })));
  });
});


describe('normalizeToolSchema', () => {
  it('drops the documentation keys from every schema node', () => {
    const served = {
      type: 'object',
      description: 'for the model',
      title: 'Lookup',
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'lookup',
      $comment: 'x',
      examples: [{ group: 'IS-3' }],
      properties: { group: { type: 'string', description: 'the group code', examples: ['IS-3'] } },
    };
    expect(normalizeToolSchema(served)).toEqual({ type: 'object', properties: { group: { type: 'string' } } });
  });

  it('keeps a property NAMED like a documentation key — the keys of a properties map are field names', () => {
    const served = {
      type: 'object',
      title: 'Post',
      properties: {
        title: { type: 'string', description: 'the headline' },
        description: { type: 'string' },
      },
      required: ['title'],
    };
    expect(normalizeToolSchema(served)).toEqual({
      type: 'object',
      properties: { title: { type: 'string' }, description: { type: 'string' } },
      required: ['title'],
    });
  });

  it('keeps the keys of patternProperties and $defs maps the same way', () => {
    const served = {
      type: 'object',
      properties: {},
      patternProperties: { '^title$': { type: 'string', title: 'doc' } },
      $defs: { title: { type: 'integer', description: 'doc' } },
    };
    expect(normalizeToolSchema(served)).toEqual({
      type: 'object',
      properties: {},
      patternProperties: { '^title$': { type: 'string' } },
      $defs: { title: { type: 'integer' } },
    });
  });

  it('sorts object keys and the primitive lists required and enum', () => {
    const a = normalizeToolSchema({ required: ['b', 'a'], type: 'object', properties: { x: { enum: ['week', 'day'], type: 'string' } } });
    const b = normalizeToolSchema({ properties: { x: { type: 'string', enum: ['day', 'week'] } }, type: 'object', required: ['a', 'b'] });
    expect(a).toEqual(b);
    expect(Object.keys(a as object)).toEqual(['properties', 'required', 'type']);
  });

  it('keeps the order of a list of schemas', () => {
    const normalized = normalizeToolSchema({ anyOf: [{ type: 'string' }, { type: 'integer' }] }) as { anyOf: { type: string }[] };
    expect(normalized.anyOf.map((item) => item.type)).toEqual(['string', 'integer']);
  });

  it.each([
    ['a string', 'string'],
    ['a number', 7],
    ['null', null],
    ['undefined', undefined],
    ['a boolean', true],
  ])('passes %s through', (_label, value) => {
    expect(normalizeToolSchema(value)).toBe(value);
  });

  it('is idempotent', () => {
    const once = normalizeToolSchema(ASSISTANT_TOOL_SCHEMAS.lookupSchedule.output);
    expect(normalizeToolSchema(once)).toEqual(once);
  });

  it('tells a renamed field, a changed type and an added requirement apart from ours', () => {
    const ours = normalizeToolSchema(ASSISTANT_TOOL_SCHEMAS.searchNews.input);
    expect(normalizeToolSchema({ type: 'object', properties: { q: { type: 'string' }, source: { type: 'string' }, limit: { type: 'integer' } } })).not.toEqual(ours);
    expect(normalizeToolSchema({ type: 'object', properties: { query: { type: 'string' }, source: { type: 'string' }, limit: { type: 'string' } } })).not.toEqual(ours);
    expect(normalizeToolSchema({ ...ASSISTANT_TOOL_SCHEMAS.searchNews.input, required: ['query'] })).not.toEqual(ours);
  });
});


describe('fetchAssistantTools', () => {
  it('GETs baseUrl + the tools path with accept, the language and the client header — and no bearer for a guest', async () => {
    const server = createFakeAssistantServer();

    const tools = await fetchAssistantTools(config(server));

    expect(server.calls).toHaveLength(1);
    expect(server.calls[0].url).toBe(`${BASE}/api/assistant/tools`);
    expect(server.calls[0].method).toBe('GET');
    expect(server.calls[0].headers).toEqual({
      accept: 'application/json',
      'accept-language': 'en',
      'x-knf-assistant-client': 'knfapp-mobile/1.2.3',
    });
    expect(tools.map((tool) => tool.name)).toEqual(['lookupSchedule', 'searchNews', 'searchHandbook']);
  });

  it('carries the bearer for a signed-in user', async () => {
    const server = createFakeAssistantServer();
    await fetchAssistantTools(config(server, 'tok'));
    expect(server.calls[0].headers.authorization).toBe('Bearer tok');
  });

  it('keeps a base prefix and strips any extra key from a descriptor', async () => {
    const server = createFakeAssistantServer();
    server.script(jsonReply({ tools: [{ name: 'searchNews', input: { type: 'object' }, output: { type: 'object' }, version: 3 }], served_at: 'now' }));

    const tools = await fetchAssistantTools({ ...config(server), baseUrl: `${BASE}/mobile/` });

    expect(server.calls[0].url).toBe(`${BASE}/mobile/api/assistant/tools`);
    expect(tools).toEqual([{ name: 'searchNews', input: { type: 'object' }, output: { type: 'object' } }]);
  });

  it('a non-2xx rejects with the mapped failure — 503 + Retry-After is unavailable with the delay', async () => {
    const server = createFakeAssistantServer();
    server.script(errorReply(503, { error: 'restarting' }, { 'retry-after': '5' }));

    const error = await rejection(fetchAssistantTools(config(server)));

    expect(error.failure).toEqual({ code: 'unavailable', status: 503, retryAfterMs: 5_000, message: 'restarting' });
  });

  it('a throwing fetch rejects as network with the cause kept', async () => {
    const server = createFakeAssistantServer();
    server.script(networkFailure('offline'));

    const error = await rejection(fetchAssistantTools(config(server)));

    expect(error.failure).toEqual({ code: 'network', message: 'offline' });
    expect(error.cause).toBeInstanceOf(TypeError);
  });

  it('a 200 that is not JSON rejects as server: Tools envelope is not JSON', async () => {
    const server = createFakeAssistantServer();
    server.script(errorReply(200, '<html>login</html>', { 'content-type': 'text/html' }));

    const error = await rejection(fetchAssistantTools(config(server)));

    expect(error.failure).toEqual({ code: 'server', status: 200, message: 'Tools envelope is not JSON' });
  });

  it.each([
    ['no tools key', { version: 1 }],
    ['tools not a list', { tools: { lookupSchedule: {} } }],
    ['a descriptor without a name', { tools: [{ input: {}, output: {} }] }],
    ['a descriptor without an input', { tools: [{ name: 'searchNews', output: {} }] }],
    ['a descriptor without an output', { tools: [{ name: 'searchNews', input: {} }] }],
    ['a null descriptor', { tools: [null] }],
    ['a bare array', [{ name: 'searchNews', input: {}, output: {} }]],
    ['null', null],
  ])('a malformed envelope (%s) rejects as server: Malformed tools envelope', async (_label, body) => {
    const server = createFakeAssistantServer();
    server.script(jsonReply(body));

    const error = await rejection(fetchAssistantTools(config(server)));

    expect(error.failure).toEqual({ code: 'server', status: 200, message: 'Malformed tools envelope' });
  });

  it('an empty tools list is a valid, empty answer — the describe is what flags it', async () => {
    const server = createFakeAssistantServer();
    server.script(jsonReply({ tools: [] }));
    await expect(fetchAssistantTools(config(server))).resolves.toEqual([]);
  });
});


// -----------------------------------------------------------
// runDescribe
// -----------------------------------------------------------
//
// describeToolsContract under stand-in jest globals: describe
// runs its body at once, beforeAll and it are collected, then
// the hook and every case run in order with the REAL expect —
// so a case that would fail in a live run is a thrown
// assertion here, caught and named. This is how a describe is
// proven to go red without failing the suite it lives in.
//
// Used by:
//   - the green and the drifted runs below
// -----------------------------------------------------------

interface DescribeOutcome {
  cases: string[];
  failed: string[];
}

async function runDescribe(body: () => void): Promise<DescribeOutcome> {
  const globals = globalThis as unknown as Record<string, unknown>;
  const original = { describe: globals.describe, it: globals.it, beforeAll: globals.beforeAll };
  const hooks: (() => Promise<void> | void)[] = [];
  const cases: { name: string; run: () => Promise<void> | void }[] = [];
  globals.describe = (_name: string, fn: () => void) => fn();
  globals.it = (name: string, run: () => Promise<void> | void) => {
    cases.push({ name, run });
  };
  globals.beforeAll = (fn: () => Promise<void> | void) => {
    hooks.push(fn);
  };
  try {
    body();
  } finally {
    Object.assign(globals, original);
  }

  for (const hook of hooks) await hook();
  const failed: string[] = [];
  for (const testCase of cases) {
    try {
      await testCase.run();
    } catch {
      failed.push(testCase.name);
    }
  }
  return { cases: cases.map((testCase) => testCase.name), failed };
}

const serving = (tools: AssistantToolDescriptor[]) => async () => tools;

// A served copy of ours with one thing changed
const drifted = (name: AssistantToolName, side: 'input' | 'output', patch: (schema: Record<string, unknown>) => Record<string, unknown>): AssistantToolDescriptor[] =>
  referenceTools().map((tool) =>
    tool.name === name ? { ...tool, [side]: patch(JSON.parse(JSON.stringify(tool[side])) as Record<string, unknown>) } : tool,
  );


describe('describeToolsContract', () => {
  it('registers seven cases: the names, then input and output per tool', async () => {
    const outcome = await runDescribe(() => describeToolsContract('mirror', serving(referenceTools())));
    expect(outcome.cases).toEqual([
      'serves every frozen tool name',
      'lookupSchedule: the served input schema mirrors ours',
      'lookupSchedule: the served output schema mirrors ours',
      'searchNews: the served input schema mirrors ours',
      'searchNews: the served output schema mirrors ours',
      'searchHandbook: the served input schema mirrors ours',
      'searchHandbook: the served output schema mirrors ours',
    ]);
    expect(outcome.failed).toEqual([]);
  });

  it('stays green when the server adds descriptions, reorders keys and required lists, or serves an extra tool', async () => {
    const decorated = referenceTools().map((tool) => ({
      ...tool,
      input: { description: `input of ${tool.name}`, ...(tool.input as object) },
      output: { ...(tool.output as object), title: 'Result' },
    }));
    const searchHandbook = decorated.find((tool) => tool.name === 'searchHandbook') as AssistantToolDescriptor;
    const entries = (searchHandbook.output as { properties: { entries: { items: { required: string[] } } } }).properties.entries;
    entries.items.required = [...entries.items.required].reverse();
    const withExtra = [{ name: 'lookupExams', input: { type: 'object', properties: {} }, output: { type: 'object', properties: {} } }, ...decorated.reverse()];

    const outcome = await runDescribe(() => describeToolsContract('decorated', serving(withExtra)));
    expect(outcome.failed).toEqual([]);
  });

  it('goes RED on a renamed input field — that tool\'s input case only', async () => {
    const served = drifted('searchNews', 'input', (schema) => {
      const properties = schema.properties as Record<string, unknown>;
      const { query, ...rest } = properties;
      return { ...schema, properties: { ...rest, q: query } };
    });
    const outcome = await runDescribe(() => describeToolsContract('drifted', serving(served)));
    expect(outcome.failed).toEqual(['searchNews: the served input schema mirrors ours']);
  });

  it('goes RED on a changed output type — that tool\'s output case only', async () => {
    const served = drifted('lookupSchedule', 'output', (schema) => {
      const properties = schema.properties as Record<string, unknown>;
      return { ...schema, properties: { ...properties, source: { type: 'string' } } };
    });
    const outcome = await runDescribe(() => describeToolsContract('drifted', serving(served)));
    expect(outcome.failed).toEqual(['lookupSchedule: the served output schema mirrors ours']);
  });

  it('goes RED on an added requirement', async () => {
    const served = drifted('searchHandbook', 'input', (schema) => ({ ...schema, required: ['query', 'limit'] }));
    const outcome = await runDescribe(() => describeToolsContract('drifted', serving(served)));
    expect(outcome.failed).toEqual(['searchHandbook: the served input schema mirrors ours']);
  });

  it('goes RED when the required title property vanishes from an output — a field name is never dropped as documentation', async () => {
    const served = drifted('searchNews', 'output', (schema) => {
      const posts = (schema.properties as Record<string, { items: { properties: Record<string, unknown> } }>).posts;
      delete posts.items.properties.title;
      return schema;
    });
    const outcome = await runDescribe(() => describeToolsContract('drifted', serving(served)));
    expect(outcome.failed).toEqual(['searchNews: the served output schema mirrors ours']);
  });

  it('goes RED when the title property is retyped in an output', async () => {
    const served = drifted('searchHandbook', 'output', (schema) => {
      const entries = (schema.properties as Record<string, { items: { properties: Record<string, unknown> } }>).entries;
      entries.items.properties.title = { type: 'integer' };
      return schema;
    });
    const outcome = await runDescribe(() => describeToolsContract('drifted', serving(served)));
    expect(outcome.failed).toEqual(['searchHandbook: the served output schema mirrors ours']);
  });

  it('goes RED when a nested required list loses a field', async () => {
    const served = drifted('lookupSchedule', 'output', (schema) => {
      const lessons = (schema.properties as Record<string, { items: { required: string[] } }>).lessons;
      lessons.items.required = ['title'];
      return schema;
    });
    const outcome = await runDescribe(() => describeToolsContract('drifted', serving(served)));
    expect(outcome.failed).toEqual(['lookupSchedule: the served output schema mirrors ours']);
  });

  it('goes RED on a missing tool — the names case and both of that tool\'s cases', async () => {
    const served = referenceTools().filter((tool) => tool.name !== 'searchHandbook');
    const outcome = await runDescribe(() => describeToolsContract('missing', serving(served)));
    expect(outcome.failed).toEqual([
      'serves every frozen tool name',
      'searchHandbook: the served input schema mirrors ours',
      'searchHandbook: the served output schema mirrors ours',
    ]);
  });

  it('goes RED everywhere on an empty list', async () => {
    const outcome = await runDescribe(() => describeToolsContract('empty', serving([])));
    expect(outcome.failed).toHaveLength(7);
  });
});


// The real thing, against the reference fake through the real GET
describeToolsContract('reference fake', () => fetchAssistantTools(config(createFakeAssistantServer())));
