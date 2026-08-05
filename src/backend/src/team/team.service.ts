import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertTeamDto, ProjectPayloadDto } from './dto/team-payload.dto';

/** 응답 shape — Worker /team/{slug} GET/PUT 응답과 동일한 필드 이름 유지 (프론트 호환). */
export interface TeamResponse {
  team_slug: string;
  team_name: string;
  github_repo: string;
  master_github_login: string | null;
  master_pat: string;             // 마스킹된 값
  anthropic_key: string;          // 마스킹된 값
  planner_password: string;       // 마스킹된 값
  rate_limit_per_day: number;
  projects: Array<{
    slug: string;
    label: string;
    policies_dir: string;
    storyboards_dir: string;
    code_repo: string;
  }>;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class TeamService {
  constructor(private readonly prisma: PrismaService) {}

  /** slug 검증: 소문자·숫자·하이픈만 · 3-64자.
   *  ex) blumn/ad-team-policies → blumn-ad-team-policies (프론트에서 파생) */
  static isValidSlug(slug: string): boolean {
    return /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug);
  }

  /** master_pat/anthropic_key/planner_password 시크릿 마스킹.
   *  8자 미만이면 '***' · 그 외엔 앞 4자 + '***' + 뒤 2자. */
  static maskSecret(value: string | null | undefined): string {
    if (!value || typeof value !== 'string') return '';
    if (value.length < 8) return '***';
    return `${value.slice(0, 4)}***${value.slice(-2)}`;
  }

  private toResponse(team: any): TeamResponse {
    return {
      team_slug: team.slug,
      team_name: team.name,
      github_repo: team.githubRepo,
      master_github_login: team.masterGithubLogin,
      master_pat: TeamService.maskSecret(team.masterPat),
      anthropic_key: TeamService.maskSecret(team.anthropicKey),
      planner_password: TeamService.maskSecret(team.plannerPassword),
      rate_limit_per_day: team.rateLimitPerDay,
      projects: (team.projects ?? []).map((p: any) => ({
        slug: p.slug,
        label: p.label,
        policies_dir: p.policiesDir,
        storyboards_dir: p.storyboardsDir,
        code_repo: p.codeRepo,
      })),
      created_at: team.createdAt.toISOString(),
      updated_at: team.updatedAt.toISOString(),
    };
  }

  async findBySlug(slug: string): Promise<TeamResponse> {
    const team = await this.prisma.team.findUnique({
      where: { slug },
      include: { projects: { orderBy: { id: 'asc' } } },
    });
    if (!team) throw new NotFoundException({ error: 'Team not found', slug });
    return this.toResponse(team);
  }

  /** upsert. 신규 생성 시엔 name + github_repo 필수. 존재하면 partial update. */
  async upsertBySlug(slug: string, dto: UpsertTeamDto): Promise<TeamResponse> {
    // wizard 호환: github_token 이 오면 master_pat 로 매핑
    const masterPat = dto.master_pat ?? dto.github_token;

    // 단일 프로젝트 wizard 호환: projects[] 없고 policies_dir 등만 있으면 default 프로젝트 만듦
    let projects: ProjectPayloadDto[] | undefined = dto.projects;
    if ((!projects || projects.length === 0) && (dto.policies_dir || dto.storyboards_dir || dto.code_repo)) {
      projects = [{
        slug: 'default',
        label: '기본 프로젝트',
        policies_dir: dto.policies_dir ?? '',
        storyboards_dir: dto.storyboards_dir ?? '',
        code_repo: dto.code_repo ?? '',
      }];
    }

    const existing = await this.prisma.team.findUnique({ where: { slug } });

    // 신규 생성: name + github_repo 필수 검증
    if (!existing) {
      if (!dto.team_name) throw new NotFoundException({ error: 'team_name 필수 (신규 생성)' });
      if (!dto.github_repo) throw new NotFoundException({ error: 'github_repo 필수 (신규 생성)' });
    }

    // upsert 는 relation nested write 가 까다로워서 transaction 으로 처리.
    const result = await this.prisma.$transaction(async (tx) => {
      const team = await tx.team.upsert({
        where: { slug },
        create: {
          slug,
          name: dto.team_name!,
          githubRepo: dto.github_repo!,
          masterGithubLogin: dto.master_github_login,
          masterPat: masterPat ?? null,
          anthropicKey: dto.anthropic_key ?? null,
          plannerPassword: dto.planner_password ?? null,
          rateLimitPerDay: dto.rate_limit_per_day ?? 50,
        },
        update: {
          ...(dto.team_name !== undefined && { name: dto.team_name }),
          ...(dto.github_repo !== undefined && { githubRepo: dto.github_repo }),
          ...(dto.master_github_login !== undefined && { masterGithubLogin: dto.master_github_login }),
          ...(masterPat !== undefined && { masterPat }),
          ...(dto.anthropic_key !== undefined && { anthropicKey: dto.anthropic_key }),
          ...(dto.planner_password !== undefined && { plannerPassword: dto.planner_password }),
          ...(dto.rate_limit_per_day !== undefined && { rateLimitPerDay: dto.rate_limit_per_day }),
        },
      });

      // 프로젝트 replace 전략 (전송된 배열로 통째 교체)
      if (projects !== undefined) {
        await tx.project.deleteMany({ where: { teamId: team.id } });
        if (projects.length > 0) {
          await tx.project.createMany({
            data: projects.map((p) => ({
              teamId: team.id,
              slug: p.slug,
              label: p.label,
              policiesDir: p.policies_dir ?? '',
              storyboardsDir: p.storyboards_dir ?? '',
              codeRepo: p.code_repo ?? '',
            })),
          });
        }
      }

      return tx.team.findUnique({
        where: { id: team.id },
        include: { projects: { orderBy: { id: 'asc' } } },
      });
    });

    return this.toResponse(result);
  }

  async deleteBySlug(slug: string): Promise<{ ok: true; deleted: string }> {
    const existing = await this.prisma.team.findUnique({ where: { slug } });
    if (!existing) throw new NotFoundException({ error: 'Team not found', slug });
    await this.prisma.team.delete({ where: { slug } });   // cascade → projects 자동 삭제
    return { ok: true, deleted: slug };
  }

  async listSlugs(limit = 100): Promise<{ teamCount: number; teamSlugs: string[] }> {
    const teams = await this.prisma.team.findMany({
      select: { slug: true },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    return { teamCount: teams.length, teamSlugs: teams.map((t) => t.slug) };
  }
}
