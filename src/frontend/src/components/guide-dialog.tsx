"use client";
import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownView } from "@/components/markdown-view";
import { getDoc, ApiError } from "@/lib/api";

interface GuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamSlug: string;
  title: string;
  /** 팀 GitHub repo 상대 경로 · 예: `qa/decisions/README.md` */
  path: string;
  /** 파일이 팀 repo 에 없을 때 표시할 기본 안내 (fallback) */
  fallbackMarkdown?: string;
}

/** 사이드바 섹션 헤더 아래 "📘 가이드" 링크 클릭 시 열리는 모달.
 *  팀 repo 의 README md 를 fetch 해서 렌더. 없으면 fallback md 사용. */
export function GuideDialog({
  open,
  onOpenChange,
  teamSlug,
  title,
  path,
  fallbackMarkdown,
}: GuideDialogProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);
    getDoc(teamSlug, path)
      .then((res) => {
        if (cancelled) return;
        setContent(res.content);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          setContent(null);
        } else {
          setError(err instanceof ApiError ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, teamSlug, path]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(1100px,92vw)] w-[92vw] max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-600" />
            {title}
          </DialogTitle>
          <div className="text-xs font-mono text-muted-foreground">{path}</div>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-auto border rounded p-4 bg-white">
          {loading && (
            <div className="text-sm text-muted-foreground">가이드 문서 로딩 중...</div>
          )}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
              <div className="font-semibold mb-1">가이드 로드 실패</div>
              <div className="text-xs font-mono break-all">{error}</div>
            </div>
          )}
          {!loading && !error && notFound && (
            <>
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-3 mb-3">
                이 팀 repo 에 <code className="text-xs bg-white px-1 rounded">{path}</code> 파일이 없어서 기본 안내를 표시합니다. 팀에 맞는 절차가 있다면 해당 경로에 md 를 커밋하시면 여기서 자동 노출됩니다.
              </div>
              {fallbackMarkdown && <MarkdownView content={fallbackMarkdown} />}
            </>
          )}
          {!loading && !error && !notFound && content && (
            <MarkdownView content={content} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
