// -----------------------------------------------------------
//  [*] Tests — the transport contract, run on the fake
//
//  The conformance suite is the promise every server keeps;
//  the reference fake must keep it too, or every runtime test
//  built on the fake proves nothing. Nothing is scripted here
//  on purpose: the seven cases reach the fake exactly as they
//  will reach the live container — a bare fetch and the
//  contract prompts.
// -----------------------------------------------------------

import { createFakeAssistantServer, describeTransportContract } from '../testing';

describeTransportContract('reference fake', () => createFakeAssistantServer().fetch);
