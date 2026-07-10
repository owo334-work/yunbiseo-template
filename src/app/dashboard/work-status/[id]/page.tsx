"use client";

import { Archive, CalendarDays, Mail, Phone, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
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
import { isRoutineChecked, routinePeriodKey } from "@/lib/routine-period";
import {
  canAssignRequestByPosition,
  DEFAULT_REQUEST_MIN_POSITION,
  FIXED_LIST_TYPES,
  REQUEST_MIN_POSITION_KEY,
} from "@/lib/work-status";

import { DeadlineTaskItem } from "./deadline-task-item";
import { PersonalCalendar } from "./personal-calendar";
import { RequestAssignPanel } from "./request-assign-panel";
import { RequestSentBoard, type SentRequest } from "./request-sent-board";
import { SharedNotesBoard } from "./shared-notes-board";
import { WidgetGrid, type Widget } from "./widget-grid";

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
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([]);
  const [minPosition, setMinPosition] = useState<string>(DEFAULT_REQUEST_MIN_POSITION);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [me, setMe] = useState<{
    id: string | null;
    authUid: string | null;
    isAdmin: boolean;
    department: string | null;
    position: string | null;
  }>({ id: null, authUid: null, isAdmin: false, department: null, position: null });

  // 고정업무 / 마감업무 입력창 상태
  const [fixedInput, setFixedInput] = useState<Record<string, string>>({});
  const [dlTitle, setDlTitle] = useState("");
  const [dlDue, setDlDue] = useState("");

  // 요청사항 배정 패널 위치 (왼쪽/오른쪽) — 브라우저에 저장
  const [assignSide, setAssignSide] = useState<"left" | "right">("left");
  useEffect(() => {
    try {
      const s = localStorage.getItem("ws-assign-side");
      // 마운트 시 저장된 위치 1회 복원 (SSR 하이드레이션 불일치 방지 위해 effect 사용)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (s === "left" || s === "right") setAssignSide(s);
    } catch {
      /* ignore */
    }
  }, []);
  const changeSide = (s: "left" | "right") => {
    setAssignSide(s);
    try {
      localStorage.setItem("ws-assign-side", s);
    } catch {
      /* ignore */
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);

    const authRes = await supabase.auth.getUser();
    const authUser = authRes.data.user;

    const [employeeRes, taskRes, scheduleRes, settingRes] = await Promise.all([
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
      supabase
        .from("system_settings")
        .select("value")
        .eq("key", REQUEST_MIN_POSITION_KEY)
        .maybeSingle(),
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

    const threshold = settingRes.data?.value || DEFAULT_REQUEST_MIN_POSITION;
    setMinPosition(threshold);

    // 로그인 사용자 정보
    let myInfo = {
      id: null as string | null,
      authUid: authUser?.id ?? null,
      isAdmin: false,
      department: null as string | null,
      position: null as string | null,
    };
    if (authUser) {
      const { data: meRow } = await supabase
        .from("employees")
        .select("id, employee_type, department, position")
        .eq("auth_uid", authUser.id)
        .maybeSingle();
      if (meRow) {
        myInfo = {
          id: meRow.id,
          authUid: authUser.id,
          isAdmin: meRow.employee_type === "관리자",
          department: meRow.department,
          position: meRow.position,
        };
      }
    }
    setMe(myInfo);

    const canAssign =
      myInfo.isAdmin || canAssignRequestByPosition(myInfo.position, threshold);
    const viewingOwn = myInfo.id != null && myInfo.id === employeeId;

    // 요청사항 배정 가능하면 대상 직원 목록
    if (canAssign) {
      const { data: emps } = await supabase
        .from("employees")
        .select("*")
        .order("name", { ascending: true })
        .limit(1000);
      setAllEmployees((emps ?? []).filter((e) => e.is_active !== false) as Employee[]);
    } else {
      setAllEmployees([]);
    }

    // 내 대시보드일 때만: 내가 보낸 요청업무 (진행상황 공유용)
    if (viewingOwn && myInfo.authUid) {
      const { data: sent } = await supabase
        .from("work_status_tasks")
        .select(
          "*, employee:employees!work_status_tasks_employee_id_fkey(id, name, department)",
        )
        .eq("list_type", "instruction")
        .eq("created_by", myInfo.authUid)
        .neq("employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(500);
      setSentRequests((sent ?? []) as SentRequest[]);
    } else {
      setSentRequests([]);
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
  const canAssignRequests =
    me.isAdmin || canAssignRequestByPosition(me.position, minPosition);

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
    const checked = isRoutineChecked(task);
    const next: WorkStatusValue = checked ? "미진행" : "완료";
    const routineCheckedKey = checked ? null : routinePeriodKey(task.list_type);
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next, routine_checked_key: routineCheckedKey } : t)));
    const { error: updErr } = await supabase
      .from("work_status_tasks")
      .update({ status: next, progress: next === "완료" ? 100 : 0, routine_checked_key: routineCheckedKey })
      .eq("id", task.id);
    if (updErr) {
      toast.error("상태 변경에 실패했습니다.");
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status, routine_checked_key: task.routine_checked_key } : t)));
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

  // 보관되지 않은(활성) 마감·요청 업무만 대시보드에 노출
  const deadlineTasks = tasks.filter(
    (t) => t.list_type === "deadline" && t.archived_at == null,
  );
  const instructionTasks = tasks.filter(
    (t) => t.list_type === "instruction" && t.archived_at == null,
  );

  // 완료된 항목을 한꺼번에 보관함으로 넘기기
  const bulkArchive = async (listType: WorkListType) => {
    const targets = tasks.filter(
      (t) => t.list_type === listType && t.archived_at == null && t.status === "완료",
    );
    if (targets.length === 0) {
      toast.info("보관할 완료 항목이 없습니다.");
      return;
    }
    if (!confirm(`완료된 ${targets.length}건을 보관함으로 옮길까요?`)) return;
    const ids = targets.map((t) => t.id);
    const archivedAt = new Date().toISOString();
    const { error: archErr } = await supabase
      .from("work_status_tasks")
      .update({ archived_at: archivedAt })
      .in("id", ids);
    if (archErr) {
      toast.error("보관에 실패했습니다.");
      return;
    }
    setTasks((prev) =>
      prev.map((t) => (ids.includes(t.id) ? { ...t, archived_at: archivedAt } : t)),
    );
    toast.success(`${targets.length}건을 보관했습니다.`);
  };
  const deadlineDoneCount = deadlineTasks.filter((t) => t.status === "완료").length;
  const instructionDoneCount = instructionTasks.filter((t) => t.status === "완료").length;

  // ── 위젯 정의 (WidgetGrid 에서 드래그로 재배치) ─────────────────────
  const widgets: Widget[] = [];

  // 프로필
  widgets.push({
    id: "profile",
    node: (
      <Card className="min-h-full rounded-[1rem] border-border/70 bg-card/85">
        <CardContent className="space-y-2 p-4 pl-8">
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
    ),
  });

  // 고정업무 (일간/주간/월간)
  for (const list of FIXED_LIST_TYPES) {
    const items = tasks.filter((t) => t.list_type === list.key);
    widgets.push({
      id: `fixed-${list.key}`,
      node: (
        <Card className="min-h-full gap-1 rounded-[1rem] border-border/70 bg-card/85">
          <CardHeader className="pb-2 pl-8">
            <CardTitle className="text-sm">{list.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground">등록된 고정업무가 없습니다.</p>
            ) : (
              items.map((task) => (
                <div key={task.id} className="group flex items-center gap-2">
                  <Checkbox
                    checked={isRoutineChecked(task)}
                    onCheckedChange={() => void toggleFixed(task)}
                    disabled={!canEdit}
                  />
                  <span
                    className={`flex-1 text-sm ${
                      isRoutineChecked(task)
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
      ),
    });
  }

  // 마감기한 업무
  widgets.push({
    id: "deadline",
    node: (
      <Card className="min-h-full rounded-[1rem] border-border/70 bg-card/85">
        <CardHeader className="pb-2 pl-8">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">
              마감기한 업무리스트{" "}
              <span className="text-xs font-normal text-muted-foreground">
                ({deadlineTasks.length})
              </span>
            </CardTitle>
            {canEdit && deadlineDoneCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-muted-foreground"
                onClick={() => void bulkArchive("deadline")}
              >
                <Archive className="h-3.5 w-3.5" />
                완료 {deadlineDoneCount}건 보관
              </Button>
            ) : null}
          </div>
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
                onArchived={removeTaskLocal}
              />
            ))
          )}
        </CardContent>
      </Card>
    ),
  });

  // 요청사항 업무 (받은 요청)
  widgets.push({
    id: "request-received",
    node: (
      <Card className="min-h-full rounded-[1rem] border-border/70 bg-card/85">
        <CardHeader className="pb-2 pl-8">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">
              요청사항 업무{" "}
              <span className="text-xs font-normal text-muted-foreground">
                ({instructionTasks.length}) · 받은 요청
              </span>
            </CardTitle>
            {canEdit && instructionDoneCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-muted-foreground"
                onClick={() => void bulkArchive("instruction")}
              >
                <Archive className="h-3.5 w-3.5" />
                완료 {instructionDoneCount}건 보관
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {instructionTasks.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">
              상급자·관리자가 보낸 요청사항이 여기에 표시됩니다.
            </p>
          ) : (
            instructionTasks.map((task) => (
              <DeadlineTaskItem
                key={task.id}
                task={task}
                canEdit={canEdit}
                onDeleted={removeTaskLocal}
                onArchived={removeTaskLocal}
              />
            ))
          )}
        </CardContent>
      </Card>
    ),
  });

  // 내가 요청한 업무 (진행상황 공유) — 내 대시보드에서만
  if (isOwner) {
    widgets.push({
      id: "request-sent",
      node: <RequestSentBoard requests={sentRequests} />,
    });
  }

  // 개인 캘린더
  widgets.push({
    id: "calendar",
    node: (
      <Card className="min-h-full rounded-[1rem] border-border/70 bg-card/85">
        <CardHeader className="pb-2 pl-8">
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
    ),
  });

  // 팀 공유
  widgets.push({
    id: "share-team",
    node: employee.department ? (
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
      <Card className="min-h-full rounded-[1rem] border-dashed border-border/70 bg-card/60">
        <CardContent className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
          이 직원의 부서가 지정되어 있지 않아 팀 공유란이 없습니다.
          <br />
          (직원관리에서 부서를 설정하면 팀 공유란이 생깁니다.)
        </CardContent>
      </Card>
    ),
  });

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
            ? "고정업무·마감업무·요청사항과 개인 일정을 관리하고, 팀과 정보를 공유하세요. 카드는 드래그로 자유롭게 배치할 수 있습니다."
            : "다른 직원의 업무는 열람만 가능합니다. (추가·수정은 본인 또는 관리자만)"
        }
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link href={`/dashboard/work-status/${employeeId}/archive`}>
              <Archive className="h-4 w-4" />
              지난 업무 보관함
            </Link>
          </Button>
        }
      />

      {/* 사이드 칼럼: (권한 있으면) 요청사항 배정 + 그 아래 전 직원 공유 — 좌/우 위치 토글 */}
      {(() => {
        const sideColumn = (
          <RequestAsideColumn side={assignSide} onChangeSide={changeSide}>
            {isOwner && canAssignRequests ? (
              <RequestAssignPanel
                employees={allEmployees.map((e) => ({
                  id: e.id,
                  name: e.name,
                  department: e.department,
                }))}
                currentDepartment={me.department}
                minPosition={minPosition}
                authUid={me.authUid}
                onAssigned={() => void fetchData()}
              />
            ) : null}
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
          </RequestAsideColumn>
        );
        return (
          <div className="flex flex-col gap-4 lg:flex-row">
            {assignSide === "left" ? sideColumn : null}
            <div className="min-w-0 flex-1">
              <WidgetGrid storageKey={`ws-widget-order:${employeeId}`} widgets={widgets} />
            </div>
            {assignSide === "right" ? sideColumn : null}
          </div>
        );
      })()}
    </PageShell>
  );
}

// 요청사항 배정 사이드 칼럼 (좌/우 위치 토글 포함)
function RequestAsideColumn({
  side,
  onChangeSide,
  children,
}: {
  side: "left" | "right";
  onChangeSide: (s: "left" | "right") => void;
  children: React.ReactNode;
}) {
  return (
    <aside className="w-full lg:w-[340px] lg:shrink-0">
      <div className="mb-2 flex items-center gap-1 text-xs">
        <span className="mr-auto text-muted-foreground">사이드 패널 위치</span>
        {(["left", "right"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChangeSide(s)}
            aria-pressed={side === s}
            className={`rounded-md px-2 py-1 transition-colors ${
              side === s
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {s === "left" ? "왼쪽" : "오른쪽"}
          </button>
        ))}
      </div>
      <div className="space-y-4">{children}</div>
    </aside>
  );
}
