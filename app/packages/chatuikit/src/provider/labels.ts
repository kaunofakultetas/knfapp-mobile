// -----------------------------------------------------------
//  [*] chatuikit — labels
//
//  Every string the kit shows, as one object the host supplies
//  through ChatUiKitProvider (built from its own catalog — see
//  the README). Components never format strings themselves:
//  only the kit's ROOTS call useKitLabels and thread the object
//  down as a prop, so a window of message rows never carries a
//  subscription per leaf. defaultLabels ships English and
//  Lithuanian sets so the kit is usable with no catalog at all.
//
//  Used by:
//    - provider/index.tsx — useKitLabels hands the host's object
//      to the roots, defaultLabels.en is the provider-less fallback
//    - list/MessageList.tsx / composer/Composer.tsx /
//      menu/MessageContextMenu.tsx / avatar/RoomHeaderTitle.tsx
//      — the KitLabels type
// -----------------------------------------------------------

import type { KitSystemEvent } from '../core/types';







// -----------------------------------------------------------
// EN_SYSTEM
// -----------------------------------------------------------
//
// The English room-event wording.
//
// Used by:
//   - defaultLabels.en.systemMessage (below)
// -----------------------------------------------------------

const EN_SYSTEM: SystemPhrases = {
  groupCreated: (name, title) => `${name} created the group “${title}”`,
  left: (name) => `${name} left the conversation`,
  ttlOn: (name, window) => `${name} turned on disappearing messages (${window})`,
  ttlOff: (name) => `${name} turned off disappearing messages`,
  minutes: (count) => (count === 1 ? '1 minute' : `${count} minutes`),
  hours: (count) => (count === 1 ? '1 hour' : `${count} hours`),
  days: (count) => (count === 1 ? '1 day' : `${count} days`),
};







// -----------------------------------------------------------
// LT_SYSTEM
// -----------------------------------------------------------
//
// The Lithuanian room-event wording — the same sentences the
// backend stores as the fallback prose, units counted.
//
// Used by:
//   - defaultLabels.lt.systemMessage (below)
// -----------------------------------------------------------

const LT_SYSTEM: SystemPhrases = {
  groupCreated: (name, title) => `${name} sukūrė grupę „${title}“`,
  left: (name) => `${name} paliko pokalbį`,
  ttlOn: (name, window) => `${name} įjungė nykstančias žinutes (${window})`,
  ttlOff: (name) => `${name} išjungė nykstančias žinutes`,
  minutes: (count) => ltPlural(count, `${count} minutė`, `${count} minutės`, `${count} minučių`),
  hours: (count) => ltPlural(count, `${count} valanda`, `${count} valandos`, `${count} valandų`),
  days: (count) => ltPlural(count, `${count} diena`, `${count} dienos`, `${count} dienų`),
};







// -----------------------------------------------------------
// KitLabels
// -----------------------------------------------------------
//
// Every string the kit shows — including the count-aware ones,
// which are functions so a host can plural-form its own
// language. The field comments below name the surface each
// string appears on.
//
// Used by:
//   - provider/index.tsx — the provider's `labels` prop and
//     what useKitLabels answers
//   - list/MessageList.tsx / composer/Composer.tsx /
//     menu/MessageContextMenu.tsx / avatar/RoomHeaderTitle.tsx
//     — the prop type the roots thread down
// -----------------------------------------------------------

export interface KitLabels {
  today: string;
  yesterday: string;
  photo: string;
  imageUnavailable: string;
  deleted: string;
  sending: string;
  sent: string;
  delivered: string;
  read: string;
  notSent: string;
  tryAgain: string;
  reply: string;
  replyingTo: (name: string) => string;
  cancelReply: string;
  jumpToQuoted: string;
  copy: string;
  delete: string;
  react: string;
  removeReaction: string;
  reactions: string;
  messageActions: string;
  showTime: string;
  online: string;
  close: string;
  latestMessages: string;
  newMessages: (count: number) => string;
  loadOlder: string;
  loadNewer: string;
  // Spoken name of a multi-photo message
  gallery: (count: number) => string;
  conversationStart: string;
  inputPlaceholder: string;
  send: string;
  quickLike: string;
  attachPhoto: string;
  uploadingPhoto: string;
  chooseEmoji: string;
  openLink: string;
  // The line above the first unread row when the count is unknown
  unreadMessages: string;
  // A file attachment's generic name in previews and a11y labels
  file: string;
  // Video bubbles
  video: string;
  videoUnavailable: string;
  playVideo: string;
  // The composer's two attach buttons and their busy states
  attachMedia: string;
  attachFile: string;
  uploadingMedia: string;
  uploadingFile: string;
  // Edit mode: the mark on an edited bubble, the strip above the field
  edited: string;
  editingMessage: string;
  cancelEdit: string;
  saveEdit: string;
  // The list with no messages yet
  emptyChat: string;
  // The composer while sending is not allowed (a guest)
  signInToChat: string;
  // A message kind this build cannot render
  unsupportedMessage: string;
  // The portrait's tap (open a profile)
  openProfile: string;
  // The unfurled link card's accessibility name
  linkPreview: string;
  // Voice notes: the bubble's / snippet's name, the composer's
  // mic button, the recording bar's controls, playback
  voiceNote: string;
  recordVoice: string;
  sendVoice: string;
  cancelRecording: string;
  playVoice: string;
  pauseVoice: string;
  // A mention's tap target and the composer strip's rows
  mentionUser: (name: string) => string;
  // The connection banner's two states
  connecting: string;
  noConnection: string;
  // The pinned banner's name and the forwarded marker
  pinnedMessage: string;
  forwarded: string;
  // The composer's camera button
  attachCamera: string;
  // The composer's "+" that opens the attachment tray, and the
  // tray's four short captions (each tile's spoken name is the
  // longer attach* / openMemes label)
  openAttachments: string;
  trayGallery: string;
  trayCamera: string;
  trayFile: string;
  trayMemes: string;
  // The meme library: the toggle, the search field, the push
  // tile, the empty grid
  openMemes: string;
  searchMemes: string;
  addMeme: string;
  emptyMemes: string;
  // A search that matched nothing, a grid that failed to load,
  // and an own tile's removal action
  noMemeResults: string;
  memesLoadError: string;
  removeMeme: string;
  // A 'system' row's caption worded from its event, the row's
  // sender as the actor — null for an event the host does not
  // know, and the row's own text shows instead
  systemMessage: (event: KitSystemEvent, actorName: string) => string | null;
}







// -----------------------------------------------------------
// defaultLabels
// -----------------------------------------------------------
//
// Complete English and Lithuanian sets, so the kit is usable
// with no catalog at all; the provider picks .lt or .en by its
// `locale` prop when the host supplies no labels object.
//
// Used by:
//   - provider/index.tsx — the locale fallback
//   - example/ExampleConversation.tsx, ExampleRoom.tsx
// -----------------------------------------------------------

export const defaultLabels: { en: KitLabels; lt: KitLabels } = {
  en: {
    today: 'Today',
    yesterday: 'Yesterday',
    photo: 'Photo',
    imageUnavailable: "Couldn't load the photo",
    deleted: 'Message deleted',
    sending: 'Sending…',
    sent: 'Sent',
    delivered: 'Delivered',
    read: 'Read',
    notSent: 'Not sent',
    tryAgain: 'Try again',
    reply: 'Reply',
    replyingTo: (name) => `Replying to ${name}`,
    cancelReply: 'Cancel reply',
    jumpToQuoted: 'Jump to the quoted message',
    copy: 'Copy text',
    delete: 'Delete',
    react: 'React',
    removeReaction: 'Remove reaction',
    reactions: 'Reactions',
    messageActions: 'Message actions',
    showTime: 'Shows the message time',
    online: 'Online',
    close: 'Close',
    latestMessages: 'Latest messages',
    newMessages: (count) => (count === 1 ? '1 new message' : `${count} new messages`),
    loadOlder: 'Older messages',
    loadNewer: 'Newer messages',
    gallery: (count) => `Album, ${count} photos`,
    conversationStart: 'Start of the conversation',
    inputPlaceholder: 'Message…',
    send: 'Send message',
    quickLike: 'Like',
    attachPhoto: 'Attach a photo',
    uploadingPhoto: 'Uploading photo…',
    chooseEmoji: 'Choose an emoji',
    openLink: 'Open link',
    unreadMessages: 'New messages',
    file: 'File',
    video: 'Video',
    videoUnavailable: "Couldn't load the video",
    playVideo: 'Play video',
    attachMedia: 'Attach a photo or video',
    attachFile: 'Attach a file',
    uploadingMedia: 'Uploading…',
    uploadingFile: 'Uploading file…',
    edited: 'edited',
    editingMessage: 'Editing message',
    cancelEdit: 'Cancel editing',
    saveEdit: 'Save changes',
    emptyChat: 'No messages yet — say hello',
    signInToChat: 'Sign in to send messages',
    unsupportedMessage: 'This message cannot be shown in this version',
    openProfile: 'Open profile',
    linkPreview: 'Link preview',
    voiceNote: 'Voice message',
    recordVoice: 'Record a voice message',
    sendVoice: 'Send voice message',
    cancelRecording: 'Discard recording',
    playVoice: 'Play voice message',
    pauseVoice: 'Pause voice message',
    mentionUser: (name) => `Mention ${name}`,
    connecting: 'Connecting…',
    noConnection: 'No connection',
    pinnedMessage: 'Pinned message',
    forwarded: 'Forwarded',
    attachCamera: 'Take a photo',
    openAttachments: 'Add an attachment',
    trayGallery: 'Gallery',
    trayCamera: 'Camera',
    trayFile: 'File',
    trayMemes: 'Memes',
    openMemes: 'Meme library',
    searchMemes: 'Search memes…',
    addMeme: 'Add a meme',
    emptyMemes: 'No memes yet — add the first one!',
    noMemeResults: 'No memes match',
    memesLoadError: "Couldn't load the memes",
    removeMeme: 'Remove meme',
    systemMessage: (event, name) => systemLine(event, name, EN_SYSTEM),
  },
  lt: {
    today: 'Šiandien',
    yesterday: 'Vakar',
    photo: 'Nuotrauka',
    imageUnavailable: 'Nuotraukos įkelti nepavyko',
    deleted: 'Žinutė ištrinta',
    sending: 'Siunčiama…',
    sent: 'Išsiųsta',
    delivered: 'Pristatyta',
    read: 'Perskaityta',
    notSent: 'Neišsiųsta',
    tryAgain: 'Bandyti dar kartą',
    reply: 'Atsakyti',
    replyingTo: (name) => `Atsakymas: ${name}`,
    cancelReply: 'Atšaukti atsakymą',
    jumpToQuoted: 'Pereiti prie cituojamos žinutės',
    copy: 'Kopijuoti tekstą',
    delete: 'Ištrinti',
    react: 'Reaguoti',
    removeReaction: 'Pašalinti reakciją',
    reactions: 'Reakcijos',
    messageActions: 'Žinutės veiksmai',
    showTime: 'Parodo žinutės laiką',
    online: 'Prisijungęs (-usi)',
    close: 'Uždaryti',
    latestMessages: 'Naujausios žinutės',
    newMessages: (count) =>
      ltPlural(count, `${count} nauja žinutė`, `${count} naujos žinutės`, `${count} naujų žinučių`),
    loadOlder: 'Ankstesnės žinutės',
    loadNewer: 'Naujesnės žinutės',
    gallery: (count) =>
      ltPlural(count, `Albumas, ${count} nuotrauka`, `Albumas, ${count} nuotraukos`, `Albumas, ${count} nuotraukų`),
    conversationStart: 'Pokalbio pradžia',
    inputPlaceholder: 'Žinutė…',
    send: 'Siųsti žinutę',
    quickLike: 'Patinka',
    attachPhoto: 'Pridėti nuotrauką',
    uploadingPhoto: 'Įkeliama nuotrauka…',
    chooseEmoji: 'Pasirinkti jaustuką',
    openLink: 'Atidaryti nuorodą',
    unreadMessages: 'Naujos žinutės',
    file: 'Failas',
    video: 'Vaizdo įrašas',
    videoUnavailable: 'Vaizdo įrašo įkelti nepavyko',
    playVideo: 'Paleisti vaizdo įrašą',
    attachMedia: 'Pridėti nuotrauką ar vaizdo įrašą',
    attachFile: 'Pridėti failą',
    uploadingMedia: 'Įkeliama…',
    uploadingFile: 'Įkeliamas failas…',
    edited: 'redaguota',
    editingMessage: 'Redaguojama žinutė',
    cancelEdit: 'Atšaukti redagavimą',
    saveEdit: 'Išsaugoti pakeitimus',
    emptyChat: 'Žinučių dar nėra — pasisveikinkite',
    signInToChat: 'Prisijunkite, kad galėtumėte rašyti',
    unsupportedMessage: 'Šios žinutės ši versija parodyti negali',
    openProfile: 'Atidaryti profilį',
    linkPreview: 'Nuorodos peržiūra',
    voiceNote: 'Balso žinutė',
    recordVoice: 'Įrašyti balso žinutę',
    sendVoice: 'Siųsti balso žinutę',
    cancelRecording: 'Atmesti įrašą',
    playVoice: 'Paleisti balso žinutę',
    pauseVoice: 'Pristabdyti balso žinutę',
    mentionUser: (name) => `Paminėti ${name}`,
    connecting: 'Jungiamasi…',
    noConnection: 'Nėra ryšio',
    pinnedMessage: 'Prisegta žinutė',
    forwarded: 'Persiųsta',
    attachCamera: 'Fotografuoti',
    openAttachments: 'Pridėti priedą',
    trayGallery: 'Galerija',
    trayCamera: 'Kamera',
    trayFile: 'Failas',
    trayMemes: 'Memai',
    openMemes: 'Memų biblioteka',
    searchMemes: 'Ieškoti memų…',
    addMeme: 'Pridėti memą',
    emptyMemes: 'Memų dar nėra — pridėkite pirmą!',
    noMemeResults: 'Tokių memų nerasta',
    memesLoadError: 'Memų įkelti nepavyko',
    removeMeme: 'Pašalinti memą',
    systemMessage: (event, name) => systemLine(event, name, LT_SYSTEM),
  },
};







// -----------------------------------------------------------
// ltPlural
// -----------------------------------------------------------
//
// Lithuanian plural: 1 / 2–9 (and not x1) / the rest.
//
// Used by:
//   - defaultLabels (above) — the lt set's counted labels
//     (newMessages, gallery)
// -----------------------------------------------------------

const ltPlural = (count: number, one: string, few: string, other: string): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 9 && !(mod100 >= 11 && mod100 <= 19)) return few;
  return other;
};







// -----------------------------------------------------------
// SystemPhrases
// -----------------------------------------------------------
//
// One language's wording of the room events, for the default
// label sets' systemMessage — the event lines and the three
// window units (counted).
//
// Used by:
//   - EN_SYSTEM / LT_SYSTEM / systemLine (below)
// -----------------------------------------------------------

interface SystemPhrases {
  groupCreated: (name: string, title: string) => string;
  left: (name: string) => string;
  ttlOn: (name: string, window: string) => string;
  ttlOff: (name: string) => string;
  minutes: (count: number) => string;
  hours: (count: number) => string;
  days: (count: number) => string;
}







// -----------------------------------------------------------
// systemLine
// -----------------------------------------------------------
//
//   systemLine({ event: 'ttl_on', seconds: 86400 }, 'Ona', LT_SYSTEM)
//     → 'Ona įjungė nykstančias žinutes (1 diena)'
//
// A room event in one language, or null for an event this
// build does not know (the row's own text shows instead). The
// window reads in the largest unit that divides it exactly —
// 7 days, 24 hours, 90 minutes — so no value is ever rounded
// into a wrong promise.
//
// Used by:
//   - defaultLabels (above) — both sets' systemMessage
// -----------------------------------------------------------

function systemLine(event: KitSystemEvent, name: string, phrases: SystemPhrases): string | null {
  if (event.event === 'group_created') return event.title ? phrases.groupCreated(name, event.title) : null;
  if (event.event === 'left') return phrases.left(name);
  if (event.event === 'ttl_off') return phrases.ttlOff(name);
  if (event.event === 'ttl_on' && typeof event.seconds === 'number' && event.seconds > 0) {
    const s = event.seconds;
    const window = s % 86_400 === 0 ? phrases.days(s / 86_400) : s % 3600 === 0 ? phrases.hours(s / 3600) : phrases.minutes(Math.max(1, Math.round(s / 60)));
    return phrases.ttlOn(name, window);
  }
  return null;
}

