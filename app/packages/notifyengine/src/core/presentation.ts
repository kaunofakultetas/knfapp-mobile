// -----------------------------------------------------------
//  [*] notifyengine — foreground presentation
//
//  When a push arrives with the app OPEN, the OS asks "show
//  it?" and gives a hard deadline. The answer here is DATA-
//  DRIVEN: a policy map keyed by the payload's type, with one
//  default rule — per-notification behavior travels with the
//  payload, never as app-code branching. The safety rails,
//  each pinned by a test:
//
//    - the decision races an INTERNAL deadline well inside the
//      OS one; on overrun the safe default is SHOW — a slow
//      policy must never eat a notification;
//    - a throwing suppress predicate falls back to the rule —
//      "is this chat room open?" crashing must not suppress
//      or hang anything;
//    - the handler resolves exactly once per notification.
//
//  Used by:
//    - engine.ts — installed as the device's foreground handler
// -----------------------------------------------------------

import type { PresentationPolicy, PresentationRule } from './types';


const INTERNAL_DEADLINE_MS = 1_500;

// When everything else has gone wrong, showing is the behavior
// nobody files a bug about
const SHOW_EVERYTHING: PresentationRule = { banner: true, list: true, sound: true, badge: true };


export function createForegroundHandler(policy: PresentationPolicy) {
  return (payload: { type: string; data: Record<string, string> }): Promise<PresentationRule> => {
    const decide = (): PresentationRule => {
      // OWN properties only — a payload typed 'constructor' or
      // '__proto__' must fall to the default, not to whatever
      // the prototype chain happens to hold
      const rule = Object.prototype.hasOwnProperty.call(policy.rules, payload.type)
        ? policy.rules[payload.type]
        : policy.default;
      if (policy.suppress) {
        let suppressed = false;
        try {
          suppressed = policy.suppress(payload.type, payload.data);
        } catch {
          // A broken predicate applies the rule unchanged
          suppressed = false;
        }
        if (suppressed) {
          // Suppression silences the surfaces, not the badge —
          // the count stays honest for the muted room
          return { ...rule, banner: false, list: false, sound: false };
        }
      }
      // A copy — a caller mutating the resolved rule must not
      // corrupt the shared policy map for later notifications
      return { ...rule };
    };

    // Settles exactly once: the deadline resolves SHOW if the
    // decision somehow hangs; a settled flag mutes the loser
    return new Promise<PresentationRule>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(SHOW_EVERYTHING);
        }
      }, INTERNAL_DEADLINE_MS);
      try {
        const rule = decide();
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(rule);
        }
      } catch {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(SHOW_EVERYTHING);
        }
      }
    });
  };
}
