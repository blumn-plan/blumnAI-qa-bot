import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../crypto/encryption.service';
import { PasswordService } from '../crypto/password.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly password: PasswordService,
  ) {}

  /** slug 검증: 소문자·숫자·하이픈만 · 3-64자.
   *  ex) blumn/ad-team-policies → blumn-ad-team-policies (프론트에서 파생) */
  static isValidSlug(slug: string): boolean {
    return /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug);
  }

  /** DB 저장 값 (암호문/해시) → UI 응답용 마스킹.
   *  ISMS: 시크릿 원본은 절대 응답으로 나가지 않음.
   *  암호문 (`v1:...`) → `enc:***` · bcrypt 해시 → `hash:***` · 미설정 → 빈 문자열.
   *  이 마스킹은 순전히 "설정 완료 여부" 를 화면에 표시하기 위함. */
  private maskStored(kind: 'enc' | 'hash', value: string | null | undefined): string {
    if (!value) return '';
    return kind === 'enc' ? 'enc:***' : 'hash:***';
  }

  private toResponse(team: any): TeamResponse {
    return {
      team_slug: team.slug,
      team_name: team.name,
      github_repo: team.githubRepo,
      master_github_login: team.masterGithubLogin,
      master_pat: this.maskStored('enc', team.masterPat),
      anthropic_key: this.maskStored('enc', team.anthropicKey),
      planner_password: this.maskStored('hash', team.plannerPassword),
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

  /** upsert. 신규 생성 시엔 name + github_repo 필수. 존재하면 partial update.
   *  ISMS: master_pat / anthropic_key 는 AES-256-GCM 암호화 후 저장 · planner_password 는 bcrypt 해싱 후 저장. */
  async upsertBySlug(slug: string, dto: UpsertTeamDto): Promise<TeamResponse> {
    // wizard 호환: github_token 이 오면 master_pat 로 매핑
    const masterPatPlain = dto.master_pat ?? dto.github_token;

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

    // 시크릿 사전 변환 (평문 → 암호문/해시). undefined 는 "변경 없음" 이므로 그대로 undefined.
    const masterPatStored = masterPatPlain !== undefined ? this.encryption.encrypt(masterPatPlain) : undefined;
    const anthropicKeyStored = dto.anthropic_key !== undefined ? this.encryption.encrypt(dto.anthropic_key) : undefined;
    const plannerPasswordStored = dto.planner_password !== undefined ? await this.password.hash(dto.planner_password) : undefined;

    // upsert 는 relation nested write 가 까다로워서 transaction 으로 처리.
    const result = await this.prisma.$transaction(async (tx) => {
      const team = await tx.team.upsert({
        where: { slug },
        create: {
          slug,
          name: dto.team_name!,
          githubRepo: dto.github_repo!,
          masterGithubLogin: dto.master_github_login,
          masterPat: masterPatStored ?? null,
          anthropicKey: anthropicKeyStored ?? null,
          plannerPassword: plannerPasswordStored ?? null,
          rateLimitPerDay: dto.rate_limit_per_day ?? 50,
        },
        update: {
          ...(dto.team_name !== undefined && { name: dto.team_name }),
          ...(dto.github_repo !== undefined && { githubRepo: dto.github_repo }),
          ...(dto.master_github_login !== undefined && { masterGithubLogin: dto.master_github_login }),
          ...(masterPatStored !== undefined && { masterPat: masterPatStored }),
          ...(anthropicKeyStored !== undefined && { anthropicKey: anthropicKeyStored }),
          ...(plannerPasswordStored !== undefined && { plannerPassword: plannerPasswordStored }),
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

  /** 기획자 모드 비번 검증. bcrypt.compare 로 상수시간 비교.
   *  응답 shape:
   *  - { ok: true } → 통과
   *  - { ok: false, reason: 'no-password' } → 팀에 planner_password 미설정 → 기획자 모드 비활성화
   *  - { ok: false, reason: 'wrong' } → 비번 틀림 */
  async verifyPlannerPassword(
    slug: string,
    password: string,
  ): Promise<{ ok: true } | { ok: false; reason: 'no-password' | 'wrong' }> {
    const team = await this.prisma.team.findUnique({
      where: { slug },
      select: { plannerPassword: true },
    });
    if (!team) throw new NotFoundException({ error: 'Team not found', slug });
    if (!team.plannerPassword || team.plannerPassword.trim() === '') {
      return { ok: false, reason: 'no-password' };
    }
    const ok = await this.password.verify(password.trim(), team.plannerPassword);
    return ok ? { ok: true } : { ok: false, reason: 'wrong' };
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
