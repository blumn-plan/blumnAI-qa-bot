"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { streamQa, DocEntry, ApiError } from "@/lib/api";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  error?: string;
}

interface ChatPanelProps {
  teamSlug: string;
  activeDoc: DocEntry | null;
}

export function ChatPanel({ teamSlug, activeDoc }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSend() {
    if (!input.trim() || sending) return;
    const question = input.trim();
    setInput("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question },
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
        },
        (evt) => {
          if (evt.type === "text" && evt.content) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                last.content += evt.content;
              }
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

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-3 bg-white flex items-center gap-2">
        <div className="font-semibold text-sm">💬 AI 에게 질문</div>
        {activeDoc ? (
          <Badge variant="secondary" className="font-mono text-[10px]">
            문서: {activeDoc.title}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">문서 미선택 (좌측에서 선택)</Badge>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-12">
            좌측에서 정책·화면 문서를 선택하고 질문을 입력하세요.
            <br />
            예) "결제 실패 시 재시도 정책 어디?"
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg text-sm whitespace-pre-wrap break-words ${
              msg.role === "user"
                ? "bg-indigo-100 ml-8"
                : "bg-white border mr-8"
            }`}
          >
            <div className="text-xs font-semibold mb-1">
              {msg.role === "user" ? "🙋 나" : "🤖 AI"}
            </div>
            {msg.content}
            {msg.streaming && <span className="inline-block ml-1 animate-pulse">▊</span>}
            {msg.error && (
              <div className="text-xs text-red-600 mt-2 border-t pt-2">
                ⚠️ 에러: {msg.error}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t p-3 bg-white">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="질문을 입력하고 Enter (Shift+Enter 줄바꿈)"
          className="min-h-[70px] mb-2"
          disabled={sending}
        />
        <div className="flex justify-end gap-2">
          {sending && (
            <Button variant="outline" onClick={handleStop} size="sm">
              🛑 중지
            </Button>
          )}
          <Button onClick={handleSend} disabled={sending || !input.trim()} size="sm">
            {sending ? "전송 중..." : "전송 (Enter)"}
          </Button>
        </div>
      </div>
    </div>
  );
}
