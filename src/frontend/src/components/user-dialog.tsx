"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUserStore, formatDisplayName } from "@/lib/user-store";
import { preventCasualDismiss } from "@/lib/utils";

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 사용자 이름·역할 설정 다이얼로그. 기획전달 questioner 필드로 쓰임.
 *  · 이름·역할을 별도 입력 → 표시할 때 자동으로 "업무-닉네임" 로 결합 (예: QA-이반). */
export function UserDialog({ open, onOpenChange }: UserDialogProps) {
  const savedName = useUserStore((s) => s.name);
  const savedRole = useUserStore((s) => s.role);
  const setUser = useUserStore((s) => s.setUser);
  const [name, setName] = useState(savedName);
  const [role, setRole] = useState(savedRole);

  // 다이얼로그 열릴 때마다 저장된 값 재로드
  useEffect(() => {
    if (open) {
      setName(savedName);
      setRole(savedRole);
    }
  }, [open, savedName, savedRole]);

  function handleSave() {
    setUser(name.trim(), role.trim());
    onOpenChange(false);
  }

  const preview = formatDisplayName(name, role);

  return (
    <Dialog open={open} onOpenChange={preventCasualDismiss(onOpenChange)}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>👤 사용자 이름·역할 설정</DialogTitle>
          <DialogDescription>
            기획전달 요청 시 요청자로 표시되며, 답변 개인화에도 쓰입니다.
            <br />브라우저에만 저장 · 서버 전송 안 됨.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="ud-name">닉네임 <span className="text-red-500">*</span></Label>
            <Input
              id="ud-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 제이 · 루시 · 이반"
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) handleSave();
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ud-role">맡은 업무</Label>
            <Input
              id="ud-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="예: QA · DEV · 기획팀"
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) handleSave();
              }}
            />
          </div>
          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2">
            표시명 미리보기 · <span className="font-mono font-semibold text-slate-900">{preview || "(닉네임을 먼저 입력하세요)"}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            닉네임만 입력하면 <span className="font-mono">닉네임</span> 만 표시 · 둘 다 입력하면 <span className="font-mono">업무-닉네임</span> 자동 결합 (예: <span className="font-mono">QA-이반</span>).
            <br />비워두면 &quot;게스트&quot; 로 표시됩니다.
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
