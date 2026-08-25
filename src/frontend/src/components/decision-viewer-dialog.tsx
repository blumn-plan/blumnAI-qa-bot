"use client";
import { useEffect, useState } from "react";
import { Send, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownView } from "@/components/markdown-view";
import { getDoc, ApiError } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamSlug: string;
  /** qa/decisions/…md 경로 */
  path: string | null;
  /** 사이드바에 표시된 제목 · 로딩 중에도 헤더에 표시 */
  title: string;
  /** 상태 (대기·적용·보류·반려) · badge 로 표시 */
  status?: string;
  /** GitHub blob URL (있으면 우측 상단에 「GitHub 원본」 링크) */
  githubRepo?: string;
}

/** 협업자용 기획자 전달이력 상세 뷰어.
 *  · 사이드바 서랍에서 항목 클릭 시 planner 모드로 넘어가지 않고 이 모달로 답변 노출.
 *  · 질문자도 열람 가능. 편집 · 상태변경 UI 는 없음 (기획자 전용은 /planner 로). */
export function DecisionViewerDialog({
  open,
  onOpenChange,
  teamSlug,
  path,
  title,
  status,
  githubRepo,
}: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !path) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    getDoc(teamSlug, path)
      .then((res) => {
        if (!cancelled) setContent(res.content);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, teamSlug, path]);

  const githubUrl =
    path && githubRepo ? `https://github.com/${githubRepo}/blob/HEAD/${path.split("/").map(encodeURIComponent).join("/")}` : null;

  const statusStyle: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    applied: "bg-emerald-100 text-emerald-800 border-emerald-200",
    hold: "bg-slate-100 text-slate-700 border-slate-200",
    rejected: "bg-red-100 text-red-800 border-red-200",
  };
  const statusLabel: Record<string, string> = {
    pending: "🟡 대기",
    applied: "✅ 적용",
    hold: "⏸ 보류",
    rejected: "✕ 반려",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(900px,92vw)] w-[92vw] max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2 pr-6">
            <Send className="w-4 h-4 text-emerald-600 mt-1 shrink-0" />
            <span className="flex-1 min-w-0 break-words">{title}</span>
          </DialogTitle>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {status && (
              <span
                className={`inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded border ${
                  statusStyle[status] ?? "bg-slate-100 text-slate-700 border-slate-200"
                }`}
              >
                {statusLabel[status] ?? status}
              </span>
            )}
            {githubUrl && (
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
              >
                GitHub 원본 <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {path && (
              <span className="text-[10px] font-mono text-slate-400 truncate min-w-0">{path}</span>
            )}
          </div>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-auto border rounded p-4 bg-white">
          {loading && <div className="text-sm text-muted-foreground">불러오는 중…</div>}
          {error && <div className="text-sm text-red-700">⚠️ {error}</div>}
          {!loading && !error && content && <MarkdownView content={content} stripImages />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
