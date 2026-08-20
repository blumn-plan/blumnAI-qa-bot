"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  RotateCcw,
  Download,
  Gift,
  FileCode2,
  Send,
  NotebookPen,
  HelpCircle,
  StopCircle,
  Paperclip,
  MessageCircle,
  Globe,
  FileText as FileTextIcon,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { streamQa, DocEntry, ApiError } from "@/lib/api";
import { MarkdownView } from "@/components/markdown-view";
import { ForwardDialog, FeedbackDialog } from "@/components/action-dialogs";
import { MockupDialog } from "@/components/mockup-dialog";
import { buildForwardDraft, parseChangeProposal } from "@/lib/change-proposal";
import { useUiStore } from "@/lib/ui-store";
import { useUsageStore, estimateKrw, formatTokens, formatKrw } from "@/lib/usage-store";
import { useUserStore } from "@/lib/user-store";
import { useChatSessionsStore, deriveSessionTitle } from "@/lib/chat-sessions-store";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  error?: string;
  attachments?: Array<{ mediaType: string; data: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

interface ChatPanelProps {
  teamSlug: string;
  activeDoc: DocEntry | null;
  /** 봇 개선 제안 GitHub issue 링크용 · 없으면 버튼 숨김 */
  githubRepo?: string;
  /** 답변 내 정책 링크 클릭 시 좌측 문서 뷰어를 그 문서로 전환하는 콜백 */
  onOpenDoc?: (path: string, hash?: string) => void;
  /** §X-Y 클릭 → 도큐 뷰어에서 해당 위치로 스크롤 */
  onCitation?: (anchor: string) => void;
}

export function ChatPanel({ teamSlug, activeDoc, githubRepo, onOpenDoc, onCitation }: ChatPanelProps) {
  const useAllDocs = useUiStore((s) => s.useAllDocs);
  const setUseAllDocs = useUiStore((s) => s.setUseAllDocs);
  const activeProject = useUiStore((s) => s.activeProject);
  const setActiveProject = useUiStore((s) => s.setActiveProject);
  const selectedDocPaths = useUiStore((s) => s.selectedDocPaths);
  const setSelectedDocs = useUiStore((s) => s.setSelectedDocs);
  const clearSelectedDocs = useUiStore((s) => s.clearSelectedDocs);
  const addUsage = useUsageStore((s) => s.add);
  const userName = useUserStore((s) => s.name);
  const upsertSession = useChatSessionsStore((s) => s.upsert);
  const currentSessionId = useChatSessionsStore((s) => s.currentSessionId);
  const allSessions = useChatSessionsStore((s) => s.sessions);
  const newChatNonce = useChatSessionsStore((s) => s.newChatNonce);
  const requestNewChat = useChatSessionsStore((s) => s.requestNewChat);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Array<{ mediaType: string; data: string }>>([]);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [mockupOpen, setMockupOpen] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 스코프: all (종합모드) → multi (체크박스 명시 선택) → none (미선택)
  //  · 뷰어에 열린 문서(activeDoc)는 "읽기용" 이지 참고 문서 자동 지정 X → 사용자가 사이드바 체크박스로 명시 선택해야 함.
  //  · 이렇게 해야 "문서 클릭=뷰어 열기" vs "체크박스=문의 근거로 지정" 두 액션이 명확히 분리됨.
  const scope: "all" | "multi" | "none" =
    useAllDocs ? "all" : selectedDocPaths.length > 0 ? "multi" : "none";

  // 새 메시지가 오면 자동 스크롤 (instant · 세션 로드 시 smooth 애니메이션으로 상단부터 훑고 내려오는 문제 방지)
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // 성공 배너 3초 후 자동 사라짐
  useEffect(() => {
    if (!successBanner) return;
    const t = setTimeout(() => setSuccessBanner(null), 3500);
    return () => clearTimeout(t);
  }, [successBanner]);

  // 사이드바에서 최근 대화 클릭 → currentSessionId 변경 → 여기서 messages + 참고 스코프 복원
  //  · 새 세션 (필드 저장됨) → 저장된 useAllDocs/docPaths/project 그대로 복원
  //  · 옛 세션 (필드 없음, undefined) → 대화 내용 있으면 useAllDocs=true fallback (챗 패널 뜨고 이어서 질문 가능)
  //  · 옛 빈 세션 (messages 0개) → fallback 없음 · 사용자가 사이드바에서 명시적으로 선택
  useEffect(() => {
    if (!currentSessionId) return;
    if (currentSessionId === sessionId) return; // 이미 로드된 세션
    const target = allSessions.find((s) => s.id === currentSessionId);
    if (!target || target.teamSlug !== teamSlug) return;
    setMessages(
      target.messages.map((m) => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments,
      })),
    );
    setSessionId(currentSessionId);
    setPendingAttachments([]);
    // 참고 스코프 복원
    if (target.project !== undefined) setActiveProject(target.project);
    if (target.useAllDocs !== undefined) {
      setUseAllDocs(target.useAllDocs);
    } else if (target.messages.length > 0) {
      // 옛 세션 fallback: 스코프 정보 없지만 대화 있음 → 종합모드 켜서 챗 패널 노출 + 이어서 질문 가능
      setUseAllDocs(true);
    }
    if (target.docPaths !== undefined) setSelectedDocs(target.docPaths);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId, teamSlug]);

  // 사용자 메시지가 하나라도 있으면 즉시 세션 저장 (진행 중이어도 사이드바 문의 목록에 표시).
  //  답변 완료 조건은 없음 → 첫 질문 즉시 사이드바에 새 항목이 뜨고 · 답변이 오면 업데이트.
  //  streaming 중인 assistant 메시지는 persistable 에서 제외 (스트림 중 저장 시 빈 content 유입 방지).
  useEffect(() => {
    if (messages.length === 0) return;
    const hasUserMessage = messages.some((m) => m.role === "user" && m.content.trim());
    if (!hasUserMessage) return;
    const persistable = messages
      .filter((m) => !m.streaming)
      .map((m) => ({ role: m.role, content: m.content, attachments: m.attachments }));
    const title = deriveSessionTitle(persistable);
    const scopeLabel = useAllDocs
      ? "🌐 종합"
      : selectedDocPaths.length > 0
        ? `📄 선택 ${selectedDocPaths.length}개`
        : undefined;
    const id = upsertSession({
      id: sessionId,
      teamSlug,
      title,
      messages: persistable,
      scope: scopeLabel,
      useAllDocs,
      docPaths: selectedDocPaths,
      project: activeProject ?? undefined,
      requester: userName || undefined,
    });
    if (!sessionId) setSessionId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  /** 실제 QA 스트리밍 실행 · handleSend/handleRegenerate 공용.
   *  priorMessages: 새 유저 질문 이전까지의 히스토리 (백엔드 history 로 전송) */
  async function runStream(
    userMsg: ChatMessage,
    priorMessages: ChatMessage[],
  ) {
    if (scope === "none") return;
    setSending(true);
    setMessages([
      ...priorMessages,
      userMsg,
      { role: "assistant", content: "", streaming: true },
    ]);
    abortRef.current = new AbortController();
    try {
      await streamQa(
        teamSlug,
        {
          question: userMsg.content,
          // 종합모드 → 모든 선택 무시 · 아니면 체크박스로 명시 선택한 docPaths 사용.
          //  뷰어의 activeDoc 은 참고 문서로 자동 승격 X (사용자 명시 액션만 인정)
          docPath: undefined,
          docPaths: !useAllDocs && selectedDocPaths.length > 0 ? selectedDocPaths : undefined,
          project: activeProject ?? undefined,
          history: priorMessages
            .filter((m) => !m.streaming && !m.error)
            .map((m) => ({ role: m.role, content: m.content })),
          attachments: userMsg.attachments ?? [],
        },
        (evt) => {
          if (evt.type === "text" && evt.content) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") last.content += evt.content;
              return next;
            });
          } else if (evt.type === "usage" && evt.usage) {
            const u = evt.usage as ChatMessage["usage"];
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") last.usage = u;
              return next;
            });
            // 이달 사용량 누적 (헤더 배지 · 팀별)
            addUsage(teamSlug, {
              in: u?.input_tokens ?? 0,
              out: u?.output_tokens ?? 0,
              cacheRead: u?.cache_read_input_tokens ?? 0,
              cacheCreate: u?.cache_creation_input_tokens ?? 0,
            });
          } else if (evt.type === "done") {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") last.streaming = false;
              return next;
            });
          } else if (evt.type === "error") {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                last.streaming = false;
                last.error = String(evt.error);
              }
              return next;
            });
          }
        },
        abortRef.current.signal,
      );
    } catch (err) {
      // 사용자가 [중지] 클릭 → AbortError 는 정상 종료로 취급 (에러 표시 X · 부분 답변 유지)
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          last.streaming = false;
          if (!isAbort) last.error = err instanceof ApiError ? err.message : String(err);
        }
        return next;
      });
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }

  async function handleSend() {
    if ((!input.trim() && pendingAttachments.length === 0) || sending) return;
    if (scope === "none") return;
    const userMsg: ChatMessage = {
      role: "user",
      content: input.trim(),
      attachments: pendingAttachments,
    };
    setInput("");
    setPendingAttachments([]);
    await runStream(userMsg, messages);
  }

  /** 특정 assistant 메시지를 [🔄 재답변] · 직전 user 메시지 유지, 그 이후는 버리고 재요청. */
  async function handleRegenerate(assistantIdx: number) {
    if (sending) return;
    // 직전 user 메시지 찾기 (일반적으로 assistantIdx-1)
    let userIdx = assistantIdx - 1;
    while (userIdx >= 0 && messages[userIdx].role !== "user") userIdx -= 1;
    if (userIdx < 0) return; // 짝 없는 assistant · abort
    const priorMessages = messages.slice(0, userIdx);
    const userMsg = messages[userIdx];
    await runStream(userMsg, priorMessages);
  }

  async function handleCopy(idx: number) {
    const msg = messages[idx];
    if (!msg || !msg.content) return;
    try {
      await navigator.clipboard.writeText(msg.content);
      setSuccessBanner("답변 복사됨");
    } catch {
      /* clipboard 실패 무시 */
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  /** 「새 문의」 — 사이드바 · 헤더 · 인라인 버튼이 모두 이 흐름으로 통합.
   *  store.requestNewChat() 이 빈 세션 생성 + current 로 설정 → 아래 currentSessionId useEffect 가 messages/sessionId 갱신.
   *  이 useEffect (newChatNonce) 는 세션과 무관한 상태만 리셋 (참고 문서·종합모드·배너). */
  function handleNewChat() {
    requestNewChat({ teamSlug, requester: userName || undefined });
  }

  // newChatNonce 증가 → 참고 문서 · 종합모드 리셋 + 안내 배너.
  //  · messages/sessionId 리셋은 store 가 currentSessionId 를 새 빈 세션으로 바꾸므로 currentSessionId useEffect 가 담당.
  //  · 초기 mount 시엔 nonce=0 이라 useRef 로 첫 실행 무시
  const firstNonceRun = useRef(true);
  useEffect(() => {
    if (firstNonceRun.current) {
      firstNonceRun.current = false;
      return;
    }
    clearSelectedDocs();
    setUseAllDocs(false);
    setSuccessBanner("새 문의를 시작했어요 · 왼쪽에서 참고 문서를 다시 골라 질문하세요");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newChatNonce]);

  /** 💾 대화 내보내기 — 현재 messages 를 markdown 파일로 다운로드 */
  function handleExport() {
    if (messages.length === 0) return;
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const scopeHeader = useAllDocs
      ? "🌐 전체 정책 종합"
      : selectedDocPaths.length > 0
        ? `📄 선택 ${selectedDocPaths.length}개\n${selectedDocPaths.map((p) => `    - ${p}`).join("\n")}`
        : "(미선택)";
    const header = `# QA 대화 · ${ts}\n\n- 팀: ${teamSlug}\n- 근거: ${scopeHeader}\n- 질문자: ${userName || "(이름 미설정)"}\n\n---\n\n`;
    const body = messages
      .filter((m) => !m.streaming && !m.error)
      .map((m) => `## ${m.role === "user" ? "🙋 나" : "🤖 제이나미AI"}\n\n${m.content}`)
      .join("\n\n---\n\n");
    const md = header + body + "\n";
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qa-conversation-${ts}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** 🎁 봇 기능 개선 제안 — GitHub Issue 새 탭 오픈 */
  function handleCoreIdea() {
    if (!githubRepo) return;
    const url = new URL(`https://github.com/${githubRepo}/issues/new`);
    url.searchParams.set("title", "[봇 개선 제안] ");
    url.searchParams.set(
      "body",
      `## 무엇을 개선하면 좋을지\n\n(기능·버그·UI 등 자유롭게)\n\n## 왜\n\n(사용 중 겪은 상황)\n\n---\n_from: ${userName || "게스트"} · 팀 ${teamSlug}_`,
    );
    url.searchParams.set("labels", "qa-bot,feedback");
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }

  // 이미지 첨부 — Ctrl+V 붙여넣기 or 파일 선택
  async function handleFiles(files: FileList | File[] | null | undefined) {
    if (!files) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    const encoded = await Promise.all(
      arr.map(async (f) => {
        const buf = await f.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        return { mediaType: f.type, data: base64 };
      }),
    );
    setPendingAttachments((prev) => [...prev, ...encoded]);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (!e.clipboardData?.files?.length) return;
    handleFiles(e.clipboardData.files);
  }

  // AI 마지막 답변 = 기획전달/답변규칙 초안으로 활용
  const lastAssistantContent = [...messages].reverse().find((m) => m.role === "assistant" && !m.streaming && !m.error)?.content ?? "";
  // 기획전달 다이얼로그용 · 클릭 시점의 대화에서 구조화된 초안 생성 (📋 변경 제안 있으면 우선)
  const forwardDraft = useMemo(
    () => buildForwardDraft(messages, activeDoc?.title ?? ""),
    [messages, activeDoc?.title],
  );
  // AI 답변에 「📋 변경 제안」 블록이 있는지 · 있으면 기획전달 버튼 강조
  const hasProposalSignal = useMemo(
    () => Boolean(lastAssistantContent && parseChangeProposal(lastAssistantContent)),
    [lastAssistantContent],
  );

  // 현재 로드된 세션의 title (사이드바 최근 대화 클릭 시 표시)
  const currentSession = useMemo(
    () => (sessionId ? allSessions.find((s) => s.id === sessionId) : null),
    [sessionId, allSessions],
  );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 상단 헤더 · 카드형 · 2줄 구조 — "지금 뭘 문의하고 있는가" 를 최우선으로 보여줌
       *  · 1줄: 큰 title (현재 문의 / 새 문의) + [+ 새 문의] primary 버튼
       *  · 2줄: 참고 문서(컨텍스트) — 부수 정보로 작게 · 라벨 "참고 문서:" 로 관계 명시 */}
      <div className="border-b border-slate-200 bg-gradient-to-b from-indigo-50/50 to-white px-4 py-3 shrink-0 min-w-0">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="mt-0.5 w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <MessageCircle className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600/70 shrink-0">
                {currentSession ? "현재 문의" : messages.length > 0 ? "진행 중" : "새 문의"}
              </div>
              <div className="flex-1" />
              <Button
                type="button"
                size="sm"
                onClick={handleNewChat}
                disabled={messages.length === 0 && scope === "none"}
                className="h-7 gap-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:bg-slate-200 disabled:text-slate-400 shrink-0"
                title="새 문의 시작 — 지금 대화와 참고 문서 선택을 리셋하고 처음부터 새 질문 시작"
              >
                <RotateCcw className="w-3 h-3" /> 새 문의
              </Button>
            </div>
            <div className="text-[15px] font-semibold text-slate-900 truncate mt-0.5" title={currentSession?.title}>
              {currentSession
                ? currentSession.title
                : messages.length > 0
                  ? "제목은 첫 답변 완료 후 자동 생성돼요"
                  : "왼쪽에서 참고 문서를 고르고 아래 입력창에 질문하세요"}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1 min-w-0">
              <span className="shrink-0 text-slate-400">참고 문서:</span>
              {scope === "all" && (
                <span className="inline-flex items-center gap-1 text-indigo-700 font-medium shrink-0">
                  <Globe className="w-3 h-3" /> 전체 정책 종합
                </span>
              )}
              {scope === "multi" && (
                <span
                  className="inline-flex items-center gap-1 text-emerald-700 font-medium shrink-0"
                  title={`선택된 문서:\n${selectedDocPaths.join("\n")}`}
                >
                  <FileTextIcon className="w-3 h-3 shrink-0" /> 선택 {selectedDocPaths.length}개
                  <button
                    type="button"
                    onClick={clearSelectedDocs}
                    className="ml-1 text-slate-400 hover:text-red-600 underline underline-offset-2"
                    title="선택 초기화"
                  >
                    초기화
                  </button>
                </span>
              )}
              {scope === "none" && (
                <span className="inline-flex items-center gap-1 text-amber-700 font-medium shrink-0">
                  <AlertCircle className="w-3 h-3" /> 왼쪽에서 참고 문서를 체크하거나 [🌐 전체 종합] 을 켜세요
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {successBanner && (
        <div className="border-b bg-green-50 text-green-800 text-xs px-3 py-2">
          ✅ {successBanner}
        </div>
      )}

      {/* 참고 문서 미선택 시 명시적 안내 배너 · 단계별 진행 강조
       *  · 좌측 사이드바 [체크박스] 또는 [🌐 전체 정책 종합] 을 켜기 전엔 입력창 비활성 */}
      {scope === "none" && messages.length === 0 && (
        <div className="border-b bg-amber-50 text-amber-900 text-[12px] px-4 py-2.5 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <div className="leading-relaxed">
            <b>먼저 문의 근거를 골라주세요</b>
            <span className="text-amber-700"> · 왼쪽 </span>
            <b>참고 문서</b>
            <span className="text-amber-700"> 섹션에서 체크박스로 문서를 선택하거나 </span>
            <b>🌐 전체 정책 종합</b>
            <span className="text-amber-700"> 을 켜야 질문할 수 있어요.</span>
          </div>
        </div>
      )}

      {/* 대화 영역 */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.length === 0 && (
          <WelcomeGuide useAllDocs={useAllDocs} onEnableAllDocs={() => setUseAllDocs(true)} />
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg text-sm ${
              msg.role === "user" ? "bg-indigo-100 ml-8" : "bg-white border mr-8"
            }`}
          >
            <div className="text-xs font-semibold mb-1 flex items-center gap-1.5">
              <span>{msg.role === "user" ? "🙋 나" : "🤖 제이나미AI"}</span>
              {msg.role === "assistant" && msg.streaming && (
                <span className="inline-flex items-center gap-1 text-[10px] font-normal text-emerald-700">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
                  {msg.content ? "답변 중" : "생각하는 중"}
                </span>
              )}
            </div>
            {msg.role === "user" ? (
              <div className="whitespace-pre-wrap break-words">
                {msg.content}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {msg.attachments.map((a, ai) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={ai}
                        src={`data:${a.mediaType};base64,${a.data}`}
                        alt="첨부"
                        className="max-w-[200px] max-h-[150px] rounded border"
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {msg.content ? (
                  <MarkdownView content={msg.content} onDocLink={onOpenDoc} onCitation={onCitation} stripImages stripChangeProposal />
                ) : msg.streaming ? (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
                    <span className="inline-flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce-dot" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce-dot" style={{ animationDelay: "160ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce-dot" style={{ animationDelay: "320ms" }} />
                    </span>
                    문서를 살펴보는 중입니다...
                  </span>
                ) : null}
                {msg.streaming && msg.content && <span className="inline-block ml-1 animate-pulse">▊</span>}
              </>
            )}
            {msg.error && (
              <div className="text-xs text-red-600 mt-2 border-t pt-2">
                ⚠️ 에러: {msg.error}
              </div>
            )}
            {/* AI 메시지: 완료된 답변에만 [🔄 재답변][📋 복사] 노출 */}
            {msg.role === "assistant" && !msg.streaming && msg.content && !msg.error && (
              <div className="mt-2 pt-2 border-t flex gap-1 items-center">
                <button
                  type="button"
                  onClick={() => handleRegenerate(i)}
                  disabled={sending}
                  className="text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded px-1.5 py-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="이 답변을 다시 생성 (직전 질문 기준)"
                >
                  🔄 재답변
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(i)}
                  className="text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded px-1.5 py-0.5"
                  title="답변 본문을 클립보드로 복사"
                >
                  📋 복사
                </button>
                {msg.usage && (() => {
                  const input = msg.usage.input_tokens ?? 0;
                  const output = msg.usage.output_tokens ?? 0;
                  const cacheRead = msg.usage.cache_read_input_tokens ?? 0;
                  const cacheCreate = msg.usage.cache_creation_input_tokens ?? 0;
                  const totalInput = input + cacheRead + cacheCreate;
                  const krw = estimateKrw({ in: input, out: output, cacheRead, cacheCreate });
                  const cacheHint = cacheRead > 0 ? ` (캐시 ${formatTokens(cacheRead)})` : "";
                  const title = [
                    `─ 입력 breakdown ─`,
                    `· 신규 입력: ${input.toLocaleString()} tok`,
                    `· 캐시 읽기: ${cacheRead.toLocaleString()} tok`,
                    `· 캐시 쓰기: ${cacheCreate.toLocaleString()} tok`,
                    `· 총 입력: ${totalInput.toLocaleString()} tok`,
                    `─ 출력 ─`,
                    `· ${output.toLocaleString()} tok`,
                    `─ 원가 ─`,
                    `· ${formatKrw(krw)} (예상치)`,
                  ].join("\n");
                  return (
                    <span
                      className="ml-auto text-xs text-slate-500 font-mono cursor-help"
                      title={title}
                    >
                      🪙 입력 {formatTokens(totalInput)}{cacheHint} · 출력 {formatTokens(output)} · {formatKrw(krw)}
                    </span>
                  );
                })()}
              </div>
            )}
            {/* streaming 중이거나 error 인 경우 usage 만 별도 렌더 (버튼 없이) */}
            {msg.role === "assistant" && (msg.streaming || msg.error) && msg.usage && (() => {
              const input = msg.usage.input_tokens ?? 0;
              const output = msg.usage.output_tokens ?? 0;
              const cacheRead = msg.usage.cache_read_input_tokens ?? 0;
              const cacheCreate = msg.usage.cache_creation_input_tokens ?? 0;
              const totalInput = input + cacheRead + cacheCreate;
              const krw = estimateKrw({ in: input, out: output, cacheRead, cacheCreate });
              const cacheHint = cacheRead > 0 ? ` (캐시 ${formatTokens(cacheRead)})` : "";
              return (
                <div className="text-xs text-slate-500 mt-2 pt-2 border-t font-mono">
                  🪙 입력 {formatTokens(totalInput)}{cacheHint} · 출력 {formatTokens(output)} · {formatKrw(krw)}
                </div>
              );
            })()}
          </div>
        ))}
      </div>

      <div className="border-t p-3 bg-white">
        {/* CTA 라인 — 항상 노출 (원본 UX 유지) · 답변 없을 때는 기획전달만 회색 처리 */}
        <div className="text-[11px] text-slate-500 mb-2 px-0.5 flex items-center gap-1 flex-wrap">
          <span>개선 필요 시</span>
          <button
            type="button"
            onClick={() => setForwardOpen(true)}
            disabled={!lastAssistantContent}
            className={`inline-flex items-center gap-1 underline underline-offset-2 disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed ${
              hasProposalSignal
                ? "text-emerald-700 hover:text-emerald-900 font-semibold bg-emerald-50 border border-emerald-300 rounded px-1.5 py-0.5 no-underline"
                : "text-emerald-700 hover:text-emerald-900"
            }`}
            title={
              !lastAssistantContent
                ? "먼저 AI 답변을 받으세요"
                : hasProposalSignal
                  ? "AI가 정책 변경 제안을 만들었어요 · 클릭하면 초안이 자동으로 채워집니다"
                  : "지금까지 대화를 요약해서 기획자에게 전달"
            }
          >
            <Send className="w-3 h-3" /> 기획전달{hasProposalSignal ? " · 초안 준비됨" : ""}
          </button>
          <span>·</span>
          <span>추가로 물어보기:</span>
          <span className="text-slate-700">아래 입력창</span>
          <span>·</span>
          <span>끝났으면</span>
          <button
            type="button"
            onClick={handleNewChat}
            disabled={messages.length === 0}
            className="inline-flex items-center gap-1 text-indigo-700 underline underline-offset-2 hover:text-indigo-900 disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-3 h-3" /> 새 문의
          </button>
        </div>
        {pendingAttachments.length > 0 && (
          <div className="mb-2 flex gap-2 flex-wrap items-center">
            <span className="text-xs text-muted-foreground">첨부 예정:</span>
            {pendingAttachments.map((a, i) => (
              <div key={i} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:${a.mediaType};base64,${a.data}`}
                  alt="첨부 예정"
                  className="w-12 h-12 object-cover rounded border"
                />
                <button
                  type="button"
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-xs leading-none opacity-0 group-hover:opacity-100"
                  onClick={() => setPendingAttachments((prev) => prev.filter((_, ix) => ix !== i))}
                  title="첨부 취소"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {/* 액션 버튼 툴바 · 사용 빈도 기반 위계
         *  · 유틸 (icon-only, 약함): 내보내기 · 답변 규칙 · 개선 제안
         *  · 주요 CTA (컬러, 강조): HTML 목업 만들기 (indigo) · 기획전달 (green) */}
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          <IconOnlyButton
            onClick={handleExport}
            disabled={messages.length === 0}
            title="대화 내보내기 — 지금 대화를 markdown 파일로 다운로드"
          >
            <Download className="w-3.5 h-3.5" />
          </IconOnlyButton>
          <IconOnlyButton
            onClick={() => setFeedbackOpen(true)}
            title="답변 규칙 — AI 답변의 톤·형식·강조점 규칙 저장 (이후 답변에 자동 반영)"
          >
            <NotebookPen className="w-3.5 h-3.5" />
          </IconOnlyButton>
          {githubRepo && (
            <IconOnlyButton
              onClick={handleCoreIdea}
              title="봇 기능·버그·UI 개선 제안 → GitHub Issue 로 등록 (새 탭)"
            >
              <Gift className="w-3.5 h-3.5" />
            </IconOnlyButton>
          )}
          <FeedbackHelpTooltip />
          <div className="flex-1" />
          <Button
            size="sm"
            variant="default"
            onClick={() => setMockupOpen(true)}
            title={
              "🎨 HTML 목업 만들기 — 정책·이미지를 근거로 실제 화면 UI 를 즉시 생성\n\n" +
              "이럴 때 유용해요:\n" +
              "· 정책에 맞는 샘플 화면을 눈으로 확인하고 싶을 때\n" +
              "· 개선 아이디어를 화면으로 미리보기 하고 싶을 때\n" +
              "· 기획전달 전에 UI 형태를 프리뷰하고 싶을 때\n\n" +
              "결과물은 qa/mockups/ 에 저장되어 팀과 공유 가능"
            }
            className="h-7 px-2 bg-indigo-600 hover:bg-indigo-700 gap-1"
          >
            <FileCode2 className="w-3.5 h-3.5" /> HTML 목업
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => setForwardOpen(true)}
            disabled={!lastAssistantContent}
            title="정책 변경 요청 → 기획자에게 전달"
            className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 gap-1"
          >
            <Send className="w-3.5 h-3.5" /> 기획전달
          </Button>
        </div>

        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSend();
            }
          }}
          onPaste={handlePaste}
          placeholder={
            scope === "none"
              ? "⬅ 먼저 왼쪽에서 궁금한 정책이나 화면을 골라주세요 (또는 🌐 전체 정책 종합 모드 켜기)"
              : "예) 대시보드 필터에 초기화 버튼이 없는 이유가 뭔가요?\n\n💡 이미지 첨부: 텍스트박스에 Ctrl+V 로 붙여넣거나 파일을 드래그\n예: '정책에는 X 인데 화면은 Y 입니다. 비교해주세요' + 화면 캡처"
          }
          className="min-h-[100px] mb-2 text-[13px] leading-relaxed"
          disabled={sending || scope === "none"}
        />
        <div className="flex items-center gap-2">
          <label className={`text-xs cursor-pointer inline-flex items-center gap-1 ${scope === "none" ? "text-slate-300 cursor-not-allowed" : "text-slate-500 hover:text-slate-700"}`}>
            <Paperclip className="w-3.5 h-3.5" /> 이미지 첨부
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={scope === "none"}
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <span className="text-xs text-slate-400">Enter 전송 · Shift+Enter 줄바꿈</span>
          <div className="flex-1" />
          {sending && (
            <Button variant="outline" onClick={handleStop} size="sm" className="gap-1">
              <StopCircle className="w-3.5 h-3.5" /> 중지
            </Button>
          )}
          <Button
            onClick={handleSend}
            disabled={sending || scope === "none" || (!input.trim() && pendingAttachments.length === 0)}
            size="sm"
            className="gap-1"
          >
            {sending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> 전송 중
              </>
            ) : (
              "전송"
            )}
          </Button>
        </div>
      </div>

      <ForwardDialog
        open={forwardOpen}
        onOpenChange={setForwardOpen}
        teamSlug={teamSlug}
        activeDocPath={activeDoc?.path}
        initialTitle={forwardDraft.title}
        initialBody={forwardDraft.body}
        hasProposal={forwardDraft.hasProposal}
        onSuccess={(res) => setSuccessBanner(`기획전달 커밋 완료: ${res.path.split("/").pop()}`)}
      />
      <FeedbackDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        teamSlug={teamSlug}
        activeDocPath={activeDoc?.path}
        initialBody={lastAssistantContent}
        onSuccess={(res) => setSuccessBanner(`답변 규칙 커밋 완료: ${res.path.split("/").pop()}`)}
      />
      <MockupDialog
        open={mockupOpen}
        onOpenChange={setMockupOpen}
        teamSlug={teamSlug}
        githubRepo={githubRepo}
        focusedDocPath={activeDoc?.path}
        activeProject={activeProject}
      />
    </div>
  );
}

/** 대화가 비었을 때 표시되는 웰컴 가이드 (방법 1 · 방법 2). 원본 qa-collab.html 이식. */
function WelcomeGuide({
  useAllDocs,
  onEnableAllDocs,
}: {
  useAllDocs: boolean;
  onEnableAllDocs: () => void;
}) {
  return (
    <div className="space-y-3 max-w-2xl mx-auto">
      <div className="flex items-start gap-3 py-2">
        {/* 봇 아바타 — 원형 · 다정한 톤 · 손 흔드는 이모지로 인사감 */}
        <div className="shrink-0 w-11 h-11 rounded-full bg-gradient-to-br from-indigo-100 to-sky-100 border border-indigo-200 flex items-center justify-center text-[22px] shadow-sm">
          🤖
        </div>
        <div className="text-[13px] text-slate-700 pt-0.5">
          <div className="font-semibold mb-0.5 text-slate-900">제이나미봇</div>
          <div className="text-slate-600 flex items-center gap-1.5">
            <span className="text-lg animate-[wave_1.6s_ease-in-out_infinite] origin-[70%_70%] inline-block">👋</span>
            <span>안녕하세요! 아래 두 가지 방식으로 질문할 수 있어요.</span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3.5 text-[12px] text-slate-700">
        <div className="font-semibold mb-2 flex items-center gap-1.5 text-slate-900 text-[13px]">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-sky-50 text-sky-700 text-[11px] font-bold">1</span>
          특정 문서에 대해 질문
        </div>
        <ol className="space-y-0.5 list-decimal list-inside pl-1 text-slate-600">
          <li>좌측 목록에서 정책·화면 하나를 클릭</li>
          <li>우측 아래 입력창에 그 문서 관련 질문 입력</li>
        </ol>
        <div className="mt-2 text-[11px] text-slate-500">→ 봇이 그 문서의 §번호를 인용해서 답변</div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3.5 text-[12px] text-slate-700">
        <div className="font-semibold mb-2 flex items-center gap-1.5 text-slate-900 text-[13px]">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-indigo-50 text-indigo-700 text-[11px] font-bold">2</span>
          전체 정책 종합해서 질문
        </div>
        <ol className="space-y-0.5 list-decimal list-inside pl-1 text-slate-600">
          <li className="flex items-center gap-2 flex-wrap">
            좌측 상단 <b className="text-slate-800">🌐 전체 정책 종합 모드</b> 토글 <b>ON</b>
            {!useAllDocs && (
              <button
                type="button"
                onClick={onEnableAllDocs}
                className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[11px] hover:bg-indigo-700"
              >
                지금 켜기
              </button>
            )}
          </li>
          <li>자유롭게 질문 (특정 문서 선택 불필요)</li>
        </ol>
        <div className="mt-2 text-[11px] text-slate-500">
          → 프로젝트 안 여러 정책을 종합해서 답변. 정확한 문서명 몰라도 OK.
        </div>
      </div>

      <div className="text-[11px] text-slate-400 text-center pt-2">
        💡 이미지 붙여넣기 (Ctrl+V) · 파일 첨부 (📎) 지원
      </div>
    </div>
  );
}

/** 아이콘 전용 툴바 버튼 · 이모지 1글자 · 툴팁 필수 */
function IconOnlyButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="h-7 w-7 rounded-md text-[13px] flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

/** 📝 답변 규칙 설명 툴팁 · hover · focus 시 노출 (Portal 렌더 → 항상 최상위) */
function FeedbackHelpTooltip() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            tabIndex={0}
            className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 focus:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 inline-flex items-center justify-center"
            aria-label="답변 규칙 도움말"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        }
      />
      <TooltipContent side="top" align="end" className="w-72">
        <div className="font-semibold text-slate-900 mb-1.5">📝 답변 규칙이란?</div>
        <p className="mb-2 text-slate-600">
          AI 답변의 <b>규칙·톤·길이</b>를 정해서 원하는 형태로 받는 기능.
          답변 전에 미리 추가해두면 <b>다음 답변부터 자동 반영</b>됩니다.
        </p>
        <div className="bg-amber-50 rounded p-2 mb-2 space-y-1">
          <div className="text-[10px] text-amber-800 font-semibold">💡 이렇게 써보세요</div>
          <ul className="text-[11px] text-amber-900 list-disc pl-4 space-y-0.5">
            <li>답변이 너무 어렵다 → &ldquo;초등학생도 알기 쉽게&rdquo;</li>
            <li>&ldquo;5줄 안으로 요약해줘&rdquo;</li>
            <li>&ldquo;구체적 예시 1개 항상 포함해줘&rdquo;</li>
          </ul>
        </div>
        <div className="text-[10px] text-slate-500">
          작동: qa/feedback/ 에 누적 저장 → 다음 답변에 자동 주입
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
