/**
 * planner QA bot — Cloudflare Worker (chat API).
 *
 * GitHub Pages 의 `qa.html` 이 fetch 로 호출하는 REST API.
 * 협업자가 정책문서·스토리보드를 보며 직접 질문 → Claude 답변 → 만족 시 qa/decisions/ 에 결정문서 자동 생성.
 *
 * 환경변수 (wrangler secret 으로 등록):
 *  - ANTHROPIC_API_KEY        Claude API 키 (sk-ant-...)
 *  - GITHUB_TOKEN              repo 권한 PAT (private repo 읽기/쓰기)
 *  - GITHUB_REPO               "lunasoft-org/heythere_planer"
 *  - ALLOWED_ORIGINS           쉼표로 구분한 허용 origin. 예) "https://lunasoft-org.github.io"
 *  - CLAUDE_MODEL              (선택) 기본 "claude-sonnet-4-6"
 *
 * 엔드포인트:
 *  GET  /                       헬스 체크
 *  GET  /list-docs              정책·스토리보드 md 파일 목록
 *  GET  /doc?path=<path>        특정 md 파일 raw 내용
 *  POST /qa                     Claude 에게 질문 — body: { docPath, question, history }
 *  POST /forward                qa/decisions/ 에 합의 md 생성 — body: { docPath, summary, qa }
 */

import {
  extractProjectFromPath,
  extractSearchKeywords,
  extPathToQualifier,
  extractCodeSymbols,
  expandKoreanUiTerms,
  escapeRegex,
  escapeHtml,
  renderNoteBodyHtml,
} from './helpers';

export interface Env {
  ANTHROPIC_API_KEY: string;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  ALLOWED_ORIGINS: string;
  CLAUDE_MODEL?: string;
  /** C 모드 (Max 활용): 설정되어 있으면 모든 요청을 로컬 PC tunnel URL 로 proxy.
   *  미설정 시 기존 A 모드 (Anthropic API 직접 호출). 모드 전환은 `wrangler secret put/delete TUNNEL_URL`. */
  TUNNEL_URL?: string;
  /** SaaS 모드 활성화 — "1" or "true" 로 설정 시:
   *  - CORS 제한 해제 (아무 origin 허용, 사용자 헤더로 접근 통제)
   *  - 요청 헤더 X-Bot-{GitHub-Repo|GitHub-Token|Anthropic-Key} 를 env 값 대신 사용
   *  다중 팀이 같은 Worker 를 공유하되 각자의 시크릿·레포로 동작. */
  SAAS_MODE?: string;
  /** 🎨 이미지 생성 (Nano Banana = Gemini 2.5 Flash Image) 활성화용.
   *  Google AI Studio 에서 발급 (https://aistudio.google.com/app/apikey).
   *  미설정 시 /gen-image 엔드포인트만 비활성 — 다른 기능은 영향 X. */
  GEMINI_API_KEY?: string;
  /** Gemini 이미지 모델 이름 override (미설정 시 gemini-2.5-flash-image 기본).
   *  Google 이 모델 이름 변경 시 코드 재배포 없이 wrangler secret put GEMINI_MODEL 로 대응. */
  GEMINI_MODEL?: string;
}

/** 요청 헤더에 SaaS 모드용 인증 값이 있으면 env 를 override 해서 반환.
 *  - X-Bot-GitHub-Repo    : 팀 정책 레포 (org/repo)
 *  - X-Bot-GitHub-Token   : 팀 접근용 PAT
 *  - X-Bot-Anthropic-Key  : 팀 Anthropic API key
 *  값 없으면 env 그대로 반환 (하위 호환 팀 배포는 영향 X). */
function scopeEnvFromRequest(env: Env, req: Request): Env {
  const reqRepo = req.headers.get('X-Bot-GitHub-Repo');
  const reqToken = req.headers.get('X-Bot-GitHub-Token');
  const reqAnthropic = req.headers.get('X-Bot-Anthropic-Key');
  const reqGemini = req.headers.get('X-Bot-Gemini-Key');
  if (!reqRepo && !reqToken && !reqAnthropic && !reqGemini) return env;
  return {
    ...env,
    GITHUB_REPO: reqRepo || env.GITHUB_REPO,
    GITHUB_TOKEN: reqToken || env.GITHUB_TOKEN,
    ANTHROPIC_API_KEY: reqAnthropic || env.ANTHROPIC_API_KEY,
    GEMINI_API_KEY: reqGemini || env.GEMINI_API_KEY,
  };
}

/**
 * 프로젝트별 정책·스토리보드 경로.
 * 각 서비스 팀이 자기 프로젝트 ID (예: `admin_v1`, `ad_v1`, `backoffice_v2`) 를
 * `/list-docs?project=<id>` 로 넘기면:
 *  1) 팀 레포 루트의 `blumnAI-qa-bot.config.yml` 을 읽어 해당 프로젝트의
 *     `policies_dir` / `storyboards_dir` 이 명시되어 있으면 그 경로 우선
 *  2) 없으면 기본 패턴 `projects/<id>/docs/policies`(`storyboards`) fallback
 */
async function policiesDir(env: Env, project: string): Promise<string> {
  const cfg = await getProjectConfig(env, project);
  return cfg?.policies_dir?.trim() || `projects/${project}/docs/policies`;
}
async function storyboardsDir(env: Env, project: string): Promise<string> {
  const cfg = await getProjectConfig(env, project);
  return cfg?.storyboards_dir?.trim() || `projects/${project}/docs/storyboards`;
}
/** project 파라미터 fallback — config 의 첫 프로젝트 → 없으면 빈 문자열.
 *  빈 문자열 반환 시 downstream 은 문서 없음 / 정책 없음 으로 처리. */
async function defaultProjectFallback(env: Env): Promise<string> {
  const cfg = await loadTeamConfig(env);
  return cfg?.projects?.[0]?.id ?? '';
}

/* ────────── 팀 config.yml 캐싱 fetch ────────── */

interface ProjectConfigEntry {
  id: string;
  label?: string;
  policies_dir?: string;
  storyboards_dir?: string;
}

interface BotConfig {
  inject_doc_catalog?: boolean;
  include_all_docs?: boolean;
  claude_model?: string;
}

interface TeamConfig {
  projects?: ProjectConfigEntry[];
  bot?: BotConfig;
}

const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
// SaaS 모드에선 팀 (GITHUB_REPO) 별로 config 다름 → repo 를 캐시 키로.
const configCache = new Map<string, { at: number; data: TeamConfig | null }>();

/* ────────── 범용 fetch 캐시 ──────────
 *  같은 대화 안에서 반복되는 GitHub 요청 (CLAUDE.md, 정책 md, 피드백, 디렉토리 목록)
 *  을 인메모리로 재사용. Cloudflare Workers instance 단위 (수명 짧지만
 *  한 대화 세션 안에서는 hit 이 확실히 나므로 GitHub API 호출 대폭 감소).
 *
 *  TTL:
 *    - TEXT_TTL (60초)  : 정책 md · CLAUDE.md · 피드백 파일 내용
 *    - LIST_TTL (30초) : 디렉토리 목록 (files added mid-session 감지 위해 짧게)
 *    - CODE_TTL (60초)  : GitHub Search Code 결과
 */
interface CacheEntry<T> { at: number; data: T }
const TEXT_TTL_MS = 60 * 1000;
const LIST_TTL_MS = 30 * 1000;
const CODE_TTL_MS = 60 * 1000;
const textCache = new Map<string, CacheEntry<string>>();
const listCache = new Map<string, CacheEntry<ContentEntry[]>>();
// codeCache 값 타입은 CodeSnippetResult (아래에 정의). 순환 참조 회피 위해 unknown 으로 두고 캐스팅.
const codeCache = new Map<string, CacheEntry<unknown>>();

function cacheKey(env: Env, path: string): string {
  return `${env.GITHUB_REPO}::${path}`;
}
async function fetchTextFileCached(env: Env, path: string, ttl = TEXT_TTL_MS): Promise<string> {
  const key = cacheKey(env, path);
  const c = textCache.get(key);
  if (c && Date.now() - c.at < ttl) return c.data;
  const data = await fetchTextFile(env, path);
  textCache.set(key, { at: Date.now(), data });
  return data;
}
async function fetchDirListingCached(env: Env, path: string, ttl = LIST_TTL_MS): Promise<ContentEntry[]> {
  const key = cacheKey(env, path);
  const c = listCache.get(key);
  if (c && Date.now() - c.at < ttl) return c.data;
  const data = await fetchDirListing(env, path);
  listCache.set(key, { at: Date.now(), data });
  return data;
}
/** 쓰기 작업 후 관련 캐시 항목 무효화 (예: 새 feedback 저장 → qa/feedback 목록 무효화). */
function invalidateCache(env: Env, ...paths: string[]) {
  for (const p of paths) {
    const k = cacheKey(env, p);
    textCache.delete(k);
    listCache.delete(k);
  }
}

async function loadTeamConfig(env: Env): Promise<TeamConfig | null> {
  const key = env.GITHUB_REPO || '(no-repo)';
  const cached = configCache.get(key);
  if (cached && Date.now() - cached.at < CONFIG_CACHE_TTL_MS) {
    return cached.data;
  }
  try {
    const raw = await fetchTextFile(env, 'blumnAI-qa-bot.config.yml');
    const YAML = await import('yaml');
    const parsed = YAML.parse(raw) as TeamConfig | null;
    configCache.set(key, { at: Date.now(), data: parsed ?? null });
    return parsed ?? null;
  } catch (err) {
    console.warn('[qa-bot] load config.yml failed:', err instanceof Error ? err.message : String(err));
    configCache.set(key, { at: Date.now(), data: null });
    return null;
  }
}

async function getProjectConfig(env: Env, projectId: string): Promise<ProjectConfigEntry | null> {
  const cfg = await loadTeamConfig(env);
  return cfg?.projects?.find((p) => p.id === projectId) ?? null;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') ?? '';
    // SaaS 모드: 아무 origin 도 허용 (요청 자체의 인증 헤더로 접근 통제).
    // 팀 모드: ALLOWED_ORIGINS 로 CORS 제한.
    const saasMode = env.SAAS_MODE === '1' || env.SAAS_MODE === 'true';
    const allowed = env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
    const allowOrigin = saasMode ? (origin || '*') : (allowed.includes(origin) ? origin : allowed[0] ?? '*');
    const corsHeaders: HeadersInit = {
      'Access-Control-Allow-Origin': allowOrigin,
      // SaaS 모드는 사용자 세션별 인증 헤더를 받으므로 Allow-Headers 확장 필요
      'Access-Control-Allow-Headers': 'Content-Type, X-Bot-GitHub-Repo, X-Bot-GitHub-Token, X-Bot-Anthropic-Key',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 🔑 SaaS 모드 지원 — 요청 헤더의 값이 있으면 env 오버라이드 (하위 호환 유지)
    // 이렇게 하면 다중 팀이 같은 Worker 를 공유하되 각자의 GitHub 레포·토큰·API 키로 동작
    env = scopeEnvFromRequest(env, req);

    // C 모드: TUNNEL_URL 설정되어 있으면 모든 요청을 로컬 서버로 proxy.
    // /health 같은 자체 진단 엔드포인트는 예외로 두어 운영 가시성 유지.
    if (env.TUNNEL_URL && url.pathname !== '/health') {
      return proxyToTunnel(req, env, url, corsHeaders);
    }

    try {
      let result: unknown;
      switch (url.pathname) {
        case '/':
        case '/health': {
          // 기본 응답 — 팀이 세팅 상태 진단할 때 필요한 정보 포함.
          // 시크릿 값 자체는 노출 X, 존재 여부(있음/없음) 만 보고.
          const detailed = url.searchParams.get('detailed') === '1';
          const base = {
            status: 'ok' as const,
            service: 'planner-qa-bot',
            mode: env.TUNNEL_URL ? 'proxy' : 'direct',
            time: new Date().toISOString(),
          };
          if (!detailed) { result = base; break; }
          // detailed=1 이면 config·시크릿·프로젝트 진단 리포트
          const secrets = {
            ANTHROPIC_API_KEY: !!env.ANTHROPIC_API_KEY,
            GITHUB_TOKEN: !!env.GITHUB_TOKEN,
            GEMINI_API_KEY: !!env.GEMINI_API_KEY, // 🎨 이미지 생성용 (선택)
            GITHUB_REPO: env.GITHUB_REPO || null,
            ALLOWED_ORIGINS: env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) || [],
            CLAUDE_MODEL: env.CLAUDE_MODEL || '(default)',
            TUNNEL_URL: env.TUNNEL_URL ? '(set)' : null,
          };
          let configReport: unknown;
          try {
            const cfg = await loadTeamConfig(env);
            if (!cfg) {
              configReport = { loaded: false, error: 'config.yml not found or parse failed' };
            } else {
              configReport = {
                loaded: true,
                projects: cfg.projects?.map((p) => ({
                  id: p.id,
                  label: p.label,
                  policies_dir: p.policies_dir || '(default projects/<id>/docs/policies)',
                  storyboards_dir: p.storyboards_dir || '(default)',
                })) ?? [],
                bot: cfg.bot || {},
              };
            }
          } catch (err) {
            configReport = { loaded: false, error: err instanceof Error ? err.message : String(err) };
          }
          result = {
            ...base,
            secrets,
            config: configReport,
            cache: {
              textFileEntries: textCache.size,
              dirListingEntries: listCache.size,
              codeSearchEntries: codeCache.size,
            },
          };
          break;
        }
        case '/list-docs':
          result = await listDocs(env, url.searchParams.get('project') || await defaultProjectFallback(env));
          break;
        case '/doc':
          result = await getDoc(env, url.searchParams.get('path') ?? '');
          break;
        case '/qa':
          if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405, corsHeaders);
          return await askClaude(env, await req.json(), corsHeaders, req.signal);
        case '/forward':
          if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405, corsHeaders);
          result = await forwardToDecisions(env, await req.json());
          break;
        case '/list-projects':
          result = await listProjects(env);
          break;
        case '/list-decisions':
          result = await listDecisions(env, parseLimit(url.searchParams.get('limit')));
          break;
        case '/list-feedbacks':
          result = await listFeedbacks(env, parseLimit(url.searchParams.get('limit')));
          break;
        case '/update-decision-status':
          if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405, corsHeaders);
          result = await updateDecisionStatus(env, await req.json());
          break;
        case '/delete-decision':
          if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405, corsHeaders);
          result = await deleteDecision(env, await req.json());
          break;
        case '/feedback':
          if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405, corsHeaders);
          result = await saveFeedback(env, await req.json());
          break;
        case '/delete-feedback':
          if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405, corsHeaders);
          result = await deleteFeedback(env, await req.json());
          break;
        case '/save-storyboard-image':
          if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405, corsHeaders);
          result = await saveStoryboardImage(env, await req.json());
          break;
        case '/save-decision-image':
          if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405, corsHeaders);
          result = await saveDecisionImage(env, await req.json());
          break;
        case '/gen-image':
          if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405, corsHeaders);
          result = await generateImage(env, await req.json(), req.signal);
          break;
        case '/list-storyboard-images':
          result = await listStoryboardImages(env, url.searchParams.get('dir') ?? '', url.searchParams.get('prefix') ?? '');
          break;
        case '/delete-storyboard-image':
          if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405, corsHeaders);
          result = await deleteStoryboardImage(env, await req.json());
          break;
        default:
          return jsonResponse({ error: 'not found' }, 404, corsHeaders);
      }
      return jsonResponse(result, 200, corsHeaders);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[qa-bot]', msg);
      return jsonResponse({ error: msg }, 500, corsHeaders);
    }
  },
};

/* ────────── 0. C 모드 proxy ────────── */

async function proxyToTunnel(
  req: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
): Promise<Response> {
  const target = `${env.TUNNEL_URL!.replace(/\/$/, '')}${url.pathname}${url.search}`;
  const init: RequestInit = {
    method: req.method,
    headers: new Headers(req.headers),
    // GET/HEAD 는 body 없음
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer(),
    // /qa 가 NDJSON 스트리밍이라 응답 전체 받는 데 시간 오래 걸릴 수 있음 — 10분까지 허용.
    // 첫 바이트(메타 라인) 만 빨리 도착하면 Cloudflare 엣지 100s 한도는 안 걸림.
    signal: AbortSignal.timeout(600_000),
  };
  // GitHub Pages 가 보낸 Origin/Cookie 등은 그대로 전달 안 함 — 로컬 서버는 신뢰
  const headers = init.headers as Headers;
  headers.delete('cookie');
  headers.delete('host');

  try {
    const upstream = await fetch(target, init);
    // arrayBuffer() 로 한꺼번에 받지 않고 body 스트림 그대로 pass-through.
    // NDJSON 첫 라인이 즉시 도착해야 CF 엣지가 524 안 던짐.
    const out = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(corsHeaders)) out.set(k, v as string);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      {
        error: `Local server unreachable via tunnel: ${msg}`,
        hint: 'PC 가 켜져 있고 start.bat 가 실행 중인지, TUNNEL_URL 이 최신인지 확인하세요.',
      },
      503,
      corsHeaders,
    );
  }
}

function jsonResponse(body: unknown, status: number, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

/* ────────── 1. /list-docs ────────── */

interface DocEntry {
  path: string;
  title: string;
  kind: 'policy' | 'storyboard';
  screen?: string; // storyboard 의 경우 화면명
}

async function listDocs(env: Env, project: string): Promise<{ project: string; docs: DocEntry[] }> {
  const polDir = await policiesDir(env, project);
  const storyDir = await storyboardsDir(env, project);

  const policyEntries = await fetchDirListingCached(env, polDir).catch(() => [] as ContentEntry[]);
  const policies: DocEntry[] = policyEntries
    .filter((e) => e.type === 'file' && e.name.endsWith('.md') && !e.name.startsWith('_'))
    .map((e) => ({
      path: e.path,
      title: e.name.replace(/_v\d+\.\d+\.\d+\.md$/, '').replace(/\.md$/, '').replace(/_/g, ' '),
      kind: 'policy' as const,
    }));

  // storyboards — 두 레이아웃 모두 지원:
  //   nested: storyboards/<screen>/<screen>_storyboard_v0.1.0.md  (admin_v1 스타일)
  //   flat:   storyboards/<screen>_storyboard_v0.1.0.md           (backoffice_v2 스타일)
  const storyboardEntries = await fetchDirListingCached(env, storyDir).catch(() => [] as ContentEntry[]);
  const storyboards: DocEntry[] = [];
  for (const e of storyboardEntries) {
    if (e.type === 'file' && e.name.endsWith('.md') && !e.name.startsWith('_') && e.name.toLowerCase() !== 'readme.md') {
      // flat 케이스
      const screen = e.name.replace(/_storyboard_v\d+\.\d+\.\d+\.md$/, '').replace(/\.md$/, '');
      storyboards.push({
        path: e.path,
        title: screen.replace(/_/g, ' '),
        kind: 'storyboard' as const,
        screen,
      });
    } else if (e.type === 'dir') {
      // nested 케이스
      const inner = await fetchDirListingCached(env, e.path).catch(() => [] as ContentEntry[]);
      const md = inner.find((f) => f.type === 'file' && f.name.endsWith('.md'));
      if (md) {
        storyboards.push({
          path: md.path,
          title: e.name.replace(/_/g, ' '),
          kind: 'storyboard' as const,
          screen: e.name,
        });
      }
    }
  }

  return { project, docs: [...policies, ...storyboards].sort((a, b) => a.title.localeCompare(b.title)) };
}

/* ────────── 2. /doc?path= ────────── */

async function getDoc(env: Env, path: string): Promise<{ path: string; content: string }> {
  if (!path) throw new Error('path query required');
  // 안전: path traversal 차단 + 허용 prefix 검증
  if (path.includes('..')) throw new Error('invalid path');
  let allowed =
    path.startsWith('projects/') ||
    path.startsWith('qa/decisions/') ||
    path.startsWith('qa/feedback/') ||
    path === 'CLAUDE.md';
  if (!allowed) {
    // 팀이 config.yml 에서 자유 경로로 policies_dir / storyboards_dir 를 지정한
    // 경우에도 허용 — 선언된 경로 하위의 파일만.
    const cfg = await loadTeamConfig(env);
    const dirs = (cfg?.projects ?? []).flatMap((p) =>
      [p.policies_dir, p.storyboards_dir].filter((d): d is string => !!d && d.length > 0),
    );
    allowed = dirs.some((d) => path === d || path.startsWith(d.endsWith('/') ? d : d + '/'));
  }
  if (!allowed) {
    throw new Error('path must be under projects/, qa/decisions/, qa/feedback/, CLAUDE.md, or a directory declared in blumnAI-qa-bot.config.yml');
  }
  const content = await fetchTextFile(env, path);
  return { path, content };
}

/* ────────── 3. /qa ────────── */

interface QARequest {
  docPath?: string;
  question: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  // 현재 대화의 프로젝트 ID — 카탈로그·전체문서 인젝션 스코프. 미지정 시 docPath 에서 추출.
  project?: string;
  // 🌐 UI 에서 [전체 정책 종합] 모드로 요청 — config include_all_docs 를 이번 요청만 강제 true
  useAllDocs?: boolean;
  // 사용자가 질문에 첨부한 이미지 (base64). 정책 vs 화면 drift 비교 같은 시각 비교용.
  attachments?: { mediaType: string; data: string }[];
  // (옵션) 코드 검증 — projects[].code_repo 로 설정된 서비스 코드 레포에서
  //  질문 관련 스니펫을 함께 인젝션. 프론트가 config.yml 을 읽어서 넘김.
  codeRepo?: string;              // "org/repo" 형식
  codePaths?: string[];           // glob 후보 (경로 힌트로만 사용)
  codeSearchHint?: string;        // 항상 함께 붙일 키워드
  codeMaxSnippets?: number;       // 상한, 미지정 시 3
  codeSnippetLines?: number;      // 스니펫당 라인 상한, 미지정 시 120
}

interface QAResponse {
  answer: string;
  modelUsed: string;
}

/** 문서 안의 ![alt](상대경로) 이미지 마크다운을 origin 기준 절대 경로(/path)로 변환.
 *  http(s):// 또는 data: 로 시작하면 그대로 두고, 그 외 상대 경로만 변환.
 *  qa.html 이 호스팅된 origin 의 root 기준으로 해석되므로 도메인 변경에 자동 적응. */
function transformImageUrls(docPath: string, content: string): string {
  if (!docPath) return content;
  const lastSlash = docPath.lastIndexOf('/');
  const docDir = lastSlash >= 0 ? docPath.substring(0, lastSlash) : '';
  return content.replace(/!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (_m, alt, url, title) => {
    if (/^(https?:|data:|mailto:|#)/i.test(url)) return `![${alt}](${url}${title ?? ''})`;
    const clean = url.trim();
    // 이미 / 로 시작하면 그대로, 아니면 docDir 결합 후 / 접두
    const abs = clean.startsWith('/') ? clean : `/${docDir ? docDir + '/' : ''}${clean}`;
    return `![${alt}](${abs}${title ?? ''})`;
  });
}

async function askClaude(env: Env, body: QARequest, corsHeaders: HeadersInit, clientSignal?: AbortSignal): Promise<Response> {
  const ndjsonHeaders: HeadersInit = {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache',
    ...corsHeaders,
  };

  if (!body.question?.trim()) {
    return errorNdjson('question required', ndjsonHeaders);
  }

  const model = env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';

  // 프로젝트 스코프 확정 — 명시 project > docPath 에서 추출 > config 첫 프로젝트
  const project = body.project?.trim()
    || extractProjectFromPath(body.docPath)
    || await defaultProjectFallback(env);

  // 팀 config 에서 bot 옵션 로드 (5분 캐시)
  const teamConfig = await loadTeamConfig(env);
  const injectCatalog = teamConfig?.bot?.inject_doc_catalog !== false; // 기본 true
  // 우선순위: request body 의 useAllDocs (UI 버튼) → 팀 config include_all_docs → 기본 false
  const includeAllDocs = body.useAllDocs === true || teamConfig?.bot?.include_all_docs === true;

  // 컨텍스트: CLAUDE.md + 선택된 doc + 최근 qa/feedback
  const claudeRules = await fetchTextFileCached(env, 'CLAUDE.md').catch((err) => {
    console.warn('[qa-bot] CLAUDE.md fetch failed:', err instanceof Error ? err.message : String(err));
    return '';
  });
  const rawFocusedDoc = body.docPath ? await fetchTextFileCached(env, body.docPath).catch(() => '') : '';
  const focusedDoc = body.docPath ? transformImageUrls(body.docPath, rawFocusedDoc) : rawFocusedDoc;
  const recentFeedback = await fetchRecentFeedback(env);

  // 프로젝트 문서 카탈로그 (Approach A) — 항상 활성 (config 로 끌 수 있음)
  const docCatalog = injectCatalog ? await buildDocCatalog(env, project).catch(() => '') : '';

  // 프로젝트 전체 문서 본문 (Approach B) — 옵션. Anthropic prompt caching 대상
  const allDocsBundle = includeAllDocs ? await buildAllDocsBundle(env, project, body.docPath).catch(() => '') : '';

  // 코드 스니펫 (옵션) — codeRepo 있으면 GitHub Search 로 관련 파일 top-N 인젝션
  // 진단 정보는 응답 meta 로 프론트에 전달돼 답변 상단 배지로 표시됨.
  const codeResult: CodeSnippetResult = body.codeRepo
    ? await fetchCodeSnippets(env, {
        repo: body.codeRepo,
        question: body.question,
        pathHints: body.codePaths ?? [],
        searchHint: body.codeSearchHint ?? '',
        maxSnippets: body.codeMaxSnippets ?? 3,
        snippetLines: body.codeSnippetLines ?? 120,
        // 열린 정책 md 본문에서 인라인 영문 심볼 (백틱·PascalCase 등) 추출해 검색어 보강
        focusedDoc: focusedDoc || undefined,
      }).catch((err) => {
        console.warn('[qa-bot] code snippet fetch failed:', err instanceof Error ? err.message : String(err));
        return {
          snippets: '',
          diagnostic: {
            status: 'fetch-error' as CodeInjectionStatus,
            repo: body.codeRepo ?? '',
            count: 0,
            keywords: '',
            files: [],
            errorHint: `코드 스니펫 fetch 중 예외: ${err instanceof Error ? err.message : String(err)}`,
          },
        };
      })
    : {
        snippets: '',
        diagnostic: {
          status: 'no-repo' as CodeInjectionStatus,
          repo: '',
          count: 0,
          keywords: '',
          files: [],
        },
      };

  // Anthropic prompt caching 활용을 위해 system 을 텍스트 블록 배열로 구성.
  // 안정적인 부분 (rules · 카탈로그 · 전체 문서) 만 cache_control 마킹 → 5분 캐시.
  const systemBlocks = buildSystemBlocks({
    claudeRules,
    docCatalog,
    allDocsBundle,
    focusedDoc,
    focusedDocPath: body.docPath ?? '',
    recentFeedback,
    codeSnippets: codeResult.snippets,
    codeRepo: body.codeRepo ?? '',
    hasAttachments: !!body.attachments?.length,
  });

  type ContentBlock =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };
  const userContent: string | ContentBlock[] = body.attachments?.length
    ? [
        ...body.attachments.map<ContentBlock>((a) => ({
          type: 'image',
          source: { type: 'base64', media_type: a.mediaType, data: a.data },
        })),
        { type: 'text', text: body.question },
      ]
    : body.question;

  const messages: { role: 'user' | 'assistant'; content: string | ContentBlock[] }[] = [
    ...(body.history ?? []),
    { role: 'user', content: userContent },
  ];

  // 클라이언트가 탭 닫거나 취소하면 clientSignal 이 발동 → Anthropic API 호출도 abort.
  // 이렇게 하면 사용자가 안 볼 답변을 계속 토큰 태우지 않음.
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: systemBlocks,
      messages,
      stream: true,
    }),
    signal: clientSignal,
  });

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text();
    return errorNdjson(`Claude API ${upstream.status}: ${errText.slice(0, 500)}`, ndjsonHeaders);
  }

  // Anthropic SSE → NDJSON 변환 스트림
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify({
        type: 'meta',
        appliedFeedbacks: [],
        via: 'anthropic-api',
        codeInjection: codeResult.diagnostic,
      }) + '\n'));
    },
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      let nlIdx;
      while ((nlIdx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nlIdx);
        buffer = buffer.slice(nlIdx + 1);
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]' || !jsonStr) continue;
        try {
          const evt = JSON.parse(jsonStr) as {
            type: string;
            delta?: { type: string; text?: string };
            error?: { message?: string };
          };
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'text', content: evt.delta.text }) + '\n'));
          } else if (evt.type === 'error') {
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message: evt.error?.message || 'Anthropic API error' }) + '\n'));
          }
        } catch (_) { /* skip parse error */ }
      }
    },
  });

  return new Response(upstream.body.pipeThrough(transformStream), {
    status: 200,
    headers: ndjsonHeaders,
  });
}

function errorNdjson(message: string, headers: HeadersInit): Response {
  const body =
    JSON.stringify({ type: 'meta', appliedFeedbacks: [], via: 'anthropic-api' }) + '\n' +
    JSON.stringify({ type: 'error', message }) + '\n';
  return new Response(body, { status: 200, headers });
}

interface SystemPromptParts {
  claudeRules: string;
  docCatalog: string;      // Approach A — 프로젝트 문서 목록
  allDocsBundle: string;   // Approach B — 프로젝트 전체 문서 본문
  focusedDoc: string;
  focusedDocPath: string;
  recentFeedback: string;
  codeSnippets: string;
  codeRepo: string;
  hasAttachments: boolean;
}

/** Anthropic prompt caching 을 활용하는 system 메시지 배열 생성.
 *  안정 블록 (rules + 카탈로그 + 전체 문서) 에 cache_control: ephemeral 마킹 → 5분 TTL 캐시.
 *  변화 블록 (선택 문서, 최근 피드백, 코드 스니펫) 은 매번 새로 구성. */
type SystemBlock =
  | { type: 'text'; text: string }
  | { type: 'text'; text: string; cache_control: { type: 'ephemeral' } };

function buildSystemBlocks(p: SystemPromptParts): SystemBlock[] {
  const blocks: SystemBlock[] = [];

  // 블록 1 (캐시 대상) — 안정적. rules + 카탈로그 + 전체 문서
  const stable = buildStableBlock(p);
  if (stable) {
    blocks.push({ type: 'text', text: stable, cache_control: { type: 'ephemeral' } });
  }

  // 블록 2 (캐시 X) — 매번 바뀜. 선택 문서 · 최근 피드백 · 코드 스니펫 · 첨부 안내
  const volatile = buildVolatileBlock(p);
  if (volatile) {
    blocks.push({ type: 'text', text: volatile });
  }

  return blocks;
}

function buildStableBlock(p: SystemPromptParts): string {
  const lines: string[] = [
    '당신은 정책문서를 근거로 협업자(QA·개발자) 질문에 답변하는 봇입니다.',
    '아래 [Rules] 의 §A "답변할 때" 규칙을 **반드시** 지키세요.',
    '답변은 GitHub Pages 챗 박스에 그대로 표시됩니다. 마크다운 OK.',
    '',
    '[답변에 표·이미지 사용 가이드]',
    '- **표**: 정책 vs 화면 비교, 케이스별 동작 차이, 카탈로그 같이 항목이 여러 줄로 나뉘는 정보는 마크다운 표 (`| col1 | col2 |`) 로 작성. 단, ≤ 7줄 규칙은 표 행 수 포함이 아닌 본문 줄 수 기준.',
    '- **이미지**: 아래 [현재 협업자가 보고 있는 문서] (또는 [프로젝트 전체 문서]) 안에 등장한 `![alt](URL)` 이미지 URL 만 답변에 그대로 인용 가능. 본 문서에 없는 외부 URL 은 임의 생성 금지.',
    '',
    '[📋 변경 제안 블록 — 정책 수정·신설이 필요할 때 답변 맨 끝에 반드시 첨부]',
    '',
    '정책 자체를 변경해야 한다고 판단되면 답변 본문 끝에 아래 형식의 블록을 붙이세요.',
    '프론트가 이 블록을 파싱해서 기획자에게 전달 팝업을 자동 채웁니다:',
    '',
    '```',
    '### 📋 변경 제안',
    '- 📌 요청 제목: <30자 이내 한 줄 요약>',
    '- 📄 대상 파일: <파일명>',
    '- 📍 위치: <§X-Y>',
    '- ✏️ 변경 전: <현재 정책 문구 또는 "정책 미정의">',
    '- ✅ 변경 후: <제안 문구, 시각 명세 포함>',
    '- 💡 근거: <한 줄 사유>',
    '```',
    '- 변경 필요 없으면 이 블록 생성 X. 부족한 필드는 "(협업자·기획자 검토 필요)" 로 표기',
  ];

  // 카탈로그 (Approach A)
  if (p.docCatalog) {
    lines.push(
      '',
      '[📚 프로젝트 문서 카탈로그 — 관련 문서 안내에 활용]',
      '아래 문서 목록을 알고 있으니, 사용자 질문이 다른 문서를 참고해야 잘 답변된다고 판단되면',
      '"이 케이스는 XX 문서 §X-Y 를 참고하세요 (좌측에서 선택)" 처럼 안내하세요.',
      '단 답변 근거는 아래 [현재 협업자가 보고 있는 문서] 만 사용 (본문 X 인 다른 문서를 근거로',
      '단정하지 말 것 — 아는 척 금지).',
      '',
      p.docCatalog,
    );
  }

  // 전체 문서 본문 (Approach B) — 옵션
  if (p.allDocsBundle) {
    lines.push(
      '',
      '[📖 프로젝트 전체 정책 문서 본문 — 답변에 종합 활용]',
      '아래 전체 문서를 근거로 여러 정책을 크로스-참조하며 답변할 수 있습니다.',
      '답변 시 반드시 어느 문서 §X-Y 를 인용했는지 명시하세요.',
      '',
      p.allDocsBundle,
    );
  }

  lines.push('', '[Rules — CLAUDE.md]', p.claudeRules || '(규칙 파일 없음)');
  return lines.join('\n');
}

function buildVolatileBlock(p: SystemPromptParts): string {
  const parts: string[] = [];

  if (p.hasAttachments) {
    parts.push('**사용자가 이미지를 첨부했습니다** — 첨부 이미지 내용을 직접 시각 분석해서 답변에 반영. 정책과 다르면 §A-2 drift 형식으로 명시.');
  }
  if (p.codeSnippets) {
    parts.push('**관련 코드 스니펫이 함께 제공됩니다** — 정책 vs 코드 drift 판정에 활용. 파일 경로·라인 번호 반드시 표기.');
  }
  parts.push(
    '',
    '[현재 협업자가 보고 있는 문서]',
    p.focusedDocPath ? `경로: ${p.focusedDocPath}` : '(선택된 문서 없음)',
    '',
    p.focusedDoc || '(문서 내용 없음 — 일반 질문)',
  );
  if (p.codeSnippets) {
    parts.push('', `[관련 코드 스니펫 — ${p.codeRepo}]`, p.codeSnippets);
  }
  parts.push('', '[Recent QA Feedback]', p.recentFeedback || '(없음)');
  return parts.join('\n');
}

/* ────────── 3-a. 문서 카탈로그 · 전체 문서 fetch ────────── */

// extractProjectFromPath 는 helpers.ts 에서 import

/** 프로젝트 문서 카탈로그 — 제목 + 경로 목록 (컨텐츠 X). 시스템 프롬프트 안정 블록에 삽입.
 *  listDocs 를 재사용하므로 별도 GitHub API 호출 없음 (5분 캐시). */
async function buildDocCatalog(env: Env, project: string): Promise<string> {
  const { docs } = await listDocs(env, project);
  if (docs.length === 0) return '';
  const policies = docs.filter((d) => d.kind === 'policy');
  const storyboards = docs.filter((d) => d.kind === 'storyboard');
  const lines: string[] = [];
  if (policies.length) {
    lines.push('정책 문서:');
    for (const d of policies) lines.push(`- ${d.title} (${d.path})`);
  }
  if (storyboards.length) {
    lines.push('', '화면설계서:');
    for (const d of storyboards) lines.push(`- ${d.title} (${d.path})`);
  }
  return lines.join('\n');
}

/** 프로젝트 전체 정책 문서 본문 번들 — Anthropic prompt caching 대상.
 *  focusedDocPath 는 이미 volatile 블록에 들어가므로 여기서 제외 (중복 방지). */
async function buildAllDocsBundle(env: Env, project: string, focusedDocPath?: string): Promise<string> {
  const { docs } = await listDocs(env, project);
  const policies = docs.filter((d) => d.kind === 'policy' && d.path !== focusedDocPath);
  if (policies.length === 0) return '';
  // 총 크기 sanity check — 200K 자 (~50K token) 넘으면 이 요청은 skip.
  const MAX_BUNDLE_CHARS = 200_000;
  const chunks: string[] = [];
  let total = 0;
  for (const d of policies) {
    const raw = await fetchTextFileCached(env, d.path).catch(() => '');
    if (!raw) continue;
    const block = `\n=== ${d.path} ===\n${raw}`;
    if (total + block.length > MAX_BUNDLE_CHARS) {
      chunks.push(`\n[⚠️ 전체 문서 번들 크기 상한 (${MAX_BUNDLE_CHARS}자) 초과 — 이후 문서 생략]`);
      break;
    }
    chunks.push(block);
    total += block.length;
  }
  return chunks.join('');
}

/* ────────── 3-b. 코드 스니펫 fetch (옵션) ──────────
 *
 *  GitHub Search Code API 로 질문 관련 파일 top-N 을 찾고 각 파일 앞부분 truncate.
 *  실패 시 빈 문자열 반환 — /qa 응답 자체는 계속 정상 진행.
 *  주의: Search Code API 는 rate limit 이 짧아 (30 req/min) 캐시 어렵지만
 *        Cloudflare Workers 무료 tier 규모의 QA 트래픽에선 충분.
 */

interface CodeSnippetOpts {
  repo: string;
  question: string;
  pathHints: string[];
  searchHint: string;
  maxSnippets: number;
  snippetLines: number;
  /** 현재 협업자가 열어둔 정책 md 본문 — 인라인 영문 심볼 (백틱·PascalCase 등) 추출용.
   *  한글 질문에서 뽑히지 않는 컴포넌트명·훅명을 여기서 보강해 검색 매치 확률 상승. */
  focusedDoc?: string;
}

/** 진단 정보 — /qa NDJSON meta 로 프론트에 전달돼 답변 상단 배지로 표시. */
export type CodeInjectionStatus =
  | 'ok'              // 스니펫 N 개 인용 성공
  | 'no-repo'         // config 에 code_repo 미설정 (기능 꺼짐)
  | 'no-keywords'     // 질문에서 검색 키워드 추출 실패 (너무 짧거나 불용어만)
  | 'search-error'    // GitHub Search API HTTP 에러 (PAT scope 부족 등)
  | 'empty'           // Search 는 성공했으나 매칭 파일 0 건
  | 'fetch-error';    // Search 매칭은 있으나 개별 파일 fetch 모두 실패

export interface CodeInjectionDiagnostic {
  status: CodeInjectionStatus;
  repo: string;
  count: number;
  keywords: string;
  files: string[];      // 인용된 파일 경로 (repo prefix 없이)
  errorHint?: string;   // 사용자 액션 힌트 (한글). PAT scope, 검색 실패 등.
  query?: string;       // 실제 GitHub Search API 로 보낸 쿼리 문자열 — 트러블슈팅용
  totalCount?: number;  // Search API 응답의 total_count — repo 인덱싱 여부 판단
  attempts?: number;    // 재시도 포함 총 검색 시도 횟수 (기본 1, fallback 있으면 2)
}

interface CodeSnippetResult {
  snippets: string;
  diagnostic: CodeInjectionDiagnostic;
}

/** GitHub Search Code API 한 번 호출 — items + total_count 반환. */
interface SearchAttemptResult {
  ok: boolean;
  status: number;
  items: Array<{ path: string; repository?: { full_name?: string } }>;
  totalCount: number;
}
async function runCodeSearch(env: Env, query: string, perPage: number): Promise<SearchAttemptResult> {
  const res = await ghFetch(env, `/search/code?q=${encodeURIComponent(query)}&per_page=${perPage}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) {
    return { ok: false, status: res.status, items: [], totalCount: 0 };
  }
  const json = (await res.json()) as {
    items?: Array<{ path: string; repository?: { full_name?: string } }>;
    total_count?: number;
  };
  return {
    ok: true,
    status: res.status,
    items: json.items ?? [],
    totalCount: json.total_count ?? 0,
  };
}

async function fetchCodeSnippets(env: Env, opts: CodeSnippetOpts): Promise<CodeSnippetResult> {
  const emptyResult = (
    status: CodeInjectionStatus,
    keywords: string,
    errorHint?: string,
    extra?: Partial<CodeInjectionDiagnostic>,
  ): CodeSnippetResult => ({
    snippets: '',
    diagnostic: { status, repo: opts.repo, count: 0, keywords, files: [], errorHint, ...extra },
  });

  if (!opts.repo || !/^[\w.-]+\/[\w.-]+$/.test(opts.repo)) {
    return emptyResult('no-repo', '');
  }

  // ── 검색어 파이프라인 ── 여러 후보를 조합해 매칭 확률 최대화
  //   1) 기본 질문 키워드 (기존 방식 · 한글 위주)
  //   2) 한글 UI 용어 → 영문 매핑 (대시보드→Dashboard, 초기화→reset 등)
  //   3) 열려있는 정책 md 안 인라인 영문 심볼 (백틱·PascalCase·camelCase)
  // 우선 순위: 심볼 > 영문 매핑 > 한글 키워드 (매치 잘 되는 것부터)
  const baseKeywords = extractSearchKeywords(opts.question, '');    // hint 는 별도 처리
  const koreanExpanded = expandKoreanUiTerms(opts.question);
  const docSymbols = extractCodeSymbols(opts.focusedDoc ?? '').slice(0, 6);

  // 통합 토큰 — 심볼·영문매핑·한글 순서로 최대 8개
  const merged: string[] = [];
  const pushUnique = (arr: string[]) => {
    for (const t of arr) if (t && !merged.includes(t) && merged.length < 8) merged.push(t);
  };
  pushUnique(docSymbols);
  pushUnique(koreanExpanded);
  pushUnique(baseKeywords ? baseKeywords.split(/\s+/) : []);

  // ⚠️ 핵심: GitHub /search/code 는 공백 = AND. 8개 토큰을 공백으로 이으면
  //   "파일 하나에 8개 심볼이 모두 있어야 매칭" = 사실상 불가능.
  //   → OR 로 묶어서 "이 중 아무거나 있는 파일" 을 찾도록. 노이즈 감수하고
  //   실제 매칭 확률 확보. 그 뒤 top-N 슬라이스가 관련도순으로 뽑아줌.
  const orGroup = merged.length > 0 ? `(${merged.join(' OR ')})` : '';
  const hintExpr = opts.searchHint?.trim() ? `(${opts.searchHint.trim()})` : '';
  const primaryKeywords = [orGroup, hintExpr].filter(Boolean).join(' OR ');

  if (!primaryKeywords) {
    return emptyResult(
      'no-keywords',
      '',
      '질문에서 검색어 추출 실패 — 화면명·컴포넌트명·기능명을 포함해 질문해보세요.',
      { attempts: 0 },
    );
  }

  // Path qualifier — 주의: GitHub /search/code 는 다중 `path:` / `extension:` 를 AND 로 처리.
  //   `path:src/pages path:src/components` = "동시에 두 경로에 있는 파일" = 매칭 불가능.
  // → pathHints 가 1개면 그대로 사용, 여러 개면 path 필터 skip (repo scope 만으로 검색).
  //   너무 좁혀서 0건 나오느니 넓게 훑는 게 실용상 더 나음.
  const pathQualifier = opts.pathHints.length === 1
    ? extPathToQualifier(opts.pathHints[0])
    : '';
  const buildQuery = (kws: string): string =>
    `${kws} repo:${opts.repo}${pathQualifier ? ' ' + pathQualifier : ''}`;
  const query = buildQuery(primaryKeywords);

  // 같은 질문·키워드로 60초 내에 다시 오면 캐시 사용 → 대화 반복 시 GitHub Search rate 절약
  const cacheK = `search::${query}::${opts.maxSnippets}::${opts.snippetLines}`;
  const cached = codeCache.get(cacheK);
  if (cached && Date.now() - cached.at < CODE_TTL_MS) {
    return cached.data as CodeSnippetResult;
  }

  // 1차 시도 — 통합 검색어
  let attempts = 1;
  let attempt = await runCodeSearch(env, query, opts.maxSnippets);
  let usedQuery = query;
  let usedKeywords = primaryKeywords;

  if (!attempt.ok) {
    const hint = attempt.status === 403 || attempt.status === 404
      ? `GITHUB_TOKEN 의 접근권이 ${opts.repo} 에 없거나 rate limit 초과 (HTTP ${attempt.status}). PAT scope 재확인 필요.`
      : `GitHub Search API HTTP ${attempt.status}. 잠시 후 재시도.`;
    console.warn(`[qa-bot] code search HTTP ${attempt.status} for ${opts.repo}`);
    const result = emptyResult('search-error', primaryKeywords, hint, { query, attempts });
    codeCache.set(cacheK, { at: Date.now(), data: result });
    return result;
  }

  // 2차 시도 (fallback) — 1차 매칭 0건이고, docSymbols·koreanExpanded 있으면
  //  → 그것만으로 좁혀서 재검색 (한글 노이즈 제거해 매치 확률 상승)
  if (attempt.totalCount === 0 && (docSymbols.length > 0 || koreanExpanded.length > 0)) {
    const fallbackTokens: string[] = [];
    for (const t of [...docSymbols, ...koreanExpanded]) {
      if (!fallbackTokens.includes(t) && fallbackTokens.length < 6) fallbackTokens.push(t);
    }
    if (fallbackTokens.length > 0) {
      const fallbackKeywords = fallbackTokens.join(' ');
      const fallbackQuery = buildQuery(fallbackKeywords);
      if (fallbackQuery !== query) {
        attempts = 2;
        const retry = await runCodeSearch(env, fallbackQuery, opts.maxSnippets);
        if (retry.ok && retry.totalCount > 0) {
          attempt = retry;
          usedQuery = fallbackQuery;
          usedKeywords = fallbackKeywords;
        }
      }
    }
  }

  const items = attempt.items.slice(0, opts.maxSnippets);
  if (items.length === 0) {
    const searchUrl = `https://github.com/${opts.repo}/search?q=${encodeURIComponent(usedKeywords)}&type=code`;
    const result = emptyResult(
      'empty',
      usedKeywords,
      `매칭 파일 0 건. 총 매칭 total_count=${attempt.totalCount}. GitHub UI 로 직접 검색해서 인덱싱 상태 확인: ${searchUrl}`,
      { query: usedQuery, totalCount: attempt.totalCount, attempts },
    );
    codeCache.set(cacheK, { at: Date.now(), data: result });
    return result;
  }

  const snippets: string[] = [];
  const files: string[] = [];
  for (const it of items) {
    const fullName = it.repository?.full_name ?? opts.repo;
    try {
      const raw = await fetchTextFileCached({ ...env, GITHUB_REPO: fullName }, it.path);
      const truncated = raw.split('\n').slice(0, opts.snippetLines).join('\n');
      const ext = it.path.split('.').pop() ?? '';
      snippets.push(`--- ${fullName}/${it.path} (첫 ${opts.snippetLines}줄) ---\n\`\`\`${ext}\n${truncated}\n\`\`\``);
      files.push(it.path);
    } catch (err) {
      console.warn(`[qa-bot] fetch code file failed: ${it.path}`, err);
    }
  }

  if (snippets.length === 0) {
    const result = emptyResult(
      'fetch-error',
      usedKeywords,
      `Search 매칭 ${items.length} 건 발견했으나 파일 본문 fetch 모두 실패. PAT scope 확인 필요.`,
      { query: usedQuery, totalCount: attempt.totalCount, attempts },
    );
    codeCache.set(cacheK, { at: Date.now(), data: result });
    return result;
  }

  const combined = snippets.join('\n\n');
  const result: CodeSnippetResult = {
    snippets: combined,
    diagnostic: {
      status: 'ok',
      repo: opts.repo,
      count: snippets.length,
      keywords: usedKeywords,
      files,
      query: usedQuery,
      totalCount: attempt.totalCount,
      attempts,
    },
  };
  codeCache.set(cacheK, { at: Date.now(), data: result });
  return result;
}

// extractSearchKeywords, extPathToQualifier 는 helpers.ts 에서 import

async function fetchRecentFeedback(env: Env): Promise<string> {
  const entries = await fetchDirListingCached(env, 'qa/feedback').catch(() => []);
  const mdFiles = entries
    .filter((e) => e.type === 'file' && e.name.endsWith('.md') && !e.name.startsWith('_'))
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, 10);
  if (mdFiles.length === 0) return '';
  const contents = await Promise.all(
    mdFiles.map(async (f) => `\n=== ${f.path} ===\n${await fetchTextFileCached(env, f.path)}`),
  );
  return contents.join('\n');
}

/* ────────── 4. /forward — qa/decisions/ 자동 생성 ────────── */

interface ForwardRequest {
  docPath?: string;
  topic: string; // 짧은 제목 (파일명에 들어감)
  summary: string; // 합의 요약
  qa: { question: string; answer: string }[];
  user?: string; // 질문자 이름 (협업자 챗의 state.user.name)
}

interface ForwardResponse {
  decisionPath: string;
  commitSha: string;
  htmlUrl: string;
}

async function forwardToDecisions(env: Env, body: ForwardRequest): Promise<ForwardResponse> {
  if (!body.topic?.trim()) throw new Error('topic required');
  if (!body.qa?.length) throw new Error('qa array required');

  const today = new Date().toISOString().slice(0, 10);
  const slug = slugify(body.topic);
  const decisionPath = `qa/decisions/${today}-${slug}.md`;

  const md = renderDecisionMarkdown({
    today,
    docPath: body.docPath,
    topic: body.topic,
    summary: body.summary,
    qa: body.qa,
    user: body.user,
  });

  // GitHub Contents API 로 새 파일 생성
  const res = await ghFetch(env, `/repos/${env.GITHUB_REPO}/contents/${encodeContentPath(decisionPath)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `qa-decision: ${body.topic}\n\n협업자 챗에서 합의된 내용을 자동 기록. 기획자 review 대기.`,
      content: utf8ToBase64(md),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub create file ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = (await res.json()) as { content: { sha: string; html_url: string } };
  invalidateCache(env, 'qa/decisions', decisionPath);
  return { decisionPath, commitSha: data.content.sha, htmlUrl: data.content.html_url };
}

function renderDecisionMarkdown(p: {
  today: string;
  docPath?: string;
  topic: string;
  summary: string;
  qa: { question: string; answer: string }[];
  user?: string;
}): string {
  const qaBlock = p.qa
    .map((t, i) => `### Q${i + 1}\n\n${t.question}\n\n#### A${i + 1}\n\n${t.answer}`)
    .join('\n\n---\n\n');

  return `# ${p.topic}

| 항목 | 내용 |
|---|---|
| 일자 | ${p.today} |
| 질문자 | ${p.user || '익명'} |
| 관련 문서 | ${p.docPath ? `\`${p.docPath}\`` : '(미지정)' } |
| 출처 | 협업자 챗 — \`qa.html\` |
| 기획자 review | ⏳ 대기 |

## 합의 요약

${p.summary || '_(요약 입력 안 됨)_'}

## 대화 내역

${qaBlock}

## 다음 액션 (기획자)

- [ ] 답변 내용 검토
- [ ] 정책문서/화면에 반영 (patch bump + cross-link 갱신)
- [ ] 본 파일 상단 "기획자 review" 를 ✅ 로 변경 후 commit
`;
}

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s\\/]+/g, '-')
    .replace(/[^a-z0-9가-힣\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'qa';
}

function utf8ToBase64(str: string): string {
  // Workers 환경: btoa 는 latin1 만 지원 → TextEncoder + base64
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/* ────────── GitHub helpers ────────── */

interface ContentEntry {
  type: 'file' | 'dir';
  name: string;
  path: string;
}

async function fetchDirListing(env: Env, path: string): Promise<ContentEntry[]> {
  const res = await ghFetch(env, `/repos/${env.GITHUB_REPO}/contents/${encodeContentPath(path)}`);
  if (!res.ok) throw new Error(`fetch dir ${path}: ${res.status}`);
  return (await res.json()) as ContentEntry[];
}

async function fetchTextFile(env: Env, path: string): Promise<string> {
  // 표준 JSON 응답 + base64 decode 사용. `Accept: application/vnd.github.raw` 는
  // private repo 일부 파일에서 403 을 반환하는 케이스가 있어 회피.
  const res = await ghFetch(env, `/repos/${env.GITHUB_REPO}/contents/${encodeContentPath(path)}`);
  if (!res.ok) throw new Error(`fetch file ${path}: ${res.status}`);
  const data = (await res.json()) as { content?: string; encoding?: string };
  if (data.encoding === 'base64' && typeof data.content === 'string') {
    return base64ToUtf8(data.content);
  }
  return (data.content ?? '') as string;
}

function encodeContentPath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/');
}

async function ghFetch(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const url = `https://api.github.com${path}`;
  const headers = new Headers(init.headers ?? {});
  headers.set('Authorization', `Bearer ${env.GITHUB_TOKEN}`);
  headers.set('User-Agent', 'planner-qa-bot');
  if (!headers.has('Accept')) headers.set('Accept', 'application/vnd.github+json');
  if (init.method === 'POST' || init.method === 'PATCH' || init.method === 'PUT') {
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  }
  return await fetch(url, { ...init, headers });
}

/* ────────── /list-projects ────────── */

/** 우선순위: config.yml 의 projects[] → 없으면 `projects/` 폴더 스캔 fallback.
 *  라벨은 config 의 `projects[].label` 을 그대로 사용. 없으면 id 노출. 팀 별 하드코딩 없음. */
async function listProjects(env: Env): Promise<{ projects: Array<{ id: string; label: string }>; default: string }> {
  const cfg = await loadTeamConfig(env);
  const fromConfig = cfg?.projects ?? [];
  if (fromConfig.length > 0) {
    const projects = fromConfig
      .filter((p) => p.id)
      .map((p) => ({ id: p.id, label: p.label || p.id }));
    return { projects, default: projects[0]?.id ?? '' };
  }

  // fallback — config.yml 없는 팀
  const entries = await fetchDirListingCached(env, 'projects').catch(() => [] as ContentEntry[]);
  const projects: Array<{ id: string; label: string }> = [];
  for (const e of entries) {
    if (e.type !== 'dir') continue;
    const hasDocs = await fetchDirListingCached(env, `${e.path}/docs`).then(() => true).catch(() => false);
    if (!hasDocs) continue;
    projects.push({ id: e.name, label: e.name });
  }
  return { projects, default: projects[0]?.id ?? '' };
}

/* ────────── /list-decisions, /list-feedbacks ────────── */

interface QaFileEntry {
  path: string;
  title: string;
  date: string;
  status?: string;
  statusText?: string;
  preview?: string;
  user?: string;
  improvement?: string;
}

function parseLimit(raw: string | null): number {
  const n = parseInt(raw || '20', 10);
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(n, 100);
}

// YYYY-MM-DD-<slug>(-NN).md → {path, title, date}
function parseQaFileName(name: string, dir: string): QaFileEntry {
  const m = name.match(/^(\d{4}-\d{2}-\d{2})-(.+?)(?:-\d{2})?\.md$/);
  return {
    path: `${dir}/${name}`,
    title: m ? m[2].replace(/-/g, ' ') : name.replace(/\.md$/, ''),
    date: m ? m[1] : '',
  };
}

async function listMdDir(env: Env, subdir: string, limit: number): Promise<QaFileEntry[]> {
  const entries = await fetchDirListing(env, subdir).catch(() => [] as ContentEntry[]);
  return entries
    .filter((e) => e.type === 'file' && e.name.endsWith('.md') && !e.name.startsWith('_') && e.name.toLowerCase() !== 'readme.md')
    .map((e) => e.name)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit)
    .map((n) => parseQaFileName(n, subdir));
}

function parseDecisionStatus(md: string): { status: string; statusText: string } {
  const m = md.match(/^\|\s*기획자[^|]*\|\s*([^|]+?)\s*\|\s*$/m);
  if (!m) return { status: 'pending', statusText: '📋 대기' };
  const text = m[1].trim();
  if (/✅/.test(text)) return { status: 'applied', statusText: text };
  if (/🚫/.test(text)) return { status: 'rejected', statusText: text };
  return { status: 'pending', statusText: text };
}

async function listDecisions(env: Env, limit: number): Promise<{ items: QaFileEntry[] }> {
  const items = await listMdDir(env, 'qa/decisions', limit);
  await Promise.all(
    items.map(async (it) => {
      try {
        const md = await fetchTextFile(env, it.path);
        const { status, statusText } = parseDecisionStatus(md);
        it.status = status;
        it.statusText = statusText;
        const proposal = md.match(/📍\s*위치:\s*([^\n]+)/);
        it.preview = proposal ? proposal[1].trim() : '';
        const userMatch = md.match(/^\|\s*질문자\s*\|\s*([^|]+?)\s*\|\s*$/m);
        it.user = userMatch ? userMatch[1].trim() : '';
      } catch (_) {
        it.status = 'pending';
        it.statusText = '';
        it.preview = '';
        it.user = '';
      }
    }),
  );
  return { items };
}

async function listFeedbacks(env: Env, limit: number): Promise<{ items: QaFileEntry[] }> {
  const items = await listMdDir(env, 'qa/feedback', limit);
  await Promise.all(
    items.map(async (it) => {
      try {
        const md = await fetchTextFile(env, it.path);
        const m = md.match(/##\s*개선 요청 사항\s*\n+([^\n]+)/);
        it.improvement = m ? m[1].slice(0, 80) : '';
        const userMatch = md.match(/^\|\s*질문자\s*\|\s*([^|]+?)\s*\|\s*$/m);
        it.user = userMatch ? userMatch[1].trim() : '';
      } catch (_) {
        it.improvement = '';
        it.user = '';
      }
    }),
  );
  return { items };
}

/* ────────── /update-decision-status ────────── */

const PLANNER_NOTE_START = '<!-- planner-note:start -->';
const PLANNER_NOTE_END = '<!-- planner-note:end -->';

// escapeRegex, escapeHtml, renderNoteBodyHtml 은 helpers.ts 에서 import

interface PlannerNoteOpts {
  kind: 'applied' | 'rejected' | null;
  content: string;
  plannerName: string;
}

// 합의문 상단(제목 바로 아래) 에 "📝 기획자 적용 메모" 또는 "🚫 기획자 보류 사유"
// 박스형 블록을 멱등하게 신설/갱신/제거. content 가 비어있거나 kind 가 null 이면 블록 제거.
// 기존 블록이 파일 하단에 있던 옛 포맷도 함께 제거해 상단으로 이동시킴.
function upsertPlannerNote(md: string, opts: PlannerNoteOpts): string {
  const kind = opts.kind;
  const content = (opts.content || '').trim();
  const plannerName = (opts.plannerName || '').trim();

  const reBlock = new RegExp(
    `${escapeRegex(PLANNER_NOTE_START)}[\\s\\S]*?${escapeRegex(PLANNER_NOTE_END)}\\r?\\n?`,
    'g',
  );
  let cleaned = md.replace(reBlock, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';

  if (!kind || !content) return cleaned;

  const date = new Date().toISOString().slice(0, 10);
  const name = plannerName || '기획자';
  const applied = kind === 'applied';
  const title = applied ? '기획자 적용 메모' : '기획자 보류 사유';
  const icon = applied ? '📝' : '🚫';
  const cls = applied ? 'applied' : 'rejected';
  const desc = applied
    ? '협업자가 요청한 내용과 실제 적용된 내용에 차이가 있어 아래처럼 반영했습니다.'
    : '아래 사유로 이번 변경 요청을 보류합니다.';
  const bodyHtml = renderNoteBodyHtml(content);

  const block =
    `${PLANNER_NOTE_START}\n` +
    `<div class="planner-memo planner-memo-${cls}">\n` +
    `  <div class="planner-memo-head">${icon} <b>${title}</b> · ${date} · 👤 ${escapeHtml(name)}</div>\n` +
    `  <div class="planner-memo-desc">${desc}</div>\n` +
    `  <div class="planner-memo-body">${bodyHtml}</div>\n` +
    `</div>\n` +
    `${PLANNER_NOTE_END}\n\n`;

  const titleMatch = cleaned.match(/^# [^\n]*\n+/);
  if (titleMatch) {
    const idx = titleMatch[0].length;
    return cleaned.slice(0, idx) + block + cleaned.slice(idx);
  }
  return block + cleaned;
}

function base64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

interface UpdateDecisionStatusBody {
  path: string;
  status: 'pending' | 'applied' | 'rejected';
  note?: string;
  reason?: string;
  date?: string;
  plannerName?: string;
}

async function updateDecisionStatus(env: Env, body: UpdateDecisionStatusBody): Promise<{ path: string; status: string; statusText: string; committed: boolean }> {
  if (!body.path || !/^qa\/decisions\/[^/]+\.md$/.test(body.path)) {
    throw new Error('valid qa/decisions/ path required');
  }
  const allowed = ['pending', 'applied', 'rejected'];
  if (!allowed.includes(body.status)) throw new Error(`status must be one of ${allowed.join(', ')}`);

  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const reasonRaw = typeof body.reason === 'string' ? body.reason.trim() : '';
  const plannerName = typeof body.plannerName === 'string' ? body.plannerName.trim() : '';

  let newText: string;
  if (body.status === 'applied') {
    const date = body.date || new Date().toISOString().slice(0, 10);
    newText = note ? `✅ ${date} 적용 (메모 있음)` : `✅ ${date} 적용`;
  } else if (body.status === 'rejected') {
    const reason = reasonRaw || '사유 미입력';
    newText = `🚫 보류 (${reason})`;
  } else {
    newText = '📋 대기';
  }

  const contentRes = await ghFetch(env, `/repos/${env.GITHUB_REPO}/contents/${encodeContentPath(body.path)}`);
  if (!contentRes.ok) throw new Error(`fetch decision file ${body.path}: ${contentRes.status}`);
  const contentData = (await contentRes.json()) as { sha: string; content: string; encoding: string };
  const md = contentData.encoding === 'base64' ? base64ToUtf8(contentData.content) : contentData.content;

  const re = /^(\|\s*기획자[^|]*\|\s*)([^|]+?)(\s*\|\s*)$/m;
  if (!md.match(re)) throw new Error('"기획자 ..." 표 행을 찾지 못했습니다 (decision md 첫 표 양식 확인)');

  let replaced = md.replace(re, `$1${newText}$3`);
  if (body.status === 'applied') {
    replaced = upsertPlannerNote(replaced, { kind: 'applied', content: note, plannerName });
  } else if (body.status === 'rejected') {
    replaced = upsertPlannerNote(replaced, { kind: 'rejected', content: reasonRaw, plannerName });
  } else {
    replaced = upsertPlannerNote(replaced, { kind: null, content: '', plannerName });
  }

  if (replaced === md) {
    return { path: body.path, status: body.status, statusText: newText, committed: false };
  }

  const putRes = await ghFetch(env, `/repos/${env.GITHUB_REPO}/contents/${encodeContentPath(body.path)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `qa-decision status=${body.status}: ${body.path.split('/').pop()}`,
      content: utf8ToBase64(replaced),
      sha: contentData.sha,
    }),
  });
  if (!putRes.ok) {
    const text = await putRes.text();
    throw new Error(`GitHub update ${putRes.status}: ${text.slice(0, 500)}`);
  }
  return { path: body.path, status: body.status, statusText: newText, committed: true };
}

/* ────────── /delete-decision ────────── */

async function deleteDecision(env: Env, body: { path: string }): Promise<{ path: string; deleted: boolean; committed: boolean }> {
  if (!body.path || !/^qa\/decisions\/[^/]+\.md$/.test(body.path)) {
    throw new Error('valid qa/decisions/ path required');
  }
  const contentRes = await ghFetch(env, `/repos/${env.GITHUB_REPO}/contents/${encodeContentPath(body.path)}`);
  if (contentRes.status === 404) {
    return { path: body.path, deleted: false, committed: false };
  }
  if (!contentRes.ok) throw new Error(`fetch decision file ${body.path}: ${contentRes.status}`);
  const contentData = (await contentRes.json()) as { sha: string };

  const delRes = await ghFetch(env, `/repos/${env.GITHUB_REPO}/contents/${encodeContentPath(body.path)}`, {
    method: 'DELETE',
    body: JSON.stringify({
      message: `qa-decision delete: ${body.path.split('/').pop()}`,
      sha: contentData.sha,
    }),
  });
  if (!delRes.ok) {
    const text = await delRes.text();
    throw new Error(`GitHub delete ${delRes.status}: ${text.slice(0, 500)}`);
  }
  return { path: body.path, deleted: true, committed: true };
}

/* ────────── /feedback ────────── */

interface FeedbackBody {
  improvement: string;
  question: string;
  answer: string;
  title?: string;
  docPath?: string;
  user?: string;
}

async function saveFeedback(env: Env, body: FeedbackBody): Promise<{ feedbackPath: string; commitSha: string; htmlUrl: string }> {
  if (!body.improvement?.trim()) throw new Error('improvement required');
  if (!body.question?.trim()) throw new Error('question required');
  if (!body.answer?.trim()) throw new Error('answer required');

  const today = new Date().toISOString().slice(0, 10);
  const slug = slugify(body.title || body.improvement.slice(0, 30) || body.question.slice(0, 30));

  // 같은 날 slug 충돌 시 suffix
  let relPath = `qa/feedback/${today}-${slug}.md`;
  let suffix = 1;
  while ((await fileExists(env, relPath)) && suffix < 100) {
    relPath = `qa/feedback/${today}-${slug}-${String(suffix).padStart(2, '0')}.md`;
    suffix++;
  }
  if (suffix >= 100) throw new Error('too many feedback files today with same slug');

  const md = renderFeedbackMarkdown({
    today,
    docPath: body.docPath,
    title: body.title || slug,
    question: body.question,
    answer: body.answer,
    improvement: body.improvement,
    user: body.user,
  });

  const putRes = await ghFetch(env, `/repos/${env.GITHUB_REPO}/contents/${encodeContentPath(relPath)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `feedback(qa): ${slug.slice(0, 40)}\n\n협업자 챗에서 답변 개선 요청. 다음 응답부터 qa/feedback/ 로드되어 자동 반영.`,
      content: utf8ToBase64(md),
    }),
  });
  if (!putRes.ok) {
    const text = await putRes.text();
    throw new Error(`GitHub create ${putRes.status}: ${text.slice(0, 500)}`);
  }
  const data = (await putRes.json()) as { content: { sha: string; html_url: string }; commit: { sha: string; html_url: string } };
  // 새 피드백이 즉시 /qa 시스템 프롬프트에 반영되도록 관련 캐시 무효화
  invalidateCache(env, 'qa/feedback', relPath);
  return {
    feedbackPath: relPath,
    commitSha: data.commit.sha,
    htmlUrl: data.commit.html_url,
  };
}

async function fileExists(env: Env, path: string): Promise<boolean> {
  const res = await ghFetch(env, `/repos/${env.GITHUB_REPO}/contents/${encodeContentPath(path)}`);
  return res.status < 400;
}

function renderFeedbackMarkdown(p: {
  today: string;
  docPath?: string;
  title: string;
  question: string;
  answer: string;
  improvement: string;
  user?: string;
}): string {
  return `# ${p.title}

| 항목 | 내용 |
|---|---|
| 일자 | ${p.today} |
| 질문자 | ${p.user || '익명'} |
| 관련 문서 | ${p.docPath ? '\`' + p.docPath + '\`' : '(미지정)'} |
| 유형 | 답변 개선 요청 (chat) |

## 개선 요청 사항

${p.improvement}

## 원본 컨텍스트

### 질문

${p.question}

### 답변 (개선 대상)

${p.answer}

## 적용 룰

향후 동일·유사 컨텍스트의 답변 작성 시 위 "개선 요청 사항" 을 반영하세요.
같은 카테고리 (길이·톤·시각적 묘사·예시 등) 의 피드백이 누적되면 강조해서 적용.
`;
}

/* ────────── /delete-feedback ────────── */

async function deleteFeedback(env: Env, body: { path: string }): Promise<{ path: string; deleted: boolean; committed: boolean }> {
  if (!body.path || !/^qa\/feedback\/[^/]+\.md$/.test(body.path)) {
    throw new Error('valid qa/feedback/ path required');
  }
  const contentRes = await ghFetch(env, `/repos/${env.GITHUB_REPO}/contents/${encodeContentPath(body.path)}`);
  if (contentRes.status === 404) {
    return { path: body.path, deleted: false, committed: false };
  }
  if (!contentRes.ok) throw new Error(`fetch feedback file ${body.path}: ${contentRes.status}`);
  const contentData = (await contentRes.json()) as { sha: string };

  const delRes = await ghFetch(env, `/repos/${env.GITHUB_REPO}/contents/${encodeContentPath(body.path)}`, {
    method: 'DELETE',
    body: JSON.stringify({
      message: `qa-feedback delete: ${body.path.split('/').pop()}`,
      sha: contentData.sha,
    }),
  });
  if (!delRes.ok) {
    const text = await delRes.text();
    throw new Error(`GitHub delete ${delRes.status}: ${text.slice(0, 500)}`);
  }
  return { path: body.path, deleted: true, committed: true };
}

/* ────────── /save-storyboard-image ────────── */

async function saveStoryboardImage(env: Env, body: { targetPath: string; dataUrl: string }): Promise<{ saved: boolean; path: string; bytes: number }> {
  if (!body.targetPath) throw new Error('targetPath required');
  if (!body.dataUrl) throw new Error('dataUrl required');
  const pathOk = /^projects\/[^/]+\/docs\/storyboards\/[^/]+\/images\/[^/]+\.(png|jpe?g|gif|webp)$/i.test(body.targetPath);
  if (!pathOk) {
    throw new Error('targetPath 는 projects/<project>/docs/storyboards/<storyboard>/images/<filename>.(png|jpg|jpeg|gif|webp) 형식이어야 합니다');
  }
  const match = String(body.dataUrl).match(/^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/i);
  if (!match) throw new Error('dataUrl 은 data:image/<png|jpg|jpeg|gif|webp>;base64,... 형식이어야 합니다');
  const base64Content = match[2].replace(/\s/g, '');

  const existRes = await ghFetch(env, `/repos/${env.GITHUB_REPO}/contents/${encodeContentPath(body.targetPath)}`);
  const existSha = existRes.ok ? ((await existRes.json()) as { sha: string }).sha : null;

  const putRes = await ghFetch(env, `/repos/${env.GITHUB_REPO}/contents/${encodeContentPath(body.targetPath)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `storyboard-image: ${body.targetPath.split('/').pop()}`,
      content: base64Content,
      ...(existSha ? { sha: existSha } : {}),
    }),
  });
  if (!putRes.ok) {
    const text = await putRes.text();
    throw new Error(`GitHub image upload ${putRes.status}: ${text.slice(0, 500)}`);
  }
  const bytes = Math.floor((base64Content.length * 3) / 4);
  return { saved: true, path: body.targetPath, bytes };
}

/* ────────── /save-decision-image ──────────
 *  기획자 메모용 이미지 업로드. 파일은 `qa/decisions/images/<decision-slug>/<filename>` 에 저장.
 *  reference 는 memo 안 `![alt](path)` 로 삽입되어 upsertPlannerNote 가 <img> 태그로 렌더.
 */
async function saveDecisionImage(
  env: Env,
  body: { decisionPath: string; dataUrl: string; filename?: string },
): Promise<{ saved: boolean; path: string; markdownRef: string; bytes: number }> {
  if (!body.decisionPath) throw new Error('decisionPath required');
  if (!body.dataUrl) throw new Error('dataUrl required');
  // decisionPath 는 `qa/decisions/YYYY-MM-DD-slug.md` 형식이어야 함
  const decisionMatch = body.decisionPath.match(/^qa\/decisions\/(\d{4}-\d{2}-\d{2}-[^./]+)\.md$/);
  if (!decisionMatch) {
    throw new Error('decisionPath 는 qa/decisions/YYYY-MM-DD-slug.md 형식이어야 합니다');
  }
  const decisionSlug = decisionMatch[1];

  const match = String(body.dataUrl).match(/^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/i);
  if (!match) throw new Error('dataUrl 은 data:image/<png|jpg|jpeg|gif|webp>;base64,... 형식이어야 합니다');
  const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const base64Content = match[2].replace(/\s/g, '');

  // 파일명 sanitize — 확장자 확정, 특수문자 제거
  const rawName = (body.filename || `image-${Date.now()}.${ext}`).replace(/[\/\\]/g, '');
  const safeBase = rawName.replace(/\.[^.]+$/, '').replace(/[^\w.-]/g, '_').slice(0, 60) || `image-${Date.now()}`;
  // 충돌 회피 — 같은 이름 이미 있으면 -1, -2, … 붙임
  const dir = `qa/decisions/images/${decisionSlug}`;
  let filename = `${safeBase}.${ext}`;
  let targetPath = `${dir}/${filename}`;
  let suffix = 1;
  while ((await fileExists(env, targetPath)) && suffix < 100) {
    filename = `${safeBase}-${suffix}.${ext}`;
    targetPath = `${dir}/${filename}`;
    suffix++;
  }
  if (suffix >= 100) throw new Error('너무 많은 동명 이미지가 있습니다');

  const putRes = await ghFetch(env, `/repos/${env.GITHUB_REPO}/contents/${encodeContentPath(targetPath)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `decision-image: ${filename}`,
      content: base64Content,
    }),
  });
  if (!putRes.ok) {
    const text = await putRes.text();
    throw new Error(`GitHub image upload ${putRes.status}: ${text.slice(0, 500)}`);
  }
  const bytes = Math.floor((base64Content.length * 3) / 4);
  // 렌더 시 편의를 위해 마크다운 이미지 참조 문자열도 함께 반환.
  // 경로는 GitHub Pages 에서 서빙되는 상대 경로 기준 — /qa/decisions/images/... 접근.
  const markdownRef = `![${safeBase}](/${targetPath})`;
  return { saved: true, path: targetPath, markdownRef, bytes };
}

/* ────────── /gen-image — 🎨 Gemini (Nano Banana) 이미지 생성/편집 ──────────
 *  질문자가 "화면 캡처 + 이렇게 바꿔줘" 요청 시 수정된 mockup 을 즉시 생성해서
 *  본인 의도 시각적 확인 → 기획자 전달 시 설득력 강화. GEMINI_API_KEY 필요.
 *  UI/한글 텍스트 편집 정밀도는 아직 낮은 편이라 참고 mockup 용으로 사용 권장.
 */
interface GenImageRequest {
  prompt: string;
  imageBase64?: string; // 참고 이미지 (data:image/png;base64,... 또는 raw base64)
  imageMimeType?: string; // 명시 안 하면 data URL 에서 추출 or image/png
}
interface GenImageResponse {
  imageBase64: string; // 결과 이미지 raw base64
  mimeType: string;
  textParts?: string[]; // Gemini 가 함께 준 설명 텍스트 (있으면)
}

async function generateImage(env: Env, body: GenImageRequest, signal?: AbortSignal): Promise<GenImageResponse> {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY 미설정 — Google AI Studio (https://aistudio.google.com/app/apikey) 에서 발급 후 `npx wrangler secret put GEMINI_API_KEY` 로 등록 필요');
  }
  if (!body.prompt?.trim()) throw new Error('prompt required');

  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [{ text: body.prompt }];

  if (body.imageBase64) {
    let raw = body.imageBase64;
    let mime = body.imageMimeType || 'image/png';
    const m = raw.match(/^data:([^;]+);base64,(.*)$/);
    if (m) {
      mime = m[1];
      raw = m[2];
    }
    // 5MB 상한 (base64 length 기준 대략)
    if (raw.length > 7_000_000) throw new Error('참고 이미지가 너무 큽니다 (5MB 이하 권장)');
    parts.push({ inline_data: { mime_type: mime, data: raw } });
  }

  const model = env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash-image';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini image API ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; inline_data?: { mime_type?: string; data?: string }; inlineData?: { mimeType?: string; data?: string } }> } }>;
  };
  const cand = data.candidates?.[0];
  if (!cand) throw new Error('Gemini 응답에 candidates 가 없음');
  const respParts = cand.content?.parts || [];
  const imagePart = respParts.find((p) => p.inline_data?.data || p.inlineData?.data);
  if (!imagePart) {
    const textOnly = respParts.filter((p) => p.text).map((p) => p.text).join('\n');
    throw new Error(`Gemini 가 이미지를 반환하지 않음 (텍스트만 응답). 프롬프트를 더 구체적으로 작성해보세요. Gemini 응답: ${textOnly.slice(0, 200)}`);
  }
  const inline = imagePart.inline_data || imagePart.inlineData!;
  const textParts = respParts.filter((p) => p.text).map((p) => p.text!);

  return {
    imageBase64: inline.data!,
    mimeType: (inline as { mime_type?: string; mimeType?: string }).mime_type || (inline as { mimeType?: string }).mimeType || 'image/png',
    textParts: textParts.length ? textParts : undefined,
  };
}

/* ────────── /list-storyboard-images ────────── */

async function listStoryboardImages(env: Env, dir: string, prefix: string): Promise<{ images: Array<{ filename: string; path: string }> }> {
  if (!dir) throw new Error('dir required');
  if (!prefix) throw new Error('prefix required');
  if (!/^projects\/[^/]+\/docs\/storyboards\/[^/]+\/images$/.test(dir)) {
    throw new Error('dir 은 projects/<project>/docs/storyboards/<storyboard>/images 형식이어야 합니다');
  }
  if (/[\/\\]|\.\./.test(prefix)) throw new Error('invalid prefix');

  const entries = await fetchDirListing(env, dir).catch(() => [] as ContentEntry[]);
  const re = new RegExp(`^${escapeRegex(prefix)}.*\\.(png|jpe?g|gif|webp)$`, 'i');
  const images = entries
    .filter((e) => e.type === 'file' && re.test(e.name))
    .map((e) => ({ filename: e.name, path: `${dir}/${e.name}` }))
    .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
  return { images };
}

/* ────────── /delete-storyboard-image ────────── */

async function deleteStoryboardImage(env: Env, body: { targetPath: string }): Promise<{ deleted: boolean; path: string }> {
  if (!body.targetPath) throw new Error('targetPath required');
  const pathOk = /^projects\/[^/]+\/docs\/storyboards\/[^/]+\/images\/[^/]+\.(png|jpe?g|gif|webp)$/i.test(body.targetPath);
  if (!pathOk) throw new Error('invalid targetPath');

  const contentRes = await ghFetch(env, `/repos/${env.GITHUB_REPO}/contents/${encodeContentPath(body.targetPath)}`);
  if (contentRes.status === 404) return { deleted: true, path: body.targetPath };
  if (!contentRes.ok) throw new Error(`fetch image ${body.targetPath}: ${contentRes.status}`);
  const { sha } = (await contentRes.json()) as { sha: string };

  const delRes = await ghFetch(env, `/repos/${env.GITHUB_REPO}/contents/${encodeContentPath(body.targetPath)}`, {
    method: 'DELETE',
    body: JSON.stringify({
      message: `storyboard-image delete: ${body.targetPath.split('/').pop()}`,
      sha,
    }),
  });
  if (!delRes.ok) {
    const text = await delRes.text();
    throw new Error(`GitHub delete image ${delRes.status}: ${text.slice(0, 500)}`);
  }
  return { deleted: true, path: body.targetPath };
}
