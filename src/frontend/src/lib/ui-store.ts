"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 클라이언트 UI 상태 (팀 무관 · 사용자 세션 단위 persist).
 *  - activeProject: 사이드바에서 선택된 프로젝트 slug (팀 변경 시 리셋)
 *  - useAllDocs: 🌐 전체 정책 종합 모드 (ON 이면 특정 문서 대신 프로젝트 전체 참고)
 *  - docSearch: 사이드바 문서 검색 필터
 *  - viewMode: 기획전달/답변규칙 리스트 스코프 (내것만 · 전체) */
interface UiState {
  activeProject: string | null;
  useAllDocs: boolean;
  docSearch: string;
  viewMode: "mine" | "all";
  /** ✅ 명시적으로 체크된 QA 참고 문서 경로 리스트 (뷰어 focus 와 완전 분리).
   *  ≥1개 → 그 문서들만 근거로 QA · 0개 → useAllDocs 켜기 전엔 질문 불가. */
  selectedDocPaths: string[];
  setActiveProject: (p: string | null) => void;
  setUseAllDocs: (v: boolean) => void;
  toggleUseAllDocs: () => void;
  setDocSearch: (q: string) => void;
  setViewMode: (m: "mine" | "all") => void;
  toggleDocSelected: (path: string) => void;
  /** 문서 클릭 시 참고 문서로 idempotent 추가 (이미 있으면 skip · 절대 uncheck 안 됨).
   *  체크박스 uncheck 는 toggleDocSelected 로만 가능. */
  addDocSelected: (path: string) => void;
  clearSelectedDocs: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeProject: null,
      useAllDocs: false,
      docSearch: "",
      viewMode: "mine",
      selectedDocPaths: [],
      setActiveProject: (p) => set({ activeProject: p, selectedDocPaths: [] }),
      setUseAllDocs: (v) => set({ useAllDocs: v }),
      toggleUseAllDocs: () => set((s) => ({ useAllDocs: !s.useAllDocs })),
      setDocSearch: (q) => set({ docSearch: q }),
      setViewMode: (m) => set({ viewMode: m }),
      toggleDocSelected: (path) =>
        set((s) => {
          const has = s.selectedDocPaths.includes(path);
          return {
            selectedDocPaths: has
              ? s.selectedDocPaths.filter((p) => p !== path)
              : [...s.selectedDocPaths, path],
          };
        }),
      addDocSelected: (path) =>
        set((s) => (s.selectedDocPaths.includes(path) ? s : { selectedDocPaths: [...s.selectedDocPaths, path] })),
      clearSelectedDocs: () => set({ selectedDocPaths: [] }),
    }),
    {
      name: "blumnai-qa-ui-state",
      partialize: (s) => ({
        activeProject: s.activeProject,
        useAllDocs: s.useAllDocs,
        viewMode: s.viewMode,
        selectedDocPaths: s.selectedDocPaths,
      }),
    },
  ),
);
