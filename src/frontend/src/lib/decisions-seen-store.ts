"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 기획전달 「확인/미확인」 상태 (localStorage · 팀 무관 path 단위).
 *  로직: status ∈ {applied, hold, rejected} 이고 path 가 seenPaths 에 없으면 「미확인」.
 *        사용자가 리스트에서 해당 항목 클릭 → seenPaths 에 추가 → 「확인」.
 *  status === "pending" 은 확인/미확인 개념 X (아직 대기중).  */
interface DecisionsSeenState {
  seenPaths: string[];
  markSeen: (path: string) => void;
  isUnread: (path: string, status: string) => boolean;
  clearAll: () => void;
}

export const useDecisionsSeenStore = create<DecisionsSeenState>()(
  persist(
    (set, get) => ({
      seenPaths: [],
      markSeen: (path) =>
        set((s) => (s.seenPaths.includes(path) ? s : { seenPaths: [...s.seenPaths, path] })),
      isUnread: (path, status) => {
        if (status === "pending" || status === "unknown") return false;
        return !get().seenPaths.includes(path);
      },
      clearAll: () => set({ seenPaths: [] }),
    }),
    { name: "blumnai-qa-decisions-seen" },
  ),
);
