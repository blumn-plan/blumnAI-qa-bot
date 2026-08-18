import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GitHubService } from '../github/github.service';
import { TeamContextService, ResolvedTeam } from '../docs/team-context.service';

const DECISIONS_DIR = 'qa/decisions';
const FEEDBACK_DIR = 'qa/feedback';

/** qa/decisions/ · qa/feedback/ 폴더에 md 파일 CRUD. Worker forward/feedback 이식. */
@Injectable()
export class DecisionsService {
  private readonly logger = new Logger(DecisionsService.name);

  constructor(
    private readonly github: GitHubService,
    private readonly teamContext: TeamContextService,
  ) {}

  /** [📤 기획전달] — qa/decisions/{slug}-{timestamp}.md 로 커밋. */
  async forward(team: ResolvedTeam, input: {
    title: string;
    body: string;
    docPath?: string;
    questioner?: string;
  }) {
    if (!input.title?.trim()) throw new BadRequestException({ error: 'title 필수' });
    if (!input.body?.trim()) throw new BadRequestException({ error: 'body 필수' });

    const slug = this.slugify(input.title);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const path = `${DECISIONS_DIR}/${timestamp}-${slug}.md`;

    const content = this.renderDecisionMd(input, timestamp);
    const ctx = this.teamContext.toGitHubContext(team);
    const result = await this.github.writeFile(
      ctx,
      path,
      content,
      `qa: 📤 [${team.name}] ${input.title}`,
    );

    return {
      decisionPath: path,
      commitSha: result.commitSha,
      htmlUrl: result.htmlUrl,
    };
  }

  /** [📝 답변 규칙] — qa/feedback/{slug}-{timestamp}.md 로 커밋. */
  async feedback(team: ResolvedTeam, input: {
    title: string;
    body: string;
    docPath?: string;
  }) {
    if (!input.title?.trim()) throw new BadRequestException({ error: 'title 필수' });
    if (!input.body?.trim()) throw new BadRequestException({ error: 'body 필수' });

    const slug = this.slugify(input.title);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const path = `${FEEDBACK_DIR}/${timestamp}-${slug}.md`;

    const content = this.renderFeedbackMd(input, timestamp);
    const ctx = this.teamContext.toGitHubContext(team);
    const result = await this.github.writeFile(
      ctx,
      path,
      content,
      `qa: 📝 [${team.name}] ${input.title}`,
    );

    return {
      feedbackPath: path,
      commitSha: result.commitSha,
      htmlUrl: result.htmlUrl,
    };
  }

  async listDecisions(team: ResolvedTeam, limit = 50) {
    return this.listMdDirWithMeta(team, DECISIONS_DIR, limit, true);
  }

  async listFeedbacks(team: ResolvedTeam, limit = 50) {
    // feedback 은 상태 개념 없음 · 기본 listing 만 (title 정도만 파싱)
    return this.listMdDirWithMeta(team, FEEDBACK_DIR, limit, false);
  }

  /** md 리스트 + 병렬 fetch + 메타데이터 파싱. withStatus=true 이면 상태·요청자·관련문서까지 파싱.
   *  README.md · index.md 등 timestamp-prefix 없는 파일은 제외 (decisions 로 안 봄). */
  private async listMdDirWithMeta(team: ResolvedTeam, dir: string, limit: number, withStatus: boolean) {
    const ctx = this.teamContext.toGitHubContext(team);
    const entries = await this.github.listDir(ctx, dir);
    const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}/;  // yyyy-mm-dd... prefix
    const mds = entries
      .filter((e) => e.type === 'file' && e.name.toLowerCase().endsWith('.md') && TIMESTAMP_RE.test(e.name))
      .sort((a, b) => b.name.localeCompare(a.name)) // 파일명이 timestamp prefix 라 최신순 정렬 자동
      .slice(0, limit);

    // 각 md 병렬 fetch (실패는 skip) · 파일 개수 많을 때 요청 폭주 방지 위해 concurrency 20 chunk
    const items = await this.parallelMap(mds, 20, async (m) => {
      let content = '';
      try {
        content = await this.github.getFile(ctx, m.path);
      } catch (err) {
        this.logger.warn(`getFile failed for ${m.path}: ${err instanceof Error ? err.message : String(err)}`);
      }
      const meta = parseDecisionMeta(content, m.name);
      return {
        path: m.path,
        name: m.name,
        sha: m.sha,
        title: meta.title,
        ...(withStatus && {
          status: meta.status,
          requester: meta.requester,
          relatedDoc: meta.relatedDoc,
        }),
        createdAt: meta.createdAt,
      };
    });
    return { items, total: mds.length };
  }

  /** 단순 concurrency-limited map · 외부 lib 없이 chunk 반복. */
  private async parallelMap<T, R>(input: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(input.length);
    let idx = 0;
    async function worker() {
      while (idx < input.length) {
        const cur = idx++;
        results[cur] = await fn(input[cur]);
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, input.length) }, worker));
    return results;
  }

  async deleteDecision(team: ResolvedTeam, path: string) {
    if (!path.startsWith(`${DECISIONS_DIR}/`)) {
      throw new BadRequestException({ error: `path 는 ${DECISIONS_DIR}/ 로 시작해야 함` });
    }
    const ctx = this.teamContext.toGitHubContext(team);
    await this.github.deleteFile(ctx, path, `qa: 🗑 [${team.name}] delete decision ${path.split('/').pop()}`);
    return { ok: true, deleted: path };
  }

  /** decision md 의 상태를 새 값으로 교체 + (선택) 기획자 메모를 md 상단에 blockquote 로 삽입 후 커밋.
   *  · applied/hold 시 note 를 넘기면 md 제목 아래 blockquote 로 append 되고, 프론트가 초록/앰버 박스로 렌더.
   *  · 같은 상태로 여러 번 처리 시 메모는 시간순으로 계속 stacking (질문자가 히스토리 확인 가능). */
  async updateDecisionStatus(
    team: ResolvedTeam,
    path: string,
    status: 'pending' | 'applied' | 'hold',
    note?: string,
    plannerName?: string,
  ) {
    if (!path.startsWith(`${DECISIONS_DIR}/`)) {
      throw new BadRequestException({ error: `path 는 ${DECISIONS_DIR}/ 로 시작해야 함` });
    }
    if (!['pending', 'applied', 'hold'].includes(status)) {
      throw new BadRequestException({ error: `status 는 pending/applied/hold 중 하나` });
    }
    const ctx = this.teamContext.toGitHubContext(team);
    const content = await this.github.getFile(ctx, path);
    let updated = rewriteStatusLine(content, status);
    if (note && note.trim() && (status === 'applied' || status === 'hold')) {
      updated = insertPlannerNote(updated, {
        status,
        note: note.trim(),
        plannerName: plannerName?.trim() || undefined,
      });
    }
    const label = STATUS_KO[status];
    const filename = path.split('/').pop() ?? path;
    const result = await this.github.writeFile(
      ctx,
      path,
      updated,
      `qa: 🔄 [${team.name}] ${label}: ${filename}`,
    );
    return { ok: true, path, status, commitSha: result.commitSha };
  }

  async deleteFeedback(team: ResolvedTeam, path: string) {
    if (!path.startsWith(`${FEEDBACK_DIR}/`)) {
      throw new BadRequestException({ error: `path 는 ${FEEDBACK_DIR}/ 로 시작해야 함` });
    }
    const ctx = this.teamContext.toGitHubContext(team);
    await this.github.deleteFile(ctx, path, `qa: 🗑 [${team.name}] delete feedback ${path.split('/').pop()}`);
    return { ok: true, deleted: path };
  }

  private slugify(text: string): string {
    return text.toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
  }

  private renderDecisionMd(input: { title: string; body: string; docPath?: string; questioner?: string }, ts: string): string {
    // 메타 표(table) 하나로 정리. 렌더링 시 각 항목이 표 셀로 명확히 보임.
    //  · 파싱은 parseDecisionMeta 정규식이 `| 상태 | X |` 셀 매치 지원 (아래 정규식 추가)
    //  · updateStatus 도 이 셀 매치해서 값 교체 (rewriteStatusLine)
    const requester = input.questioner ? `@${input.questioner}` : '_(익명)_';
    const relatedDoc = input.docPath ? `\`${input.docPath}\`` : '_(미지정)_';
    const metaTable = [
      '| 항목 | 내용 |',
      '|---|---|',
      `| 📅 접수 | ${ts} |`,
      `| 🙋 요청자 | ${requester} |`,
      `| 📄 관련 문서 | ${relatedDoc} |`,
      `| 🚦 상태 | ⏳ 대기 |`,
    ].join('\n');
    const lines = [
      `# 📤 ${input.title}`,
      '',
      metaTable,
      '',
      '---',
      '',
      input.body,
    ];
    return lines.filter(Boolean).join('\n') + '\n';
  }

  private renderFeedbackMd(input: { title: string; body: string; docPath?: string }, ts: string): string {
    const lines = [
      `# 📝 ${input.title}`,
      '',
      `> 작성: ${ts}`,
      input.docPath ? `> 관련 문서: ${input.docPath}` : '',
      '',
      '---',
      '',
      input.body,
    ];
    return lines.filter(Boolean).join('\n') + '\n';
  }
}

const STATUS_KO: Record<'pending' | 'applied' | 'hold', string> = {
  pending: '⏳ 대기로 변경',
  applied: '✅ 적용',
  hold: '⏸ 보류',
};

/** 표 셀 갱신용 · 이모지 + 짧은 라벨 (`⏳ 대기` 형태). commit 메시지의 STATUS_KO 와 별개. */
const STATUS_EMOJI_KO: Record<string, string> = {
  pending: '⏳ 대기',
  applied: '✅ 적용',
  hold: '⏸ 보류',
  rejected: '❌ 반려',
};

/** 상태 문자열 정규화. bq 우선 · 그다음 표 포맷 · 둘 다 없으면 fallback.
 *  표 포맷은 `⏳ 대기` `✅ 적용` `⏸ 보류` `❌ 반려` 등 이모지 prefix 를 포함할 수 있음. */
function normalizeStatus(bq: string | undefined, tbl: string | undefined, hasContent: boolean): DecisionStatus {
  const src = (bq || tbl || '').toLowerCase();
  if (!src) return hasContent ? 'pending' : 'unknown';
  // 표 포맷 이모지·공백 제거 후 keyword 매칭
  if (/pending|대기|⏳/.test(src)) return 'pending';
  if (/applied|적용|✅/.test(src)) return 'applied';
  if (/hold|보류|⏸|🔒/.test(src)) return 'hold';
  if (/rejected|반려|❌|🚫/.test(src)) return 'rejected';
  return hasContent ? 'pending' : 'unknown';
}

/** md 안 상태 표시 라인을 새 값으로 교체 · 없으면 title 아래에 blockquote 삽입.
 *  세 포맷 지원 (우선순위 순):
 *   1) 신형 표: `| 🚦 상태 | ⏳ 대기 |` (현행 renderDecisionMd)
 *   2) 구형 표: `| 기획자 review | ⏳ 대기 |` (legacy Worker)
 *   3) blockquote: `> 상태: X` (중간 세대 · 잠깐 사용됨)
 *  기존 파일 포맷을 보존적으로 유지하며 값만 교체. */
export function rewriteStatusLine(content: string, status: string): string {
  const cell = STATUS_EMOJI_KO[status] ?? status;

  // 1) 신형 표 (`| 🚦 상태 | ... |` · 이모지 prefix 옵션)
  const newTableRe = /^(\|\s*(?:[^\w\s|]+\s*)?상태\s*\|\s*)([^|]+?)(\s*\|)/im;
  if (newTableRe.test(content)) {
    return content.replace(newTableRe, (_, p1, _p2, p3) => `${p1}${cell}${p3}`);
  }

  // 2) 구형 표 (`| 기획자 review | ... |`)
  const oldTableRe = /^(\|\s*기획자\s*review\s*\|\s*)([^|]+?)(\s*\|)/im;
  if (oldTableRe.test(content)) {
    return content.replace(oldTableRe, (_, p1, _p2, p3) => `${p1}${cell}${p3}`);
  }

  // 3) blockquote 포맷
  const newLine = `> 상태: ${status}`;
  const statusRe = /^>\s*상태\s*[:：].*$/m;
  if (statusRe.test(content)) {
    return content.replace(statusRe, newLine);
  }
  // 없으면 첫 # 헤더 아래 (blockquote 블록 끝) 에 삽입
  const lines = content.split(/\r?\n/);
  // 마지막 blockquote (> ) 라인 다음에 삽입 · 없으면 첫 헤더 다음에 삽입
  let insertIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trimStart().startsWith('>')) insertIdx = i + 1;
    else if (insertIdx >= 0 && !lines[i].trimStart().startsWith('>')) break;
  }
  if (insertIdx < 0) {
    // blockquote 없음 · 첫 # 헤더 뒤 빈줄 위치 찾기
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].trimStart().startsWith('# ')) {
        insertIdx = i + 1;
        // 헤더 다음이 빈줄이면 그 뒤로 삽입
        if (lines[insertIdx]?.trim() === '') insertIdx += 1;
        break;
      }
    }
  }
  if (insertIdx < 0) insertIdx = 0;
  lines.splice(insertIdx, 0, newLine);
  return lines.join('\n');
}

/** decision md 파일 파싱. renderDecisionMd 포맷 기반.
 *  파일이 비어있거나 파싱 실패 시 필드 undefined · title 은 filename fallback.
 *  createdAt 은 md `> 접수:` 우선 · 없으면 filename timestamp prefix. */
export type DecisionStatus = 'pending' | 'applied' | 'hold' | 'rejected' | 'unknown';

export function parseDecisionMeta(content: string, filename: string): {
  title: string;
  status: DecisionStatus;
  requester?: string;
  relatedDoc?: string;
  createdAt?: string;
} {
  const lines = content.split(/\r?\n/);
  // title: 첫 # 헤더에서 이모지 prefix (📤 · 📝) 제거
  const titleLine = lines.find((l) => l.trimStart().startsWith('# '));
  let title = '';
  if (titleLine) {
    title = titleLine.replace(/^\s*#\s+/, '').replace(/^[📤📝]\s*/, '').trim();
  }
  if (!title) {
    // filename fallback: "2026-01-01T00-00-00-my-slug.md" → "my slug"
    title = filename
      .replace(/\.md$/i, '')
      .replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-?/, '')
      .replace(/-/g, ' ')
      .trim() || filename;
  }

  const extract = (re: RegExp): string | undefined => {
    for (const l of lines) {
      const m = l.match(re);
      if (m) return m[1].trim();
    }
    return undefined;
  };

  // 상태 마커 파싱 · 세 포맷 지원 (writer 가 시대별로 다름)
  //  1) 신형 표: `| 🚦 상태 | ⏳ 대기 |` (현행 renderDecisionMd · 이모지 prefix 선택)
  //  2) 구형 표: `| 기획자 review | ✅ 적용 |` (legacy Worker)
  //  3) blockquote: `> 상태: applied|적용|...` (중간 세대)
  const newTableStatus = extract(/^\|\s*(?:[^\w\s|]+\s*)?상태\s*\|\s*([^|]+?)\s*\|/im);
  const oldTableStatus = extract(/^\|\s*기획자\s*review\s*\|\s*([^|]+?)\s*\|/i);
  const bqStatus = extract(/>\s*상태\s*[:：]\s*([a-zA-Z가-힣]+)/i)?.toLowerCase();
  const status: DecisionStatus = normalizeStatus(bqStatus, newTableStatus || oldTableStatus, Boolean(content));

  // 요청자·관련 문서·접수: 표 셀 우선 · blockquote fallback (호환)
  const requester =
    extract(/^\|\s*(?:[^\w\s|]+\s*)?요청자\s*\|\s*@?([^|]+?)\s*\|/im) ??
    extract(/>\s*요청자\s*[:：]\s*@?(.+)/);
  const relatedDoc =
    extract(/^\|\s*(?:[^\w\s|]+\s*)?관련\s*문서\s*\|\s*`?([^`|]+?)`?\s*\|/im) ??
    extract(/>\s*관련\s*문서\s*[:：]\s*(.+)/);
  let createdAt =
    extract(/^\|\s*(?:[^\w\s|]+\s*)?접수\s*\|\s*([^|]+?)\s*\|/im) ??
    extract(/>\s*접수\s*[:：]\s*(.+)/);
  if (!createdAt) {
    // filename prefix 에서 timestamp 파생
    // 신형: 2026-08-05T12-34-56-slug.md  → 2026-08-05T12:34:56Z
    // 구형: 2026-08-05-slug.md            → 2026-08-05T00:00:00Z
    const full = filename.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/);
    if (full) {
      createdAt = `${full[1]}-${full[2]}-${full[3]}T${full[4]}:${full[5]}:${full[6]}Z`;
    } else {
      const dateOnly = filename.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (dateOnly) createdAt = `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00Z`;
    }
  }

  return { title, status, requester, relatedDoc, createdAt };
}

/** 기획자 메모를 md 제목 바로 아래에 blockquote 로 삽입.
 *  · 첫 줄: `📄 **{{"기획자 적용 메모" | "기획자 보류 사유"}}** · YYYY-MM-DD · 👤 {plannerName}`
 *  · 그 아래: note 본문 (여러 줄 지원 · 각 줄 앞에 `> ` prefix)
 *  프론트 MarkdownView 의 blockquote 커스텀 렌더러가 이 첫 줄 마커를 감지 → 초록/앰버 박스로 스타일. */
export function insertPlannerNote(
  content: string,
  input: { status: 'applied' | 'hold'; note: string; plannerName?: string },
): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  const label = input.status === 'applied' ? '기획자 적용 메모' : '기획자 보류 사유';
  const marker = input.status === 'applied' ? 'apply' : 'hold';
  const who = input.plannerName ? ` · 👤 ${input.plannerName}` : '';
  const headerLine = `> 📄 [planner-note:${marker}] **${label}** · ${dateStr}${who}`;
  const bodyLines = input.note
    .split(/\r?\n/)
    .map((l) => `> ${l}`)
    .join('\n');
  const block = `${headerLine}\n>\n${bodyLines}`;

  const lines = content.split(/\r?\n/);
  // 첫 # 헤더 인덱스 찾기
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trimStart().startsWith('# ')) { headerIdx = i; break; }
  }
  if (headerIdx < 0) {
    // 헤더 없음 · 파일 최상단에 삽입
    return `${block}\n\n${content}`;
  }
  // 헤더 다음 줄부터 non-empty 위치 찾아서 그 앞에 삽입 (빈 줄 하나 유지)
  let insertIdx = headerIdx + 1;
  while (insertIdx < lines.length && lines[insertIdx].trim() === '') insertIdx += 1;
  const before = lines.slice(0, insertIdx).join('\n');
  const after = lines.slice(insertIdx).join('\n');
  return `${before}\n${block}\n\n${after}`;
}
