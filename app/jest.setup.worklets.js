// -----------------------------------------------------------
//  [*] jest.setup.worklets — the worklets mock for every suite
//
//  The animation engine's threading runtime is native-only;
//  under jest its module throws while wiring itself up. The
//  library ships a complete mock and documents installing it
//  exactly like this — registered here (after the test
//  framework, before any test file imports) so every suite in
//  the repo gets it without per-file ceremony.
//
//  Used by:
//    - package.json "jest".setupFilesAfterEnv — the root run
//    - packages/chatuikit/jest.config.js — its package run
// -----------------------------------------------------------

/* global jest */

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
