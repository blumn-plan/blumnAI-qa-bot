"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 월별 토큰 사용량 집계 (팀 단위 · localStorage persist).
 *  Anthropic 스트리밍 응답의 usage 이벤트를 캡처해서 누적.
 *  1 token ≈ ₩0.005 (러프 추정치 · Sonnet 4.6 input+output 평균).
 *
 *  key: `${teamSlug}:${YYYY-MM}` → { in, out, cacheRead, cacheCreate } */
export interface UsageEntry {
  in: number;
  out: number;
  cacheRead: number;
  cacheCreate: number;
}

interface UsageState {
  byMonth: Record<string, UsageEntry>;
  add: (teamSlug: string, delta: Partial<UsageEntry>) => void;
  getMonthly: (teamSlug: string, ym?: string) => UsageEntry;
  reset: (teamSlug: string, ym?: string) => void;
}

function monthKey(teamSlug: string, ym?: string) {
  const key = ym ?? new Date().toISOString().slice(0, 7);
  return `${teamSlug}:${key}`;
}

const empty: UsageEntry = { in: 0, out: 0, cacheRead: 0, cacheCreate: 0 };

export const useUsageStore = create<UsageState>()(
  persist(
    (set, get) => ({
      byMonth: {},
      add: (teamSlug, delta) => {
        const key = monthKey(teamSlug);
        set((s) => {
          const cur = s.byMonth[key] ?? { ...empty };
          return {
            byMonth: {
              ...s.byMonth,
              [key]: {
                in: cur.in + (delta.in ?? 0),
                out: cur.out + (delta.out ?? 0),
                cacheRead: cur.cacheRead + (delta.cacheRead ?? 0),
                cacheCreate: cur.cacheCreate + (delta.cacheCreate ?? 0),
              },
            },
          };
        });
      },
      getMonthly: (teamSlug, ym) => get().byMonth[monthKey(teamSlug, ym)] ?? { ...empty },
      reset: (teamSlug, ym) => {
        const key = monthKey(teamSlug, ym);
        set((s) => {
          const next = { ...s.byMonth };
          delete next[key];
          return { byMonth: next };
        });
      },
    }),
    { name: "blumnai-qa-usage" },
  ),
);

/** UsageEntry → 대략 원화 계산.
 *  Sonnet 4.6 정가: input $3/M, output $15/M, cache read $0.3/M.
 *  환율 ~1400원 → input 4.2원/1K, output 21원/1K, cache 0.42원/1K
 *  → 러프 평균 5원/1K token = ₩0.005/token. */
export function estimateKrw(u: UsageEntry): number {
  return Math.round(
    (u.in * 0.0042) + (u.out * 0.021) + (u.cacheRead * 0.00042) + (u.cacheCreate * 0.00525),
  );
}

/** 총 토큰 수 (input+output · cache 미포함). */
export function totalTokens(u: UsageEntry): number {
  return u.in + u.out;
}

/** 사람이 읽기 좋은 토큰 표기 — 146700 → "146.7K". */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

/** 원화 표기 — 소액은 소수점, 100원 이상은 콤마. */
export function formatKrw(krw: number): string {
  if (krw < 0.1) return `₩${krw.toFixed(3)}`;
  if (krw < 1) return `₩${krw.toFixed(2)}`;
  if (krw < 100) return `₩${krw.toFixed(1)}`;
  return `₩${Math.round(krw).toLocaleString()}`;
}
