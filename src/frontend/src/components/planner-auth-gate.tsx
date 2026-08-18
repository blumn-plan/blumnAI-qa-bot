"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyPlanner, ApiError } from "@/lib/api";
import { usePlannerAuthStore } from "@/lib/planner-auth-store";

interface PlannerAuthGateProps {
  teamSlug: string;
  teamName?: string;
  children: React.ReactNode;
}

/** 기획자 모드 진입 게이트. sessionStorage 로 팀별 인증 유지 (탭 닫으면 초기화). */
export function PlannerAuthGate({ teamSlug, teamName, children }: PlannerAuthGateProps) {
  const isAuthed = usePlannerAuthStore((s) => s.isAuthed(teamSlug));
  const authorize = usePlannerAuthStore((s) => s.authorize);
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || checking) return;
    setError(null);
    setChecking(true);
    try {
      const res = await verifyPlanner(teamSlug, password.trim());
      if (res.ok) {
        authorize(teamSlug);
        setPassword("");
        return;
      }
      if (res.reason === "no-password") {
        setError("이 팀은 기획자 모드 비번이 설정되어있지 않습니다. 마스터에게 [⚙️ 설정] 에서 비번을 지정하도록 요청하세요.");
      } else {
        setError("비번이 틀립니다.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  }

  if (isAuthed) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white border rounded-lg shadow-sm p-6 space-y-4">
        <div className="text-center">
          <div className="text-5xl mb-2">🎯</div>
          <h1 className="text-xl font-bold">기획자 모드</h1>
          <p className="text-sm text-muted-foreground mt-1">
            팀 <b>{teamName || teamSlug}</b> 의 기획자 비번을 입력하세요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="pa-pw">기획자 비번</Label>
            <Input
              id="pa-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="팀 내에서 공유된 비번"
              autoFocus
            />
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
              ⚠️ {error}
            </div>
          )}
          <Button type="submit" disabled={!password.trim() || checking} className="w-full">
            {checking ? "확인 중..." : "🔓 기획자 모드 진입"}
          </Button>
        </form>

        <div className="text-xs text-muted-foreground space-y-1 pt-3 border-t">
          <p>💡 기획자 모드는 브라우저 탭을 닫을 때까지만 유지됩니다.</p>
          <p>💡 이 팀의 [적용] / [🗑 삭제] 등 관리 액션은 기획자만 실행 가능.</p>
        </div>

        <div className="text-center">
          <Link href={`/?team=${encodeURIComponent(teamSlug)}`} className="text-xs text-indigo-600 underline">
            ← 협업자 모드로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
