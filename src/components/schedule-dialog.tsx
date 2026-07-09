"use client";

import { useEffect, useState } from "react";
import { ArrowRightCircle, Repeat, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScheduleRecurrenceScopeDialog } from "@/components/schedule-recurrence-scope-dialog";
import { ScheduleView } from "@/components/schedule-view";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import {
  DEFAULT_SCHEDULE_CATEGORIES,
  isLeaveCategory,
  toDateInput,
} from "@/components/calendar/calendar-utils";
import { LEAVE_UNIT_OPTIONS } from "@/lib/leave";
import { cn } from "@/lib/utils";
import type {
  Customer,
  Employee,
  Lead,
  Project,
  RecurrenceType,
  Schedule,
  ScheduleCategoryItem,
  ScheduleInsert,
  ScheduleRecurrenceActionScope,
} from "@/lib/types";

const QUICK_DURATION_OPTIONS = [
  { label: "30분", minutes: 30 },
  { label: "1시간", minutes: 60 },
  { label: "2시간", minutes: 120 },
] as const;

const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string }[] = [
  { value: "none", label: "반복 없음" },
  { value: "daily", label: "매일" },
  { value: "weekly", label: "매주" },
  { value: "monthly", label: "매월" },
] as const;

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: Schedule | null;
  employees: Employee[];
  projects: Project[];
  customers?: Customer[];
  leads?: Lead[];
  categories?: ScheduleCategoryItem[];
  currentEmployeeId: string | null;
  defaultProjectId?: string | null;
  defaultCustomerId?: string | null;
  defaultLeadId?: string | null;
  defaultStart?: string;
  defaultEnd?: string;
  defaultAllDay?: boolean;
  onSave: (
    data: ScheduleInsert,
    attendeeIds: string[],
    recurrence?: { type: RecurrenceType; endDate: string | null },
    options?: { addGoogleMeet?: boolean },
    scope?: ScheduleRecurrenceActionScope,
  ) => Promise<boolean>;
  onDelete?: (
    id: string,
    scope?: ScheduleRecurrenceActionScope,
  ) => Promise<boolean>;
  onJumpToProject?: (projectId: string) => void;
}

function roundToNextThirtyMinutes(date: Date): Date {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  const remainder = rounded.getMinutes() % 30;
  if (remainder !== 0)
    rounded.setMinutes(rounded.getMinutes() + (30 - remainder));
  return rounded;
}

function toTimeString(isoString: string): string {
  if (!isoString) return "09:00";
  const d = new Date(isoString);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function combineDateAndTime(dateStr: string, timeStr: string): string {
  if (!dateStr) return new Date().toISOString();
  const [hour, minute] = timeStr.split(":").map(Number);
  const d = new Date(dateStr);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function addMinutes(isoString: string, minutes: number): string {
  const d = new Date(isoString);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function getDurationMinutes(startAt: string, endAt: string): number {
  const diff = Math.round(
    (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000,
  );
  return Math.max(diff, 30);
}

function formatTimeDigits(digits: string): string {
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

function parseTimeInput(value: string): string | null {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length !== 4) return null;

  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2, 4));
  if (hours > 23 || minutes > 59) return null;

  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

function hasValidDateRange(startAt: string, endAt: string): boolean {
  return new Date(endAt).getTime() > new Date(startAt).getTime();
}

function createEmpty(
  currentEmployeeId: string | null,
  defaultProjectId?: string | null,
  defaultCustomerId?: string | null,
  defaultLeadId?: string | null,
  defaultStart?: string,
  defaultEnd?: string,
  defaultAllDay?: boolean,
): ScheduleInsert {
  const roundedNow = roundToNextThirtyMinutes(new Date());
  const startAt = defaultStart ?? roundedNow.toISOString();
  const endAt = defaultEnd ?? addMinutes(startAt, 60);

  return {
    title: "",
    description: null,
    start_at: startAt,
    end_at: endAt,
    all_day: defaultAllDay ?? false,
    category: "meeting",
    location: null,
    project_id: defaultProjectId ?? null,
    customer_id: defaultCustomerId ?? null,
    lead_id: defaultLeadId ?? null,
    recurrence_type: "none",
    recurrence_end_date: null,
    recurrence_group_id: null,
    created_by: currentEmployeeId ?? "",
    leave_employee_id: null,
    leave_days: null,
  };
}

export function ScheduleDialog({
  open,
  onOpenChange,
  schedule,
  employees,
  categories: categoriesProp,
  currentEmployeeId,
  defaultProjectId,
  defaultCustomerId,
  defaultLeadId,
  defaultStart,
  defaultEnd,
  defaultAllDay,
  onSave,
  onDelete,
  onJumpToProject,
}: ScheduleDialogProps) {
  const [form, setForm] = useState<ScheduleInsert>(
    createEmpty(
      currentEmployeeId,
      defaultProjectId,
      defaultCustomerId,
      defaultLeadId,
      defaultStart,
      defaultEnd,
      defaultAllDay,
    ),
  );
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [startTimeInput, setStartTimeInput] = useState(() =>
    toTimeString(defaultStart ?? new Date().toISOString()),
  );
  const [endTimeInput, setEndTimeInput] = useState(() =>
    toTimeString(
      defaultEnd ?? addMinutes(defaultStart ?? new Date().toISOString(), 60),
    ),
  );
  const [mode, setMode] = useState<"view" | "edit">("edit");
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("none");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [recurrenceScopeAction, setRecurrenceScopeAction] = useState<
    "update" | "delete" | null
  >(null);
  const [addGoogleMeet, setAddGoogleMeet] = useState(false);

  const cats =
    categoriesProp && categoriesProp.length > 0
      ? categoriesProp
      : DEFAULT_SCHEDULE_CATEGORIES;

  const isExisting = Boolean(schedule);
  const isRecurringExisting = Boolean(
    schedule &&
    schedule.recurrence_type !== "none" &&
    schedule.recurrence_group_id,
  );
  const shouldForceGoogleMeet = !isExisting && form.category === "meeting";

  useEffect(() => {
    if (schedule) {
      setForm({
        title: schedule.title,
        description: schedule.description,
        start_at: schedule.start_at,
        end_at: schedule.end_at,
        all_day: schedule.all_day,
        category: schedule.category,
        location: schedule.location,
        project_id: schedule.project_id,
        customer_id: schedule.customer_id,
        lead_id: schedule.lead_id,
        recurrence_type: schedule.recurrence_type,
        recurrence_end_date: schedule.recurrence_end_date,
        recurrence_group_id: schedule.recurrence_group_id,
        created_by: schedule.created_by,
        leave_employee_id: schedule.leave_employee_id ?? null,
        leave_days: schedule.leave_days ?? null,
      });
      setAttendeeIds(
        schedule.attendees?.map((attendee) => attendee.employee_id) ?? [],
      );
      setStartTimeInput(toTimeString(schedule.start_at));
      setEndTimeInput(toTimeString(schedule.end_at));
      setRecurrenceType(schedule.recurrence_type ?? "none");
      setRecurrenceEndDate(schedule.recurrence_end_date ?? "");
      setAddGoogleMeet(false);
      setMode("view");
      return;
    }

    const empty = createEmpty(
      currentEmployeeId,
      defaultProjectId,
      defaultCustomerId,
      defaultLeadId,
      defaultStart,
      defaultEnd,
      defaultAllDay,
    );
    setForm(empty);
    setAttendeeIds(currentEmployeeId ? [currentEmployeeId] : []);
    setStartTimeInput(toTimeString(empty.start_at));
    setEndTimeInput(toTimeString(empty.end_at));
    setRecurrenceType("none");
    setRecurrenceEndDate("");
    setAddGoogleMeet(false);
    setMode("edit");
  }, [
    schedule,
    currentEmployeeId,
    defaultProjectId,
    defaultCustomerId,
    defaultLeadId,
    defaultStart,
    defaultEnd,
    defaultAllDay,
    open,
  ]);

  const validateForm = () => {
    if (!form.title.trim()) return false;
    if (!hasValidDateRange(form.start_at, form.end_at)) {
      toast.error("종료 일시는 시작 일시보다 이후여야 합니다.");
      return false;
    }

    if (isLeaveCategory(form.category) && !form.leave_employee_id) {
      toast.error("연차/월차는 대상 직원을 선택해 주세요.");
      return false;
    }

    if (recurrenceType !== "none" && !recurrenceEndDate) {
      toast.error("반복 종료일을 입력해 주세요.");
      return false;
    }

    if (recurrenceType !== "none" && recurrenceEndDate) {
      const startDate = toDateInput(form.start_at);
      if (recurrenceEndDate <= startDate) {
        toast.error("반복 종료일은 시작일 이후여야 합니다.");
        return false;
      }
    }

    return true;
  };

  const performSave = async (scope?: ScheduleRecurrenceActionScope) => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const recurrence =
        recurrenceType !== "none"
          ? { type: recurrenceType, endDate: recurrenceEndDate || null }
          : undefined;
      const payload: ScheduleInsert = isLeaveCategory(form.category)
        ? { ...form, leave_days: form.leave_days ?? 1 }
        : { ...form, leave_employee_id: null, leave_days: null };
      const saved = await onSave(
        payload,
        attendeeIds,
        recurrence,
        {
          addGoogleMeet: shouldForceGoogleMeet || addGoogleMeet,
        },
        scope,
      );
      if (saved) {
        onOpenChange(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    if (isRecurringExisting) {
      setRecurrenceScopeAction("update");
      return;
    }

    await performSave();
  };

  const handleDeleteClick = () => {
    if (isRecurringExisting) {
      setRecurrenceScopeAction("delete");
      return;
    }

    setDeleteConfirmOpen(true);
  };

  const performDelete = async (scope?: ScheduleRecurrenceActionScope) => {
    if (!schedule || !onDelete) return;

    setLoading(true);
    try {
      const deleted = await onDelete(schedule.id, scope);
      if (deleted) {
        onOpenChange(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    setDeleteConfirmOpen(false);
    await performDelete();
  };

  const handleRecurrenceScopeSelect = async (
    scope: ScheduleRecurrenceActionScope,
  ) => {
    const action = recurrenceScopeAction;
    setRecurrenceScopeAction(null);

    if (action === "update") {
      await performSave(scope);
      return;
    }

    if (action === "delete") {
      await performDelete(scope);
    }
  };

  const toggleAttendee = (employeeId: string, checked: boolean) => {
    setAttendeeIds((prev) =>
      checked ? [...prev, employeeId] : prev.filter((id) => id !== employeeId),
    );
  };

  const updateStartAt = (nextStartAt: string) => {
    setForm((prev) => {
      if (prev.all_day) return { ...prev, start_at: nextStartAt };

      return {
        ...prev,
        start_at: nextStartAt,
        end_at: addMinutes(
          nextStartAt,
          getDurationMinutes(prev.start_at, prev.end_at),
        ),
      };
    });
    setStartTimeInput(toTimeString(nextStartAt));
    if (!form.all_day) {
      const duration = getDurationMinutes(form.start_at, form.end_at);
      setEndTimeInput(toTimeString(addMinutes(nextStartAt, duration)));
    }
  };

  const updateEndAt = (nextEndAt: string) => {
    setForm((prev) => {
      if (prev.all_day) return { ...prev, end_at: nextEndAt };

      if (new Date(nextEndAt) <= new Date(prev.start_at)) {
        return { ...prev, end_at: addMinutes(prev.start_at, 30) };
      }

      return { ...prev, end_at: nextEndAt };
    });

    setEndTimeInput(
      toTimeString(
        new Date(nextEndAt) <= new Date(form.start_at)
          ? addMinutes(form.start_at, 30)
          : nextEndAt,
      ),
    );
  };

  const handleStartTimeInputChange = (rawValue: string) => {
    const formatted = formatTimeDigits(rawValue.replace(/\D/g, "").slice(0, 4));
    setStartTimeInput(formatted);
    const parsed = parseTimeInput(formatted);
    if (parsed) {
      updateStartAt(combineDateAndTime(toDateInput(form.start_at), parsed));
    }
  };

  const handleEndTimeInputChange = (rawValue: string) => {
    const formatted = formatTimeDigits(rawValue.replace(/\D/g, "").slice(0, 4));
    setEndTimeInput(formatted);
    const parsed = parseTimeInput(formatted);
    if (parsed) {
      updateEndAt(combineDateAndTime(toDateInput(form.end_at), parsed));
    }
  };

  const deleteConfirmDialog = (
    <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>일정 삭제</AlertDialogTitle>
          <AlertDialogDescription>
            정말 이 일정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteConfirm}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (mode === "view" && schedule) {
    const category = cats.find((item) => item.value === form.category);

    return (
      <>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {category && (
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                )}
                {form.title}
              </DialogTitle>
            </DialogHeader>

            <ScheduleView
              schedule={schedule}
              employees={employees}
              categories={categoriesProp}
            />

            <DialogFooter>
              {isExisting && onDelete && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteClick}
                  disabled={loading}
                  className="sm:mr-auto"
                >
                  삭제
                </Button>
              )}
              {onJumpToProject && form.project_id ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onJumpToProject(form.project_id!);
                    onOpenChange(false);
                  }}
                >
                  <ArrowRightCircle className="h-4 w-4" />
                  프로젝트로 이동
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                닫기
              </Button>
              <Button type="button" onClick={() => setMode("edit")}>
                수정
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {deleteConfirmDialog}
        <ScheduleRecurrenceScopeDialog
          open={Boolean(recurrenceScopeAction)}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setRecurrenceScopeAction(null);
          }}
          action={recurrenceScopeAction ?? "update"}
          loading={loading}
          onSelect={handleRecurrenceScopeSelect}
        />
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isExisting ? "일정 수정" : "일정 등록"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sch-title">제목 *</Label>
              <Input
                id="sch-title"
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="일정 제목"
                required
                autoFocus
              />
            </div>

            {!isLeaveCategory(form.category) && (
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={form.all_day}
                  onCheckedChange={(checked) =>
                    setForm((prev) => {
                      const nextAllDay = Boolean(checked);
                      if (nextAllDay) return { ...prev, all_day: true };

                      return {
                        ...prev,
                        all_day: false,
                        end_at: addMinutes(
                          prev.start_at,
                          getDurationMinutes(prev.start_at, prev.end_at),
                        ),
                      };
                    })
                  }
                />
                <span className="text-sm">종일</span>
              </label>
            )}

            <div className="space-y-3">
              <div className="space-y-2">
                <Label>시작</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <DateInput
                      value={toDateInput(form.start_at)}
                      onChange={(value) =>
                        updateStartAt(
                          combineDateAndTime(
                            value || toDateInput(form.start_at),
                            toTimeString(form.start_at),
                          ),
                        )
                      }
                    />
                  </div>
                  {!form.all_day && (
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="0900"
                      value={startTimeInput}
                      onChange={(e) =>
                        handleStartTimeInputChange(e.target.value)
                      }
                      onBlur={() =>
                        setStartTimeInput(toTimeString(form.start_at))
                      }
                      className="w-[120px]"
                    />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>종료</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <DateInput
                      value={toDateInput(form.end_at)}
                      onChange={(value) =>
                        updateEndAt(
                          combineDateAndTime(
                            value || toDateInput(form.end_at),
                            toTimeString(form.end_at),
                          ),
                        )
                      }
                    />
                  </div>
                  {!form.all_day && (
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="1000"
                      value={endTimeInput}
                      onChange={(e) => handleEndTimeInputChange(e.target.value)}
                      onBlur={() => setEndTimeInput(toTimeString(form.end_at))}
                      className="w-[120px]"
                    />
                  )}
                </div>

                {!form.all_day && (
                  <div className="flex flex-wrap gap-2">
                    {QUICK_DURATION_OPTIONS.map((option) => (
                      <Button
                        key={option.minutes}
                        type="button"
                        variant={
                          getDurationMinutes(form.start_at, form.end_at) ===
                          option.minutes
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() => {
                          const nextEndAt = addMinutes(
                            form.start_at,
                            option.minutes,
                          );
                          setForm((prev) => ({ ...prev, end_at: nextEndAt }));
                          setEndTimeInput(toTimeString(nextEndAt));
                        }}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {!isExisting && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Repeat className="h-3.5 w-3.5" />
                    반복
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {RECURRENCE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(
                          "rounded-full border px-3 py-1 text-sm transition-colors",
                          recurrenceType === option.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "hover:bg-muted",
                        )}
                        onClick={() => setRecurrenceType(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {recurrenceType !== "none" && (
                  <div className="space-y-2">
                    <Label>반복 종료일 *</Label>
                    <DateInput
                      value={recurrenceEndDate}
                      onChange={(value) => setRecurrenceEndDate(value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {recurrenceType === "daily" &&
                        "시작일부터 종료일까지 매일 같은 시간에 일정이 생성됩니다."}
                      {recurrenceType === "weekly" &&
                        `시작일부터 종료일까지 매주 같은 요일에 일정이 생성됩니다.`}
                      {recurrenceType === "monthly" &&
                        `시작일부터 종료일까지 매월 같은 날짜에 일정이 생성됩니다.`}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="sch-location">장소</Label>
              <Input
                id="sch-location"
                value={form.location ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    location: e.target.value || null,
                  }))
                }
                placeholder="장소"
              />
            </div>

            {!isExisting && (
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={shouldForceGoogleMeet || addGoogleMeet}
                  disabled={shouldForceGoogleMeet}
                  onCheckedChange={(checked) => {
                    if (shouldForceGoogleMeet) return;
                    setAddGoogleMeet(Boolean(checked));
                  }}
                />
                <Video className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {shouldForceGoogleMeet
                    ? "미팅은 Google Meet 링크가 자동 생성됩니다."
                    : "Google Meet 회의 자동 생성"}
                </span>
              </label>
            )}

            <div className="space-y-2">
              <Label>유형</Label>
              <div className="flex flex-wrap gap-2">
                {cats.map((category) => (
                  <button
                    key={category.value}
                    type="button"
                    className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors"
                    style={{
                      backgroundColor:
                        form.category === category.value
                          ? `${category.color}20`
                          : undefined,
                      borderColor:
                        form.category === category.value
                          ? category.color
                          : undefined,
                      color:
                        form.category === category.value
                          ? category.color
                          : undefined,
                    }}
                    onClick={() =>
                      setForm((prev) => {
                        const next = { ...prev, category: category.value };
                        if (isLeaveCategory(category.value)) {
                          // 연차는 종일 고정(시간 없음)
                          next.all_day = true;
                          if (!next.leave_employee_id)
                            next.leave_employee_id =
                              prev.created_by || currentEmployeeId || null;
                          if (next.leave_days == null) next.leave_days = 1;
                        }
                        return next;
                      })
                    }
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    {category.label}
                  </button>
                ))}
              </div>
            </div>

            {isLeaveCategory(form.category) && (
              <div className="space-y-3 rounded-md border border-border/70 bg-muted/30 p-3">
                <div className="space-y-2">
                  <Label htmlFor="sch-leave-emp">휴가 대상 직원 *</Label>
                  <select
                    id="sch-leave-emp"
                    value={form.leave_employee_id ?? ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        leave_employee_id: e.target.value || null,
                      }))
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">직원 선택</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                        {employee.department ? ` (${employee.department})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>사용 단위</Label>
                  <div className="flex flex-wrap gap-2">
                    {LEAVE_UNIT_OPTIONS.map((unit) => {
                      const active = (form.leave_days ?? 1) === unit.value;
                      return (
                        <button
                          key={unit.value}
                          type="button"
                          className={cn(
                            "rounded-full border px-3 py-1 text-sm transition-colors",
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "hover:bg-muted",
                          )}
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              leave_days: unit.value,
                            }))
                          }
                        >
                          {unit.label} ({unit.value}일)
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    선택한 직원의 연차/월차 사용일수로 집계됩니다. (여러 날이면
                    날짜별로 등록)
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>참석자</Label>
              <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
                {employees.map((employee) => (
                  <label
                    key={employee.id}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={attendeeIds.includes(employee.id)}
                      onCheckedChange={(checked) =>
                        toggleAttendee(employee.id, Boolean(checked))
                      }
                    />
                    <span>{employee.name}</span>
                  </label>
                ))}
                {employees.length === 0 && (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    등록된 직원이 없습니다.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sch-desc">메모</Label>
              <textarea
                id="sch-desc"
                value={form.description ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    description: e.target.value || null,
                  }))
                }
                placeholder="메모"
                rows={3}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <DialogFooter>
              {isExisting && onDelete && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteClick}
                  disabled={loading}
                  className="sm:mr-auto"
                >
                  삭제
                </Button>
              )}

              {isExisting ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMode("view")}
                >
                  취소
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  취소
                </Button>
              )}

              <Button type="submit" disabled={loading}>
                {loading ? "저장 중..." : isExisting ? "수정" : "등록"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ScheduleRecurrenceScopeDialog
        open={Boolean(recurrenceScopeAction)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setRecurrenceScopeAction(null);
        }}
        action={recurrenceScopeAction ?? "update"}
        loading={loading}
        onSelect={handleRecurrenceScopeSelect}
      />
      {deleteConfirmDialog}
    </>
  );
}
