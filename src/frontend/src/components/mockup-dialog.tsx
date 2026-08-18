"use client";
import { useState } from "react";
import { FileCode2, ExternalLink, Copy, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { generateHtmlMockup, GenHtmlResponse, ApiError } from "@/lib/api";

interface MockupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamSlug: string;
  githubRepo?: string;
  /** 현재 열려있는 문서 (있으면 시각 명세 근거로 전달) */
  focusedDocPath?: string;
  activeProject?: string | null;
}

export function MockupDialog({
  open,
  onOpenChange,
  teamSlug,
  githubRepo,
  focusedDocPath,
  activeProject,
}: MockupDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenHtmlResponse | null>(null);

  function reset() {
    setPrompt("");
    setError(null);
    setResult(null);
    setBusy(false);
  }

  async function handleSubmit() {
    if (!prompt.trim()) {
      setError("어떤 화면을 만들지 설명이 필요해요.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await generateHtmlMockup(teamSlug, {
        prompt: prompt.trim(),
        focusedDocPath: focusedDocPath || undefined,
        project: activeProject || undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyHtml() {
    if (!result?.html) return;
    try {
      await navigator.clipboard.writeText(result.html);
    } catch {
      /* silent */
    }
  }

  const previewUrl = result?.savedPath && githubRepo
    ? `https://github.com/${githubRepo}/blob/main/${result.savedPath}`
    : null;
  const rawUrl = result?.savedPath && githubRepo
    ? `https://raw.githubusercontent.com/${githubRepo}/main/${result.savedPath}`
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy && !o) return;
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <FileCode2 className="w-5 h-5 text-indigo-600" />
            HTML 목업 만들기
          </DialogTitle>
          <DialogDescription>
            정책 문서·참고 이미지를 근거로 완결된 static HTML 을 생성하고 GitHub 에 저장합니다.
            {focusedDocPath && (
              <span className="block mt-1 text-[11px] font-mono text-slate-500 truncate">
                근거: {focusedDocPath}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <>
            {/* 사용 예시 안내 — 사용자가 언제 이걸 쓰면 좋은지 감을 잡을 수 있게 */}
            <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3 text-[12px] text-indigo-900 leading-relaxed">
              <div className="font-semibold mb-1.5">💡 이럴 때 유용해요</div>
              <ul className="space-y-0.5 list-disc pl-4">
                <li>정책에 맞는 <b>샘플 화면</b>을 눈으로 확인하고 싶을 때</li>
                <li><b>개선 아이디어</b>가 화면으로 어떻게 보일지 미리보기</li>
                <li>기획전달 전에 <b>UI 형태를 프리뷰</b>해서 논의 근거로 활용</li>
              </ul>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mockup-prompt" className="text-[12px]">
                어떤 화면을 만들까요? (구체적 요소 · 레이아웃 · 상태 명시)
              </Label>
              <Textarea
                id="mockup-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={busy}
                placeholder="예) 대시보드 상단에 발송 성과 KPI 카드 3개 (누적 발송·성공률·환불률) · 아래 월별 요약 테이블 · 우측 필터 사이드바 (기간·캠페인 유형)"
                className="min-h-[120px] text-[13px]"
              />
              <p className="text-[11px] text-slate-500">
                💡 생성에 20~60초 소요됩니다. 저장 위치: <code className="font-mono">qa/mockups/YYYY-MM-DD-slug.html</code>
              </p>
            </div>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[12px] text-red-800">
                ⚠️ {error}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                취소
              </Button>
              <Button onClick={handleSubmit} disabled={busy || !prompt.trim()} className="gap-1.5">
                {busy ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> 생성 중...
                  </>
                ) : (
                  <>
                    <FileCode2 className="w-3.5 h-3.5" /> HTML 생성
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {result.savedPath ? (
              <div className="space-y-3">
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-[13px] text-emerald-900">
                  <div className="font-semibold mb-1">✅ 생성 완료</div>
                  <div className="text-[11px] font-mono text-emerald-800 break-all">{result.savedPath}</div>
                  <div className="text-[11px] text-emerald-700 mt-1">
                    {(result.bytes / 1024).toFixed(1)} KB · {result.modelUsed}
                    {result.usage?.input_tokens && (
                      <> · in {result.usage.input_tokens} · out {result.usage.output_tokens}</>
                    )}
                  </div>
                </div>
                {previewUrl && (
                  <div className="flex items-center gap-2">
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1"
                    >
                      GitHub 에서 열기 <ExternalLink className="w-3 h-3" />
                    </a>
                    {rawUrl && (
                      <>
                        <span className="text-slate-300 text-[11px]">·</span>
                        <a
                          href={rawUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[12px] text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1"
                        >
                          Raw HTML 열기 <ExternalLink className="w-3 h-3" />
                        </a>
                      </>
                    )}
                  </div>
                )}
                <p className="text-[11px] text-slate-500">
                  💡 GitHub Pages 가 활성화된 레포면 Pages URL 로 즉시 브라우저 렌더링 가능
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900 space-y-2">
                <div className="font-semibold">⚠️ GitHub 저장 실패 (HTML 은 생성됨)</div>
                <div className="text-[11px] font-mono text-amber-800 break-all">{result.saveError}</div>
                {result.html && (
                  <Button size="sm" variant="outline" onClick={copyHtml} className="gap-1">
                    <Copy className="w-3.5 h-3.5" /> HTML 클립보드 복사
                  </Button>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                다시 만들기
              </Button>
              <Button onClick={() => onOpenChange(false)}>닫기</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
