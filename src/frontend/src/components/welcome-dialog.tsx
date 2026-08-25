"use client";
import { useEffect, useState } from "react";
import { Sparkles, MessageCircle, FileText, Send, FileCode2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const SEEN_KEY = "qa-bot:welcome-seen-v1";

/** 처음 방문한 사용자에게 봇 용도·핵심 사용법을 안내하는 다이얼로그.
 *  · 첫 방문 시 자동 오픈 · localStorage 로 재노출 제어
 *  · 헤더의 [?] 버튼으로 언제든 다시 열람 가능 */
export function WelcomeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    if (open) {
      // 열릴 때 체크박스 상태 리셋 (재열람 시 초기 상태로)
      setDontShow(false);
    }
  }, [open]);

  function handleClose() {
    if (dontShow) {
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* silent */
      }
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : handleClose())}>
      <DialogContent className="!max-w-[560px] !w-[560px]">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2 text-[16px]">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            blumnAI QA봇에 오신 걸 환영합니다
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 이게 뭘 해주는지 · 한 문장 */}
          <div className="rounded-md bg-indigo-50 border border-indigo-200 p-3 text-[13px] text-indigo-900 leading-relaxed">
            팀의 <b>정책 문서를 근거로 답변</b>하는 AI 문의봇입니다. 정책이 애매하거나 화면과 안
            맞으면 <b>기획자에게 바로 전달</b>할 수 있어요.
          </div>

          {/* 3단계 사용법 */}
          <div>
            <div className="text-[12px] font-semibold text-slate-700 mb-2">📌 이렇게 쓰세요</div>
            <ol className="space-y-2">
              <StepItem
                num={1}
                icon={<FileText className="w-4 h-4 text-indigo-600" />}
                title="왼쪽에서 참고 문서 선택"
                desc="체크박스로 관련 정책 선택 · 전체 정책이 궁금하면 [🌐 전체 정책 종합] 토글"
              />
              <StepItem
                num={2}
                icon={<MessageCircle className="w-4 h-4 text-indigo-600" />}
                title="오른쪽 챗 창에 질문"
                desc="구체적으로 물을수록 정확 · 이미지도 Ctrl+V 로 첨부 가능"
              />
              <StepItem
                num={3}
                icon={<Send className="w-4 h-4 text-emerald-600" />}
                title="필요 시 [기획전달] 눌러 기획자에게 전달"
                desc="정책이 불명확 · 실무와 안 맞을 때 · 답변 하단 [기획전달] 버튼"
              />
            </ol>
          </div>

          {/* 유용한 사례 하나 */}
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] font-semibold text-slate-600 mb-1">💡 이럴 때 유용해요</div>
            <ul className="text-[12px] text-slate-700 space-y-1 list-disc pl-4">
              <li>정책에 없는 예외 케이스가 실무에서 나올 때</li>
              <li>화면과 정책이 달라 어느 쪽이 맞는지 확인할 때</li>
              <li>
                <b>[HTML 목업]</b> 버튼으로 정책 기반 샘플 화면을 즉시 생성해 논의 근거로 사용
              </li>
            </ul>
          </div>

          {/* 재노출 제어 */}
          <label className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
              className="w-3.5 h-3.5 cursor-pointer"
            />
            다음부터 이 안내 자동으로 열지 않기 (헤더 [?] 로 언제든 다시 볼 수 있어요)
          </label>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleClose} className="bg-indigo-600 hover:bg-indigo-700 gap-1.5">
            <FileCode2 className="w-4 h-4" /> 시작하기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepItem({
  num,
  icon,
  title,
  desc,
}: {
  num: number;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <li className="flex gap-3 items-start">
      <div className="shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center justify-center">
        {num}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900">
          {icon}
          {title}
        </div>
        <div className="text-[11.5px] text-slate-600 mt-0.5 leading-relaxed">{desc}</div>
      </div>
    </li>
  );
}

/** 첫 방문 여부를 확인하는 helper (팀 로드 후 호출) */
export function hasSeenWelcome(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}
