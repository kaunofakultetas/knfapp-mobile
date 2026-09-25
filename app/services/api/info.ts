// -----------------------------------------------------------
//  [*] API — faculty info
//
//  The static faculty handbook: contacts, links, opening
//  hours, study programs and FAQ. Content is served per
//  language — pass the ACTIVE i18n language so the screen
//  refetches on a language switch.
//
//  Split into:
//
//    InfoContact         — one person/office entry
//    InfoContactCategory — a titled contact group
//    InfoLink            — external link with icon name
//    InfoHours           — opening hours of one place
//    InfoProgram         — one study program
//    InfoFaq             — one question/answer pair
//    InfoGeneralContact  — the faculty's main contact block
//    FacultyInfoResponse — the whole handbook payload
//    fetchFacultyInfo    — load it for a language
// -----------------------------------------------------------

// Shared client core
import { api, request } from './client';







// -----------------------------------------------------------
// InfoContact
// -----------------------------------------------------------
//
// Every field is pre-localized display text; phone arrives in
// display form ("(8 5) 219 3000") and the screen strips it
// into a tel: URI itself. Absent optionals drop their row.
//
// Used by:
//   - InfoContactCategory (below)
//   - app/(main)/info/index.tsx — contact rows
// -----------------------------------------------------------

export interface InfoContact {
  name: string;
  phone?: string;
  email?: string;
  room?: string;
  position?: string;
}







// -----------------------------------------------------------
// InfoContactCategory
// -----------------------------------------------------------
//
// `category` is the already-translated group heading — the
// grouping and its order are decided in the content file, the
// screen renders the groups exactly as served. `nameLang` is
// set when the group was BORROWED from another language's
// scrape (English borrows the Lithuanian one): its heading and
// names stay in that language, and the screen says so and
// hands them to a matching screen-reader voice.
//
// Used by:
//   - FacultyInfoResponse (below)
//   - app/(main)/info/index.tsx — contacts section
// -----------------------------------------------------------

export interface InfoContactCategory {
  category: string;
  items: InfoContact[];
  nameLang?: string;
}







// -----------------------------------------------------------
// InfoLink
// -----------------------------------------------------------
//
// `icon` is a loose backend name ("globe", "school") that the
// screen maps to an Ionicons glyph through its ICON_MAP — an
// unknown name falls back to the generic link icon, so new
// content never breaks the build.
//
// Used by:
//   - FacultyInfoResponse (below)
//   - app/(main)/info/index.tsx — quick links section
// -----------------------------------------------------------

export interface InfoLink {
  title: string;
  url: string;
  icon: string;
}







// -----------------------------------------------------------
// InfoHours
// -----------------------------------------------------------
//
// `schedule` is free-form display text ("I-V 09:00-18:00"),
// never structured times — nothing parses it. `note` is
// required on the wire but often an empty string, which the
// screen renders as no note row.
//
// Used by:
//   - FacultyInfoResponse (below)
//   - app/(main)/info/index.tsx — opening hours section
// -----------------------------------------------------------

export interface InfoHours {
  place: string;
  address: string;
  schedule: string;
  note: string;
}







// -----------------------------------------------------------
// InfoProgram
// -----------------------------------------------------------
//
// Display strings straight from the handbook. `duration` is
// prose ("4 metai" / "4 years"), not a number with a unit, and
// OPTIONAL: the scraper writes it only when a programme card
// states one, so the wire omits it for most scraped entries
// (it was typed required and rendered as a blank line —
// KNF-124). `note` is an extra line in the answer's language
// ("Taught in English"); `nameLang` marks a registered name
// kept in another language than the answer's (English
// borrows the Lithuanian scrape).
//
// Used by:
//   - FacultyInfoResponse (below)
//   - app/(main)/info/index.tsx — study programs section
// -----------------------------------------------------------

export interface InfoProgram {
  name: string;
  degree: string;
  duration?: string;
  note?: string;
  nameLang?: string;
}







// -----------------------------------------------------------
// InfoFaq
// -----------------------------------------------------------
//
// `a` is plain text rendered verbatim — no markdown or HTML.
// The accordion keys its expanded state on `q`, so two
// entries sharing a question would open and close together.
//
// Used by:
//   - FacultyInfoResponse (below)
//   - app/(main)/info/index.tsx — FAQ accordion
// -----------------------------------------------------------

export interface InfoFaq {
  q: string;
  a: string;
}







// -----------------------------------------------------------
// InfoGeneralContact
// -----------------------------------------------------------
//
// The faculty's one main address/phone/email triple — all
// three required and pre-formatted for display; the screen
// derives the tel:/mailto: actions from them itself.
//
// Used by:
//   - FacultyInfoResponse (below)
//   - app/(main)/info/index.tsx — footer contact block
// -----------------------------------------------------------

export interface InfoGeneralContact {
  address: string;
  phone: string;
  email: string;
}







// -----------------------------------------------------------
// FacultyInfoResponse
// -----------------------------------------------------------
//
// general_contact stays snake_case — the backend serves this
// payload from a static file, not through the camelCase
// serializers.
//
// Every section is optional: the screen also renders this
// shape from its per-language cache, and an older cached
// payload may omit whole sections.
//
// Used by:
//   - fetchFacultyInfo (below)
//   - app/(main)/info/index.tsx — the whole screen
// -----------------------------------------------------------

export interface FacultyInfoResponse {
  contacts?: InfoContactCategory[];
  links?: InfoLink[];
  hours?: InfoHours[];
  programs?: InfoProgram[];
  faq?: InfoFaq[];
  general_contact?: InfoGeneralContact;
}







// -----------------------------------------------------------
// fetchFacultyInfo
// -----------------------------------------------------------
//
//   fetchFacultyInfo()      — Lithuanian content
//   fetchFacultyInfo('en')  — English content
//
// Used by:
//   - app/(main)/info/index.tsx — load + language refetch
// -----------------------------------------------------------

export const fetchFacultyInfo = (lang: string = 'lt') =>
  request(api.get<FacultyInfoResponse>('/info', { params: { lang } }));
