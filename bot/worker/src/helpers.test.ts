import { describe, it, expect } from 'vitest';
import {
  extractProjectFromPath,
  extractSearchKeywords,
  extPathToQualifier,
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
