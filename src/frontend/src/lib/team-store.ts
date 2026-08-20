"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 현재 활성 팀 slug 를 클라이언트 상태로 유지.
 *  localStorage 에 저장 → 새 탭에서도 마지막 팀 자동 복원.
 *  URL ?team=X 우선 → localStorage 값 override (page 컴포넌트에서 처리).
 *
 *  _hasHydrated: persist 하이드레이션 완료 flag. 이 값이 true 되기 전엔
 *  activeTeamSlug 가 아직 localStorage 에서 안 읽혔을 수 있으므로 wizard 자동 오픈 등
 *  결정로직은 반드시 이 flag 를 체크해야 함 (리로드 시 wizard 오픈 flash 방지). */
interface TeamState {
  activeTeamSlug: string | null;
  _hasHydrated: boolean;
  setActiveTeam: (slug: string | null) => void;
  setHydrated: (v: boolean) => void;
}

export const useTeamStore = create<TeamState>()(
  persist(
    (set) => ({
      activeTeamSlug: null,
      _hasHydrated: false,
      setActiveTeam: (slug) => set({ activeTeamSlug: slug }),
      setHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: "blumnai-qa-active-team",
      partialize: (s) => ({ activeTeamSlug: s.activeTeamSlug }),
      onRehydrateStorage: () => (state) => {
        if (state) state.setHydrated(true);
      },
    },
  ),
);
