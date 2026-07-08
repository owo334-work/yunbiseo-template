"use client";

import { useEffect, useState } from "react";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import type { Employee } from "@/lib/types";
import { sortEmployeesForWork } from "@/lib/work-status";

function SortableRow({ employee }: { employee: Employee }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: employee.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border border-border/70 bg-card px-3 py-2"
    >
      <button
        type="button"
        className="flex h-7 w-7 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing"
        aria-label={`${employee.name} 순서 이동`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {employee.name}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {[employee.department, employee.position].filter(Boolean).join(" · ") || "부서 미지정"}
      </span>
    </div>
  );
}

export function EmployeeOrderDialog({
  open,
  onOpenChange,
  employees,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  onSaved: () => void;
}) {
  const [order, setOrder] = useState<Employee[]>(employees);
  const [saving, setSaving] = useState(false);

  // 다이얼로그를 열 때마다 현재 정렬 상태로 초기화
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setOrder(sortEmployeesForWork(employees));
  }, [open, employees]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const oldIndex = prev.findIndex((e) => e.id === active.id);
      const newIndex = prev.findIndex((e) => e.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const saveOrder = async (list: Employee[]) => {
    setSaving(true);
    const supabase = createClient();
    // 현재 화면 순서를 0,1,2… 로 저장한다.
    const updates = list.map((e, index) =>
      supabase.from("employees").update({ sort_order: index }).eq("id", e.id),
    );
    const results = await Promise.all(updates);
    setSaving(false);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      alert(`순서 저장에 실패했습니다: ${failed.error.message}`);
      return;
    }
    onSaved();
    onOpenChange(false);
  };

  const resetToAuto = async () => {
    if (!confirm("수동 순서를 지우고 직급순(같은 직급은 가나다순)으로 되돌릴까요?")) return;
    setSaving(true);
    const supabase = createClient();
    const results = await Promise.all(
      employees.map((e) => supabase.from("employees").update({ sort_order: null }).eq("id", e.id)),
    );
    setSaving(false);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      alert(`자동정렬 적용에 실패했습니다: ${failed.error.message}`);
      return;
    }
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-4 overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>직원 표시 순서 편집</DialogTitle>
          <DialogDescription>
            드래그해서 순서를 바꾸세요. 여기서 정한 순서는 업무현황 목록과 워크스페이스 업무현황에 함께
            적용됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={order.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {order.map((employee) => (
                  <SortableRow key={employee.id} employee={employee} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => void resetToAuto()} disabled={saving}>
            직급순 자동정렬
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              취소
            </Button>
            <Button type="button" onClick={() => void saveOrder(order)} disabled={saving}>
              {saving ? "저장 중…" : "순서 저장"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
