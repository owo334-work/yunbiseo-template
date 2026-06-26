"use client";

import { Plus, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
  StatCard,
  StatsGrid,
} from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import type {
  Employee,
  WorkListType,
  WorkStatusTask,
  WorkStatusValue,
} from "@/lib/types";
import {
  WORK_LIST_TYPES,
  WORK_STATUS_STYLES,
  WORK_STATUSES,
} from "@/lib/work-status";

export default function WorkStatusDetailPage() {
  const params = useParams();
  const employeeId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [tasks, setTasks] = useState<WorkStatusTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [currentAuthId, setCurrentAuthId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState<Record<WorkListType, string>>({
    daily: "",
    weekly: "",
    monthly: "",
    instruction: "",
  });
  const [newDue, setNewDue] = useState<Record<WorkListType, string>>({
    daily: "",
    weekly: "",
    monthly: "",
    instruction: "",
  });
  const [adding, setAdding] = useState<WorkListType | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);

    const [authRes, employeeRes, taskRes] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("employees").select("*").eq("id", employeeId).single(),
      supabase
        .from("work_status_tasks")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: true })
        .limit(2000),
    ]);

    if (employeeRes.error) {
      console.error("직원 조회 실패:", employeeRes.error.message);
      setError(true);
      setLoading(false);
      return;
    }
    setEmployee(employeeRes.data);

    const authUser = authRes.data.user;
    setCurrentAuthId(authUser?.id ?? null);

    if (authUser) {
      const { data: me } = await supabase
        .from("employees")
        .select("id, employee_type")
        .eq("auth_uid", authUser.id)
        .maybeSingle();
      const isOwner = me?.id === employeeId;
      const isAdmin = me?.employee_type === "관리자";
      setCanEdit(Boolean(isOwner || isAdmin));
    }

    if (taskRes.error) {
      console.error("업무현황 조회 실패:", taskRes.error.message);
      toast.error(
        "업무 목록을 불러오지 못했습니다. 마이그레이션(supabase db push)이 적용되었는지 확인해 주세요."
      );
      setTasks([]);
    } else {
      setTasks(taskRes.data ?? []);
    }

    setLoading(false);
  }, [supabase, employeeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
  }, [fetchData]);

  const addTask = async (listType: WorkListType) => {
    const title = newTitle[listType].trim();
    if (!title) return;
    setAdding(listType);

    const payload = {
      employee_id: employeeId,
      list_type: listType,
      title,
      detail: null,
      status: "미진행" as WorkStatusValue,
      due_date: newDue[listType] || null,
      sort_order: 0,
      created_by: currentAuthId,
    };

    const { data, error: insertError } = await supabase
      .from("work_status_tasks")
      .insert(payload)
      .select()
      .single();

    if (insertError) {
      console.error("업무 추가 실패:", insertError.message);
      toast.error("업무 추가에 실패했습니다. 권한이 있는지 확인해 주세요.");
    } else if (data) {
      setTasks((prev) => [...prev, data]);
      setNewTitle((prev) => ({ ...prev, [listType]: "" }));
      setNewDue((prev) => ({ ...prev, [listType]: "" }));
    }
    setAdding(null);
  };

  const updateStatus = async (task: WorkStatusTask, status: WorkStatusValue) => {
    const prev = tasks;
    setTasks((cur) => cur.map((t) => (t.id === task.id ? { ...t, status } : t)));

    const { error: updateError } = await supabase
      .from("work_status_tasks")
      .update({ status })
      .eq("id", task.id);

    if (updateError) {
      console.error("상태 변경 실패:", updateError.message);
      toast.error("상태 변경에 실패했습니다.");
      setTasks(prev);
    }
  };

  const deleteTask = async (task: WorkStatusTask) => {
    if (!confirm(`'${task.title}' 업무를 삭제할까요?`)) return;
    const prev = tasks;
    setTasks((cur) => cur.filter((t) => t.id !== task.id));

    const { error: deleteError } = await supabase
      .from("work_status_tasks")
      .delete()
      .eq("id", task.id);

    if (deleteError) {
      console.error("업무 삭제 실패:", deleteError.message);
      toast.error("업무 삭제에 실패했습니다.");
      setTasks(prev);
    }
  };

  if (loading) {
    return (
      <PageShell>
        <LoadingState title="업무현황을 불러오는 중입니다." />
      </PageShell>
    );
  }

  if (error || !employee) {
    return (
      <PageShell>
        <ErrorState
          title="직원 정보를 불러오지 못했습니다."
          onRetry={() => void fetchData()}
        />
      </PageShell>
    );
  }

  const statusCount = (status: WorkStatusValue) =>
    tasks.filter((t) => t.status === status).length;

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[
          { label: "업무현황", href: "/dashboard/work-status" },
          { label: `${employee.name}의 업무현황` },
        ]}
        title={`${employee.name}의 업무현황`}
        description={
          canEdit
            ? "업무를 추가하고 진행상태를 직접 변경할 수 있습니다."
            : "다른 직원의 업무현황은 열람만 가능합니다. (추가·수정은 본인 또는 관리자만)"
        }
      />

      <StatsGrid>
        {WORK_STATUSES.map((status) => (
          <StatCard
            key={status}
            label={status}
            value={`${statusCount(status)}건`}
            tone={
              status === "완료"
                ? "success"
                : status === "진행중"
                  ? "info"
                  : status === "보류"
                    ? "warning"
                    : "default"
            }
          />
        ))}
      </StatsGrid>

      <Tabs defaultValue="daily">
        <TabsList className="w-full justify-start overflow-x-auto">
          {WORK_LIST_TYPES.map((listType) => {
            const count = tasks.filter((t) => t.list_type === listType.key).length;
            return (
              <TabsTrigger key={listType.key} value={listType.key}>
                {listType.label}
                <span className="ml-1 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                  {count}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {WORK_LIST_TYPES.map((listType) => {
          const listTasks = tasks.filter((t) => t.list_type === listType.key);
          return (
            <TabsContent key={listType.key} value={listType.key} className="space-y-3">
              {canEdit ? (
                <Card className="border-border/70 bg-card/85">
                  <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                    <Input
                      placeholder={`${listType.label}에 추가할 업무를 입력하세요`}
                      value={newTitle[listType.key]}
                      onChange={(e) =>
                        setNewTitle((prev) => ({ ...prev, [listType.key]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void addTask(listType.key);
                      }}
                      className="flex-1"
                    />
                    <Input
                      type="date"
                      value={newDue[listType.key]}
                      onChange={(e) =>
                        setNewDue((prev) => ({ ...prev, [listType.key]: e.target.value }))
                      }
                      className="w-full sm:w-44"
                    />
                    <Button
                      onClick={() => void addTask(listType.key)}
                      disabled={adding === listType.key || !newTitle[listType.key].trim()}
                    >
                      <Plus className="h-4 w-4" />
                      추가
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

              {listTasks.length === 0 ? (
                <EmptyState
                  title={`${listType.label}에 등록된 업무가 없습니다.`}
                  description={
                    canEdit ? "위 입력창에서 업무를 추가해 보세요." : undefined
                  }
                />
              ) : (
                <div className="space-y-2">
                  {listTasks.map((task) => (
                    <Card key={task.id} className="border-border/70 bg-card/85">
                      <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <p
                            className={`truncate text-sm font-medium ${
                              task.status === "완료"
                                ? "text-muted-foreground line-through"
                                : "text-foreground"
                            }`}
                          >
                            {task.title}
                          </p>
                          {task.due_date ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              마감 {task.due_date}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                          {canEdit ? (
                            <Select
                              value={task.status}
                              onValueChange={(value) =>
                                void updateStatus(task, value as WorkStatusValue)
                              }
                            >
                              <SelectTrigger
                                size="sm"
                                className={`border font-medium ${WORK_STATUS_STYLES[task.status]}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {WORK_STATUSES.map((status) => (
                                  <SelectItem key={status} value={status}>
                                    {status}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${WORK_STATUS_STYLES[task.status]}`}
                            >
                              {task.status}
                            </span>
                          )}

                          {canEdit ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => void deleteTask(task)}
                              aria-label="업무 삭제"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </PageShell>
  );
}
