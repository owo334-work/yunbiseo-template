import { format, startOfWeek } from "date-fns";

import type { WorkListType } from "@/lib/types";

export function routinePeriodKey(listType: WorkListType, date = new Date()) {
  if (listType === "daily") return format(date, "yyyy-MM-dd");
  if (listType === "weekly") return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
  if (listType === "monthly") return format(date, "yyyy-MM");
  return null;
}

export function isRoutineChecked(task: {
  list_type: WorkListType;
  routine_checked_key?: string | null;
}) {
  const current = routinePeriodKey(task.list_type);
  return current != null && task.routine_checked_key === current;
}
