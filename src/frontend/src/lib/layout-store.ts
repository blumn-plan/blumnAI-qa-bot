"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 3단 그리드 (사이드바 · 문서뷰어 · 챗패널) 의 좌·우 컬럼 폭 · localStorage persist */
interface LayoutState {
  sidebarWidth: number; // px · 좌측 사이드바
  chatWidth: number; // px · 우측 챗패널
  setSidebarWidth: (w: number) => void;
  setChatWidth: (w: number) => void;
  reset: () => void;
}

const DEFAULTS = {
  sidebarWidth: 280,
  chatWidth: 460,
};

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 480;
const CHAT_MIN = 340;
const CHAT_MAX = 720;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v)));
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setSidebarWidth: (w) => set({ sidebarWidth: clamp(w, SIDEBAR_MIN, SIDEBAR_MAX) }),
      setChatWidth: (w) => set({ chatWidth: clamp(w, CHAT_MIN, CHAT_MAX) }),
      reset: () => set(DEFAULTS),
    }),
    { name: "blumnai-qa-layout", version: 1 },
  ),
);

export const LAYOUT_LIMITS = { SIDEBAR_MIN, SIDEBAR_MAX, CHAT_MIN, CHAT_MAX };
