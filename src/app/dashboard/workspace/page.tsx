"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, ListChecks, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
  PageToolbar,
  StatCard,
  StatsGrid,
} from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CalendarMonthView } from "@/components/calendar/calendar-month-view";
import { addMonths, subMonths, startOfMonth, format } from "@/components/calendar/calendar-utils";
import { createClient } from "@/lib/supabase/client";
import type { Employee, Schedule, WorkListType, WorkStatusTask, WorkStatusValue } from "@/lib/types";
import { WORK_LIST_TYPES, WORK_STATUS_STYLES } from "@/lib/work-status";

// 카드 미리보기에서 보여줄 업무 우선순위 (진행중 → 미진행 → 보류 → 완료)
const STATUS_PRIORITY: Record<WorkStatusValue, number> = {
  진행중: 0,
  미진행: 1,
  보류: 2,
  완료: 3,
};

const LIST_SHORT: Record<WorkListType, string> = WORK_LIST_TYPES.reduce(
  (acc, cur) => ({ ...acc, [cur.key]: cur.short }),
  {} as Record<WorkListType, string>
);

const PREVIEW_LIMIT = 4;

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
  const [calMonth, setCalMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    setTableMissing(false);

    const [employeeRes, taskRes, scheduleRes] = await Promise.all([
      supabase.from("employees").select("*").order("name", { ascending: true }).limit(1000),
      supabase.from("work_status_tasks").select("*").limit(5000),
      supabase.from("schedules").select("*").limit(5000),
    ]);

    if (employeeRes.error) {
      console.error("직원 목록 조회 실패:", employeeRes.error.message);
      setError(true);
      setLoading(false);
      return;
    }

    setEmployees((employeeRes.data ?? []).filter((e) => e.is_active !== false));
    setSchedules(scheduleRes.error ? [] : ((scheduleRes.data ?? []) as Schedule[]));

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
      const own = tasks.filter((t) => t.employee_id === employee.id);
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

  const keyword = search.trim();
  const filtered = employeesWithTasks.filter((employee) => {
    if (!keyword) return true;
    return (
      employee.name.includes(keyword) ||
      employee.department?.includes(keyword) ||
      employee.position?.includes(keyword)
    );
  });

  const totalTasks = tasks.length;
  const inProgress = tasks.filter((t) => t.status === "진행중").length;
  const done = tasks.filter((t) => t.status === "완료").length;

  return (
    <PageShell>
      <PageHeader
        title="업무 대시보드"
        description="전 직원의 업무현황을 한눈에 확인합니다. 직원 카드를 누르면 일간·주간·월간 업무리스트와 진행상태를 볼 수 있습니다."
      />

      <StatsGrid>
        <StatCard label="전체 직원" value={`${employees.length}명`} icon={Users} />
        <StatCard label="등록된 업무" value={`${totalTasks}건`} icon={ClipboardList} />
        <StatCard label="진행중" value={`${inProgress}건`} icon={ListChecks} tone="info" />
        <StatCard label="완료" value={`${done}건`} icon={ListChecks} tone="success" />
      </StatsGrid>

      {tableMissing ? (
        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-800">
          업무현황 테이블이 아직 데이터베이스에 적용되지 않았습니다. 터미널에서{" "}
          <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono">supabase db push</code> 를 실행해
          마이그레이션을 적용해 주세요.
        </div>
      ) : null}

      {/* 전 직원 일정 통합 캘린더 (개인 페이지에서 등록한 일정이 여기에 모입니다) */}
      <Card className="border-border/70 bg-card/85">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarDays className="h-4 w-4 text-primary" />
              전 직원 일정
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
        <CardContent>
          <CalendarMonthView
            currentDate={calMonth}
            schedules={schedules}
            onDateClick={() => router.push("/dashboard/schedules")}
            onEventClick={() => router.push("/dashboard/schedules")}
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
          <span className="text-sm text-muted-foreground">{filtered.length}명 표시 중</span>
        </div>
      </PageToolbar>

      {loading ? (
        <LoadingState title="업무 대시보드를 불러오는 중입니다." />
      ) : error ? (
        <ErrorState onRetry={() => void fetchData()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={employees.length === 0 ? "등록된 직원이 없습니다." : "조건에 맞는 직원이 없습니다."}
          description={
            employees.length === 0
              ? "직원관리에서 직원을 추가하면 이곳에서 전 직원의 업무현황을 한눈에 볼 수 있습니다."
              : "검색어를 조정해 보세요."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((employee) => {
            const preview = [...employee.tasks]
              .filter((t) => t.status !== "완료")
              .sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status])
              .slice(0, PREVIEW_LIMIT);
            const remaining = employee.tasks.filter((t) => t.status !== "완료").length - preview.length;

            return (
              <Link key={employee.id} href={`/dashboard/work-status/${employee.id}`}>
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
                          {[employee.department, employee.position].filter(Boolean).join(" · ") ||
                            "부서 미지정"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {(["미진행", "진행중", "완료", "보류"] as const).map((status) => (
                        <span
                          key={status}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${WORK_STATUS_STYLES[status]}`}
                        >
                          {status} {employee[status]}
                        </span>
                      ))}
                    </div>

                    <div className="space-y-1.5 border-t border-border/60 pt-3">
                      {preview.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {employee.total === 0
                            ? "등록된 업무가 없습니다."
                            : "진행 중이거나 대기 중인 업무가 없습니다."}
                        </p>
                      ) : (
                        <>
                          {preview.map((task) => (
                            <div key={task.id} className="flex items-center gap-2">
                              <span
                                className={`inline-flex shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${WORK_STATUS_STYLES[task.status]}`}
                              >
                                {task.status}
                              </span>
                              <span className="truncate text-xs text-foreground">{task.title}</span>
                              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                                {LIST_SHORT[task.list_type]}
                              </span>
                            </div>
                          ))}
                          {remaining > 0 ? (
                            <p className="pt-0.5 text-[11px] text-muted-foreground">
                              외 {remaining}건 더보기
                            </p>
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
    </PageShell>
  );
}
