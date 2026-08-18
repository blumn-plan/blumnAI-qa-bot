"use client";
import { create } from "zustand";

/** 기획자 모드 인증 상태 (팀별 · 세션 단위 sessionStorage persist).
 *  브라우저 탭 닫으면 사라짐 (일부러 · 보안). 새 탭에선 다시 인증 필요.
 *  zustand persist middleware 대신 수동 sessionStorage 접근 사용
 *  (persist 는 localStorage 만 편하고 session 은 별도 처리 필요). */
const SS_KEY = "blumnai-qa-planner-auth";

interface PlannerAuthState {
  /** 인증된 팀 slug 의 Set. sessionStorage 에 JSON array 로 저장. */
  authed: string[];
  isAuthed: (teamSlug: string) => boolean;
  authorize: (teamSlug: string) => void;
  revoke: (teamSlug: string) => void;
}

function loadFromSession(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(SS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function saveToSession(authed: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SS_KEY, JSON.stringify(authed));
  } catch {
    /* quota exceeded 등 · 무시 */
  }
}

export const usePlannerAuthStore = create<PlannerAuthState>((set, get) => ({
  authed: loadFromSession(),
  isAuthed: (teamSlug) => get().authed.includes(teamSlug),
  authorize: (teamSlug) => set((s) => {
    if (s.authed.includes(teamSlug)) return {};
    const next = [...s.authed, teamSlug];
    saveToSession(next);
    return { authed: next };
  }),
  revoke: (teamSlug) => set((s) => {
    const next = s.authed.filter((t) => t !== teamSlug);
    saveToSession(next);
    return { authed: next };
  }),
}));
