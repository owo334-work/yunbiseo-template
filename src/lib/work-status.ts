import type { WorkListType, WorkStatusValue } from "@/lib/types";

// 업무현황에서 직원이 추가할 수 있는 업무 리스트 종류
export const WORK_LIST_TYPES: { key: WorkListType; label: string; short: string }[] = [
  { key: "daily", label: "일간 업무리스트", short: "일간" },
  { key: "weekly", label: "주간 업무리스트", short: "주간" },
  { key: "monthly", label: "월간 업무리스트", short: "월간" },
  { key: "deadline", label: "마감기한 업무리스트", short: "마감업무" },
  { key: "instruction", label: "추가 지시사항리스트", short: "지시사항" },
];

export const WORK_LIST_LABEL: Record<WorkListType, string> = {
  daily: "일간 업무리스트",
  weekly: "주간 업무리스트",
  monthly: "월간 업무리스트",
  deadline: "마감기한 업무리스트",
  instruction: "추가 지시사항리스트",
};

// 왼쪽 '고정 업무' 간단 체크리스트 종류 (반복 루틴)
export const FIXED_LIST_TYPES: { key: WorkListType; label: string }[] = [
  { key: "daily", label: "일간 고정업무" },
  { key: "weekly", label: "주간 고정업무" },
  { key: "monthly", label: "월간 고정업무" },
];

// 진행상태 (확인상태)
export const WORK_STATUSES: WorkStatusValue[] = ["미진행", "진행중", "완료", "보류"];

// 상태별 뱃지 색상 (badge.tsx 가 아닌 인라인 뱃지 스타일과 동일한 톤 사용)
export const WORK_STATUS_STYLES: Record<WorkStatusValue, string> = {
  미진행: "border-slate-200 bg-slate-50 text-slate-600",
  진행중: "border-sky-200 bg-sky-50 text-sky-700",
  완료: "border-emerald-200 bg-emerald-50 text-emerald-700",
  보류: "border-amber-200 bg-amber-50 text-amber-700",
};
