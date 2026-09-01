// -----------------------------------------------------------
//  [*] socialTransport — the app's SocialTransport
//
//  @knf/socialengine's KNF adapter over the app's axios
//  instance: the same HttpClient bridge chatTransport uses
//  (request() unwraps .data and normalizes every failure into
//  an ApiError whose `status` the engine's judgements read).
//  One instance for the whole session — the engine keys its
//  toggle queues by transport identity.
//
//  Used by:
//    - components/social/SocialEngineHost.tsx
// -----------------------------------------------------------

import { api, request } from '@/services/api/client';

import { createKnfSocialTransport, type HttpClient } from '@knf/socialengine';


const http: HttpClient = {
  get: (path, options) => request(api.get(path, { params: options?.params })),
  post: (path, body, options) => request(api.post(path, body, { params: options?.params })),
  put: (path, body, options) => request(api.put(path, body, { params: options?.params })),
  delete: (path, options) => request(api.delete(path, { params: options?.params })),
};

export const socialTransport = createKnfSocialTransport({ http });
