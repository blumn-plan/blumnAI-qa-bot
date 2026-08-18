"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUserStore } from "@/lib/user-store";
import { preventCasualDismiss } from "@/lib/utils";

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 사용자 이름 설정 다이얼로그. 기획전달 questioner 필드로 쓰임. */
export function UserDialog({ open, onOpenChange }: UserDialogProps) {
  const savedName = useUserStore((s) => s.name);
  const setName = useUserStore((s) => s.setName);
  const [draft, setDraft] = useState(savedName);

  // 다이얼로그 열릴 때마다 저장된 값 재로드
  useEffect(() => {
    if (open) setDraft(savedName);
  }, [open, savedName]);

  function handleSave() {
    setName(draft.trim());
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={preventCasualDismiss(onOpenChange)}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>👤 사용자 이름 설정</DialogTitle>
          <DialogDescription>
            기획전달 요청 시 요청자로 표시되며, 답변 개인화에도 쓰입니다.
            <br />브라우저에만 저장 · 서버 전송 안 됨.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="ud-name">이름</Label>
          <Input
            id="ud-name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="예: 제이 · 홍길동 · CS팀"
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) handleSave();
            }}
          />
          <p className="text-xs text-muted-foreground">
            비워두면 &quot;게스트&quot; 로 표시됩니다.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSave}>💾 저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
