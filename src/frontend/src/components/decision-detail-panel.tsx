"use client";
import { useEffect, useState } from "react";
import { Send, ExternalLink, X, MessageCircle } from "lucide-react";
import { MarkdownView } from "@/components/markdown-view";
import { getDoc, ApiError } from "@/lib/api";
import type { DecisionListItem } from "@/lib/api";

interface Props {
  teamSlug: string;
  githubRepo?: string;
  decision: DecisionListItem;
  onClose: () => void;
}

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

/** 협업자 모드에서 [기획자 전달이력] 클릭 시 챗 패널 자리에 나타나는 상세 뷰.
 *  · 기획자 모드 구조와 유사하게 : 가운데(정책 문서) + 우측(이력 상세) 병렬 배치
 *  · 편집 · 상태 변경 UI 없음 (질문자도 안전하게 열람) */
export function DecisionDetailPanel({ teamSlug, githubRepo, decision, onClose }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    getDoc(teamSlug, decision.path)
      .then((r) => {
        if (!cancelled) setContent(r.content);
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
  }, [teamSlug, decision.path]);

  const githubUrl = githubRepo
    ? `https://github.com/${githubRepo}/blob/HEAD/${decision.path.split("/").map(encodeURIComponent).join("/")}`
    : null;

  const created = decision.createdAt
    ? decision.createdAt.slice(0, 10).replace(/-/g, ".")
    : "";

  return (
    <div className="flex flex-col h-full bg-white min-w-0">
      {/* 헤더 · 챗 패널 헤더와 시각 위계 맞춤 (border-b · 그라디언트) */}
      <div className="border-b border-slate-200 bg-gradient-to-b from-emerald-50/50 to-white px-4 py-3 shrink-0 min-w-0">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="mt-0.5 w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <Send className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="text-[13px] font-semibold text-slate-900 truncate flex-1 min-w-0">
                기획자 전달이력
              </div>
              <button
                type="button"
                onClick={onClose}
                title="닫고 챗 패널로 돌아가기"
                className="shrink-0 h-7 px-2 rounded text-[11px] text-slate-600 hover:text-slate-900 hover:bg-slate-100 inline-flex items-center gap-1"
              >
                <MessageCircle className="w-3.5 h-3.5" /> 챗으로
                <X className="w-3 h-3 ml-0.5" />
              </button>
            </div>
            <div className="text-[13px] text-slate-800 font-medium break-words leading-snug">
              {decision.title}
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[11px]">
              <span
                className={`inline-flex items-center font-medium px-1.5 py-0.5 rounded border ${
                  statusStyle[decision.status] ?? "bg-slate-100 text-slate-700 border-slate-200"
                }`}
              >
                {statusLabel[decision.status] ?? decision.status}
              </span>
              {decision.requester && (
                <span className="text-slate-600">
                  👤 <b className="text-slate-800">{decision.requester}</b>
                </span>
              )}
              {created && <span className="text-slate-500 tabular-nums">{created}</span>}
              {githubUrl && (
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 ml-auto"
                >
                  GitHub 원본 <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 본문 · 스크롤 영역 */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-slate-50">
        {loading && <div className="text-sm text-slate-500">불러오는 중…</div>}
        {error && (
          <div className="text-sm text-red-700 rounded border border-red-200 bg-red-50 p-3">
            ⚠️ {error}
          </div>
        )}
        {!loading && !error && content && (
          <div className="bg-white border border-slate-200 rounded p-4">
            <MarkdownView content={content} stripImages />
          </div>
        )}
      </div>
    </div>
  );
}
