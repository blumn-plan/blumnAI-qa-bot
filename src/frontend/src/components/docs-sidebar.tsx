"use client";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  LayoutTemplate,
  Globe,
  MessageSquare,
  Plus,
  Send,
  NotebookPen,
  ChevronRight,
  ChevronDown,
  Search,
  Trash2,
  User as UserIcon,
  Clock,
  CheckCircle2,
  PauseCircle,
  XCircle,
  FileText as FileTextIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listDocs,
  listProjects,
  listDecisions,
  listFeedbacks,
  DocEntry,
  ApiError,
  DecisionListItem,
  FeedbackListItem,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { useUiStore } from "@/lib/ui-store";
import { useUserStore } from "@/lib/user-store";
import { useChatSessionsStore, ChatSession } from "@/lib/chat-sessions-store";
import { useDecisionsSeenStore } from "@/lib/decisions-seen-store";
import { GuideDialog } from "@/components/guide-dialog";
import { SidebarDrawer } from "@/components/sidebar-drawer";

interface DocsSidebarProps {
  teamSlug: string;
  activeDocPath: string | null;
  onDocSelect: (doc: DocEntry | null) => void;
}

interface ProjectListItem {
  id: string;
  label: string;
}

export function DocsSidebar({ teamSlug, activeDocPath, onDocSelect }: DocsSidebarProps) {
  const activeProject = useUiStore((s) => s.activeProject);
  const setActiveProject = useUiStore((s) => s.setActiveProject);
  const useAllDocs = useUiStore((s) => s.useAllDocs);
  const toggleUseAllDocs = useUiStore((s) => s.toggleUseAllDocs);
  const docSearch = useUiStore((s) => s.docSearch);
  const setDocSearch = useUiStore((s) => s.setDocSearch);
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const userName = useUserStore((s) => s.name);

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [decisions, setDecisions] = useState<DecisionListItem[]>([]);
  const [feedbacks, setFeedbacks] = useState<FeedbackListItem[]>([]);
  const [decisionsCollapsed, setDecisionsCollapsed] = useState(true);
  const [feedbacksCollapsed, setFeedbacksCollapsed] = useState(true);
  const [recentCollapsed, setRecentCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);

  // 지난 문의 · 팀별 세션 리스트 (localStorage · zustand)
  const allSessions = useChatSessionsStore((s) => s.sessions);
  const setCurrentSession = useChatSessionsStore((s) => s.setCurrent);
  const removeSession = useChatSessionsStore((s) => s.remove);
  const currentSessionId = useChatSessionsStore((s) => s.currentSessionId);
  const requestNewChat = useChatSessionsStore((s) => s.requestNewChat);
  const selectedDocPaths = useUiStore((s) => s.selectedDocPaths);
  const toggleDocSelected = useUiStore((s) => s.toggleDocSelected);
  const addDocSelected = useUiStore((s) => s.addDocSelected);
  const clearSelectedDocs = useUiStore((s) => s.clearSelectedDocs);
  // 문서 리스트 아이템 클릭 = 뷰어 열기 + 참고 문서 자동 체크 (idempotent · 이미 있으면 유지).
  //  체크박스 uncheck 는 여전히 체크박스 클릭으로만 가능.
  function handleDocRowSelect(doc: DocEntry) {
    onDocSelect(doc);
    addDocSelected(doc.path);
  }
  const recentSessions = useMemo(
    () =>
      allSessions
        .filter((s) => s.teamSlug === teamSlug)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .slice(0, 20),
    [allSessions, teamSlug],
  );
  const [error, setError] = useState<string | null>(null);
  // 리스트 기본 상태:
  //  · 정책 문서: 펼침 (사용자가 참고 문서를 체크하려면 리스트가 보여야 함)
  //  · 화면설계서: 접힘 (양이 많고 자주 쓰지 않음 · 필요할 때만 펼침)
  const [policiesCollapsed, setPoliciesCollapsed] = useState(false);
  const [storyCollapsed, setStoryCollapsed] = useState(true);
  // 문서 검색창 · 상시 노출 대신 아이콘 토글로 열고 닫음 (사이드바 세로 공간 절약)
  const [docSearchOpen, setDocSearchOpen] = useState(false);
  // 첫 방문자용 시작 안내 · 사용자가 닫으면 localStorage 로 기억
  const [onboardingDismissed, setOnboardingDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("blumnai-qa-onboarding-dismissed") === "1";
  });
  function dismissOnboarding() {
    setOnboardingDismissed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("blumnai-qa-onboarding-dismissed", "1");
    }
  }

  // 팀 변경 시 프로젝트 리스트 로드 · activeProject 유효성 검증
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listProjects(teamSlug)
      .then((res) => {
        if (cancelled) return;
        setProjects(res.projects);
        // activeProject 가 없거나 현재 팀에 없는 slug 면 기본으로 리셋
        const valid = res.projects.some((p) => p.id === activeProject);
        if (!valid) setActiveProject(res.default ?? res.projects[0]?.id ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : String(err));
        setLoading(false);
      });
    return () => { cancelled = true; };
    // activeProject 를 의도적으로 뺌: activeProject 변경 시 프로젝트 리스트 재요청 X
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamSlug]);

  // 선택된 프로젝트의 문서 로드
  useEffect(() => {
    if (!activeProject) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listDocs(teamSlug, activeProject)
      .then((res) => { if (!cancelled) setDocs(res.docs); })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : String(err));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [teamSlug, activeProject]);

  const { filteredPolicies, filteredStories } = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    const filtered = q
      ? docs.filter((d) => d.title.toLowerCase().includes(q) || d.path.toLowerCase().includes(q))
      : docs;
    return {
      filteredPolicies: filtered.filter((d) => d.kind === "policy"),
      filteredStories: filtered.filter((d) => d.kind === "storyboard"),
    };
  }, [docs, docSearch]);

  // 기획전달 · 개선건 로드 (팀 변경 시)
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listDecisions(teamSlug, 100).catch(() => ({ items: [] as DecisionListItem[], total: 0 })),
      listFeedbacks(teamSlug, 20).catch(() => ({ items: [] as FeedbackListItem[], total: 0 })),
    ]).then(([d, f]) => {
      if (cancelled) return;
      setDecisions(d.items);
      setFeedbacks(f.items);
    });
    return () => { cancelled = true; };
  }, [teamSlug]);

  // viewMode 필터 적용 · 'mine' 이면 requester === userName 만
  const visibleDecisions = useMemo(() => {
    if (viewMode === "all" || !userName.trim()) return decisions;
    return decisions.filter((d) => d.requester === userName);
  }, [decisions, viewMode, userName]);
  // feedback 은 requester 필드 없음 → 필터 불가 · 항상 전체 표시

  const currentProjectLabel = projects.find((p) => p.id === activeProject)?.label;
  // 초심자 가이드용 · 아무것도 안 골랐는지 (뷰어 focus 도 없고 · 체크박스 · 종합모드 모두 미선택)
  const hasNothingSelected = !activeDocPath && selectedDocPaths.length === 0 && !useAllDocs;

  return (
    <div className="flex flex-col h-full border-r bg-slate-50">
      {/* 헤더 — 프로젝트 선택만 (최소화) */}
      <div className="px-3 pt-2.5 pb-2 border-b bg-white">
        <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider">
          프로젝트
        </label>
        <select
          className="w-full text-sm border rounded px-2 py-1 bg-white"
          value={activeProject ?? ""}
          onChange={(e) => setActiveProject(e.target.value || null)}
          disabled={projects.length === 0}
          title={currentProjectLabel}
        >
          {projects.length === 0 && <option value="">(프로젝트 없음)</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* 스크롤 영역 · 문의 중심 IA (① 새 문의 → ② 지난 문의 → ③ 참고 문서 → ④ 이력·규칙) */}
      <div className="flex-1 overflow-y-auto">

        {/* ① 새 문의 primary CTA · 이 챗봇의 첫 액션 */}
        <div className="px-3 pt-3 pb-2.5 bg-white border-b">
          <StepMarker>① 새 문의 시작</StepMarker>
          <Button
            type="button"
            onClick={requestNewChat}
            className="w-full h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-sm"
            title="새 문의 시작 — 지금 대화·참고 문서 선택을 리셋하고 처음부터"
          >
            <Plus className="w-4 h-4" /> 새 문의
          </Button>
          <div className="mt-1.5 text-[10px] text-slate-500 leading-snug">
            지금 대화와 참고 문서 선택을 리셋합니다.
          </div>
        </div>

        {/* ② 문의 목록 · 지금 진행 중인 문의도 여기 표시 (현재 선택 하이라이트)
         *  → 지난 것 + 현재 것 통합 리스트로 "지금 뭘 하고 있는지" 시각화 */}
        <div className="bg-white border-b">
          <div className="px-3 pt-2.5 pb-1">
            <StepMarker>② 문의 목록</StepMarker>
          </div>
          {recentSessions.length > 0 ? (
            <RecentSection
              sessions={recentSessions}
              collapsed={recentCollapsed}
              onToggle={() => setRecentCollapsed((v) => !v)}
              currentId={currentSessionId}
              onSelect={(id) => setCurrentSession(id)}
              onRemove={(id) => removeSession(id)}
              viewMode={viewMode}
              setViewMode={setViewMode}
              userName={userName}
            />
          ) : (
            <div className="px-3 pb-3 text-[11px] text-slate-400 leading-relaxed">
              아직 문의가 없어요. 첫 질문을 보내면 여기에 자동으로 목록이 생기고 다시 열어볼 수 있어요.
            </div>
          )}
        </div>

        {/* ③ 참고 문서 · 지금 문의의 근거로 삼을 문서 선택
         *  · 아무것도 안 골랐고 첫 방문자면 이 섹션에 앰버 링 pulse + 안내 배너
         *  · data-section 은 뷰어 empty state 의 [문의 시작하기] 버튼이 스크롤 target 으로 씀 */}
        <div
          data-section="reference-docs"
          className={`bg-white border-b transition-shadow scroll-mt-2 ${
            hasNothingSelected && !onboardingDismissed && recentSessions.length === 0
              ? "ring-2 ring-amber-300 ring-inset animate-pulse-slow"
              : ""
          }`}
        >
          {!onboardingDismissed && recentSessions.length === 0 && (
            <div className="mx-3 mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900 leading-relaxed">
              <div className="flex items-start justify-between gap-2 mb-1">
                <b>👋 처음이신가요? 이 순서로 문의하세요</b>
                <button
                  type="button"
                  onClick={dismissOnboarding}
                  className="text-amber-600 hover:text-amber-900 text-[10px]"
                  title="이 안내 숨기기"
                >
                  닫기
                </button>
              </div>
              <div>
                {hasNothingSelected ? (
                  <>
                    <b>여기</b>에서 문의 근거로 쓸 문서를 골라주세요 →
                    우측 챗창에 질문 →
                    끝나면 위 [+ 새 문의] 로 리셋
                  </>
                ) : (
                  <>
                    ✓ 참고 문서 선택 완료 · 이제 <b>우측 챗창</b>에 질문하세요
                  </>
                )}
              </div>
            </div>
          )}
          <div className="px-3 pt-2.5 pb-1 flex items-center justify-between">
            <StepMarker>③ 참고 문서 선택</StepMarker>
            <button
              type="button"
              onClick={() => setDocSearchOpen((v) => !v)}
              className={`p-1 rounded transition ${
                docSearchOpen || docSearch
                  ? "bg-slate-100 text-slate-700"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
              }`}
              title="문서 이름 검색"
              aria-label="문서 검색"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* 종합 모드 토글 — 「문서 선택의 한 옵션」 위치로 이동 */}
          <div className="px-3 pb-1.5">
            <label
              className={`flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer text-xs select-none transition ${
                useAllDocs
                  ? "bg-indigo-50 border border-indigo-200 text-indigo-800"
                  : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
              title="ON: 개별 문서 대신 프로젝트 전체 정책을 근거로 답변"
            >
              <span
                className={`inline-block w-8 h-4 rounded-full relative transition ${
                  useAllDocs ? "bg-indigo-500" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${
                    useAllDocs ? "left-4" : "left-0.5"
                  }`}
                />
              </span>
              <span className="flex-1 inline-flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" /> 전체 정책 종합 모드
              </span>
              <span className={`text-xs font-bold ${useAllDocs ? "text-indigo-700" : "text-slate-400"}`}>
                {useAllDocs ? "ON" : "OFF"}
              </span>
              <input
                type="checkbox"
                className="sr-only"
                checked={useAllDocs}
                onChange={toggleUseAllDocs}
              />
            </label>
          </div>
          {/* 문서 검색 · 아이콘 토글로 열림 (또는 검색어가 있으면 항상 표시) */}
          {(docSearchOpen || docSearch) && (
            <div className="px-3 pb-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <Input
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  placeholder="정책·화면설계서 이름 검색"
                  className="h-8 text-xs pl-7"
                  disabled={useAllDocs}
                  autoFocus
                />
              </div>
            </div>
          )}
          <div className={useAllDocs ? "opacity-50 pointer-events-none" : ""}>
            {loading && <div className="p-4 text-sm text-muted-foreground">로딩 중...</div>}
            {error && (
              <div className="p-4 text-sm text-red-600">
                <div className="font-semibold">문서 로드 실패</div>
                <div className="text-xs mt-1 break-all">{error}</div>
              </div>
            )}
            {!loading && !error && docs.length === 0 && (
              <div className="p-4 text-xs text-muted-foreground">
                📭 정책 md 파일이 없어요.
                <br />
                GitHub 레포의 <code className="text-xs bg-slate-100 px-1 rounded">policies_dir</code> 경로를 확인하세요.
              </div>
            )}
            {!loading && !error && docs.length > 0 && (
              <>
                <DocSection
                  title="정책 문서"
                  kind="policy"
                  docs={filteredPolicies}
                  totalCount={docs.filter((d) => d.kind === "policy").length}
                  collapsed={policiesCollapsed}
                  onToggleCollapse={() => setPoliciesCollapsed((v) => !v)}
                  activeDocPath={activeDocPath}
                  onDocSelect={handleDocRowSelect}
                  selectedPaths={selectedDocPaths}
                  onToggleSelected={toggleDocSelected}
                />
                <DocSection
                  title="화면설계서"
                  kind="storyboard"
                  docs={filteredStories}
                  totalCount={docs.filter((d) => d.kind === "storyboard").length}
                  collapsed={storyCollapsed}
                  onToggleCollapse={() => setStoryCollapsed((v) => !v)}
                  activeDocPath={activeDocPath}
                  onDocSelect={handleDocRowSelect}
                  selectedPaths={selectedDocPaths}
                  onToggleSelected={toggleDocSelected}
                />
                {docSearch && filteredPolicies.length === 0 && filteredStories.length === 0 && (
                  <div className="p-4 text-xs text-muted-foreground">
                    검색 결과 없음: <b>{docSearch}</b>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ④ 이력·규칙 · 기획전달 + 답변 규칙 (기본 접힘 · 필요할 때만 펼침) */}
        <div className="bg-white">
          <div className="px-3 pt-2.5 pb-1">
            <StepMarker>④ 이력 · 규칙</StepMarker>
          </div>
          <DecisionsSection
            items={visibleDecisions}
            totalCount={decisions.length}
            collapsed={decisionsCollapsed}
            onToggle={() => {
              const wasCollapsed = decisionsCollapsed;
              setDecisionsCollapsed(!wasCollapsed);
              if (wasCollapsed) setFeedbacksCollapsed(true);
            }}
            teamSlug={teamSlug}
            viewMode={viewMode}
            setViewMode={setViewMode}
            hasUserName={Boolean(userName.trim())}
          />
          <FeedbacksSection
            items={feedbacks}
            collapsed={feedbacksCollapsed}
            onToggle={() => {
              const wasCollapsed = feedbacksCollapsed;
              setFeedbacksCollapsed(!wasCollapsed);
              if (wasCollapsed) setDecisionsCollapsed(true);
            }}
            teamSlug={teamSlug}
          />
        </div>
      </div>
    </div>
  );
}

/** 사이드바 그룹 상단의 작은 STEP 라벨 · 사용자 태스크 순서 시각화. */
function StepMarker({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
      {children}
    </div>
  );
}

/** 📜 최근 대화 · localStorage 세션 리스트 · 클릭 시 챗패널에 로드 */
function RecentSection({
  sessions,
  collapsed,
  onToggle,
  currentId,
  onSelect,
  onRemove,
  viewMode,
  setViewMode,
  userName,
}: {
  sessions: ChatSession[];
  collapsed: boolean;
  onToggle: () => void;
  currentId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  viewMode: "mine" | "all";
  setViewMode: (m: "mine" | "all") => void;
  userName: string;
}) {
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  // viewMode 필터 → mine 이면 requester === userName 만 (userName 미설정 시 무시)
  const scoped = useMemo(() => {
    if (viewMode === "all" || !userName.trim()) return sessions;
    return sessions.filter((s) => s.requester === userName);
  }, [sessions, viewMode, userName]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((s) => {
      if (s.title.toLowerCase().includes(q)) return true;
      return s.messages.some((m) => m.content.toLowerCase().includes(q));
    });
  }, [scoped, search]);

  return (
    <div className="py-1">
      <div className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-slate-50 transition-colors">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3 text-slate-400" />
          ) : (
            <ChevronDown className="w-3 h-3 text-slate-400" />
          )}
          <span className="flex items-center gap-1.5 text-slate-600 text-[12px] font-semibold">
            <MessageSquare className="w-3.5 h-3.5 text-slate-500" /> 문의 목록
          </span>
          <div className="flex-1" />
          <span className="text-[11px] text-slate-400 tabular-nums font-normal">
            {search || (viewMode === "mine" && userName.trim())
              ? `${filtered.length}/${sessions.length}`
              : sessions.length}
          </span>
        </button>
        {sessions.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSearchOpen((v) => !v);
            }}
            className={`p-1 rounded transition ${
              searchOpen || search
                ? "bg-slate-100 text-slate-700"
                : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
            }`}
            title="대화 검색"
            aria-label="대화 검색"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {!collapsed && (
        <>
          {sessions.length > 0 && (
            <div className="px-3 pb-1.5 flex gap-1">
              <button
                type="button"
                onClick={() => setViewMode("mine")}
                className={`flex-1 text-[10px] py-0.5 px-1.5 rounded border transition inline-flex items-center justify-center gap-1 ${
                  viewMode === "mine"
                    ? "bg-indigo-50 border-indigo-300 text-indigo-800 font-medium"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
                title={
                  userName.trim()
                    ? `내 이름 (${userName}) 으로 문의한 대화만`
                    : "이름 미설정 → 상단 헤더에서 이름 설정 후 활성화"
                }
              >
                <UserIcon className="w-2.5 h-2.5" /> 내것만
              </button>
              <button
                type="button"
                onClick={() => setViewMode("all")}
                className={`flex-1 text-[10px] py-0.5 px-1.5 rounded border transition inline-flex items-center justify-center gap-1 ${
                  viewMode === "all"
                    ? "bg-indigo-50 border-indigo-300 text-indigo-800 font-medium"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
                title="이 브라우저에 저장된 모든 대화"
              >
                <Globe className="w-2.5 h-2.5" /> 전체
              </button>
            </div>
          )}
          {sessions.length > 0 && (searchOpen || search) && (
            <div className="px-3 pt-1 pb-1.5">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="대화 검색 (제목·본문)"
                  className="h-7 text-[11px] pl-6"
                  autoFocus
                />
              </div>
            </div>
          )}
          {/* 리스트는 항상 렌더링 (진행 중 임시 카드가 최상단에 노출되어야 하므로).
           *  · 저장된 세션이 없어도 currentId=null 이면 "🆕 새 문의 (진행 중)" 카드가 하나 보임 → 사용자가 지금 뭘 하는지 즉시 인지. */}
          <ul>
            {currentId === null && (
              <li>
                <div
                  className="w-full text-left pl-3 pr-3 py-1.5 text-[12px] border-l-2 border-l-indigo-500 bg-indigo-50 text-indigo-900 font-medium"
                  title="지금 진행 중인 새 문의 · 첫 질문을 보내면 이 자리에 제목이 자동 생성됩니다"
                >
                  <div className="truncate leading-snug inline-flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse-dot" />
                    🆕 새 문의 (진행 중)
                  </div>
                  <div className="text-[10px] text-indigo-500">첫 질문을 보내면 제목이 자동 생성됩니다</div>
                </div>
              </li>
            )}
            {filtered.map((s) => {
                const active = s.id === currentId;
                return (
                  <li key={s.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onSelect(s.id)}
                      className={`w-full text-left pl-3 pr-8 py-1.5 text-[12px] transition-colors border-l-2 ${
                        active
                          ? "bg-indigo-50 text-indigo-900 font-medium border-l-indigo-500 pl-[calc(0.75rem-2px)]"
                          : "border-l-transparent text-slate-700 hover:bg-slate-50"
                      }`}
                      title={`${s.title}\n${new Date(s.updatedAt).toLocaleString()}${s.scope ? "\n근거: " + s.scope : ""}`}
                    >
                      <div className="truncate leading-snug">{s.title}</div>
                      <div className={`text-[10px] tabular-nums ${active ? "text-indigo-500" : "text-slate-400"}`}>
                        {formatSessionDate(s.updatedAt)}
                        {s.scope && <> · {s.scope}</>}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("이 대화를 삭제하시겠어요? 되돌릴 수 없습니다.")) onRemove(s.id);
                      }}
                      className={`absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded p-1 transition ${
                        active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                      title="이 대화 삭제"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </li>
                );
              })}
            </ul>
          {/* 필터로 다 걸러졌을 때 안내 (임시 카드는 위에서 이미 보임) */}
          {sessions.length > 0 && filtered.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-slate-400">
              {search
                ? <>검색 결과 없음: <b>{search}</b></>
                : viewMode === "mine" && userName.trim()
                  ? `(${userName} 이름으로 저장된 문의 없음 · 전체 로 변경해보세요)`
                  : "(표시할 문의 없음)"}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** ISO date → 'MM-DD HH:mm' 또는 다른 년도면 'YYYY-MM-DD'. */
function formatSessionDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    if (d.getFullYear() === now.getFullYear()) {
      return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  } catch {
    return iso;
  }
}

/** 📤 기획자 전달이력 (list-decisions) */
type StatusFilter = "all" | "pending" | "applied" | "hold" | "rejected";
type ReadFilter = "all" | "unread" | "read";

const DECISIONS_GUIDE_FALLBACK = `# 📤 기획자 전달 절차 안내

이 채팅봇에서 답변만으로 해결이 안 되는 정책 이슈를 기획자에게 전달하는 경로입니다.

## 언제 사용?
- 답변에 **정책 미정의** 로 표시된 케이스
- 현재 정책이 실무와 맞지 않아 **정책 변경 제안** 이 필요할 때
- 답변 우측 하단 **📤 기획전달** 버튼

## 저장 위치
- 팀 GitHub repo 의 \`qa/decisions/\` 폴더에 md 파일로 커밋
- 기획자 모드 (\`/planner\`) 에서 상태 관리 (대기 → 적용 / 보류)

## 상태별 의미
| 상태 | 뜻 |
| --- | --- |
| 🟡 대기 | 기획자 검토 전 (신규) |
| ✅ 적용 | 정책 반영 완료 |
| ⏸ 보류 | 검토 후 반영 유보 |

*팀에 맞는 절차가 있다면 \`qa/decisions/README.md\` 로 커밋하면 이 화면에서 자동 노출됩니다.*
`;

function DecisionsSection({
  items,
  totalCount,
  collapsed,
  onToggle,
  teamSlug,
  viewMode,
  setViewMode,
  hasUserName,
}: {
  items: DecisionListItem[];
  totalCount: number;
  collapsed: boolean;
  onToggle: () => void;
  teamSlug: string;
  viewMode: "mine" | "all";
  setViewMode: (m: "mine" | "all") => void;
  hasUserName: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [guideOpen, setGuideOpen] = useState(false);
  const markSeen = useDecisionsSeenStore((s) => s.markSeen);
  const isUnread = useDecisionsSeenStore((s) => s.isUnread);

  const StatusIcon = (s: string) => {
    if (s === "applied") return <CheckCircle2 className="w-3 h-3 text-emerald-600" />;
    if (s === "hold") return <PauseCircle className="w-3 h-3 text-slate-500" />;
    if (s === "rejected") return <XCircle className="w-3 h-3 text-red-500" />;
    return <Clock className="w-3 h-3 text-amber-500" />;
  };

  const filtered = useMemo(() => {
    return items.filter((d) => {
      // status filter · pending 은 unknown 도 포함
      if (statusFilter !== "all") {
        const normalized = d.status === "unknown" ? "pending" : d.status;
        if (normalized !== statusFilter) return false;
      }
      // read filter · pending 항목은 read/unread 무관 (항상 표시)
      if (readFilter !== "all" && d.status !== "pending" && d.status !== "unknown") {
        const unread = isUnread(d.path, d.status);
        if (readFilter === "unread" && !unread) return false;
        if (readFilter === "read" && unread) return false;
      }
      return true;
    });
  }, [items, statusFilter, readFilter, isUnread]);

  const unreadCount = useMemo(
    () => items.filter((d) => isUnread(d.path, d.status)).length,
    [items, isUnread],
  );

  return (
    <div className="py-1">
      <div className={`w-full flex items-center gap-1.5 px-3 py-2 hover:bg-slate-50 transition-colors ${!collapsed ? "bg-slate-50" : ""}`}>
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
          title={collapsed ? "클릭하여 서랍으로 열기" : "닫기"}
        >
          <ChevronRight className={`w-3 h-3 text-slate-400 transition-transform ${!collapsed ? "rotate-90" : ""}`} />
          <span className="flex items-center gap-1.5 text-slate-600 text-[12px] font-semibold">
            <Send className="w-3.5 h-3.5 text-emerald-600" /> 기획자 전달이력
          </span>
          <div className="flex-1" />
          {unreadCount > 0 && (
            <span className="text-[10px] text-white bg-red-500 rounded-full min-w-4 h-4 px-1 inline-flex items-center justify-center font-semibold">
              {unreadCount}
            </span>
          )}
          <span className="text-[11px] text-slate-400 tabular-nums font-normal">
            {items.length}{items.length !== totalCount ? `/${totalCount}` : ""}
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setGuideOpen(true);
          }}
          className="text-[10px] text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 transition shrink-0"
          title="qa/decisions/README.md 열기 (없으면 기본 안내)"
        >
          📘 가이드
        </button>
      </div>
      <SidebarDrawer
        open={!collapsed}
        onClose={onToggle}
        title={
          <span className="inline-flex items-center gap-1.5">
            <Send className="w-4 h-4 text-emerald-600" /> 기획자 전달이력
            <span className="text-[11px] text-slate-400 font-normal tabular-nums">
              {items.length}{items.length !== totalCount ? `/${totalCount}` : ""}
            </span>
          </span>
        }
        headerExtra={
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="text-[10px] text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 transition shrink-0"
            title="qa/decisions/README.md 열기 (없으면 기본 안내)"
          >
            📘 가이드
          </button>
        }
      >
        <>
          {/* 필터: 상태 (앞) · 확인/미확인 (뒤) */}
          <div className="px-3 pb-1.5 flex gap-1">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="flex-1 min-w-0 text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white text-slate-700 focus:outline-none focus:border-slate-400"
              title="상태 필터"
            >
              <option value="all">상태: 전체</option>
              <option value="pending">🟡 대기</option>
              <option value="applied">✅ 적용</option>
              <option value="hold">⏸ 보류</option>
              <option value="rejected">✕ 반려</option>
            </select>
            <select
              value={readFilter}
              onChange={(e) => setReadFilter(e.target.value as ReadFilter)}
              className="flex-1 min-w-0 text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white text-slate-700 focus:outline-none focus:border-slate-400"
              title="확인 여부 · 대기→적용/보류로 바뀐 항목은 클릭 전까지 「미확인」"
            >
              <option value="all">확인: 전체</option>
              <option value="unread">🔴 미확인</option>
              <option value="read">확인</option>
            </select>
          </div>
          {/* 보기 범위 (내것만/전체) — 원래 헤더에 있던 것을 이 섹션으로 이동 */}
          <div className="px-3 pb-1.5 flex gap-1">
            <button
              type="button"
              onClick={() => setViewMode("mine")}
              className={`flex-1 text-[10px] py-0.5 px-1.5 rounded border transition inline-flex items-center justify-center gap-1 ${
                viewMode === "mine"
                  ? "bg-indigo-50 border-indigo-300 text-indigo-800 font-medium"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
              title="requester === 내 이름 인 건만"
            >
              <UserIcon className="w-2.5 h-2.5" /> 내것만
            </button>
            <button
              type="button"
              onClick={() => setViewMode("all")}
              className={`flex-1 text-[10px] py-0.5 px-1.5 rounded border transition inline-flex items-center justify-center gap-1 ${
                viewMode === "all"
                  ? "bg-indigo-50 border-indigo-300 text-indigo-800 font-medium"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
              title="모든 사람의 전달 이력"
            >
              <Globe className="w-2.5 h-2.5" /> 전체
            </button>
          </div>
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-slate-400">
              {items.length === 0
                ? viewMode === "mine" && hasUserName
                  ? "(본인 전달 건 없음)"
                  : viewMode === "mine"
                    ? "(이름 미설정 → 상단 헤더에서 이름 설정)"
                    : "(전달 이력 없음)"
                : "(필터에 해당하는 항목 없음)"}
            </div>
          ) : (
            <ul className="text-sm">
              {filtered.slice(0, 20).map((d) => {
                const unread = isUnread(d.path, d.status);
                return (
                  <li key={d.path}>
                    <a
                      href={`/planner?team=${encodeURIComponent(teamSlug)}#${encodeURIComponent(d.path)}`}
                      onClick={() => markSeen(d.path)}
                      className="w-full text-left px-3 py-1 hover:bg-slate-50 flex items-center gap-1.5 text-[12px] truncate"
                      title={`${d.title} · ${d.status} · ${d.requester ?? ""}${unread ? "\n(미확인 · 상태가 변경된 후 아직 열어보지 않았어요)" : ""}`}
                    >
                      <span className="shrink-0">{StatusIcon(d.status)}</span>
                      {unread && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"
                          aria-label="미확인"
                        />
                      )}
                      <span className={`truncate ${unread ? "text-slate-900 font-medium" : "text-slate-700"}`}>
                        {d.title}
                      </span>
                    </a>
                  </li>
                );
              })}
              {filtered.length > 20 && (
                <li className="px-3 py-1 text-[11px] text-slate-400">
                  … 외 {filtered.length - 20}건 · 기획자 모드에서 전체 보기
                </li>
              )}
            </ul>
          )}
        </>
      </SidebarDrawer>
      <GuideDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        teamSlug={teamSlug}
        title="📘 기획자 전달 절차 안내"
        path="qa/decisions/README.md"
        fallbackMarkdown={DECISIONS_GUIDE_FALLBACK}
      />
    </div>
  );
}

const FEEDBACK_GUIDE_FALLBACK = `# 📝 답변 규칙 작성 안내

AI 답변의 **톤·형식·강조점** 을 팀 취향에 맞게 학습시키는 기능입니다.

## 언제 사용?
- 답변이 너무 장황하거나 짧을 때 → 길이 규칙
- 답변 스타일이 팀 톤과 안 맞을 때 → 톤 규칙
- 특정 케이스마다 반복해서 언급해야 할 게 있을 때 → 항상 포함 규칙

## 저장 위치
- 팀 GitHub repo 의 \`qa/feedback/\` 폴더에 md 파일로 커밋
- 저장 즉시 다음 답변부터 자동 반영 (repo 재배포 X)

## 작성 팁
| 좋은 규칙 | 안 좋은 규칙 |
| --- | --- |
| "답변은 3줄 이내로" | "짧게" |
| "케이스별 동작 차이는 표로" | "정리 잘하기" |
| "결제 관련 질문엔 §3-환불정책 항상 언급" | "결제 조심" |

- 한 규칙 = 한 md 파일. 뭉치지 마세요.
- 규칙 제목 = 규칙 요약 (30자 내). 본문 = 예시 포함 상세.

*팀에 맞는 절차가 있다면 \`qa/feedback/README.md\` 로 커밋하면 이 화면에서 자동 노출됩니다.*
`;

/** 📝 답변 규칙 (list-feedbacks) */
function FeedbacksSection({
  items,
  collapsed,
  onToggle,
  teamSlug,
}: {
  items: FeedbackListItem[];
  collapsed: boolean;
  onToggle: () => void;
  teamSlug: string;
}) {
  const [guideOpen, setGuideOpen] = useState(false);
  return (
    <div className="py-1">
      <div className={`w-full flex items-center gap-1.5 px-3 py-2 hover:bg-slate-50 transition-colors ${!collapsed ? "bg-slate-50" : ""}`}>
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
          title={collapsed ? "클릭하여 서랍으로 열기" : "닫기"}
        >
          <ChevronRight className={`w-3 h-3 text-slate-400 transition-transform ${!collapsed ? "rotate-90" : ""}`} />
          <span className="flex items-center gap-1.5 text-slate-600 text-[12px] font-semibold">
            <NotebookPen className="w-3.5 h-3.5 text-amber-600" /> 답변 규칙
          </span>
          <div className="flex-1" />
          <span className="text-[11px] text-slate-400 tabular-nums font-normal">{items.length}</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setGuideOpen(true);
          }}
          className="text-[10px] text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 transition shrink-0"
          title="qa/feedback/README.md 열기 (없으면 기본 안내)"
        >
          📘 가이드
        </button>
      </div>
      <SidebarDrawer
        open={!collapsed}
        onClose={onToggle}
        title={
          <span className="inline-flex items-center gap-1.5">
            <NotebookPen className="w-4 h-4 text-amber-600" /> 답변 규칙
            <span className="text-[11px] text-slate-400 font-normal tabular-nums">{items.length}</span>
          </span>
        }
        headerExtra={
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="text-[10px] text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 transition shrink-0"
            title="qa/feedback/README.md 열기 (없으면 기본 안내)"
          >
            📘 가이드
          </button>
        }
      >
        <>
          {items.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-slate-400">
              (등록된 답변 규칙 없음)
            </div>
          ) : (
            <ul className="text-sm">
              {items.slice(0, 15).map((f) => (
                <li key={f.path}>
                  <div
                    className="px-3 py-1 hover:bg-slate-50 text-[12px] truncate text-slate-700 flex items-center gap-1.5"
                    title={f.title}
                  >
                    <NotebookPen className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="truncate">{f.title}</span>
                  </div>
                </li>
              ))}
              {items.length > 15 && (
                <li className="px-3 py-1 text-[11px] text-slate-400">
                  … 외 {items.length - 15}건
                </li>
              )}
            </ul>
          )}
        </>
      </SidebarDrawer>
      <GuideDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        teamSlug={teamSlug}
        title="📘 답변 규칙 작성 안내"
        path="qa/feedback/README.md"
        fallbackMarkdown={FEEDBACK_GUIDE_FALLBACK}
      />
    </div>
  );
}

function DocSection({
  title,
  kind,
  docs,
  totalCount,
  collapsed,
  onToggleCollapse,
  activeDocPath,
  onDocSelect,
  selectedPaths,
  onToggleSelected,
}: {
  title: string;
  kind: "policy" | "storyboard";
  docs: DocEntry[];
  totalCount: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeDocPath: string | null;
  onDocSelect: (doc: DocEntry) => void;
  selectedPaths: string[];
  onToggleSelected: (path: string) => void;
}) {
  const IconComp = kind === "policy" ? BookOpen : LayoutTemplate;
  const iconColorCls = kind === "policy" ? "text-sky-600" : "text-slate-500";
  const badgeCls = kind === "policy"
    ? "bg-sky-50 text-sky-700 border-sky-200"
    : "bg-slate-50 text-slate-600 border-slate-200";
  const badgeLabel = kind === "policy" ? "정책" : "화면";
  const selectedInSection = docs.filter((d) => selectedPaths.includes(d.path)).length;

  return (
    <div className="py-1">
      <button
        type="button"
        onClick={onToggleCollapse}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 hover:bg-slate-50 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3 text-slate-400" />
        ) : (
          <ChevronDown className="w-3 h-3 text-slate-400" />
        )}
        <span className="flex items-center gap-1.5 text-slate-600 normal-case tracking-normal text-[12px] font-semibold">
          <IconComp className={`w-3.5 h-3.5 ${iconColorCls}`} /> {title}
        </span>
        <div className="flex-1" />
        {selectedInSection > 0 && (
          <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 font-medium">
            ✓ {selectedInSection}
          </span>
        )}
        <span className="text-[11px] text-slate-400 tabular-nums font-normal">
          {docs.length}{docs.length !== totalCount ? `/${totalCount}` : ""}
        </span>
      </button>
      {!collapsed && (
        <ul className="text-sm">
          {docs.map((doc) => {
            const isChecked = selectedPaths.includes(doc.path);
            const isFocused = activeDocPath === doc.path;
            return (
              <li key={doc.path}>
                <div
                  className={`w-full pl-2 pr-3 py-1.5 flex items-center gap-1.5 transition-colors ${
                    isFocused
                      ? "bg-indigo-50 text-indigo-900 font-medium border-l-2 border-l-indigo-500 pl-[calc(0.5rem-2px)]"
                      : isChecked
                        ? "bg-emerald-50/40 text-slate-800 border-l-2 border-l-emerald-300 pl-[calc(0.5rem-2px)]"
                        : "hover:bg-slate-50 text-slate-700 border-l-2 border-l-transparent"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 accent-emerald-600 cursor-pointer shrink-0"
                    checked={isChecked}
                    onChange={() => onToggleSelected(doc.path)}
                    title={
                      isChecked
                        ? "QA 참고 대상에서 제외"
                        : "QA 참고 대상에 추가 (여러 문서 동시 선택 가능)"
                    }
                    aria-label={`${doc.title} 을(를) QA 참고 대상에 ${isChecked ? "제외" : "추가"}`}
                  />
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left flex items-center gap-2"
                    title={doc.path}
                    onClick={() => onDocSelect(doc)}
                  >
                    <Badge className={`text-[10px] h-4 px-1.5 rounded ${badgeCls} border font-medium shrink-0`}>
                      {badgeLabel}
                    </Badge>
                    <span className="truncate text-[13px]">{doc.title}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
