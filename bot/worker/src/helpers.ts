/**
 * Pure helper functions extracted from index.ts for reuse + testability.
 * No side effects, no I/O — safe to run in any environment.
 */

/** docPath 에서 project id 추출. 예: `projects/admin_v1/docs/policies/foo.md` → `admin_v1` */
export function extractProjectFromPath(p?: string): string {
  if (!p) return '';
  const m = p.match(/^projects\/([^/]+)\//);
  return m ? m[1] : '';
}

/** 질문에서 검색용 키워드 2-4개 추출 — 단순 heuristic.
 *  한글/영문 명사 2자 이상만 남기고 흔한 불용어 제외. */
export function extractSearchKeywords(question: string, hint: string): string {
  const stopWords = new Set([
    '어떻게', '무엇', '뭐야', '뭔가', '왜', '누구', '언제', '어디', '얼마', '어떤',
    '있어', '없어', '되나요', '되나', '하나요', '하나', '요', '나요', '이야', '이에요',
    'what', 'when', 'where', 'which', 'why', 'how', 'the', 'and', 'for', 'with',
  ]);
  const tokens = question
    .replace(/[?!.,()[\]{}"'`~<>]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !stopWords.has(t.toLowerCase()));
  const uniq = Array.from(new Set(tokens)).slice(0, 4);
  const joined = uniq.join(' ');
  return hint ? `${joined} ${hint}`.trim() : joined;
}

/** "src/**\/*.tsx" 같은 glob 을 GitHub Search 의 path: / extension: qualifier 로 변환. */
export function extPathToQualifier(glob: string): string {
  const ext = glob.match(/\*\.([\w]+)$/)?.[1];
  const dir = glob.match(/^([^*]+)\//)?.[1];
  const parts: string[] = [];
  if (dir) parts.push(`path:${dir}`);
  if (ext) parts.push(`extension:${ext}`);
  return parts.join(' ');
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** 기획자 메모 본문 렌더 —
 *  - `![alt](url)` 마크다운 이미지 → `<img class="planner-memo-img" src="url" alt="alt">`
 *  - 나머지 텍스트는 escapeHtml + 개행 → <br>
 *  - url 은 http(s)/data:image/절대경로 (`/qa/decisions/images/...`) 만 허용 (스크립트 인젝션 차단) */
export function renderNoteBodyHtml(content: string): string {
  const imgRe = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
  let out = '';
  let lastIdx = 0;
  let m: RegExpExecArray | null;
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
