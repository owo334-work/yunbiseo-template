"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarMonthView } from "@/components/calendar/calendar-month-view";
import { addMonths, subMonths, startOfMonth, format } from "@/components/calendar/calendar-utils";
import { createClient } from "@/lib/supabase/client";
import type { Schedule } from "@/lib/types";

function toIso(dateStr: string, timeStr: string) {
  // 로컬 시간 기준으로 Date 생성 후 ISO 로 변환
  return new Date(`${dateStr}T${timeStr}:00`).toISOString();
}

export function PersonalCalendar({
  schedules: initialSchedules,
  canAdd,
  employeeId,
}: {
  schedules: Schedule[];
  canAdd: boolean;
  employeeId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [schedules, setSchedules] = useState<Schedule[]>(initialSchedules);
  const [current, setCurrent] = useState<Date>(() => startOfMonth(new Date()));

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isRange, setIsRange] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const openAdd = (d?: Date) => {
    const base = d ?? new Date();
    const iso = format(base, "yyyy-MM-dd");
    setDate(iso);
    setEndDate(iso);
    setIsRange(false);
    setTitle("");
    setAllDay(false);
    setStartTime("09:00");
    setEndTime("10:00");
    setOpen(true);
  };

  const toggleRange = () => {
    setIsRange((prev) => {
      const next = !prev;
      // 기간으로 켤 때 종료 날짜가 비었거나 시작보다 빠르면 시작 날짜로 맞춘다
      if (next && (!endDate || endDate < date)) setEndDate(date);
      return next;
    });
  };

  const save = async () => {
    if (!title.trim() || !date) {
      toast.info("일정 제목과 날짜를 입력하세요.");
      return;
    }
    // 기간 일정: 종료 날짜, 없거나 시작보다 빠르면 시작 날짜로 처리
    const lastDay = isRange && endDate && endDate >= date ? endDate : date;
    setSaving(true);
    const start_at = allDay ? toIso(date, "00:00") : toIso(date, startTime);
    const end_at = allDay ? toIso(lastDay, "23:59") : toIso(lastDay, endTime);
    const { data, error } = await supabase
      .from("schedules")
      .insert({
        title: title.trim(),
        start_at,
        end_at,
        all_day: allDay,
        category: "other",
        recurrence_type: "none",
        created_by: employeeId,
      })
      .select("*")
      .single();
    if (error) {
      console.error("일정 추가 실패:", error.message);
      toast.error("일정 추가에 실패했습니다.");
    } else if (data) {
      setSchedules((prev) => [...prev, data as Schedule]);
      toast.success("일정을 추가했습니다.");
      setOpen(false);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrent((c) => subMonths(c, 1))}
            aria-label="이전 달"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setCurrent(startOfMonth(new Date()))}
          >
            오늘
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrent((c) => addMonths(c, 1))}
            aria-label="다음 달"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-2 text-sm font-semibold text-foreground">
            {format(current, "yyyy년 M월")}
          </span>
        </div>
        {canAdd ? (
          <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => openAdd()}>
            <Plus className="h-3.5 w-3.5" />
            일정 추가
          </Button>
        ) : null}
      </div>

      <CalendarMonthView
        currentDate={current}
        schedules={schedules}
        onDateClick={(d) => (canAdd ? openAdd(d) : undefined)}
        onEventClick={() => router.push("/dashboard/schedules")}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>내 일정 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cal-title">제목</Label>
              <Input
                id="cal-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="일정 제목"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="cal-date">{isRange ? "시작 날짜" : "날짜"}</Label>
                <button
                  type="button"
                  onClick={toggleRange}
                  className="rounded-md px-2 py-0.5 text-xs text-primary transition-colors hover:bg-primary/10"
                >
                  {isRange ? "− 기간 해제" : "+ 기간으로 (출장 등)"}
                </button>
              </div>
              <Input
                id="cal-date"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (isRange && (!endDate || endDate < e.target.value)) setEndDate(e.target.value);
                }}
              />
            </div>
            {isRange ? (
              <div className="space-y-1.5">
                <Label htmlFor="cal-end-date">종료 날짜</Label>
                <Input
                  id="cal-end-date"
                  type="date"
                  value={endDate}
                  min={date}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  시작~종료 날짜에 걸쳐 캘린더에 표시됩니다.
                </p>
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="accent-sky-600"
              />
              하루 종일
            </label>
            {!allDay ? (
              <div className="flex gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="cal-start">시작</Label>
                  <Input
                    id="cal-start"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="cal-end">종료</Label>
                  <Input
                    id="cal-end"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
