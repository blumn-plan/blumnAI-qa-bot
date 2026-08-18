"use client";
import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";

/** 브라우저 Notification API 권한 상태 · 클릭 시 request 흐름 완결 · 레거시 qa-planner.html 이식 */
type Permission = "granted" | "denied" | "default" | "unsupported";

function readPermission(): Permission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as Permission;
}

export function NotificationToggle({
  onGranted,
}: {
  /** 권한 부여됐을 때 부모(planner)가 새 항목 감지 로직을 붙일 수 있도록 콜백. 옵셔널. */
  onGranted?: () => void;
}) {
  const [perm, setPerm] = useState<Permission>("default");

  useEffect(() => {
    setPerm(readPermission());
  }, []);

  const handleClick = useCallback(async () => {
    if (perm === "unsupported") {
      alert("이 브라우저는 알림을 지원하지 않습니다.");
      return;
    }
    if (perm === "granted") {
      alert("이미 알림이 켜져 있습니다.");
      return;
    }
    if (perm === "denied") {
      alert(
        "브라우저에서 알림이 차단되어 있어요.\n\n주소창 좌측 자물쇠 🔒 아이콘 → 사이트 설정 → 알림 → 허용 으로 변경해 주세요.",
      );
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPerm(result as Permission);
      if (result === "granted") {
        // 데모 알림 · 사용자에게 즉시 피드백
        new Notification("🎯 기획자 모드 — 알림 활성화", {
          body: "새 기획전달이 도착하면 여기로 알려드릴게요.",
          tag: "notif-demo",
        });
        onGranted?.();
      }
    } catch (e) {
      alert("알림 권한 요청 실패: " + (e instanceof Error ? e.message : String(e)));
    }
  }, [perm, onGranted]);

  const meta =
    perm === "granted"
      ? { icon: <BellRing className="w-3.5 h-3.5 text-emerald-600" />, label: "알림 ON", cls: "text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100", title: "새 기획전달 도착 시 브라우저 알림 표시" }
      : perm === "denied"
        ? { icon: <BellOff className="w-3.5 h-3.5 text-slate-400" />, label: "알림 차단", cls: "text-slate-500 border-slate-200 bg-slate-50 hover:bg-slate-100", title: "브라우저 설정에서 차단됨. 클릭 시 해제 방법 안내" }
        : perm === "unsupported"
          ? { icon: <BellOff className="w-3.5 h-3.5 text-slate-300" />, label: "알림 미지원", cls: "text-slate-400 border-slate-200 bg-white cursor-not-allowed", title: "이 브라우저는 Notification API 미지원" }
          : { icon: <Bell className="w-3.5 h-3.5" />, label: "알림 받기", cls: "text-slate-600 border-slate-200 bg-white hover:bg-slate-50", title: "클릭하여 브라우저 알림 권한 허용" };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={meta.title}
      disabled={perm === "unsupported"}
      className={`h-7 px-2 text-[12px] border rounded-md transition-colors inline-flex items-center gap-1 ${meta.cls}`}
    >
      {meta.icon}
      <span>{meta.label}</span>
    </button>
  );
}

/** 신규 pending 항목 감지 · 브라우저 알림 발송.
 *  planner 가 loadList 후 이 함수 호출 · localStorage 기반 seenIds 로 중복 방지. */
export function notifyNewPending(
  teamSlug: string,
  currentPendingItems: Array<{ path: string; title: string }>,
): number {
  if (typeof window === "undefined" || !("Notification" in window)) return 0;
  if (Notification.permission !== "granted") return 0;

  const key = `blumnai-notified-decisions:${teamSlug}`;
  const seenRaw = window.localStorage.getItem(key);
  const seen = new Set<string>(seenRaw ? JSON.parse(seenRaw) : []);

  // 첫 실행 (seen 이 비어있으면) 은 알림 X · 기존 항목을 새것으로 오인 방지
  const isFirstRun = seen.size === 0;

  let notified = 0;
  for (const item of currentPendingItems) {
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    if (!isFirstRun) {
      new Notification("📤 새 기획전달", {
        body: item.title,
        tag: item.path,
      });
      notified += 1;
    }
  }
  window.localStorage.setItem(key, JSON.stringify([...seen]));
  return notified;
}
