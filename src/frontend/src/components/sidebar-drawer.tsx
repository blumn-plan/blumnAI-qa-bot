"use client";
import { useEffect, ReactNode } from "react";
import { X } from "lucide-react";
import { useLayoutStore } from "@/lib/layout-store";

interface SidebarDrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** 헤더 우측에 추가로 렌더될 컨트롤 (예: 가이드 버튼) */
  headerExtra?: ReactNode;
  children: ReactNode;
}

/** 사이드바 오른쪽에 붙는 서랍형 오버레이 패널.
 *  기존 인라인 확장 대신 fixed-positioned 로 열려서 스크롤 부담 X.
 *  · 사이드바 폭은 useLayoutStore 에서 실시간으로 가져옴 (리사이저 드래그 대응).
 *  · 상단 오프셋 48px = 앱 헤더 높이 (page.tsx header h-12).
 *  · ESC · 배경 클릭 · [✕] 로 닫힘. */
export function SidebarDrawer({
  open,
  onClose,
  title,
  headerExtra,
  children,
}: SidebarDrawerProps) {
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* 배경 클릭 시 닫힘 · 살짝 어둡게 (사이드바 오른쪽 영역만) */}
      <div
        className="fixed inset-0 z-30 bg-black/10"
        style={{ left: sidebarWidth + 4 }}
        onClick={onClose}
        aria-label="드로어 닫기 배경"
      />
      {/* 서랍 · 사이드바 오른쪽에 붙어서 슬라이드 인 */}
      <div
        className="fixed top-12 bottom-0 z-40 bg-white shadow-2xl border-l border-r border-slate-200 flex flex-col animate-drawer-slide-in"
        style={{ left: sidebarWidth + 4, width: 380 }}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-slate-50">
          <div className="flex-1 min-w-0 text-[13px] font-semibold text-slate-800 truncate">
            {title}
          </div>
          {headerExtra}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100"
            title="닫기 (ESC)"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}
