import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeamService } from '../team/team.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamService: TeamService,
  ) {}

  @Get()
  async check(@Query('detailed') detailed?: string) {
    let db: 'ok' | 'error' = 'ok';
    let dbError: string | undefined;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      db = 'error';
      dbError = err instanceof Error ? err.message : String(err);
    }

    const base = {
      status: db === 'ok' ? 'ok' : 'degraded',
      service: 'blumnai-qa-backend',
      time: new Date().toISOString(),
      db,
      ...(dbError ? { dbError } : {}),
    };

    if (detailed !== '1') return base;

    // detailed=1 → 진단 리포트 (팀 수 · env 시크릿 등록 여부 등)
    const teamStats = db === 'ok'
      ? await this.teamService.listSlugs(100).catch(() => null)
      : null;
    return {
      ...base,
      teams: teamStats,
      env: {
        ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
        GITHUB_TOKEN: !!process.env.GITHUB_TOKEN,
        ALLOWED_ORIGINS:
          process.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [],
      },
    };
  }
}
