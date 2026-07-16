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

/** 한글 UI 용어 → 코드 심볼 매핑 (mini 사전).
 *  한글 질문에도 GitHub Search Code API 가 매치할 수 있도록 자동 변환.
 *  코드는 대부분 영문 심볼로 짜여있어 한글 리터럴로는 매치 실패. */
const KOREAN_UI_TERM_MAP: Record<string, string[]> = {
  // 화면·컨테이너
  '대시보드': ['Dashboard', 'dashboard'],
  '캠페인': ['Campaign', 'campaign'],
  '메시지': ['Message', 'message'],
  '통계': ['Stats', 'Analytics', 'statistics'],
  '설정': ['Setting', 'Config', 'settings'],
  '사용자': ['User', 'user'],
  '고객': ['Customer', 'customer'],
  '주문': ['Order', 'order'],
  '결제': ['Payment', 'payment'],
  '포인트': ['Point', 'point'],
  '상품': ['Product', 'product'],
  '리스트': ['List', 'list'],
  '상세': ['Detail', 'detail'],
  // UI 컴포넌트
  '버튼': ['Button', 'button'],
  '필터': ['Filter', 'filter'],
  '모달': ['Modal', 'modal', 'Dialog'],
  '토글': ['Toggle', 'toggle', 'Switch'],
  '탭': ['Tab', 'Tabs'],
  '테이블': ['Table', 'table'],
  '카드': ['Card', 'card'],
  '배너': ['Banner', 'banner'],
  '알림': ['Notification', 'Alert', 'Toast'],
  '드롭다운': ['Dropdown', 'Select'],
  '체크박스': ['Checkbox', 'checkbox'],
  '라디오': ['Radio', 'radio'],
  '검색창': ['SearchBar', 'SearchInput'],
  '입력': ['Input', 'input', 'TextField'],
  '텍스트박스': ['TextField', 'TextInput'],
  // 액션
  '초기화': ['reset', 'Reset', 'clear'],
  '삭제': ['delete', 'Delete', 'remove'],
  '수정': ['edit', 'Edit', 'update'],
  '저장': ['save', 'Save', 'submit'],
  '등록': ['register', 'Register', 'create'],
  '조회': ['search', 'Search', 'fetch'],
  '취소': ['cancel', 'Cancel'],
  '확인': ['confirm', 'Confirm'],
  '로그인': ['login', 'Login', 'signIn'],
  '로그아웃': ['logout', 'Logout'],
  '발송': ['send', 'Send', 'dispatch'],
  '전송': ['send', 'Send'],
  '복사': ['copy', 'Copy', 'clone'],
  '내보내기': ['export', 'Export'],
  '가져오기': ['import', 'Import'],
};

/** 한글 UI 용어를 영문 코드 심볼로 확장.
 *  질문에 '대시보드 필터 초기화' 있으면 'Dashboard Filter reset' 도 함께 검색. */
export function expandKoreanUiTerms(text: string): string[] {
  const found: string[] = [];
  for (const [ko, en] of Object.entries(KOREAN_UI_TERM_MAP)) {
    if (text.includes(ko)) {
      found.push(...en);
    }
  }
  return Array.from(new Set(found));
}

/** 정책 md 문서 안 인라인 영문 코드 심볼 추출.
 *  ①`\`identifier\`` (백틱), ② PascalCase (Dashboard, DashboardFilter),
 *  ③ camelCase 2+단어 (useFilter, getUserId), ④ CONSTANT_CASE (MODAL_TYPE).
 *  파일명·확장자·mock 데이터 제외. */
export function extractCodeSymbols(text: string): string[] {
  if (!text) return [];
  const symbols = new Set<string>();

  // ① 백틱 인용 — `Dashboard`, `useFilter` 등. 최우선 근거.
  const backtickRe = /`([A-Za-z_][A-Za-z0-9_]{2,50})`/g;
  let m: RegExpExecArray | null;
  while ((m = backtickRe.exec(text)) !== null) symbols.add(m[1]);

  // ② PascalCase — 컴포넌트·타입 후보
  const pascalRe = /\b[A-Z][a-z]+(?:[A-Z][a-zA-Z0-9]+){0,3}\b/g;
  while ((m = pascalRe.exec(text)) !== null) {
    if (m[0].length >= 4) symbols.add(m[0]);
  }

  // ③ camelCase 2+단어 — 함수·훅 후보
  const camelRe = /\b[a-z]+[A-Z][a-zA-Z0-9]+\b/g;
  while ((m = camelRe.exec(text)) !== null) symbols.add(m[0]);

  // ④ CONSTANT_CASE — 열거값·상수 후보
  const constRe = /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+){1,3}\b/g;
  while ((m = constRe.exec(text)) !== null) symbols.add(m[0]);

  // 흔한 문서 노이즈 제거 — 마크다운 어휘·정책 상투어
  const noise = new Set(['README', 'CLAUDE', 'API', 'URL', 'HTML', 'CSS', 'JSON', 'YAML', 'MD']);
  return Array.from(symbols).filter((s) => !noise.has(s));
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
