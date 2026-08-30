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
}


// Lithuanian plural: 1 / 2–9 (and not x1) / the rest
const ltPlural = (count: number, one: string, few: string, other: string): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 9 && !(mod100 >= 11 && mod100 <= 19)) return few;
  return other;
};


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
    inputPlaceholder: 'Type a message…',
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
    inputPlaceholder: 'Įrašykite žinutę…',
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
  },
};

