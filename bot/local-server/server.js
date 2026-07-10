/**
 * planner QA bot — 로컬 PC HTTP 서버 (C 모드).
 *
 * Cloudflare Worker (proxy 모드) 가 Cloudflare Tunnel 통해 여기로 forward.
 * /list-docs · /doc 는 로컬 파일시스템 직접 read (GitHub API 호출 없음 — 빠름).
 * /qa 는 `claude` CLI spawn → Max OAuth 한도로 답변.
 * /forward 는 qa/decisions/ 에 md 파일 git commit + push.
 *
 * 의존성 0 (Node 18+ built-in 만 사용).
 *
 * 환경변수 (선택):
 *   PORT=8788
 *   PLANNER_ROOT=c:/Source/기획/heythere_planer  (auto-detect: ../..)
 *   CLAUDE_BIN=claude  (PATH 에 claude 가 있는지 확인)
 */

const http = require('http');
const path = require('path');
const fs = require('fs/promises');
const { spawn } = require('child_process');

const PORT = parseInt(process.env.PORT || '8788', 10);
// __dirname = qa/bot/local-server → planner root 는 3단계 위 (../../..)
const PLANNER_ROOT = process.env.PLANNER_ROOT || path.resolve(__dirname, '..', '..', '..');
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

const PROJECTS_DIR = 'projects';
const QA_DECISIONS_DIR = 'qa/decisions';
const DEFAULT_PROJECT = 'admin_v1';

// 사람이 읽는 라벨 (UI dropdown 노출용). projects/ 디렉토리 검색 시 fallback 으로 id 그대로 사용.
const PROJECT_LABELS = {
  admin_v1: '어드민 v1 (admin_v1)',
  backoffice_v2: '백오피스 v2 (backoffice_v2)',
};

function policiesDir(project) {
  return `${PROJECTS_DIR}/${project}/docs/policies`;
}
function storyboardsDir(project) {
  return `${PROJECTS_DIR}/${project}/docs/storyboards`;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  console.log(`[${new Date().toISOString()}] ${req.method} ${url.pathname}${url.search}`);

  try {
    // API endpoints 화이트리스트
    const isApi = [
      '/health',
      '/list-projects',
      '/list-docs',
      '/doc',
      '/qa',
      '/forward',
      '/feedback',
      '/list-decisions',
      '/list-feedbacks',
      '/update-decision-status',
      '/delete-decision',
      '/delete-feedback',
      '/save-storyboard-image',
      '/list-storyboard-images',
      '/delete-storyboard-image',
      '/save-decision-image'
    ].includes(url.pathname);

    if (!isApi) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, CORS_HEADERS);
        res.end('Method Not Allowed');
        return;
      }

      // Root path -> qa.html
      if (url.pathname === '/' || url.pathname === '/qa.html') {
        await serveFile(path.join(PLANNER_ROOT, 'qa.html'), res);
        return;
      }
      if (url.pathname === '/planner' || url.pathname === '/qa-planner.html') {
        await serveFile(path.join(PLANNER_ROOT, 'qa-planner.html'), res);
        return;
      }

      const relativePath = decodeURIComponent(url.pathname).substring(1);
      const absolutePath = path.normalize(path.join(PLANNER_ROOT, relativePath));

      if (!absolutePath.startsWith(PLANNER_ROOT)) {
        res.writeHead(403, CORS_HEADERS);
        res.end('Forbidden');
        return;
      }

      try {
        const stat = await fs.stat(absolutePath);
        if (stat.isFile()) {
          await serveFile(absolutePath, res);
          return;
        }
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.error('[static serve error]', err);
        }
      }

      res.writeHead(404, CORS_HEADERS);
      res.end('Not Found');
      return;
    }

    // API endpoints 처리
    let result;
    switch (url.pathname) {
      case '/health':
        result = { status: 'ok', service: 'planner-qa-local', plannerRoot: PLANNER_ROOT };
        break;
      case '/list-projects':
        result = await listProjects();
        break;
      case '/list-docs':
        result = await listDocs(url.searchParams.get('project') || DEFAULT_PROJECT);
        break;
      case '/doc':
        result = await getDoc(url.searchParams.get('path') || '');
        break;
      case '/qa':
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
        // NDJSON 스트리밍 — Cloudflare 100s 엣지 타임아웃 회피용.
        // 첫 바이트(메타 JSON 라인) 가 즉시 흘러나가므로 CF 가 524 안 던짐.
        await askClaudeStream(res, await readJson(req));
        return; // 아래 sendJson(res, 200, result) 호출 건너뜀
      case '/forward':
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
        result = await forwardToDecisions(await readJson(req));
        break;
      case '/feedback':
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
        result = await saveFeedback(await readJson(req));
        break;
      case '/list-decisions':
        result = await listDecisions(parseLimit(url.searchParams.get('limit')));
        break;
      case '/list-feedbacks':
        result = await listFeedbacks(parseLimit(url.searchParams.get('limit')));
        break;
      case '/update-decision-status':
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
        result = await updateDecisionStatus(await readJson(req));
        break;
      case '/delete-decision':
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
        result = await deleteArtifact(await readJson(req), 'qa/decisions');
        break;
      case '/delete-feedback':
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
        result = await deleteArtifact(await readJson(req), 'qa/feedback');
        break;
      case '/save-storyboard-image':
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
        result = await saveStoryboardImage(await readJson(req));
        break;
      case '/list-storyboard-images':
        result = await listStoryboardImages(url.searchParams.get('dir'), url.searchParams.get('prefix'));
        break;
      case '/delete-storyboard-image':
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
        result = await deleteStoryboardImage(await readJson(req));
        break;
      case '/save-decision-image':
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
        result = await saveDecisionImage(await readJson(req));
        break;
      default:
        return sendJson(res, 404, { error: 'not found' });
    }
    sendJson(res, 200, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[error]', msg);
    sendJson(res, 500, { error: msg });
  }
});

function sendJson(res, status, body) {
  res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function serveFile(filePath, res) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml; charset=utf-8',
      '.md': 'text/markdown; charset=utf-8',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const content = await fs.readFile(filePath);
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': contentType });
    res.end(content);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false;
    }
    throw err;
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf-8');
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(new Error('Invalid JSON: ' + e.message)); }
    });
    req.on('error', reject);
  });
}

/* ────────── /list-projects ────────── */

async function listProjects() {
  const projectsAbs = path.join(PLANNER_ROOT, PROJECTS_DIR);
  const entries = await fs.readdir(projectsAbs, { withFileTypes: true });
  const projects = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    // 정책문서가 있는 프로젝트만 노출 (실수로 만든 빈 디렉토리 제외)
    const hasDocs = await fs.access(path.join(projectsAbs, e.name, 'docs')).then(() => true).catch(() => false);
    if (!hasDocs) continue;
    projects.push({
      id: e.name,
      label: PROJECT_LABELS[e.name] || e.name,
    });
  }
  return { projects, default: DEFAULT_PROJECT };
}

/* ────────── /list-docs ────────── */

async function listDocs(project) {
  const polDir = policiesDir(project);
  const storyDir = storyboardsDir(project);

  // policies/
  const policiesAbs = path.join(PLANNER_ROOT, polDir);
  const hasPolicies = await fs.access(policiesAbs).then(() => true).catch(() => false);
  let policies = [];
  if (hasPolicies) {
    const policyFiles = (await fs.readdir(policiesAbs))
      .filter((n) => n.endsWith('.md') && !n.startsWith('_'));
    policies = policyFiles.map((name) => ({
      path: posix(polDir, name),
      title: name.replace(/_v\d+\.\d+\.\d+\.md$/, '').replace(/\.md$/, '').replace(/_/g, ' '),
      kind: 'policy',
    }));
  }

  // storyboards/ — 두 레이아웃 모두 지원:
  //   nested: storyboards/<screen>/<screen>_storyboard_v0.1.0.md  (admin_v1)
  //   flat:   storyboards/<screen>_storyboard_v0.1.0.md           (backoffice_v2)
  const storyboardsAbs = path.join(PLANNER_ROOT, storyDir);
  const storyboards = [];
  const hasStory = await fs.access(storyboardsAbs).then(() => true).catch(() => false);
  if (hasStory) {
    const entries = await fs.readdir(storyboardsAbs, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('_') && e.name.toLowerCase() !== 'readme.md') {
        // flat 케이스
        const screen = e.name.replace(/_storyboard_v\d+\.\d+\.\d+\.md$/, '').replace(/\.md$/, '');
        storyboards.push({
          path: posix(storyDir, e.name),
          title: screen.replace(/_/g, ' '),
          kind: 'storyboard',
          screen,
        });
      } else if (e.isDirectory()) {
        // nested 케이스
        const inner = await fs.readdir(path.join(storyboardsAbs, e.name)).catch(() => []);
        const md = inner.find((f) => f.endsWith('.md'));
        if (md) {
          storyboards.push({
            path: posix(storyDir, e.name, md),
            title: e.name.replace(/_/g, ' '),
            kind: 'storyboard',
            screen: e.name,
          });
        }
      }
    }
  }

  const docs = [...policies, ...storyboards].sort((a, b) => a.title.localeCompare(b.title));
  return { project, docs };
}

function posix(...parts) {
  return parts.join('/').replace(/\\/g, '/');
}

/* ────────── /doc ────────── */

async function getDoc(relPath) {
  if (!relPath) throw new Error('path query required');
  // 화이트리스트: 정책·스토리보드 + qa/decisions·qa/feedback (사이드바 "내가 보낸 합의문/개선요청" 클릭용)
  const ok =
    /^projects\/[^/]+\/docs\/(policies|storyboards)\//.test(relPath) ||
    /^qa\/(decisions|feedback)\/[^/]+\.md$/.test(relPath);
  if (!ok) throw new Error('path must be under projects/<project>/docs/ or qa/(decisions|feedback)/');
  const abs = path.join(PLANNER_ROOT, relPath);
  // 경로 탈출 방지
  if (!abs.startsWith(PLANNER_ROOT)) throw new Error('invalid path');
  const content = await fs.readFile(abs, 'utf-8');
  return { path: relPath, content };
}

/* ────────── /qa ────────── */

/**
 * NDJSON 스트리밍 응답:
 *   {"type":"meta","appliedFeedbacks":[...]}\n      ← 즉시 전송 (CF 524 회피의 핵심)
 *   {"type":"text","content":"...일부..."}\n        ← claude CLI 가 stdout 흘리는 만큼 반복
 *   {"type":"text","content":"...일부..."}\n
 *   ...
 *   {"type":"error","message":"..."}\n              ← CLI 가 죽었을 때만
 *   {"type":"done"}\n                               ← 항상 마지막
 *
 * Worker 는 이 body 를 pass-through, qa.html 이 line 단위로 파싱·점진 렌더.
 */
async function askClaudeStream(res, body) {
  // 스트리밍 헤더 — text/event-stream 대신 NDJSON 쓰는 이유: SSE 보다 클라이언트 파싱이 단순
  res.writeHead(200, {
    ...CORS_HEADERS,
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no', // 일부 프록시의 버퍼링 방지
  });

  const writeLine = (obj) => {
    try { res.write(JSON.stringify(obj) + '\n'); } catch (_) { /* 클라이언트 끊김 */ }
  };

  try {
    if (!body.question || !body.question.trim()) {
      writeLine({ type: 'error', message: 'question required' });
      writeLine({ type: 'done' });
      res.end();
      return;
    }

    const claudeRules = await fs.readFile(path.join(PLANNER_ROOT, 'CLAUDE.md'), 'utf-8');
    const focusedDoc = body.docPath
      ? await fs.readFile(path.join(PLANNER_ROOT, body.docPath), 'utf-8').catch(() => '')
      : '';
    const { text: recentFeedback, files: appliedFeedbacks } = await readRecentFeedback();

    const prompt = buildPrompt({
      claudeRules,
      focusedDoc,
      focusedDocPath: body.docPath || '',
      recentFeedback,
      history: body.history || [],
      question: body.question,
    });

    // 메타 라인 즉시 flush — CF 엣지가 첫 바이트 확인하고 100s 카운트 안 시작.
    writeLine({ type: 'meta', appliedFeedbacks, via: 'claude-code-cli (Max)' });

    await streamClaudeCli(prompt, (chunk) => writeLine({ type: 'text', content: chunk }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeLine({ type: 'error', message: msg });
  } finally {
    writeLine({ type: 'done' });
    res.end();
  }
}

function buildPrompt(p) {
  const historyBlock = p.history.length
    ? p.history.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
    : '(없음)';
  // 문서 경로에서 프로젝트 ID 추출 (예: projects/backoffice_v2/docs/... → backoffice_v2)
  const projectMatch = p.focusedDocPath?.match(/^projects\/([^/]+)\//);
  const project = projectMatch ? projectMatch[1] : 'unknown';
  const projectLabel = PROJECT_LABELS[project] || project;

  return `당신은 heythere CRM ${projectLabel} 정책문서를 근거로 협업자(QA·개발자) 질문에 답변하는 봇입니다.

[중요 — 현재 흐름 안내 (CLAUDE.md 일부 항목은 무시)]
- 답변은 **GitHub Pages 챗박스 (qa.html)** 에 표시됩니다. GitHub Issues 댓글이 아닙니다.
- ⚠️ **§A-4 의 "→ OK 면 댓글 \\"OK\\" / ... PR 만들어줘" 형식 footer 는 절대 붙이지 마세요.** Issues 안 씁니다.
- §A-3 (qa-question 라벨 자동 응답), §B (PR 생성), §D (claude.yml workflow), §E-1/E-2 (Issues 댓글로 피드백) 모두 **무관 — 무시**하세요.
- §A-0 답변 형식 5가지 (결론 한 줄 / ≤ 7줄 / 평이한 단어 / 시각적 묘사 / 인용은 줄 끝 1개만) 와 §A-1 (정책 근거), §A-2 (drift 경고), §A-5 (장문 금지) 는 **그대로 적용**.
- 협업자가 답변 아래 **"📝 개선 요청"** 버튼으로 피드백을 보낼 수 있습니다 → qa/feedback/ 폴더에 저장 → 다음 답변부터 자동 반영. 아래 [Recent QA Feedback] 섹션이 그 누적분이니 **우선 적용**하세요.

[답변 구조 — 정책/스토리보드 업데이트가 필요한 경우 의무]
질문이 단순 조회/이해가 아니라 **정책문서·화면설계서를 바꿔야 하는 답변**이면, 본문 끝에 다음 형식의 \`📋 변경 제안\` 블록을 **정확히 그대로** 추가하세요 (마크다운 헤더 \`### 📋 변경 제안\` 으로 시작):

\`\`\`
### 📋 변경 제안
- 📄 대상 파일: \`projects/<project>/docs/policies/<파일명>.md\`
- 📍 위치: §X-Y "<절 제목>"
- ✏️ 변경 전: <현재 본문 한 줄 요약>
- ✅ 변경 후: <새 본문 — 기획자가 그대로 복붙 가능한 완성형>
- 💡 근거: <한 줄>
\`\`\`

규칙:
- 단순 조회·이해 확인 답변엔 이 블록 **붙이지 마세요** (사용자가 명시적으로 "정책 업데이트해줘" 같은 의도를 드러낼 때만).
- 여러 파일에 영향이면 블록 자체를 여러 개 반복.
- \`변경 후\` 는 줄 수가 길어져도 OK — 기획자가 정책 md 에 그대로 붙여 넣어 적용할 수 있는 수준의 완성도여야 합니다.
- 이 블록이 있으면 협업자가 \`📤 기획자에게 전달\` 클릭 시 그대로 qa/decisions 의 "한눈 요약" 으로 들어갑니다.

[현재 협업자가 보고 있는 문서]
프로젝트: ${projectLabel}
경로: ${p.focusedDocPath || '(선택 안 됨)'}

${p.focusedDoc || '(문서 본문 없음)'}

[이전 대화]
${historyBlock}

[Recent QA Feedback — 답변 작성 시 우선 반영할 개선 룰]
${p.recentFeedback || '(없음)'}

[Rules — CLAUDE.md (위 [중요] 의 무시 항목 제외)]
${p.claudeRules}

[현재 질문]
${p.question}

위 질문에 답변하세요. **답변만** 출력하고 메타 코멘트·footer 절대 붙이지 마세요.`;
}

/**
 * qa/feedback/ 의 최근 10개 md 파일을 읽어 시스템 프롬프트용 text 와
 * 답변 응답에 함께 내려보낼 메타 (path/title/date) 를 같이 반환.
 * 메타는 qa.html 의 "📝 N개 피드백 룰 반영됨" 칩에 쓰여 사용자에게 자가학습 적용 가시화.
 */
async function readRecentFeedback() {
  const dir = path.join(PLANNER_ROOT, 'qa/feedback');
  const entries = await fs.readdir(dir).catch(() => []);
  // 실제 피드백 파일만 — 가이드(README) · 템플릿(_) 제외, YYYY-MM-DD prefix 의무.
  const fileNames = entries
    .filter((n) => n.endsWith('.md') && !n.startsWith('_') && n.toLowerCase() !== 'readme.md' && /^\d{4}-\d{2}-\d{2}/.test(n))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 10);
  if (!fileNames.length) return { text: '', files: [] };
  const contents = await Promise.all(
    fileNames.map(async (f) => `\n=== qa/feedback/${f} ===\n` + await fs.readFile(path.join(dir, f), 'utf-8')),
  );
  const files = fileNames.map((f) => parseQaFileName(f, 'qa/feedback'));
  return { text: contents.join('\n'), files };
}

/* ────────── /list-decisions, /list-feedbacks ────────── */

function parseLimit(raw) {
  const n = parseInt(raw || '20', 10);
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(n, 100);
}

// YYYY-MM-DD-<slug>(-NN).md → {path, title, date}
function parseQaFileName(name, dir) {
  const m = name.match(/^(\d{4}-\d{2}-\d{2})-(.+?)(?:-\d{2})?\.md$/);
  return {
    path: `${dir}/${name}`,
    title: m ? m[2].replace(/-/g, ' ') : name.replace(/\.md$/, ''),
    date: m ? m[1] : '',
  };
}

async function listDecisions(limit) {
  const items = await listMdDir('qa/decisions', limit);
  await Promise.all(
    items.map(async (it) => {
      try {
        const md = await fs.readFile(path.join(PLANNER_ROOT, it.path), 'utf-8');
        const { status, statusText } = parseDecisionStatus(md);
        it.status = status;
        it.statusText = statusText;
        const proposal = md.match(/📍\s*위치:\s*([^\n]+)/);
        it.preview = proposal ? proposal[1].trim() : '';
        // 질문자 추출 — "| 질문자 | 홍길동 |" 또는 옛 양식 "| 질문자 | blumn-plan |"
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

// "| 기획자 확인 | 📋 대기 |"        → {status:'pending', statusText:'📋 대기'}
// "| 기획자 확인 | ✅ 2026-06-15 적용 |" → {status:'applied', ...}
// "| 기획자 확인 | 🚫 보류 (사유) |"   → {status:'rejected', ...}
// 옛 양식 "| 기획자 review | ⏳ 대기 |" / "| 기획자 최종 승인 | ⏳ 대기 |" 도 인식.
function parseDecisionStatus(md) {
  const m = md.match(/^\|\s*기획자[^|]*\|\s*([^|]+?)\s*\|\s*$/m);
  if (!m) return { status: 'pending', statusText: '📋 대기' };
  const text = m[1].trim();
  if (/✅/.test(text)) return { status: 'applied', statusText: text };
  if (/🚫/.test(text)) return { status: 'rejected', statusText: text };
  return { status: 'pending', statusText: text };
}
async function listFeedbacks(limit) {
  const items = await listMdDir('qa/feedback', limit);
  await Promise.all(
    items.map(async (it) => {
      try {
        const md = await fs.readFile(path.join(PLANNER_ROOT, it.path), 'utf-8');
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

async function listMdDir(subdir, limit) {
  const abs = path.join(PLANNER_ROOT, subdir);
  const entries = await fs.readdir(abs).catch(() => []);
  return entries
    .filter((n) => n.endsWith('.md') && !n.startsWith('_') && n.toLowerCase() !== 'readme.md')
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit)
    .map((n) => parseQaFileName(n, subdir));
}

/**
 * claude CLI 를 spawn 하고 stdout 청크가 들어올 때마다 onChunk 콜백 호출.
 * 종료 시 resolve. 에러 시 reject.
 * onChunk 가 없으면 청크를 누적해서 마지막에 모은 텍스트 반환 (테스트·호환용).
 */
function streamClaudeCli(prompt, onChunk) {
  return new Promise((resolve, reject) => {
    // VS Code 터미널 등 부모가 Claude Code 세션 안에 있으면 CLAUDECODE env var 가 설정돼
    // nested session 차단. 자식 프로세스 env 에서 명시적으로 제거해야 함.
    const env = { ...process.env, NO_COLOR: '1' };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;
    delete env.CLAUDE_CODE_SESSION_ID;

    const child = spawn(CLAUDE_BIN, ['--print', '--output-format', 'text'], {
      cwd: PLANNER_ROOT,
      env,
      shell: process.platform === 'win32', // Windows .cmd shim 처리
    });
    let buffered = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      const chunk = d.toString();
      buffered += chunk;
      if (onChunk) {
        try { onChunk(chunk); } catch (_) { /* 콜백 에러 무시 */ }
      }
    });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.stdin.on('error', () => { /* ignore broken pipe */ });
    child.on('error', (err) => reject(new Error(`claude CLI spawn 실패: ${err.message}. CLAUDE_BIN=${CLAUDE_BIN} 확인.`)));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`claude CLI exit ${code}: ${(stderr || buffered).slice(0, 500)}`));
      } else {
        resolve(buffered.trim());
      }
    });
    try {
      child.stdin.write(prompt);
      child.stdin.end();
    } catch (_) {
      // 동기 write EPIPE 는 close 핸들러가 reject
    }
  });
}

/* ────────── /forward ────────── */

async function forwardToDecisions(body) {
  if (!body.topic || !body.topic.trim()) throw new Error('제목(topic)이 비어있어요');
  if (!Array.isArray(body.qa) || body.qa.length === 0) {
    throw new Error('전달할 질문-답변(qa)이 없어요. 채팅에서 질문하고 답변을 받은 뒤 다시 시도해주세요');
  }

  const today = new Date().toISOString().slice(0, 10);
  const slug = slugify(body.topic);
  const relPath = `${QA_DECISIONS_DIR}/${today}-${slug}.md`;
  const absPath = path.join(PLANNER_ROOT, relPath);

  const md = renderDecisionMarkdown({
    today,
    docPath: body.docPath,
    topic: body.topic,
    summary: body.summary,
    qa: body.qa,
    user: body.user,
  });

  await fs.writeFile(absPath, md, 'utf-8');

  // git add + (변경 있을 때만) commit + push — 같은 topic 으로 중복 forward 시 빈 commit 으로 exit 1 나는 문제 회피
  await runGit(['add', '--', relPath]);
  const statusOut = await runGit(['status', '--porcelain', '--', relPath]);
  let committed = false;
  if (statusOut.trim()) {
    await runGit(['commit', '-m', `qa-decision: ${body.topic}\n\nplanner QA 챗에서 합의된 내용 자동 기록. 기획자 review 대기.`]);
    await runGit(['push', 'origin', 'main']);
    committed = true;
  }

  // 최신 커밋 URL 추출
  const sha = (await runGit(['rev-parse', 'HEAD'])).trim();
  const htmlUrl = `https://github.com/lunasoft-org/heythere_planer/commit/${sha}`;

  return { decisionPath: relPath, commitSha: sha, htmlUrl, committed, alreadyExisted: !committed };
}

function renderDecisionMarkdown(p) {
  const qaBlock = p.qa
    .map((t, i) => `### Q${i + 1}\n\n${t.question}\n\n#### A${i + 1}\n\n${t.answer}`)
    .join('\n\n---\n\n');

  // 마지막 assistant 답변에서 "📋 변경 제안" 블록 추출 — 있으면 한눈 요약으로 표기.
  const lastAnswer = p.qa.length ? p.qa[p.qa.length - 1].answer : '';
  const proposalMatch = lastAnswer.match(/### 📋 변경 제안[\s\S]*?(?=\n###|\n##|$)/);
  const headlineBlock = proposalMatch
    ? `> ⚡ **한눈 요약 — 기획자 적용 대상**\n>\n${proposalMatch[0].split('\n').map((l) => '> ' + l).join('\n')}\n`
    : `> ⚡ **한눈 요약**\n>\n> ${(p.summary || '(요약 입력 안 됨)').replace(/\n/g, '\n> ')}\n`;

  return `# ${p.topic}

${headlineBlock}

| 항목 | 내용 |
|---|---|
| 일자 | ${p.today} |
| 질문자 | ${p.user || '익명'} |
| 관련 문서 | ${p.docPath ? '`' + p.docPath + '`' : '(미지정)'} |
| 출처 | 협업자 챗 — \`qa.html\` |
| 기획자 확인 | 📋 대기 |

## 협업자가 적은 요청

${p.summary || '_(요약 입력 안 됨)_'}

## 자세히 — 대화 전문

${qaBlock}

## 다음 액션 (기획자)

- [ ] 위 "한눈 요약" 의 \`✅ 변경 후\` 본문을 정책 md §X-Y 에 직접 적용
- [ ] admin_v1 정책이면 patch bump (\`v0.1.A → v0.1.B\`) + 구버전 \`_old/\` 박제 + cross-link 갱신 ([정책_버전관리_규칙](../projects/admin_v1/docs/정책_버전관리_규칙.md) §4)
- [ ] 본 파일 상단 "기획자 확인" 을 \`✅ YYYY-MM-DD 적용\` 또는 \`🚫 보류 (사유)\` 로 변경 후 commit
`;
}

/* ────────── /update-decision-status — 기획자 확인 상태 갱신 ────────── */

const PLANNER_NOTE_START = '<!-- planner-note:start -->';
const PLANNER_NOTE_END = '<!-- planner-note:end -->';

// 합의문 상단(제목 바로 아래) 에 "📝 기획자 적용 메모" 또는 "🚫 기획자 보류 사유"
// 박스형 블록을 멱등하게 신설/갱신/제거. content 가 비어있거나 kind 가 null 이면 블록 제거.
// 기존 블록이 파일 하단에 있던 옛 포맷도 함께 제거해 상단으로 이동시킴.
/** 기획자 메모 본문 렌더 —
 *  - `![alt](url)` 마크다운 이미지 → `<img class="planner-memo-img" src="url" alt="alt">`
 *  - 나머지 텍스트는 escapeHtml + 개행 → <br>
 *  - url 은 http(s)/data:/절대경로 (`/qa/decisions/images/...`) 만 허용 (스크립트 인젝션 차단)
 *  - Worker(src/index.ts) 의 renderNoteBodyHtml 과 동일 로직 유지. */
function renderNoteBodyHtml(content) {
  const imgRe = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
  let out = '';
  let lastIdx = 0;
  let m;
  while ((m = imgRe.exec(content)) !== null) {
    const before = content.slice(lastIdx, m.index);
    out += escapeHtml(before).replace(/\r?\n/g, '<br>');
    const alt = m[1] || 'image';
    const url = m[2].trim();
    if (/^(https?:\/\/|\/qa\/decisions\/images\/|data:image\/)/i.test(url)) {
      out += `<img class="planner-memo-img" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">`;
    } else {
      out += escapeHtml(m[0]);
    }
    lastIdx = m.index + m[0].length;
  }
  out += escapeHtml(content.slice(lastIdx)).replace(/\r?\n/g, '<br>');
  return out;
}

function upsertPlannerNote(md, opts) {
  const kind = opts && opts.kind ? opts.kind : null; // 'applied' | 'rejected' | null
  const content = opts && typeof opts.content === 'string' ? opts.content.trim() : '';
  const plannerName = opts && typeof opts.plannerName === 'string' ? opts.plannerName.trim() : '';

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

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function updateDecisionStatus(body) {
  if (!body.path || !/^qa\/decisions\/[^/]+\.md$/.test(body.path)) {
    throw new Error('valid qa/decisions/ path required');
  }
  const allowed = ['pending', 'applied', 'rejected'];
  if (!allowed.includes(body.status)) throw new Error(`status must be one of ${allowed.join(', ')}`);

  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const reasonRaw = typeof body.reason === 'string' ? body.reason.trim() : '';
  const plannerName = typeof body.plannerName === 'string' ? body.plannerName.trim() : '';

  let newText;
  if (body.status === 'applied') {
    const date = body.date || new Date().toISOString().slice(0, 10);
    newText = note ? `✅ ${date} 적용 (메모 있음)` : `✅ ${date} 적용`;
  } else if (body.status === 'rejected') {
    const reason = reasonRaw || '사유 미입력';
    newText = `🚫 보류 (${reason})`;
  } else {
    newText = '📋 대기';
  }

  const absPath = path.join(PLANNER_ROOT, body.path);
  const md = await fs.readFile(absPath, 'utf-8');
  // 양식 다양성 대응 — "기획자 확인" / "기획자 review" / "기획자 최종 승인" 등 옛 파일도 포함.
  // 행 첫 cell 이 "기획자" 로 시작하는 표 행 1줄을 매칭.
  const re = /^(\|\s*기획자[^|]*\|\s*)([^|]+?)(\s*\|\s*)$/m;
  const existing = md.match(re);
  if (!existing) throw new Error('"기획자 ..." 표 행을 찾지 못했습니다 (decision md 첫 표 양식 확인)');

  let replaced = md.replace(re, `$1${newText}$3`);
  // 상단 메모 박스 갱신 — applied+note · rejected+reason 일 때만 삽입, pending 이면 제거.
  // 이미지는 메모 텍스트 안에 `![](data:image/...)` 형태로 인라인 포함 (renderNoteBodyHtml 이 <img> 로 렌더).
  if (body.status === 'applied') {
    replaced = upsertPlannerNote(replaced, { kind: 'applied', content: note, plannerName });
  } else if (body.status === 'rejected') {
    replaced = upsertPlannerNote(replaced, { kind: 'rejected', content: reasonRaw, plannerName });
  } else {
    replaced = upsertPlannerNote(replaced, { kind: null, content: '', plannerName });
  }
  const fileChanged = replaced !== md;
  if (fileChanged) await fs.writeFile(absPath, replaced, 'utf-8');

  // 멱등성 — 파일 내용이 같아도 working tree 가 더러우면(이전 시도 실패) 커밋 시도.
  // 실패 시도 후 사용자가 다시 눌렀을 때 자연스럽게 마무리되도록.
  let committed = false;
  try {
    await runGit(['add', body.path]);
    const statusOut = await runGit(['status', '--porcelain', body.path]);
    if (statusOut.trim()) {
      // 커밋 메시지 — 특수문자 없는 간단한 형식 (shell 호환성 + 깔끔)
      await runGit(['commit', '-m', `qa-decision status=${body.status}: ${path.basename(body.path)}`]);
      await runGit(['push', 'origin', 'main']);
      committed = true;
    }
  } catch (err) {
    throw new Error(`파일은 갱신됐는데 git push 가 실패했어요: ${err.message}`);
  }

  return { path: body.path, status: body.status, statusText: newText, committed };
}

/* ────────── /save-decision-image — 기획자 메모용 이미지 업로드 ──────────
   apply modal 에서 첨부한 이미지를 `qa/decisions/images/<decision-slug>/<filename>` 에 저장.
   Worker(src/index.ts) 의 saveDecisionImage 과 동일한 규약. 파일 저장 + git commit + push.
   응답으로 markdownRef (`![name](/qa/decisions/images/...)`) 를 함께 반환해 클라이언트가 메모에 그대로 붙일 수 있음.
   메모 렌더 시 renderNoteBodyHtml 이 이 마크다운을 <img class="planner-memo-img"> 로 안전하게 렌더. */

async function saveDecisionImage(body) {
  if (!body.decisionPath) throw new Error('decisionPath required');
  if (!body.dataUrl) throw new Error('dataUrl required');
  const decisionMatch = String(body.decisionPath).match(/^qa\/decisions\/(\d{4}-\d{2}-\d{2}-[^./]+)\.md$/);
  if (!decisionMatch) {
    throw new Error('decisionPath 는 qa/decisions/YYYY-MM-DD-slug.md 형식이어야 합니다');
  }
  const decisionSlug = decisionMatch[1];

  const match = String(body.dataUrl).match(/^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/i);
  if (!match) throw new Error('dataUrl 은 data:image/<png|jpg|jpeg|gif|webp>;base64,... 형식이어야 합니다');
  const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const base64Content = match[2].replace(/\s/g, '');
  const buffer = Buffer.from(base64Content, 'base64');

  const rawName = (body.filename || `image-${Date.now()}.${ext}`).replace(/[\/\\]/g, '');
  const safeBase = (rawName.replace(/\.[^.]+$/, '').replace(/[^\w.-]/g, '_').slice(0, 60)) || `image-${Date.now()}`;

  const dir = `qa/decisions/images/${decisionSlug}`;
  const absDir = path.normalize(path.join(PLANNER_ROOT, dir));
  if (!absDir.startsWith(PLANNER_ROOT)) throw new Error('invalid path');
  await fs.mkdir(absDir, { recursive: true });

  // 충돌 회피 — 같은 이름 이미 있으면 -1, -2, … 붙임
  let filename = `${safeBase}.${ext}`;
  let absPath = path.join(absDir, filename);
  let suffix = 1;
  while (suffix < 100) {
    try { await fs.access(absPath); }
    catch (_) { break; } // ENOENT → 사용 가능
    filename = `${safeBase}-${suffix}.${ext}`;
    absPath = path.join(absDir, filename);
    suffix++;
  }
  if (suffix >= 100) throw new Error('너무 많은 동명 이미지가 있습니다');
  const targetPath = `${dir}/${filename}`;

  await fs.writeFile(absPath, buffer);

  // git add + commit + push (실패해도 파일은 남음 — 다음 상태 갱신 때 함께 커밋됨)
  try {
    await runGit(['add', targetPath]);
    const statusOut = await runGit(['status', '--porcelain', targetPath]);
    if (statusOut.trim()) {
      await runGit(['commit', '-m', `decision-image: ${filename}`]);
      await runGit(['push', 'origin', 'main']);
    }
  } catch (err) {
    console.warn('[save-decision-image] git push 실패 (파일은 저장됨):', err.message);
  }

  const markdownRef = `![${safeBase}](/${targetPath})`;
  return { saved: true, path: targetPath, markdownRef, bytes: buffer.length };
}

/* ────────── /save-storyboard-image — storyboard paste-zone 이미지 저장 ──────────
   사용자가 storyboard html 의 paste-zone 에 Ctrl+V 후 [💾 저장] 클릭 시 호출.
   `projects/<project>/docs/storyboards/<storyboard>/images/<filename>.(png|jpg|...)` 형식만 허용. */

async function saveStoryboardImage(body) {
  if (!body.targetPath) throw new Error('targetPath required');
  if (!body.dataUrl) throw new Error('dataUrl required');

  // 허용 경로: projects/<p>/docs/storyboards/<sb>/images/<file>.(png|jpg|jpeg|gif|webp)
  const pathOk = /^projects\/[^/]+\/docs\/storyboards\/[^/]+\/images\/[^/]+\.(png|jpe?g|gif|webp)$/i.test(body.targetPath);
  if (!pathOk) {
    throw new Error('targetPath 는 projects/<project>/docs/storyboards/<storyboard>/images/<filename>.(png|jpg|jpeg|gif|webp) 형식이어야 합니다');
  }

  const absPath = path.normalize(path.join(PLANNER_ROOT, body.targetPath));
  if (!absPath.startsWith(PLANNER_ROOT)) throw new Error('invalid path');

  // dataUrl base64 디코드
  const match = String(body.dataUrl).match(/^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/i);
  if (!match) throw new Error('dataUrl 은 data:image/<png|jpg|jpeg|gif|webp>;base64,... 형식이어야 합니다');
  const buffer = Buffer.from(match[2], 'base64');

  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, buffer);

  return { saved: true, path: body.targetPath, bytes: buffer.length };
}

/* ────────── /list-storyboard-images — paste-zone 자동 로드용 ────────── */
async function listStoryboardImages(dir, prefix) {
  if (!dir) throw new Error('dir required');
  if (!prefix) throw new Error('prefix required');
  // dir 형식 검증: projects/<p>/docs/storyboards/<sb>/images
  if (!/^projects\/[^/]+\/docs\/storyboards\/[^/]+\/images$/.test(dir)) {
    throw new Error('dir 은 projects/<project>/docs/storyboards/<storyboard>/images 형식이어야 합니다');
  }
  // prefix 안전성: 디렉토리 구분자 / 상대 경로 차단
  if (/[\/\\]|\.\./.test(prefix)) throw new Error('invalid prefix');

  const absDir = path.normalize(path.join(PLANNER_ROOT, dir));
  if (!absDir.startsWith(PLANNER_ROOT)) throw new Error('invalid path');

  let entries;
  try { entries = await fs.readdir(absDir); }
  catch (err) { if (err.code === 'ENOENT') return { images: [] }; throw err; }

  // prefix 로 시작하는 png/jpg/jpeg/gif/webp 만
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*\\.(png|jpe?g|gif|webp)$`, 'i');
  const images = entries
    .filter((name) => re.test(name))
    .map((name) => ({ filename: name, path: `${dir}/${name}` }))
    .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));

  return { images };
}

/* ────────── /delete-storyboard-image — paste-card 삭제 시 ────────── */
async function deleteStoryboardImage(body) {
  if (!body.targetPath) throw new Error('targetPath required');
  const pathOk = /^projects\/[^/]+\/docs\/storyboards\/[^/]+\/images\/[^/]+\.(png|jpe?g|gif|webp)$/i.test(body.targetPath);
  if (!pathOk) throw new Error('invalid targetPath');

  const absPath = path.normalize(path.join(PLANNER_ROOT, body.targetPath));
  if (!absPath.startsWith(PLANNER_ROOT)) throw new Error('invalid path');

  try { await fs.unlink(absPath); }
  catch (err) { if (err.code !== 'ENOENT') throw err; }
  return { deleted: true, path: body.targetPath };
}

/* ────────── /delete-decision · /delete-feedback — 테스트 데이터 cascade 삭제 ────────── */

async function deleteArtifact(body, dir) {
  const re = new RegExp(`^${dir}/[^/]+\\.md$`);
  if (!body.path || !re.test(body.path)) {
    throw new Error(`valid ${dir}/ path required`);
  }
  const absPath = path.join(PLANNER_ROOT, body.path);
  if (!absPath.startsWith(PLANNER_ROOT)) throw new Error('invalid path');

  // 파일이 이미 없을 수도 있다 (재시도). 멱등 처리.
  let fileExisted = true;
  try {
    await fs.unlink(absPath);
  } catch (err) {
    if (err.code === 'ENOENT') fileExisted = false;
    else throw err;
  }

  let committed = false;
  // HEAD 에 등록된 적 있는 tracked 파일인지 먼저 확인. untracked 였으면 로컬 삭제로 종료.
  let isTracked = true;
  try {
    await runGit(['ls-files', '--error-unmatch', '--', body.path]);
  } catch {
    isTracked = false;
  }

  if (isTracked) {
    try {
      await runGit(['add', '-A', '--', body.path]);
      const statusOut = await runGit(['status', '--porcelain', '--', body.path]);
      if (statusOut.trim()) {
        await runGit(['commit', '-m', `${dir} delete: ${path.basename(body.path)}`]);
        await runGit(['push', 'origin', 'main']);
        committed = true;
      }
    } catch (err) {
      throw new Error(`파일은 지웠는데 git push 가 실패했어요: ${err.message}`);
    }
  }

  return { path: body.path, deleted: true, fileExisted, committed };
}

/* ────────── /feedback — qa/feedback/ 답변 개선 룰 자동 저장 ────────── */

async function saveFeedback(body) {
  if (!body.improvement?.trim()) throw new Error('improvement required');
  if (!body.question?.trim()) throw new Error('question required');
  if (!body.answer?.trim()) throw new Error('answer required');

  const today = new Date().toISOString().slice(0, 10);
  // slug 우선순위: 사용자가 입력한 title → improvement 첫 30자 → question 첫 30자
  let slug = slugify(body.title || body.improvement.slice(0, 30) || body.question.slice(0, 30));
  // 같은 날 같은 slug 충돌 시 -01, -02 suffix
  const feedbackDir = path.join(PLANNER_ROOT, 'qa/feedback');
  let relPath = `qa/feedback/${today}-${slug}.md`;
  let absPath = path.join(PLANNER_ROOT, relPath);
  let suffix = 1;
  while (await fs.access(absPath).then(() => true).catch(() => false)) {
    relPath = `qa/feedback/${today}-${slug}-${String(suffix).padStart(2, '0')}.md`;
    absPath = path.join(PLANNER_ROOT, relPath);
    suffix++;
    if (suffix > 99) throw new Error('too many feedback files today with same slug');
  }

  const md = renderFeedbackMarkdown({
    today,
    docPath: body.docPath,
    title: body.title || slug,
    question: body.question,
    answer: body.answer,
    improvement: body.improvement,
    user: body.user,
  });

  await fs.mkdir(feedbackDir, { recursive: true });
  await fs.writeFile(absPath, md, 'utf-8');

  await runGit(['add', relPath]);
  await runGit([
    'commit',
    '-m',
    `feedback(qa): ${slug.slice(0, 40)}\n\n협업자 챗에서 답변 개선 요청. 다음 응답부터 qa/feedback/ 로드되어 자동 반영.`,
  ]);
  await runGit(['push', 'origin', 'main']);

  const sha = (await runGit(['rev-parse', 'HEAD'])).trim();
  return {
    feedbackPath: relPath,
    commitSha: sha,
    htmlUrl: `https://github.com/lunasoft-org/heythere_planer/commit/${sha}`,
  };
}

function renderFeedbackMarkdown(p) {
  return `# ${p.title}

| 항목 | 내용 |
|---|---|
| 일자 | ${p.today} |
| 질문자 | ${p.user || '익명'} |
| 관련 문서 | ${p.docPath ? '`' + p.docPath + '`' : '(미지정)'} |
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

function slugify(s) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s\\/]+/g, '-')
    .replace(/[^a-z0-9가-힣\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'qa';
}

function runGit(args) {
  return new Promise((resolve, reject) => {
    // shell:false — git 은 .exe 직접 호출 가능. shell:true 면 commit 메시지에 →, (,)
    // 같은 cmd 메타문자가 들어갈 때 인자 분리 오류 발생 (Node DEP0190 deprecation warning).
    const child = spawn('git', args, { cwd: PLANNER_ROOT, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`git ${args[0]} exit ${code}: ${stderr.slice(0, 300)}`));
      else resolve(stdout);
    });
  });
}

/* ────────── start ────────── */

// 한 요청에서 unhandled exception/rejection 이 발생해도 서버 죽이지 않음.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[planner-qa-local] listening on http://localhost:${PORT}`);
  console.log(`  PLANNER_ROOT: ${PLANNER_ROOT}`);
  console.log(`  CLAUDE_BIN:   ${CLAUDE_BIN}`);
  console.log(`  CLAUDECODE env: ${process.env.CLAUDECODE ? '있음 (자식 spawn 시 제거됨)' : '없음'}`);
});
