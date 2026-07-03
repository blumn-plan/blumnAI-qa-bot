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

export interface Env {
  ANTHROPIC_API_KEY: string;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  ALLOWED_ORIGINS: string;
  CLAUDE_MODEL?: string;
  /** C 모드 (Max 활용): 설정되어 있으면 모든 요청을 로컬 PC tunnel URL 로 proxy.
   *  미설정 시 기존 A 모드 (Anthropic API 직접 호출). 모드 전환은 `wrangler secret put/delete TUNNEL_URL`. */
  TUNNEL_URL?: string;
}

/**
 * 프로젝트별 정책·스토리보드 경로.
 * 각 서비스 팀이 자기 프로젝트 ID (예: `admin_v1`, `ad_v1`, `backoffice_v2`) 를
 * `/list-docs?project=<id>` 로 넘기면 그에 맞는 경로로 fetch.
 */
function policiesDir(project: string): string {
  return `projects/${project}/docs/policies`;
}
function storyboardsDir(project: string): string {
  return `projects/${project}/docs/storyboards`;
}
const DEFAULT_PROJECT_FALLBACK = 'admin_v1';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') ?? '';
    const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
    const allowOrigin = allowed.includes(origin) ? origin : allowed[0] ?? '*';
    const corsHeaders: HeadersInit = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // C 모드: TUNNEL_URL 설정되어 있으면 모든 요청을 로컬 서버로 proxy.
    // /health 같은 자체 진단 엔드포인트는 예외로 두어 운영 가시성 유지.
    if (env.TUNNEL_URL && url.pathname !== '/health') {
      return proxyToTunnel(req, env, url, corsHeaders);
    }

    try {
      let result: unknown;
      switch (url.pathname) {
        case '/':
        case '/health':
          result = { status: 'ok', service: 'planner-qa-bot', mode: env.TUNNEL_URL ? 'proxy' : 'direct' };
          break;
        case '/list-docs':
          result = await listDocs(env, url.searchParams.get('project') || DEFAULT_PROJECT_FALLBACK);
          break;
        case '/doc':
          result = await getDoc(env, url.searchParams.get('path') ?? '');
          break;
        case '/qa':
          if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405, corsHeaders);
          return await askClaude(env, await req.json(), corsHeaders);
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
  const polDir = policiesDir(project);
  const storyDir = storyboardsDir(project);

  const policyEntries = await fetchDirListing(env, polDir).catch(() => [] as ContentEntry[]);
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
  const storyboardEntries = await fetchDirListing(env, storyDir).catch(() => [] as ContentEntry[]);
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
      const inner = await fetchDirListing(env, e.path).catch(() => [] as ContentEntry[]);
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
  const allowed =
    path.startsWith('projects/') ||
    path.startsWith('qa/decisions/') ||
    path.startsWith('qa/feedback/') ||
    path === 'CLAUDE.md';
  if (!allowed) {
    throw new Error('path must be under projects/, qa/decisions/, qa/feedback/, or CLAUDE.md');
  }
  const content = await fetchTextFile(env, path);
  return { path, content };
}

/* ────────── 3. /qa ────────── */

interface QARequest {
  docPath?: string;
  question: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  // 사용자가 질문에 첨부한 이미지 (base64). 정책 vs 화면 drift 비교 같은 시각 비교용.
  attachments?: { mediaType: string; data: string }[];
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

async function askClaude(env: Env, body: QARequest, corsHeaders: HeadersInit): Promise<Response> {
  const ndjsonHeaders: HeadersInit = {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache',
    ...corsHeaders,
  };

  if (!body.question?.trim()) {
    return errorNdjson('question required', ndjsonHeaders);
  }

  const model = env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';

  // 컨텍스트: CLAUDE.md + 선택된 doc + 최근 qa/feedback
  const claudeRules = await fetchTextFile(env, 'CLAUDE.md').catch((err) => {
    console.warn('[qa-bot] CLAUDE.md fetch failed:', err instanceof Error ? err.message : String(err));
    return '';
  });
  const rawFocusedDoc = body.docPath ? await fetchTextFile(env, body.docPath).catch(() => '') : '';
  const focusedDoc = body.docPath ? transformImageUrls(body.docPath, rawFocusedDoc) : rawFocusedDoc;
  const recentFeedback = await fetchRecentFeedback(env);

  const systemPrompt = buildSystemPrompt({
    claudeRules,
    focusedDoc,
    focusedDocPath: body.docPath ?? '',
    recentFeedback,
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
      system: systemPrompt,
      messages,
      stream: true,
    }),
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
      controller.enqueue(encoder.encode(JSON.stringify({ type: 'meta', appliedFeedbacks: [], via: 'anthropic-api' }) + '\n'));
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
  focusedDoc: string;
  focusedDocPath: string;
  recentFeedback: string;
  hasAttachments: boolean;
}

function buildSystemPrompt(p: SystemPromptParts): string {
  return [
    '당신은 heythere CRM 어드민 (admin_v1) 정책문서를 근거로 협업자(QA·개발자) 질문에 답변하는 봇입니다.',
    '아래 [Rules] 의 §A "답변할 때" 규칙을 **반드시** 지키세요 — §A-0 답변 형식 5가지 (결론 한 줄 / ≤ 7줄 / 평이한 단어 / 시각적 묘사 / 인용은 줄 끝 1개만) 와 §A-4 답변 끝 형식 1줄.',
    '답변은 GitHub Pages 챗 박스에 그대로 표시됩니다. 마크다운 OK.',
    '',
    '[답변에 표·이미지 사용 가이드]',
    '- **표**: 정책 vs 화면 비교, 케이스별 동작 차이, 캠페인 유형 카탈로그 같이 항목이 여러 줄로 나뉘는 정보는 마크다운 표 (`| col1 | col2 |`) 로 작성. 단, ≤ 7줄 규칙은 표 행 수 포함이 아닌 본문 줄 수 기준 — 표가 길어도 본문은 짧게.',
    '- **이미지**: 본 문서(아래 [현재 협업자가 보고 있는 문서]) 안에 등장한 `![alt](URL)` 이미지 URL 을 답변에 그대로 인용 가능. 화면 캡처가 답변의 결론을 시각적으로 보강하면 적극 활용 (예: "이렇게 노출됩니다" + 캡처 이미지). 단, 같은 이미지를 매 답변에 반복 첨부하지는 말 것 — 처음 한 번만, 또는 비교가 의미 있을 때만.',
    '- 본 문서에 없는 외부 이미지 URL 은 임의 생성 금지 (깨진 링크 됨).',
    ...(p.hasAttachments
      ? ['- **사용자가 이미지를 첨부했습니다** — 첨부 이미지 내용을 직접 시각 분석해서 답변에 반영. 정책 본문과 첨부 화면이 다르면 §A-2 의 drift 경고 형식으로 명시 (`정책상 X 이지만 첨부 화면은 Y. 정책 또는 화면 보완 필요.`).']
      : []),
    '',
    '[현재 협업자가 보고 있는 문서]',
    p.focusedDocPath ? `경로: ${p.focusedDocPath}` : '(선택된 문서 없음)',
    '',
    p.focusedDoc || '(문서 내용 없음 — 일반 질문)',
    '',
    '[Rules — CLAUDE.md]',
    p.claudeRules,
    '',
    '[Recent QA Feedback]',
    p.recentFeedback || '(없음)',
  ].join('\n');
}

async function fetchRecentFeedback(env: Env): Promise<string> {
  const entries = await fetchDirListing(env, 'qa/feedback').catch(() => []);
  const mdFiles = entries
    .filter((e) => e.type === 'file' && e.name.endsWith('.md') && !e.name.startsWith('_'))
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, 10);
  if (mdFiles.length === 0) return '';
  const contents = await Promise.all(
    mdFiles.map(async (f) => `\n=== ${f.path} ===\n${await fetchTextFile(env, f.path)}`),
  );
  return contents.join('\n');
}

/* ────────── 4. /forward — qa/decisions/ 자동 생성 ────────── */

interface ForwardRequest {
  docPath?: string;
  topic: string; // 짧은 제목 (파일명에 들어감)
  summary: string; // 합의 요약
  qa: { question: string; answer: string }[];
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
  return { decisionPath, commitSha: data.content.sha, htmlUrl: data.content.html_url };
}

function renderDecisionMarkdown(p: {
  today: string;
  docPath?: string;
  topic: string;
  summary: string;
  qa: { question: string; answer: string }[];
}): string {
  const qaBlock = p.qa
    .map((t, i) => `### Q${i + 1}\n\n${t.question}\n\n#### A${i + 1}\n\n${t.answer}`)
    .join('\n\n---\n\n');

  return `# ${p.topic}

| 항목 | 내용 |
|---|---|
| 일자 | ${p.today} |
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

const PROJECT_LABELS: Record<string, string> = {
  admin_v1: '어드민 v1 (admin_v1)',
  backoffice_v2: '백오피스 v2 (backoffice_v2)',
};
const DEFAULT_PROJECT = 'admin_v1';

async function listProjects(env: Env): Promise<{ projects: Array<{ id: string; label: string }>; default: string }> {
  const entries = await fetchDirListing(env, 'projects').catch(() => [] as ContentEntry[]);
  const projects: Array<{ id: string; label: string }> = [];
  for (const e of entries) {
    if (e.type !== 'dir') continue;
    const hasDocs = await fetchDirListing(env, `${e.path}/docs`).then(() => true).catch(() => false);
    if (!hasDocs) continue;
    projects.push({ id: e.name, label: PROJECT_LABELS[e.name] || e.name });
  }
  return { projects, default: DEFAULT_PROJECT };
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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function upsertPlannerNote(md: string, note: string): string {
  const reBlock = new RegExp(
    `\\n*${escapeRegex(PLANNER_NOTE_START)}[\\s\\S]*?${escapeRegex(PLANNER_NOTE_END)}\\n*$`,
  );
  const withoutBlock = md.replace(reBlock, '').replace(/\s+$/, '');
  if (!note) return withoutBlock + '\n';
  const date = new Date().toISOString().slice(0, 10);
  const block =
    `\n\n${PLANNER_NOTE_START}\n` +
    `### 📝 기획자 적용 메모\n\n` +
    `> ${date} · 협업자가 요청한 내용과 실제 적용된 내용에 차이가 있습니다.\n\n` +
    `${note}\n` +
    `${PLANNER_NOTE_END}\n`;
  return withoutBlock + block;
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
}

async function updateDecisionStatus(env: Env, body: UpdateDecisionStatusBody): Promise<{ path: string; status: string; statusText: string; committed: boolean }> {
  if (!body.path || !/^qa\/decisions\/[^/]+\.md$/.test(body.path)) {
    throw new Error('valid qa/decisions/ path required');
  }
  const allowed = ['pending', 'applied', 'rejected'];
  if (!allowed.includes(body.status)) throw new Error(`status must be one of ${allowed.join(', ')}`);

  const note = typeof body.note === 'string' ? body.note.trim() : '';

  let newText: string;
  if (body.status === 'applied') {
    const date = body.date || new Date().toISOString().slice(0, 10);
    newText = note ? `✅ ${date} 적용 (메모 있음)` : `✅ ${date} 적용`;
  } else if (body.status === 'rejected') {
    const reason = (body.reason || '').trim() || '사유 미입력';
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
    replaced = upsertPlannerNote(replaced, note);
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
