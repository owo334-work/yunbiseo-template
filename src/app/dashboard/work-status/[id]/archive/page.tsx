"use client";

import { Archive, ChevronDown, ChevronRight, RotateCcw, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
} from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import type { Employee, WorkStatusTask } from "@/lib/types";

// 완료월 그룹 키/라벨 (completed_at 우선, 없으면 archived_at → created_at)
function monthOf(task: WorkStatusTask): string {
  const src = task.completed_at ?? task.archived_at ?? task.created_at;
  return src.slice(0, 7); // yyyy-mm
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${y}년 ${Number(m)}월`;
}

const KIND_STYLE: Record<"deadline" | "instruction", { label: string; className: string }> = {
  deadline: { label: "마감업무", className: "border-sky-200 bg-sky-50 text-sky-700" },
  instruction: { label: "요청사항", className: "border-violet-200 bg-violet-50 text-violet-700" },
};

export default function WorkStatusArchivePage() {
  const params = useParams();
  const employeeId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [tasks, setTasks] = useState<WorkStatusTask[]>([]);
  const [senders, setSenders] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [me, setMe] = useState<{ id: string | null; isAdmin: boolean }>({
    id: null,
    isAdmin: false,
  });
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);

    const authRes = await supabase.auth.getUser();
    const authUser = authRes.data.user;

    const [employeeRes, taskRes] = await Promise.all([
      supabase.from("employees").select("*").eq("id", employeeId).single(),
      supabase
        .from("work_status_tasks")
        .select("*")
        .eq("employee_id", employeeId)
        .in("list_type", ["deadline", "instruction"])
        .not("archived_at", "is", null)
        .is("recipient_deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(3000),
    ]);

    if (employeeRes.error) {
      console.error("직원 조회 실패:", employeeRes.error.message);
      setError(true);
      setLoading(false);
      return;
    }
    setEmployee(employeeRes.data as Employee);
    const archived = taskRes.error ? [] : ((taskRes.data ?? []) as WorkStatusTask[]);
    setTasks(archived);

    // 요청사항 보낸 사람 이름 (created_by = auth_uid) 매핑
    const senderUids = Array.from(
      new Set(
        archived
          .filter((t) => t.list_type === "instruction" && t.created_by)
          .map((t) => t.created_by as string),
      ),
    );
    if (senderUids.length > 0) {
      const { data: sndr } = await supabase
        .from("employees")
        .select("auth_uid, name")
        .in("auth_uid", senderUids);
      const map: Record<string, string> = {};
      for (const s of sndr ?? []) {
        if (s.auth_uid) map[s.auth_uid] = s.name;
      }
      setSenders(map);
    } else {
      setSenders({});
    }

    // 로그인 사용자 (권한)
    if (authUser) {
      const { data: meRow } = await supabase
        .from("employees")
        .select("id, employee_type")
        .eq("auth_uid", authUser.id)
        .maybeSingle();
      setMe({
        id: meRow?.id ?? null,
        isAdmin: meRow?.employee_type === "관리자",
      });
    } else {
      setMe({ id: null, isAdmin: false });
    }

    setLoading(false);
  }, [supabase, employeeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
  }, [fetchData]);

  const canEdit = (me.id != null && me.id === employeeId) || me.isAdmin;

  // 완료월별 그룹 (월은 최신순, 월 안은 받은/추가 날짜순)
  const groups = useMemo(() => {
    const map = new Map<string, WorkStatusTask[]>();
    for (const t of tasks) {
      const key = monthOf(t);
      const arr = map.get(key);
      if (arr) arr.push(t);
      else map.set(key, [t]);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [tasks]);

  const isOpen = (key: string, index: number) => openMonths[key] ?? index === 0;
  const toggleMonth = (key: string, index: number) =>
    setOpenMonths((prev) => ({ ...prev, [key]: !(prev[key] ?? index === 0) }));

  const restore = async (task: WorkStatusTask) => {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    const { error: uErr } = await supabase
      .from("work_status_tasks")
      .update({ archived_at: null })
      .eq("id", task.id);
    if (uErr) {
      toast.error("복원에 실패했습니다.");
      void fetchData();
      return;
    }
    toast.success("활성 목록으로 되돌렸습니다.");
  };

  const remove = async (task: WorkStatusTask) => {
    if (!confirm(`'${task.title}' 업무를 완전히 삭제할까요? (되돌릴 수 없습니다)`)) return;
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    const { error: dErr } = await supabase
      .from("work_status_tasks")
      .delete()
      .eq("id", task.id);
    if (dErr) {
      toast.error("삭제에 실패했습니다.");
      void fetchData();
    }
  };

  if (loading) {
    return (
      <PageShell>
        <LoadingState title="보관함을 불러오는 중입니다." />
      </PageShell>
    );
  }
  if (error || !employee) {
    return (
      <PageShell>
        <ErrorState title="보관함을 불러오지 못했습니다." onRetry={() => void fetchData()} />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[
          { label: "업무일지", href: `/dashboard/work-journal/${employeeId}` },
          {
            label: `${employee.name} 업무일지`,
            href: `/dashboard/work-journal/${employeeId}`,
          },
          { label: "지난 업무 보관함" },
        ]}
        title={`${employee.name}의 지난 업무 보관함`}
        description="완료 후 보관한 마감업무·요청사항을 완료한 달 기준으로 모아 둡니다. 월 안에서는 받은/추가한 날짜순으로 정렬됩니다."
      />

      {groups.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="보관된 업무가 없습니다."
          description="업무일지에서 완료된 마감업무·요청사항을 '보관함으로' 옮기면 여기에 월별로 쌓입니다."
        />
      ) : (
        <div className="space-y-4">
          {groups.map(([key, items], index) => {
            const open = isOpen(key, index);
            return (
              <Card key={key} className="border-border/70 bg-card/85">
                <button
                  type="button"
                  onClick={() => toggleMonth(key, index)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left"
                  aria-expanded={open}
                >
                  {open ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-semibold text-foreground">
                    {monthLabel(key)}
                  </span>
                  <span className="text-xs text-muted-foreground">완료 {items.length}건</span>
                </button>

                {open ? (
                  <CardContent className="space-y-2 pt-0">
                    {/* 데스크톱 표 헤더 */}
                    <div className="hidden grid-cols-[1fr_5.5rem_5.5rem_5rem_1.2fr_auto] gap-3 border-b border-border/60 px-2 pb-1.5 text-[11px] font-medium text-muted-foreground md:grid">
                      <span>업무내용</span>
                      <span>받은날짜</span>
                      <span>완료날짜</span>
                      <span>종류</span>
                      <span>기타사항</span>
                      <span className="text-right">{canEdit ? "관리" : ""}</span>
                    </div>

                    {items.map((task) => {
                      const kind = KIND_STYLE[task.list_type as "deadline" | "instruction"];
                      const sender =
                        task.list_type === "instruction" && task.created_by
                          ? senders[task.created_by]
                          : null;
                      return (
                        <div
                          key={task.id}
                          className="grid grid-cols-1 gap-1 rounded-lg border border-border/50 bg-background/60 p-2.5 text-sm md:grid-cols-[1fr_5.5rem_5.5rem_5rem_1.2fr_auto] md:items-center md:gap-3 md:border-0 md:border-b md:border-border/40 md:bg-transparent md:px-2 md:py-2"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">{task.title}</p>
                            {sender ? (
                              <p className="text-[11px] text-muted-foreground">요청: {sender}</p>
                            ) : null}
                          </div>

                          <div className="text-xs text-muted-foreground">
                            <span className="md:hidden">받은날짜 </span>
                            {task.created_at.slice(0, 10)}
                          </div>

                          <div className="text-xs text-emerald-600">
                            <span className="text-muted-foreground md:hidden">완료 </span>
                            {task.completed_at ? task.completed_at.slice(0, 10) : "-"}
                          </div>

                          <div>
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${kind.className}`}
                            >
                              {kind.label}
                            </span>
                          </div>

                          <div className="min-w-0 text-xs text-muted-foreground">
                            {task.detail ? (
                              <span className="whitespace-pre-wrap">{task.detail}</span>
                            ) : (
                              <span className="text-muted-foreground/60">-</span>
                            )}
                          </div>

                          {canEdit ? (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => void restore(task)}
                                title="활성 목록으로 되돌리기"
                                aria-label="복원"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => void remove(task)}
                                title="완전히 삭제"
                                aria-label="삭제"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div />
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
