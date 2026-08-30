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
// Used by:
//   - FacultyInfoResponse (below)
//   - app/(main)/info/index.tsx — contacts section
// -----------------------------------------------------------

export interface InfoContactCategory {
  category: string;
  items: InfoContact[];
}







// -----------------------------------------------------------
// InfoLink
// -----------------------------------------------------------
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
// Used by:
//   - FacultyInfoResponse (below)
//   - app/(main)/info/index.tsx — study programs section
// -----------------------------------------------------------

export interface InfoProgram {
  name: string;
  degree: string;
  duration: string;
}







// -----------------------------------------------------------
// InfoFaq
// -----------------------------------------------------------
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
