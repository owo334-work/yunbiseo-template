"use client";

import { Archive, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { WorkStatusTask, WorkStatusValue } from "@/lib/types";
import { WORK_STATUSES, WORK_STATUS_STYLES } from "@/lib/work-status";

// 진척도 게이지 색상
function progressTone(value: number) {
  if (value >= 100) return "bg-emerald-500";
  if (value >= 50) return "bg-sky-500";
  if (value > 0) return "bg-amber-500";
  return "bg-slate-300";
}

export function DeadlineTaskItem({
  task,
  canEdit,
  onDeleted,
  onArchived,
}: {
  task: WorkStatusTask;
  canEdit: boolean;
  onDeleted: (id: string) => void;
  onArchived?: (id: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [progress, setProgress] = useState(task.progress ?? 0);
  const [memo, setMemo] = useState(task.detail ?? "");
  const [status, setStatus] = useState<WorkStatusValue>(task.status);
  const [collapsed, setCollapsed] = useState(true);
  const [archiving, setArchiving] = useState(false);

  const archive = async () => {
    setArchiving(true);
    const { error } = await supabase
      .from("work_status_tasks")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", task.id);
    if (error) {
      toast.error("보관에 실패했습니다.");
      setArchiving(false);
      return;
    }
    toast.success("보관함으로 옮겼습니다.");
    onArchived?.(task.id);
  };

  const persist = async (patch: Partial<WorkStatusTask>) => {
    const { error } = await supabase
      .from("work_status_tasks")
      .update(patch)
      .eq("id", task.id);
    if (error) {
      console.error("업무 저장 실패:", error.message);
      toast.error("저장에 실패했습니다. 권한이 있는지 확인해 주세요.");
      return false;
    }
    return true;
  };

  const saveProgress = async (value: number) => {
    // 진척도 100% 면 자동 완료, 그 외엔 상태 유지(단 완료였다면 진행중으로)
    const nextStatus: WorkStatusValue =
      value >= 100 ? "완료" : status === "완료" ? "진행중" : status;
    const ok = await persist({ progress: value, status: nextStatus });
    if (ok) setStatus(nextStatus);
  };

  const isOverdue =
    task.due_date != null &&
    status !== "완료" &&
    task.due_date < new Date().toISOString().slice(0, 10);

  return (
    <Card className="border-border/70 bg-card/85">
      <CardContent className="space-y-2 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex flex-1 items-start gap-1.5 text-left"
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span
              className={`text-sm font-medium ${
                status === "완료" ? "text-muted-foreground line-through" : "text-foreground"
              }`}
            >
              {task.title}
            </span>
          </button>
          {canEdit ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={async () => {
                if (!confirm(`'${task.title}' 업무를 삭제할까요?`)) return;
                const { error } = await supabase
                  .from("work_status_tasks")
                  .delete()
                  .eq("id", task.id);
                if (error) {
                  toast.error("삭제에 실패했습니다.");
                  return;
                }
                onDeleted(task.id);
              }}
              aria-label="업무 삭제"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {task.due_date ? (
            <span className={isOverdue ? "font-medium text-rose-600" : "text-muted-foreground"}>
              마감 {task.due_date}
              {isOverdue ? " (기한 초과)" : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">마감기한 없음</span>
          )}
          {status === "완료" && task.completed_at ? (
            <span className="text-emerald-600">
              완료 {task.completed_at.slice(0, 10)}
            </span>
          ) : null}
          {canEdit ? (
            <Select value={status} onValueChange={(v) => void (async () => {
              const next = v as WorkStatusValue;
              setStatus(next);
              await persist({ status: next });
            })()}>
              <SelectTrigger size="sm" className={`ml-auto h-6 border text-xs font-medium ${WORK_STATUS_STYLES[status]}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className={`ml-auto inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${WORK_STATUS_STYLES[status]}`}>
              {status}
            </span>
          )}
        </div>

        {/* 진척도 (짧게): 접힘=게이지 바, 펼침=조절 슬라이더 + % */}
        <div className="flex items-center gap-2">
          {!collapsed && canEdit ? (
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              onPointerUp={() => void saveProgress(progress)}
              onKeyUp={() => void saveProgress(progress)}
              className="h-2 flex-1 accent-sky-600"
              aria-label="진척도"
            />
          ) : (
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${progressTone(progress)}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <span className="w-9 shrink-0 text-right text-[11px] font-semibold text-foreground">
            {progress}%
          </span>
        </div>

        {/* 펼쳤을 때만: 메모 + 완료건 보관 */}
        {collapsed ? null : (
          <>
            {canEdit ? (
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                onBlur={() => {
                  if (memo !== (task.detail ?? "")) void persist({ detail: memo || null });
                }}
                placeholder="메모 (업무 관련 메모를 적어두세요)"
                rows={2}
                className="w-full resize-y rounded-lg border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            ) : memo ? (
              <p className="whitespace-pre-wrap rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                {memo}
              </p>
            ) : null}

            {canEdit && status === "완료" ? (
              <div className="flex justify-end pt-0.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => void archive()}
                  disabled={archiving}
                >
                  <Archive className="h-3.5 w-3.5" />
                  보관함으로
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
