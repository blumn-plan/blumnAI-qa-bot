"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UserState {
  /** 닉네임 (예: "제이") · 표시명 은 formatDisplayName 으로 role 과 조합 */
  name: string;
  /** 맡은 업무 (예: "기획팀") · 비워두면 표시명은 name 만 */
  role: string;
  setUser: (name: string, role: string) => void;
}

/** 현재 사용자 (질문자 표시 · 기획전달 questioner 필드로 전달).
 *  localStorage persist. 익명은 "게스트" fallback.
 *  · 이름·역할을 별도 필드로 저장 · 표시할 때는 자동으로 "이름-역할" 로 결합. */
export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      name: "",
      role: "",
      setUser: (name, role) => set({ name: name.trim(), role: role.trim() }),
    }),
    { name: "blumnai-qa-user" },
  ),
);

/** 표시명 계산 · role 있으면 "이름-역할" · 없으면 "이름" · 이름 없으면 빈 문자열. */
export function formatDisplayName(name: string, role: string): string {
  const n = name.trim();
  const r = role.trim();
  if (!n) return "";
  if (!r) return n;
  return `${n}-${r}`;
}

/** 컴포넌트용 hook · store 구독 유지하면서 표시명 계산. */
export function useUserDisplayName(): string {
  const name = useUserStore((s) => s.name);
  const role = useUserStore((s) => s.role);
  return formatDisplayName(name, role);
}
