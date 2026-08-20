import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../crypto/encryption.service';
import { GitHubContext } from '../github/github.service';

export interface ResolvedTeam {
  slug: string;
  name: string;
  githubRepo: string;
  masterPat: string;
  anthropicKey: string;
  rateLimitPerDay: number;
  projects: Array<{
    slug: string;
    label: string;
    policiesDir: string;
    storyboardsDir: string;
    codeRepo: string;
  }>;
}

/** slug 로 팀 조회 · 시크릿 · 프로젝트 목록까지 한번에 로드.
 *  대부분의 read/write 엔드포인트가 team 을 기준으로 동작 → 공통 유틸. */
@Injectable()
export class TeamContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  /** slug 로 팀 로드 · 시크릿 복호화 (AES-256-GCM).
   *  ISMS: 시크릿은 서비스 경계 안에서만 평문. 응답으로 나가는 경로는 TeamService.toResponse 가 마스킹. */
  async resolve(teamSlug: string | undefined): Promise<ResolvedTeam> {
    if (!teamSlug) throw new BadRequestException({ error: 'team query 필수' });
    const team = await this.prisma.team.findUnique({
      where: { slug: teamSlug },
      include: { projects: { orderBy: { id: 'asc' } } },
    });
    if (!team) throw new NotFoundException({ error: 'Team not found', slug: teamSlug });
    if (!team.masterPat) throw new BadRequestException({ error: 'Team master_pat 미설정 · GitHub 접근 불가' });
    return {
      slug: team.slug,
      name: team.name,
      githubRepo: team.githubRepo,
      masterPat: this.encryption.decrypt(team.masterPat),
      anthropicKey: team.anthropicKey ? this.encryption.decrypt(team.anthropicKey) : '',
      rateLimitPerDay: team.rateLimitPerDay,
      projects: team.projects.map((p) => ({
        slug: p.slug,
        label: p.label,
        policiesDir: p.policiesDir,
        storyboardsDir: p.storyboardsDir,
        codeRepo: p.codeRepo,
      })),
    };
  }

  toGitHubContext(team: ResolvedTeam): GitHubContext {
    return { repo: team.githubRepo, token: team.masterPat };
  }

  /** project 파라미터 → 실제 프로젝트 config. project 생략 시 첫 번째 프로젝트 사용. */
  resolveProject(team: ResolvedTeam, projectSlug?: string) {
    if (team.projects.length === 0) {
      throw new BadRequestException({ error: '팀에 프로젝트가 없음 · PUT /api/team/:slug 로 projects[] 등록 필요' });
    }
    if (!projectSlug) return team.projects[0];
    const found = team.projects.find((p) => p.slug === projectSlug);
    if (!found) throw new NotFoundException({ error: 'Project not found', teamSlug: team.slug, projectSlug });
    return found;
  }
}
