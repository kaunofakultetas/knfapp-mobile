// -----------------------------------------------------------
//  [*] assistantengine — the tool contract
//
//  The three tools the container may call on the model's
//  behalf, FROZEN by name: the container registers them under
//  exactly these camelCase names, streams their calls and
//  results back under them, and the kit renders a card per
//  name. The input/output types are what the app reads out of
//  a tool part; the JSON-schema mirrors next to them are what
//  the container's GET /api/assistant/tools must serve — the
//  conformance describe below holds the two sides together,
//  so a field renamed on one side turns a suite red on the
//  other before it reaches a phone. Tools EXECUTE in the
//  container: nothing here runs one, and the runtime hook
//  registers none with the model.
//
//  Split into:
//
//    ASSISTANT_TOOL_NAMES / isAssistantToolName — the closed set
//    LookupSchedule* / SearchNews* / SearchHandbook* — the types
//    AssistantToolInput / AssistantToolOutput — lookup by name
//    JsonSchemaLite / ASSISTANT_TOOL_SCHEMAS — the mirrors
//    normalizeToolSchema — structural, order-insensitive form
//    fetchAssistantTools — GET the served contract
//    describeToolsContract — the conformance describe
//
//  Used by:
//    - tools/__tests__/contract.test.ts and the container's
//      integration job — the describe on both wires
//    - testing/index.tsx — referenceTools serves the mirrors,
//      the fixtures are typed against the output shapes
//    - hosts typing a tool part's input/output — the app's
//      assistant screen, once it lands; no app import yet
// -----------------------------------------------------------

import { readFailureBody, toAssistantFailure } from '../core/errors';
import { buildAssistantHeaders, joinUrl, resolveFetch } from '../core/transport';
import { ASSISTANT_TOOLS_PATH, AssistantTransportError, type AssistantLanguage, type AssistantTransportConfig } from '../core/types';







// -----------------------------------------------------------
// ASSISTANT_TOOL_NAMES
// -----------------------------------------------------------
//
// The closed set: the three frozen names the container
// registers its tools under.
//
// Used by:
//   - isAssistantToolName (below) — the set it narrows onto
//   - describeToolsContract (below) — the conformance cases
//   - testing/index.tsx — referenceTools serves one entry per
//     name
// -----------------------------------------------------------

export const ASSISTANT_TOOL_NAMES = ['lookupSchedule', 'searchNews', 'searchHandbook'] as const;







// -----------------------------------------------------------
// AssistantToolName
// -----------------------------------------------------------
//
// One of the three frozen names, as a type — what every
// name-keyed lookup in the contract is indexed by.
//
// Used by:
//   - ASSISTANT_TOOL_SCHEMAS (below) — the record's keys
//   - isAssistantToolName (below) — the guard's target
//   - AssistantToolInput / AssistantToolOutput (below)
//   - hosts switching on a streamed tool part's name
// -----------------------------------------------------------

export type AssistantToolName = (typeof ASSISTANT_TOOL_NAMES)[number];


// The mirrors in ASSISTANT_TOOL_SCHEMAS below repeat these two
// leaves constantly — named once so a table row stays one line
const STRING: JsonSchemaLite = { type: 'string' };
// Same shorthand for the integer leaves (the `limit` fields)
const INTEGER: JsonSchemaLite = { type: 'integer' };


// The keys dropped from SCHEMA nodes before comparing — pure
// documentation the container may add without breaking the
// contract (see the normalizeToolSchema banner below: `title`
// under `properties` stays)
const DOCUMENTATION_KEYS = new Set(['description', 'title', 'examples', '$schema', '$id', '$comment']);

// The keys whose value is a name → schema MAP rather than a
// schema: every key inside one is data, never documentation
const SCHEMA_MAP_KEYS = new Set(['properties', 'patternProperties', '$defs']);







// -----------------------------------------------------------
// ASSISTANT_TOOL_SCHEMAS
// -----------------------------------------------------------
//
// The JSON-schema mirrors of the tool types, in
// JSON-schema-lite: type / properties / required / enum /
// items and nothing else — enough to pin field names, kinds
// and closed value sets, small enough to write by hand and
// to serve verbatim. The container may add `description`
// (and the other documentation keys normalizeToolSchema
// drops from schema nodes) for the model's benefit without
// breaking the contract — a PROPERTY named `title` is data,
// not documentation, and stays compared.
//
// Used by:
//   - describeToolsContract (below)
//   - testing/index.tsx — referenceTools serves one entry per
//     name
//   - the container team — the README prints these as the
//     tools endpoint's required answer
// -----------------------------------------------------------

export const ASSISTANT_TOOL_SCHEMAS: Record<AssistantToolName, { input: JsonSchemaObject; output: JsonSchemaObject }> = {
  lookupSchedule: {
    input: {
      type: 'object',
      properties: {
        group: STRING,
        teacher: STRING,
        date: STRING,
        range: { type: 'string', enum: ['day', 'week'] },
      },
    },
    output: {
      type: 'object',
      properties: {
        lessons: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: STRING,
              start: STRING,
              end: STRING,
              room: STRING,
              teacher: STRING,
              group: STRING,
              kind: STRING,
            },
            required: ['title', 'start', 'end'],
          },
        },
        source: { type: 'string', enum: ['live', 'cache'] },
        note: STRING,
      },
      required: ['lessons', 'source'],
    },
  },

  searchNews: {
    input: {
      type: 'object',
      properties: {
        query: STRING,
        source: STRING,
        limit: INTEGER,
      },
    },
    output: {
      type: 'object',
      properties: {
        posts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: STRING,
              title: STRING,
              summary: STRING,
              date: STRING,
              source: STRING,
              url: STRING,
            },
            required: ['id', 'title', 'date', 'source'],
          },
        },
        // The container's own words when nothing matched
        // (optional — absent on a non-empty answer)
        note: STRING,
      },
      required: ['posts'],
    },
  },

  searchHandbook: {
    input: {
      type: 'object',
      properties: {
        query: STRING,
        limit: INTEGER,
      },
      required: ['query'],
    },
    output: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: STRING,
              title: STRING,
              excerpt: STRING,
              section: STRING,
              language: { type: 'string', enum: ['lt', 'en'] },
            },
            required: ['id', 'title', 'excerpt', 'language'],
          },
        },
      },
      required: ['entries'],
    },
  },
};







// -----------------------------------------------------------
// isAssistantToolName
// -----------------------------------------------------------
//
// The guard that narrows a wire string onto the closed set.
//
// Used by:
//   - hosts switching on a streamed tool part's name
// -----------------------------------------------------------

export function isAssistantToolName(name: string): name is AssistantToolName {
  return (ASSISTANT_TOOL_NAMES as readonly string[]).includes(name);
}







// -----------------------------------------------------------
// LookupScheduleInput
// -----------------------------------------------------------
//
// What the model fills in to ask for a timetable slice.
// Inputs are what the model fills in; outputs are what the
// container answers with — that split holds for all six
// shapes below.
//
// Used by:
//   - AssistantToolIo (below) — the lookupSchedule row, kept
//     in step with the JSON-schema mirror
// -----------------------------------------------------------

export interface LookupScheduleInput {
  group?: string;
  teacher?: string;
  // YYYY-MM-DD; the container defaults to today
  date?: string;
  range?: 'day' | 'week';
}







// -----------------------------------------------------------
// AssistantLesson
// -----------------------------------------------------------
//
// One lesson as the container answers it — `start`/`end` are
// ISO-8601 strings with an offset, never Date objects.
//
// Used by:
//   - LookupScheduleOutput (below) — the list's element
//   - testing/index.tsx — fixtureLessons is typed against it
// -----------------------------------------------------------

export interface AssistantLesson {
  title: string;
  start: string;
  end: string;
  room?: string;
  teacher?: string;
  group?: string;
  kind?: string;
}







// -----------------------------------------------------------
// LookupScheduleOutput
// -----------------------------------------------------------
//
// The container's timetable answer.
//
// Used by:
//   - AssistantToolIo (below) — the lookupSchedule row, kept
//     in step with the JSON-schema mirror
// -----------------------------------------------------------

export interface LookupScheduleOutput {
  lessons: AssistantLesson[];
  // 'cache' when the container answered from its last good
  // copy because the timetable source was down
  source: 'live' | 'cache';
  note?: string;
}







// -----------------------------------------------------------
// SearchNewsInput
// -----------------------------------------------------------
//
// What the model fills in to search the faculty's news.
//
// Used by:
//   - AssistantToolIo (below) — the searchNews row, kept in
//     step with the JSON-schema mirror
// -----------------------------------------------------------

export interface SearchNewsInput {
  query?: string;
  source?: string;
  limit?: number;
}







// -----------------------------------------------------------
// AssistantNewsPost
// -----------------------------------------------------------
//
// One news post as the container answers it — `date` is an
// ISO-8601 string.
//
// Used by:
//   - SearchNewsOutput (below) — the list's element
//   - testing/index.tsx — fixtureNewsPosts is typed against it
// -----------------------------------------------------------

export interface AssistantNewsPost {
  id: string;
  title: string;
  summary?: string;
  date: string;
  source: string;
  url?: string;
}







// -----------------------------------------------------------
// SearchNewsOutput
// -----------------------------------------------------------
//
// The container's news answer.
//
// Used by:
//   - AssistantToolIo (below) — the searchNews row, kept in
//     step with the JSON-schema mirror
// -----------------------------------------------------------

export interface SearchNewsOutput {
  posts: AssistantNewsPost[];
  note?: string;
}







// -----------------------------------------------------------
// SearchHandbookInput
// -----------------------------------------------------------
//
// What the model fills in to search the study handbook —
// `query` is the one required tool input in the contract.
//
// Used by:
//   - AssistantToolIo (below) — the searchHandbook row, kept
//     in step with the JSON-schema mirror
// -----------------------------------------------------------

export interface SearchHandbookInput {
  query: string;
  limit?: number;
}







// -----------------------------------------------------------
// AssistantHandbookEntry
// -----------------------------------------------------------
//
// One handbook hit as the container answers it.
//
// Used by:
//   - SearchHandbookOutput (below) — the list's element
//   - testing/index.tsx — fixtureHandbookEntries is typed
//     against it
// -----------------------------------------------------------

export interface AssistantHandbookEntry {
  id: string;
  title: string;
  excerpt: string;
  section?: string;
  language: AssistantLanguage;
}







// -----------------------------------------------------------
// SearchHandbookOutput
// -----------------------------------------------------------
//
// The container's handbook answer.
//
// Used by:
//   - AssistantToolIo (below) — the searchHandbook row, kept
//     in step with the JSON-schema mirror
// -----------------------------------------------------------

export interface SearchHandbookOutput {
  entries: AssistantHandbookEntry[];
}







// -----------------------------------------------------------
// AssistantToolIo
// -----------------------------------------------------------
//
// One lookup table from name to both sides — the two mapped
// types below read it, so a fourth tool is one row here.
//
// Used by:
//   - AssistantToolInput / AssistantToolOutput (below)
// -----------------------------------------------------------

export interface AssistantToolIo {
  lookupSchedule: { input: LookupScheduleInput; output: LookupScheduleOutput };
  searchNews: { input: SearchNewsInput; output: SearchNewsOutput };
  searchHandbook: { input: SearchHandbookInput; output: SearchHandbookOutput };
}







// -----------------------------------------------------------
// AssistantToolInput
// -----------------------------------------------------------
//
// The input shape for one frozen name, looked up by type.
//
// Used by:
//   - hosts typing a tool part's input off its name
// -----------------------------------------------------------

export type AssistantToolInput<N extends AssistantToolName> = AssistantToolIo[N]['input'];







// -----------------------------------------------------------
// AssistantToolOutput
// -----------------------------------------------------------
//
// The output shape for one frozen name, looked up by type.
//
// Used by:
//   - hosts typing a tool part's output off its name
// -----------------------------------------------------------

export type AssistantToolOutput<N extends AssistantToolName> = AssistantToolIo[N]['output'];







// -----------------------------------------------------------
// JsonSchemaLite
// -----------------------------------------------------------
//
// The schema dialect the mirrors are written in: type /
// properties / required / enum / items and nothing else —
// enough to pin field names, kinds and closed value sets,
// small enough to write by hand and to serve verbatim.
//
// Used by:
//   - JsonSchemaObject (below) — the property values
//   - STRING / INTEGER (above) — the shared leaves
// -----------------------------------------------------------

export type JsonSchemaLite =
  | JsonSchemaObject
  | { type: 'array'; items: JsonSchemaLite }
  | { type: 'string'; enum?: string[] }
  | { type: 'integer' | 'number' | 'boolean' };







// -----------------------------------------------------------
// JsonSchemaObject
// -----------------------------------------------------------
//
// The object node — what every tool's input and output mirror
// is at its root.
//
// Used by:
//   - ASSISTANT_TOOL_SCHEMAS (above) — both sides of every row
//   - JsonSchemaLite (above) — the first arm of the union
// -----------------------------------------------------------

export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, JsonSchemaLite>;
  required?: string[];
}







// -----------------------------------------------------------
// normalizeToolSchema
// -----------------------------------------------------------
//
// The form two schemas are compared in: documentation keys
// dropped, object keys sorted, lists of primitives (required,
// enum) sorted — so `required: ['b', 'a']` equals
// `['a', 'b']` and a served `description` costs nothing —
// while lists of schemas keep their order. Anything that is
// not a plain object or array passes through. Documentation
// keys are dropped on SCHEMA nodes only: the keys of a
// `properties` / `patternProperties` / `$defs` map are field
// names, and a field may be CALLED `title` (all three outputs
// have one) — dropping it there would blind the contract to a
// removed or retyped field.
//
// Used by:
//   - describeToolsContract (below)
//   - tests proving a drifted schema no longer equals ours
// -----------------------------------------------------------

export function normalizeToolSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    const primitives = value.every((item) => item === null || typeof item !== 'object');
    return primitives ? [...value].sort((a, b) => String(a).localeCompare(String(b))) : value.map(normalizeToolSchema);
  }
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if (DOCUMENTATION_KEYS.has(key)) continue;
    normalized[key] = SCHEMA_MAP_KEYS.has(key) ? normalizeSchemaMap(record[key]) : normalizeToolSchema(record[key]);
  }
  return normalized;
}







// -----------------------------------------------------------
// normalizeSchemaMap
// -----------------------------------------------------------
//
// Every key kept, every VALUE normalized as a schema node; a
// malformed map (not a plain object) is left to the ordinary
// walk so the comparison still fails loudly on shape.
//
// Used by:
//   - normalizeToolSchema (above) — the SCHEMA_MAP_KEYS values
// -----------------------------------------------------------

function normalizeSchemaMap(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return normalizeToolSchema(value);
  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    normalized[key] = normalizeToolSchema(record[key]);
  }
  return normalized;
}







// -----------------------------------------------------------
// AssistantToolDescriptor
// -----------------------------------------------------------
//
// One entry of the served tools list — the schemas arrive as
// `unknown` and are only ever compared in normalized form.
//
// Used by:
//   - fetchAssistantTools / describeToolsContract (below)
//   - testing/index.tsx — referenceTools' return type
// -----------------------------------------------------------

export interface AssistantToolDescriptor {
  name: string;
  input: unknown;
  output: unknown;
}







// -----------------------------------------------------------
// AssistantToolsConfig
// -----------------------------------------------------------
//
// The transport config minus what a one-shot GET never needs
// (no first-byte deadline, no failure listener).
//
// Used by:
//   - fetchAssistantTools (below) — its config parameter
// -----------------------------------------------------------

export type AssistantToolsConfig = Pick<AssistantTransportConfig, 'baseUrl' | 'fetch' | 'getAuthToken' | 'clientVersion' | 'language'>;







// -----------------------------------------------------------
// fetchAssistantTools
// -----------------------------------------------------------
//
// GET baseUrl + /api/assistant/tools with the same three
// faculty headers the chat sends (a guest may ask), expecting
// `{ tools: [{ name, input, output }] }`. A non-2xx or a
// throwing fetch becomes the same AssistantTransportError the
// chat throws; an envelope that is not that shape is a
// 'server' failure — never a half-read list.
//
// Used by:
//   - the container's integration job, through
//     describeToolsContract
// -----------------------------------------------------------

export async function fetchAssistantTools(config: AssistantToolsConfig): Promise<AssistantToolDescriptor[]> {
  const run = resolveFetch(config.fetch);
  const headers = await buildAssistantHeaders(config, { accept: 'application/json' });

  let response: Response;
  try {
    response = await run(joinUrl(config.baseUrl, ASSISTANT_TOOLS_PATH), { method: 'GET', headers });
  } catch (error) {
    throw new AssistantTransportError(toAssistantFailure(error), { cause: error });
  }
  if (!response.ok) {
    throw new AssistantTransportError(toAssistantFailure(response, await readFailureBody(response)));
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new AssistantTransportError({ code: 'server', status: response.status, message: 'Tools envelope is not JSON' }, { cause: error });
  }
  const tools = (body as { tools?: unknown })?.tools;
  if (!Array.isArray(tools) || !tools.every(isDescriptor)) {
    throw new AssistantTransportError({ code: 'server', status: response.status, message: 'Malformed tools envelope' });
  }
  return tools.map(({ name, input, output }) => ({ name, input, output }));
}







// -----------------------------------------------------------
// isDescriptor
// -----------------------------------------------------------
//
// The envelope guard: a string name plus both schema keys
// PRESENT — their values stay unknown on purpose.
//
// Used by:
//   - fetchAssistantTools (above) — validates every entry
// -----------------------------------------------------------

function isDescriptor(value: unknown): value is AssistantToolDescriptor {
  if (!value || typeof value !== 'object') return false;
  const shaped = value as { name?: unknown; input?: unknown; output?: unknown };
  return typeof shaped.name === 'string' && 'input' in shaped && 'output' in shaped;
}







// -----------------------------------------------------------
// describeToolsContract
// -----------------------------------------------------------
//
//   describeToolsContract('fake server', () => fetchAssistantTools(cfg))
//
// A jest describe: the served list carries every frozen
// name, and each tool's input and output equal our mirror in
// normalized form. Run against the fake in unit tests and
// against the real container in its integration job — the
// same seven cases either way.
//
// Used by:
//   - tools/__tests__/contract.test.ts — green against the
//     reference fake, proven red against drifted servers
//   - the container's integration job
// -----------------------------------------------------------

export function describeToolsContract(name: string, load: () => Promise<AssistantToolDescriptor[]>): void {
  describe(`tools contract: ${name}`, () => {
    let served: AssistantToolDescriptor[] = [];

    beforeAll(async () => {
      served = await load();
    });

    it('serves every frozen tool name', () => {
      const names = served.map((tool) => tool.name);
      for (const toolName of ASSISTANT_TOOL_NAMES) expect(names).toContain(toolName);
    });

    for (const toolName of ASSISTANT_TOOL_NAMES) {
      it(`${toolName}: the served input schema mirrors ours`, () => {
        const tool = served.find((candidate) => candidate.name === toolName);
        expect(tool).toBeDefined();
        expect(normalizeToolSchema(tool?.input)).toEqual(normalizeToolSchema(ASSISTANT_TOOL_SCHEMAS[toolName].input));
      });

      it(`${toolName}: the served output schema mirrors ours`, () => {
        const tool = served.find((candidate) => candidate.name === toolName);
        expect(tool).toBeDefined();
        expect(normalizeToolSchema(tool?.output)).toEqual(normalizeToolSchema(ASSISTANT_TOOL_SCHEMAS[toolName].output));
      });
    }
  });
}
