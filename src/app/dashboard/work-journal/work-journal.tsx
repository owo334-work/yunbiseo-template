"use client";

import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { ko } from "date-fns/locale";
import {
  Archive,
  ArchiveRestore,
  CalendarCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripHorizontal,
  Maximize2,
  Palette,
  Plus,
  RotateCcw,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { DeadlineTaskItem } from "@/app/dashboard/work-status/[id]/deadline-task-item";
import { RequestSentBoard, type SentRequest } from "@/app/dashboard/work-status/[id]/request-sent-board";
import { isRoutineChecked, routinePeriodKey } from "@/lib/routine-period";
import { createClient } from "@/lib/supabase/client";
import type { WorkListType, WorkStatusTask, WorkStatusValue } from "@/lib/types";
import { cn } from "@/lib/utils";

type JournalEntry = {
  id: string;
  employee_id: string;
  journal_date: string;
  content: string;
  font_size: number;
  text_color: string;
  schedule_id: string | null;
};

type BoardNote = {
  id: string;
  employee_id: string;
  content: string;
  background_color: string;
  text_color: string;
  font_size: number;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  is_archived: boolean;
};

type SchedulePrompt = {
  x: number;
  y: number;
  date: string;
  content: string;
  journalDate: string;
};

const NOTE_COLORS = ["#fef3c7", "#dbeafe", "#dcfce7", "#fce7f3", "#ede9fe", "#f1f5f9"];
const TEXT_COLORS = ["#334155", "#0f766e", "#1d4ed8", "#7e22ce", "#be123c", "#111827"];
const FONT_SIZES = [12, 14, 16, 18, 22, 26];
const ROUTINE_LISTS: Array<{ key: WorkListType; label: string }> = [
  { key: "daily", label: "일간" },
  { key: "weekly", label: "주간" },
  { key: "monthly", label: "월간" },
];

function dateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function toLocalIso(date: string, hour: number) {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00`).toISOString();
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function editorHtml(value: string) {
  if (!value.trim()) return "<div><br></div>";
  if (/<[a-z][\s\S]*>/i.test(value)) return value;
  return value.split("\n").map((line) => `<div>${escapeHtml(line) || "<br>"}</div>`).join("");
}

// 이전 버전 에디터가 insertUnorderedList 로 저장한 <ul><li> 문단을 <div> 문단으로 되돌린다.
// 문단기호를 li 는 list-disc 마커로, div 는 ::before 로 그리던 탓에 두 모양이 섞여 보였다.
function paragraphsFromLists(html: string) {
  if (typeof document === "undefined" || !/<(ul|ol|li)\b/i.test(html)) return html;
  const holder = document.createElement("div");
  holder.innerHTML = html;
  holder.querySelectorAll("ul, ol").forEach((list) => {
    const fragment = document.createDocumentFragment();
    list.querySelectorAll(":scope > li").forEach((item) => {
      const paragraph = document.createElement("div");
      paragraph.innerHTML = item.innerHTML.trim() || "<br>";
      fragment.append(paragraph);
    });
    list.replaceWith(fragment);
  });
  return holder.innerHTML;
}

function restoreEmptyParagraph(editor: HTMLDivElement) {
  if (editor.textContent?.trim() || editor.querySelector("div, li")) return;
  editor.innerHTML = "<div><br></div>";
  const paragraph = editor.firstElementChild;
  if (!paragraph) return;
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function parseSelectedSchedule(text: string, fallback: Date) {
  const normalized = text.trim();
  let year = fallback.getFullYear();
  let month: number | null = null;
  let day: number | null = null;
  let matched = "";

  const iso = normalized.match(/\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/);
  const korean = normalized.match(/(?:(20\d{2})년\s*)?(\d{1,2})월\s*(\d{1,2})일/);
  const short = normalized.match(/\b(\d{1,2})[./](\d{1,2})(?:일)?\b/);
  if (iso) {
    year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]); matched = iso[0];
  } else if (korean) {
    year = korean[1] ? Number(korean[1]) : year; month = Number(korean[2]); day = Number(korean[3]); matched = korean[0];
  } else if (short) {
    month = Number(short[1]); day = Number(short[2]); matched = short[0];
  }
  if (!month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  if (parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return {
    date: format(parsed, "yyyy-MM-dd"),
    content: normalized.replace(matched, "").replace(/^[\s:：·•\-–]+/, "").trim() || normalized,
  };
}

function MiniCalendar({ month, selected, onMonthChange, onSelect }: {
  month: Date;
  selected: Date;
  onMonthChange: (date: Date) => void;
  onSelect: (date: Date) => void;
}) {
  const first = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const last = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: first, end: last });
  return (
    <div className="w-[205px] shrink-0 rounded-xl border border-border/60 bg-white/65 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <button type="button" className="rounded-md p-0.5 hover:bg-muted" onClick={() => onMonthChange(subMonths(month, 1))} aria-label="이전 달"><ChevronLeft className="h-3.5 w-3.5" /></button>
        <strong className="text-xs">{format(month, "yyyy년 M월", { locale: ko })}</strong>
        <button type="button" className="rounded-md p-0.5 hover:bg-muted" onClick={() => onMonthChange(addMonths(month, 1))} aria-label="다음 달"><ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[9px] text-muted-foreground">{["월", "화", "수", "목", "금", "토", "일"].map((label) => <span key={label}>{label}</span>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-0.5">
        {days.map((day) => (
          <button type="button" key={day.toISOString()} onClick={() => onSelect(day)} className={cn(
            "aspect-square rounded-md text-[10px] hover:bg-primary/10",
            !isSameMonth(day, month) && "text-muted-foreground/30",
            isSameDay(day, new Date()) && "font-bold text-primary ring-1 ring-primary/40",
            isSameDay(day, selected) && "bg-primary text-primary-foreground hover:bg-primary"
          )}>{format(day, "d")}</button>
        ))}
      </div>
    </div>
  );
}

export function WorkJournal() {
  const supabase = useMemo(() => createClient(), []);
  const boardRef = useRef<HTMLDivElement>(null);
  const entryIdsRef = useRef(new Map<string, string>());
  const selectionRef = useRef<Range | null>(null);
  const selectedEditorRef = useRef<HTMLDivElement | null>(null);
  const selectedDateRef = useRef<string | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [authUid, setAuthUid] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [notes, setNotes] = useState<BoardNote[]>([]);
  const [workTasks, setWorkTasks] = useState<WorkStatusTask[]>([]);
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([]);
  const [routineInput, setRoutineInput] = useState<Record<string, string>>({});
  const [showArchive, setShowArchive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [textPaletteOpen, setTextPaletteOpen] = useState(false);
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [notePaletteId, setNotePaletteId] = useState<string | null>(null);
  const [schedulePrompt, setSchedulePrompt] = useState<SchedulePrompt | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const visibleNotes = useMemo(() => notes.filter((note) => note.is_archived === showArchive), [notes, showArchive]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      setAuthUid(auth.user.id);
      const { data, error } = await supabase.from("employees").select("id").eq("auth_uid", auth.user.id).single();
      if (!active) return;
      if (error || !data) toast.error("직원 정보를 확인할 수 없습니다.");
      else setEmployeeId(data.id);
    })();
    return () => { active = false; };
  }, [supabase]);

  // 드래그가 에디터 밖에서 끝나도 선택 영역을 붙잡아 둔다. 툴바는 mousedown 을 막아
  // 포커스를 옮기지 않으므로, 여기 저장된 range 로 execCommand 를 그대로 적용할 수 있다.
  useEffect(() => {
    const onSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const element = node instanceof Element ? node : node.parentElement;
      const editor = element?.closest<HTMLDivElement>("[data-journal-date]");
      if (!editor) return;
      selectedEditorRef.current = editor;
      selectedDateRef.current = editor.dataset.journalDate ?? null;
      selectionRef.current = range.collapsed ? null : range.cloneRange();
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  const loadEntries = useCallback(async () => {
    if (!employeeId) return;
    const { data, error } = await supabase.from("work_journal_entries").select("*").eq("employee_id", employeeId)
      .gte("journal_date", dateKey(weekStart)).lte("journal_date", dateKey(addDays(weekStart, 6))).order("created_at");
    if (error) toast.error("주간 업무일지를 불러오지 못했습니다.");
    else {
      const loaded = ((data ?? []) as JournalEntry[]).map((entry) => ({ ...entry, content: paragraphsFromLists(entry.content) }));
      entryIdsRef.current = new Map(loaded.map((entry) => [entry.journal_date, entry.id]));
      setEntries(loaded);
    }
  }, [employeeId, supabase, weekStart]);

  const loadNotes = useCallback(async () => {
    if (!employeeId) return;
    const { data, error } = await supabase.from("work_journal_notes").select("*").eq("employee_id", employeeId).order("created_at");
    if (error) toast.error("메모보드를 불러오지 못했습니다.");
    else setNotes((data ?? []) as BoardNote[]);
  }, [employeeId, supabase]);

  const loadWorkTasks = useCallback(async () => {
    if (!employeeId || !authUid) return;
    const [receivedResult, sentResult] = await Promise.all([
      supabase.from("work_status_tasks").select("*").eq("employee_id", employeeId).is("archived_at", null).order("sort_order").order("created_at"),
      supabase.from("work_status_tasks").select("*, employee:employees!work_status_tasks_employee_id_fkey(id, name, department)").eq("created_by", authUid).eq("list_type", "instruction").is("archived_at", null).order("created_at", { ascending: false }),
    ]);
    if (receivedResult.error || sentResult.error) {
      toast.error("업무 위젯을 불러오지 못했습니다.");
      return;
    }
    setWorkTasks((receivedResult.data ?? []) as WorkStatusTask[]);
    setSentRequests((sentResult.data ?? []) as SentRequest[]);
  }, [authUid, employeeId, supabase]);

  useEffect(() => {
    if (!employeeId) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void Promise.all([loadEntries(), loadNotes(), loadWorkTasks()]).finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [employeeId, loadEntries, loadNotes, loadWorkTasks]);

  const saveDay = async (key: string, content: string) => {
    if (!employeeId) return;
    const existingId = entryIdsRef.current.get(key);
    if (existingId) {
      const { error } = await supabase.from("work_journal_entries").update({ content, updated_at: new Date().toISOString() }).eq("id", existingId);
      if (error) toast.error("업무일지를 저장하지 못했습니다.");
    } else {
      const { data, error } = await supabase.from("work_journal_entries").insert({ employee_id: employeeId, journal_date: key, content }).select("*").single();
      if (error) toast.error("업무일지를 저장하지 못했습니다.");
      else if (data) entryIdsRef.current.set(key, (data as JournalEntry).id);
    }
  };

  const addRoutine = async (listType: WorkListType) => {
    if (!employeeId || !authUid) return;
    const title = (routineInput[listType] ?? "").trim();
    if (!title) return;
    const { data, error } = await supabase.from("work_status_tasks").insert({
      employee_id: employeeId,
      list_type: listType,
      title,
      detail: null,
      status: "미진행" as WorkStatusValue,
      progress: 0,
      due_date: null,
      sort_order: 0,
      created_by: authUid,
    }).select("*").single();
    if (error) toast.error("고정업무를 추가하지 못했습니다.");
    else {
      setWorkTasks((current) => [...current, data as WorkStatusTask]);
      setRoutineInput((current) => ({ ...current, [listType]: "" }));
    }
  };

  const toggleRoutine = async (task: WorkStatusTask) => {
    const checked = isRoutineChecked(task);
    const key = checked ? null : routinePeriodKey(task.list_type);
    const patch = {
      routine_checked_key: key,
      status: (checked ? "미진행" : "완료") as WorkStatusValue,
      progress: checked ? 0 : 100,
    };
    setWorkTasks((current) => current.map((item) => item.id === task.id ? { ...item, ...patch } : item));
    const { error } = await supabase.from("work_status_tasks").update(patch).eq("id", task.id);
    if (error) {
      toast.error("체크 상태를 저장하지 못했습니다.");
      void loadWorkTasks();
    }
  };

  const deleteRoutine = async (task: WorkStatusTask) => {
    const { error } = await supabase.from("work_status_tasks").delete().eq("id", task.id);
    if (error) toast.error("고정업무를 삭제하지 못했습니다.");
    else setWorkTasks((current) => current.filter((item) => item.id !== task.id));
  };

  const maybePromptSchedule = (day: Date, editor: HTMLDivElement) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.toString().trim()) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    const parsed = parseSelectedSchedule(selection.toString(), day);
    if (!parsed) return;
    const rect = range.getBoundingClientRect();
    setSchedulePrompt({
      x: Math.min(window.innerWidth - 300, Math.max(12, rect.left)),
      y: Math.min(window.innerHeight - 220, rect.bottom + 8),
      date: parsed.date,
      content: parsed.content,
      journalDate: dateKey(day),
    });
  };

  // execCommand 는 편집 대상이 포커스를 쥐고 있을 때만 동작하므로 focus -> range 복원 -> 실행 순서를 지킨다.
  const restoreSelection = () => {
    const editor = selectedEditorRef.current;
    const range = selectionRef.current;
    if (!editor || !range || range.collapsed) return null;
    editor.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return editor;
  };

  const applyTextFormat = (command: "fontSize" | "foreColor", value: string) => {
    setTextPaletteOpen(false);
    setSizeMenuOpen(false);
    const editor = restoreSelection();
    const journalDate = selectedDateRef.current;
    if (!editor || !journalDate) {
      toast.info("먼저 서식을 바꿀 글자를 드래그해 선택하세요.");
      return;
    }
    if (command === "fontSize") {
      // styleWithCSS 를 켜면 크롬이 <span style="font-size:xxx-large"> 를 만들어 px 지정이 먹지 않는다.
      // 꺼야 <font size="7"> 이 나오고, 그 자리에 원하는 px 를 직접 씌울 수 있다.
      document.execCommand("styleWithCSS", false, "false");
      document.execCommand("fontSize", false, "7");
      editor.querySelectorAll('font[size="7"]').forEach((element) => {
        (element as HTMLElement).style.fontSize = `${value}px`;
        element.removeAttribute("size");
      });
    } else {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand("foreColor", false, value);
    }
    const selection = window.getSelection();
    selectionRef.current = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    void saveDay(journalDate, editor.innerHTML);
  };

  const createSchedule = async () => {
    if (!employeeId || !schedulePrompt?.date || !schedulePrompt.content.trim()) return;
    setScheduleSaving(true);
    const { error } = await supabase.from("schedules").insert({
      title: schedulePrompt.content.trim().split("\n")[0].slice(0, 100),
      description: schedulePrompt.content.trim(),
      start_at: toLocalIso(schedulePrompt.date, 9),
      end_at: toLocalIso(schedulePrompt.date, 10),
      all_day: false,
      category: "other",
      recurrence_type: "none",
      created_by: employeeId,
    });
    if (error) toast.error("일정 등록에 실패했습니다.");
    else {
      const editor = restoreSelection();
      if (editor) {
        document.execCommand("styleWithCSS", false, "true");
        document.execCommand("hiliteColor", false, "#fef08a");
        await saveDay(schedulePrompt.journalDate, editor.innerHTML);
      }
      toast.success("워크스페이스 일정에 등록했습니다.");
      setSchedulePrompt(null);
      window.getSelection()?.removeAllRanges();
    }
    setScheduleSaving(false);
  };

  const addBoardNote = async () => {
    if (!employeeId) return;
    const offset = (notes.length % 6) * 24;
    const { data, error } = await supabase.from("work_journal_notes").insert({
      employee_id: employeeId, position_x: 20 + offset, position_y: 20 + offset,
      background_color: NOTE_COLORS[notes.length % NOTE_COLORS.length],
    }).select("*").single();
    if (error) toast.error("메모지를 만들지 못했습니다.");
    else { setNotes((current) => [...current, data as BoardNote]); setShowArchive(false); }
  };

  const updateNote = async (id: string, patch: Partial<BoardNote>, quiet = false) => {
    setNotes((current) => current.map((note) => note.id === id ? { ...note, ...patch } : note));
    const { error } = await supabase.from("work_journal_notes").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error && !quiet) toast.error("메모지를 저장하지 못했습니다.");
  };

  const removeNote = async (id: string) => {
    if (!window.confirm("이 메모지를 삭제할까요?")) return;
    const { error } = await supabase.from("work_journal_notes").delete().eq("id", id);
    if (error) toast.error("메모지를 삭제하지 못했습니다.");
    else setNotes((current) => current.filter((note) => note.id !== id));
  };

  const startNotePointer = (event: React.PointerEvent, note: BoardNote, mode: "move" | "resize") => {
    if (!boardRef.current) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const initial = { ...note };
    let finalPosition = { ...initial };
    const board = boardRef.current;
    const onMove = (pointer: PointerEvent) => {
      const dx = pointer.clientX - startX;
      const dy = pointer.clientY - startY;
      if (mode === "move") {
        finalPosition = { ...finalPosition,
          position_x: Math.max(0, Math.min(Math.max(0, board.clientWidth - initial.width), initial.position_x + dx)),
          position_y: Math.max(0, Math.min(Math.max(0, board.clientHeight - initial.height), initial.position_y + dy)),
        };
      } else {
        finalPosition = { ...finalPosition,
          width: Math.max(160, Math.min(board.clientWidth - initial.position_x, initial.width + dx)),
          height: Math.max(120, Math.min(board.clientHeight - initial.position_y, initial.height + dy)),
        };
      }
      setNotes((current) => current.map((item) => item.id === note.id ? { ...item, ...finalPosition } : item));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      void updateNote(note.id, mode === "move"
        ? { position_x: finalPosition.position_x, position_y: finalPosition.position_y }
        : { width: finalPosition.width, height: finalPosition.height }, true);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  const renderDay = (day: Date, weekend = false) => {
    const entry = entries.find((item) => item.journal_date === dateKey(day));
    return (
      <section key={dateKey(day)} className={cn(
        "flex min-h-0 flex-col bg-[radial-gradient(circle_at_1px_1px,rgba(100,116,139,0.12)_1px,transparent_0)] [background-size:18px_18px]",
        weekend ? "min-h-[175px]" : "min-h-[380px]"
      )}>
        <div className="border-b border-primary/45 px-3 py-2">
          <strong className={cn("text-2xl font-semibold text-primary", day.getDay() === 0 && "text-rose-500", day.getDay() === 6 && "text-blue-500")}>{format(day, "dd")}</strong>
          <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">{format(day, "EEE", { locale: ko })}</span>
        </div>
        <div
          contentEditable
          suppressContentEditableWarning
          data-journal-date={dateKey(day)}
          onFocus={(event) => {
            selectedEditorRef.current = event.currentTarget;
            selectedDateRef.current = dateKey(day);
            restoreEmptyParagraph(event.currentTarget);
          }}
          onInput={(event) => restoreEmptyParagraph(event.currentTarget)}
          onMouseUp={(event) => maybePromptSchedule(day, event.currentTarget)}
          onKeyUp={(event) => maybePromptSchedule(day, event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.shiftKey) {
              event.preventDefault();
              document.execCommand("insertLineBreak");
              return;
            }
            if (event.key === "Enter") {
              const selection = window.getSelection();
              const anchor = selection?.anchorNode;
              const element = anchor instanceof Element ? anchor : anchor?.parentElement;
              if (!element?.closest("li, div[contenteditable] > div")) document.execCommand("formatBlock", false, "div");
            }
          }}
          onBlur={(event) => void saveDay(dateKey(day), event.currentTarget.innerHTML)}
          dangerouslySetInnerHTML={{ __html: editorHtml(entry?.content ?? "") }}
          className={cn(
            "min-h-0 flex-1 cursor-text overflow-y-auto p-3 text-[14px] leading-relaxed text-slate-700 outline-none",
            // li 가 남아 있어도 div 문단과 같은 문단기호로 보이도록 마커 대신 ::before 로 통일한다.
            "[&_ul]:m-0 [&_ul]:list-none [&_ul]:p-0 [&_ol]:m-0 [&_ol]:list-none [&_ol]:p-0",
            "[&>div]:relative [&>div]:min-h-[1.5em] [&>div]:pl-4 [&>div]:before:absolute [&>div]:before:left-0 [&>div]:before:text-[14px] [&>div]:before:content-['•']",
            "[&_li]:relative [&_li]:min-h-[1.5em] [&_li]:pl-4 [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:text-[14px] [&_li]:before:content-['•']",
            "focus:bg-white/25"
          )}
        />
      </section>
    );
  };

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col gap-3 pb-2">
      <header className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Weekly work journal</p>
          <h1 className="page-title-gradient text-xl font-semibold tracking-tight">업무일지</h1>
          <p className="text-xs text-muted-foreground">기록할 글자를 선택하면 서식을 바꾸거나 일정으로 등록할 수 있습니다.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { const today = new Date(); setWeekStart(startOfWeek(today, { weekStartsOn: 1 })); setCalendarMonth(startOfMonth(today)); }}><RotateCcw className="mr-1.5 h-4 w-4" />이번 주</Button>
      </header>

      <ResizablePanelGroup orientation="horizontal" className="min-h-[880px] flex-1">
        <ResizablePanel defaultSize={62} minSize={42}>
          <div className="h-full min-w-0 pr-1.5">
          <ResizablePanelGroup orientation="vertical" className="h-full">
          <ResizablePanel defaultSize={58} minSize={34}>
        <div className="surface-panel flex h-full min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-border/60 bg-card/80 shadow-sm backdrop-blur">
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border/60 p-3">
            <MiniCalendar month={calendarMonth} selected={weekStart} onMonthChange={setCalendarMonth} onSelect={(date) => { setWeekStart(startOfWeek(date, { weekStartsOn: 1 })); setCalendarMonth(startOfMonth(date)); }} />
            <div className="grid min-w-[390px] flex-1 grid-cols-3 gap-2 self-stretch">
              {ROUTINE_LISTS.map((list) => {
                const items = workTasks.filter((task) => task.list_type === list.key);
                return (
                  <div key={list.key} className="rounded-xl border border-border/60 bg-white/55 p-2">
                    <p className="mb-1.5 text-[10px] font-semibold text-primary">{list.label} 업무</p>
                    <div className="max-h-20 space-y-1 overflow-y-auto">
                      {items.map((task) => (
                        <div key={task.id} className="group flex items-center gap-1.5">
                          <Checkbox checked={isRoutineChecked(task)} onCheckedChange={() => void toggleRoutine(task)} className="h-3.5 w-3.5" />
                          <span className={cn("min-w-0 flex-1 truncate text-[11px]", isRoutineChecked(task) && "text-muted-foreground line-through")}>{task.title}</span>
                          <button type="button" onClick={() => void deleteRoutine(task)} className="opacity-0 group-hover:opacity-60" aria-label="고정업무 삭제"><X className="h-3 w-3" /></button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-1.5 flex gap-1">
                      <Input value={routineInput[list.key] ?? ""} onChange={(event) => setRoutineInput((current) => ({ ...current, [list.key]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") void addRoutine(list.key); }} placeholder="업무 추가" className="h-6 min-w-0 px-1.5 text-[10px]" />
                      <button type="button" onClick={() => void addRoutine(list.key)} className="rounded-md bg-primary px-1.5 text-primary-foreground" aria-label={`${list.label} 업무 추가`}><Plus className="h-3 w-3" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex min-w-[250px] flex-1 flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart((date) => subWeeks(date, 1))} aria-label="이전 주"><ChevronLeft className="h-4 w-4" /></Button>
                <div className="min-w-44 text-center"><p className="text-[10px] text-muted-foreground">{format(weekStart, "yyyy년", { locale: ko })}</p><h2 className="text-sm font-semibold">{format(weekStart, "M월 d일")} – {format(addDays(weekStart, 6), "M월 d일")}</h2></div>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart((date) => addWeeks(date, 1))} aria-label="다음 주"><ChevronRight className="h-4 w-4" /></Button>
              </div>
              {/* 네이티브 select 는 mousedown 기본 동작으로 목록을 열기 때문에, 선택 영역을 지키려고 건 preventDefault 에
                  막혀 아예 열리지 않는다. 버튼 드롭다운으로 대체한다. */}
              <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-white/70 p-1" onMouseDown={(event) => event.preventDefault()}>
                <Type className="mx-1 h-4 w-4 text-muted-foreground" />
                <div className="relative">
                  <button type="button" onClick={() => { setSizeMenuOpen((open) => !open); setTextPaletteOpen(false); }} className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs hover:bg-muted" aria-label="선택 글자 크기">{fontSize}px<ChevronDown className="h-3 w-3 opacity-60" /></button>
                  {sizeMenuOpen ? <div className="absolute left-1/2 top-9 z-40 flex -translate-x-1/2 flex-col rounded-xl border bg-popover p-1 shadow-md">{FONT_SIZES.map((size) => <button type="button" key={size} onClick={() => { setFontSize(size); applyTextFormat("fontSize", String(size)); }} className={cn("rounded-md px-3 py-1 text-xs hover:bg-muted", size === fontSize && "bg-muted font-semibold")}>{size}px</button>)}</div> : null}
                </div>
                <div className="relative">
                  <button type="button" onClick={() => { setTextPaletteOpen((open) => !open); setSizeMenuOpen(false); }} className="rounded-lg p-1.5 hover:bg-muted" title="선택 글자 색상"><Palette className="h-4 w-4" /></button>
                  {textPaletteOpen ? <div className="absolute left-1/2 top-9 z-40 flex -translate-x-1/2 gap-1 rounded-xl border bg-popover p-2 shadow-md">{TEXT_COLORS.map((color) => <button type="button" key={color} onClick={() => applyTextFormat("foreColor", color)} className="h-5 w-5 rounded-full ring-1 ring-black/10 hover:scale-110" style={{ backgroundColor: color }} aria-label={`글자색 ${color}`} />)}</div> : null}
                </div>
                <span className="px-1 text-[10px] text-muted-foreground">글자를 드래그해 적용</span>
              </div>
            </div>
          </div>
          {loading ? <div className="p-12 text-center text-sm text-muted-foreground">업무일지를 불러오는 중...</div> : (
            <div className="min-h-0 flex-1 overflow-x-auto">
              <div className="grid h-full min-w-[900px] grid-cols-6 divide-x divide-primary/35">
                {weekDays.slice(0, 5).map((day) => renderDay(day))}
                <div className="grid grid-rows-2 divide-y divide-primary/35">{renderDay(weekDays[5], true)}{renderDay(weekDays[6], true)}</div>
              </div>
            </div>
          )}
        </div>

          </ResizablePanel>
          <ResizableHandle withHandle className="my-1.5" />
          <ResizablePanel defaultSize={42} minSize={22}>

        <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-2">
          <div className="flex min-h-0 flex-col rounded-[1.25rem] border border-border/60 bg-card/80 p-3">
            <div className="mb-2 flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">마감기한 업무 · 요청받은 업무</h3>
              <span className="text-xs text-muted-foreground">({workTasks.filter((task) => task.list_type === "deadline" || task.list_type === "instruction").length})</span>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {workTasks.filter((task) => task.list_type === "deadline" || task.list_type === "instruction").length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">표시할 마감·요청 업무가 없습니다.</p>
              ) : workTasks.filter((task) => task.list_type === "deadline" || task.list_type === "instruction").map((task) => (
                <DeadlineTaskItem key={task.id} task={task} canEdit onDeleted={(id) => setWorkTasks((current) => current.filter((item) => item.id !== id))} onArchived={(id) => setWorkTasks((current) => current.filter((item) => item.id !== id))} />
              ))}
            </div>
          </div>
          <div className="min-h-0 overflow-y-auto [&>div]:h-full">
            <RequestSentBoard requests={sentRequests} />
          </div>
        </div>
          </ResizablePanel>
          </ResizablePanelGroup>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="mx-1.5" />

        <ResizablePanel defaultSize={38} minSize={25}>

        <div className="surface-panel flex h-full min-h-[760px] min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-border/60 bg-card/80 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
            <div><h2 className="font-semibold">자유 메모보드</h2><p className="text-xs text-muted-foreground">메모지를 자유롭게 붙이고 정리하세요.</p></div>
            <div className="flex items-center gap-2">
              <Button variant={showArchive ? "secondary" : "outline"} size="sm" onClick={() => setShowArchive((value) => !value)}>{showArchive ? <ArchiveRestore className="mr-1.5 h-4 w-4" /> : <Archive className="mr-1.5 h-4 w-4" />}{showArchive ? "보드로" : "보관함"}</Button>
              <Button size="sm" onClick={() => void addBoardNote()}><Plus className="mr-1.5 h-4 w-4" />메모지</Button>
            </div>
          </div>
          <div ref={boardRef} className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_1px_1px,rgba(100,116,139,0.16)_1px,transparent_0)] [background-size:22px_22px]">
            {visibleNotes.length === 0 ? <button type="button" onClick={() => void addBoardNote()} className="absolute inset-0 m-auto flex h-32 w-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary/50 hover:bg-primary/5"><Plus className="mb-2 h-6 w-6" />{showArchive ? "보관한 메모가 없습니다" : "첫 메모지를 붙여보세요"}</button> : null}
            {visibleNotes.map((note) => (
              <article key={note.id} className="absolute flex flex-col overflow-visible rounded-md shadow-[0_3px_9px_rgba(15,23,42,0.16)] ring-1 ring-black/5" style={{ left: note.position_x, top: note.position_y, width: note.width, height: note.height, backgroundColor: note.background_color }}>
                <div className="flex cursor-grab items-center justify-between border-b border-black/5 px-2 py-1.5 active:cursor-grabbing" onPointerDown={(event) => startNotePointer(event, note, "move")}>
                  <GripHorizontal className="h-4 w-4 opacity-30" />
                  <div className="flex items-center gap-0.5" onPointerDown={(event) => event.stopPropagation()}>
                    <div className="relative">
                      <button type="button" onClick={() => setNotePaletteId((id) => id === note.id ? null : note.id)} className="rounded p-1 hover:bg-black/5" title="메모지 색상"><Palette className="h-3.5 w-3.5" /></button>
                      {notePaletteId === note.id ? (
                        <div className="absolute right-0 top-7 z-50 w-40 rounded-xl border bg-white p-2 shadow-md">
                          <p className="mb-1 text-[10px] text-muted-foreground">메모지 색상</p><div className="flex gap-1">{NOTE_COLORS.map((color) => <button type="button" key={color} onClick={() => { void updateNote(note.id, { background_color: color }); setNotePaletteId(null); }} className="h-5 w-5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: color }} />)}</div>
                          <p className="mb-1 mt-2 text-[10px] text-muted-foreground">글자 색상</p><div className="flex gap-1">{TEXT_COLORS.map((color) => <button type="button" key={color} onClick={() => { void updateNote(note.id, { text_color: color }); setNotePaletteId(null); }} className="h-5 w-5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: color }} />)}</div>
                        </div>
                      ) : null}
                    </div>
                    <button type="button" onClick={() => void updateNote(note.id, { is_archived: !note.is_archived })} className="rounded p-1 hover:bg-black/5" title={note.is_archived ? "복원" : "보관"}>{note.is_archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}</button>
                    <button type="button" onClick={() => void removeNote(note.id)} className="rounded p-1 hover:bg-rose-500/10 hover:text-rose-700" title="삭제"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <textarea value={note.content} onChange={(event) => setNotes((current) => current.map((item) => item.id === note.id ? { ...item, content: event.target.value } : item))} onBlur={(event) => void updateNote(note.id, { content: event.target.value })} placeholder="간단한 메모를 적어보세요..." className="min-h-0 flex-1 resize-none bg-transparent p-3 leading-relaxed outline-none placeholder:text-current placeholder:opacity-30" style={{ fontSize: note.font_size, color: note.text_color }} />
                <div className="flex items-end justify-between border-t border-black/5 p-1.5">
                  <select aria-label="메모 글자 크기" value={note.font_size} onChange={(event) => void updateNote(note.id, { font_size: Number(event.target.value) })} className="h-6 rounded-md bg-white/45 px-1 text-[10px] outline-none">{FONT_SIZES.map((size) => <option key={size} value={size}>{size}px</option>)}</select>
                  <button type="button" onPointerDown={(event) => startNotePointer(event, note, "resize")} className="cursor-nwse-resize rounded p-1 opacity-35 hover:bg-black/5 hover:opacity-70" aria-label="메모지 크기 조절"><Maximize2 className="h-4 w-4" /></button>
                </div>
              </article>
            ))}
          </div>
        </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {schedulePrompt ? (
        <div className="fixed z-[80] w-[288px] rounded-2xl border border-primary/30 bg-white p-3 shadow-lg" style={{ left: schedulePrompt.x, top: schedulePrompt.y }}>
          <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-1.5 text-sm font-semibold text-primary"><CalendarCheck className="h-4 w-4" />일정 등록</div><button type="button" onClick={() => setSchedulePrompt(null)} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button></div>
          <label className="block text-[10px] font-medium text-muted-foreground">날짜<input type="date" value={schedulePrompt.date} onChange={(event) => setSchedulePrompt((current) => current ? { ...current, date: event.target.value } : null)} className="mt-1 h-8 w-full rounded-lg border px-2 text-xs text-foreground" /></label>
          <label className="mt-2 block text-[10px] font-medium text-muted-foreground">내용<textarea value={schedulePrompt.content} onChange={(event) => setSchedulePrompt((current) => current ? { ...current, content: event.target.value } : null)} className="mt-1 min-h-16 w-full resize-none rounded-lg border p-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary" /></label>
          <div className="mt-2 flex justify-end gap-1.5"><Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSchedulePrompt(null)}>취소</Button><Button size="sm" className="h-7 text-xs" disabled={scheduleSaving} onClick={() => void createSchedule()}>{scheduleSaving ? "등록 중" : "확인"}</Button></div>
        </div>
      ) : null}
    </div>
  );
}
