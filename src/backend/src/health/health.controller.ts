import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let db: 'ok' | 'error' = 'ok';
    let dbError: string | undefined;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      db = 'error';
      dbError = err instanceof Error ? err.message : String(err);
    }
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      service: 'blumnai-qa-backend',
      time: new Date().toISOString(),
      db,
      ...(dbError ? { dbError } : {}),
    };
  }
}
