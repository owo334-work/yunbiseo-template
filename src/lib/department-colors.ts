// 부서별 일정 색상
// system_settings 테이블에 key='department_colors' 로 { 부서명: "#hex" } JSON 을 저장한다.
// 시스템설정에서 관리자가 지정하며, 전 직원 일정 캘린더에서 부서별로 색을 입힌다.

export const DEPARTMENT_COLORS_KEY = "department_colors";

// 부서 색상 미지정 시 이름 기준으로 자동 배정하는 팔레트 (구분이 잘 되는 색들)
export const DEPARTMENT_COLOR_PALETTE = [
  "#3b82f6", // 파랑
  "#22c55e", // 초록
  "#f59e0b", // 주황
  "#8b5cf6", // 보라
  "#ec4899", // 분홍
  "#14b8a6", // 청록
  "#ef4444", // 빨강
  "#6366f1", // 남보라
  "#84cc16", // 라임
  "#f97316", // 진주황
];

// 부서 미지정(부서명이 비어있는) 직원 일정 색상
export const NO_DEPARTMENT_COLOR = "#6b7280";

export type DepartmentColorMap = Record<string, string>;

/** system_settings.value(문자열)에서 부서 색상 맵을 파싱한다. */
export function parseDepartmentColors(value: string | null | undefined): DepartmentColorMap {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") return parsed as DepartmentColorMap;
  } catch {
    /* 손상된 값은 빈 맵으로 */
  }
  return {};
}

/** 문자열을 팔레트 인덱스로 (부서명 → 안정적인 자동 색상) */
function hashIndex(text: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (h * 31 + text.charCodeAt(i)) >>> 0;
  }
  return h % mod;
}

/**
 * 부서명에 대한 색상을 돌려준다.
 * 1) 저장된 맵에 지정 색이 있으면 그 색
 * 2) 없으면 이름 해시로 팔레트에서 자동 배정
 * 3) 부서명이 없으면 회색
 */
export function colorForDepartment(
  department: string | null | undefined,
  colors: DepartmentColorMap,
): string {
  const key = (department ?? "").trim();
  if (!key) return NO_DEPARTMENT_COLOR;
  if (colors[key]) return colors[key];
  return DEPARTMENT_COLOR_PALETTE[hashIndex(key, DEPARTMENT_COLOR_PALETTE.length)];
}
