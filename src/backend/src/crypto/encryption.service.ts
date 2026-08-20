import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM 대칭 암호화 (인증된 암호화 · 무결성 태그 포함).
 *
 * 저장 포맷: `v1:<iv_b64>:<ct_b64>:<tag_b64>`
 * - v1        · 알고리즘 버전 prefix · 추후 KEK 회전/알고리즘 교체 시 하위호환
 * - iv        · 96-bit random nonce (GCM 권장 · 매 암호화마다 신규 생성)
 * - ct        · ciphertext
 * - tag       · 128-bit GCM 인증 태그
 *
 * 마스터 키 (KEK): `MASTER_ENCRYPTION_KEY` env · 32-byte base64.
 * ISMS 대응: 키가 없으면 서버 부팅 실패 · 평문 저장 원천 차단.
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private key!: Buffer;

  static readonly VERSION = 'v1';
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_BYTES = 12; // 96-bit · GCM 권장
  private static readonly KEY_BYTES = 32; // 256-bit

  onModuleInit() {
    const raw = process.env.MASTER_ENCRYPTION_KEY;
    if (!raw || raw.trim() === '') {
      throw new Error(
        'MASTER_ENCRYPTION_KEY 미설정 · 서버 부팅 불가. ' +
        '32-byte base64 키 발급: `node -e "console.log(require(\\"crypto\\").randomBytes(32).toString(\\"base64\\"))"`',
      );
    }
    let decoded: Buffer;
    try {
      decoded = Buffer.from(raw.trim(), 'base64');
    } catch {
      throw new Error('MASTER_ENCRYPTION_KEY base64 디코드 실패');
    }
    if (decoded.length !== EncryptionService.KEY_BYTES) {
      throw new Error(
        `MASTER_ENCRYPTION_KEY 길이 오류 · 32 bytes 필요 (현재 ${decoded.length} bytes). ` +
        '재발급 후 재기동하세요.',
      );
    }
    this.key = decoded;
    this.logger.log('EncryptionService ready (AES-256-GCM · KEK loaded)');
  }

  /** 평문 → `v1:iv:ct:tag` 포맷. null/undefined/빈문자열은 그대로 반환 (nullable 컬럼 대응). */
  encrypt(plaintext: string | null | undefined): string | null {
    if (plaintext === null || plaintext === undefined || plaintext === '') return null;
    const iv = randomBytes(EncryptionService.IV_BYTES);
    const cipher = createCipheriv(EncryptionService.ALGORITHM, this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${EncryptionService.VERSION}:${iv.toString('base64')}:${ct.toString('base64')}:${tag.toString('base64')}`;
  }

  /** `v1:iv:ct:tag` → 평문. 태그 검증 실패 시 throw (변조 감지). */
  decrypt(ciphertext: string | null | undefined): string {
    if (ciphertext === null || ciphertext === undefined || ciphertext === '') return '';
    if (!this.isEncrypted(ciphertext)) {
      throw new InternalServerErrorException({
        error: '암호화되지 않은 시크릿 감지 · 데이터 마이그레이션 필요',
      });
    }
    const parts = ciphertext.split(':');
    if (parts.length !== 4 || parts[0] !== EncryptionService.VERSION) {
      throw new InternalServerErrorException({
        error: '지원하지 않는 암호문 포맷',
        version: parts[0],
      });
    }
    const [, ivB64, ctB64, tagB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const ct = Buffer.from(ctB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    if (iv.length !== EncryptionService.IV_BYTES) {
      throw new InternalServerErrorException({ error: 'IV 길이 오류' });
    }
    const decipher = createDecipheriv(EncryptionService.ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    try {
      const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
      return plain.toString('utf8');
    } catch (err) {
      // GCM tag 실패 = 변조 또는 KEK 불일치
      throw new InternalServerErrorException({
        error: '복호화 실패 · 태그 검증 오류 (KEK 불일치 또는 데이터 변조)',
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** 값이 이 서비스가 생성한 암호문인지 판별. 마이그레이션 시 plaintext vs encrypted 분기용. */
  isEncrypted(value: string | null | undefined): boolean {
    if (!value || typeof value !== 'string') return false;
    return value.startsWith(`${EncryptionService.VERSION}:`) && value.split(':').length === 4;
  }
}
