"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 현재 활성 팀 slug 를 클라이언트 상태로 유지.
 *  localStorage 에 저장 → 새 탭에서도 마지막 팀 자동 복원.
 *  URL ?team=X 우선 → localStorage 값 override. */
interface TeamState {
  activeTeamSlug: string | null;
  setActiveTeam: (slug: string | null) => void;
}

export const useTeamStore = create<TeamState>()(
  persist(
    (set) => ({
      activeTeamSlug: null,
      setActiveTeam: (slug) => set({ activeTeamSlug: slug }),
    }),
    { name: "blumnai-qa-active-team" },
  ),
);

/** URL 에서 team 파라미터 읽어서 store 초기화 · store 상태를 URL 에 반영. */
export function syncTeamFromUrl() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const urlTeam = params.get("team");
  if (urlTeam) {
    useTeamStore.getState().setActiveTeam(urlTeam);
  }
}
