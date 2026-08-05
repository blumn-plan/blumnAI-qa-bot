"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deriveTeamSlug, upsertTeam } from "@/lib/api";
import { useTeamStore } from "@/lib/team-store";

interface TeamWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 마스터가 팀을 처음 만들 때 · 또는 [⚙️ 설정] 재편집 시 뜨는 wizard. */
export function TeamWizard({ open, onOpenChange }: TeamWizardProps) {
  const setActiveTeam = useTeamStore((s) => s.setActiveTeam);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [policiesDir, setPoliciesDir] = useState("");
  const [storyboardsDir, setStoryboardsDir] = useState("");
  const [masterPat, setMasterPat] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [plannerPassword, setPlannerPassword] = useState("");

  async function handleSave() {
    setError(null);
    const missing: string[] = [];
    if (!teamName.trim()) missing.push("팀 이름");
    if (!githubRepo.trim()) missing.push("GitHub 레포");
    if (!masterPat.trim()) missing.push("GitHub PAT");
    if (!anthropicKey.trim()) missing.push("Anthropic API Key");
    if (missing.length) {
      setError(`필수 항목: ${missing.join(", ")}`);
      return;
    }
    if (!/^[\w.-]+\/[\w.-]+$/.test(githubRepo.trim())) {
      setError('GitHub 레포는 "org/repo" 형식이어야 합니다');
      return;
    }
    const slug = deriveTeamSlug(githubRepo.trim());
    if (!slug) {
      setError("팀 slug 파생 실패 · GitHub 레포명 확인");
      return;
    }
    setSaving(true);
    try {
      await upsertTeam(slug, {
        team_name: teamName.trim(),
        github_repo: githubRepo.trim(),
        master_pat: masterPat.trim(),
        anthropic_key: anthropicKey.trim(),
        planner_password: plannerPassword.trim() || undefined,
        projects: [{
          slug: "default",
          label: "기본 프로젝트",
          policies_dir: policiesDir.trim(),
          storyboards_dir: storyboardsDir.trim(),
        }],
      });
      setActiveTeam(slug);
      // URL 에도 반영
      const url = new URL(window.location.href);
      url.searchParams.set("team", slug);
      window.history.replaceState({}, "", url.toString());
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="text-center mb-2">
            <div className="text-4xl">🚀</div>
          </div>
          <DialogTitle className="text-center">blumnAI QA 봇 시작하기</DialogTitle>
          <DialogDescription className="text-center">
            팀 정책·코드 위치와 API 키를 입력하면 바로 시작합니다 (3분)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="tw-name">
              팀 이름 <span className="text-red-500">*</span>
            </Label>
            <Input id="tw-name" placeholder="예: 광고팀" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tw-repo">
              정책 문서 GitHub 레포 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="tw-repo"
              placeholder="예: blumn/ad-team-policies"
              className="font-mono"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">org/repo 형식 · private 도 OK</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="tw-policies">정책 폴더</Label>
              <Input
                id="tw-policies"
                placeholder="예: docs/policies"
                className="font-mono text-xs"
                value={policiesDir}
                onChange={(e) => setPoliciesDir(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tw-storyboards">화면설계서 폴더 (선택)</Label>
              <Input
                id="tw-storyboards"
                placeholder="예: docs/storyboards"
                className="font-mono text-xs"
                value={storyboardsDir}
                onChange={(e) => setStoryboardsDir(e.target.value)}
              />
            </div>
          </div>

          <div className="border-t border-dashed pt-3 mt-4">
            <p className="text-xs text-muted-foreground">
              🔒 <b>인증 정보</b> — 백엔드 서버에 암호화 없이 저장됨 (Phase Y1a MVP).
              사내망 안이라 안전하지만, 담당자만 봇을 세팅해야 함.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="tw-pat">
              GitHub PAT <span className="text-red-500">*</span>
            </Label>
            <Input
              id="tw-pat"
              type="password"
              placeholder="ghp_..."
              className="font-mono text-xs"
              value={masterPat}
              onChange={(e) => setMasterPat(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Classic PAT (repo scope).{" "}
              <a
                className="text-indigo-500 underline"
                target="_blank"
                rel="noopener noreferrer"
                href="https://github.com/settings/tokens/new?scopes=repo&description=blumnai-qa-bot"
              >
                발급하기 →
              </a>
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tw-anthropic">
              Anthropic API Key <span className="text-red-500">*</span>
            </Label>
            <Input
              id="tw-anthropic"
              type="password"
              placeholder="sk-ant-..."
              className="font-mono text-xs"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tw-pw">기획자 모드 비번 (선택)</Label>
            <Input
              id="tw-pw"
              placeholder="qa-planner 접근 비번"
              value={plannerPassword}
              onChange={(e) => setPlannerPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
              ⚠️ {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "저장 중..." : "💾 저장하고 시작하기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
