"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { streamQa, DocEntry, ApiError } from "@/lib/api";
import { MarkdownView } from "@/components/markdown-view";
import { ForwardDialog, FeedbackDialog } from "@/components/action-dialogs";

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
}

export function ChatPanel({ teamSlug, activeDoc }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Array<{ mediaType: string; data: string }>>([]);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 새 메시지가 오면 자동 스크롤
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // 성공 배너 3초 후 자동 사라짐
  useEffect(() => {
    if (!successBanner) return;
    const t = setTimeout(() => setSuccessBanner(null), 3500);
    return () => clearTimeout(t);
  }, [successBanner]);

  async function handleSend() {
    if ((!input.trim() && pendingAttachments.length === 0) || sending) return;
    const question = input.trim();
    const attachments = pendingAttachments;
    setInput("");
    setPendingAttachments([]);
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question, attachments },
      { role: "assistant", content: "", streaming: true },
    ]);
    abortRef.current = new AbortController();
    try {
      await streamQa(
        teamSlug,
        {
          question,
          docPath: activeDoc?.path,
          history: messages
            .filter((m) => !m.streaming && !m.error)
            .map((m) => ({ role: m.role, content: m.content })),
          attachments,
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
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") last.usage = evt.usage as ChatMessage["usage"];
              return next;
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
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          last.streaming = false;
          last.error = err instanceof ApiError ? err.message : String(err);
        }
        return next;
      });
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleNewChat() {
    setMessages([]);
    setPendingAttachments([]);
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

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-3 bg-white flex items-center gap-2 flex-wrap">
        <div className="font-semibold text-sm">💬 AI 에게 질문</div>
        {activeDoc ? (
          <Badge variant="secondary" className="font-mono text-[10px]">📄 {activeDoc.title}</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">문서 미선택 (좌측 리스트)</Badge>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={handleNewChat} title="대화 초기화">
          ↻ 새 대화
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setFeedbackOpen(true)}
          disabled={!lastAssistantContent}
          title="AI 답변 톤·형식 조정 규칙 저장"
        >
          📝 답변 규칙
        </Button>
        <Button
          size="sm"
          variant="default"
          onClick={() => setForwardOpen(true)}
          disabled={!lastAssistantContent}
          title="정책 변경 요청 → 기획자에게 GitHub 커밋"
        >
          📤 기획전달
        </Button>
      </div>

      {successBanner && (
        <div className="border-b bg-green-50 text-green-800 text-xs px-3 py-2">
          ✅ {successBanner}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-12">
            좌측에서 정책·화면 문서를 선택하고 질문을 입력하세요.
            <br />
            예) &quot;결제 실패 시 재시도 정책 어디?&quot;
            <br />
            <span className="text-xs opacity-60">이미지 붙여넣기 (Ctrl+V) 도 됩니다</span>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg text-sm ${
              msg.role === "user" ? "bg-indigo-100 ml-8" : "bg-white border mr-8"
            }`}
          >
            <div className="text-xs font-semibold mb-1">
              {msg.role === "user" ? "🙋 나" : "🤖 AI"}
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
                  <MarkdownView content={msg.content} />
                ) : msg.streaming ? (
                  <span className="text-muted-foreground text-xs">답변 시작 대기...</span>
                ) : null}
                {msg.streaming && <span className="inline-block ml-1 animate-pulse">▊</span>}
              </>
            )}
            {msg.error && (
              <div className="text-xs text-red-600 mt-2 border-t pt-2">
                ⚠️ 에러: {msg.error}
              </div>
            )}
            {msg.usage && (
              <div className="text-[10px] text-slate-400 mt-2 pt-2 border-t flex gap-2 flex-wrap font-mono">
                <span>in: {msg.usage.input_tokens ?? 0}</span>
                <span>out: {msg.usage.output_tokens ?? 0}</span>
                {(msg.usage.cache_read_input_tokens ?? 0) > 0 && (
                  <span className="text-green-600">cache↺ {msg.usage.cache_read_input_tokens}</span>
                )}
                {(msg.usage.cache_creation_input_tokens ?? 0) > 0 && (
                  <span className="text-amber-600">cache+ {msg.usage.cache_creation_input_tokens}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t p-3 bg-white">
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
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-[10px] leading-none opacity-0 group-hover:opacity-100"
                  onClick={() => setPendingAttachments((prev) => prev.filter((_, ix) => ix !== i))}
                  title="첨부 취소"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
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
          placeholder="질문 입력 · Enter 전송 · Shift+Enter 줄바꿈 · Ctrl+V 이미지 첨부"
          className="min-h-[70px] mb-2"
          disabled={sending}
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
            📎 이미지
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <div className="flex-1" />
          {sending && (
            <Button variant="outline" onClick={handleStop} size="sm">🛑 중지</Button>
          )}
          <Button
            onClick={handleSend}
            disabled={sending || (!input.trim() && pendingAttachments.length === 0)}
            size="sm"
          >
            {sending ? "전송 중..." : "전송 (Enter)"}
          </Button>
        </div>
      </div>

      <ForwardDialog
        open={forwardOpen}
        onOpenChange={setForwardOpen}
        teamSlug={teamSlug}
        activeDocPath={activeDoc?.path}
        initialBody={lastAssistantContent}
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
    </div>
  );
}
