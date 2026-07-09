"use client";

import { cn } from "@/lib/utils";
import type { Schedule } from "@/lib/types";
import {
  format,
  parseISO,
  getCategoryColor,
  isLeaveCategory,
  toPastel,
} from "./calendar-utils";

interface CalendarEventProps {
  schedule: Schedule;
  compact?: boolean;
  short?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  startAtOverride?: string;
  /** 지정 시 카테고리 색 대신 이 색을 쓴다 (예: 부서별 색상) */
  colorOverride?: string;
}

export function CalendarEvent({ schedule, compact, short, onClick, startAtOverride, colorOverride }: CalendarEventProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(e);
  };
  const categoryColor = colorOverride ?? getCategoryColor(schedule.category);
  const displayStartAt = startAtOverride ?? schedule.start_at;

  const startTime = schedule.all_day
    ? null
    : format(parseISO(displayStartAt), "HH:mm");

  // 연차 등 휴무: 시간 없이 문구만, 배경색은 글자 부분까지만 감싸는 칩으로 표시
  const isLeave = isLeaveCategory(schedule.category);

  if (isLeave) {
    return (
      <div role="button" onClick={handleClick} className="w-full text-left leading-tight">
        <span
          className={cn(
            "inline-block break-words rounded px-1 py-0.5 text-foreground transition-opacity hover:opacity-80",
            compact ? "text-[10px] sm:text-xs" : "text-xs"
          )}
          style={{ backgroundColor: toPastel(categoryColor) }}
        >
          {schedule.title}
        </span>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        role="button"
        onClick={handleClick}
        className="w-full rounded px-1 py-0.5 text-left text-[10px] leading-tight text-foreground transition-opacity hover:opacity-80 sm:text-xs"
        style={{ backgroundColor: toPastel(categoryColor) }}
      >
        <p className="break-words whitespace-normal">
          {startTime && <span className="text-[9px] opacity-80 sm:text-[10px]">{startTime} </span>}
          <span>{schedule.title}</span>
        </p>
      </div>
    );
  }

  return (
    <div
      role="button"
      onClick={handleClick}
      className={cn(
        "h-full w-full overflow-hidden rounded-md border text-left text-xs text-foreground shadow-sm transition-opacity hover:opacity-90",
        short ? "flex items-center gap-1 px-1.5 py-0" : "px-2 py-1"
      )}
      style={{ backgroundColor: toPastel(categoryColor), borderColor: toPastel(categoryColor, 0.3) }}
    >
      <p className={cn(
        "font-medium",
        short ? "truncate text-[10px] leading-none" : "break-words whitespace-normal leading-snug"
      )}>
        {startTime && <span className={cn("opacity-70", short ? "text-[9px]" : "text-[10px]")}>{startTime} </span>}
        <span>{schedule.title}</span>
      </p>
    </div>
  );
}
