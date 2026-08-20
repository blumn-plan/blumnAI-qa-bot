import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from './encryption.service';
import { PasswordService } from './password.service';

/**
 * 부팅 시 1회 자동 마이그레이션.
 * - `teams.master_pat`, `teams.anthropic_key` 중 평문인 row 를 AES-256-GCM 으로 in-place 암호화
 * - `teams.planner_password` 중 평문인 row 를 bcrypt 로 in-place 해싱
 * 이미 암호화/해싱된 값은 skip · 재실행 안전 (idempotent).
 *
 * ISMS 대응: 마이그레이션 로그 (건수 · 시각) 를 남겨 감사 추적 가능.
 */
@Injectable()
export class SecretsMigrationService implements OnModuleInit {
  private readonly logger = new Logger(SecretsMigrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly password: PasswordService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.migrate();
    } catch (err) {
      // 부팅 자체는 계속 · 관리자가 로그 보고 대응할 수 있도록 error 로그 남김
      this.logger.error(
        `secrets migration failed · 서버는 부팅되나 시크릿 사용 시 오류 가능: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async migrate(): Promise<{ encrypted: number; hashed: number; scanned: number }> {
    const teams = await this.prisma.team.findMany({
      select: {
        id: true,
        slug: true,
        masterPat: true,
        anthropicKey: true,
        plannerPassword: true,
      },
    });

    let encryptedCount = 0;
    let hashedCount = 0;

    for (const t of teams) {
      const update: {
        masterPat?: string | null;
        anthropicKey?: string | null;
        plannerPassword?: string | null;
      } = {};

      if (t.masterPat && !this.encryption.isEncrypted(t.masterPat)) {
        update.masterPat = this.encryption.encrypt(t.masterPat);
        encryptedCount++;
      }
      if (t.anthropicKey && !this.encryption.isEncrypted(t.anthropicKey)) {
        update.anthropicKey = this.encryption.encrypt(t.anthropicKey);
        encryptedCount++;
      }
      if (t.plannerPassword && !this.password.isHashed(t.plannerPassword)) {
        update.plannerPassword = await this.password.hash(t.plannerPassword);
        hashedCount++;
      }

      if (Object.keys(update).length > 0) {
        await this.prisma.team.update({ where: { id: t.id }, data: update });
        this.logger.log(
          `team ${t.slug}: encrypted=${
            [
              update.masterPat && 'master_pat',
              update.anthropicKey && 'anthropic_key',
            ]
              .filter(Boolean)
              .join(',') || 'none'
          } hashed=${update.plannerPassword ? 'planner_password' : 'none'}`,
        );
      }
    }

    if (encryptedCount + hashedCount > 0) {
      this.logger.log(
        `secrets migration done · scanned=${teams.length} encrypted=${encryptedCount} hashed=${hashedCount}`,
      );
    } else {
      this.logger.log(`secrets migration skipped · all ${teams.length} team(s) already secured`);
    }
    return { encrypted: encryptedCount, hashed: hashedCount, scanned: teams.length };
  }
}
