import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Base UI Dialog Root 의 onOpenChange 를 감싸 outside click / ESC 로 인한 닫힘을 막는다.
 *  폼 입력 중 오조작 방지용. 명시적 Close/Cancel 버튼과 X 버튼은 그대로 동작. */
export function preventCasualDismiss(
  setOpen: (open: boolean) => void,
) {
  return (open: boolean, details?: { reason?: string; cancel?: () => void }) => {
    if (!open && details && (details.reason === "outsidePress" || details.reason === "escapeKey")) {
      details.cancel?.();
      return;
    }
    setOpen(open);
  };
}
