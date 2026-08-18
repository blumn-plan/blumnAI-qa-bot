"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** 3단 그리드 열 사이 드래그 리사이저.
 *  direction: 'left' = 왼쪽 사이드바 폭 조절, 'right' = 오른쪽 챗패널 폭 조절
 *  onChange 는 매 mousemove 마다 호출 (rAF throttled) · 부모가 store 에 반영. */
export function ColumnResizer({
  direction,
  currentWidth,
  onChange,
  title,
}: {
  direction: "left" | "right";
  currentWidth: number;
  onChange: (w: number) => void;
  title?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const rafId = useRef<number | null>(null);

  const handleDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      startX.current = e.clientX;
      startWidth.current = currentWidth;
      setDragging(true);
    },
    [currentWidth],
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - startX.current;
      // right resizer 는 마우스가 오른쪽 갈수록 챗패널 폭 감소해야 함 (역방향)
      const delta = direction === "left" ? dx : -dx;
      const next = startWidth.current + delta;
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        onChange(next);
        rafId.current = null;
      });
    };
    const handleUp = () => {
      setDragging(false);
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    // 커서 · 텍스트 선택 방지
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, direction, onChange]);

  return (
    <div
      onMouseDown={handleDown}
      role="separator"
      aria-orientation="vertical"
      title={title ?? "드래그하여 폭 조절"}
      className={`shrink-0 w-1 cursor-col-resize hover:bg-indigo-200 active:bg-indigo-400 transition-colors ${
        dragging ? "bg-indigo-400" : "bg-transparent"
      }`}
    />
  );
}
