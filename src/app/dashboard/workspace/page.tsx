"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
  PageToolbar,
} from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  CalendarMonthView,
  type DayMarker,
} from "@/components/calendar/calendar-month-view";
import {
  addDays,
  addMonths,
  DEFAULT_SCHEDULE_CATEGORIES,
  format,
  getCategoryColor,
  isLeaveCategory,
  parseISO,
  setLoadedCategories,
  startOfDay,
  startOfMonth,
  subMonths,
} from "@/components/calendar/calendar-utils";
import { DayDetailDialog } from "./day-detail-dialog";
import { SharePanel } from "./share-panel";
import { createClient } from "@/lib/supabase/client";
import type {
  Employee,
  Schedule,
  ScheduleCategoryItem,
  WorkListType,
  WorkStatusTask,
  WorkStatusValue,
} from "@/lib/types";
import {
  sortEmployeesForWork,
  WORK_LIST_TYPES,
  WORK_STATUS_STYLES,
} from "@/lib/work-status";
import {
  colorForDepartment,
  DEPARTMENT_COLORS_KEY,
  NO_DEPARTMENT_COLOR,
  parseDepartmentColors,
  type DepartmentColorMap,
} from "@/lib/department-colors";

// 카드 미리보기에서 보여줄 업무 우선순위 (진행중 → 미진행 → 보류 → 완료)
const STATUS_PRIORITY: Record<WorkStatusValue, number> = {
  진행중: 0,
  미진행: 1,
  보류: 2,
  완료: 3,
};

const LIST_SHORT: Record<WorkListType, string> = WORK_LIST_TYPES.reduce(
  (acc, cur) => ({ ...acc, [cur.key]: cur.short }),
  {} as Record<WorkListType, string>,
);

const PREVIEW_LIMIT = 4;

// 생일 마커 색상 (핑크)
const BIRTHDAY_COLOR = "#ec4899";

// 진척도 게이지 색상
function progressBarTone(value: number) {
  if (value >= 100) return "bg-emerald-500";
  if (value >= 50) return "bg-sky-500";
  if (value > 0) return "bg-amber-500";
  return "bg-slate-300";
}

type EmployeeWithTasks = Employee & {
  tasks: WorkStatusTask[];
  total: number;
  미진행: number;
  진행중: number;
  완료: number;
  보류: number;
};

export default function WorkspacePage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<WorkStatusTask[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [deptColors, setDeptColors] = useState<DepartmentColorMap>({});
  const [categories, setCategories] = useState<ScheduleCategoryItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dayDialogOpen, setDayDialogOpen] = useState(false);
  const [calMonth, setCalMonth] = useState<Date>(() =>
    startOfMonth(new Date()),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [search, setSearch] = useState("");
  // 업무현황 미리보기 '펼치기' 상태 (직원 id 집합)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((employeeId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    setTableMissing(false);

    const [employeeRes, taskRes, scheduleRes, deptColorRes, catRes] =
      await Promise.all([
        supabase
          .from("employees")
          .select("*")
          .order("name", { ascending: true })
          .limit(1000),
        supabase.from("work_status_tasks").select("*").limit(5000),
        supabase.from("schedules").select("*").limit(5000),
        supabase
          .from("system_settings")
          .select("value")
          .eq("key", DEPARTMENT_COLORS_KEY)
          .maybeSingle(),
        supabase
          .from("schedule_categories")
          .select("*")
          .order("sort_order", { ascending: true })
          .limit(500),
      ]);

    if (employeeRes.error) {
      console.error("직원 목록 조회 실패:", employeeRes.error.message);
      setError(true);
      setLoading(false);
      return;
    }

    setEmployees(
      sortEmployeesForWork(
        (employeeRes.data ?? []).filter((e) => e.is_active !== false),
      ),
    );
    setSchedules(
      scheduleRes.error ? [] : ((scheduleRes.data ?? []) as Schedule[]),
    );
    setDeptColors(parseDepartmentColors(deptColorRes.data?.value));
    const loadedCats = catRes.error
      ? []
      : ((catRes.data ?? []) as ScheduleCategoryItem[]);
    setCategories(loadedCats);
    if (loadedCats.length > 0) {
      setLoadedCategories(
        loadedCats.map((c) => ({ value: c.value, color: c.color })),
      );
    }

    if (taskRes.error) {
      // 마이그레이션(work_status_tasks)이 아직 적용되지 않은 경우
      console.error("업무현황 조회 실패:", taskRes.error.message);
      setTableMissing(true);
      setTasks([]);
    } else {
      setTasks(taskRes.data ?? []);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
  }, [fetchData]);

  const employeesWithTasks: EmployeeWithTasks[] = useMemo(() => {
    return employees.map((employee) => {
      // 메인 화면 직원 카드에는 마감기한·요청사항 업무만 집계 (고정업무 제외, 보관 제외)
      const own = tasks.filter(
        (t) =>
          t.employee_id === employee.id &&
          (t.list_type === "deadline" || t.list_type === "instruction") &&
          t.archived_at == null,
      );
      return {
        ...employee,
        tasks: own,
        total: own.length,
        미진행: own.filter((t) => t.status === "미진행").length,
        진행중: own.filter((t) => t.status === "진행중").length,
        완료: own.filter((t) => t.status === "완료").length,
        보류: own.filter((t) => t.status === "보류").length,
      };
    });
  }, [employees, tasks]);

  // 일정 작성자(직원) → 부서 색상
  const empDeptById = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const e of employees) m.set(e.id, e.department ?? null);
    return m;
  }, [employees]);

  const getEventColor = useCallback(
    (s: Schedule) =>
      colorForDepartment(empDeptById.get(s.created_by) ?? null, deptColors),
    [empDeptById, deptColors],
  );

  // 캘린더 범례용 부서 목록 (+ 부서 미지정 존재 여부)
  const deptLegend = useMemo(() => {
    const set = new Set<string>();
    let hasNone = false;
    for (const e of employees) {
      const d = e.department?.trim();
      if (d) set.add(d);
      else hasNone = true;
    }
    return {
      items: Array.from(set)
        .sort((a, b) => a.localeCompare(b, "ko"))
        .map((d) => ({ name: d, color: colorForDepartment(d, deptColors) })),
      hasNone,
    };
  }, [employees, deptColors]);

  // 일정 유형 색상/라벨 조회용 (DB 값 없으면 기본값)
  const catList = useMemo(
    () => (categories.length > 0 ? categories : DEFAULT_SCHEDULE_CATEGORIES),
    [categories],
  );

  // 직원 id → 이름
  const employeeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) m.set(e.id, e.name);
    return m;
  }, [employees]);

  // 업무 일정 / 연차·월차 분리 (연차·월차는 캘린더 상단 마커로 따로 표시)
  const workSchedules = useMemo(
    () => schedules.filter((s) => !isLeaveCategory(s.category)),
    [schedules],
  );
  const leaveSchedules = useMemo(
    () => schedules.filter((s) => isLeaveCategory(s.category)),
    [schedules],
  );

  // 연차/월차를 날짜별로 펼쳐 매핑 (여러 날 범위 지원)
  const leaveByDate = useMemo(() => {
    const m = new Map<string, Schedule[]>();
    for (const s of leaveSchedules) {
      const start = startOfDay(parseISO(s.start_at));
      const endRaw = parseISO(s.end_at);
      const end = startOfDay(endRaw >= start ? endRaw : start);
      let cur = start;
      while (cur <= end) {
        const key = format(cur, "yyyy-MM-dd");
        const arr = m.get(key) ?? [];
        arr.push(s);
        m.set(key, arr);
        cur = addDays(cur, 1);
      }
    }
    return m;
  }, [leaveSchedules]);

  // 생일: MM-dd → 직원들 (해마다 반복)
  const birthdaysByMonthDay = useMemo(() => {
    const m = new Map<string, Employee[]>();
    for (const e of employees) {
      if (!e.birthday) continue;
      const md = e.birthday.slice(5); // MM-dd
      const arr = m.get(md) ?? [];
      arr.push(e);
      m.set(md, arr);
    }
    return m;
  }, [employees]);

  const getDayMarkers = useCallback(
    (dateKey: string): DayMarker[] => {
      const markers: DayMarker[] = [];
      for (const e of birthdaysByMonthDay.get(dateKey.slice(5)) ?? []) {
        markers.push({
          id: `bday-${e.id}`,
          label: e.name,
          emoji: "🎂",
          color: BIRTHDAY_COLOR,
        });
      }
      for (const s of leaveByDate.get(dateKey) ?? []) {
        markers.push({
          id: `leave-${s.id}`,
          label: s.title,
          color: getCategoryColor(s.category),
        });
      }
      return markers;
    },
    [birthdaysByMonthDay, leaveByDate],
  );

  const openDay = (day: Date) => {
    setSelectedDate(day);
    setDayDialogOpen(true);
  };

  // 선택한 날짜 상세 (팝업)
  const selectedKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const selectedBirthdays = selectedKey
    ? (birthdaysByMonthDay.get(selectedKey.slice(5)) ?? [])
    : [];
  const selectedLeaves = selectedKey
    ? (leaveByDate.get(selectedKey) ?? [])
    : [];
  const selectedWorks = useMemo(() => {
    if (!selectedKey) return [];
    return workSchedules.filter((s) => {
      const start = startOfDay(parseISO(s.start_at));
      const endRaw = parseISO(s.end_at);
      const end = startOfDay(endRaw >= start ? endRaw : start);
      return (
        format(start, "yyyy-MM-dd") <= selectedKey &&
        selectedKey <= format(end, "yyyy-MM-dd")
      );
    });
  }, [selectedKey, workSchedules]);

  const keyword = search.trim();
  const filtered = employeesWithTasks.filter((employee) => {
    if (!keyword) return true;
    return (
      employee.name.includes(keyword) ||
      employee.department?.includes(keyword) ||
      employee.position?.includes(keyword)
    );
  });

  return (
    <PageShell>
      <PageHeader
        title="업무 대시보드"
        description="전 직원의 업무현황을 한눈에 확인합니다. 직원 카드를 누르면 일간·주간·월간 업무리스트와 진행상태를 볼 수 있습니다."
      />

      {tableMissing ? (
        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-800">
          업무현황 테이블이 아직 데이터베이스에 적용되지 않았습니다. 터미널에서{" "}
          <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono">
            supabase db push
          </code>{" "}
          를 실행해 마이그레이션을 적용해 주세요.
        </div>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-6">
          {/* 전 직원 일정 통합 캘린더 (개인 페이지에서 등록한 일정이 여기에 모입니다) */}
          <Card className="border-border/70 bg-card/85">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CalendarDays className="h-4 w-4 text-primary" />전 직원 일정
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setCalMonth((c) => subMonths(c, 1))}
                    aria-label="이전 달"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setCalMonth(startOfMonth(new Date()))}
                  >
                    오늘
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setCalMonth((c) => addMonths(c, 1))}
                    aria-label="다음 달"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <span className="ml-2 text-sm font-semibold text-foreground">
                    {format(calMonth, "yyyy년 M월")}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {deptLegend.items.length > 0 || deptLegend.hasNone ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-xs text-muted-foreground">
                    부서별 색상
                  </span>
                  {deptLegend.items.map((d) => (
                    <span
                      key={d.name}
                      className="flex items-center gap-1.5 text-xs text-foreground"
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: d.color }}
                      />
                      {d.name}
                    </span>
                  ))}
                  {deptLegend.hasNone ? (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: NO_DEPARTMENT_COLOR }}
                      />
                      부서 미지정
                    </span>
                  ) : null}
                </div>
              ) : null}
              <CalendarMonthView
                currentDate={calMonth}
                schedules={workSchedules}
                getEventColor={getEventColor}
                getDayMarkers={getDayMarkers}
                onDateClick={(day) => openDay(day)}
                onEventClick={(s) => openDay(parseISO(s.start_at))}
              />
            </CardContent>
          </Card>

          <PageToolbar>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Input
                placeholder="이름, 부서, 직급으로 검색하세요"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full sm:max-w-sm"
              />
              <span className="text-sm text-muted-foreground">
                {filtered.length}명 표시 중
              </span>
            </div>
          </PageToolbar>

          {loading ? (
            <LoadingState title="업무 대시보드를 불러오는 중입니다." />
          ) : error ? (
            <ErrorState onRetry={() => void fetchData()} />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={
                employees.length === 0
                  ? "등록된 직원이 없습니다."
                  : "조건에 맞는 직원이 없습니다."
              }
              description={
                employees.length === 0
                  ? "직원관리에서 직원을 추가하면 이곳에서 전 직원의 업무현황을 한눈에 볼 수 있습니다."
                  : "검색어를 조정해 보세요."
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((employee) => {
                const openTasks = [...employee.tasks]
                  .filter((t) => t.status !== "완료")
                  .sort(
                    (a, b) =>
                      STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status],
                  );
                const isExpanded = expandedIds.has(employee.id);
                const preview = isExpanded
                  ? openTasks
                  : openTasks.slice(0, PREVIEW_LIMIT);
                const hidden = openTasks.length - preview.length;

                return (
                  <Link
                    key={employee.id}
                    href={`/dashboard/work-status/${employee.id}`}
                  >
                    <Card className="h-full cursor-pointer border-border/70 bg-card/85 transition-all hover:border-primary/30 hover:shadow-md">
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                            {employee.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {employee.name}의 업무현황
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {[employee.department, employee.position]
                                .filter(Boolean)
                                .join(" · ") || "부서 미지정"}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {(["미진행", "진행중", "완료", "보류"] as const).map(
                            (status) => (
                              <span
                                key={status}
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${WORK_STATUS_STYLES[status]}`}
                              >
                                {status} {employee[status]}
                              </span>
                            ),
                          )}
                        </div>

                        <div className="space-y-2 border-t border-border/60 pt-3">
                          {preview.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              {employee.total === 0
                                ? "등록된 마감·요청 업무가 없습니다."
                                : "진행 중이거나 대기 중인 업무가 없습니다."}
                            </p>
                          ) : (
                            <>
                              {preview.map((task) => {
                                const progress = task.progress ?? 0;
                                return (
                                  <div
                                    key={task.id}
                                    className="flex items-center gap-2"
                                  >
                                    <span
                                      className={`inline-flex shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${WORK_STATUS_STYLES[task.status]}`}
                                    >
                                      {task.status}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                                      {task.title}
                                    </span>
                                    <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted sm:w-16">
                                      <div
                                        className={`h-full rounded-full ${progressBarTone(progress)}`}
                                        style={{ width: `${progress}%` }}
                                      />
                                    </div>
                                    <span className="w-8 shrink-0 text-right text-[10px] font-medium text-muted-foreground">
                                      {progress}%
                                    </span>
                                    <span className="w-12 shrink-0 whitespace-nowrap text-right text-[10px] text-muted-foreground">
                                      {LIST_SHORT[task.list_type]}
                                    </span>
                                  </div>
                                );
                              })}
                              {isExpanded || hidden > 0 ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    toggleExpanded(employee.id);
                                  }}
                                  className="inline-flex items-center gap-0.5 pt-0.5 text-[11px] font-medium text-primary transition-colors hover:text-primary/80"
                                >
                                  {isExpanded ? (
                                    <>
                                      접기 <ChevronUp className="h-3 w-3" />
                                    </>
                                  ) : (
                                    <>
                                      외 {hidden}건 더보기{" "}
                                      <ChevronDown className="h-3 w-3" />
                                    </>
                                  )}
                                </button>
                              ) : null}
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <aside className="w-full shrink-0 lg:w-[360px]">
          <SharePanel />
        </aside>
      </div>

      <DayDetailDialog
        open={dayDialogOpen}
        onOpenChange={setDayDialogOpen}
        date={selectedDate}
        birthdays={selectedBirthdays}
        leaves={selectedLeaves}
        works={selectedWorks}
        employeeNameById={employeeNameById}
        categories={catList}
        onOpenSchedules={() => router.push("/dashboard/schedules")}
      />
    </PageShell>
  );
}
