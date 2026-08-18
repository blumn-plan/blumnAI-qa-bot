"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 최근 대화 세션 (브라우저 localStorage 저장 · 팀별 필터).
 *  Cloudflare 시대 qa-collab.html 의 「📜 최근 대화 (브라우저별)」 이식. */
export interface ChatSessionMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: Array<{ mediaType: string; data: string }>;
}

export interface ChatSession {
  id: string;
  teamSlug: string;
  /** 첫 사용자 질문에서 파생 (60자 truncate) */
  title: string;
  messages: ChatSessionMessage[];
  createdAt: string; // ISO
  updatedAt: string; // ISO
  /** 참고: 답변 근거 · 종합모드 또는 특정 문서 title */
  scope?: string;
  /** 문의한 사용자 이름 (user-store 의 userName) · 「내것만」 필터용 */
  requester?: string;
}

interface ChatSessionsState {
  sessions: ChatSession[];
  /** 현재 챗 패널에서 활성화된 세션 id · null 이면 신규 대화 상태 */
  currentSessionId: string | null;
  /** 새 문의 요청 시퀀스. 사이드바 「새 문의」 버튼 클릭 → 증가.
   *  챗 패널이 이 값 변화를 구독해서 messages 리셋. */
  newChatNonce: number;
  /** 세션 upsert. id 없으면 새 id 생성 후 반환. 있으면 기존 세션 갱신. */
  upsert: (
    input: Omit<ChatSession, "id" | "createdAt" | "updatedAt"> & { id?: string | null },
  ) => string;
  remove: (id: string) => void;
  clearForTeam: (teamSlug: string) => void;
  /** 사이드바에서 세션 클릭 → chat panel 이 이 값 구독해서 load */
  setCurrent: (id: string | null) => void;
  /** 새 문의 요청 · currentSessionId null 리셋 + nonce 증가 */
  requestNewChat: () => void;
  /** 팀 필터 · updatedAt desc 정렬 */
  listByTeam: (teamSlug: string) => ChatSession[];
}

function genId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function truncateTitle(text: string, max = 60): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max) + "…";
}

export const useChatSessionsStore = create<ChatSessionsState>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,
      newChatNonce: 0,
      upsert: (input) => {
        const now = new Date().toISOString();
        const id = input.id ?? genId();
        set((state) => {
          const existing = state.sessions.find((s) => s.id === id);
          if (existing) {
            return {
              sessions: state.sessions.map((s) =>
                s.id === id
                  ? {
                      ...s,
                      messages: input.messages,
                      title: input.title || s.title,
                      scope: input.scope ?? s.scope,
                      updatedAt: now,
                    }
                  : s,
              ),
            };
          }
          // 신규 세션. 팀별 상한 (100건) 초과 시 가장 오래된 것 제거
          const next: ChatSession = {
            id,
            teamSlug: input.teamSlug,
            title: input.title || "(제목 없음)",
            messages: input.messages,
            scope: input.scope,
            createdAt: now,
            updatedAt: now,
          };
          const forThis = state.sessions.filter((s) => s.teamSlug === input.teamSlug);
          const others = state.sessions.filter((s) => s.teamSlug !== input.teamSlug);
          const sorted = [next, ...forThis].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
          const kept = sorted.slice(0, 100);
          return { sessions: [...others, ...kept] };
        });
        return id;
      },
      remove: (id) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
          currentSessionId: state.currentSessionId === id ? null : state.currentSessionId,
        })),
      clearForTeam: (teamSlug) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.teamSlug !== teamSlug),
          currentSessionId: null,
        })),
      setCurrent: (id) => set({ currentSessionId: id }),
      requestNewChat: () =>
        set((state) => ({ currentSessionId: null, newChatNonce: state.newChatNonce + 1 })),
      listByTeam: (teamSlug) =>
        get()
          .sessions.filter((s) => s.teamSlug === teamSlug)
          .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    }),
    {
      name: "blumnai-qa-chat-sessions",
      // 이미지 첨부(base64)까지 저장하면 quota 폭발 가능성 → 저장 시 attachments 는 drop
      partialize: (state) => ({
        sessions: state.sessions.map((s) => ({
          ...s,
          messages: s.messages.map((m) => {
            const copy = { ...m } as ChatSessionMessage;
            delete copy.attachments;
            return copy;
          }),
        })),
        currentSessionId: state.currentSessionId,
        // newChatNonce 는 세션 nonce · persist 대상 X (매 로드시 0 부터)
      }),
      version: 1,
    },
  ),
);

/** helper: title 생성 · 사용자 첫 메시지 기반 */
export function deriveSessionTitle(messages: ChatSessionMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user" && m.content.trim());
  if (!firstUser) return "(제목 없음)";
  return truncateTitle(firstUser.content);
}
