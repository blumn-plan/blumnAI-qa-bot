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
   *  policies_dir · storyboards_dir 필드는 줄바꿈으로 여러 폴더 지정 가능.
   *  각 폴더별로 listDir 후 병합 · 같은 path 는 dedupe. */
  async listDocs(team: ResolvedTeam, projectSlug?: string) {
    const project = this.teamContext.resolveProject(team, projectSlug);
    const ctx = this.teamContext.toGitHubContext(team);

    const policyDirs = this.splitDirs(project.policiesDir);
    const storyDirs = this.splitDirs(project.storyboardsDir);

    const [policyLists, storyLists] = await Promise.all([
      Promise.all(policyDirs.map((d) => this.github.listDir(ctx, d).then((e) => this.filterMd(e, 'policy')))),
      Promise.all(storyDirs.map((d) => this.github.listDir(ctx, d).then((e) => this.filterMd(e, 'storyboard')))),
    ]);

    const merged = [...policyLists.flat(), ...storyLists.flat()];
    // 같은 path 중복 제거 (여러 폴더가 같은 파일을 가리키는 실수 대비)
    const seen = new Set<string>();
    const docs = merged.filter((d) => {
      if (seen.has(d.path)) return false;
      seen.add(d.path);
      return true;
    });

    return { project: project.slug, docs };
  }

  /** 줄바꿈 · 쉼표 로 폴더 여러개 분리 · 빈 값 제거. */
  private splitDirs(raw: string | null | undefined): string[] {
    if (!raw) return [];
    return raw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
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
