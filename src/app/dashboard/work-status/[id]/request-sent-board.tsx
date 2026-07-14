"use client";

import { Send } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import type { WorkStatusTask, WorkStatusValue } from "@/lib/types";
import { WORK_STATUS_STYLES } from "@/lib/work-status";

// 내가 보낸 요청업무 (진행상황 공유용, 열람 전용)
// 각 행은 요청 받은 직원 이름을 함께 담고 있다.
export type SentRequest = WorkStatusTask & {
  employee?: { id: string; name: string; department: string | null } | null;
};

function progressTone(value: number) {
  if (value >= 100) return "bg-emerald-500";
  if (value >= 50) return "bg-sky-500";
  if (value > 0) return "bg-amber-500";
  return "bg-slate-300";
}

export function RequestSentBoard({ requests, onDeleted }: { requests: SentRequest[]; onDeleted: (id: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteCompletedRequest = async (task: SentRequest) => {
    if (task.status !== "완료" || deletingId) return;
    if (!window.confirm("완료된 업무를 삭제할까요?")) return;
    setDeletingId(task.id);
    const { error } = await supabase.from("work_status_tasks").delete().eq("id", task.id);
    setDeletingId(null);
    if (error) {
      toast.error("완료 업무를 삭제하지 못했습니다.");
      return;
    }
    onDeleted(task.id);
    toast.success("완료된 요청 업무를 삭제했습니다.");
  };

  return (
    <Card className="min-w-0 overflow-x-hidden rounded-[1rem] border-border/70 bg-card/85">
      <CardHeader className="px-3 pb-1.5 pt-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Send className="h-4 w-4 text-primary" />
          내가 요청한 업무{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({requests.length}) · 진행상황 공유
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          내가 보낸 요청의 진행상황·메모만 공유받아 확인합니다. (수정은 요청 받은 직원이 합니다)
        </p>
      </CardHeader>
      <CardContent className="space-y-1.5 px-3 pb-3">
        {requests.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">
            내가 다른 직원에게 보낸 요청업무가 여기에 표시됩니다.
          </p>
        ) : (
          requests.map((task) => {
            const progress = task.progress ?? 0;
            const status = task.status as WorkStatusValue;
            const recipientDeleted = Boolean(task.recipient_deleted_at);
            const isOverdue =
              task.due_date != null &&
              status !== "완료" &&
              task.due_date < new Date().toISOString().slice(0, 10);
            return (
              <div
                key={task.id}
                role={status === "완료" ? "button" : undefined}
                tabIndex={status === "완료" ? 0 : undefined}
                onClick={() => void deleteCompletedRequest(task)}
                onKeyDown={(event) => {
                  if (status === "완료" && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    void deleteCompletedRequest(task);
                  }
                }}
                className={`min-w-0 space-y-1.5 overflow-hidden rounded-lg border p-2.5 ${
                  status === "완료"
                    ? "cursor-pointer border-emerald-200/80 bg-emerald-50/30 hover:border-emerald-300 hover:bg-emerald-50/60"
                    : "border-border/60 bg-background/50"
                }`}
                title={status === "완료" ? "눌러서 완료된 요청 업무 삭제" : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={`min-w-0 break-words text-sm font-medium ${
                      status === "완료" ? "text-muted-foreground line-through" : "text-foreground"
                    }`}
                  >
                    {task.title}
                  </p>
                  <div className="flex shrink-0 items-center gap-1">
                    {recipientDeleted ? (
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600">
                        요청받은 직원이 삭제함
                      </span>
                    ) : null}
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${WORK_STATUS_STYLES[status]}`}>
                      {deletingId === task.id ? "삭제 중" : status}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground">
                    {task.employee?.name ?? "직원"}
                    {task.employee?.department ? (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        {task.employee.department}
                      </span>
                    ) : null}
                  </span>
                  {task.due_date ? (
                    <span className={isOverdue ? "font-medium text-rose-600" : ""}>
                      마감 {task.due_date}
                      {isOverdue ? " (기한 초과)" : ""}
                    </span>
                  ) : (
                    <span>마감기한 없음</span>
                  )}
                  {/* 마감일과 같은 줄에 짧은 진척도 바를 표시한다. */}
                  <div className="ml-auto flex min-w-[110px] max-w-[220px] flex-1 items-center gap-2">
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${progressTone(progress)}`}
                      style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                    />
                  </div>
                  <span className="w-9 shrink-0 text-right text-[11px] font-medium text-muted-foreground">
                    {progress}%
                  </span>
                  </div>
                </div>

                {task.detail ? (
                  <p className="whitespace-pre-wrap break-words rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {task.detail}
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
