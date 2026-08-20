"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Link2, Target, User as UserIcon, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TeamWizard } from "@/components/team-wizard";
import { DocsSidebar } from "@/components/docs-sidebar";
import { DocViewer } from "@/components/doc-viewer";
import { ChatPanel } from "@/components/chat-panel";
import { UserDialog } from "@/components/user-dialog";
import { useTeamStore } from "@/lib/team-store";
import { useUserDisplayName } from "@/lib/user-store";
import { useUsageStore, estimateKrw, totalTokens } from "@/lib/usage-store";
import { useUiStore } from "@/lib/ui-store";
import { useLayoutStore } from "@/lib/layout-store";
import { useChatSessionsStore } from "@/lib/chat-sessions-store";
import { ColumnResizer } from "@/components/column-resizer";
import { getTeam, TeamResponse, DocEntry, ApiError } from "@/lib/api";

export default function Home() {
  const activeTeamSlug = useTeamStore((s) => s.activeTeamSlug);
  const setActiveTeam = useTeamStore((s) => s.setActiveTeam);
  const hasHydrated = useTeamStore((s) => s._hasHydrated);
  const userName = useUserDisplayName();
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [activeDoc, setActiveDoc] = useState<DocEntry | null>(null);
  // 챗 답변의 §X-Y 클릭 → 도큐 뷰어 스크롤 트리거 (nonce 로 같은 anchor 재클릭도 감지)
  const [citationTarget, setCitationTarget] = useState<{ anchor: string; nonce: number } | null>(null);
  // 프로젝트 변경 시 사이드바 강제 리로드용 counter
  const [refreshKey, setRefreshKey] = useState(0);
  // 사용량 배지용 · store 구독 (팀별 · 이달)
  const monthlyUsage = useUsageStore((s) =>
    activeTeamSlug ? s.byMonth[`${activeTeamSlug}:${new Date().toISOString().slice(0, 7)}`] : undefined,
  );
  // 3단 그리드 컬럼 폭 (localStorage persist)
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const chatWidth = useLayoutStore((s) => s.chatWidth);
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);
  const setChatWidth = useLayoutStore((s) => s.setChatWidth);
  // 참고 문서 선택 여부 · 미선택이면 챗 패널 자체를 숨김.
  //  · 「새 문의」·과거 세션 클릭 시엔 currentSessionId 가 있으므로 문서 미선택이어도 챗 패널 노출
  //    (과거 대화 열람 · 옛 세션 (docPaths 미저장) 도 챗 패널이 뜨도록).
  //  · scope 계산은 chat-panel 과 동일하지만, layout 결정을 위해 page 에서도 필요
  const useAllDocs = useUiStore((s) => s.useAllDocs);
  const selectedDocPaths = useUiStore((s) => s.selectedDocPaths);
  const currentSessionId = useChatSessionsStore((s) => s.currentSessionId);
  const chatReady = useAllDocs || selectedDocPaths.length > 0 || currentSessionId !== null;

  const loadTeam = useCallback(async (slug: string) => {
    setLoading(true);
    try {
      const t = await getTeam(slug);
      setTeam(t);
    } catch (err) {
      console.warn("[qa-bot] team load failed", err);
      if (err instanceof ApiError && err.status === 404) {
        setActiveTeam(null);
        setWizardOpen(true);
      }
    } finally {
      setLoading(false);
    }
  }, [setActiveTeam]);

  // 팀 로드 · wizard 오픈 결정.
  //  · URL ?team=X 우선 (초대 링크) → localStorage 값 override.
  //  · URL 체크를 wizard 결정 로직 안에 두어야 초대 링크로 들어온 사람에게 wizard flash 안 뜸.
  //  · 하이드레이션 완료 전까지 대기 (리로드 시 wizard flash 방지).
  useEffect(() => {
    if (!hasHydrated) return;
    const urlTeam = new URLSearchParams(window.location.search).get("team");
    // URL 초대 링크가 현재 저장된 팀과 다르면 URL 값을 우선 반영. 재렌더에서 loadTeam 진입.
    if (urlTeam && urlTeam !== activeTeamSlug) {
      setActiveTeam(urlTeam);
      return;
    }
    if (!activeTeamSlug) {
      setTeam(null);
      setLoading(false);
      setWizardOpen(true);
      return;
    }
    // 저장된 팀이 있으면 자동으로 wizard 닫고 로드 진행
    setWizardOpen(false);
    loadTeam(activeTeamSlug);
  }, [hasHydrated, activeTeamSlug, loadTeam, setActiveTeam]);

  // 「새 문의」 요청 시 activeDoc 도 함께 리셋 — chat-panel · docs-sidebar 모두 requestNewChat() 을 호출하면
  //  newChatNonce 가 오르고, 각 컴포넌트가 자기 상태를 리셋. page 는 activeDoc 담당.
  //  · 초기 mount 시엔 nonce=0 이라 useRef 로 첫 실행 무시
  const newChatNonce = useChatSessionsStore((s) => s.newChatNonce);
  const firstNewChatRun = useRef(true);
  useEffect(() => {
    if (firstNewChatRun.current) {
      firstNewChatRun.current = false;
      return;
    }
    setActiveDoc(null);
  }, [newChatNonce]);

  // 초대링크로 들어온 사람 대상 · 팀은 로드됐는데 이름이 없으면 이름부터 물어보기 (한 번만)
  const [namePromptShown, setNamePromptShown] = useState(false);
  useEffect(() => {
    if (!hasHydrated || !team || namePromptShown) return;
    if (!userName.trim()) {
      setUserDialogOpen(true);
      setNamePromptShown(true);
    }
  }, [hasHydrated, team, userName, namePromptShown]);

  // URL ?doc=<path> → 문서 자동 선택 · 소속 프로젝트도 activeProject 로 세팅
  // (Planner 의 [📄 관련 정책 열기] 딥링크 지원)
  const setActiveProject = useUiStore((s) => s.setActiveProject);
  const [docAutoSelected, setDocAutoSelected] = useState(false);
  useEffect(() => {
    if (!team || docAutoSelected) return;
    const params = new URLSearchParams(window.location.search);
    const docPath = params.get("doc");
    if (!docPath) { setDocAutoSelected(true); return; }
    // 소속 프로젝트 추정: policies_dir 또는 storyboards_dir 가 doc 경로의 접두어인 프로젝트
    const project = team.projects.find((p) => {
      const dirs = [
        ...(p.policies_dir?.split(/[\n,]+/) ?? []),
        ...(p.storyboards_dir?.split(/[\n,]+/) ?? []),
      ].map((s) => s.trim()).filter(Boolean);
      return dirs.some((d) => docPath.startsWith(d + "/") || docPath.startsWith(d));
    });
    if (project) setActiveProject(project.slug);
    // kind 추정: storyboards_dir 하위면 storyboard · 아니면 policy
    const isStory = project?.storyboards_dir
      ?.split(/[\n,]+/)
      .map((s) => s.trim())
      .some((d) => d && docPath.startsWith(d));
    setActiveDoc({
      path: docPath,
      title: docPath.split("/").pop()?.replace(/\.md$/i, "") ?? docPath,
      kind: isStory ? "storyboard" : "policy",
    });
    setDocAutoSelected(true);
  }, [team, docAutoSelected, setActiveProject]);

  async function copyInviteLink() {
    if (!team) return;
    const url = `${window.location.origin}/?team=${encodeURIComponent(team.team_slug)}`;
    try {
      await navigator.clipboard.writeText(url);
      alert(`✅ 초대 링크 복사됨:\n${url}\n\n팀원에게 이 링크를 공유하세요.\n(링크만 있으면 별도 설정 없이 바로 사용 가능)`);
    } catch {
      // clipboard 실패 시 prompt fallback
      window.prompt("초대 링크 (복사하세요):", url);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* 상단 헤더 · 라이트 셸 · 시각 위계 3단 (brand · meta · actions) */}
      <header className="border-b border-slate-200 bg-white px-4 h-12 flex items-center gap-3">
        <div className="font-semibold text-[14px] text-slate-900 tracking-tight">blumnAI QA</div>
        {team && (
          <span className="text-[12px] font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-md px-2 py-0.5">
            {team.team_name}
          </span>
        )}
        <div className="text-[11px] text-slate-400 hidden md:flex items-center gap-2 min-w-0">
          {team ? (
            <>
              <span className="font-mono truncate max-w-[220px]" title={team.github_repo}>
                {team.github_repo}
              </span>
              {team.projects.length > 0 && (
                <span className="text-slate-300">· 프로젝트 {team.projects.length}개</span>
              )}
            </>
          ) : loading ? <span>로딩 중...</span> : <span>팀 미설정</span>}
        </div>
        <div className="flex-1" />
        {team && monthlyUsage && (
          <span
            className="text-[11px] px-2 py-0.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200 font-mono tabular-nums"
            title={`이달 누적 · in ${monthlyUsage.in.toLocaleString()} · out ${monthlyUsage.out.toLocaleString()} · cache↺ ${monthlyUsage.cacheRead.toLocaleString()}\n대략 원화 (1토큰≈₩0.005)`}
          >
            {formatTokens(totalTokens(monthlyUsage))} · ₩{estimateKrw(monthlyUsage).toLocaleString()}
          </span>
        )}
        {team && (
          <>
            <button
              type="button"
              onClick={copyInviteLink}
              title="이 팀의 초대 링크 복사"
              className="h-7 px-2 text-[12px] text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors inline-flex items-center gap-1"
            >
              <Link2 className="w-3.5 h-3.5" /> 초대
            </button>
            <Link href={`/planner?team=${encodeURIComponent(team.team_slug)}`}>
              <button
                type="button"
                title="기획자 전용 화면으로 전환 · 전달받은 문의를 검토·적용·보류 처리"
                className="h-7 px-2.5 text-[12px] font-medium text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors inline-flex items-center gap-1"
              >
                <Target className="w-3.5 h-3.5" /> 기획자 모드
              </button>
            </Link>
          </>
        )}
        <button
          type="button"
          onClick={() => setUserDialogOpen(true)}
          title="사용자 이름 변경"
          className="h-7 px-2 text-[12px] text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors inline-flex items-center gap-1"
        >
          <UserIcon className="w-3.5 h-3.5" /> {userName || "게스트"}
        </button>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          title="팀 · 프로젝트 · 시크릿 설정"
          className="h-7 w-7 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors inline-flex items-center justify-center"
        >
          <Settings className="w-4 h-4" />
        </button>
      </header>

      {/* 메인 영역 · 3단 (사이드바 + 뷰어 + 챗) — 정책 열람과 AI 문의를 동시에 하는 flow */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {!team ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md p-6">
              <div className="text-5xl mb-3">🎯</div>
              <h1 className="text-2xl font-bold mb-2">blumnAI QA Bot</h1>
              <p className="text-sm text-muted-foreground mb-6">
                정책·화면설계서 기반 AI 자동응답 봇.
                <br />
                시작하려면 팀 설정을 완료하세요.
              </p>
              <Button size="lg" onClick={() => setWizardOpen(true)}>
                🚀 팀 설정 시작
              </Button>
              {activeTeamSlug && (
                <p className="text-xs text-muted-foreground mt-4">
                  저장된 팀: <span className="font-mono">{activeTeamSlug}</span>
                  <br />
                  (백엔드에서 못 찾음. 재설정 필요)
                </p>
              )}
            </div>
          </div>
        ) : (
          /* 3단 (사이드바 · 뷰어 · 챗) — 챗은 참고 문서가 선택된 상태에서만 노출.
           *  · chatReady=false → 사이드바 + 뷰어 (2단) · 뷰어에 "문의 시작하기" CTA 노출
           *  · chatReady=true → 사이드바 + 뷰어 + 챗 (3단) · slide-in 애니메이션 */
          <div
            className="h-full grid grid-rows-[minmax(0,1fr)]"
            style={{
              gridTemplateColumns: chatReady
                ? `${sidebarWidth}px 4px minmax(0,1fr) 4px ${chatWidth}px`
                : `${sidebarWidth}px 4px minmax(0,1fr)`,
            }}
          >
            <DocsSidebar
              key={refreshKey}
              teamSlug={team.team_slug}
              activeDocPath={activeDoc?.path ?? null}
              onDocSelect={setActiveDoc}
            />
            <ColumnResizer
              direction="left"
              currentWidth={sidebarWidth}
              onChange={setSidebarWidth}
              title="드래그하여 사이드바 폭 조절"
            />
            <DocViewer
              teamSlug={team.team_slug}
              activeDoc={activeDoc}
              githubRepo={team.github_repo}
              citationTarget={citationTarget}
              onCitationMiss={(a) => {
                if (typeof window !== "undefined") {
                  console.warn(`§${a} 을 현재 문서에서 찾지 못했습니다`);
                }
              }}
            />
            {chatReady && (
              <>
                <ColumnResizer
                  direction="right"
                  currentWidth={chatWidth}
                  onChange={setChatWidth}
                  title="드래그하여 챗 패널 폭 조절"
                />
                <div className="border-l border-slate-200 min-h-0 overflow-hidden animate-chat-slide-in">
                  <ChatPanel
                    teamSlug={team.team_slug}
                    activeDoc={activeDoc}
                    githubRepo={team.github_repo}
                    onOpenDoc={(path) => {
                      // 답변 내 정책 링크 클릭 → 중앙 뷰어에 문서 로드 (같은 화면에서 동시 표시)
                      const isStory = team.projects.some((p) => {
                        const dirs = (p.storyboards_dir || "").split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
                        return dirs.some((d) => path.startsWith(d + "/") || path.startsWith(d));
                      });
                      setActiveDoc({
                        path,
                        title: path.split("/").pop()?.replace(/\.md$/i, "") ?? path,
                        kind: isStory ? "storyboard" : "policy",
                      });
                    }}
                    onCitation={(anchor) => setCitationTarget({ anchor, nonce: Date.now() })}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <TeamWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        existingTeam={team}
        onSaved={() => {
          // 프로젝트 편집 반영 · 팀 재로드 + 사이드바 강제 리로드 + 활성 문서 초기화
          if (team) {
            loadTeam(team.team_slug);
            setActiveDoc(null);
            setRefreshKey((k) => k + 1);
          }
        }}
      />
      <UserDialog open={userDialogOpen} onOpenChange={setUserDialogOpen} />
    </div>
  );
}

/** 토큰 수를 짧게 표시. 1234 → "1.2K" · 1234567 → "1.2M" */
function formatTokens(n: number): string {
  if (n < 1000) return `${n} tok`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K tok`;
  return `${(n / 1_000_000).toFixed(2)}M tok`;
}
