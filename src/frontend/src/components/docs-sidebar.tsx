"use client";
import { useEffect, useState } from "react";
import { listDocs, listProjects, DocEntry, ApiError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface DocsSidebarProps {
  teamSlug: string;
  activeDocPath: string | null;
  onDocSelect: (doc: DocEntry | null) => void;
}

export function DocsSidebar({ teamSlug, activeDocPath, onDocSelect }: DocsSidebarProps) {
  const [projects, setProjects] = useState<Array<{ id: string; label: string }>>([]);
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadProjects() {
      try {
        const res = await listProjects(teamSlug);
        if (cancelled) return;
        setProjects(res.projects);
        setActiveProject(res.default);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : String(err));
      }
    }
    loadProjects();
    return () => { cancelled = true; };
  }, [teamSlug]);

  useEffect(() => {
    if (!activeProject) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listDocs(teamSlug, activeProject)
      .then((res) => {
        if (cancelled) return;
        setDocs(res.docs);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [teamSlug, activeProject]);

  const policies = docs.filter((d) => d.kind === "policy");
  const storyboards = docs.filter((d) => d.kind === "storyboard");

  return (
    <div className="flex flex-col h-full border-r bg-slate-50">
      <div className="p-3 border-b bg-white">
        <div className="text-xs text-muted-foreground mb-1">활성 팀</div>
        <div className="font-mono text-sm truncate" title={teamSlug}>{teamSlug}</div>
      </div>

      {projects.length > 1 && (
        <div className="p-3 border-b bg-white">
          <div className="text-xs text-muted-foreground mb-1">프로젝트</div>
          <select
            className="w-full text-sm border rounded p-1"
            value={activeProject ?? ""}
            onChange={(e) => setActiveProject(e.target.value || null)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading && <div className="p-4 text-sm text-muted-foreground">로딩 중...</div>}
        {error && (
          <div className="p-4 text-sm text-red-600">
            <div className="font-semibold">문서 로드 실패</div>
            <div className="text-xs mt-1">{error}</div>
          </div>
        )}
        {!loading && !error && (
          <>
            <DocGroup title="📋 정책 문서" docs={policies} activeDocPath={activeDocPath} onDocSelect={onDocSelect} />
            {storyboards.length > 0 && (
              <>
                <Separator />
                <DocGroup title="🖼 화면설계서" docs={storyboards} activeDocPath={activeDocPath} onDocSelect={onDocSelect} />
              </>
            )}
            {docs.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">
                이 프로젝트에 md 문서가 없어요.
                <br />
                GitHub 레포의 policies_dir 경로를 확인하세요.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DocGroup({
  title,
  docs,
  activeDocPath,
  onDocSelect,
}: {
  title: string;
  docs: DocEntry[];
  activeDocPath: string | null;
  onDocSelect: (doc: DocEntry | null) => void;
}) {
  if (docs.length === 0) return null;
  return (
    <div className="py-2">
      <div className="px-3 py-1 text-xs font-semibold text-slate-600 flex items-center gap-1">
        <span>{title}</span>
        <Badge variant="secondary" className="text-[10px] h-4">{docs.length}</Badge>
      </div>
      <ul className="text-sm">
        {docs.map((doc) => (
          <li key={doc.path}>
            <button
              type="button"
              className={`w-full text-left px-3 py-1.5 hover:bg-slate-200 truncate ${
                activeDocPath === doc.path ? "bg-indigo-100 text-indigo-900 font-medium" : ""
              }`}
              title={doc.path}
              onClick={() => onDocSelect(doc)}
            >
              {doc.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
