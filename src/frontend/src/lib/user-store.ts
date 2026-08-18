"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UserState {
  name: string;
  setName: (name: string) => void;
}

/** 현재 사용자 이름 (질문자 표시 · 기획전달 questioner 필드로 전달).
 *  localStorage persist. 익명은 "게스트" fallback. */
export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      name: "",
      setName: (name) => set({ name: name.trim() }),
    }),
    { name: "blumnai-qa-user" },
  ),
);
