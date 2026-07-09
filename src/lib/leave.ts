// 연/월차(휴가) 계산 로직
// 부여 연차는 입사일 기준 법정식으로 자동계산하고, 계산 기준(회계연도/입사일)은 설정으로 전환한다.

export type LeaveBasis = "fiscal" | "hire"; // fiscal=회계연도(1~12월), hire=입사일 기준
export const LEAVE_BASIS_KEY = "leave_basis";

// 휴가 단위 (일정 등록 시 선택)
export const LEAVE_UNIT_OPTIONS = [
  { value: 1, label: "종일" },
  { value: 0.5, label: "반차" },
  { value: 0.25, label: "반반차" },
] as const;

export function parseLeaveBasis(value: string | null | undefined): LeaveBasis {
  return value === "hire" ? "hire" : "fiscal";
}

function toDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 만 근속 연수
function fullYearsBetween(from: Date, to: Date): number {
  let years = to.getFullYear() - from.getFullYear();
  const m = to.getMonth() - from.getMonth();
  if (m < 0 || (m === 0 && to.getDate() < from.getDate())) years -= 1;
  return years;
}

// 만 근속 개월수
function fullMonthsBetween(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return months;
}

/**
 * 입사일 기준 법정 연차 부여일수.
 * - 근속 1년 미만: 1개월 개근당 1일 (최대 11일) — 여기선 만 근속 개월수로 근사
 * - 근속 1년 이상: 15일 + (근속연수-1)//2 (2년마다 +1), 최대 25일
 */
export function annualLeaveGranted(
  hireDate: string | null | undefined,
  asOf: Date = new Date(),
): number {
  if (!hireDate) return 0;
  const hire = toDate(hireDate);
  if (Number.isNaN(hire.getTime()) || hire > asOf) return 0;
  const years = fullYearsBetween(hire, asOf);
  if (years < 1) {
    return Math.min(11, Math.max(0, fullMonthsBetween(hire, asOf)));
  }
  return Math.min(25, 15 + Math.floor((years - 1) / 2));
}

/**
 * 현재 휴가연도 범위(YYYY-MM-DD).
 * - fiscal: 올해 1/1 ~ 12/31
 * - hire  : 최근 입사기념일 ~ 다음 기념일 전날 (입사일 없으면 회계연도로 폴백)
 */
export function leaveYearRange(
  basis: LeaveBasis,
  hireDate: string | null | undefined,
  asOf: Date = new Date(),
): { start: string; end: string } {
  const y = asOf.getFullYear();
  if (basis === "hire" && hireDate) {
    const hire = toDate(hireDate);
    if (!Number.isNaN(hire.getTime())) {
      const mm = hire.getMonth();
      const dd = hire.getDate();
      let start = new Date(y, mm, dd);
      if (start > asOf) start = new Date(y - 1, mm, dd);
      const end = new Date(start.getFullYear() + 1, mm, dd);
      end.setDate(end.getDate() - 1);
      return { start: iso(start), end: iso(end) };
    }
  }
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

/** 날짜(YYYY-MM-DD)가 [start, end] 범위 안인지 */
export function isWithinRange(date: string, range: { start: string; end: string }): boolean {
  return date >= range.start && date <= range.end;
}

// 휴가 일정 최소 형태
export interface LeaveScheduleRow {
  leave_employee_id: string | null;
  category: string;
  leave_days: number | null;
  start_at: string;
}

// 직원 최소 형태 (계산에 필요한 필드만)
export interface LeaveEmployeeInput {
  id: string;
  hire_date?: string | null;
  annual_leave_adjust?: number | null;
  monthly_leave_granted?: number | null;
}

export interface LeaveSummary {
  annualGranted: number;
  annualUsed: number;
  annualRemaining: number;
  monthlyGranted: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  range: { start: string; end: string };
}

// 일정 시작시각(ISO) → 로컬(KST) 날짜 YYYY-MM-DD
function scheduleDate(startAt: string): string {
  const d = new Date(startAt);
  if (Number.isNaN(d.getTime())) return "";
  return iso(d);
}

/** 한 직원의 연차/월차 부여·사용·잔여를 계산한다. */
export function computeLeaveSummary(
  employee: LeaveEmployeeInput,
  leaveSchedules: LeaveScheduleRow[],
  basis: LeaveBasis,
  asOf: Date = new Date(),
): LeaveSummary {
  const range = leaveYearRange(basis, employee.hire_date, asOf);
  const annualGranted =
    annualLeaveGranted(employee.hire_date, asOf) + (employee.annual_leave_adjust ?? 0);
  const monthlyGranted = employee.monthly_leave_granted ?? 0;

  let annualUsed = 0;
  let monthlyUsed = 0;
  for (const s of leaveSchedules) {
    if (s.leave_employee_id !== employee.id) continue;
    if (!isWithinRange(scheduleDate(s.start_at), range)) continue;
    const days = s.leave_days ?? 0;
    if (s.category === "annual_leave") annualUsed += days;
    else if (s.category === "monthly_leave") monthlyUsed += days;
  }

  return {
    annualGranted,
    annualUsed,
    annualRemaining: annualGranted - annualUsed,
    monthlyGranted,
    monthlyUsed,
    monthlyRemaining: monthlyGranted - monthlyUsed,
    range,
  };
}
