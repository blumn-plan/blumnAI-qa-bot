"use client";
import { useEffect, useState } from "react";
import { FileCode2, ExternalLink, Copy, Loader2, Paperclip, Eye, FileText, BookOpen, History, ChevronLeft } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { generateHtmlMockup, listMockups, fetchMockupHtml, GenHtmlResponse, MockupListItem, ApiError } from "@/lib/api";

type Attachment = { mediaType: string; data: string };

// 캡처 붙여넣기 → 자동 축소·JPEG 인코딩.
//   · Next dev 프록시 body 상한 · Claude API 이미지 10MB 상한 회피
//   · 긴 변 2000px · JPEG 0.85 (스크린샷 판독에 충분)
async function compressImageToBase64(file: File): Promise<Attachment> {
  const MAX_DIM = 2000;
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_DIM / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.85);
  });
  const buf = await blob.arrayBuffer();
  // 큰 배열을 fromCharCode 에 spread 하면 stack overflow — 청크로 나눠서 인코딩
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return { mediaType: "image/jpeg", data: btoa(binary) };
}

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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // 성공 화면에서 사용자가 입력했던 프롬프트를 그대로 볼 수 있게 · 다시 만들기 편의
  const [submittedPrompt, setSubmittedPrompt] = useState("");
  // 이전 목업 목록 뷰 · 창 열릴 때 한번 fetch
  const [view, setView] = useState<"form" | "list">("form");
  const [listItems, setListItems] = useState<MockupListItem[] | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  function reset() {
    setPrompt("");
    setError(null);
    setResult(null);
    setBusy(false);
    setAttachments([]);
    setSubmittedPrompt("");
    setView("form");
  }

  async function loadList() {
    setListLoading(true);
    setListError(null);
    try {
      const res = await listMockups(teamSlug);
      setListItems(res.items);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setListLoading(false);
    }
  }

  // 리스트 뷰 진입 시 fetch · 이후엔 캐시
  useEffect(() => {
    if (view === "list" && !listItems && !listLoading) {
      loadList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // GitHub 저장된 목업 원문을 받아 blob URL 로 새 탭 렌더 · 사설 레포도 OK
  async function openSavedMockup(item: MockupListItem) {
    try {
      const { html } = await fetchMockupHtml(teamSlug, item.path);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (w) setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      // 실패 시 GitHub raw 로 폴백 (public repo 라면 열림)
      window.open(item.rawUrl, "_blank", "noopener,noreferrer");
      console.warn("mockup fetch failed, opened raw url", err);
    }
  }

  // 다시 만들기 = 프롬프트/첨부는 유지, 결과만 비움 (수정·재생성 편의)
  function revise() {
    setResult(null);
    setError(null);
  }

  async function handleFiles(files: FileList | File[] | null | undefined) {
    if (!files) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    const encoded = await Promise.all(arr.map(compressImageToBase64));
    setAttachments((prev) => [...prev, ...encoded]);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (!e.clipboardData?.files?.length) return;
    handleFiles(e.clipboardData.files);
  }

  async function handleSubmit() {
    if (!prompt.trim()) {
      setError("어떤 화면을 만들지 설명이 필요해요.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    const submitted = prompt.trim();
    try {
      const res = await generateHtmlMockup(teamSlug, {
        prompt: submitted,
        focusedDocPath: focusedDocPath || undefined,
        project: activeProject || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      setSubmittedPrompt(submitted);
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

  // 백엔드가 GitHub 실제 응답에서 뽑아준 URL 사용 (브랜치명·인코딩 정확)
  const previewUrl = result?.previewUrl ?? null;
  const rawUrl = result?.rawUrl ?? null;
  const focusedDocUrl = result?.focusedDocUrl ?? null;

  // 실제 렌더 미리보기 · html 블롭 URL → 사설 레포도 새 탭에서 바로 렌더링
  function openPreview() {
    if (!result?.html) return;
    const blob = new Blob([result.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank", "noopener,noreferrer");
    // 새 탭이 로드된 후 blob URL revoke (탭이 열려 있는 동안 유지)
    if (w) setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  // 파일명 → 사람 친화적 제목 (2026-08-24-포인트-관리…-4.html → 포인트 관리…)
  function friendlyTitle(savedPath: string): string {
    const base = (savedPath.split("/").pop() ?? "").replace(/\.html$/i, "");
    // YYYY-MM-DD- 접두 제거 · 끝의 -숫자 (중복 회피 suffix) 제거 · 하이픈 공백화
    return base
      .replace(/^\d{4}-\d{2}-\d{2}-/, "")
      .replace(/-\d+$/, "")
      .replace(/-/g, " ")
      .trim() || "목업";
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy && !o) return;
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="!max-w-[480px] !w-[480px]">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="inline-flex items-center gap-2">
              {view === "list" ? (
                <>
                  <History className="w-5 h-5 text-indigo-600" />
                  이전 목업 목록
                </>
              ) : (
                <>
                  <FileCode2 className="w-5 h-5 text-indigo-600" />
                  HTML 목업 만들기
                </>
              )}
            </DialogTitle>
            {view === "form" && !result && (
              <button
                type="button"
                onClick={() => setView("list")}
                className="text-[11px] text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
              >
                <History className="w-3.5 h-3.5" /> 이전 목업 보기
              </button>
            )}
          </div>
          {view === "form" && !result && (
            <DialogDescription>
              {focusedDocPath ? (
                <span className="text-slate-600">
                  기준 정책:{" "}
                  <b className="text-slate-800">
                    {focusedDocPath.split("/").pop()?.replace(/\.md$/i, "")}
                  </b>
                </span>
              ) : (
                "정책과 참고 이미지를 바탕으로 화면 목업을 생성합니다."
              )}
            </DialogDescription>
          )}
        </DialogHeader>

        {view === "list" ? (
          <>
            {listLoading && (
              <div className="py-8 text-center text-[13px] text-slate-500 inline-flex items-center justify-center gap-2 w-full">
                <Loader2 className="w-4 h-4 animate-spin" /> 목록 불러오는 중…
              </div>
            )}
            {listError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[12px] text-red-800">
                ⚠️ {listError}
              </div>
            )}
            {!listLoading && !listError && listItems && listItems.length === 0 && (
              <div className="py-8 text-center text-[13px] text-slate-500">
                아직 생성한 목업이 없어요.
              </div>
            )}
            {!listLoading && !listError && listItems && listItems.length > 0 && (
              <div className="max-h-[420px] overflow-y-auto -mx-1 px-1">
                <ul className="space-y-1">
                  {listItems.map((item) => {
                    // 파일명 접두 YYYY-MM-DD 파싱
                    const dateMatch = item.filename.match(/^(\d{4})-(\d{2})-(\d{2})-/);
                    const dateStr = dateMatch ? `${dateMatch[1]}.${dateMatch[2]}.${dateMatch[3]}` : "";
                    const title = friendlyTitle(item.path);
                    return (
                      <li
                        key={item.path}
                        className="group rounded-md border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors p-2.5"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium text-slate-900 truncate">{title}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {dateStr} · {(item.sizeBytes / 1024).toFixed(1)} KB
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openSavedMockup(item)}
                              className="gap-1 h-7 px-2"
                            >
                              <Eye className="w-3.5 h-3.5" /> 미리보기
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => window.open(item.previewUrl, "_blank", "noopener,noreferrer")}
                              title="GitHub 원본 열기"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setView("form")} className="gap-1">
                <ChevronLeft className="w-3.5 h-3.5" /> 만들기 화면으로
              </Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>닫기</Button>
            </DialogFooter>
          </>
        ) : !result ? (
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
                onPaste={handlePaste}
                disabled={busy}
                placeholder={
                  "예) 이 화면 그대로 만들되 데이터를 00 으로 채워줘\n\n" +
                  "💡 이미지 첨부: 텍스트박스에 Ctrl+V 로 화면 캡처 붙여넣기 (또는 아래 [이미지 첨부] 버튼)"
                }
                className="min-h-[120px] text-[13px]"
              />
              {attachments.length > 0 && (
                <div className="flex gap-2 flex-wrap items-center">
                  <span className="text-[11px] text-slate-500">첨부 예정:</span>
                  {attachments.map((a, i) => (
                    <div key={i} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`data:${a.mediaType};base64,${a.data}`}
                        alt="첨부 예정"
                        className="w-14 h-14 object-cover rounded border"
                      />
                      <button
                        type="button"
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-xs leading-none opacity-0 group-hover:opacity-100"
                        onClick={() => setAttachments((prev) => prev.filter((_, ix) => ix !== i))}
                        title="첨부 취소"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900 cursor-pointer">
                  <Paperclip className="w-3.5 h-3.5" /> 이미지 첨부
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => {
                      handleFiles(e.target.files);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                <p className="text-[11px] text-slate-500">
                  💡 생성 20~60초 · 저장: <code className="font-mono">qa/mockups/YYYY-MM-DD-slug.html</code>
                </p>
              </div>
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
              <div className="py-1 space-y-4">
                <div>
                  <div className="text-[13px] text-slate-600 mb-1">생성 완료</div>
                  <div className="text-[15px] font-semibold text-slate-900 truncate">
                    {friendlyTitle(result.savedPath)}
                  </div>
                </div>

                {/* 사용자가 입력했던 요청 — 다시 만들기 참고용 */}
                {submittedPrompt && (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
                    <div className="text-[11px] text-slate-500 mb-1">내가 입력한 요청</div>
                    <div className="text-[12px] text-slate-800 whitespace-pre-wrap leading-relaxed max-h-28 overflow-y-auto">
                      {submittedPrompt}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Button
                    size="lg"
                    onClick={openPreview}
                    disabled={!result.html}
                    title={result.html ? "" : "이 결과는 이전 버전이라 미리보기 불가 · 다시 만들기 눌러 재생성해주세요"}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 gap-2"
                  >
                    <Eye className="w-4 h-4" /> 미리보기
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => previewUrl && window.open(previewUrl, "_blank", "noopener,noreferrer")}
                      disabled={!previewUrl}
                      className="flex-1 gap-1.5"
                    >
                      <FileText className="w-3.5 h-3.5" /> HTML 원본
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => focusedDocUrl && window.open(focusedDocUrl, "_blank", "noopener,noreferrer")}
                      disabled={!focusedDocUrl}
                      className="flex-1 gap-1.5"
                    >
                      <BookOpen className="w-3.5 h-3.5" /> 정책 MD 보기
                    </Button>
                  </div>
                </div>
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
              <Button variant="outline" onClick={revise}>
                다시 만들기
              </Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>닫기</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
