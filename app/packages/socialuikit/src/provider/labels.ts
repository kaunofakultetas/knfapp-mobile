// -----------------------------------------------------------
//  [*] socialuikit — labels
//
//  Every string the kit shows, as one object the host supplies
//  through SocialUiKitProvider (a partial is merged over the
//  locale's defaults, so a host overrides three strings, not
//  sixty). Count-taking keys are functions because Lithuanian
//  declines the noun three ways (1 įrašas / 2 įrašai /
//  10 įrašų) — a template with a bare number cannot be
//  localised after the fact. defaultLabels ships Lithuanian
//  first and English second; the kit is usable with no catalog
//  at all.
//
//  Used by:
//    - provider/index.tsx — merges the host's partial and
//      serves the result through useKitLabels
//    - every component in the package, via useKitLabels
// -----------------------------------------------------------



export interface KitLabels {
  // The action row under a post; the WithCount forms are the
  // buttons' accessibility names carrying the current tally
  like: string;
  unlike: string;
  likeWithCount: (count: number) => string;
  unlikeWithCount: (count: number) => string;
  commentsWithCount: (count: number) => string;
  share: string;

  // Marks on the post body
  edited: string;
  deletedPost: string;
  readMore: string;
  // The badge on media that carries an image description
  altBadge: string;
  mediaPhotoA11y: string;
  mediaVideoA11y: string;
  unknownUser: string;
  gapRow: string;
  openLink: string;

  // Polls: tallies, the countdown, the vote flow
  pollVotes: (count: number) => string;
  pollPeople: (count: number) => string;
  pollEndsInDays: (count: number) => string;
  pollEndsInHours: (count: number) => string;
  pollEndsInMinutes: (count: number) => string;
  pollEndsSoon: string;
  pollClosed: string;
  pollSeeResults: string;
  pollRefresh: string;
  pollSubmit: string;
  pollSignInToVote: string;
  pollYourVote: string;
  pollShowMore: (count: number) => string;
  pollQuestionA11y: (question: string) => string;

  // The connect button's faces, one per relationship state
  connect: string;
  requested: string;
  accept: string;
  decline: string;
  connected: string;
  unblock: string;
  cancelRequest: string;

  // Activity rows; `others` is how many actors ride behind the
  // named one (0 for a lone actor)
  notifLike: (name: string, others: number) => string;
  notifComment: (name: string, others: number) => string;
  notifReply: (name: string, others: number) => string;
  notifMention: (name: string, others: number) => string;
  notifConnectRequest: (name: string) => string;
  notifConnectAccept: (name: string) => string;
  notifGeneric: (name: string) => string;
  andOthers: (count: number) => string;

  // Compact relative time under posts and rows
  justNow: string;
  minutesShort: (count: number) => string;
  hoursShort: (count: number) => string;
  daysShort: (count: number) => string;

  // Feed chrome
  newPosts: (count: number) => string;
  rowFailed: string;
  tryAgain: string;

  // Comments
  commentPlaceholder: string;
  commentSend: string;
  signInToComment: string;
  signIn: string;
  commentDeleted: string;

  // Profile counters
  profilePosts: string;
  profileConnections: string;

  // Accessibility names for parts whose visible face is not text
  sourceA11y: (label: string) => string;
  postA11y: (name: string) => string;
  avatarA11y: (name: string) => string;
  timeA11y: (datetime: string) => string;
}







// -----------------------------------------------------------
// Lithuanian plural
// -----------------------------------------------------------
//
// 1 / 2–9 (and not x1) / the rest — teens take the 'other'
// form even when their last digit says otherwise (11 žinučių,
// not 11 žinutė).
//
// Used by:
//   - defaultLabels.lt — every count-taking key
// -----------------------------------------------------------

const ltPlural = (count: number, one: string, few: string, other: string): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 9 && !(mod100 >= 11 && mod100 <= 19)) return few;
  return other;
};

// The 'ir dar N žmonės' fragment grouped activity rows share
const ltOthers = (count: number): string =>
  ltPlural(count, `ir dar ${count} žmogus`, `ir dar ${count} žmonės`, `ir dar ${count} žmonių`);

const enOthers = (count: number): string => (count === 1 ? 'and 1 other' : `and ${count} others`);

const ltLikes = (count: number): string =>
  ltPlural(count, `${count} patiktukas`, `${count} patiktukai`, `${count} patiktukų`);

const enLikes = (count: number): string => (count === 1 ? '1 like' : `${count} likes`);







// -----------------------------------------------------------
// defaultLabels
// -----------------------------------------------------------
//
// Used by:
//   - provider/index.tsx — the locale picks the base set; the
//     provider-less fallback is Lithuanian, matching the
//     provider's default locale
// -----------------------------------------------------------

export const defaultLabels: { lt: KitLabels; en: KitLabels } = {
  lt: {
    like: 'Patinka',
    unlike: 'Nebepatinka',
    likeWithCount: (count) => `Patinka, ${ltLikes(count)}`,
    unlikeWithCount: (count) => `Nebepatinka, ${ltLikes(count)}`,
    commentsWithCount: (count) =>
      ltPlural(count, `${count} komentaras`, `${count} komentarai`, `${count} komentarų`),
    share: 'Dalintis',

    edited: 'redaguota',
    deletedPost: 'Įrašas ištrintas',
    readMore: 'Skaityti daugiau',
    altBadge: 'ALT',
    mediaPhotoA11y: 'Nuotrauka',
    mediaVideoA11y: 'Vaizdo įrašas',
    unknownUser: 'Nežinomas narys',
    gapRow: 'Rodyti praleistus įrašus',
    openLink: 'Atidaryti nuorodą',

    pollVotes: (count) => ltPlural(count, `${count} balsas`, `${count} balsai`, `${count} balsų`),
    pollPeople: (count) =>
      ltPlural(count, `Balsavo ${count} žmogus`, `Balsavo ${count} žmonės`, `Balsavo ${count} žmonių`),
    pollEndsInDays: (count) =>
      ltPlural(count, `Liko ${count} diena`, `Liko ${count} dienos`, `Liko ${count} dienų`),
    pollEndsInHours: (count) =>
      ltPlural(count, `Liko ${count} valanda`, `Liko ${count} valandos`, `Liko ${count} valandų`),
    pollEndsInMinutes: (count) =>
      ltPlural(count, `Liko ${count} minutė`, `Liko ${count} minutės`, `Liko ${count} minučių`),
    pollEndsSoon: 'Netrukus baigsis',
    pollClosed: 'Apklausa baigta',
    pollSeeResults: 'Žiūrėti rezultatus',
    pollRefresh: 'Atnaujinti rezultatus',
    pollSubmit: 'Balsuoti',
    pollSignInToVote: 'Prisijunkite, kad galėtumėte balsuoti',
    pollYourVote: 'Jūsų balsas',
    pollShowMore: (count) =>
      ltPlural(count, `Rodyti dar ${count} variantą`, `Rodyti dar ${count} variantus`, `Rodyti dar ${count} variantų`),
    pollQuestionA11y: (question) => `Apklausa: ${question}`,

    connect: 'Užmegzti ryšį',
    requested: 'Užklausa išsiųsta',
    accept: 'Priimti',
    decline: 'Atmesti',
    connected: 'Ryšys užmegztas',
    unblock: 'Atblokuoti',
    cancelRequest: 'Atšaukti užklausą',

    notifLike: (name, others) =>
      others > 0 ? `${name} ${ltOthers(others)} pamėgo jūsų įrašą` : `${name} pamėgo jūsų įrašą`,
    notifComment: (name, others) =>
      others > 0 ? `${name} ${ltOthers(others)} pakomentavo jūsų įrašą` : `${name} pakomentavo jūsų įrašą`,
    notifReply: (name, others) =>
      others > 0 ? `${name} ${ltOthers(others)} atsakė į jūsų komentarą` : `${name} atsakė į jūsų komentarą`,
    notifMention: (name, others) =>
      others > 0 ? `${name} ${ltOthers(others)} paminėjo jus` : `${name} paminėjo jus`,
    notifConnectRequest: (name) => `${name} nori užmegzti ryšį`,
    notifConnectAccept: (name) => `${name} priėmė jūsų užklausą`,
    notifGeneric: (name) => `Nauja veikla: ${name}`,
    andOthers: (count) => ltOthers(count),

    justNow: 'Ką tik',
    minutesShort: (count) => `${count} min.`,
    hoursShort: (count) => `${count} val.`,
    daysShort: (count) => `${count} d.`,

    newPosts: (count) =>
      ltPlural(count, `${count} naujas įrašas`, `${count} nauji įrašai`, `${count} naujų įrašų`),
    rowFailed: 'Šio įrašo parodyti nepavyko',
    tryAgain: 'Bandyti dar kartą',

    commentPlaceholder: 'Rašykite komentarą…',
    commentSend: 'Siųsti komentarą',
    signInToComment: 'Prisijunkite, kad galėtumėte komentuoti',
    signIn: 'Prisijungti',
    commentDeleted: 'Komentaras ištrintas',

    profilePosts: 'Įrašai',
    profileConnections: 'Ryšiai',

    sourceA11y: (label) => `Šaltinis: ${label}`,
    postA11y: (name) => `Įrašas: ${name}`,
    avatarA11y: (name) => `Profilio nuotrauka: ${name}`,
    timeA11y: (datetime) => `Paskelbta ${datetime}`,
  },

  en: {
    like: 'Like',
    unlike: 'Unlike',
    likeWithCount: (count) => `Like, ${enLikes(count)}`,
    unlikeWithCount: (count) => `Unlike, ${enLikes(count)}`,
    commentsWithCount: (count) => (count === 1 ? '1 comment' : `${count} comments`),
    share: 'Share',

    edited: 'edited',
    deletedPost: 'Post deleted',
    readMore: 'Read more',
    altBadge: 'ALT',
    mediaPhotoA11y: 'Photo',
    mediaVideoA11y: 'Video',
    unknownUser: 'Unknown user',
    gapRow: 'Show missed posts',
    openLink: 'Open link',

    pollVotes: (count) => (count === 1 ? '1 vote' : `${count} votes`),
    pollPeople: (count) => (count === 1 ? '1 person voted' : `${count} people voted`),
    pollEndsInDays: (count) => (count === 1 ? '1 day left' : `${count} days left`),
    pollEndsInHours: (count) => (count === 1 ? '1 hour left' : `${count} hours left`),
    pollEndsInMinutes: (count) => (count === 1 ? '1 minute left' : `${count} minutes left`),
    pollEndsSoon: 'Ending soon',
    pollClosed: 'Poll closed',
    pollSeeResults: 'See results',
    pollRefresh: 'Refresh results',
    pollSubmit: 'Vote',
    pollSignInToVote: 'Sign in to vote',
    pollYourVote: 'Your vote',
    pollShowMore: (count) => (count === 1 ? 'Show 1 more option' : `Show ${count} more options`),
    pollQuestionA11y: (question) => `Poll: ${question}`,

    connect: 'Connect',
    requested: 'Requested',
    accept: 'Accept',
    decline: 'Decline',
    connected: 'Connected',
    unblock: 'Unblock',
    cancelRequest: 'Cancel request',

    notifLike: (name, others) =>
      others > 0 ? `${name} ${enOthers(others)} liked your post` : `${name} liked your post`,
    notifComment: (name, others) =>
      others > 0 ? `${name} ${enOthers(others)} commented on your post` : `${name} commented on your post`,
    notifReply: (name, others) =>
      others > 0 ? `${name} ${enOthers(others)} replied to your comment` : `${name} replied to your comment`,
    notifMention: (name, others) =>
      others > 0 ? `${name} ${enOthers(others)} mentioned you` : `${name} mentioned you`,
    notifConnectRequest: (name) => `${name} wants to connect`,
    notifConnectAccept: (name) => `${name} accepted your request`,
    notifGeneric: (name) => `New activity from ${name}`,
    andOthers: (count) => enOthers(count),

    justNow: 'Just now',
    minutesShort: (count) => `${count}m`,
    hoursShort: (count) => `${count}h`,
    daysShort: (count) => `${count}d`,

    newPosts: (count) => (count === 1 ? '1 new post' : `${count} new posts`),
    rowFailed: "Couldn't show this post",
    tryAgain: 'Try again',

    commentPlaceholder: 'Write a comment…',
    commentSend: 'Send comment',
    signInToComment: 'Sign in to comment',
    signIn: 'Sign in',
    commentDeleted: 'Comment deleted',

    profilePosts: 'Posts',
    profileConnections: 'Connections',

    sourceA11y: (label) => `Source: ${label}`,
    postA11y: (name) => `Post by ${name}`,
    avatarA11y: (name) => `${name}'s profile photo`,
    timeA11y: (datetime) => `Posted ${datetime}`,
  },
};
