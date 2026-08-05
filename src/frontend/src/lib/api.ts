/**
 * NestJS 백엔드 API 호출 유틸.
 * NEXT_PUBLIC_API_BASE_URL 로 base URL 주입 (기본 http://localhost:3000/api).
 */

// 기본값 "/api" — 같은 origin (3001) 에서 Next.js rewrites 로 백엔드 프록시.
// 다른 origin 이 필요하면 NEXT_PUBLIC_API_BASE_URL 로 override.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export interface TeamPayload {
  team_slug?: string;
  team_name: string;
  github_repo: string;
  master_pat?: string;
  anthropic_key?: string;
  planner_password?: string;
  master_github_login?: string;
  rate_limit_per_day?: number;
  projects?: ProjectPayload[];
  policies_dir?: string;
  storyboards_dir?: string;
  code_repo?: string;
}

export interface ProjectPayload {
  slug: string;
  label: string;
  policies_dir?: string;
  storyboards_dir?: string;
  code_repo?: string;
}

export interface TeamResponse {
  team_slug: string;
  team_name: string;
  github_repo: string;
  master_github_login: string | null;
  master_pat: string;
  anthropic_key: string;
  planner_password: string;
  rate_limit_per_day: number;
  projects: Array<Required<ProjectPayload>>;
  created_at: string;
  updated_at: string;
}

export interface DocEntry {
  path: string;
  title: string;
  kind: "policy" | "storyboard";
  screen?: string;
}

export interface QaStreamEvent {
  type: "meta" | "text" | "usage" | "done" | "error";
  content?: string;
  error?: string;
  [k: string]: unknown;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    const msg = typeof body === "object" && body && "error" in body
      ? String((body as { error: unknown }).error)
      : `HTTP ${status}`;
    super(msg);
    this.status = status;
    this.body = body;
  }
}

async function req<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

// ─── Team ────────────────────────────────────────────
export function getTeam(slug: string) {
  return req<TeamResponse>(`/team/${encodeURIComponent(slug)}`);
}

export function upsertTeam(slug: string, payload: TeamPayload) {
  return req<TeamResponse>(`/team/${encodeURIComponent(slug)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteTeam(slug: string) {
  return req<{ ok: true; deleted: string }>(`/team/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
}

// ─── Docs ────────────────────────────────────────────
export function listProjects(team: string) {
  return req<{ projects: Array<{ id: string; label: string }>; default: string | null }>(
    `/list-projects?team=${encodeURIComponent(team)}`,
  );
}

export function listDocs(team: string, project?: string) {
  const q = new URLSearchParams({ team });
  if (project) q.set("project", project);
  return req<{ project: string; docs: DocEntry[] }>(`/list-docs?${q}`);
}

export function getDoc(team: string, path: string) {
  const q = new URLSearchParams({ team, path });
  return req<{ path: string; content: string }>(`/doc?${q}`);
}

// ─── Decisions ──────────────────────────────────────
export function forward(team: string, body: { title: string; body: string; docPath?: string; questioner?: string }) {
  return req<{ decisionPath: string; commitSha: string; htmlUrl: string }>(
    `/forward?team=${encodeURIComponent(team)}`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function feedback(team: string, body: { title: string; body: string; docPath?: string }) {
  return req<{ feedbackPath: string; commitSha: string; htmlUrl: string }>(
    `/feedback?team=${encodeURIComponent(team)}`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function listDecisions(team: string, limit = 50) {
  return req<{ items: Array<{ path: string; name: string; sha?: string }>; total: number }>(
    `/list-decisions?team=${encodeURIComponent(team)}&limit=${limit}`,
  );
}

export function listFeedbacks(team: string, limit = 50) {
  return req<{ items: Array<{ path: string; name: string; sha?: string }>; total: number }>(
    `/list-feedbacks?team=${encodeURIComponent(team)}&limit=${limit}`,
  );
}

export function deleteDecision(team: string, path: string) {
  return req<{ ok: true; deleted: string }>(`/delete-decision?team=${encodeURIComponent(team)}`, {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export function deleteFeedback(team: string, path: string) {
  return req<{ ok: true; deleted: string }>(`/delete-feedback?team=${encodeURIComponent(team)}`, {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

// ─── QA (streaming NDJSON) ──────────────────────────
export interface QaRequest {
  question: string;
  docPath?: string;
  project?: string;
  history?: Array<{ role: "user" | "assistant"; content: unknown }>;
  attachments?: Array<{ mediaType: string; data: string }>;
  codeRepo?: string;
}

/** POST /api/qa · NDJSON stream 을 라인 단위 콜백으로 파싱.
 *  브라우저 fetch API 로 스트리밍 body 처리. */
export async function streamQa(
  team: string,
  body: QaRequest,
  onEvent: (evt: QaStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/qa?team=${encodeURIComponent(team)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let errorBody: unknown = text;
    try { errorBody = JSON.parse(text); } catch { /* raw string */ }
    throw new ApiError(res.status, errorBody);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nlIdx: number;
    while ((nlIdx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nlIdx).trim();
      buffer = buffer.slice(nlIdx + 1);
      if (!line) continue;
      try {
        onEvent(JSON.parse(line) as QaStreamEvent);
      } catch {
        // NDJSON 파싱 실패 · 무시
      }
    }
  }
}

// ─── Health ────────────────────────────────────────
export function health(detailed = false) {
  return req<{
    status: "ok" | "degraded";
    service: string;
    time: string;
    db: "ok" | "error";
    teams?: { teamCount: number; teamSlugs: string[] };
    env?: { ANTHROPIC_API_KEY: boolean; GITHUB_TOKEN: boolean; ALLOWED_ORIGINS: string[] };
  }>(`/health${detailed ? "?detailed=1" : ""}`);
}

/** github repo → team slug 파생. Worker deriveTeamSlug 와 동일 규칙. */
export function deriveTeamSlug(githubRepo: string): string | null {
  if (!githubRepo) return null;
  const slug = githubRepo
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) return null;
  return slug;
}
