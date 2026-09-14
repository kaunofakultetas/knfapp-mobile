// -----------------------------------------------------------
//  [*] API — the service barrel
//
//  Everything the screens import from '@/services/api', in one
//  place: the axios client and its plumbing, then one module
//  per backend area. Pure re-exports — no code of its own.
//
//  Used by:
//    - every screen, context and hook that talks to the backend
// -----------------------------------------------------------

export * from './client';
export * from './errors';
export * from './session-events';
export * from './auth';
export * from './news';
export * from './chat';
export * from './social';
export * from './schedule';
export * from './admin';
export * from './info';
export * from './uploads';
export * from './memes';
export * from './wayfind';
