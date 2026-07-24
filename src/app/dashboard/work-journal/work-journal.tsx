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
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  GripHorizontal,
  Maximize2,
  Megaphone,
  MoveDown,
  MoveUp,
  Palette,
  Plus,
  RotateCcw,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GroupImperativeHandle, Layout } from "react-resizable-panels";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeadlineTaskItem } from "@/app/dashboard/work-status/[id]/deadline-task-item";
import { RequestAssignPanel } from "@/app/dashboard/work-status/[id]/request-assign-panel";
import { RequestSentBoard, type SentRequest } from "@/app/dashboard/work-status/[id]/request-sent-board";
import { isRoutineChecked, routinePeriodKey } from "@/lib/routine-period";
import { createClient } from "@/lib/supabase/client";
import type { WorkListType, WorkStatusTask, WorkStatusValue } from "@/lib/types";
import { canAssignRequestByPosition, DEFAULT_REQUEST_MIN_POSITION, REQUEST_MIN_POSITION_KEY } from "@/lib/work-status";
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
  image_paths: string[];
  z_index: number;
};

type BoardImage = {
  id: string;
  employee_id: string;
  storage_path: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  public_url?: string;
  z_index: number;
};

type SchedulePrompt = {
  x: number;
  y: number;
  date: string;
  content: string;
  journalDate: string;
  markerId: string;
};

type FormatBubble = {
  x: number;
  y: number;
  journalDate: string;
  schedule: { date: string; content: string } | null;
};

const NOTE_COLORS = ["#fef3c7", "#dbeafe", "#dcfce7", "#fce7f3", "#ede9fe", "#f1f5f9"];
const TEXT_COLORS = ["#334155", "#0f766e", "#1d4ed8", "#7e22ce", "#be123c", "#111827"];
const FONT_SIZES = [12, 14, 16, 18, 22, 26];
// work_journal_notes 의 CHECK 제약과 같은 범위를 써야 저장이 거부되지 않는다.
const NOTE_MIN_WIDTH = 160;
const NOTE_MIN_HEIGHT = 120;
const NOTE_MAX_SIZE = 2400;
const NOTE_IMAGE_BUCKET = "work-journal-images";
const MAX_NOTE_IMAGE_BYTES = 10 * 1024 * 1024;
const NO_AUTH_UID = "00000000-0000-0000-0000-000000000000";
const MAIN_PANEL_LAYOUT_KEY = "work-journal-main-panels-v4";
const WEEKLY_PANEL_LAYOUT_KEY = "work-journal-weekly-panels-v4";
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

function insertPlainParagraphAfterHighlight(editor: HTMLDivElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return false;
  const anchor = selection.anchorNode;
  if (!anchor) return false;

  let highlight: HTMLElement | null = null;
  const anchorElement = anchor instanceof Element ? anchor : anchor.parentElement;
  highlight = anchorElement?.closest<HTMLElement>('span[style*="background-color"]') ?? null;

  // 커서가 형광펜 span 바로 뒤에 있으면 anchor 는 부모 문단이므로 이전 노드도 확인한다.
  if (!highlight && anchor instanceof Element && selection.anchorOffset > 0) {
    const previous = anchor.childNodes[selection.anchorOffset - 1];
    const previousElement = previous instanceof HTMLElement ? previous : previous?.parentElement;
    highlight = previousElement?.closest<HTMLElement>('span[style*="background-color"]') ?? null;
  }
  if (!highlight || !editor.contains(highlight)) return false;

  let paragraph: HTMLElement = highlight;
  while (paragraph.parentElement && paragraph.parentElement !== editor) paragraph = paragraph.parentElement;

  const nextParagraph = document.createElement("div");
  nextParagraph.innerHTML = "<br>";
  paragraph.insertAdjacentElement("afterend", nextParagraph);

  const range = document.createRange();
  range.selectNodeContents(nextParagraph);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

// document.execCommand 는 편집 대상이 포커스를 쥐고 있어야 하고 styleWithCSS 동작도 브라우저마다 달라
// 서식이 조용히 무시되곤 한다. 선택 영역의 텍스트 노드를 직접 <span> 으로 감싸 확실하게 서식을 입힌다.
// 새로 만들어진 선택 영역을 돌려주므로 호출한 쪽에서 드래그 상태를 이어갈 수 있다.
function styleRange(range: Range, styler: (span: HTMLSpanElement) => void) {
  if (range.collapsed) return null;

  // 끝을 먼저 잘라야 시작 오프셋이 밀리지 않는다. splitText 는 살아 있는 Range 를 알아서 보정한다.
  const end = range.endContainer;
  if (end.nodeType === Node.TEXT_NODE && range.endOffset < (end as Text).data.length) {
    (end as Text).splitText(range.endOffset);
  }
  const start = range.startContainer;
  if (start.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
    const tail = (start as Text).splitText(range.startOffset);
    range.setStart(tail, 0);
    if (start === end) range.setEnd(tail, tail.data.length);
  }

  const root = range.commonAncestorContainer;
  const targets: Text[] = [];
  if (root.nodeType === Node.TEXT_NODE) {
    targets.push(root as Text);
  } else {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text;
      // 경계를 잘라뒀으므로 선택에 걸친 텍스트 노드는 통째로 안에 들어온다.
      if (text.data && range.comparePoint(text, 0) === 0 && range.comparePoint(text, text.data.length) === 0) targets.push(text);
    }
  }
  if (targets.length === 0) return null;

  const wrapped = targets.map((text) => {
    const parent = text.parentElement;
    // 이 글자만 감싸고 있는 span 이면 새로 만들지 않고 스타일만 덧입힌다.
    if (parent && parent !== root && parent.tagName === "SPAN" && parent.childNodes.length === 1) {
      styler(parent as HTMLSpanElement);
      return parent;
    }
    const span = document.createElement("span");
    styler(span);
    text.replaceWith(span);
    span.append(text);
    return span;
  });

  const next = document.createRange();
  next.setStartBefore(wrapped[0]);
  next.setEndAfter(wrapped[wrapped.length - 1]);
  return next;
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

export function WorkJournal({ targetEmployeeId }: { targetEmployeeId?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const boardRef = useRef<HTMLDivElement>(null);
  const entryIdsRef = useRef(new Map<string, string>());
  const entryContentsRef = useRef(new Map<string, string>());
  const selectionRef = useRef<Range | null>(null);
  const selectedEditorRef = useRef<HTMLDivElement | null>(null);
  const selectedDateRef = useRef<string | null>(null);
  const mainPanelGroupRef = useRef<GroupImperativeHandle | null>(null);
  const weeklyPanelGroupRef = useRef<GroupImperativeHandle | null>(null);
  const panelLayoutsReadyRef = useRef(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState<string | null>(null);
  const [actorAuthUid, setActorAuthUid] = useState<string | null>(null);
  const [ownerAuthUid, setOwnerAuthUid] = useState<string | null>(null);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestEmployees, setRequestEmployees] = useState<Array<{ id: string; name: string; department: string | null }>>([]);
  const [requestDepartment, setRequestDepartment] = useState<string | null>(null);
  const [requestMinPosition, setRequestMinPosition] = useState(DEFAULT_REQUEST_MIN_POSITION);
  const [canAssignRequests, setCanAssignRequests] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [notes, setNotes] = useState<BoardNote[]>([]);
  const [boardImages, setBoardImages] = useState<BoardImage[]>([]);
  const [workTasks, setWorkTasks] = useState<WorkStatusTask[]>([]);
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([]);
  const [routineInput, setRoutineInput] = useState<Record<string, string>>({});
  const [showArchive, setShowArchive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bubble, setBubble] = useState<FormatBubble | null>(null);
  const [notePaletteId, setNotePaletteId] = useState<string | null>(null);
  const [uploadingBoardImage, setUploadingBoardImage] = useState(false);
  const [schedulePrompt, setSchedulePrompt] = useState<SchedulePrompt | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const saveMainPanelLayout = useCallback((layout: Layout) => {
    if (panelLayoutsReadyRef.current) window.localStorage.setItem(MAIN_PANEL_LAYOUT_KEY, JSON.stringify(layout));
  }, []);
  const saveWeeklyPanelLayout = useCallback((layout: Layout) => {
    if (panelLayoutsReadyRef.current) window.localStorage.setItem(WEEKLY_PANEL_LAYOUT_KEY, JSON.stringify(layout));
  }, []);

  useEffect(() => {
    const restore = (key: string, panelIds: string[], group: GroupImperativeHandle | null) => {
      const saved = window.localStorage.getItem(key);
      if (!saved || !group) return;
      try {
        const layout = JSON.parse(saved) as Layout;
        if (panelIds.every((id) => Number.isFinite(layout[id]) && layout[id] > 0)) group.setLayout(layout);
      } catch {
        window.localStorage.removeItem(key);
      }
    };
    restore(MAIN_PANEL_LAYOUT_KEY, ["weekly-work-area", "free-memo-board"], mainPanelGroupRef.current);
    restore(WEEKLY_PANEL_LAYOUT_KEY, ["weekly-journal", "work-status-widgets"], weeklyPanelGroupRef.current);
    panelLayoutsReadyRef.current = true;
  }, []);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const visibleNotes = useMemo(() => notes.filter((note) => note.is_archived === showArchive), [notes, showArchive]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      setActorAuthUid(auth.user.id);
      const { data: current, error } = await supabase.from("employees").select("id, name, employee_type, auth_uid, department, position").eq("auth_uid", auth.user.id).single();
      if (!active) return;
      if (error || !current) {
        toast.error("직원 정보를 확인할 수 없습니다.");
        return;
      }
      setRequestDepartment(current.department);
      const { data: setting } = await supabase.from("system_settings").select("value").eq("key", REQUEST_MIN_POSITION_KEY).maybeSingle();
      const minPosition = setting?.value || DEFAULT_REQUEST_MIN_POSITION;
      const allowed = current.employee_type === "관리자" || canAssignRequestByPosition(current.position, minPosition);
      setRequestMinPosition(minPosition);
      setCanAssignRequests(allowed);
      if (allowed) {
        const { data: employees } = await supabase.from("employees").select("id, name, department, is_active").order("name");
        if (active) setRequestEmployees((employees ?? []).filter((employee) => employee.is_active !== false).map(({ id, name, department }) => ({ id, name, department })));
      }
      if (!targetEmployeeId || targetEmployeeId === current.id) {
        setEmployeeId(current.id);
        setEmployeeName(current.name);
        setOwnerAuthUid(current.auth_uid ?? NO_AUTH_UID);
        return;
      }
      if (current.employee_type !== "관리자") {
        toast.error("다른 직원의 업무일지는 관리자만 확인할 수 있습니다.");
        setEmployeeId(current.id);
        setEmployeeName(current.name);
        setOwnerAuthUid(current.auth_uid ?? NO_AUTH_UID);
        return;
      }
      const { data: target } = await supabase.from("employees").select("id, name, auth_uid").eq("id", targetEmployeeId).maybeSingle();
      if (!active) return;
      if (!target) {
        toast.error("선택한 직원을 찾을 수 없습니다.");
        return;
      }
      setEmployeeId(target.id);
      setEmployeeName(target.name);
      setOwnerAuthUid(target.auth_uid ?? NO_AUTH_UID);
    })();
    return () => { active = false; };
  }, [supabase, targetEmployeeId]);

  // 드래그가 에디터 밖에서 끝나도 선택 영역을 붙잡아 둔다. 선택이 풀리면 서식 팝업도 닫는다.
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
      if (range.collapsed) setBubble(null);
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  const goToWeek = useCallback((date: Date) => {
    setLoading(true);
    setWeekStart(startOfWeek(date, { weekStartsOn: 1 }));
    setBubble(null);
  }, []);

  const loadEntries = useCallback(async () => {
    if (!employeeId) return;
    const { data, error } = await supabase.from("work_journal_entries").select("*").eq("employee_id", employeeId)
      .gte("journal_date", dateKey(weekStart)).lte("journal_date", dateKey(addDays(weekStart, 6))).order("created_at");
    if (error) toast.error("주간 업무일지를 불러오지 못했습니다.");
    else {
      const loaded = ((data ?? []) as JournalEntry[]).map((entry) => ({ ...entry, content: paragraphsFromLists(entry.content) }));
      entryIdsRef.current = new Map(loaded.map((entry) => [entry.journal_date, entry.id]));
      entryContentsRef.current = new Map(loaded.map((entry) => [entry.journal_date, entry.content]));
      setEntries(loaded);
    }
  }, [employeeId, supabase, weekStart]);

  const loadNotes = useCallback(async () => {
    if (!employeeId) return;
    const { data, error } = await supabase.from("work_journal_notes").select("*").eq("employee_id", employeeId).order("created_at");
    if (error) toast.error("메모보드를 불러오지 못했습니다.");
    else setNotes((data ?? []) as BoardNote[]);
  }, [employeeId, supabase]);

  const loadBoardImages = useCallback(async () => {
    if (!employeeId) return;
    const { data, error } = await supabase.from("work_journal_board_images").select("*").eq("employee_id", employeeId).order("created_at");
    if (error) {
      toast.error("메모보드 이미지를 불러오지 못했습니다.");
      return;
    }
    setBoardImages(((data ?? []) as BoardImage[]).map((image) => ({
      ...image,
      public_url: supabase.storage.from(NOTE_IMAGE_BUCKET).getPublicUrl(image.storage_path).data.publicUrl,
    })));
  }, [employeeId, supabase]);

  const loadWorkTasks = useCallback(async () => {
    if (!employeeId || !ownerAuthUid) return;
    const [receivedResult, sentResult] = await Promise.all([
      supabase.from("work_status_tasks").select("*").eq("employee_id", employeeId).is("archived_at", null).is("recipient_deleted_at", null).order("sort_order").order("created_at"),
      supabase.from("work_status_tasks").select("*, employee:employees!work_status_tasks_employee_id_fkey(id, name, department)").eq("created_by", ownerAuthUid).eq("list_type", "instruction").neq("employee_id", employeeId).is("requester_hidden_at", null).order("created_at", { ascending: false }),
    ]);
    if (receivedResult.error || sentResult.error) {
      toast.error("업무 위젯을 불러오지 못했습니다.");
      return;
    }
    setWorkTasks((receivedResult.data ?? []) as WorkStatusTask[]);
    setSentRequests((sentResult.data ?? []) as SentRequest[]);
  }, [employeeId, ownerAuthUid, supabase]);

  // 주를 옮기면 업무일지만 다시 읽는다. 메모보드까지 같이 불러오면 옮겨둔 메모지가 매번 다시 그려진다.
  useEffect(() => {
    if (!employeeId) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void loadEntries().finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [employeeId, loadEntries]);

  useEffect(() => {
    if (!employeeId) return;
    let active = true;
    queueMicrotask(() => { if (active) void Promise.all([loadNotes(), loadBoardImages()]); });
    return () => { active = false; };
  }, [employeeId, loadBoardImages, loadNotes]);

  useEffect(() => {
    if (!employeeId || !ownerAuthUid) return;
    let active = true;
    queueMicrotask(() => { if (active) void loadWorkTasks(); });
    return () => { active = false; };
  }, [employeeId, loadWorkTasks, ownerAuthUid]);

  const saveDay = async (key: string, content: string) => {
    if (!employeeId) return false;
    entryContentsRef.current.set(key, content);
    const existingId = entryIdsRef.current.get(key);
    if (existingId) {
      const { error } = await supabase.from("work_journal_entries").update({ content, updated_at: new Date().toISOString() }).eq("id", existingId);
      if (error) {
        toast.error("업무일지를 저장하지 못했습니다.");
        return false;
      }
    } else {
      const { data, error } = await supabase.from("work_journal_entries").insert({ employee_id: employeeId, journal_date: key, content }).select("*").single();
      if (error?.code === "23505") {
        const { data: existing, error: findError } = await supabase.from("work_journal_entries").select("id").eq("employee_id", employeeId).eq("journal_date", key).single();
        if (!existing || findError) {
          toast.error("업무일지를 저장하지 못했습니다.");
          return false;
        }
        entryIdsRef.current.set(key, existing.id);
        const { error: updateError } = await supabase.from("work_journal_entries").update({ content, updated_at: new Date().toISOString() }).eq("id", existing.id);
        if (updateError) {
          toast.error("업무일지를 저장하지 못했습니다.");
          return false;
        }
      } else if (error) {
        toast.error("업무일지를 저장하지 못했습니다.");
        return false;
      } else if (data) {
        entryIdsRef.current.set(key, (data as JournalEntry).id);
      }
    }
    return true;
  };

  const addRoutine = async (listType: WorkListType) => {
    if (!employeeId || !actorAuthUid) return;
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
      created_by: actorAuthUid,
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

  // 드래그가 끝나면 선택 글자 바로 옆에 서식 팝업을 띄운다. 날짜가 섞여 있으면 일정 등록 버튼도 함께 보여준다.
  const showFormatBubble = (day: Date, editor: HTMLDivElement) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.toString().trim()) {
      setBubble(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    const rect = range.getBoundingClientRect();
    setBubble({
      x: Math.min(window.innerWidth - 312, Math.max(12, rect.left)),
      y: Math.min(window.innerHeight - 96, rect.bottom + 8),
      journalDate: dateKey(day),
      schedule: parseSelectedSchedule(selection.toString(), day),
    });
    entryContentsRef.current.set(dateKey(day), editor.innerHTML);
  };

  const applyFormat = (styler: (span: HTMLSpanElement) => void) => {
    const editor = selectedEditorRef.current;
    const range = selectionRef.current;
    const journalDate = selectedDateRef.current;
    if (!editor || !range || range.collapsed || !journalDate) {
      toast.info("먼저 서식을 바꿀 글자를 드래그해 선택하세요.");
      return;
    }
    const next = styleRange(range, styler);
    if (next) {
      selectionRef.current = next.cloneRange();
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(next);
    }
    entryContentsRef.current.set(journalDate, editor.innerHTML);
    void saveDay(journalDate, editor.innerHTML);
  };

  const openSchedulePrompt = (formatBubble: FormatBubble) => {
    const editor = selectedEditorRef.current;
    const range = selectionRef.current;
    const schedule = formatBubble.schedule;
    if (!editor || !range || range.collapsed || !schedule) return;
    const markerId = crypto.randomUUID();
    const markedRange = styleRange(range, (span) => { span.dataset.scheduleMarker = markerId; });
    if (markedRange) selectionRef.current = markedRange.cloneRange();
    entryContentsRef.current.set(formatBubble.journalDate, editor.innerHTML);
    void saveDay(formatBubble.journalDate, editor.innerHTML);
    setSchedulePrompt({
      x: formatBubble.x,
      y: formatBubble.y,
      journalDate: formatBubble.journalDate,
      markerId,
      ...schedule,
    });
    setBubble(null);
  };

  const clearScheduleMarker = (prompt: SchedulePrompt) => {
    const editor = selectedEditorRef.current;
    if (!editor) return;
    editor.querySelectorAll<HTMLElement>(`[data-schedule-marker="${prompt.markerId}"]`).forEach((marker) => {
      marker.removeAttribute("data-schedule-marker");
      if (!marker.getAttribute("style")) marker.replaceWith(...Array.from(marker.childNodes));
    });
    entryContentsRef.current.set(prompt.journalDate, editor.innerHTML);
    void saveDay(prompt.journalDate, editor.innerHTML);
  };

  const cancelSchedulePrompt = () => {
    if (schedulePrompt) clearScheduleMarker(schedulePrompt);
    setSchedulePrompt(null);
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
      const editor = selectedEditorRef.current;
      let lastHighlight: HTMLElement | null = null;
      if (editor) {
        editor.querySelectorAll<HTMLElement>(`[data-schedule-marker="${schedulePrompt.markerId}"]`).forEach((marker) => {
          marker.style.backgroundColor = "#fef08a";
          marker.style.borderRadius = "0.2em";
          marker.removeAttribute("data-schedule-marker");
          lastHighlight = marker;
        });
        entryContentsRef.current.set(schedulePrompt.journalDate, editor.innerHTML);
        const highlightSaved = await saveDay(schedulePrompt.journalDate, editor.innerHTML);
        if (!highlightSaved) {
          toast.warning("일정은 등록됐지만 형광펜 표시 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
          setSchedulePrompt(null);
          setScheduleSaving(false);
          return;
        }
      }
      toast.success("워크스페이스 일정에 등록했습니다.");
      setSchedulePrompt(null);
      if (lastHighlight) {
        const range = document.createRange();
        range.setStartAfter(lastHighlight);
        range.collapse(true);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      } else {
        window.getSelection()?.removeAllRanges();
      }
    }
    setScheduleSaving(false);
  };

  const addBoardNote = async () => {
    if (!employeeId) return;
    const offset = (notes.length % 6) * 24;
    const nextLayer = Math.max(0, ...notes.map((note) => note.z_index ?? 0), ...boardImages.map((image) => image.z_index ?? 0)) + 1;
    const { data, error } = await supabase.from("work_journal_notes").insert({
      employee_id: employeeId, position_x: 20 + offset, position_y: 20 + offset,
      background_color: NOTE_COLORS[notes.length % NOTE_COLORS.length],
      z_index: nextLayer,
    }).select("*").single();
    if (error) toast.error("메모지를 만들지 못했습니다.");
    else { setNotes((current) => [...current, data as BoardNote]); setShowArchive(false); }
  };

  const updateNote = async (id: string, patch: Partial<BoardNote>) => {
    setNotes((current) => current.map((note) => note.id === id ? { ...note, ...patch } : note));
    const { error } = await supabase.from("work_journal_notes").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      // 저장 실패를 조용히 넘기면 화면에만 반영된 채 새로고침에서 되돌아간다.
      toast.error("메모지를 저장하지 못했습니다.");
      void loadNotes();
      return false;
    }
    return true;
  };

  const handleBoardPaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const images = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (images.length === 0) return;
    event.preventDefault();
    const file = images[0];
    if (file.size > MAX_NOTE_IMAGE_BYTES) {
      toast.error("이미지는 한 장당 10MB 이하로 붙여 넣어주세요.");
      return;
    }
    setUploadingBoardImage(true);
    const form = new FormData();
    form.append("file", file);
    if (employeeId) form.append("employee_id", employeeId);
    try {
      const response = await fetch("/api/work-journal/images", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "이미지 업로드 실패");
      setBoardImages((current) => [...current, result.image as BoardImage]);
      toast.success("이미지를 메모보드에 붙였습니다.");
    } catch (error) {
      toast.error(`이미지 붙여넣기에 실패했습니다. (${error instanceof Error ? error.message : "알 수 없는 오류"})`);
    } finally {
      setUploadingBoardImage(false);
    }
  };

  const updateBoardImage = async (id: string, patch: Partial<BoardImage>) => {
    setBoardImages((current) => current.map((image) => image.id === id ? { ...image, ...patch } : image));
    const { error } = await supabase.from("work_journal_board_images").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      toast.error("이미지 위치를 저장하지 못했습니다.");
      void loadBoardImages();
    }
  };

  const changeBoardLayer = async (kind: "note" | "image", id: string, direction: "front" | "back") => {
    const items = [
      ...notes.map((note) => ({ kind: "note" as const, id: note.id, z_index: Math.max(1, note.z_index ?? 1) })),
      ...boardImages.map((image) => ({ kind: "image" as const, id: image.id, z_index: Math.max(1, image.z_index ?? 1) })),
    ].sort((a, b) => a.z_index - b.z_index);
    const targetIndex = items.findIndex((item) => item.kind === kind && item.id === id);
    if (targetIndex < 0) return;
    const [target] = items.splice(targetIndex, 1);
    if (direction === "front") items.push(target);
    else items.unshift(target);
    const ordered = items.map((item, index) => ({ ...item, z_index: index + 1 }));
    const noteLayers = new Map(ordered.filter((item) => item.kind === "note").map((item) => [item.id, item.z_index]));
    const imageLayers = new Map(ordered.filter((item) => item.kind === "image").map((item) => [item.id, item.z_index]));
    setNotes((current) => current.map((note) => ({ ...note, z_index: noteLayers.get(note.id) ?? Math.max(1, note.z_index) })));
    setBoardImages((current) => current.map((image) => ({ ...image, z_index: imageLayers.get(image.id) ?? Math.max(1, image.z_index) })));
    const results = await Promise.all(ordered.map((item) => supabase
      .from(item.kind === "note" ? "work_journal_notes" : "work_journal_board_images")
      .update({ z_index: item.z_index, updated_at: new Date().toISOString() })
      .eq("id", item.id)));
    if (results.some((result) => result.error)) {
      toast.error("앞뒤 순서를 저장하지 못했습니다.");
      void Promise.all([loadNotes(), loadBoardImages()]);
    }
  };

  const removeBoardImage = async (id: string) => {
    const response = await fetch("/api/work-journal/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      toast.error(result.error || "이미지를 삭제하지 못했습니다.");
      return;
    }
    setBoardImages((current) => current.filter((image) => image.id !== id));
  };

  const removeNote = async (id: string) => {
    if (!window.confirm("이 메모지를 삭제할까요?")) return;
    const note = notes.find((item) => item.id === id);
    const { error } = await supabase.from("work_journal_notes").delete().eq("id", id);
    if (error) toast.error("메모지를 삭제하지 못했습니다.");
    else {
      setNotes((current) => current.filter((item) => item.id !== id));
      if (note?.image_paths?.length) {
        const { error: storageError } = await supabase.storage.from(NOTE_IMAGE_BUCKET).remove(note.image_paths);
        if (storageError) toast.warning("메모지는 삭제했지만 일부 이미지 정리에 실패했습니다.");
      }
    }
  };

  const startNotePointer = (event: React.PointerEvent, note: BoardNote, mode: "move" | "resize") => {
    if (!boardRef.current) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const initial = { ...note };
    let finalPosition = { ...initial };
    const board = boardRef.current;
    // clientX/Y 는 배율·확대 상태에서 소수가 되는데, 컬럼이 integer 라 소수를 보내면 저장이 통째로 거부된다.
    const clamp = (value: number, min: number, max: number) => Math.round(Math.min(Math.max(value, min), Math.max(min, max)));
    const onMove = (pointer: PointerEvent) => {
      const dx = pointer.clientX - startX;
      const dy = pointer.clientY - startY;
      if (mode === "move") {
        finalPosition = { ...finalPosition,
          position_x: clamp(initial.position_x + dx, 0, board.clientWidth - initial.width),
          position_y: clamp(initial.position_y + dy, 0, board.clientHeight - initial.height),
        };
      } else {
        finalPosition = { ...finalPosition,
          width: clamp(initial.width + dx, NOTE_MIN_WIDTH, Math.min(NOTE_MAX_SIZE, board.clientWidth - initial.position_x)),
          height: clamp(initial.height + dy, NOTE_MIN_HEIGHT, Math.min(NOTE_MAX_SIZE, board.clientHeight - initial.position_y)),
        };
      }
      setNotes((current) => current.map((item) => item.id === note.id ? { ...item, ...finalPosition } : item));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      void updateNote(note.id, mode === "move"
        ? { position_x: finalPosition.position_x, position_y: finalPosition.position_y }
        : { width: finalPosition.width, height: finalPosition.height });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  const startBoardImagePointer = (event: React.PointerEvent, image: BoardImage, mode: "move" | "resize") => {
    if (!boardRef.current) return;
    event.preventDefault();
    const board = boardRef.current;
    const startX = event.clientX;
    const startY = event.clientY;
    const initial = { ...image };
    let finalPosition = { ...initial };
    const clamp = (value: number, min: number, max: number) => Math.round(Math.min(Math.max(value, min), Math.max(min, max)));
    const onMove = (pointer: PointerEvent) => {
      const dx = pointer.clientX - startX;
      const dy = pointer.clientY - startY;
      if (mode === "move") {
        finalPosition = {
          ...finalPosition,
          position_x: clamp(initial.position_x + dx, 0, board.clientWidth - initial.width),
          position_y: clamp(initial.position_y + dy, 0, board.clientHeight - initial.height),
        };
      } else {
        finalPosition = {
          ...finalPosition,
          width: clamp(initial.width + dx, 140, Math.min(NOTE_MAX_SIZE, board.clientWidth - initial.position_x)),
          height: clamp(initial.height + dy, 100, Math.min(NOTE_MAX_SIZE, board.clientHeight - initial.position_y)),
        };
      }
      setBoardImages((current) => current.map((item) => item.id === image.id ? { ...item, ...finalPosition } : item));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      void updateBoardImage(image.id, mode === "move"
        ? { position_x: finalPosition.position_x, position_y: finalPosition.position_y }
        : { width: finalPosition.width, height: finalPosition.height });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  const renderDay = (day: Date, weekend = false) => {
    const entry = entries.find((item) => item.journal_date === dateKey(day));
    return (
      <section key={dateKey(day)} className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_1px_1px,rgba(100,116,139,0.12)_1px,transparent_0)] [background-size:18px_18px]",
        weekend ? "min-h-[175px]" : "min-h-[380px]"
      )}>
        <div className="border-b border-primary/45 px-2 py-2 xl:px-3">
          <strong className={cn("text-xl font-semibold text-primary xl:text-2xl", day.getDay() === 0 && "text-rose-500", day.getDay() === 6 && "text-blue-500")}>{format(day, "dd")}</strong>
          <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">{format(day, "EEE", { locale: ko })}</span>
        </div>
        <div
          ref={(node) => {
            const key = dateKey(day);
            if (node && node.dataset.initialized !== key) {
              node.innerHTML = editorHtml(entry?.content ?? "");
              node.dataset.initialized = key;
            }
          }}
          contentEditable
          suppressContentEditableWarning
          data-journal-date={dateKey(day)}
          onFocus={(event) => {
            selectedEditorRef.current = event.currentTarget;
            selectedDateRef.current = dateKey(day);
            restoreEmptyParagraph(event.currentTarget);
          }}
          onInput={(event) => {
            restoreEmptyParagraph(event.currentTarget);
            entryContentsRef.current.set(dateKey(day), event.currentTarget.innerHTML);
          }}
          onMouseUp={(event) => showFormatBubble(day, event.currentTarget)}
          onKeyUp={(event) => showFormatBubble(day, event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.shiftKey) {
              event.preventDefault();
              document.execCommand("insertLineBreak");
              return;
            }
            if (event.key === "Enter") {
              if (insertPlainParagraphAfterHighlight(event.currentTarget)) {
                event.preventDefault();
                entryContentsRef.current.set(dateKey(day), event.currentTarget.innerHTML);
                void saveDay(dateKey(day), event.currentTarget.innerHTML);
                return;
              }
              const selection = window.getSelection();
              const anchor = selection?.anchorNode;
              const element = anchor instanceof Element ? anchor : anchor?.parentElement;
              if (!element?.closest("li, div[contenteditable] > div")) document.execCommand("formatBlock", false, "div");
            }
          }}
          onBlur={(event) => void saveDay(dateKey(day), event.currentTarget.innerHTML)}
          className={cn(
            "min-h-0 min-w-0 flex-1 cursor-text overflow-y-auto p-2 text-[14px] leading-relaxed text-foreground outline-none [overflow-wrap:anywhere] xl:p-3",
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
          <div className="flex items-center gap-2">
            <h1 className="page-title-gradient text-xl font-semibold tracking-tight">
              {employeeName ? `${employeeName} 업무일지` : "업무일지"}
            </h1>
            {canAssignRequests ? (
              <Button size="xs" className="shadow-sm" onClick={() => setRequestDialogOpen(true)}>
                <Megaphone className="h-3.5 w-3.5" />업무요청
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">기록할 글자를 선택하면 서식을 바꾸거나 일정으로 등록할 수 있습니다.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { const today = new Date(); goToWeek(today); setCalendarMonth(startOfMonth(today)); }}><RotateCcw className="mr-1.5 h-4 w-4" />이번 주</Button>
      </header>

      <ResizablePanelGroup id="work-journal-main-group" groupRef={mainPanelGroupRef} onLayoutChanged={saveMainPanelLayout} orientation="horizontal" className="min-h-[880px] flex-1">
        <ResizablePanel id="weekly-work-area" defaultSize="62%" minSize="42%">
          <div className="h-full min-w-0 pr-1.5">
          <ResizablePanelGroup id="work-journal-weekly-group" groupRef={weeklyPanelGroupRef} onLayoutChanged={saveWeeklyPanelLayout} orientation="vertical" className="h-full">
          <ResizablePanel id="weekly-journal" defaultSize="58%" minSize="34%">
        <div className="surface-panel flex h-full min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-border/60 bg-card/80 shadow-sm backdrop-blur">
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border/60 p-3">
            <MiniCalendar month={calendarMonth} selected={weekStart} onMonthChange={setCalendarMonth} onSelect={(date) => { goToWeek(date); setCalendarMonth(startOfMonth(date)); }} />
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
            <div className="flex min-w-[250px] flex-1 flex-col items-center justify-center gap-2">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goToWeek(subWeeks(weekStart, 1))} aria-label="이전 주"><ChevronLeft className="h-4 w-4" /></Button>
                <div className="min-w-44 text-center"><p className="text-[10px] text-muted-foreground">{format(weekStart, "yyyy년", { locale: ko })}</p><h2 className="text-sm font-semibold">{format(weekStart, "M월 d일")} – {format(addDays(weekStart, 6), "M월 d일")}</h2></div>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goToWeek(addWeeks(weekStart, 1))} aria-label="다음 주"><ChevronRight className="h-4 w-4" /></Button>
              </div>
              <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Type className="h-3.5 w-3.5" />글자를 드래그하면 서식 팝업이 뜹니다</p>
            </div>
          </div>
          {loading ? <div className="p-12 text-center text-sm text-muted-foreground">업무일지를 불러오는 중...</div> : (
            <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden">
              <div className="grid h-full min-w-0 grid-cols-6 divide-x divide-primary/35">
                {weekDays.slice(0, 5).map((day) => renderDay(day))}
                <div className="grid grid-rows-2 divide-y divide-primary/35">{renderDay(weekDays[5], true)}{renderDay(weekDays[6], true)}</div>
              </div>
            </div>
          )}
        </div>

          </ResizablePanel>
          <ResizableHandle id="work-journal-weekly-separator" withHandle className="my-1.5" />
          <ResizablePanel id="work-status-widgets" defaultSize="42%" minSize="22%">

        <div className="grid h-full min-h-0 min-w-0 grid-cols-1 gap-3 overflow-x-hidden overflow-y-hidden lg:grid-cols-2">
          <div className="flex min-h-0 min-w-0 flex-col overflow-x-hidden rounded-[1.25rem] border border-border/60 bg-card/80 p-3">
            <div className="mb-2 flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">마감기한 업무 · 요청받은 업무</h3>
              <span className="text-xs text-muted-foreground">({workTasks.filter((task) => task.list_type === "deadline" || task.list_type === "instruction").length})</span>
              {employeeId ? (
                <Button asChild variant="outline" size="xs" className="ml-auto">
                  <Link href={`/dashboard/work-status/${employeeId}/archive`}>
                    <Archive className="h-3 w-3" />업무 보관함
                  </Link>
                </Button>
              ) : null}
            </div>
            <div className="min-h-0 min-w-0 flex-1 space-y-1 overflow-x-hidden overflow-y-auto pr-1">
              {workTasks.filter((task) => task.list_type === "deadline" || task.list_type === "instruction").length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">표시할 마감·요청 업무가 없습니다.</p>
              ) : workTasks.filter((task) => task.list_type === "deadline" || task.list_type === "instruction").map((task) => (
                <DeadlineTaskItem key={task.id} task={task} canEdit onDeleted={(id) => setWorkTasks((current) => current.filter((item) => item.id !== id))} onArchived={(id) => setWorkTasks((current) => current.filter((item) => item.id !== id))} />
              ))}
            </div>
          </div>
          <div className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto [&>div]:h-full [&>div]:min-w-0">
            <RequestSentBoard requests={sentRequests} onDeleted={(id) => setSentRequests((current) => current.filter((item) => item.id !== id))} />
          </div>
        </div>
          </ResizablePanel>
          </ResizablePanelGroup>
          </div>
        </ResizablePanel>

        <ResizableHandle id="work-journal-main-separator" withHandle className="mx-1.5" />

        <ResizablePanel id="free-memo-board" defaultSize="38%" minSize="25%">

        <div className="surface-panel flex h-full min-h-[760px] min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-border/60 bg-card/80 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
            <div><h2 className="font-semibold">자유 메모보드</h2><p className="text-xs text-muted-foreground">메모지와 이미지를 붙이고 가로·세로로 스크롤해 넓게 사용하세요.</p></div>
            <div className="flex items-center gap-2">
              <Button variant={showArchive ? "secondary" : "outline"} size="sm" onClick={() => setShowArchive((value) => !value)}>{showArchive ? <ArchiveRestore className="mr-1.5 h-4 w-4" /> : <Archive className="mr-1.5 h-4 w-4" />}{showArchive ? "보드로" : "보관함"}</Button>
              <Button size="sm" onClick={() => void addBoardNote()}><Plus className="mr-1.5 h-4 w-4" />메모지</Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          <div ref={boardRef} tabIndex={0} onPaste={(event) => void handleBoardPaste(event)} className="relative h-full min-h-[1400px] w-full min-w-[1600px] bg-[radial-gradient(circle_at_1px_1px,rgba(100,116,139,0.16)_1px,transparent_0)] [background-size:22px_22px] outline-none">
            {visibleNotes.length === 0 && boardImages.length === 0 ? <button type="button" onClick={() => void addBoardNote()} className="absolute left-8 top-8 flex h-32 w-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary/50 hover:bg-primary/5"><Plus className="mb-2 h-6 w-6" />{showArchive ? "보관한 메모가 없습니다" : "메모지를 만들거나 이미지를 붙여보세요"}</button> : null}
            {!showArchive ? boardImages.map((image) => (
              <article key={image.id} className="absolute flex flex-col overflow-hidden rounded-md bg-white shadow-[0_3px_9px_rgba(15,23,42,0.16)] ring-1 ring-black/10" style={{ left: image.position_x, top: image.position_y, width: image.width, height: image.height, zIndex: Math.max(1, image.z_index) }}>
                <div className="flex cursor-grab items-center justify-between border-b bg-white/90 px-2 py-1 active:cursor-grabbing" onPointerDown={(event) => startBoardImagePointer(event, image, "move")}>
                  <GripHorizontal className="h-4 w-4 text-muted-foreground" />
                  <div className="flex items-center" onPointerDown={(event) => event.stopPropagation()}>
                    <button type="button" onClick={() => void changeBoardLayer("image", image.id, "back")} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary" title="맨 뒤로"><MoveDown className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => void changeBoardLayer("image", image.id, "front")} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary" title="맨 앞으로"><MoveUp className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => void removeBoardImage(image.id)} className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600" aria-label="이미지 카드 삭제"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.public_url} alt="클립보드 이미지" className="min-h-0 flex-1 object-contain" draggable={false} />
                <button type="button" onPointerDown={(event) => startBoardImagePointer(event, image, "resize")} className="absolute bottom-1 right-1 cursor-nwse-resize rounded bg-white/75 p-1 text-muted-foreground shadow-sm hover:text-primary" aria-label="이미지 카드 크기 조절"><Maximize2 className="h-4 w-4" /></button>
              </article>
            )) : null}
            {visibleNotes.map((note) => (
              <article key={note.id} className="absolute flex flex-col overflow-visible rounded-md shadow-[0_3px_9px_rgba(15,23,42,0.16)] ring-1 ring-black/5" style={{ left: note.position_x, top: note.position_y, width: note.width, height: note.height, backgroundColor: note.background_color, zIndex: Math.max(1, note.z_index) }}>
                <div className="flex cursor-grab items-center justify-between border-b border-black/5 px-2 py-1.5 active:cursor-grabbing" onPointerDown={(event) => startNotePointer(event, note, "move")}>
                  <GripHorizontal className="h-4 w-4 opacity-30" />
                  <div className="flex items-center gap-0.5" onPointerDown={(event) => event.stopPropagation()}>
                    <button type="button" onClick={() => void changeBoardLayer("note", note.id, "back")} className="rounded p-1 hover:bg-black/5" title="맨 뒤로"><MoveDown className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => void changeBoardLayer("note", note.id, "front")} className="rounded p-1 hover:bg-black/5" title="맨 앞으로"><MoveUp className="h-3.5 w-3.5" /></button>
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
            {uploadingBoardImage ? <div className="absolute inset-0 z-[100] flex items-center justify-center bg-white/45 text-sm font-medium text-primary backdrop-blur-[1px]">이미지 붙이는 중...</div> : null}
          </div>
          </div>
        </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent className="max-w-3xl p-3 sm:max-w-3xl">
          <DialogHeader className="sr-only">
            <DialogTitle>업무요청 보내기</DialogTitle>
            <DialogDescription>요청받을 직원과 업무내용, 마감일을 선택합니다.</DialogDescription>
          </DialogHeader>
          <RequestAssignPanel
            employees={requestEmployees}
            currentDepartment={requestDepartment}
            minPosition={requestMinPosition}
            authUid={actorAuthUid}
            onAssigned={() => {
              setRequestDialogOpen(false);
              void loadWorkTasks();
            }}
          />
        </DialogContent>
      </Dialog>

      {/* mousedown 을 막아야 팝업을 눌러도 드래그해 둔 선택 영역이 풀리지 않는다. */}
      {bubble && !schedulePrompt ? (
        <div className="fixed z-[70] flex items-center gap-1 rounded-xl border border-border/70 bg-popover p-1.5 shadow-lg" style={{ left: bubble.x, top: bubble.y }} onMouseDown={(event) => event.preventDefault()}>
          <div className="flex items-center gap-0.5">
            {FONT_SIZES.map((size) => (
              <button type="button" key={size} onClick={() => applyFormat((span) => { span.style.fontSize = `${size}px`; })} className="rounded-md px-1.5 py-1 text-[11px] hover:bg-muted" aria-label={`글자 크기 ${size}px`}>{size}</button>
            ))}
          </div>
          <span className="mx-0.5 h-5 w-px bg-border" />
          <div className="flex items-center gap-1">
            {TEXT_COLORS.map((color) => (
              <button type="button" key={color} onClick={() => applyFormat((span) => { span.style.color = color; })} className="h-5 w-5 rounded-full ring-1 ring-black/10 hover:scale-110" style={{ backgroundColor: color }} aria-label={`글자색 ${color}`} />
            ))}
          </div>
          {bubble.schedule ? (
            <>
              <span className="mx-0.5 h-5 w-px bg-border" />
              <button type="button" onClick={() => openSchedulePrompt(bubble)} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/10">
                <CalendarCheck className="h-3.5 w-3.5" />일정 등록
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {schedulePrompt ? (
        <div className="fixed z-[80] w-[288px] rounded-2xl border border-primary/30 bg-white p-3 shadow-lg" style={{ left: schedulePrompt.x, top: schedulePrompt.y }}>
          <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-1.5 text-sm font-semibold text-primary"><CalendarCheck className="h-4 w-4" />일정 등록</div><button type="button" onClick={cancelSchedulePrompt} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button></div>
          <label className="block text-[10px] font-medium text-muted-foreground">날짜<input type="date" value={schedulePrompt.date} onChange={(event) => setSchedulePrompt((current) => current ? { ...current, date: event.target.value } : null)} className="mt-1 h-8 w-full rounded-lg border px-2 text-xs text-foreground" /></label>
          <label className="mt-2 block text-[10px] font-medium text-muted-foreground">내용<textarea value={schedulePrompt.content} onChange={(event) => setSchedulePrompt((current) => current ? { ...current, content: event.target.value } : null)} className="mt-1 min-h-16 w-full resize-none rounded-lg border p-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary" /></label>
          <div className="mt-2 flex justify-end gap-1.5"><Button variant="outline" size="sm" className="h-7 text-xs" onClick={cancelSchedulePrompt}>취소</Button><Button size="sm" className="h-7 text-xs" disabled={scheduleSaving} onClick={() => void createSchedule()}>{scheduleSaving ? "등록 중" : "확인"}</Button></div>
        </div>
      ) : null}
    </div>
  );
}
