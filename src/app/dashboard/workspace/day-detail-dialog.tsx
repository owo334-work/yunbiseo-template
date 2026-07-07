"use client";

import { CalendarClock, Cake, Palmtree } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { format, ko, parseISO } from "@/components/calendar/calendar-utils";
import type { Employee, Schedule } from "@/lib/types";

type CategoryLookup = { value: string; label: string; color: string }[];

function catInfo(cats: CategoryLookup, value: string) {
  const found = cats.find((c) => c.value === value);
  return { label: found?.label ?? value, color: found?.color ?? "#6b7280" };
}

export function DayDetailDialog({
  open,
  onOpenChange,
  date,
  birthdays,
  leaves,
  works,
  employeeNameById,
  categories,
  onOpenSchedules,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  birthdays: Employee[];
  leaves: Schedule[];
  works: Schedule[];
  employeeNameById: Map<string, string>;
  categories: CategoryLookup;
  onOpenSchedules: () => void;
}) {
  const nothing = birthdays.length === 0 && leaves.length === 0 && works.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {date ? format(date, "M월 d일 (EEE)", { locale: ko }) : "일정"}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {nothing ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              이 날짜에 등록된 일정이 없습니다.
            </p>
          ) : null}

          {/* 생일 */}
          {birthdays.length > 0 ? (
            <section className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Cake className="h-3.5 w-3.5" /> 생일
              </p>
              {birthdays.map((emp) => (
                <div
                  key={emp.id}
                  className="rounded-lg border border-pink-200 bg-pink-50/70 px-3 py-2 text-sm text-pink-800"
                >
                  🎂 {emp.name}
                  {emp.department ? (
                    <span className="ml-1 text-xs text-pink-500">· {emp.department}</span>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          {/* 연차/월차 */}
          {leaves.length > 0 ? (
            <section className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Palmtree className="h-3.5 w-3.5" /> 연차 · 월차
              </p>
              {leaves.map((s) => {
                const info = catInfo(categories, s.category);
                const who = employeeNameById.get(s.created_by);
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: `${info.color}55`, backgroundColor: `${info.color}12` }}
                  >
                    <span
                      className="inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ backgroundColor: `${info.color}22`, color: info.color }}
                    >
                      {info.label}
                    </span>
                    <span className="truncate text-foreground">{s.title}</span>
                    {who ? (
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{who}</span>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ) : null}

          {/* 업무 일정 */}
          {works.length > 0 ? (
            <section className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" /> 업무 일정
              </p>
              {works.map((s) => {
                const info = catInfo(categories, s.category);
                const who = employeeNameById.get(s.created_by);
                const time = s.all_day ? "종일" : format(parseISO(s.start_at), "HH:mm");
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-lg border border-border/70 bg-card/70 px-3 py-2 text-sm"
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: info.color }}
                    />
                    <span className="w-11 shrink-0 text-xs text-muted-foreground">{time}</span>
                    <span className="truncate text-foreground">{s.title}</span>
                    {who ? (
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{who}</span>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button type="button" onClick={onOpenSchedules}>
            일정관리 열기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
