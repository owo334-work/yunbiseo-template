"use client";

import { CalendarDays, Mail, Phone, Plus, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
} from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import type {
  Employee,
  Schedule,
  SharedNote,
  WorkListType,
  WorkStatusTask,
  WorkStatusValue,
} from "@/lib/types";
import { FIXED_LIST_TYPES } from "@/lib/work-status";

import { DeadlineTaskItem } from "./deadline-task-item";
import { InstructionAssignPanel } from "./instruction-assign-panel";
import { PersonalCalendar } from "./personal-calendar";
import { SharedNotesBoard } from "./shared-notes-board";

export default function WorkStatusDetailPage() {
  const params = useParams();
  const employeeId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [tasks, setTasks] = useState<WorkStatusTask[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [companyNotes, setCompanyNotes] = useState<SharedNote[]>([]);
  const [teamNotes, setTeamNotes] = useState<SharedNote[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [me, setMe] = useState<{
    id: string | null;
    authUid: string | null;
    isAdmin: boolean;
    department: string | null;
  }>({ id: null, authUid: null, isAdmin: false, department: null });

  // 고정업무 / 마감업무 입력창 상태
  const [fixedInput, setFixedInput] = useState<Record<string, string>>({});
  const [dlTitle, setDlTitle] = useState("");
  const [dlDue, setDlDue] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);

    const authRes = await supabase.auth.getUser();
    const authUser = authRes.data.user;

    const [employeeRes, taskRes, scheduleRes] = await Promise.all([
      supabase.from("employees").select("*").eq("id", employeeId).single(),
      supabase
        .from("work_status_tasks")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: true })
        .limit(2000),
      supabase
        .from("schedules")
        .select("*")
        .eq("created_by", employeeId)
        .limit(2000),
    ]);

    if (employeeRes.error) {
      console.error("직원 조회 실패:", employeeRes.error.message);
      setError(true);
      setLoading(false);
      return;
    }
    const emp = employeeRes.data as Employee;
    setEmployee(emp);
    setTasks(taskRes.error ? [] : (taskRes.data ?? []));
    setSchedules(scheduleRes.error ? [] : ((scheduleRes.data ?? []) as Schedule[]));

    // 로그인 사용자 정보
    let myInfo = { id: null as string | null, authUid: authUser?.id ?? null, isAdmin: false, department: null as string | null };
    if (authUser) {
      const { data: meRow } = await supabase
        .from("employees")
        .select("id, employee_type, department")
        .eq("auth_uid", authUser.id)
        .maybeSingle();
      if (meRow) {
        myInfo = {
          id: meRow.id,
          authUid: authUser.id,
          isAdmin: meRow.employee_type === "관리자",
          department: meRow.department,
        };
      }
    }
    setMe(myInfo);

    // 관리자면 지시사항 배정용 직원 목록
    if (myInfo.isAdmin) {
      const { data: emps } = await supabase
        .from("employees")
        .select("*")
        .order("name", { ascending: true })
        .limit(1000);
      setAllEmployees((emps ?? []).filter((e) => e.is_active !== false) as Employee[]);
    }

    // 공유 정보란
    const notesSelect = "*, author:employees!shared_notes_author_fkey(id, name)";
    const companyReq = supabase
      .from("shared_notes")
      .select(notesSelect)
      .eq("scope", "company")
      .order("created_at", { ascending: true });
    const teamReq = emp.department
      ? supabase
          .from("shared_notes")
          .select(notesSelect)
          .eq("scope", "team")
          .eq("team_key", emp.department)
          .order("created_at", { ascending: true })
      : null;
    const [companyRes, teamRes] = await Promise.all([companyReq, teamReq]);
    setCompanyNotes(companyRes.error ? [] : ((companyRes.data ?? []) as SharedNote[]));
    setTeamNotes(!teamRes || teamRes.error ? [] : ((teamRes.data ?? []) as SharedNote[]));

    setLoading(false);
  }, [supabase, employeeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
  }, [fetchData]);

  const isOwner = me.id != null && me.id === employeeId;
  const canEdit = isOwner || me.isAdmin;

  // ── 고정업무 CRUD ─────────────────────────────────────────
  const addFixed = async (listType: WorkListType) => {
    const title = (fixedInput[listType] ?? "").trim();
    if (!title) return;
    const { data, error: insErr } = await supabase
      .from("work_status_tasks")
      .insert({
        employee_id: employeeId,
        list_type: listType,
        title,
        detail: null,
        status: "미진행" as WorkStatusValue,
        progress: 0,
        due_date: null,
        sort_order: 0,
        created_by: me.authUid,
      })
      .select()
      .single();
    if (insErr) {
      toast.error("추가에 실패했습니다. 권한이 있는지 확인해 주세요.");
      return;
    }
    if (data) {
      setTasks((prev) => [...prev, data as WorkStatusTask]);
      setFixedInput((prev) => ({ ...prev, [listType]: "" }));
    }
  };

  const toggleFixed = async (task: WorkStatusTask) => {
    const next: WorkStatusValue = task.status === "완료" ? "미진행" : "완료";
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    const { error: updErr } = await supabase
      .from("work_status_tasks")
      .update({ status: next, progress: next === "완료" ? 100 : task.progress })
      .eq("id", task.id);
    if (updErr) {
      toast.error("상태 변경에 실패했습니다.");
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
    }
  };

  const deleteTask = async (task: WorkStatusTask) => {
    if (!confirm(`'${task.title}' 업무를 삭제할까요?`)) return;
    const prev = tasks;
    setTasks((cur) => cur.filter((t) => t.id !== task.id));
    const { error: delErr } = await supabase.from("work_status_tasks").delete().eq("id", task.id);
    if (delErr) {
      toast.error("삭제에 실패했습니다.");
      setTasks(prev);
    }
  };

  const removeTaskLocal = (id: string) => setTasks((cur) => cur.filter((t) => t.id !== id));

  const addDeadline = async () => {
    const title = dlTitle.trim();
    if (!title) return;
    const { data, error: insErr } = await supabase
      .from("work_status_tasks")
      .insert({
        employee_id: employeeId,
        list_type: "deadline" as WorkListType,
        title,
        detail: null,
        status: "미진행" as WorkStatusValue,
        progress: 0,
        due_date: dlDue || null,
        sort_order: 0,
        created_by: me.authUid,
      })
      .select()
      .single();
    if (insErr) {
      toast.error("추가에 실패했습니다.");
      return;
    }
    if (data) {
      setTasks((prev) => [...prev, data as WorkStatusTask]);
      setDlTitle("");
      setDlDue("");
    }
  };

  if (loading) {
    return (
      <PageShell>
        <LoadingState title="업무 대시보드를 불러오는 중입니다." />
      </PageShell>
    );
  }
  if (error || !employee) {
    return (
      <PageShell>
        <ErrorState title="직원 정보를 불러오지 못했습니다." onRetry={() => void fetchData()} />
      </PageShell>
    );
  }

  const deadlineTasks = tasks.filter((t) => t.list_type === "deadline");
  const instructionTasks = tasks.filter((t) => t.list_type === "instruction");

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[
          { label: "업무현황", href: "/dashboard/work-status" },
          { label: `${employee.name}의 업무 대시보드` },
        ]}
        title={`${employee.name}의 업무 대시보드`}
        description={
          canEdit
            ? "고정업무·마감업무·지시사항과 개인 일정을 관리하고, 팀과 정보를 공유하세요."
            : "다른 직원의 업무는 열람만 가능합니다. (추가·수정은 본인 또는 관리자만)"
        }
      />

      {/* 관리자 본인 페이지: 지시사항 배정 */}
      {isOwner && me.isAdmin ? (
        <InstructionAssignPanel
          employees={allEmployees.map((e) => ({ id: e.id, name: e.name, department: e.department }))}
          currentDepartment={me.department}
          authUid={me.authUid}
          onAssigned={(targets) => {
            if (targets.includes(employeeId)) void fetchData();
          }}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ① 왼쪽: 프로필 + 고정업무 체크리스트 */}
        <div className="space-y-4">
          <Card className="border-border/70 bg-card/85">
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
                  {employee.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-foreground">{employee.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[employee.department, employee.position].filter(Boolean).join(" · ") || "부서 미지정"}
                  </p>
                </div>
              </div>
              {employee.phone ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" /> {employee.phone}
                </p>
              ) : null}
              {employee.email ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" /> {employee.email}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {FIXED_LIST_TYPES.map((list) => {
            const items = tasks.filter((t) => t.list_type === list.key);
            return (
              <Card key={list.key} className="border-border/70 bg-card/85">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{list.label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground">등록된 고정업무가 없습니다.</p>
                  ) : (
                    items.map((task) => (
                      <div key={task.id} className="group flex items-center gap-2">
                        <Checkbox
                          checked={task.status === "완료"}
                          onCheckedChange={() => void toggleFixed(task)}
                          disabled={!canEdit}
                        />
                        <span
                          className={`flex-1 text-sm ${
                            task.status === "완료"
                              ? "text-muted-foreground line-through"
                              : "text-foreground"
                          }`}
                        >
                          {task.title}
                        </span>
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => void deleteTask(task)}
                            className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                            aria-label="삭제"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    ))
                  )}
                  {canEdit ? (
                    <div className="flex gap-1.5 pt-1">
                      <Input
                        value={fixedInput[list.key] ?? ""}
                        onChange={(e) =>
                          setFixedInput((prev) => ({ ...prev, [list.key]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void addFixed(list.key);
                        }}
                        placeholder="고정업무 추가"
                        className="h-8 text-sm"
                      />
                      <Button
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => void addFixed(list.key)}
                        aria-label="추가"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ② 가운데: 마감업무 + 추가 지시사항 */}
        <div className="space-y-4">
          <Card className="border-border/70 bg-card/85">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                마감기한 업무리스트{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  ({deadlineTasks.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {canEdit ? (
                <div className="flex flex-col gap-1.5 sm:flex-row">
                  <Input
                    value={dlTitle}
                    onChange={(e) => setDlTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void addDeadline();
                    }}
                    placeholder="이번 주/이번 달 특별 업무"
                    className="h-8 flex-1 text-sm"
                  />
                  <Input
                    type="date"
                    value={dlDue}
                    onChange={(e) => setDlDue(e.target.value)}
                    className="h-8 w-full text-sm sm:w-36"
                  />
                  <Button size="sm" className="h-8" onClick={() => void addDeadline()}>
                    추가
                  </Button>
                </div>
              ) : null}
              {deadlineTasks.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">등록된 마감업무가 없습니다.</p>
              ) : (
                deadlineTasks.map((task) => (
                  <DeadlineTaskItem
                    key={task.id}
                    task={task}
                    canEdit={canEdit}
                    onDeleted={removeTaskLocal}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                추가 지시사항{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  ({instructionTasks.length}) · 관리자 배정
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {instructionTasks.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">
                  관리자가 배정한 지시사항이 여기에 표시됩니다.
                </p>
              ) : (
                instructionTasks.map((task) => (
                  <DeadlineTaskItem
                    key={task.id}
                    task={task}
                    canEdit={canEdit}
                    onDeleted={removeTaskLocal}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* ③ 오른쪽: 개인 전용 캘린더 */}
        <div>
          <Card className="border-border/70 bg-card/85">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CalendarDays className="h-4 w-4 text-primary" />
                {employee.name}의 캘린더
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                여기 등록한 일정은 메인 대시보드 캘린더에도 함께 표시됩니다.
              </p>
            </CardHeader>
            <CardContent>
              <PersonalCalendar schedules={schedules} canAdd={isOwner} employeeId={employeeId} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ④ 하단: 공유 정보란 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SharedNotesBoard
          scope="company"
          teamKey={null}
          title="전 직원 공유"
          description="회사 전체가 함께 보는 공유 정보란입니다."
          notes={companyNotes}
          currentEmployeeId={me.id}
          isAdmin={me.isAdmin}
          canPost={me.id != null}
        />
        {employee.department ? (
          <SharedNotesBoard
            scope="team"
            teamKey={employee.department}
            title={`${employee.department} 팀 공유`}
            description="같은 부서 직원끼리 보는 공유 정보란입니다."
            notes={teamNotes}
            currentEmployeeId={me.id}
            isAdmin={me.isAdmin}
            canPost={me.id != null && me.department != null && me.department === employee.department}
            disabledHint="같은 부서 직원만 이 팀 보드에 글을 쓸 수 있습니다."
          />
        ) : (
          <Card className="border-dashed border-border/70 bg-card/60">
            <CardContent className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
              이 직원의 부서가 지정되어 있지 않아 팀 공유란이 없습니다.
              <br />
              (직원관리에서 부서를 설정하면 팀 공유란이 생깁니다.)
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
