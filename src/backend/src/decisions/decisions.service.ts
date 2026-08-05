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
    return this.listMdDir(team, DECISIONS_DIR, limit);
  }

  async listFeedbacks(team: ResolvedTeam, limit = 50) {
    return this.listMdDir(team, FEEDBACK_DIR, limit);
  }

  private async listMdDir(team: ResolvedTeam, dir: string, limit: number) {
    const ctx = this.teamContext.toGitHubContext(team);
    const entries = await this.github.listDir(ctx, dir);
    const mds = entries
      .filter((e) => e.type === 'file' && e.name.toLowerCase().endsWith('.md'))
      .sort((a, b) => b.name.localeCompare(a.name)) // 파일명이 timestamp prefix 라 최신순 정렬 자동
      .slice(0, limit);
    return {
      items: mds.map((m) => ({ path: m.path, name: m.name, sha: m.sha })),
      total: mds.length,
    };
  }

  async deleteDecision(team: ResolvedTeam, path: string) {
    if (!path.startsWith(`${DECISIONS_DIR}/`)) {
      throw new BadRequestException({ error: `path 는 ${DECISIONS_DIR}/ 로 시작해야 함` });
    }
    const ctx = this.teamContext.toGitHubContext(team);
    await this.github.deleteFile(ctx, path, `qa: 🗑 [${team.name}] delete decision ${path.split('/').pop()}`);
    return { ok: true, deleted: path };
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
    const lines = [
      `# 📤 ${input.title}`,
      '',
      `> 접수: ${ts}`,
      input.questioner ? `> 요청자: @${input.questioner}` : '',
      input.docPath ? `> 관련 문서: ${input.docPath}` : '',
      `> 상태: pending`,
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
