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

const POLICIES_DIR = 'projects/admin_v1/docs/policies';
const STORYBOARDS_DIR = 'projects/admin_v1/docs/storyboards';

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
          result = await listDocs(env);
          break;
        case '/doc':
          result = await getDoc(env, url.searchParams.get('path') ?? '');
          break;
        case '/qa':
          if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405, corsHeaders);
          result = await askClaude(env, await req.json());
          break;
        case '/forward':
          if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405, corsHeaders);
          result = await forwardToDecisions(env, await req.json());
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

async function listDocs(env: Env): Promise<{ docs: DocEntry[] }> {
  const policyEntries = await fetchDirListing(env, POLICIES_DIR);
  const policies: DocEntry[] = policyEntries
    .filter((e) => e.type === 'file' && e.name.endsWith('.md') && !e.name.startsWith('_'))
    .map((e) => ({
      path: e.path,
      title: e.name.replace(/_v\d+\.\d+\.\d+\.md$/, '').replace(/\.md$/, '').replace(/_/g, ' '),
      kind: 'policy' as const,
    }));

  // storyboards 는 화면별 폴더 안에 `{화면명}_storyboard_v0.1.0.md`
  const storyboardDirs = await fetchDirListing(env, STORYBOARDS_DIR);
  const storyboards: DocEntry[] = [];
  for (const dir of storyboardDirs) {
    if (dir.type !== 'dir') continue;
    const inner = await fetchDirListing(env, dir.path).catch(() => []);
    const mdFile = inner.find((f) => f.type === 'file' && f.name.endsWith('.md'));
    if (mdFile) {
      storyboards.push({
        path: mdFile.path,
        title: dir.name.replace(/_/g, ' '),
        kind: 'storyboard' as const,
        screen: dir.name,
      });
    }
  }

  return { docs: [...policies, ...storyboards].sort((a, b) => a.title.localeCompare(b.title)) };
}

/* ────────── 2. /doc?path= ────────── */

async function getDoc(env: Env, path: string): Promise<{ path: string; content: string }> {
  if (!path) throw new Error('path query required');
  // 안전: 우리 정한 디렉토리 안에서만 허용
  if (!path.startsWith(POLICIES_DIR) && !path.startsWith(STORYBOARDS_DIR)) {
    throw new Error('path must be under policies or storyboards');
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

async function askClaude(env: Env, body: QARequest): Promise<QAResponse> {
  if (!body.question?.trim()) throw new Error('question required');

  const model = env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';

  // 컨텍스트: CLAUDE.md + 선택된 doc (이미지 URL 절대 경로 변환) + 최근 qa/feedback
  const claudeRules = await fetchTextFile(env, 'CLAUDE.md');
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

  // 사용자 메시지 — 첨부 이미지 있으면 vision content blocks, 없으면 plain string
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

  const res = await fetch('https://api.anthropic.com/v1/messages', {
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
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as { content: { type: string; text: string }[] };
  const answer = data.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  return { answer: answer || '(답변이 비어 있어요. 다시 질문해 주세요.)', modelUsed: model };
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
  const res = await ghFetch(env, `/repos/${env.GITHUB_REPO}/contents/${encodeContentPath(path)}`, {
    headers: { Accept: 'application/vnd.github.raw' },
  });
  if (!res.ok) throw new Error(`fetch file ${path}: ${res.status}`);
  return await res.text();
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
