// -----------------------------------------------------------
//  [*] AssistantStub — the pre-container stand-in model
//
//  The assistant tab runs on this adapter until the AI
//  container lands: a local ChatModelAdapter that picks one of
//  five prepared faculty replies per language and streams it
//  word by word, so the thread, the streaming markdown and the
//  cancel path all exercise for real with no wire at all. Every
//  reply says out loud that it is a stand-in, and the pool is
//  deliberately markdown-rich — bold, lists, a link, a code
//  fence — so the surfaces show what they can render. The wire
//  path (createKnfAssistantTransport + useKnfAssistantRuntime)
//  replaces this adapter once the backend exists; nothing else
//  in the app changes when it does.
//
//  The language is read through a callback ON EVERY RUN, not
//  captured at creation — a language flip mid-session answers
//  in the new language without remounting the runtime. `pick`
//  and `delayMs` exist so tests can fix the reply and drop the
//  pauses; the app passes neither.
//
//  Split into:
//
//    ASSISTANT_STUB_REPLIES    — the two five-reply pools
//    createAssistantStubAdapter — the adapter factory
// -----------------------------------------------------------

// The adapter shape rides through the engine's local-runtime
// door — the upstream is never imported by the app directly
import type { ChatModelAdapter } from '@knf/assistantengine';


// What a host injects: the live language, and the two test
// seams (reply choice and inter-word pause)
interface AssistantStubDeps {
  language: () => 'lt' | 'en';
  pick?: (count: number) => number;
  delayMs?: number;
}


// A plain timer promise; the abort check happens around it, so
// a cancelled run wakes and returns instead of yielding on
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));




// -----------------------------------------------------------
// ASSISTANT_STUB_REPLIES
// -----------------------------------------------------------
//
// Five replies per language, Lithuanian first. Each shape is
// there on purpose: bold + a bulleted list, a link, a code
// fence, a plain two-paragraph answer, a numbered list — one
// of everything the markdown renderer draws. Every reply also
// admits it is prepared text, so no user mistakes the stub for
// the real assistant.
//
// Used by:
//   - createAssistantStubAdapter (below)
//   - __tests__/assistantScreen.test.tsx — pins the fixed reply
// -----------------------------------------------------------

export const ASSISTANT_STUB_REPLIES: Record<'lt' | 'en', string[]> = {
  lt: [
    '**Sveiki!** Aš — fakulteto pagalbininkas. Kol kas atsakau iš anksto paruoštais tekstais, bet jau galiu parodyti, apie ką kalbėsimės:\n\n- Paskaitų tvarkaraščiai ir auditorijos\n- Fakulteto naujienos ir renginiai\n- Studijų tvarka ir dokumentai',
    'Naujausią ir tiksliausią informaciją apie fakultetą visada rasite svetainėje [knf.vu.lt](https://knf.vu.lt).\n\nKol kas atsakau iš anksto paruoštais tekstais, todėl svarbius terminus pasitikrinkite ten.',
    'Informatikos studentams — pirmoji programa fakultete atrodo taip:\n\n```python\nprint("Labas, Kauno fakultete!")\n```\n\nKol kas atsakau iš anksto paruoštais tekstais, tad kodo dar netikrinu — bet greitai!',
    'Vilniaus universiteto Kauno fakultetas įsikūręs Kauno senamiestyje, Muitinės gatvėje. Čia studijuojamos kalbos, komunikacija, informatika ir verslo studijos.\n\nKol kas atsakau iš anksto paruoštais tekstais — kai įsijungs tikrasis asistentas, į šį klausimą atsakysiu tiksliai ir asmeniškai.',
    'Kaip susirasti savo tvarkaraštį programėlėje:\n\n1. Atidarykite skirtuką „Tvarkaraštis“\n2. Pasirinkite savo grupę ir semestrą\n3. Programėlė įsimins pasirinkimą\n\nKol kas atsakau iš anksto paruoštais tekstais, tad tikslų savo sąrašą rasite ten.',
  ],
  en: [
    '**Hello!** I am the faculty helper. For now I answer with prepared texts, but I can already show what we will talk about:\n\n- Lecture timetables and rooms\n- Faculty news and events\n- Study rules and documents',
    'The newest and most accurate information about the faculty is always at [knf.vu.lt](https://knf.vu.lt).\n\nFor now I answer with prepared texts, so double-check important deadlines there.',
    'For informatics students — the first program at the faculty looks like this:\n\n```python\nprint("Hello, Kaunas Faculty!")\n```\n\nFor now I answer with prepared texts, so I do not check code yet — but soon!',
    'Vilnius University Kaunas Faculty sits in the Kaunas Old Town, on Muitinės street. It teaches languages, communication, informatics and business studies.\n\nFor now I answer with prepared texts — once the real assistant is switched on, I will answer this question precisely and personally.',
    'How to find your timetable in the app:\n\n1. Open the "Schedule" tab\n2. Pick your group and semester\n3. The app remembers the choice\n\nFor now I answer with prepared texts, so your exact list is there.',
  ],
};




// -----------------------------------------------------------
// createAssistantStubAdapter
// -----------------------------------------------------------
//
//   createAssistantStubAdapter({ language })
//     — the app's call: random reply, ~35 ms between words
//   createAssistantStubAdapter({ language, pick: () => 0, delayMs: 0 })
//     — a test's call: fixed reply, no pauses
//
// Each run picks one reply for the CURRENT language and yields
// cumulative snapshots — every chunk carries the WHOLE text so
// far, never a delta, which is the local-runtime contract. The
// split is on single spaces, so newlines stay glued to their
// words and the final snapshot is the reply byte for byte.
// options.abortSignal is checked before every yield (and again
// after every pause): a cancelled run returns silently and the
// runtime keeps whatever text already landed.
//
// Used by:
//   - app/(main)/tabs/assistant.tsx — the assistant tab
// -----------------------------------------------------------

export function createAssistantStubAdapter(deps: AssistantStubDeps): ChatModelAdapter {

  const {
    language,
    pick = (count: number) => Math.floor(Math.random() * count),
    delayMs = 35,
  } = deps;


  return {
    async *run(options) {

      // An out-of-range pick (a misbehaving injector) falls to
      // the first reply rather than yielding nothing
      const pool = ASSISTANT_STUB_REPLIES[language()];
      const reply = pool[pick(pool.length)] ?? pool[0];


      const words = reply.split(' ');
      let soFar = '';
      for (const word of words) {
        soFar = soFar === '' ? word : `${soFar} ${word}`;
        if (delayMs > 0) await sleep(delayMs);
        if (options.abortSignal.aborted) return;
        yield { content: [{ type: 'text', text: soFar }] };
      }
    },
  };
}
