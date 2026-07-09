"use client";

import { Megaphone, Users2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { createClient } from "@/lib/supabase/client";

type AssignEmployee = { id: string; name: string; department: string | null };

export function RequestAssignPanel({
  employees,
  currentDepartment,
  minPosition,
  authUid,
  onAssigned,
}: {
  employees: AssignEmployee[];
  currentDepartment: string | null;
  minPosition: string;
  authUid: string | null;
  onAssigned: (targetEmployeeIds: string[]) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [memo, setMemo] = useState("");
  const [sending, setSending] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectTeam = () => {
    if (!currentDepartment) {
      toast.info("내 부서가 지정되어 있지 않습니다. (직원관리에서 부서 설정)");
      return;
    }
    setSelected(new Set(employees.filter((e) => e.department === currentDepartment).map((e) => e.id)));
  };

  const send = async () => {
    const targets = Array.from(selected);
    const trimmed = title.trim();
    if (!trimmed) {
      toast.info("요청할 업무 내용을 입력하세요.");
      return;
    }
    if (targets.length === 0) {
      toast.info("요청 받을 직원을 한 명 이상 선택하세요.");
      return;
    }
    setSending(true);
    const rows = targets.map((employeeId) => ({
      employee_id: employeeId,
      list_type: "instruction" as const,
      title: trimmed,
      detail: memo.trim() || null,
      status: "미진행" as const,
      progress: 0,
      due_date: due || null,
      sort_order: 0,
      created_by: authUid,
    }));
    const { error } = await supabase.from("work_status_tasks").insert(rows);
    if (error) {
      console.error("요청사항 배정 실패:", error.message);
      toast.error("요청사항 배정에 실패했습니다. 권한(직책)을 확인해 주세요.");
    } else {
      toast.success(`${targets.length}명에게 요청사항을 보냈습니다.`);
      onAssigned(targets);
      setTitle("");
      setDue("");
      setMemo("");
      setSelected(new Set());
    }
    setSending(false);
  };

  return (
    <Card className="rounded-[1rem] border-primary/25 bg-primary/[0.03]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Megaphone className="h-4 w-4 text-primary" />
          요청사항 배정{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({minPosition} 이상 · 관리자)
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          요청 받을 직원을 선택해 업무를 보내면, 각 직원의 &lsquo;요청사항 업무&rsquo; 목록에 표시됩니다.
          진행상황은 내가 보낸 &lsquo;요청한 업무&rsquo;에서 확인할 수 있습니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="요청 업무 내용"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1"
          />
          <Input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="w-full sm:w-44"
          />
        </div>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="메모 (선택)"
          rows={2}
          className="w-full resize-y rounded-lg border border-border/70 bg-background/80 px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        />

        <div className="space-y-2 rounded-lg border border-border/60 bg-background/50 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              요청 받을 직원 선택 ({selected.size}명)
            </span>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={selectTeam}>
                <Users2 className="h-3.5 w-3.5" />
                우리 팀 전체
              </Button>
              {selected.size > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelected(new Set())}
                >
                  해제
                </Button>
              ) : null}
            </div>
          </div>
          <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
            {employees.map((emp) => (
              <label
                key={emp.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60"
              >
                <Checkbox checked={selected.has(emp.id)} onCheckedChange={() => toggle(emp.id)} />
                <span className="truncate">
                  {emp.name}
                  {emp.department ? (
                    <span className="ml-1 text-[11px] text-muted-foreground">{emp.department}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => void send()} disabled={sending || !title.trim() || selected.size === 0}>
            <Megaphone className="h-4 w-4" />
            요청 보내기
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
