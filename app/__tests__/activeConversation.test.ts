// -----------------------------------------------------------
//  [*] Tests — activeConversation marker
//
//  The rule the unread badge depends on: the release is
//  id-checked, so a room blurring AFTER the next one focused
//  can never wipe the newer claim.
// -----------------------------------------------------------

import {
  clearActiveConversation,
  getActiveConversation,
  setActiveConversation,
} from '@/hooks/chat/activeConversation';


afterEach(() => {
  const held = getActiveConversation();
  if (held) clearActiveConversation(held);
});


describe('activeConversation', () => {
  it('starts unclaimed', () => {
    expect(getActiveConversation()).toBeNull();
  });

  it('claims and releases a room', () => {
    setActiveConversation('room-1');
    expect(getActiveConversation()).toBe('room-1');

    clearActiveConversation('room-1');
    expect(getActiveConversation()).toBeNull();
  });

  it('lets a newer claim replace the older one', () => {
    setActiveConversation('room-1');
    setActiveConversation('room-2');
    expect(getActiveConversation()).toBe('room-2');
  });

  it('ignores a stale release racing a navigation transition', () => {
    setActiveConversation('room-1');
    setActiveConversation('room-2');

    // room-1's blur fires after room-2 focused — must not wipe it
    clearActiveConversation('room-1');
    expect(getActiveConversation()).toBe('room-2');
  });
});
