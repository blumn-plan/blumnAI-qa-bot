import { describe, it, expect } from 'vitest';
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

describe('extractProjectFromPath', () => {
  it('경로에서 project id 추출', () => {
    expect(extractProjectFromPath('projects/admin_v1/docs/policies/foo.md')).toBe('admin_v1');
    expect(extractProjectFromPath('projects/ad_v1/docs/storyboards/dashboard.md')).toBe('ad_v1');
    expect(extractProjectFromPath('projects/backoffice_v2/docs/policies/x_v0.1.0.md')).toBe('backoffice_v2');
  });
  it('projects/ prefix 없으면 빈 문자열', () => {
    expect(extractProjectFromPath('docs/policies/foo.md')).toBe('');
    expect(extractProjectFromPath('CLAUDE.md')).toBe('');
    expect(extractProjectFromPath('')).toBe('');
    expect(extractProjectFromPath(undefined)).toBe('');
  });
});

describe('extractSearchKeywords', () => {
  it('불용어 제거 후 유의미 키워드만 반환', () => {
    const result = extractSearchKeywords('캠페인 어떻게 삭제 하나요?', '');
    expect(result).toContain('캠페인');
    expect(result).toContain('삭제');
    expect(result).not.toContain('어떻게');
    expect(result).not.toContain('하나요');
  });
  it('최대 4개 토큰까지만 (2자 이상만 통과)', () => {
    const result = extractSearchKeywords('캠페인 정책 삭제 화면 버튼 로직 조건 API', '');
    expect(result.split(/\s+/)).toHaveLength(4);
  });
  it('힌트 있으면 뒤에 붙음', () => {
    expect(extractSearchKeywords('삭제', 'campaign OR marketing')).toBe('삭제 campaign OR marketing');
  });
  it('중복 토큰 제거', () => {
    expect(extractSearchKeywords('삭제 삭제 삭제', '').split(/\s+/)).toHaveLength(1);
  });
});

describe('extractCodeSymbols — 정책 md 안 인라인 영문 심볼 추출', () => {
  it('백틱 인용 심볼 추출', () => {
    const result = extractCodeSymbols('컴포넌트는 `DashboardFilter` 를 씁니다.');
    expect(result).toContain('DashboardFilter');
  });
  it('PascalCase 컴포넌트 후보', () => {
    const result = extractCodeSymbols('Dashboard 화면에서 CampaignList 를 렌더');
    expect(result).toContain('Dashboard');
    expect(result).toContain('CampaignList');
  });
  it('camelCase 훅·함수 후보', () => {
    const result = extractCodeSymbols('useFilter 훅으로 초기화 · getUserId 호출');
    expect(result).toContain('useFilter');
    expect(result).toContain('getUserId');
  });
  it('CONSTANT_CASE 상수 후보', () => {
    const result = extractCodeSymbols('상수 MODAL_TYPE 을 참조');
    expect(result).toContain('MODAL_TYPE');
  });
  it('흔한 노이즈 (README, API 등) 제외', () => {
    const result = extractCodeSymbols('README API URL HTML 참고');
    expect(result).not.toContain('README');
    expect(result).not.toContain('API');
    expect(result).not.toContain('URL');
  });
  it('빈 입력·한글만 → 빈 배열', () => {
    expect(extractCodeSymbols('')).toEqual([]);
    expect(extractCodeSymbols('한글만 있는 문서')).toEqual([]);
  });
});

describe('expandKoreanUiTerms — 한글 UI 용어 → 영문 심볼 매핑', () => {
  it('대시보드·필터·버튼 확장', () => {
    const result = expandKoreanUiTerms('대시보드 필터에 초기화 버튼');
    expect(result).toContain('Dashboard');
    expect(result).toContain('Filter');
    expect(result).toContain('reset');
    expect(result).toContain('Button');
  });
  it('여러 액션 (삭제·저장·수정) 매핑', () => {
    const result = expandKoreanUiTerms('캠페인을 삭제하거나 저장하거나 수정');
    expect(result).toContain('Campaign');
    expect(result).toContain('delete');
    expect(result).toContain('save');
    expect(result).toContain('edit');
  });
  it('사전에 없는 한글은 빈 배열', () => {
    expect(expandKoreanUiTerms('이건 사전에 없는 표현')).toEqual([]);
  });
  it('중복 제거', () => {
    const result = expandKoreanUiTerms('버튼 버튼 버튼');
    expect(result.filter((t) => t === 'Button')).toHaveLength(1);
  });
});

describe('extPathToQualifier', () => {
  it('src/**/*.tsx → path:src extension:tsx', () => {
    expect(extPathToQualifier('src/**/*.tsx')).toBe('path:src extension:tsx');
  });
  it('경로만 있고 확장자 없음 (마지막 * 앞까지 dir 캡처)', () => {
    expect(extPathToQualifier('src/pages/*')).toBe('path:src/pages');
  });
  it('확장자만 있음', () => {
    expect(extPathToQualifier('*.ts')).toBe('extension:ts');
  });
  it('둘 다 없으면 빈 문자열', () => {
    expect(extPathToQualifier('foobar')).toBe('');
  });
});

describe('escapeHtml', () => {
  it('HTML 특수문자 이스케이프', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(escapeHtml("it's a & thing")).toBe('it&#39;s a &amp; thing');
  });
  it('빈 문자열·안전한 문자열은 그대로', () => {
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('escapeRegex', () => {
  it('regex 특수문자 이스케이프', () => {
    expect(escapeRegex('foo.bar')).toBe('foo\\.bar');
    expect(escapeRegex('[test]')).toBe('\\[test\\]');
    expect(escapeRegex('(a|b)+')).toBe('\\(a\\|b\\)\\+');
  });
});

describe('renderNoteBodyHtml — 이미지 마크다운 → 안전 img 태그', () => {
  it('https URL 은 img 태그로 렌더', () => {
    const html = renderNoteBodyHtml('스크린샷: ![캡처](https://example.com/a.png)');
    expect(html).toContain('<img class="planner-memo-img"');
    expect(html).toContain('src="https://example.com/a.png"');
    expect(html).toContain('alt="캡처"');
  });
  it('상대 경로 (/qa/decisions/images/) 도 허용', () => {
    const html = renderNoteBodyHtml('![shot](/qa/decisions/images/2026-07-10-slug/shot.png)');
    expect(html).toContain('src="/qa/decisions/images/2026-07-10-slug/shot.png"');
  });
  it('data:image URL 허용', () => {
    const html = renderNoteBodyHtml('![](data:image/png;base64,iVBORw0K)');
    expect(html).toContain('<img class="planner-memo-img"');
  });
  it('안전하지 않은 URL 은 <img> 안 만들고 이스케이프된 원본 문자열로', () => {
    const html = renderNoteBodyHtml('![evil](javascript:alert(1))');
    expect(html).not.toContain('<img');
    expect(html).toContain('![evil]');
  });
  it('일반 텍스트는 escapeHtml + <br>', () => {
    const html = renderNoteBodyHtml('a & b\nc');
    expect(html).toBe('a &amp; b<br>c');
  });
  it('텍스트 + 이미지 혼합', () => {
    const html = renderNoteBodyHtml('메모입니다\n![shot](https://example.com/x.png)\n끝');
    expect(html).toContain('메모입니다<br>');
    expect(html).toContain('<img class="planner-memo-img"');
    expect(html).toContain('<br>끝');
  });
  it('XSS 시도 — alt 텍스트에 스크립트', () => {
    const html = renderNoteBodyHtml('![<script>alert(1)</script>](https://x.com/a.png)');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});
