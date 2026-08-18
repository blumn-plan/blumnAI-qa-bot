"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, FileText, MessageCircle, CheckCircle2, ArrowRight, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getDoc, DocEntry, ApiError } from "@/lib/api";
import { MarkdownView } from "@/components/markdown-view";
import { useUiStore } from "@/lib/ui-store";

interface DocViewerProps {
  teamSlug: string;
  activeDoc: DocEntry | null;
  githubRepo?: string;
  /** 챗 답변 §X-Y 링크에서 넘어온 스크롤 타겟. 값이 바뀔 때마다 해당 헤딩으로 스크롤+하이라이트 */
  citationTarget?: { anchor: string; nonce: number } | null;
  /** 정책에서 해당 §X-Y 를 못 찾은 경우 알림용 */
  onCitationMiss?: (anchor: string) => void;
}

/** 중앙 문서 뷰어. 좌측 사이드바에서 선택한 md 문서를 fetch → 렌더. */
export function DocViewer({ teamSlug, activeDoc, githubRepo, citationTarget, onCitationMiss }: DocViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeDoc) {
      setContent(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDoc(teamSlug, activeDoc.path)
      .then((res) => { if (!cancelled) setContent(res.content); })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : String(err));
        setContent(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [teamSlug, activeDoc]);

  // 챗 답변 §X-Y 클릭 → 렌더 완료된 헤딩(id="cite-X-Y")으로 스크롤+하이라이트.
  //  · nonce 를 함께 비교해서 같은 anchor 재클릭도 트리거되도록 함
  //  · content 로딩 직후에도 동작하도록 content 도 의존성에 포함
  useEffect(() => {
    if (!citationTarget || !scrollRef.current || !content) return;
    const el = scrollRef.current.querySelector<HTMLElement>(
      `#cite-${CSS.escape(citationTarget.anchor)}`,
    );
    if (!el) {
      onCitationMiss?.(citationTarget.anchor);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("cite-highlight");
    void el.offsetHeight;
    el.classList.add("cite-highlight");
    const timer = setTimeout(() => el.classList.remove("cite-highlight"), 1800);
    return () => clearTimeout(timer);
  }, [citationTarget, content, onCitationMiss]);

  if (!activeDoc) {
    return <ViewerEmptyState />;
  }

  const kindBadge = activeDoc.kind === "policy"
    ? { cls: "bg-sky-50 text-sky-700 border-sky-200", label: "정책" }
    : { cls: "bg-slate-50 text-slate-600 border-slate-200", label: "화면" };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <Badge className={`text-xs border ${kindBadge.cls}`}>{kindBadge.label}</Badge>
          <h2 className="font-semibold text-base truncate flex-1" title={activeDoc.title}>
            {activeDoc.title}
          </h2>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => {
              if (content) navigator.clipboard.writeText(content);
            }}
            disabled={!content}
            title="문서 본문 클립보드 복사"
          >
            <Copy className="w-3.5 h-3.5" /> 복사
          </Button>
          {githubRepo && (
            <a
              href={`https://github.com/${githubRepo}/blob/main/${activeDoc.path}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1"
            >
              GitHub <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <div className="font-mono text-xs text-muted-foreground truncate" title={activeDoc.path}>
          {activeDoc.path}
        </div>
      </div>

      <Separator />

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto px-6 py-4">
        {loading && <div className="text-sm text-muted-foreground">문서 로딩 중...</div>}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
            <div className="font-semibold mb-1">문서 로드 실패</div>
            <div className="text-xs font-mono break-all">{error}</div>
          </div>
        )}
        {!loading && !error && content && <MarkdownView content={content} assignHeadingIds />}
      </div>
    </div>
  );
}

/** 뷰어 empty state · 단계별 wizard flow 안내
 *  · 참고 문서 미선택 + 종합모드 OFF: "문의 시작하기" primary CTA (사이드바 참고 문서 섹션 강조)
 *  · 참고 문서 선택됨 or 종합모드 ON: "이제 오른쪽 챗에 질문하세요" 안내
 *  · 문서 뷰어의 기본 안내도 하단 옅게 병기 (문서 클릭 시 여기 표시된다는 알림) */
function ViewerEmptyState() {
  const useAllDocs = useUiStore((s) => s.useAllDocs);
  const setUseAllDocs = useUiStore((s) => s.setUseAllDocs);
  const selectedDocPaths = useUiStore((s) => s.selectedDocPaths);
  const ready = useAllDocs || selectedDocPaths.length > 0;

  function focusSidebarDocs() {
    // 사이드바 참고 문서 섹션으로 부드러운 스크롤 + 임시 강조 (앰버 링 pulse 는 이미 상시)
    const target = document.querySelector('[data-section="reference-docs"]');
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="h-full flex items-center justify-center bg-gradient-to-b from-slate-50 to-white px-6">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
          <MessageCircle className="w-8 h-8" />
        </div>
        {ready ? (
          <>
            <h2 className="text-lg font-semibold text-slate-900 mb-1.5">
              <CheckCircle2 className="inline w-5 h-5 text-emerald-500 mb-0.5 mr-1" />
              참고 문서 준비 완료
            </h2>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              이제 <b>오른쪽 챗 창</b>에 질문을 입력하세요.<br />
              답변에 나오는 <code className="text-[12px] bg-slate-100 px-1 rounded">[문서명 §X-Y]</code> 링크를 누르면 여기에 해당 문서가 열립니다.
            </p>
            <div className="text-[11px] text-slate-400 inline-flex items-center gap-1">
              <ArrowRight className="w-3 h-3" /> 우측 챗 창의 질문 입력 영역이 활성화되어 있어요.
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-slate-900 mb-1.5">문의를 시작해 볼까요?</h2>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              먼저 <b>문의 근거로 삼을 문서</b>를 골라주세요.<br />
              왼쪽 사이드바의 <b>③ 참고 문서</b> 리스트에서 체크박스로 선택하거나, 아래 버튼으로 전체 정책을 근거로 문의할 수도 있어요.
            </p>
            <div className="flex flex-col gap-2 items-center">
              <Button
                type="button"
                size="lg"
                onClick={focusSidebarDocs}
                className="w-full max-w-[280px] h-11 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-sm"
              >
                <MessageCircle className="w-4 h-4" /> 문의 시작하기 · 참고 문서 고르기
              </Button>
              <button
                type="button"
                onClick={() => setUseAllDocs(true)}
                className="text-[12px] text-slate-500 hover:text-indigo-700 inline-flex items-center gap-1 py-1"
              >
                <Globe className="w-3.5 h-3.5" /> 또는 전체 정책 종합 모드로 바로 시작
              </button>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 text-[11px] text-slate-400 inline-flex items-center gap-1.5">
              <FileText className="w-3 h-3" /> 왼쪽에서 문서를 클릭하면 여기에 본문이 표시됩니다.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
