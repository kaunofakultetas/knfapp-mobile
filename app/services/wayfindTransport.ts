// -----------------------------------------------------------
//  [*] Services — wayfindTransport
//
//  The sync package's transport over the app's API client:
//  op batches, publish (422 → the issues, 409 → unchanged),
//  panorama, plan and capture-frame uploads as multipart (a
//  refused upload — a bad image, a bad id — is final and
//  marked so; a dropped connection, an expired session or a
//  timeout is not — the upload stays queued and goes out on
//  the next drain), plus the calls the screens make directly:
//  the draft fetch, the building creation, and the guided
//  capture's record / finish / status trio (finish carries the
//  session manifest's firstYawDeg as centreYawDeg, so the
//  stitcher centres the panorama on the first ACCEPTED frame
//  even when upload retries reorder the arrivals). A frame's
//  address travels in its fields (captureId, targetId — the
//  queue's items all share one shape), and the transport turns
//  them into the URL, forwarding the pose numbers as the form.
//
//  Used by:
//    - app/(main)/map-editor/index.tsx
//    - app/(main)/map-editor/capture.tsx
// -----------------------------------------------------------

import { Platform } from 'react-native';

import { api, ApiError, request } from '@/services/api';
import { SyncRejected, type FrameUploadResult, type OpsAnswer, type PanoramaUploadResult, type PlanUploadResult, type PublishAnswer, type ServerOp, type SyncTransport, type UploadFile } from '@knf/wayfindsync';
import type { BuildingGraph } from '@knf/wayfindengine';







// -----------------------------------------------------------
// DraftAnswer
// -----------------------------------------------------------
//
// The draft endpoint's whole answer: the working revision, the
// last published one, the building row, the graph document and
// the current validation issues.
//
// Used by:
//   - fetchDraft (below) — the response shape
// -----------------------------------------------------------

export interface DraftAnswer {
  revision: number;
  publishedRevision: number | null;
  building: { id: string; name: string; northDeg: number | null; entranceNodeId: string | null };
  document: BuildingGraph;
  revisions: Record<string, number>;
  issues: { severity: 'error' | 'warning'; code: string; ref: string; message: string }[];
}







// -----------------------------------------------------------
// CaptureTargetBody
// -----------------------------------------------------------
//
// One planned direction of a guided capture, as the server
// records it (P2 vocabulary — the plan package mints these).
//
// Used by:
//   - createCapture (below) — the targets array
// -----------------------------------------------------------

export interface CaptureTargetBody {
  id: string;
  yawDeg: number;
  pitchDeg: number;
}







// -----------------------------------------------------------
// CaptureStatusAnswer
// -----------------------------------------------------------
//
// The capture record as the status poll sees it — counts,
// stitch progress and, once done, the finished panorama.
//
// Used by:
//   - getCapture (below) — the response shape
//   - app/(main)/map-editor/capture.tsx — the polling screen
// -----------------------------------------------------------

export interface CaptureStatusAnswer {
  id: string;
  status: 'uploading' | 'queued' | 'stitching' | 'done' | 'failed';
  frames: number;
  expected: number;
  progressPct?: number | null;
  report?: Record<string, unknown>;
  pano?: {
    id: string;
    url: string;
    width: number;
    height: number;
    hfovDeg: number;
    vfovDeg: number;
    centreYawDeg: number | null;
  };
}







// -----------------------------------------------------------
// wayfindTransport
// -----------------------------------------------------------
//
// The SyncTransport instance itself — ops, publish and the
// three multipart uploads; see the header for the retry and
// rejection semantics. Its methods call isFinal and formFor
// (below) only at request time, so the data const can sit
// above them per the house order.
//
// Used by:
//   - app/(main)/map-editor/index.tsx — the sync engine's wire
//   - app/(main)/map-editor/align.tsx
//   - app/(main)/map-editor/capture.tsx
// -----------------------------------------------------------

export const wayfindTransport: SyncTransport = {
  postOps: (buildingId, ops: ServerOp[]) => request(api.post<OpsAnswer>(`/wayfind/buildings/${encodeURIComponent(buildingId)}/ops`, { ops })),

  async publish(buildingId, note): Promise<PublishAnswer> {
    try {
      const answer = await request(api.post<{ revision: number; etag: string; publishedAt: string }>(`/wayfind/buildings/${encodeURIComponent(buildingId)}/publish`, { note: note ?? undefined }));
      return { ok: true, ...answer };
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        const data = error.data as { issues?: PublishAnswer extends { issues: infer I } ? I : never } | undefined;
        return { ok: false, reason: 'invalid', issues: (data?.issues ?? []) as { severity: 'error' | 'warning'; code: string; ref: string; message: string }[] };
      }
      if (error instanceof ApiError && error.status === 409) return { ok: false, reason: 'unchanged' };
      throw error;
    }
  },

  async uploadPanorama(buildingId, file, fields): Promise<PanoramaUploadResult> {
    try {
      return await request(api.post<PanoramaUploadResult>(`/wayfind/buildings/${encodeURIComponent(buildingId)}/panoramas`, await formFor(file, fields), { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000 }));
    } catch (error) {
      if (isFinal(error)) throw new SyncRejected(error.message, error.serverCode ?? 'rejected');
      throw error;
    }
  },

  async uploadPlan(buildingId, file, fields): Promise<PlanUploadResult> {
    try {
      return await request(api.post<PlanUploadResult>(`/wayfind/buildings/${encodeURIComponent(buildingId)}/plans`, await formFor(file, fields), { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000 }));
    } catch (error) {
      if (isFinal(error)) throw new SyncRejected(error.message, error.serverCode ?? 'rejected');
      throw error;
    }
  },

  // The frame slot is addressed by the fields (P5: captureId,
  // targetId, then the pose); the buildingId rides along so the
  // server's capture lookup is exact rather than by-suffix
  async uploadFrame(buildingId, file, fields): Promise<FrameUploadResult> {
    const { captureId, targetId, ...pose } = fields;
    try {
      return await request(
        api.put<FrameUploadResult>(`/wayfind/captures/${encodeURIComponent(captureId)}/frames/${encodeURIComponent(targetId)}`, await formFor(file, { ...pose, buildingId }), { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000 }),
      );
    } catch (error) {
      if (isFinal(error)) throw new SyncRejected(error.message, error.serverCode ?? 'rejected');
      throw error;
    }
  },
};







// -----------------------------------------------------------
// isFinal
// -----------------------------------------------------------
//
// A 4xx verdict on the file itself will not change on retry —
// but a 401 (a session the admin renews by logging back in), a
// 408 (a timeout) and a 429 (a rate limit) are the weather,
// not a verdict: those must not park a queued panorama for good.
//
// Used by:
//   - wayfindTransport (above) — the three upload methods
// -----------------------------------------------------------

const isFinal = (error: unknown): error is ApiError => error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 408 && error.status !== 429;







// -----------------------------------------------------------
// formFor
// -----------------------------------------------------------
//
// One upload's multipart body. Web must materialise the picker
// URI as a real Blob; native takes the RN file-object shape.
//
// Used by:
//   - wayfindTransport (above) — the three upload methods
// -----------------------------------------------------------

const formFor = async (file: UploadFile, fields: Record<string, string>): Promise<FormData> => {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(file.uri)).blob();
    form.append('file', blob, file.name);
  } else {
    form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  }
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return form;
};







// -----------------------------------------------------------
// fetchDraft
// -----------------------------------------------------------
//
// A server without the building yet is the normal first-run
// answer — accepted as a status, so it never reaches the error
// log (in development every logged failure surfaces as an
// on-screen notice).
//
// Used by:
//   - app/(main)/map-editor/index.tsx — the editor's load
// -----------------------------------------------------------

export const fetchDraft = async (buildingId: string): Promise<DraftAnswer | null> => {
  const response = await api.get<DraftAnswer>(`/wayfind/buildings/${encodeURIComponent(buildingId)}/draft`, {
    validateStatus: (status) => status === 200 || status === 404,
  });
  return response.status === 404 ? null : response.data;
};







// -----------------------------------------------------------
// createBuilding
// -----------------------------------------------------------
//
// POST /wayfind/buildings with a CLIENT-chosen id — a
// lowercase slug (a-z, 0-9, -), refused as 400 otherwise. Not
// idempotent like createCapture: a taken id answers 409.
// Admin-only on the server.
//
// Used by:
//   - app/(main)/map-editor/index.tsx — the first-run create
// -----------------------------------------------------------

export const createBuilding = (id: string, name: string) => request(api.post<{ id: string }>('/wayfind/buildings', { id, name }));







// -----------------------------------------------------------
// createCapture
// -----------------------------------------------------------
//
// The guided capture's own three calls start here (P4). The
// capture id is the CLIENT's uuid — creating twice with the
// same id answers the existing record, so a retried create
// never forks.
//
// Used by:
//   - app/(main)/map-editor/capture.tsx — session start
// -----------------------------------------------------------

export const createCapture = (buildingId: string, body: { id: string; nodeId?: string; mode: 'full' | 'walls'; frameHfovDeg: number; targets: CaptureTargetBody[] }) =>
  request(api.post<{ id: string; status: string }>(`/wayfind/buildings/${encodeURIComponent(buildingId)}/captures`, body));







// -----------------------------------------------------------
// finishCapture
// -----------------------------------------------------------
//
// centreYawDeg is the manifest's firstYawDeg — the yaw of the
// chronologically first ACCEPTED frame. Without it the server
// falls back to the earliest UPLOADED frame, which the retry
// ladder can make a different one.
//
// Used by:
//   - app/(main)/map-editor/capture.tsx — session end
// -----------------------------------------------------------

export const finishCapture = (captureId: string, buildingId: string, centreYawDeg?: number) =>
  request(api.post<{ status: string }>(`/wayfind/captures/${encodeURIComponent(captureId)}/finish?buildingId=${encodeURIComponent(buildingId)}`, centreYawDeg != null ? { centreYawDeg } : {}));







// -----------------------------------------------------------
// getCapture
// -----------------------------------------------------------
//
// The status poll of the capture trio: frames/expected count
// the accepted uploads, and the `pano` block exists only once
// status is 'done'. buildingId travels as a query param so the
// server's lookup is exact rather than by capture id alone.
//
// Used by:
//   - app/(main)/map-editor/capture.tsx — the stitch status poll
// -----------------------------------------------------------

export const getCapture = (captureId: string, buildingId: string) => request(api.get<CaptureStatusAnswer>(`/wayfind/captures/${encodeURIComponent(captureId)}?buildingId=${encodeURIComponent(buildingId)}`));
