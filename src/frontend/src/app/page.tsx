"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TeamWizard } from "@/components/team-wizard";
import { DocsSidebar } from "@/components/docs-sidebar";
import { ChatPanel } from "@/components/chat-panel";
import { useTeamStore, syncTeamFromUrl } from "@/lib/team-store";
import { getTeam, TeamResponse, DocEntry, ApiError } from "@/lib/api";

export default function Home() {
  const activeTeamSlug = useTeamStore((s) => s.activeTeamSlug);
  const setActiveTeam = useTeamStore((s) => s.setActiveTeam);
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [activeDoc, setActiveDoc] = useState<DocEntry | null>(null);

  // URL ?team=X → store 초기화
  useEffect(() => {
    syncTeamFromUrl();
  }, []);

  // activeTeamSlug 바뀌면 백엔드에서 팀 config 로드
  useEffect(() => {
    if (!activeTeamSlug) {
      setTeam(null);
      setLoading(false);
      setWizardOpen(true); // 팀 없으면 wizard 자동 오픈
      return;
    }
    let cancelled = false;
    setLoading(true);
    getTeam(activeTeamSlug)
      .then((t) => {
        if (!cancelled) setTeam(t);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[qa-bot] team load failed", err);
        if (err instanceof ApiError && err.status === 404) {
          // 저장된 slug 가 서버에는 없음 → 초기화
          setActiveTeam(null);
          setWizardOpen(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTeamSlug, setActiveTeam]);

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* 상단 헤더 */}
      <header className="border-b bg-slate-900 text-white px-4 py-2 flex items-center gap-3">
        <div className="font-bold text-sm">🎯 blumnAI QA Bot</div>
        {team && (
          <Badge className="bg-indigo-600 hover:bg-indigo-600">{team.team_name}</Badge>
        )}
        <div className="flex-1" />
        <div className="text-xs text-slate-400">
          {team ? (
            <>
              레포: <span className="font-mono">{team.github_repo}</span>
            </>
          ) : loading ? (
            "로딩 중..."
          ) : (
            "팀 미설정"
          )}
        </div>
        {team && (
          <Link href={`/planner?team=${encodeURIComponent(team.team_slug)}`}>
            <Button size="sm" variant="outline" className="bg-transparent text-white border-slate-600 hover:bg-slate-800">
              🎯 기획자 →
            </Button>
          </Link>
        )}
        <Button
          size="sm"
          variant="outline"
          className="bg-transparent text-white border-slate-600 hover:bg-slate-800"
          onClick={() => setWizardOpen(true)}
        >
          ⚙️ 설정
        </Button>
      </header>

      {/* 메인 영역 */}
      <div className="flex-1 overflow-hidden">
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
          <div className="h-full grid grid-cols-[280px_1fr]">
            <DocsSidebar
              teamSlug={team.team_slug}
              activeDocPath={activeDoc?.path ?? null}
              onDocSelect={setActiveDoc}
            />
            <ChatPanel teamSlug={team.team_slug} activeDoc={activeDoc} />
          </div>
        )}
      </div>

      <TeamWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}
