// -----------------------------------------------------------
//  [*] Test support — a scripted model over the local runtime
//
//  The suites render the REAL upstream primitives under the
//  REAL local runtime; only the model is scripted. A script is
//  one event list per run — text deltas, reasoning deltas, a
//  tool call (with or without its result), a hold that waits
//  for the test to release it or the runtime to abort, a throw,
//  a final status. Each run consumes the next list; a script
//  that runs out replays its last list, so a regenerate after
//  a one-run script answers again. Every run's options are
//  recorded for assertions on what the runtime sent. The kit
//  never imports an engine, and neither does this file: the
//  adapter is the upstream ChatModelAdapter shape, nothing
//  more.
// -----------------------------------------------------------

import { fireEvent, waitFor, type RenderResult } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
  type ChatModelRunOptions,
  type MessageStatus,
  type ThreadAssistantMessagePart,
  type ThreadMessageLike,
} from '@assistant-ui/react-native';

import type { AssistantLabels } from '../../core/types';


// -----------------------------------------------------------
// The script vocabulary
// -----------------------------------------------------------

// The model's arguments are JSON by the upstream contract — the
// same shape the runtime types them as, spelled out here so the
// package never reaches into a transitive dependency for it
export type ScriptedJson = null | string | number | boolean | readonly ScriptedJson[] | { readonly [key: string]: ScriptedJson };

export type ScriptedTool = { name: string; input: { readonly [key: string]: ScriptedJson }; output?: unknown; isError?: boolean };

export type ScriptedEvent =
  | { text: string }
  | { reasoning: string }
  | { tool: ScriptedTool }
  | { toolResult: { output: unknown; isError?: boolean } }
  | { wait: true }
  | { throw: string }
  | { status: MessageStatus };

export type ScriptedRun = ScriptedEvent[];

export interface ScriptedModel {
  adapter: ChatModelAdapter;
  calls: ChatModelRunOptions[];
  // Lets the run past its current `wait`
  release(): void;
}


// -----------------------------------------------------------
// createScriptedModel
// -----------------------------------------------------------

export function createScriptedModel(runs: ScriptedRun[]): ScriptedModel {
  const calls: ChatModelRunOptions[] = [];
  let waiters: (() => void)[] = [];
  let toolSerial = 0;

  const release = () => {
    const pending = waiters;
    waiters = [];
    pending.forEach((resolve) => resolve());
  };

  const hold = (abortSignal: AbortSignal) =>
    new Promise<void>((resolve) => {
      if (abortSignal.aborted) return resolve();
      waiters.push(resolve);
      abortSignal.addEventListener('abort', () => resolve(), { once: true });
    });

  const adapter: ChatModelAdapter = {
    async *run(options) {
      calls.push(options);
      const run = runs[Math.min(calls.length, runs.length) - 1] ?? [];
      const content: ThreadAssistantMessagePart[] = [];

      // The last part of a kind, so consecutive deltas grow one
      // part instead of stacking many
      const last = () => content[content.length - 1];

      for (const event of run) {
        if (options.abortSignal.aborted) return;
        if ('text' in event) {
          const tail = last();
          if (tail?.type === 'text') content[content.length - 1] = { type: 'text', text: tail.text + event.text };
          else content.push({ type: 'text', text: event.text });
        } else if ('reasoning' in event) {
          const tail = last();
          if (tail?.type === 'reasoning') content[content.length - 1] = { type: 'reasoning', text: tail.text + event.reasoning };
          else content.push({ type: 'reasoning', text: event.reasoning });
        } else if ('tool' in event) {
          toolSerial += 1;
          content.push({
            type: 'tool-call',
            toolCallId: `call-${toolSerial}`,
            toolName: event.tool.name,
            args: event.tool.input,
            argsText: JSON.stringify(event.tool.input),
            ...(event.tool.output !== undefined ? { result: event.tool.output } : {}),
            ...(event.tool.isError ? { isError: true } : {}),
          });
        } else if ('toolResult' in event) {
          const tail = last();
          if (tail?.type !== 'tool-call') throw new Error('scriptedRuntime: toolResult needs a tool before it');
          content[content.length - 1] = {
            ...tail,
            result: event.toolResult.output,
            ...(event.toolResult.isError ? { isError: true } : {}),
          };
        } else if ('wait' in event) {
          await hold(options.abortSignal);
          if (options.abortSignal.aborted) return;
          continue;
        } else if ('throw' in event) {
          throw new Error(event.throw);
        } else {
          yield { content: [...content], status: event.status };
          continue;
        }
        yield { content: [...content] };
      }
    },
  };

  return { adapter, calls, release };
}


// -----------------------------------------------------------
// ScriptedThread — the provider the suites render under
// -----------------------------------------------------------

export function ScriptedThread({
  model,
  initialMessages,
  children,
}: {
  model: ScriptedModel;
  initialMessages?: readonly ThreadMessageLike[];
  children: ReactNode;
}) {
  const runtime = useLocalRuntime(model.adapter, { initialMessages });
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}


// -----------------------------------------------------------
// Fixtures + drivers
// -----------------------------------------------------------

export const LABELS: AssistantLabels = {
  placeholder: 'Klauskite asistento…',
  send: 'Siųsti',
  cancel: 'Stabdyti',
  retry: 'Bandyti dar kartą',
  copy: 'Kopijuoti',
  copied: 'Nukopijuota',
  regenerate: 'Generuoti iš naujo',
  thinking: 'Mąstoma',
  emptyTitle: 'Sveiki!',
  emptyBody: 'Paklauskite apie tvarkaraštį, naujienas ar studijas.',
  errorTitle: 'Nepavyko atsakyti',
  errorBody: 'Patikrinkite ryšį ir bandykite dar kartą.',
  toolRunning: 'Ieškoma…',
  toolDone: 'Rasta',
  toolFailed: 'Nepavyko',
  showDetails: 'Rodyti detales',
  hideDetails: 'Slėpti detales',
  previousBranch: 'Ankstesnis atsakymas',
  nextBranch: 'Kitas atsakymas',
  scrollToLatest: 'Naujausia žinutė',
};

export type View = RenderResult;

// Type + press send, the way a reader would
export const send = async (view: View, text: string) => {
  await fireEvent.changeText(view.getByTestId('assistantuikit-composer-input'), text);
  await fireEvent.press(view.getByTestId('assistantuikit-composer-send'));
};

// The run is over once the composer offers Send again
export const settled = (view: View) => waitFor(() => expect(view.getByTestId('assistantuikit-composer-send')).toBeTruthy());

// The run is in flight once the composer offers Cancel
export const running = (view: View) => waitFor(() => expect(view.getByTestId('assistantuikit-composer-cancel')).toBeTruthy());
