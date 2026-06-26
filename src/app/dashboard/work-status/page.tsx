"use client";

import Link from "next/link";
import { ClipboardList, ListChecks, Users } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import type { Employee, WorkStatusTask } from "@/lib/types";
import { WORK_STATUS_STYLES } from "@/lib/work-status";

type EmployeeWithCounts = Employee & {
  total: number;
  미진행: number;
  진행중: number;
  완료: number;
  보류: number;
};

export default function WorkStatusListPage() {
  const supabase = useMemo(() => createClient(), []);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<WorkStatusTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    setTableMissing(false);

    const [employeeRes, taskRes] = await Promise.all([
      supabase
        .from("employees")
        .select("*")
        .order("name", { ascending: true })
        .limit(1000),
      supabase.from("work_status_tasks").select("*").limit(5000),
    ]);

    if (employeeRes.error) {
      console.error("직원 목록 조회 실패:", employeeRes.error.message);
      setError(true);
      setLoading(false);
      return;
    }

    setEmployees((employeeRes.data ?? []).filter((e) => e.is_active !== false));

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

  const employeesWithCounts: EmployeeWithCounts[] = useMemo(() => {
    return employees.map((employee) => {
      const own = tasks.filter((t) => t.employee_id === employee.id);
      return {
        ...employee,
        total: own.length,
        미진행: own.filter((t) => t.status === "미진행").length,
        진행중: own.filter((t) => t.status === "진행중").length,
        완료: own.filter((t) => t.status === "완료").length,
        보류: own.filter((t) => t.status === "보류").length,
      };
    });
  }, [employees, tasks]);

  const keyword = search.trim();
  const filtered = employeesWithCounts.filter((employee) => {
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
        title="업무현황"
        description="직원을 선택하면 일간·주간·월간 업무리스트와 추가 지시사항, 진행상태를 확인할 수 있습니다."
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
          <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono">supabase db push</code>{" "}
          를 실행해 마이그레이션을 적용해 주세요.
        </div>
      ) : null}

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
        <LoadingState title="업무현황을 불러오는 중입니다." />
      ) : error ? (
        <ErrorState onRetry={() => void fetchData()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={employees.length === 0 ? "등록된 직원이 없습니다." : "조건에 맞는 직원이 없습니다."}
          description={
            employees.length === 0
              ? "직원관리에서 직원을 추가하면 이곳에서 업무현황을 관리할 수 있습니다."
              : "검색어를 조정해 보세요."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((employee) => (
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

                  <p className="text-xs text-muted-foreground">전체 {employee.total}건</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
