"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { forward, feedback } from "@/lib/api";
import { preventCasualDismiss } from "@/lib/utils";
import { useUserStore } from "@/lib/user-store";

interface ActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamSlug: string;
  activeDocPath?: string;
  initialTitle?: string;
  initialBody?: string;
  /** 완료 후 UI에 성공 배너 등 트리거 (선택). */
  onSuccess?: (result: { path: string; commitSha: string; htmlUrl: string }) => void;
}

interface ForwardDialogProps extends ActionDialogProps {
  /** AI 답변에 「📋 변경 제안」 블록이 있어서 구조화된 초안이 채워졌는지 · 배지 노출용 */
  hasProposal?: boolean;
}

/** [📤 기획전달] 모달 — qa/decisions/ 에 md 커밋.
 *  자동 초안:
 *   · AI 답변에 「📋 변경 제안」 블록이 있으면 → 6필드 구조화된 「합의 요약」
 *   · 없으면 → 최근 Q/A 3라운드 fallback 요약
 *   · 답변이 하나도 없으면 → 빈 다이얼로그 (사용자가 직접 작성)
 *  사용자가 초안 그대로 커밋해도 되고, 편집해도 됨. */
export function ForwardDialog({
  open,
  onOpenChange,
  teamSlug,
  activeDocPath,
  initialTitle = "",
  initialBody = "",
  hasProposal = false,
  onSuccess,
}: ForwardDialogProps) {
  const savedUserName = useUserStore((s) => s.name);
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [questioner, setQuestioner] = useState(savedUserName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 다이얼로그가 새로 열릴 때마다 초안을 최신 값으로 다시 채움 (챗 진행되며 변경 제안 갱신 반영)
  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setBody(initialBody);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTitle, initialBody]);

  async function handleSubmit() {
    if (!title.trim()) return setError("제목 필수");
    if (!body.trim()) return setError("본문 필수");
    setSaving(true);
    setError(null);
    try {
      const res = await forward(teamSlug, {
        title: title.trim(),
        body: body.trim(),
        docPath: activeDocPath,
        questioner: questioner.trim() || undefined,
      });
      onSuccess?.({ path: res.decisionPath, commitSha: res.commitSha, htmlUrl: res.htmlUrl });
      onOpenChange(false);
      setTitle("");
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={preventCasualDismiss(onOpenChange)}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📤 기획전달
            {hasProposal && (
              <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 rounded px-1.5 py-0.5 font-normal">
                AI 변경 제안 반영됨
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            정책 변경/신설 요청을 기획자에게 전달합니다. 기획자가 <b>기획자 모드 (/planner)</b> 에서
            검토한 뒤 정책 문서를 실제 업데이트 · 커밋합니다.
          </DialogDescription>
        </DialogHeader>

        {/* 언제 · 무엇 · 어떻게 가이드 스트립 */}
        <div className="text-[11px] bg-slate-50 border border-slate-200 rounded p-2.5 space-y-1 leading-relaxed">
          <div><b>💡 언제 누르나요?</b> 답변에서 <b>정책 미정의</b> 라고 나오거나, 답변 내용이 실무와 안 맞아 <b>정책을 바꿔야겠다</b> 싶을 때.</div>
          <div><b>📝 아래 「합의 요약」 은 자동으로 채워집니다.</b> {hasProposal
            ? "AI 답변에 「📋 변경 제안」 이 있어서 6항목(대상 파일 · 위치 · 변경 전/후 · 근거) 이 구조화됐어요."
            : "AI 답변에 「📋 변경 제안」 이 없어서 최근 대화를 요약했어요 · 필요하면 편집하세요."}</div>
          <div><b>✔ 그대로 전달해도 되고, 편집 후 전달해도 됩니다.</b> 전달되면 기획자 모드 사이드바의 「기획자 전달이력」 에 나타나요.</div>
        </div>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="fw-title">요청 제목 <span className="text-red-500">*</span></Label>
            <Input id="fw-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 결제 실패 재시도 정책 신설" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fw-body">
              합의 요약 <span className="text-slate-400 font-normal">— 기획자가 이것만 봐도 판단 가능하게</span> <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="fw-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="변경 전/후 · 근거 · 대상 파일 위치 등"
              className="min-h-[200px] font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fw-questioner">요청자 (선택 · @없이)</Label>
            <Input id="fw-questioner" value={questioner} onChange={(e) => setQuestioner(e.target.value)} placeholder="예: alice" />
          </div>
          {activeDocPath && (
            <div className="text-xs text-muted-foreground font-mono">
              관련 문서: {activeDocPath}
            </div>
          )}
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">⚠️ {error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>취소</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "전달 중..." : "📤 기획자에게 전달"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** [📝 답변 규칙] 모달 — qa/feedback/ 에 md 커밋. */
export function FeedbackDialog({
  open,
  onOpenChange,
  teamSlug,
  activeDocPath,
  initialTitle = "",
  initialBody = "",
  onSuccess,
}: ActionDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setBody(initialBody);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTitle, initialBody]);

  async function handleSubmit() {
    if (!title.trim()) return setError("제목 필수");
    if (!body.trim()) return setError("본문 필수");
    setSaving(true);
    setError(null);
    try {
      const res = await feedback(teamSlug, {
        title: title.trim(),
        body: body.trim(),
        docPath: activeDocPath,
      });
      onSuccess?.({ path: res.feedbackPath, commitSha: res.commitSha, htmlUrl: res.htmlUrl });
      onOpenChange(false);
      setTitle("");
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={preventCasualDismiss(onOpenChange)}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>📝 답변 규칙 추가</DialogTitle>
          <DialogDescription>
            AI 답변 톤·형식·강조점 등 답변 규칙을 <code className="text-xs">qa/feedback/</code> 폴더에 md 로 저장.
            이후 QA 답변에 자동 반영됨.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="fb-title">규칙 제목 <span className="text-red-500">*</span></Label>
            <Input id="fb-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 답변 톤 · 짧고 명확하게" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fb-body">규칙 내용 (마크다운) <span className="text-red-500">*</span></Label>
            <Textarea
              id="fb-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="예: 답변은 3문장 이내로 · 근거 §번호 필수"
              className="min-h-[150px] font-mono text-xs"
            />
          </div>
          {activeDocPath && (
            <div className="text-xs text-muted-foreground font-mono">
              관련 문서: {activeDocPath}
            </div>
          )}
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">⚠️ {error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>취소</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "저장 중..." : "📝 규칙 저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
