import { Injectable } from '@nestjs/common';
import { GitHubService, ContentEntry } from '../github/github.service';
import { TeamContextService, ResolvedTeam } from './team-context.service';

export interface DocEntry {
  path: string;
  title: string;
  kind: 'policy' | 'storyboard';
  screen?: string;
}

/** 정책·화면설계서 목록·본문 조회. Worker 의 listDocs/getDoc 이식. */
@Injectable()
export class DocsService {
  constructor(
    private readonly github: GitHubService,
    private readonly teamContext: TeamContextService,
  ) {}

  async listProjects(team: ResolvedTeam) {
    return {
      projects: team.projects.map((p) => ({ id: p.slug, label: p.label })),
      default: team.projects[0]?.slug ?? null,
    };
  }

  /** 프로젝트의 policies + storyboards 목록.
   *  각 md 파일에서 첫 # 헤딩을 title 로 · 파일명에서 화면명 추출. */
  async listDocs(team: ResolvedTeam, projectSlug?: string) {
    const project = this.teamContext.resolveProject(team, projectSlug);
    const ctx = this.teamContext.toGitHubContext(team);

    const [policies, storyboards] = await Promise.all([
      project.policiesDir
        ? this.github.listDir(ctx, project.policiesDir).then((entries) => this.filterMd(entries, 'policy'))
        : Promise.resolve([] as DocEntry[]),
      project.storyboardsDir
        ? this.github.listDir(ctx, project.storyboardsDir).then((entries) => this.filterMd(entries, 'storyboard'))
        : Promise.resolve([] as DocEntry[]),
    ]);

    return {
      project: project.slug,
      docs: [...policies, ...storyboards],
    };
  }

  async getDoc(team: ResolvedTeam, path: string): Promise<{ path: string; content: string }> {
    const ctx = this.teamContext.toGitHubContext(team);
    const content = await this.github.getFile(ctx, path);
    return { path, content };
  }

  /** md 파일만 필터링 + DocEntry 로 변환. title = 파일명 (첫 # 은 프론트에서 우선 추출).
   *  성능상 목록 단계에서 각 파일 fetch 는 X · 파일명 기반 title. */
  private filterMd(entries: ContentEntry[], kind: 'policy' | 'storyboard'): DocEntry[] {
    return entries
      .filter((e) => e.type === 'file' && e.name.toLowerCase().endsWith('.md'))
      .map((e) => {
        const nameWithoutExt = e.name.replace(/\.md$/i, '');
        const doc: DocEntry = {
          path: e.path,
          title: nameWithoutExt,
          kind,
        };
        if (kind === 'storyboard') {
          // 파일명이 화면명일 수 있음 (예: "로그인_화면.md" → screen: "로그인 화면")
          doc.screen = nameWithoutExt.replace(/_/g, ' ');
        }
        return doc;
      });
  }
}
