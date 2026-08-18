"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, PauseCircle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface CommonProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemTitle: string;
  /** 저장 콜백 · note 는 trim 된 상태로 전달 (빈 문자열이면 메모 없음) */
  onConfirm: (note: string) => Promise<void>;
}

/** ✅ 적용 처리 다이얼로그 · 메모 선택 입력 · 비워두면 그대로 적용 */
export function ApplyDecisionDialog({ open, onOpenChange, itemTitle, onConfirm }: CommonProps) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote("");
      setError(null);
      setSaving(false);
    }
  }, [open]);

  async function handle(withNote: boolean) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onConfirm(withNote ? note.trim() : "");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="w-5 h-5" /> 적용 처리
          </DialogTitle>
          <DialogDescription>
            협업자가 요청한 내용과 <b>실제로 적용·배포한 내용이 다르면</b> 아래에 차이를 적어주세요.
            입력한 내용은 합의문 상단에 <b>메모로 남아 협업자가 확인</b>합니다.
            비워두면 그대로 적용 처리됩니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <div className="text-[11px] text-slate-500 font-mono truncate" title={itemTitle}>
            📤 {itemTitle}
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={saving}
            placeholder="예) 요청한 14일 대신 카친캠 실측에 맞춰 1~27일로 적용, 장기 미접속은 300~365일로 조정"
            className="min-h-[120px] text-[13px]"
          />
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-[12px] text-red-800">
              ⚠️ {error}
            </div>
          )}
        </div>
        <DialogFooter className="gap-1.5">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            취소
          </Button>
          <Button
            variant="outline"
            onClick={() => handle(false)}
            disabled={saving}
            className="border-emerald-300 text-emerald-800 hover:bg-emerald-50 gap-1"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            그대로 적용
          </Button>
          <Button
            onClick={() => handle(true)}
            disabled={saving || !note.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            메모 저장하고 적용
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 🚫 보류 처리 다이얼로그 · 사유 필수 · 합의문 상단에 남음 */
export function HoldDecisionDialog({ open, onOpenChange, itemTitle, onConfirm }: CommonProps) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote("");
      setError(null);
      setSaving(false);
    }
  }, [open]);

  async function handleSave() {
    if (saving) return;
    if (!note.trim()) {
      setError("보류 사유는 필수입니다.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(note.trim());
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2 text-amber-700">
            <PauseCircle className="w-5 h-5" /> 보류 처리
          </DialogTitle>
          <DialogDescription>
            보류 사유를 적어주세요. 입력한 내용은 합의문 <b>상단 박스에 남아 협업자가 확인</b>합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <div className="text-[11px] text-slate-500 font-mono truncate" title={itemTitle}>
            📤 {itemTitle}
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={saving}
            placeholder="예) 카친캠 실측 확인 후 재검토 필요 — 다음 스프린트로 이관"
            className="min-h-[120px] text-[13px]"
            autoFocus
          />
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-[12px] text-red-800">
              ⚠️ {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            취소
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !note.trim()}
            className="bg-amber-600 hover:bg-amber-700 text-white gap-1"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PauseCircle className="w-3.5 h-3.5" />}
            보류로 저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
