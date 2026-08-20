"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { deriveTeamSlug, upsertTeam, ProjectPayload, TeamResponse } from "@/lib/api";
import { useTeamStore } from "@/lib/team-store";
import { preventCasualDismiss } from "@/lib/utils";

interface TeamWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 편집 모드: 기존 팀 값으로 pre-fill · github_repo 잠금 · 시크릿은 "비워두면 기존값 유지". */
  existingTeam?: TeamResponse | null;
  /** 저장 성공 후 호출 · 부모가 팀 config · 문서 리스트를 재로드해야 함 (프로젝트 편집 반영). */
  onSaved?: () => void;
}

interface WizardProject {
  label: string;
  slug: string; // auto-derived · 사용자에게 안 보임 (첫 카드는 default)
  policiesDir: string;
  storyboardsDir: string;
  codeRepo: string;
}

const emptyProject = (idx: number): WizardProject => ({
  label: idx === 0 ? "기본 프로젝트" : "",
  slug: idx === 0 ? "default" : `project-${idx + 1}`,
  policiesDir: "",
  storyboardsDir: "",
  codeRepo: "",
});

/** 마스터가 팀을 처음 만들 때 · 또는 [⚙️ 설정] 재편집 시 뜨는 wizard.
 *  existingTeam 주면 편집 모드로 작동 (pre-fill · 시크릿 보호 · repo 잠금). */
export function TeamWizard({ open, onOpenChange, existingTeam, onSaved }: TeamWizardProps) {
  const setActiveTeam = useTeamStore((s) => s.setActiveTeam);
  const isEdit = Boolean(existingTeam);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [projects, setProjects] = useState<WizardProject[]>([emptyProject(0)]);
  const [masterPat, setMasterPat] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [plannerPassword, setPlannerPassword] = useState("");

  // Dialog 열릴 때 · 기존 팀 있으면 값 pre-fill (시크릿 3개는 비운 상태로 · 저장 시 undefined 로 skip)
  useEffect(() => {
    if (!open) return;
    if (existingTeam) {
      setTeamName(existingTeam.team_name);
      setGithubRepo(existingTeam.github_repo);
      setProjects(
        existingTeam.projects.length > 0
          ? existingTeam.projects.map((p, idx) => ({
              label: p.label,
              slug: p.slug || (idx === 0 ? "default" : `project-${idx + 1}`),
              policiesDir: p.policies_dir,
              storyboardsDir: p.storyboards_dir,
              codeRepo: p.code_repo,
            }))
          : [emptyProject(0)],
      );
      // 시크릿은 절대 pre-fill 안 함 (마스킹된 값을 저장하면 실제 시크릿이 손상됨)
      setMasterPat("");
      setAnthropicKey("");
      setPlannerPassword("");
      setError(null);
    } else {
      // 신규 생성 모드: 완전 리셋
      setTeamName("");
      setGithubRepo("");
      setProjects([emptyProject(0)]);
      setMasterPat("");
      setAnthropicKey("");
      setPlannerPassword("");
      setError(null);
    }
  }, [open, existingTeam]);

  function updateProject(idx: number, patch: Partial<WizardProject>) {
    setProjects((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  function addProject() {
    setProjects((prev) => [...prev, emptyProject(prev.length)]);
  }
  function removeProject(idx: number) {
    setProjects((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setError(null);
    const missing: string[] = [];
    if (!teamName.trim()) missing.push("팀 이름");
    if (!githubRepo.trim()) missing.push("GitHub 레포");
    // 편집 모드에선 시크릿 비어있어도 OK (backend 가 기존값 유지)
    if (!isEdit) {
      if (!masterPat.trim()) missing.push("GitHub PAT");
      if (!anthropicKey.trim()) missing.push("Anthropic API Key");
    }
    if (missing.length) {
      setError(`필수 항목: ${missing.join(", ")}`);
      return;
    }
    if (!/^[\w.-]+\/[\w.-]+$/.test(githubRepo.trim())) {
      setError('GitHub 레포는 "org/repo" 형식이어야 합니다');
      return;
    }
    // 프로젝트 검증
    const cleanProjects: ProjectPayload[] = projects.map((p, i) => ({
      slug: (p.slug || `project-${i + 1}`).trim(),
      label: p.label.trim() || `프로젝트 ${i + 1}`,
      policies_dir: p.policiesDir.trim(),
      storyboards_dir: p.storyboardsDir.trim(),
      code_repo: p.codeRepo.trim(),
    }));
    if (cleanProjects.length === 0) {
      setError("최소 1개 프로젝트 필요");
      return;
    }
    for (const p of cleanProjects) {
      if (!p.policies_dir) {
        setError(`프로젝트 "${p.label}" 의 정책 문서 폴더는 필수입니다`);
        return;
      }
    }
    const slugs = cleanProjects.map((p) => p.slug);
    const dup = slugs.find((s, i) => slugs.indexOf(s) !== i);
    if (dup) {
      setError(`프로젝트 slug 중복: "${dup}" — 이름을 다르게 하세요`);
      return;
    }

    const teamSlug = deriveTeamSlug(githubRepo.trim());
    if (!teamSlug) {
      setError("팀 slug 파생 실패 · GitHub 레포명 확인");
      return;
    }
    setSaving(true);
    try {
      // 편집 모드: 시크릿은 사용자가 입력했을 때만 전송 (빈 값이면 undefined → backend 가 기존값 유지)
      const patValue = masterPat.trim();
      const keyValue = anthropicKey.trim();
      const pwValue = plannerPassword.trim();
      await upsertTeam(teamSlug, {
        team_name: teamName.trim(),
        github_repo: githubRepo.trim(),
        master_pat: patValue || undefined,
        anthropic_key: keyValue || undefined,
        planner_password: pwValue || undefined,
        projects: cleanProjects,
      });
      setActiveTeam(teamSlug);
      const url = new URL(window.location.href);
      url.searchParams.set("team", teamSlug);
      window.history.replaceState({}, "", url.toString());
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={preventCasualDismiss(onOpenChange)}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="text-center mb-2">
            <div className="text-4xl">{isEdit ? "⚙️" : "🚀"}</div>
          </div>
          <DialogTitle className="text-center">
            {isEdit ? "팀 설정 편집" : "blumnAI QA 봇 시작하기"}
          </DialogTitle>
          <DialogDescription className="text-center">
            {isEdit
              ? "기존 설정을 그대로 두려면 시크릿 필드를 비워두세요 (기존값 유지)"
              : "팀 정책·코드 위치와 API 키를 입력하면 바로 시작합니다 (5분)"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ── 1. 팀 정보 ── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">1. 팀 정보</h3>
            <div className="space-y-1">
              <Label htmlFor="tw-name">
                팀 이름 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="tw-name"
                placeholder={isEdit && existingTeam?.team_name ? existingTeam.team_name : "예: 광고팀"}
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tw-repo">
                GitHub 정책 문서 레포 <span className="text-red-500">*</span>
                {isEdit && <span className="ml-2 text-xs text-muted-foreground">🔒 변경 불가 (팀 식별자)</span>}
              </Label>
              <Input
                id="tw-repo"
                placeholder={isEdit && existingTeam?.github_repo ? existingTeam.github_repo : "예: blumn/ad-team-policies"}
                className="font-mono"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                readOnly={isEdit}
                disabled={isEdit}
              />
              <p className="text-xs text-muted-foreground">
                org/repo 형식 · private 도 OK. 봇이 팀 정책·화면설계서 md 를 여기서 읽고, 기획전달·답변규칙 md 를 여기에 커밋합니다.
                {isEdit && " 이 값을 바꾸려면 새 팀을 만드세요."}
              </p>
            </div>
          </section>

          <Separator />

          {/* ── 2. 프로젝트 매칭 세트 ── */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">2. 프로젝트 · 매칭 세트</h3>
              <p className="text-xs text-muted-foreground mt-1">
                한 카드 = <b>정책 · 화면설계서 · 서비스 코드</b> 한 세트. 팀에 여러 프로젝트가 있으면 카드를 여러 개 추가하세요.
                (예: 어드민 정책/화면/코드 = 카드 1, 백오피스 정책/화면/코드 = 카드 2)
              </p>
            </div>

            {projects.map((p, idx) => (
              <div key={idx} className="border rounded-md p-3 space-y-2 bg-slate-50">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">📦 프로젝트 {idx + 1}</Badge>
                  <div className="flex-1" />
                  {projects.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeProject(idx)}>🗑 삭제</Button>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`tw-p-label-${idx}`} className="text-xs">
                    프로젝트 이름 {idx === 0 ? "" : <span className="text-red-500">*</span>}
                  </Label>
                  <Input
                    id={`tw-p-label-${idx}`}
                    value={p.label}
                    onChange={(e) => updateProject(idx, { label: e.target.value })}
                    placeholder={
                      isEdit && existingTeam?.projects[idx]?.label
                        ? existingTeam.projects[idx].label
                        : "예: 어드민 v1, 마케팅, 백오피스..."
                    }
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`tw-p-pol-${idx}`} className="text-xs">
                    정책 문서 폴더 <span className="text-red-500">*</span> <span className="text-muted-foreground">(여러 개면 줄바꿈)</span>
                  </Label>
                  <Textarea
                    id={`tw-p-pol-${idx}`}
                    value={p.policiesDir}
                    onChange={(e) => updateProject(idx, { policiesDir: e.target.value })}
                    placeholder={
                      isEdit && existingTeam?.projects[idx]?.policies_dir
                        ? existingTeam.projects[idx].policies_dir
                        : "예:\ndocs/policies\nprojects/admin/docs/policies"
                    }
                    className="font-mono text-xs min-h-[54px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`tw-p-story-${idx}`} className="text-xs">
                    화면설계서 폴더 <span className="text-muted-foreground">(선택 · 여러 개 가능)</span>
                  </Label>
                  <Textarea
                    id={`tw-p-story-${idx}`}
                    value={p.storyboardsDir}
                    onChange={(e) => updateProject(idx, { storyboardsDir: e.target.value })}
                    placeholder={
                      isEdit && existingTeam?.projects[idx]?.storyboards_dir
                        ? existingTeam.projects[idx].storyboards_dir
                        : "예:\ndocs/storyboards"
                    }
                    className="font-mono text-xs min-h-[54px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`tw-p-code-${idx}`} className="text-xs">
                    서비스 코드 레포 <span className="text-muted-foreground">(선택 · 여러 개면 줄바꿈)</span>
                  </Label>
                  <Textarea
                    id={`tw-p-code-${idx}`}
                    value={p.codeRepo}
                    onChange={(e) => updateProject(idx, { codeRepo: e.target.value })}
                    placeholder={
                      isEdit && existingTeam?.projects[idx]?.code_repo
                        ? existingTeam.projects[idx].code_repo
                        : "예:\nblumn/admin-frontend\nblumn/admin-backend"
                    }
                    className="font-mono text-xs min-h-[54px]"
                  />
                </div>
              </div>
            ))}
            <Button variant="outline" onClick={addProject} className="w-full">
              + 다른 프로젝트 추가
            </Button>
          </section>

          <Separator />

          {/* ── 3. 인증 정보 ── */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">3. 인증 정보</h3>
              <p className="text-xs text-muted-foreground mt-1">
                🔐 DB 저장 시 <b>AES-256-GCM 암호화</b> · 기획자 비번은 <b>bcrypt 해싱</b> (ISMS 대응). 담당자만 세팅하세요.
              </p>
            </div>

            {/* GitHub PAT */}
            <div className="space-y-1">
              <Label htmlFor="tw-pat">
                GitHub PAT {!isEdit && <span className="text-red-500">*</span>}
                {isEdit && existingTeam?.master_pat && (
                  <span className="ml-2 text-xs font-mono text-muted-foreground">
                    현재: {existingTeam.master_pat}
                  </span>
                )}
              </Label>
              <Input
                id="tw-pat"
                type="password"
                placeholder={isEdit ? "비워두면 기존값 유지 · 변경 시 새 PAT 입력" : "ghp_..."}
                className="font-mono text-xs"
                value={masterPat}
                onChange={(e) => setMasterPat(e.target.value)}
              />
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-slate-700">
                  ❓ 이게 뭐고 어떻게 발급받나요?
                </summary>
                <div className="mt-2 pl-3 border-l-2 border-slate-200 space-y-1.5">
                  <p><b>왜 필요?</b> 봇이 팀 정책 레포에 답변 규칙·기획전달 md 를 커밋할 때 씁니다.</p>
                  <p><b>발급 순서:</b></p>
                  <ol className="list-decimal list-inside space-y-0.5 ml-2">
                    <li>아래 [발급하기] 링크 클릭 (scopes 는 자동으로 <code className="text-xs bg-slate-100 px-1 rounded">repo</code> 만 체크된 상태로 열림)</li>
                    <li>페이지에서 <b>Note</b>: 아무거나 (예: <code className="text-xs bg-slate-100 px-1 rounded">blumnai-qa-bot</code>)</li>
                    <li><b>Expiration</b>: 원하는대로 (권장: 90 days 이상 · 만료되면 다시 발급 필요)</li>
                    <li><b>Select scopes</b>: <code className="text-xs bg-slate-100 px-1 rounded">repo</code> 하나만 체크되어있는지 확인 (자동 선택됨)</li>
                    <li>[<b>Generate token</b>] → 표시된 <code className="text-xs bg-slate-100 px-1 rounded">ghp_...</code> 를 복사</li>
                    <li>이 창의 위 입력창에 붙여넣기</li>
                  </ol>
                  <p className="text-red-600">⚠️ 토큰은 채팅창(Claude Code 등)에 붙여넣지 말고, <b>반드시 이 입력창에만</b> 넣으세요.</p>
                  <a
                    className="inline-block mt-1 text-indigo-600 underline"
                    target="_blank"
                    rel="noopener noreferrer"
                    href="https://github.com/settings/tokens/new?scopes=repo&description=blumnai-qa-bot"
                  >
                    발급하기 →
                  </a>
                </div>
              </details>
            </div>

            {/* Anthropic API Key */}
            <div className="space-y-1">
              <Label htmlFor="tw-anthropic">
                Anthropic API Key {!isEdit && <span className="text-red-500">*</span>}
                {isEdit && existingTeam?.anthropic_key && (
                  <span className="ml-2 text-xs font-mono text-muted-foreground">
                    현재: {existingTeam.anthropic_key}
                  </span>
                )}
              </Label>
              <Input
                id="tw-anthropic"
                type="password"
                placeholder={isEdit ? "비워두면 기존값 유지 · 변경 시 새 키 입력" : "sk-ant-..."}
                className="font-mono text-xs"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
              />
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-slate-700">
                  ❓ 이게 뭐고 어떻게 발급받나요?
                </summary>
                <div className="mt-2 pl-3 border-l-2 border-slate-200 space-y-1.5">
                  <p><b>왜 필요?</b> QA 봇 답변은 Anthropic 의 Claude 모델을 호출해서 만듭니다. 이 키로 호출한 비용은 등록된 팀 크레딧에서 차감됩니다.</p>
                  <p><b>발급 순서:</b></p>
                  <ol className="list-decimal list-inside space-y-0.5 ml-2">
                    <li>아래 [Anthropic Console] 링크 클릭 · 로그인 (없으면 회원가입)</li>
                    <li>결제 정보 등록 & <b>크레딧 충전</b> (팀당 최소 $5 권장 · 없으면 답변 불가)</li>
                    <li>왼쪽 메뉴 <b>API Keys</b> → [<b>Create Key</b>]</li>
                    <li>이름 아무거나 (예: <code className="text-xs bg-slate-100 px-1 rounded">blumnai-qa-bot</code>) → 생성</li>
                    <li>표시된 <code className="text-xs bg-slate-100 px-1 rounded">sk-ant-...</code> 를 복사 (한 번만 표시됨!)</li>
                    <li>이 창의 위 입력창에 붙여넣기</li>
                  </ol>
                  <p className="text-red-600">⚠️ 이 키도 채팅창(Claude Code 등)에 붙여넣지 말고, <b>반드시 이 입력창에만</b>.</p>
                  <a
                    className="inline-block mt-1 text-indigo-600 underline"
                    target="_blank"
                    rel="noopener noreferrer"
                    href="https://console.anthropic.com/settings/keys"
                  >
                    Anthropic Console 열기 →
                  </a>
                </div>
              </details>
            </div>

            {/* 기획자 모드 비번 */}
            <div className="space-y-1">
              <Label htmlFor="tw-pw">
                기획자 모드 비번 <span className="text-muted-foreground text-xs">(선택)</span>
                {isEdit && existingTeam?.planner_password && existingTeam.planner_password !== "" && (
                  <span className="ml-2 text-xs font-mono text-muted-foreground">
                    현재: {existingTeam.planner_password}
                  </span>
                )}
              </Label>
              <Input
                id="tw-pw"
                type="password"
                placeholder={
                  isEdit
                    ? existingTeam?.planner_password
                      ? "비워두면 기존값 유지 · 변경 시 새 비번 입력"
                      : "비워두면 기획자 모드 비활성화"
                    : "비워두면 기획자 모드 비활성화"
                }
                value={plannerPassword}
                onChange={(e) => setPlannerPassword(e.target.value)}
              />
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-slate-700">
                  ❓ 기획자 모드가 뭐예요?
                </summary>
                <div className="mt-2 pl-3 border-l-2 border-slate-200 space-y-1.5">
                  <p>
                    QA 봇에는 두 종류의 사용자가 있습니다:
                  </p>
                  <ul className="list-disc list-inside ml-2 space-y-0.5">
                    <li><b>일반 사용자</b> (개발자·마케터·CS 등): 질문 · 답변 확인 · [📤 기획전달] · [📝 답변규칙 추가] 요청만 가능</li>
                    <li><b>기획자</b> (정책 승인권자): 위 요청들을 <b>[✅ 적용]</b> · <b>[🗑 삭제]</b> · 팀 설정 편집 등 <b>관리 액션</b> 실행</li>
                  </ul>
                  <p>기획자 모드 비번은 <b>팀 내 기획자들끼리만 공유</b>하는 비번입니다.</p>
                  <p>페이지 우상단 [🎯 기획자] 버튼 → 이 비번 입력 시 기획자 모드로 전환됩니다.</p>
                  <p className="text-slate-500">💡 비워두면 기획자 모드 자체가 비활성화 (모두 일반 사용자로만 사용). 나중에 설정에서 언제든 추가 가능.</p>
                </div>
              </details>
            </div>
          </section>

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
