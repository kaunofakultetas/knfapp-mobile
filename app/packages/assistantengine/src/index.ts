// -----------------------------------------------------------
//  [*] @knf/assistantengine — public surface
//
//  Everything faculty-specific between the upstream runtime
//  and the AI container: the transport that carries session,
//  language and client version and turns every wire problem
//  into one typed failure; the runtime hook that
//  auto-continues after server-executed tools; the failure
//  hook that reads the thread's error back as that value;
//  the frozen tool contract with its schema mirrors and the
//  conformance describe. The upstream runtime provider rides
//  through here so the app imports one package for runtime
//  concerns; the testing doubles ship from
//  '@knf/assistantengine/testing'.
//
//  Used by:
//    - the mobile app's assistant screen wiring, once it lands
//    - the container's integration job (the contract describes)
// -----------------------------------------------------------

export { AssistantRuntimeProvider } from '@assistant-ui/react-native';
export type { AssistantRuntime } from '@assistant-ui/react-native';
export { useThreadTokenUsage as useAssistantTokenUsage } from '@assistant-ui/ai-sdk';
export type { ThreadTokenUsage as AssistantTokenUsage } from '@assistant-ui/ai-sdk';

export { useKnfAssistantRuntime } from './hooks/useKnfAssistantRuntime';
export type { KnfAssistantRuntimeOptions } from './hooks/useKnfAssistantRuntime';
export { useAssistantFailure } from './hooks/useAssistantFailure';

export {
  buildAssistantHeaders,
  createAssistantFetch,
  createKnfAssistantTransport,
  joinUrl,
  resolveFetch,
} from './core/transport';
export type { AssistantHeadersConfig, KnfAssistantTransport } from './core/transport';

export { isAssistantTransportError, parseRetryAfter, readFailureBody, toAssistantFailure } from './core/errors';

export {
  ASSISTANT_CHAT_PATH,
  ASSISTANT_CLIENT_HEADER,
  ASSISTANT_TOOLS_PATH,
  AssistantTransportError,
} from './core/types';
export type {
  AssistantFailure,
  AssistantFailureCode,
  AssistantLanguage,
  AssistantTransportConfig,
} from './core/types';

export {
  ASSISTANT_TOOL_NAMES,
  ASSISTANT_TOOL_SCHEMAS,
  describeToolsContract,
  fetchAssistantTools,
  isAssistantToolName,
  normalizeToolSchema,
} from './tools/contract';
export type {
  AssistantHandbookEntry,
  AssistantLesson,
  AssistantNewsPost,
  AssistantToolDescriptor,
  AssistantToolInput,
  AssistantToolIo,
  AssistantToolName,
  AssistantToolOutput,
  AssistantToolsConfig,
  JsonSchemaLite,
  JsonSchemaObject,
  LookupScheduleInput,
  LookupScheduleOutput,
  SearchHandbookInput,
  SearchHandbookOutput,
  SearchNewsInput,
  SearchNewsOutput,
} from './tools/contract';
