/**
 * NestJS 백엔드 API 호출 유틸.
 * NEXT_PUBLIC_API_BASE_URL 로 base URL 주입 (기본 http://localhost:3000/api).
 */

// 기본값 "/api" — 같은 origin (3001) 에서 Next.js rewrites 로 백엔드 프록시.
// 다른 origin 이 필요하면 NEXT_PUBLIC_API_BASE_URL 로 override.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export interface TeamPayload {
  team_slug?: string;
  // Backend upsert 는 undefined 필드만 skip. 신규 생성 시엔 team_name + github_repo 필수 (backend 에서 400).
  team_name?: string;
  github_repo?: string;
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
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // 프록시/게이트웨이가 돌려주는 HTML 500 등 · 사일런트 SyntaxError 대신 실제 응답 노출
      const preview = text.length > 300 ? text.slice(0, 300) + "…" : text;
      throw new ApiError(res.status || 502, { error: `상위 서버 응답이 JSON 이 아님 (${res.status}) — 프록시/네트워크 이슈일 가능성 · 원문: ${preview}` });
    }
  }
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

/** 기획자 모드 비번 검증. ok=false 이면 reason 필드 확인 (no-password | wrong). */
export function verifyPlanner(slug: string, password: string) {
  return req<{ ok: true } | { ok: false; reason: "no-password" | "wrong" }>(
    `/team/${encodeURIComponent(slug)}/verify-planner`,
    { method: "POST", body: JSON.stringify({ password }) },
  );
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

export type DecisionStatus = "pending" | "applied" | "hold" | "rejected" | "unknown";

export interface DecisionListItem {
  path: string;
  name: string;
  sha?: string;
  title: string;
  status: DecisionStatus;
  requester?: string;
  relatedDoc?: string;
  createdAt?: string; // ISO 문자열 · md 접수 또는 파일명 timestamp 파생
}

export interface FeedbackListItem {
  path: string;
  name: string;
  sha?: string;
  title: string;
  createdAt?: string;
}

export function listDecisions(team: string, limit = 50) {
  return req<{ items: DecisionListItem[]; total: number }>(
    `/list-decisions?team=${encodeURIComponent(team)}&limit=${limit}`,
  );
}

export function listFeedbacks(team: string, limit = 50) {
  return req<{ items: FeedbackListItem[]; total: number }>(
    `/list-feedbacks?team=${encodeURIComponent(team)}&limit=${limit}`,
  );
}

export function deleteDecision(team: string, path: string) {
  return req<{ ok: true; deleted: string }>(`/delete-decision?team=${encodeURIComponent(team)}`, {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

/** decision md 의 상태를 새 값으로 교체 후 GitHub 커밋. 기획자 액션.
 *  applied/hold 시 note 를 넘기면 md 상단에 기획자 메모(blockquote)로 삽입되어 질문자가 확인 가능. */
export function updateDecisionStatus(
  team: string,
  path: string,
  status: "pending" | "applied" | "hold",
  opts?: { note?: string; plannerName?: string; replaceNotes?: boolean },
) {
  return req<{ ok: true; path: string; status: string; commitSha: string }>(
    `/update-decision-status?team=${encodeURIComponent(team)}`,
    {
      method: "POST",
      body: JSON.stringify({
        path,
        status,
        note: opts?.note,
        plannerName: opts?.plannerName,
        replaceNotes: opts?.replaceNotes,
      }),
    },
  );
}

export function deleteFeedback(team: string, path: string) {
  return req<{ ok: true; deleted: string }>(`/delete-feedback?team=${encodeURIComponent(team)}`, {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

// ─── Mockups ────────────────────────────────────────
export interface GenHtmlRequest {
  prompt: string;
  focusedDocPath?: string;
  project?: string;
  attachments?: Array<{ mediaType: string; data: string }>;
  title?: string;
}

export interface GenHtmlResponse {
  savedPath: string;
  bytes: number;
  modelUsed: string;
  previewUrl?: string;
  rawUrl?: string;
  focusedDocUrl?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  html?: string;
  saveError?: string;
}

export function generateHtmlMockup(team: string, body: GenHtmlRequest) {
  return req<GenHtmlResponse>(`/gen-html?team=${encodeURIComponent(team)}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface MockupListItem {
  path: string;
  filename: string;
  sizeBytes: number;
  previewUrl: string;
  rawUrl: string;
}

export function listMockups(team: string) {
  return req<{ items: MockupListItem[] }>(`/mockups?team=${encodeURIComponent(team)}`);
}

export function fetchMockupHtml(team: string, path: string) {
  return req<{ html: string }>(`/mockup-html?team=${encodeURIComponent(team)}&path=${encodeURIComponent(path)}`);
}

// ─── Images ────────────────────────────────────────
export interface SaveStoryboardImageRequest {
  /** projects/<project>/docs/storyboards/<storyboard>/images/<filename>.(png|jpg|jpeg|gif|webp) */
  targetPath: string;
  /** data:image/<png|jpg|jpeg|gif|webp>;base64,... */
  dataUrl: string;
}

export interface SaveDecisionImageRequest {
  /** qa/decisions/YYYY-MM-DD-slug.md */
  decisionPath: string;
  /** data:image/<png|jpg|jpeg|gif|webp>;base64,... */
  dataUrl: string;
  filename?: string;
}

export interface StoryboardImageEntry {
  filename: string;
  path: string;
}

export function saveStoryboardImage(team: string, body: SaveStoryboardImageRequest) {
  return req<{ saved: true; path: string; bytes: number }>(
    `/save-storyboard-image?team=${encodeURIComponent(team)}`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function saveDecisionImage(team: string, body: SaveDecisionImageRequest) {
  return req<{ saved: true; path: string; markdownRef: string; bytes: number }>(
    `/save-decision-image?team=${encodeURIComponent(team)}`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function listStoryboardImages(team: string, dir: string, prefix: string) {
  const q = new URLSearchParams({ team, dir, prefix });
  return req<{ images: StoryboardImageEntry[] }>(`/list-storyboard-images?${q}`);
}

export function deleteStoryboardImage(team: string, targetPath: string) {
  return req<{ deleted: true; path: string }>(
    `/delete-storyboard-image?team=${encodeURIComponent(team)}`,
    { method: "POST", body: JSON.stringify({ targetPath }) },
  );
}

// ─── QA (streaming NDJSON) ──────────────────────────
export interface QaRequest {
  question: string;
  docPath?: string;
  /** 사용자가 사이드바에서 체크박스로 명시 선택한 문서 · 있으면 docPath 무시하고 이 리스트가 근거 */
  docPaths?: string[];
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
