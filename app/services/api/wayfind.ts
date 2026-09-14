// -----------------------------------------------------------
//  [*] API — wayfind
//
//  The published building graph, fetched the cheap way: the
//  ETag the app holds goes out as If-None-Match and a 304
//  answers "keep what you have" with no body. The document is
//  the engine's BuildingGraph, stamped by the server with its
//  revision and publish time. Plans and panoramas are served
//  by content hash and resolve through getUploadUrl like every
//  other stored file.
//
//  Used by:
//    - hooks/useBuildingGraph.ts — boot, restore, foreground
//    - hooks/usePlanXml.ts — a server-hosted plan drawing
// -----------------------------------------------------------

import type { BuildingGraph } from '@knf/wayfindengine';

import { api } from './client';







// -----------------------------------------------------------
// GraphFetch
// -----------------------------------------------------------
//
// A conditional fetch's two answers: a fresh graph with its
// ETag, or "unchanged — keep what you have".
//
// Used by:
//   - fetchBuildingGraph (below) — the return shape
//   - hooks/useBuildingGraph.ts — branches on `kind`
// -----------------------------------------------------------

export type GraphFetch = { kind: 'fresh'; graph: BuildingGraph; etag: string | null } | { kind: 'unchanged' };







// -----------------------------------------------------------
// fetchBuildingGraph
// -----------------------------------------------------------
//
// The published graph, conditionally: the held ETag goes out
// as If-None-Match and a 304 is an answer, not an error.
//
// Used by:
//   - hooks/useBuildingGraph.ts — boot, restore, foreground
// -----------------------------------------------------------

export async function fetchBuildingGraph(buildingId: string, etag: string | null): Promise<GraphFetch> {
  const response = await api.get<BuildingGraph>(`/wayfind/buildings/${encodeURIComponent(buildingId)}/graph`, {
    headers: etag ? { 'If-None-Match': etag } : undefined,
    // 304 is an answer, not an error
    validateStatus: (status) => status === 200 || status === 304,
  });
  if (response.status === 304) return { kind: 'unchanged' };
  const tag = response.headers?.etag;
  return { kind: 'fresh', graph: response.data, etag: typeof tag === 'string' ? tag : null };
}







// -----------------------------------------------------------
// fetchPlanXml
// -----------------------------------------------------------
//
// A server-hosted plan drawing as raw SVG text — the transform
// is disabled so axios never tries to JSON-parse it.
//
// Used by:
//   - hooks/usePlanXml.ts — the plan reference resolver
// -----------------------------------------------------------

export async function fetchPlanXml(path: string): Promise<string> {
  const response = await api.get<string>(path.replace(/^\/api/, ''), { responseType: 'text', transformResponse: (data) => data });
  return typeof response.data === 'string' ? response.data : String(response.data);
}
