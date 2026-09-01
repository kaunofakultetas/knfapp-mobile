// -----------------------------------------------------------
//  [*] Services — wayfindTransport
//
//  The sync package's transport over the app's API client:
//  op batches, publish (422 → the issues, 409 → unchanged),
//  panorama and plan uploads as multipart (a refused upload —
//  a bad image, a bad id — is final and marked so; a dropped
//  connection, an expired session or a timeout is not — the
//  upload stays queued and goes out on the next drain), plus
//  the draft fetch and the building creation the editor screen
//  calls directly.
//
//  Used by:
//    - app/(main)/map-editor/index.tsx
// -----------------------------------------------------------

import { Platform } from 'react-native';

import { api, ApiError, request } from '@/services/api';
import { SyncRejected, type OpsAnswer, type PanoramaUploadResult, type PlanUploadResult, type PublishAnswer, type ServerOp, type SyncTransport, type UploadFile } from '@knf/wayfindsync';
import type { BuildingGraph } from '@knf/wayfindengine';


export interface DraftAnswer {
  revision: number;
  publishedRevision: number | null;
  building: { id: string; name: string; northDeg: number | null; entranceNodeId: string | null };
  document: BuildingGraph;
  revisions: Record<string, number>;
  issues: { severity: 'error' | 'warning'; code: string; ref: string; message: string }[];
}

// A 4xx verdict on the file itself will not change on retry —
// but a 401 (a session the admin renews by logging back in), a
// 408 (a timeout) and a 429 (a rate limit) are the weather,
// not a verdict: those must not park a queued panorama for good
const isFinal = (error: unknown): error is ApiError => error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 408 && error.status !== 429;


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
};


export const fetchDraft = (buildingId: string) => request(api.get<DraftAnswer>(`/wayfind/buildings/${encodeURIComponent(buildingId)}/draft`));

export const createBuilding = (id: string, name: string) => request(api.post<{ id: string }>('/wayfind/buildings', { id, name }));
