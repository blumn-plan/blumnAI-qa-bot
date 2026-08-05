"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useTeamStore, syncTeamFromUrl } from "@/lib/team-store";
import { getTeam, TeamResponse, listDecisions, listFeedbacks, getDoc, ApiError } from "@/lib/api";
import { MarkdownView } from "@/components/markdown-view";

interface ListItem {
  path: string;
  name: string;
  sha?: string;
}

export default function PlannerPage() {
  const activeTeamSlug = useTeamStore((s) => s.activeTeamSlug);
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [tab, setTab] = useState<"decisions" | "feedbacks">("decisions");
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ListItem | null>(null);
  const [detailContent, setDetailContent] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => { syncTeamFromUrl(); }, []);

  useEffect(() => {
    if (!activeTeamSlug) return;
    let cancelled = false;
    getTeam(activeTeamSlug).then((t) => { if (!cancelled) setTeam(t); }).catch((err) => {
      if (!cancelled) setError(err instanceof ApiError ? err.message : String(err));
    });
    return () => { cancelled = true; };
  }, [activeTeamSlug]);

  useEffect(() => {
    if (!activeTeamSlug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedItem(null);
    setDetailContent(null);
    const fetcher = tab === "decisions" ? listDecisions : listFeedbacks;
    fetcher(activeTeamSlug, 50)
      .then((res) => { if (!cancelled) setItems(res.items); })
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeTeamSlug, tab]);

  async function handleSelect(item: ListItem) {
    if (!activeTeamSlug) return;
    setSelectedItem(item);
    setDetailContent(null);
    setDetailLoading(true);
    try {
      const res = await getDoc(activeTeamSlug, item.path);
      setDetailContent(res.content);
    } catch (err) {
      setDetailContent(`⚠️ 로드 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDetailLoading(false);
    }
  }

  if (!activeTeamSlug) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-3">🎯</div>
          <h1 className="text-2xl font-bold mb-2">기획자 모드</h1>
          <p className="text-sm text-muted-foreground mb-6">
            먼저 팀을 선택해야 합니다.
          </p>
          <Link href="/">
            <Button size="lg">← 협업자 모드로</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="border-b bg-slate-900 text-white px-4 py-2 flex items-center gap-3">
        <div className="font-bold text-sm">🎯 기획자 모드</div>
        {team && <Badge className="bg-indigo-600 hover:bg-indigo-600">{team.team_name}</Badge>}
        <div className="flex-1" />
        <Link href={`/?team=${encodeURIComponent(activeTeamSlug)}`}>
          <Button size="sm" variant="outline" className="bg-transparent text-white border-slate-600 hover:bg-slate-800">
            ← 협업자 모드
          </Button>
        </Link>
      </header>

      <div className="border-b bg-white px-4 py-1 flex gap-1">
        <button
          type="button"
          onClick={() => setTab("decisions")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "decisions" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          📤 기획전달 대기 ({tab === "decisions" ? items.length : "…"})
        </button>
        <button
          type="button"
          onClick={() => setTab("feedbacks")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "feedbacks" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          📝 답변 규칙 ({tab === "feedbacks" ? items.length : "…"})
        </button>
      </div>

      <div className="flex-1 grid grid-cols-[340px_1fr] overflow-hidden">
        {/* 리스트 */}
        <div className="overflow-y-auto border-r bg-slate-50">
          {loading && <div className="p-4 text-sm text-muted-foreground">로딩 중...</div>}
          {error && (
            <div className="p-4 text-sm text-red-600">
              <div className="font-semibold">로드 실패</div>
              <div className="text-xs mt-1 font-mono">{error}</div>
            </div>
          )}
          {!loading && !error && items.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground text-center">
              {tab === "decisions" ? "대기 중인 기획전달 없음" : "저장된 답변 규칙 없음"}
            </div>
          )}
          <ul className="text-sm">
            {items.map((item) => (
              <li key={item.path}>
                <button
                  type="button"
                  onClick={() => handleSelect(item)}
                  className={`w-full text-left px-3 py-2 hover:bg-slate-200 border-b border-slate-200 ${
                    selectedItem?.path === item.path ? "bg-indigo-100" : ""
                  }`}
                  title={item.path}
                >
                  <div className="font-mono text-[10px] text-slate-500 truncate">{item.name}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* 상세 */}
        <div className="overflow-y-auto p-6 bg-white">
          {!selectedItem ? (
            <div className="text-sm text-muted-foreground text-center py-20">
              좌측에서 항목을 선택하면 본문이 표시됩니다.
            </div>
          ) : (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="font-mono text-xs text-slate-500 truncate flex-1">{selectedItem.path}</div>
                <div className="flex gap-2 ml-2">
                  {team && (
                    <a
                      href={`https://github.com/${team.github_repo}/blob/main/${selectedItem.path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 underline"
                    >
                      GitHub 열기 →
                    </a>
                  )}
                </div>
              </div>
              <Separator className="mb-4" />
              {detailLoading ? (
                <div className="text-sm text-muted-foreground">로딩 중...</div>
              ) : detailContent ? (
                <MarkdownView content={detailContent} />
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
