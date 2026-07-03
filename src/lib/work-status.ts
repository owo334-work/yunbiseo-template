import type { WorkListType, WorkStatusValue } from "@/lib/types";

// 업무현황에서 직원이 추가할 수 있는 업무 리스트 종류
export const WORK_LIST_TYPES: { key: WorkListType; label: string; short: string }[] = [
  { key: "daily", label: "일간 업무리스트", short: "일간" },
  { key: "weekly", label: "주간 업무리스트", short: "주간" },
  { key: "monthly", label: "월간 업무리스트", short: "월간" },
  { key: "deadline", label: "마감기한 업무리스트", short: "마감업무" },
  { key: "instruction", label: "요청사항 업무리스트", short: "요청사항" },
];

export const WORK_LIST_LABEL: Record<WorkListType, string> = {
  daily: "일간 업무리스트",
  weekly: "주간 업무리스트",
  monthly: "월간 업무리스트",
  deadline: "마감기한 업무리스트",
  instruction: "요청사항 업무리스트",
};

// 왼쪽 '고정 업무' 간단 체크리스트 종류 (반복 루틴)
export const FIXED_LIST_TYPES: { key: WorkListType; label: string }[] = [
  { key: "daily", label: "일간 고정업무" },
  { key: "weekly", label: "주간 고정업무" },
  { key: "monthly", label: "월간 고정업무" },
];

// 진행상태 (확인상태)
export const WORK_STATUSES: WorkStatusValue[] = ["미진행", "진행중", "완료", "보류"];

// ── 직책 서열 (요청사항 배정 권한 판단용) ──────────────────────────────
// 낮을수록 하위 직책. 목록에 없는(비어있거나 비표준) 직책은 rank 0 = 권한 없음.
// ⚠️ supabase/migrations 의 position_rank() 함수와 값이 일치해야 한다.
export const POSITION_RANKS: { name: string; rank: number }[] = [
  { name: "사원", rank: 1 },
  { name: "주임", rank: 2 },
  { name: "대리", rank: 3 },
  { name: "과장", rank: 4 },
  { name: "차장", rank: 5 },
  { name: "부장", rank: 6 },
  { name: "이사", rank: 7 },
  { name: "상무", rank: 8 },
  { name: "전무", rank: 9 },
  { name: "부사장", rank: 10 },
  { name: "대표", rank: 11 },
];

// 요청사항 배정 기준 직책 기본값 (시스템설정에서 관리자가 변경)
export const DEFAULT_REQUEST_MIN_POSITION = "대리";
export const REQUEST_MIN_POSITION_KEY = "request_assign_min_position";

export function positionRank(position?: string | null): number {
  const found = POSITION_RANKS.find((p) => p.name === (position ?? "").trim());
  return found ? found.rank : 0;
}

// 기준 직책 이상인지 (관리자는 항상 true 로 별도 처리)
export function canAssignRequestByPosition(
  position: string | null | undefined,
  minPosition: string,
): boolean {
  const my = positionRank(position);
  const min = positionRank(minPosition) || positionRank(DEFAULT_REQUEST_MIN_POSITION);
  return my > 0 && my >= min;
}

// 상태별 뱃지 색상 (badge.tsx 가 아닌 인라인 뱃지 스타일과 동일한 톤 사용)
export const WORK_STATUS_STYLES: Record<WorkStatusValue, string> = {
  미진행: "border-slate-200 bg-slate-50 text-slate-600",
  진행중: "border-sky-200 bg-sky-50 text-sky-700",
  완료: "border-emerald-200 bg-emerald-50 text-emerald-700",
  보류: "border-amber-200 bg-amber-50 text-amber-700",
};
