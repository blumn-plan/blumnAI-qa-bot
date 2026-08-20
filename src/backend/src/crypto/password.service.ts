import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';

/**
 * 단방향 비밀번호 해시 (bcrypt).
 * ISMS 대응: 비밀번호는 복호화 불가 · salted hash 저장.
 * rounds=10 · 서버 CPU 부담 ~10ms 수준 · brute-force 저항 충분.
 */
@Injectable()
export class PasswordService {
  private static readonly ROUNDS = 10;

  /** 평문 비번 → bcrypt 해시. null/빈문자열은 null 반환 (nullable 컬럼 대응). */
  async hash(plain: string | null | undefined): Promise<string | null> {
    if (plain === null || plain === undefined || plain === '') return null;
    return hash(plain, PasswordService.ROUNDS);
  }

  /** 평문 vs 해시 비교 · 상수 시간. */
  async verify(plain: string, hashed: string | null | undefined): Promise<boolean> {
    if (!plain || !hashed) return false;
    return compare(plain, hashed);
  }

  /** 값이 bcrypt 해시인지 판별 ($2a$, $2b$, $2y$ prefix). 마이그레이션 분기용. */
  isHashed(value: string | null | undefined): boolean {
    if (!value || typeof value !== 'string') return false;
    return /^\$2[aby]\$\d{2}\$/.test(value);
  }
}
