"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Target,
  Lock,
  ChevronLeft,
  Send,
  Search,
  RefreshCw,
  Bot,
  FileText as FileTextIcon,
  RotateCcw,
  Trash2,
  ExternalLink,
  CheckCircle2,
  PauseCircle,
  Clock,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTeamStore } from "@/lib/team-store";
import { usePlannerAuthStore } from "@/lib/planner-auth-store";
import {
  getTeam,
  TeamResponse,
  listDecisions,
  getDoc,
  deleteDecision,
  updateDecisionStatus,
  ApiError,
  DecisionListItem,
  DecisionStatus,
} from "@/lib/api";
import { MarkdownView } from "@/components/markdown-view";
import { PlannerAuthGate } from "@/components/planner-auth-gate";
import { NotificationToggle, notifyNewPending } from "@/components/notification-toggle";
import { UserDialog } from "@/components/user-dialog";
import { ApplyDecisionDialog, HoldDecisionDialog } from "@/components/planner-status-dialogs";
import { useUserDisplayName } from "@/lib/user-store";
import { BookOpen, User as UserIcon } from "lucide-react";

export default function PlannerPage() {
  const activeTeamSlug = useTeamStore((s) => s.activeTeamSlug);
  const setActiveTeam = useTeamStore((s) => s.setActiveTeam);
  const hasHydrated = useTeamStore((s) => s._hasHydrated);
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [teamLoadError, setTeamLoadError] = useState<string | null>(null);

  // URL ?team=X 우선 (초대 링크) → localStorage 값 override. 팀 로드도 같은 effect 에서 처리해
  //  URL 반영 전에 "팀 미선택" 안내 화면이 flash 되는 문제 방지.
  useEffect(() => {
    if (!hasHydrated) return;
    const urlTeam = new URLSearchParams(window.location.search).get("team");
    if (urlTeam && urlTeam !== activeTeamSlug) {
      setActiveTeam(urlTeam);
      return;
    }
    if (!activeTeamSlug) return;
    let cancelled = false;
    getTeam(activeTeamSlug)
      .then((t) => { if (!cancelled) setTeam(t); })
      .catch((err) => {
        if (!cancelled) setTeamLoadError(err instanceof ApiError ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, [hasHydrated, activeTeamSlug, setActiveTeam]);

  if (!hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-muted-foreground">
        로딩 중...
      </div>
    );
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

  if (teamLoadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-md p-6">
          <div className="text-5xl mb-3">⚠️</div>
          <h1 className="text-xl font-bold mb-2">팀 로드 실패</h1>
          <p className="text-xs font-mono text-red-600 mb-6">{teamLoadError}</p>
          <Link href="/">
            <Button variant="outline">← 협업자 모드</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <PlannerAuthGate teamSlug={activeTeamSlug} teamName={team?.team_name}>
      <PlannerBody teamSlug={activeTeamSlug} team={team} />
    </PlannerAuthGate>
  );
}

type StatusFilter = "all" | "pending" | "applied" | "hold";

/** 상태별 Lucide 아이콘 컴포넌트 반환 (색은 부모 컨텍스트 상속 · 크기는 호출부에서) */
function StatusIcon({ status, className = "w-3.5 h-3.5" }: { status: DecisionStatus; className?: string }) {
  const cls = className;
  if (status === "applied") return <CheckCircle2 className={`${cls} text-emerald-600`} />;
  if (status === "hold") return <PauseCircle className={`${cls} text-slate-500`} />;
  if (status === "rejected") return <XCircle className={`${cls} text-red-500`} />;
  if (status === "pending" || status === "unknown") return <Clock className={`${cls} text-amber-500`} />;
  return <Clock className={cls} />;
}

const STATUS_META: Record<DecisionStatus, {
  /** 리스트 · 액션바용 짧은 라벨 (예: `대기`) */
  label: string;
  /** 툴팁·SR용 긴 라벨 (예: `대기 — 아직 처리 안 됨`) */
  longLabel: string;
  /** 파스텔 pill 스타일 · 상세 액션바용 */
  pillCls: string;
  /** 좌측 리스트 dot 색 */
  dotCls: string;
}> = {
  pending: {
    label: "대기",
    longLabel: "대기 — 아직 처리 안 됨",
    pillCls: "bg-amber-50 text-amber-800 border-amber-200",
    dotCls: "bg-amber-400",
  },
  applied: {
    label: "적용",
    longLabel: "적용 — 정책 반영 완료",
    pillCls: "bg-emerald-50 text-emerald-800 border-emerald-200",
    dotCls: "bg-emerald-500",
  },
  hold: {
    label: "보류",
    longLabel: "보류 — 판단 대기",
    pillCls: "bg-slate-100 text-slate-700 border-slate-300",
    dotCls: "bg-slate-400",
  },
  rejected: {
    label: "반려",
    longLabel: "반려 — 반영 불가",
    pillCls: "bg-red-50 text-red-700 border-red-200",
    dotCls: "bg-red-500",
  },
  unknown: {
    label: "미상",
    longLabel: "미상 — 상태 파싱 실패",
    pillCls: "bg-slate-50 text-slate-500 border-slate-200",
    dotCls: "bg-slate-300",
  },
};

/** decision md 본문에서 "관련 문서: PATH" 를 추출. table 형식 · 인용 형식 둘 다 지원. */
function extractPolicyPath(md: string): string | null {
  if (!md) return null;
  let m = md.match(/📄\s*대상\s*파일[:：]\s*`([^`]+)`/);
  if (m) return m[1];
  m = md.match(/>\s*관련\s*문서[:：]\s*(.+)/);
  if (m) return m[1].trim().replace(/^`|`$/g, "");
  m = md.match(/\|\s*관련\s*문서\s*\|\s*`?([^`|\n]+)`?\s*\|/);
  if (m) return m[1].trim();
  return null;
}

/** 클립보드 복사 · 모던 API 실패 시 textarea+execCommand fallback.
 *  일부 브라우저·컨텍스트 (권한 거부·비활성 탭) 에서 navigator.clipboard 가 조용히 reject 함. */
async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** 상세 본문 정제 · 상단 헤더에 이미 제목 표시하므로 md 첫 `# 제목` 제거 + 연속 중복 헤더 압축.
 *  원본 md 데이터 자체가 `## 합의 요약` 을 두 번 등장시키는 경우 (렌더 실패로 화면 답답해짐) 자동 dedupe. */
function preprocessDecisionMd(content: string, itemTitle: string): string {
  if (!content) return content;
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  let skippedLeadingH1 = false;

  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const titleNorm = norm(itemTitle || "");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1) 첫 h1 이 selectedItem.title 과 일치하면 제거 (상단 헤더와 중복)
    if (!skippedLeadingH1 && trimmed.startsWith("# ")) {
      const h1Text = norm(trimmed.replace(/^#\s+/, ""));
      skippedLeadingH1 = true;
      if (titleNorm && (h1Text === titleNorm || h1Text.startsWith(titleNorm) || titleNorm.startsWith(h1Text))) {
        // 다음 빈줄도 함께 skip
        if (lines[i + 1]?.trim() === "") i += 1;
        continue;
      }
    }

    // 2) 연속으로 같은 헤더가 반복되면 두번째 이후는 skip (예: `## 합의 요약` × 2)
    const headerMatch = trimmed.match(/^(#{2,4})\s+(.+)$/);
    if (headerMatch) {
      // 최근에 push 한 non-empty 라인들에서 같은 헤더가 있는지 확인 (사이에 빈줄 허용)
      let j = out.length - 1;
      while (j >= 0 && out[j].trim() === "") j -= 1;
      if (j >= 0) {
        const prevHeaderMatch = out[j].trim().match(/^(#{2,4})\s+(.+)$/);
        if (prevHeaderMatch && prevHeaderMatch[1] === headerMatch[1] && norm(prevHeaderMatch[2]) === norm(headerMatch[2])) {
          // 중복 · 이번 줄과 앞 빈줄도 skip
          if (lines[i + 1]?.trim() === "") i += 1;
          continue;
        }
      }
    }

    out.push(line);
  }

  return out.join("\n");
}

/** Antigravity/Claude Code 붙여넣기용 프롬프트 생성. 원본 qa-planner.html §B-2 흐름 이식. */
function buildAntigravityPrompt(item: DecisionListItem, content: string): string {
  const policy = extractPolicyPath(content) || "(합의문 본문 참고)";
  const title = item.title || "제목 없음";
  const date = item.createdAt?.slice(0, 10) || "";
  return `[CLAUDE.md §B-2] 다음 합의를 정책에 반영해줘.

📋 합의문: ${item.path}
📍 대상 정책: ${policy}
📌 제목: ${title}${date ? "  (" + date + ")" : ""}

위 합의문(qa/decisions/) 의 "✅ 변경 후" 본문을 §B-2 수행 순서대로 적용:
1. A-0 형식으로 결론 + 변경 위치 + 신규 본문 요약 한 번 확인 (필요 시 OK 떨어질 때까지 의논)
2. 2단계 박제: cp policies/X_v0.1.A.md policies/_old/X_v0.1.A.md → git mv policies/X_v0.1.A.md policies/X_v0.1.B.md (cp+cp 금지)
3. 본문 수정: h1 타이틀 버전 표기 변경 + 버전 이력 표 상단 행 추가 + 📍 변경 위치 빠른 색인 표 신설 + 본문 패치
4. cross-link 일괄 갱신: rg "X_v0\\.1\\.A" --type md 결과를 신버전 파일명으로 모두 치환 (docs/CHANGELOG.md 의 과거 항목은 예외)
5. 연관 코드 수정: 본문 변경이 코드 SSoT 영향 (CAMPAIGN_TYPES, *Step.tsx 등) 이면 admin 레포에서 함께 수정
6. 검증: ls policies/ 에 구버전 없는지 + rg 로 cross-link 0건 확인
7. commit + push: 정책 commit 1건 + 코드 commit 1건 분리. 메시지에 변경 §X-Y 와 사유 포함

이 채널은 qa/decisions/ 에 합의문 생성 안 함 (기록은 git history + 정책 버전 이력 표).`;
}

function PlannerBody({ teamSlug, team }: { teamSlug: string; team: TeamResponse | null }) {
  const revoke = usePlannerAuthStore((s) => s.revoke);
  const userName = useUserDisplayName();
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [items, setItems] = useState<DecisionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [detailContent, setDetailContent] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DecisionListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  // 복사 성공 시 버튼 자체가 잠깐 "✅ 복사됨" 으로 바뀌도록 · 배너 놓쳐도 즉각 피드백
  const [copiedButton, setCopiedButton] = useState(false);
  useEffect(() => {
    if (!copiedButton) return;
    const t = setTimeout(() => setCopiedButton(false), 2000);
    return () => clearTimeout(t);
  }, [copiedButton]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listDecisions(teamSlug, 100);
      setItems(res.items);
      // 신규 pending 감지 → 브라우저 알림 발송 (권한 부여된 경우만 작동 · 첫 로드는 skip)
      const pending = res.items.filter((it) => it.status === "pending" || it.status === "unknown");
      notifyNewPending(teamSlug, pending.map((it) => ({ path: it.path, title: it.title })));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [teamSlug]);

  useEffect(() => { loadList(); }, [loadList]);

  // 알림이 켜져 있으면 5분마다 자동 poll · 신규 pending 감지
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const interval = setInterval(() => loadList(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadList]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 3500);
    return () => clearTimeout(t);
  }, [banner]);

  // 상태별 카운트 (탭 배지)
  const counts = useMemo(() => {
    const c = { all: items.length, pending: 0, applied: 0, hold: 0 };
    for (const it of items) {
      if (it.status === "pending" || it.status === "unknown") c.pending += 1;
      else if (it.status === "applied") c.applied += 1;
      else if (it.status === "hold") c.hold += 1;
    }
    return c;
  }, [items]);

  // 필터 적용
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (statusFilter !== "all") {
        const normalized = it.status === "unknown" ? "pending" : it.status;
        if (normalized !== statusFilter) return false;
      }
      if (q) {
        const hay = [it.title, it.requester, it.relatedDoc, it.path].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, statusFilter, search]);

  const selectedItem = useMemo(
    () => filtered.find((it) => it.path === selectedPath) ?? items.find((it) => it.path === selectedPath) ?? null,
    [filtered, items, selectedPath],
  );

  const [detailError, setDetailError] = useState<string | null>(null);

  async function handleSelect(item: DecisionListItem) {
    setSelectedPath(item.path);
    setDetailContent(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const res = await getDoc(teamSlug, item.path);
      setDetailContent(res.content);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetailLoading(false);
    }
  }

  /** 로드 실패 시 재시도 · 현재 선택된 항목 다시 fetch */
  async function retryDetail() {
    if (!selectedItem) return;
    await handleSelect(selectedItem);
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDecision(teamSlug, deleteTarget.path);
      setBanner({ kind: "success", msg: `삭제 완료: ${deleteTarget.title}` });
      if (selectedPath === deleteTarget.path) {
        setSelectedPath(null);
        setDetailContent(null);
      }
      setDeleteTarget(null);
      await loadList();
    } catch (err) {
      setBanner({ kind: "error", msg: `삭제 실패: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setDeleting(false);
    }
  }

  async function handleCopyAntigravity(item: DecisionListItem) {
    if (!detailContent) {
      setBanner({ kind: "error", msg: "본문 아직 로딩 중 · 잠시 후 다시 시도" });
      return;
    }
    const prompt = buildAntigravityPrompt(item, detailContent);
    if (await copyToClipboard(prompt)) {
      setCopiedButton(true);
      setBanner({ kind: "success", msg: "프롬프트 복사 완료. Antigravity에 붙여넣어 적용하세요." });
    } else {
      // 최종 폴백: 프롬프트를 window.prompt 로 노출해서 사용자가 수동 복사할 수 있게
      window.prompt("클립보드 복사 실패 — 아래 내용을 Ctrl+A · Ctrl+C 로 직접 복사하세요:", prompt);
      setBanner({ kind: "error", msg: "복사 실패 · 팝업창에서 수동 복사하세요" });
    }
  }

  function handleOpenRelatedPolicy(_item: DecisionListItem) {
    if (!detailContent) return;
    const policy = extractPolicyPath(detailContent);
    if (!policy) {
      setBanner({ kind: "error", msg: "관련 정책 경로를 md 에서 찾을 수 없어요" });
      return;
    }
    // 협업자 모드 (?team=X&doc=PATH) 새 탭 오픈. main page 가 doc 쿼리 읽어서 자동 선택.
    const url = `/?team=${encodeURIComponent(teamSlug)}&doc=${encodeURIComponent(policy)}`;
    window.open(url, "_blank");
  }

  const [statusChanging, setStatusChanging] = useState(false);
  // 적용/보류 다이얼로그 open 상태 · pending 복귀는 다이얼로그 없이 즉시
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [holdDialogOpen, setHoldDialogOpen] = useState(false);

  /** 실제 API 호출 + 리스트/상세 리로드. note 는 옵션. */
  async function doStatusChange(newStatus: "pending" | "applied" | "hold", note?: string) {
    if (!selectedItem) return;
    setStatusChanging(true);
    try {
      await updateDecisionStatus(teamSlug, selectedItem.path, newStatus, {
        note: note?.trim() || undefined,
        plannerName: userName?.trim() || undefined,
      });
      const suffix = note?.trim() ? " (메모 저장됨)" : "";
      setBanner({ kind: "success", msg: `상태 변경: ${STATUS_META[newStatus]?.label}${suffix} — ${selectedItem.title}` });
      await loadList();
      try {
        const res = await getDoc(teamSlug, selectedItem.path);
        setDetailContent(res.content);
      } catch { /* 최신 fetch 실패 무시 · list 는 갱신됨 */ }
    } catch (err) {
      setBanner({ kind: "error", msg: `상태 변경 실패: ${err instanceof Error ? err.message : String(err)}` });
      throw err; // 다이얼로그가 에러 인지 후 닫히지 않도록
    } finally {
      setStatusChanging(false);
    }
  }

  /** 상태 버튼 클릭 진입점.
   *  · applied/hold → 다이얼로그 열기 (메모 입력)
   *  · pending → 즉시 처리 (기획자가 되돌리기 · 메모 불필요) */
  function handleStatusChange(newStatus: DecisionStatus) {
    if (!selectedItem || statusChanging) return;
    if (newStatus === "unknown") return;
    if (selectedItem.status === newStatus) return;
    if (newStatus === "applied") { setApplyDialogOpen(true); return; }
    if (newStatus === "hold") { setHoldDialogOpen(true); return; }
    // pending 복귀는 즉시
    void doStatusChange("pending");
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="border-b border-slate-200 bg-white px-4 h-12 flex items-center gap-3">
        <div className="font-semibold text-[14px] text-slate-900 tracking-tight inline-flex items-center gap-1.5">
          <Target className="w-4 h-4 text-indigo-600" /> 기획자 모드
        </div>
        {team && (
          <span className="text-[12px] font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-md px-2 py-0.5">
            {team.team_name}
          </span>
        )}
        {team && (
          <a
            href={`https://github.com/${team.github_repo}/blob/main/qa/decisions/README.md`}
            target="_blank"
            rel="noopener noreferrer"
            title="변경 요청 처리 절차 안내 (GitHub 새 탭)"
            className="h-7 px-2 text-[12px] text-slate-500 hover:text-indigo-700 hover:bg-slate-100 rounded-md transition-colors inline-flex items-center gap-1"
          >
            <BookOpen className="w-3.5 h-3.5" /> 처리 절차 안내
          </a>
        )}
        <div className="flex-1" />
        <NotificationToggle />
        <button
          type="button"
          onClick={() => setUserDialogOpen(true)}
          title="답변자 이름 변경 · 합의문 메모에 기록됨"
          className="h-7 px-2 text-[12px] text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors inline-flex items-center gap-1"
        >
          <UserIcon className="w-3.5 h-3.5" /> {userName || "게스트"}
        </button>
        <button
          type="button"
          onClick={() => revoke(teamSlug)}
          title="이 팀의 기획자 인증 해제"
          className="h-7 px-2 text-[12px] text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors inline-flex items-center gap-1"
        >
          <Lock className="w-3.5 h-3.5" /> 인증 해제
        </button>
        <Link href={`/?team=${encodeURIComponent(teamSlug)}`}>
          <button
            type="button"
            className="h-7 px-2.5 text-[12px] font-medium text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors inline-flex items-center gap-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> 협업자 모드
          </button>
        </Link>
      </header>

      {banner && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div
            className={`px-4 py-2 rounded-md text-sm text-white shadow-lg ${
              banner.kind === "success" ? "bg-slate-800" : "bg-red-700"
            }`}
          >
            {banner.msg}
          </div>
        </div>
      )}

      {/* 상단 툴바: 제목 · 상태필터 · 검색 */}
      <div className="border-b bg-white">
        <div className="px-4 pt-2.5 pb-1.5 flex items-baseline gap-2">
          <h1 className="text-sm font-semibold text-slate-800 inline-flex items-center gap-1.5">
            <Send className="w-3.5 h-3.5 text-emerald-600" /> 기획전달 목록
          </h1>
          <span className="text-[11px] text-slate-500">
            총 {items.length}개 · 필터 후 {filtered.length}개
          </span>
        </div>
        <div className="px-4 pb-2 flex items-center gap-1.5 flex-wrap">
          <StatusTab active={statusFilter === "all"} onClick={() => setStatusFilter("all")} label="전체" count={counts.all} />
          <StatusTab active={statusFilter === "pending"} onClick={() => setStatusFilter("pending")} label="대기" icon={<Clock className="w-3 h-3" />} count={counts.pending} />
          <StatusTab active={statusFilter === "applied"} onClick={() => setStatusFilter("applied")} label="적용" icon={<CheckCircle2 className="w-3 h-3" />} count={counts.applied} />
          <StatusTab active={statusFilter === "hold"} onClick={() => setStatusFilter("hold")} label="보류" icon={<PauseCircle className="w-3 h-3" />} count={counts.hold} />
          <div className="flex-1" />
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="제목·요청자·경로 검색"
              className="h-8 text-xs pl-7"
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={loadList}
            disabled={loading}
            className="h-8 px-2 text-xs gap-1"
            title="목록 새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> 새로고침
          </Button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-[340px_1fr] overflow-hidden">
        {/* 리스트 */}
        <div className="overflow-y-auto border-r bg-white">
          {loading && <div className="p-4 text-sm text-muted-foreground">로딩 중...</div>}
          {error && (
            <div className="p-4 text-sm text-red-600">
              <div className="font-semibold">로드 실패</div>
              <div className="text-xs mt-1 font-mono break-all">{error}</div>
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground text-center">
              {items.length === 0 ? "대기 중인 기획전달이 없어요." : "조건에 맞는 항목이 없어요."}
            </div>
          )}
          <ul className="divide-y divide-slate-100">
            {filtered.map((item) => {
              const meta = STATUS_META[item.status] ?? STATUS_META.unknown;
              const isSelected = selectedPath === item.path;
              return (
                <li key={item.path} className="group relative">
                  <button
                    type="button"
                    onClick={() => handleSelect(item)}
                    className={`w-full text-left pl-3 pr-8 py-2.5 transition-colors ${
                      isSelected
                        ? "bg-indigo-50 border-l-[3px] border-l-indigo-600 pl-[calc(0.75rem-3px)]"
                        : "border-l-[3px] border-l-transparent hover:bg-slate-50"
                    }`}
                    title={item.path}
                  >
                    {/* row 1: 상태 이모지 · 제목 · 날짜 */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0" title={meta.longLabel}>
                        <StatusIcon status={item.status} className="w-3.5 h-3.5" />
                      </span>
                      <span className={`flex-1 text-[13px] truncate leading-snug ${
                        isSelected ? "font-semibold text-indigo-900" : "text-slate-800"
                      }`}>
                        {item.title}
                      </span>
                      {item.createdAt && (
                        <span className={`text-[11px] shrink-0 tabular-nums ${
                          isSelected ? "text-indigo-500" : "text-slate-400"
                        }`}>
                          {formatDate(item.createdAt)}
                        </span>
                      )}
                    </div>
                    {/* row 2: 관련 정책 · 요청자 pill */}
                    {(item.relatedDoc || item.requester) && (
                      <div className="flex items-center gap-1.5 mt-1 min-w-0 pl-[20px]">
                        {item.relatedDoc && (
                          <span className={`text-[11px] truncate flex-1 min-w-0 ${
                            isSelected ? "text-indigo-600" : "text-slate-400"
                          }`} title={item.relatedDoc}>
                            {basename(item.relatedDoc).replace(/\.md$/, "")}
                          </span>
                        )}
                        {item.requester && (
                          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
                            isSelected ? "bg-indigo-200 text-indigo-900" : "bg-slate-100 text-slate-600"
                          }`}>
                            {item.requester}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                  {/* 삭제: hover 시에만 노출 · 선택된 항목은 항상 노출 */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }}
                    className={`absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded p-1 transition ${
                      isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                    title="삭제 (기획자 권한)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* 상세 */}
        <div className="overflow-y-auto bg-white flex flex-col min-h-0">
          {!selectedItem ? (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
              <div className="text-center">
                <div className="text-4xl mb-2 opacity-30">📤</div>
                좌측에서 항목을 선택하면 본문이 표시됩니다.
              </div>
            </div>
          ) : (
            <>
              {/* 헤더 — identity 만 · 얇게 */}
              <div className="border-b border-slate-200 px-6 py-3">
                <h2 className="text-[15px] font-semibold text-slate-900 leading-snug">
                  {selectedItem.title}
                </h2>
                <div className="mt-1 flex items-center gap-2.5 text-[11px] text-slate-500 flex-wrap">
                  {selectedItem.createdAt && (
                    <span className="tabular-nums">{formatDate(selectedItem.createdAt)}</span>
                  )}
                  {selectedItem.requester && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="font-medium text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                        {selectedItem.requester}
                      </span>
                    </>
                  )}
                  {selectedItem.relatedDoc && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono truncate max-w-md" title={selectedItem.relatedDoc}>
                        {basename(selectedItem.relatedDoc)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* 액션바 — sticky · 얕은 회색 배경으로 헤더/본문 구분 */}
              <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur border-b border-slate-200 px-6 py-1.5 flex items-center gap-1.5 flex-wrap">
                {/* 좌측: 현재 상태 pill (short label + tooltip) */}
                <span
                  className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-semibold ${STATUS_META[selectedItem.status]?.pillCls}`}
                  title={STATUS_META[selectedItem.status]?.longLabel}
                >
                  <StatusIcon status={selectedItem.status} className="w-3 h-3" />
                  {STATUS_META[selectedItem.status]?.label}
                </span>

                {/* 중간: secondary 유틸 (Antigravity 는 preparatory 라 outline 톤 낮춤) */}
                <button
                  type="button"
                  onClick={() => handleCopyAntigravity(selectedItem)}
                  disabled={!detailContent}
                  className={`text-xs px-2.5 py-1 rounded-md font-medium border disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5 ${
                    copiedButton
                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                      : "bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                  }`}
                  title="CLAUDE.md §B-2 흐름으로 Claude Code (Antigravity) 에 붙여넣을 프롬프트 복사"
                >
                  {copiedButton ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> 복사됨
                    </>
                  ) : (
                    <>
                      <Bot className="w-3.5 h-3.5" /> Antigravity 프롬프트
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenRelatedPolicy(selectedItem)}
                  disabled={!detailContent || !extractPolicyPath(detailContent ?? "")}
                  className="text-xs px-2.5 py-1 rounded-md font-medium bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                  title="관련 정책 문서를 협업자 모드에서 열기 (새 탭)"
                >
                  <FileTextIcon className="w-3.5 h-3.5" /> 관련 정책 열기
                </button>

                <div className="flex-1" />

                {/* 우측: 상태 변경 · 파괴적/롤백은 텍스트 링크로 subtle */}
                <StatusActionButton
                  disabled={statusChanging || selectedItem.status === "applied"}
                  onClick={() => handleStatusChange("applied")}
                  cls="bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-700"
                  icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                  label="적용"
                />
                <StatusActionButton
                  disabled={statusChanging || selectedItem.status === "hold"}
                  onClick={() => handleStatusChange("hold")}
                  cls="bg-white text-amber-800 border border-amber-300 hover:bg-amber-50"
                  icon={<PauseCircle className="w-3.5 h-3.5" />}
                  label="보류"
                />
                {selectedItem.status !== "pending" && selectedItem.status !== "unknown" && (
                  <button
                    type="button"
                    disabled={statusChanging}
                    onClick={() => handleStatusChange("pending")}
                    className="text-[11px] text-slate-500 hover:text-slate-800 underline underline-offset-2 px-1 disabled:opacity-40 inline-flex items-center gap-1"
                    title="대기로 되돌림"
                  >
                    <RotateCcw className="w-3 h-3" /> 대기 초기화
                  </button>
                )}
                {statusChanging && (
                  <span className="text-[11px] text-slate-500 ml-1 inline-flex items-center gap-1">
                    <RotateCcw className="w-3 h-3 animate-spin" /> 상태 변경 중…
                  </span>
                )}

                {/* 오버플로 액션 (GitHub · 삭제 · 경로) */}
                <div className="flex items-center gap-2 pl-2 ml-1 border-l border-slate-200">
                  {team && (
                    <a
                      href={`https://github.com/${team.github_repo}/blob/main/${selectedItem.path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-slate-500 hover:text-slate-800 hover:underline inline-flex items-center gap-1"
                      title={selectedItem.path}
                    >
                      GitHub <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(selectedItem)}
                    className="text-[11px] text-slate-400 hover:text-red-600 px-1 inline-flex items-center gap-1"
                    title="이 합의문을 GitHub 에서 영구 삭제"
                  >
                    <Trash2 className="w-3 h-3" /> 삭제
                  </button>
                </div>
              </div>

              {/* 본문 · markdown 리딩 컨테이너 (적당한 여백) */}
              <div className="px-6 py-4 flex-1">
                {detailLoading ? (
                  <div className="text-[13px] text-slate-400">로딩 중...</div>
                ) : detailError ? (
                  <div className="rounded-md border border-red-200 bg-red-50 p-4 text-[13px] text-red-800 max-w-lg">
                    <div className="font-semibold mb-1 flex items-center gap-1.5">
                      <XCircle className="w-4 h-4" /> 문서 로드 실패
                    </div>
                    <div className="text-[12px] font-mono break-all text-red-700 mb-3">{detailError}</div>
                    <button
                      type="button"
                      onClick={retryDetail}
                      className="text-xs px-2.5 py-1 rounded-md font-medium bg-white text-red-700 border border-red-300 hover:bg-red-100 inline-flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> 다시 시도
                    </button>
                  </div>
                ) : detailContent ? (
                  <MarkdownView content={preprocessDecisionMd(detailContent, selectedItem?.title || "")} stripImages />
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 사용자 이름 변경 다이얼로그 */}
      <UserDialog open={userDialogOpen} onOpenChange={setUserDialogOpen} />

      {/* 적용/보류 상태 변경 다이얼로그 · 기획자 메모를 md 상단에 기록 */}
      {selectedItem && (
        <>
          <ApplyDecisionDialog
            open={applyDialogOpen}
            onOpenChange={setApplyDialogOpen}
            itemTitle={selectedItem.title}
            onConfirm={(note) => doStatusChange("applied", note)}
          />
          <HoldDecisionDialog
            open={holdDialogOpen}
            onOpenChange={setHoldDialogOpen}
            itemTitle={selectedItem.title}
            onConfirm={(note) => doStatusChange("hold", note)}
          />
        </>
      )}

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-lg p-5 max-w-md w-full space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-red-700">🗑 삭제 확인</h3>
            <p className="text-sm text-slate-700">
              이 항목을 <b>GitHub 레포에서 영구 삭제</b>합니다.
              <br />
              (커밋 이력엔 남으므로 필요 시 GitHub 에서 revert 가능)
            </p>
            <div className="text-sm bg-slate-50 border rounded p-2 space-y-0.5">
              <div className="font-medium">{deleteTarget.title}</div>
              <div className="font-mono text-xs text-slate-500 break-all">{deleteTarget.path}</div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                취소
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirmed}
                disabled={deleting}
              >
                {deleting ? "삭제 중..." : "🗑 삭제"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusActionButton({
  disabled,
  onClick,
  cls,
  label,
  icon,
}: {
  disabled: boolean;
  onClick: () => void;
  cls: string;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-xs px-2.5 py-1 rounded-md font-medium transition disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 ${cls}`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatusTab({
  active,
  onClick,
  label,
  count,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-3 py-1 rounded-full border transition inline-flex items-center gap-1 ${
        active
          ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
      }`}
    >
      {icon}
      <span>{label}</span>
      <span className={`ml-0.5 tabular-nums ${active ? "opacity-80" : "text-slate-400"}`}>{count}</span>
    </button>
  );
}

/** ISO date string 을 `MM-DD HH:mm` 로 짧게 표시 (당해년도) · 다른 년도면 `YYYY-MM-DD`. */
function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    const pad = (n: number) => String(n).padStart(2, "0");
    if (sameYear) return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  } catch {
    return iso;
  }
}

function basename(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(idx + 1) : p;
}
