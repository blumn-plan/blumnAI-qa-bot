"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { forward, feedback } from "@/lib/api";

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

/** [📤 기획전달] 모달 — qa/decisions/ 에 md 커밋. */
export function ForwardDialog({
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
  const [questioner, setQuestioner] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>📤 기획전달</DialogTitle>
          <DialogDescription>
            정책 변경/신설 요청을 <code className="text-xs">qa/decisions/</code> 폴더에 md 파일로 커밋합니다.
            기획자가 검토 후 [적용] 처리.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="fw-title">요청 제목 <span className="text-red-500">*</span></Label>
            <Input id="fw-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 결제 실패 재시도 정책 신설" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fw-body">요청 본문 (마크다운) <span className="text-red-500">*</span></Label>
            <Textarea
              id="fw-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="변경 전/후 · 근거 · 대상 파일 위치 등"
              className="min-h-[180px] font-mono text-xs"
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
            {saving ? "커밋 중..." : "📤 GitHub 커밋"}
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
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            {saving ? "커밋 중..." : "📝 GitHub 커밋"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
