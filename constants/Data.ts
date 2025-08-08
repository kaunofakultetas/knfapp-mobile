import { ChatRoom, NewsPost, Poll } from '@/types';

// Mock Chat Rooms Data
export const MOCK_CHAT_ROOMS: ChatRoom[] = [
  {
    id: "1",
    name: "ISKS 2023",
    lastActivity: "09:30",
    unreadCount: 2,
    messages: [
      {
        id: "1a",
        text: "Hello guys, welcome!",
        time: "07:50",
        user: "Tomer",
        isOwn: false,
      },
      {
        id: "1b",
        text: "Eglė: Sveiki, Pirmakursiai!",
        time: "09:30",
        user: "Eglė",
        isOwn: false,
      },
    ],
  },
  {
    id: "2",
    name: "Eglė (Kūratorė)",
    lastActivity: "12:50",
    unreadCount: 0,
    messages: [
      {
        id: "2a",
        text: "Guys, who's awake? 🙏🏽",
        time: "12:50",
        user: "Team Leader",
        isOwn: false,
      },
      {
        id: "2b",
        text: "Susitinkam liepų kiemely",
        time: "09:13",
        user: "Eglė",
        isOwn: false,
      },
    ],
  },
];

// Mock News Posts Data
export const MOCK_NEWS_POSTS: NewsPost[] = [
  {
    id: '1',
    title: 'Mokslininkai atskleidžia, kokias klaidas socialinių tinklų rinkodaroje dažniausiai daro prekiniai ženklai',
    date: '2023 m. liepos 20 d.',
    imageUrl: 'https://www.knf.vu.lt/dokumentai/nuotraukos/Vilte_Lubyte_vilniaus_universiteto_kauno_fakultetas.jpg',
    author: 'Dr. Viltė Lubytė',
    likes: 86,
    comments: 4,
    shares: 2,
    content: `Vilniaus universiteto Kauno fakulteto tyrimais nustatyta, kad daugelis prekių ženklų daro esmines klaidas socialinių tinklų rinkodaroje.

Tyrime dalyvavo 500 įmonių atstovų ir 1000 vartotojų. Paaiškėjo, kad dažniausiai daromos klaidos:

1. Nepakankamas turinio planavimas
2. Netinkama tikslinės auditorijos analizė  
3. Per dažni pardavimo pranešimai
4. Nepakankamas bendravimas su sekėjais

Dr. Viltė Lubytė teigia: "Socialinių tinklų rinkodaroje svarbiausia yra nuoseklumas ir autentiškumas. Prekių ženklai turi suprasti, kad socialiniai tinklai yra vieta bendravimui, o ne tik reklamai."

Tyrimas atskleidė, kad sėkmingiausios kompanijos socialiniuose tinkluose skiria 70% laiko turinio kūrimui ir tik 30% tiesioginei reklamai.`
  },
  {
    id: '2',
    title: 'Doc. dr. Šarūnas Grigaliūnas: „Nauji ES kibernetinio saugumo iššūkiai – augantis aukštos kvalifikacijos specialistų poreikis"',
    date: '2023 m. liepos 18 d.',
    imageUrl: 'https://www.knf.vu.lt/dokumentai/nuotraukos/ES_duomenys_vilniaus_universiteto_kauno_fakultetas.jpg',
    author: 'Doc. dr. Šarūnas Grigaliūnas',
    likes: 128,
    comments: 7,
    shares: 5,
    content: `Europos Sąjungos kibernetinio saugumo direktyvos kelia naujus iššūkius organizacijoms visoje Europoje.

Doc. dr. Šarūnas Grigaliūnas, VU Kauno fakulteto Informatikos instituto vadovas, pabrėžia, kad didėjantys kibernetinio saugumo reikalavimai reikalauja ir kvalifikuotų specialistų.

"Naujosios ES direktyvos numato griežtesnius reikalavimus kritinės infrastruktūros apsaugai. Tai reiškia, kad organizacijos turi investuoti ne tik į technologijas, bet ir į žmogiškuosius išteklius", - teigia doc. dr. Š. Grigaliūnas.

Pagrindiniai iššūkiai:
• Specialistų trūkumas rinkoje
• Nuolatinis technologijų tobulėjimas
• Reikalavimų kompleksiškumas
• Implementacijos kaštai

VU Kauno fakultetas ruošia specialistus, kurie gali atsakyti į šiuos iššūkius. Fakultete veikia kibernetinio saugumo laboratorija, kur studentai gali įgyti praktinių įgūdžių.`
  }
];

// Mock Poll Data
export const MOCK_POLL: Poll = {
  id: 'poll-1',
  title: 'Kada kepame šašlykus liepų kiemelyje?',
  totalVotes: 156,
  endDate: '2023-08-15',
  options: [
    { id: 'opt-1', text: 'Antradienį', votes: 15, isSelected: false },
    { id: 'opt-2', text: 'Trečiadienį', votes: 8, isSelected: false },
    { id: 'opt-3', text: 'Ketvirtadienį', votes: 23, isSelected: false },
    { id: 'opt-4', text: 'Penktadienį', votes: 110, isSelected: true },
  ],
};

// Navigation Images (single panorama placeholder; more can be added later)
export const NAVIGATION_IMAGES = [
  require('../assets/navigation/1.1.03.jpg'),
];