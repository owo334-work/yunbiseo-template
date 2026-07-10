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
  ChevronLeft,
  ChevronRight,
  GripHorizontal,
  Maximize2,
  Palette,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
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

const NOTE_COLORS = ["#fef3c7", "#dbeafe", "#dcfce7", "#fce7f3", "#ede9fe", "#f1f5f9"];
const TEXT_COLORS = ["#334155", "#0f766e", "#1d4ed8", "#7e22ce", "#be123c", "#111827"];
const FONT_SIZES = [12, 14, 16, 18, 22];

function dateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function toLocalIso(date: string, hour: number) {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00`).toISOString();
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
    <div className="w-full max-w-[280px] rounded-2xl border border-border/70 bg-white/70 p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="rounded-lg p-1 hover:bg-muted" onClick={() => onMonthChange(subMonths(month, 1))} aria-label="이전 달">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <strong className="text-sm">{format(month, "yyyy년 M월", { locale: ko })}</strong>
        <button type="button" className="rounded-lg p-1 hover:bg-muted" onClick={() => onMonthChange(addMonths(month, 1))} aria-label="다음 달">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground">
        {["월", "화", "수", "목", "금", "토", "일"].map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-0.5">
        {days.map((day) => (
          <button
            type="button"
            key={day.toISOString()}
            onClick={() => onSelect(day)}
            className={cn(
              "aspect-square rounded-lg text-[11px] transition-colors hover:bg-primary/10",
              !isSameMonth(day, month) && "text-muted-foreground/40",
              isSameDay(day, new Date()) && "font-bold text-primary ring-1 ring-primary/40",
              isSameDay(day, selected) && "bg-primary text-primary-foreground hover:bg-primary"
            )}
          >
            {format(day, "d")}
          </button>
        ))}
      </div>
    </div>
  );
}

function FormatTools({ fontSize, textColor, onFontSize, onTextColor, compact = false }: {
  fontSize: number;
  textColor: string;
  onFontSize: (size: number) => void;
  onTextColor: (color: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-1", compact && "opacity-80")} onPointerDown={(event) => event.stopPropagation()}>
      <select
        aria-label="글자 크기"
        value={fontSize}
        onChange={(event) => onFontSize(Number(event.target.value))}
        className="h-7 rounded-lg border border-border/70 bg-white/70 px-1 text-[11px]"
      >
        {FONT_SIZES.map((size) => <option key={size} value={size}>{size}px</option>)}
      </select>
      <div className="flex rounded-lg border border-border/70 bg-white/70 p-1">
        {TEXT_COLORS.map((color) => (
          <button
            type="button"
            key={color}
            aria-label={`글자색 ${color}`}
            onClick={() => onTextColor(color)}
            className={cn("h-3.5 w-3.5 rounded-full", textColor === color && "ring-2 ring-primary ring-offset-1")}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  );
}

export function WorkJournal() {
  const supabase = useMemo(() => createClient(), []);
  const boardRef = useRef<HTMLDivElement>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [notes, setNotes] = useState<BoardNote[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scheduleDrop, setScheduleDrop] = useState(false);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const visibleNotes = useMemo(() => notes.filter((note) => note.is_archived === showArchive), [notes, showArchive]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data, error } = await supabase.from("employees").select("id").eq("auth_uid", auth.user.id).single();
      if (!active) return;
      if (error || !data) toast.error("직원 정보를 확인할 수 없습니다.");
      else setEmployeeId(data.id);
    })();
    return () => { active = false; };
  }, [supabase]);

  const loadEntries = useCallback(async () => {
    if (!employeeId) return;
    const { data, error } = await supabase
      .from("work_journal_entries")
      .select("*")
      .eq("employee_id", employeeId)
      .gte("journal_date", dateKey(weekStart))
      .lte("journal_date", dateKey(addDays(weekStart, 6)))
      .order("created_at");
    if (error) toast.error("주간 업무일지를 불러오지 못했습니다.");
    else setEntries((data ?? []) as JournalEntry[]);
  }, [employeeId, supabase, weekStart]);

  const loadNotes = useCallback(async () => {
    if (!employeeId) return;
    const { data, error } = await supabase.from("work_journal_notes").select("*").eq("employee_id", employeeId).order("created_at");
    if (error) toast.error("메모보드를 불러오지 못했습니다.");
    else setNotes((data ?? []) as BoardNote[]);
  }, [employeeId, supabase]);

  useEffect(() => {
    if (!employeeId) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void Promise.all([loadEntries(), loadNotes()]).finally(() => {
        if (active) setLoading(false);
      });
    });
    return () => { active = false; };
  }, [employeeId, loadEntries, loadNotes]);

  const addEntry = async (day: Date) => {
    if (!employeeId) return;
    const { data, error } = await supabase.from("work_journal_entries").insert({ employee_id: employeeId, journal_date: dateKey(day), content: "" }).select("*").single();
    if (error) toast.error("메모를 추가하지 못했습니다.");
    else setEntries((current) => [...current, data as JournalEntry]);
  };

  const updateEntry = async (id: string, patch: Partial<JournalEntry>) => {
    setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
    const { error } = await supabase.from("work_journal_entries").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error("업무일지를 저장하지 못했습니다.");
  };

  const deleteEntry = async (id: string) => {
    const { error } = await supabase.from("work_journal_entries").delete().eq("id", id);
    if (error) toast.error("메모를 삭제하지 못했습니다.");
    else setEntries((current) => current.filter((entry) => entry.id !== id));
  };

  const registerSchedule = async (entry: JournalEntry) => {
    if (!employeeId || !entry.content.trim()) {
      toast.info("일정으로 등록할 내용을 먼저 입력하세요.");
      return;
    }
    if (entry.schedule_id) {
      toast.info("이미 일정에 등록된 메모입니다.");
      return;
    }
    const { data, error } = await supabase.from("schedules").insert({
      title: entry.content.trim().split("\n")[0].slice(0, 100),
      description: entry.content.trim(),
      start_at: toLocalIso(entry.journal_date, 9),
      end_at: toLocalIso(entry.journal_date, 10),
      all_day: false,
      category: "other",
      recurrence_type: "none",
      created_by: employeeId,
    }).select("id").single();
    if (error || !data) toast.error("일정 등록에 실패했습니다.");
    else {
      await updateEntry(entry.id, { schedule_id: data.id });
      toast.success(`${format(new Date(`${entry.journal_date}T00:00:00`), "M월 d일")} 일정으로 등록했습니다.`);
    }
  };

  const addBoardNote = async () => {
    if (!employeeId) return;
    const offset = (notes.length % 6) * 24;
    const { data, error } = await supabase.from("work_journal_notes").insert({
      employee_id: employeeId,
      position_x: 20 + offset,
      position_y: 20 + offset,
      background_color: NOTE_COLORS[notes.length % NOTE_COLORS.length],
    }).select("*").single();
    if (error) toast.error("메모지를 만들지 못했습니다.");
    else {
      setNotes((current) => [...current, data as BoardNote]);
      setShowArchive(false);
    }
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
        const maxX = Math.max(0, board.clientWidth - initial.width);
        const maxY = Math.max(0, board.clientHeight - initial.height);
        finalPosition = {
          ...finalPosition,
          position_x: Math.max(0, Math.min(maxX, initial.position_x + dx)),
          position_y: Math.max(0, Math.min(maxY, initial.position_y + dy)),
        };
        setNotes((current) => current.map((item) => item.id === note.id ? {
          ...item,
          position_x: finalPosition.position_x,
          position_y: finalPosition.position_y,
        } : item));
      } else {
        finalPosition = {
          ...finalPosition,
          width: Math.max(160, Math.min(board.clientWidth - initial.position_x, initial.width + dx)),
          height: Math.max(120, Math.min(board.clientHeight - initial.position_y, initial.height + dy)),
        };
        setNotes((current) => current.map((item) => item.id === note.id ? {
          ...item,
          width: finalPosition.width,
          height: finalPosition.height,
        } : item));
      }
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
    const dayEntries = entries.filter((entry) => entry.journal_date === dateKey(day));
    return (
      <section key={dateKey(day)} className={cn("flex min-h-0 flex-col bg-[radial-gradient(circle_at_1px_1px,rgba(100,116,139,0.13)_1px,transparent_0)] [background-size:18px_18px]", weekend ? "min-h-[210px]" : "min-h-[430px]") }>
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <div>
            <span className={cn("text-xs font-semibold", day.getDay() === 0 && "text-rose-500", day.getDay() === 6 && "text-blue-500")}>{format(day, "EEE", { locale: ko })}</span>
            <strong className={cn("ml-2 text-lg", isSameDay(day, new Date()) && "text-primary")}>{format(day, "d")}</strong>
          </div>
          <button type="button" onClick={() => void addEntry(day)} className="rounded-lg p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary" aria-label={`${format(day, "M월 d일")} 메모 추가`}>
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-2">
          {dayEntries.length === 0 ? (
            <button type="button" onClick={() => void addEntry(day)} className="flex h-20 w-full items-center justify-center rounded-xl border border-dashed border-border/70 text-xs text-muted-foreground hover:border-primary/50 hover:bg-primary/5">+ 기록하기</button>
          ) : null}
          {dayEntries.map((entry) => (
            <article
              key={entry.id}
              draggable
              onDragStart={(event) => event.dataTransfer.setData("text/work-journal-entry", entry.id)}
              className="group rounded-xl border border-border/70 bg-white/80 p-2 shadow-sm"
            >
              <textarea
                value={entry.content}
                onChange={(event) => setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, content: event.target.value } : item))}
                onBlur={(event) => void updateEntry(entry.id, { content: event.target.value })}
                placeholder="업무 내용이나 일정을 적어보세요"
                className="min-h-20 w-full resize-none bg-transparent leading-relaxed outline-none placeholder:text-muted-foreground/60"
                style={{ fontSize: entry.font_size, color: entry.text_color }}
              />
              <div className="mt-1 flex flex-wrap items-center justify-between gap-1 border-t border-border/50 pt-2">
                <FormatTools
                  compact
                  fontSize={entry.font_size}
                  textColor={entry.text_color}
                  onFontSize={(font_size) => void updateEntry(entry.id, { font_size })}
                  onTextColor={(text_color) => void updateEntry(entry.id, { text_color })}
                />
                <div className="flex items-center gap-0.5">
                  <button type="button" disabled={Boolean(entry.schedule_id)} onClick={() => void registerSchedule(entry)} className={cn("rounded-lg p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary", entry.schedule_id && "text-emerald-600")} title={entry.schedule_id ? "일정 등록 완료" : "일정으로 등록"}>
                    <CalendarCheck className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => void deleteEntry(entry.id)} className="rounded-lg p-1.5 text-muted-foreground opacity-50 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100" title="삭제">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-4 pb-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Weekly work journal</p>
          <h1 className="page-title-gradient mt-1 text-2xl font-semibold tracking-tight">업무일지</h1>
          <p className="mt-1 text-sm text-muted-foreground">한 주의 흐름과 떠오른 생각을 한 화면에서 정리하세요.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { const today = new Date(); setWeekStart(startOfWeek(today, { weekStartsOn: 1 })); setCalendarMonth(startOfMonth(today)); }}>
          <RotateCcw className="mr-1.5 h-4 w-4" />이번 주
        </Button>
      </header>

      <div className="grid min-h-[780px] gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(420px,0.8fr)]">
        <div className="surface-panel overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/80 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 border-b border-border/60 p-4 lg:flex-row lg:items-center lg:justify-between">
            <MiniCalendar
              month={calendarMonth}
              selected={weekStart}
              onMonthChange={setCalendarMonth}
              onSelect={(date) => { setWeekStart(startOfWeek(date, { weekStartsOn: 1 })); setCalendarMonth(startOfMonth(date)); }}
            />
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setWeekStart((date) => subWeeks(date, 1))} aria-label="이전 주"><ChevronLeft className="h-4 w-4" /></Button>
                <div className="min-w-48 text-center">
                  <p className="text-xs text-muted-foreground">{format(weekStart, "yyyy년", { locale: ko })}</p>
                  <h2 className="font-semibold">{format(weekStart, "M월 d일")} – {format(addDays(weekStart, 6), "M월 d일")}</h2>
                </div>
                <Button variant="outline" size="icon" onClick={() => setWeekStart((date) => addWeeks(date, 1))} aria-label="다음 주"><ChevronRight className="h-4 w-4" /></Button>
              </div>
              <div
                onDragOver={(event) => { event.preventDefault(); setScheduleDrop(true); }}
                onDragLeave={() => setScheduleDrop(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setScheduleDrop(false);
                  const id = event.dataTransfer.getData("text/work-journal-entry");
                  const entry = entries.find((item) => item.id === id);
                  if (entry) void registerSchedule(entry);
                }}
                className={cn("flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground transition-colors", scheduleDrop && "border-primary bg-primary/10 text-primary")}
              >
                <CalendarCheck className="h-4 w-4" />메모를 여기로 끌어 일정에 등록
              </div>
            </div>
          </div>

          {loading ? <div className="p-12 text-center text-sm text-muted-foreground">업무일지를 불러오는 중...</div> : (
            <div className="overflow-x-auto">
              <div className="grid min-w-[920px] grid-cols-6 divide-x divide-border/60">
                {weekDays.slice(0, 5).map((day) => renderDay(day))}
                <div className="grid grid-rows-2 divide-y divide-border/60">{renderDay(weekDays[5], true)}{renderDay(weekDays[6], true)}</div>
              </div>
            </div>
          )}
        </div>

        <div className="surface-panel flex min-h-[780px] flex-col overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/80 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
            <div>
              <h2 className="font-semibold">자유 메모보드</h2>
              <p className="text-xs text-muted-foreground">메모지를 잡아 옮기고 오른쪽 아래에서 크기를 조절하세요.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant={showArchive ? "secondary" : "outline"} size="sm" onClick={() => setShowArchive((value) => !value)}>
                {showArchive ? <ArchiveRestore className="mr-1.5 h-4 w-4" /> : <Archive className="mr-1.5 h-4 w-4" />}{showArchive ? "보드로 돌아가기" : "보관함"}
              </Button>
              <Button size="sm" onClick={() => void addBoardNote()}><Plus className="mr-1.5 h-4 w-4" />메모지</Button>
            </div>
          </div>
          <div
            ref={boardRef}
            className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_1px_1px,rgba(100,116,139,0.18)_1px,transparent_0)] [background-size:22px_22px]"
          >
            {visibleNotes.length === 0 ? (
              <button type="button" onClick={() => void addBoardNote()} className="absolute inset-0 m-auto flex h-32 w-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary/50 hover:bg-primary/5">
                <Plus className="mb-2 h-6 w-6" />{showArchive ? "보관한 메모가 없습니다" : "첫 메모지를 붙여보세요"}
              </button>
            ) : null}
            {visibleNotes.map((note) => (
              <article
                key={note.id}
                className="absolute flex flex-col overflow-hidden rounded-md shadow-[0_12px_30px_rgba(15,23,42,0.16)] ring-1 ring-black/5"
                style={{ left: note.position_x, top: note.position_y, width: note.width, height: note.height, backgroundColor: note.background_color }}
              >
                <div className="flex cursor-grab items-center justify-between border-b border-black/5 px-2 py-1.5 active:cursor-grabbing" onPointerDown={(event) => startNotePointer(event, note, "move")}>
                  <GripHorizontal className="h-4 w-4 opacity-35" />
                  <div className="flex items-center gap-0.5" onPointerDown={(event) => event.stopPropagation()}>
                    <button type="button" onClick={() => void updateNote(note.id, { is_archived: !note.is_archived })} className="rounded p-1 hover:bg-black/5" title={note.is_archived ? "복원" : "보관"}>{note.is_archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}</button>
                    <button type="button" onClick={() => void removeNote(note.id)} className="rounded p-1 hover:bg-rose-500/10 hover:text-rose-700" title="삭제"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <textarea
                  value={note.content}
                  onChange={(event) => setNotes((current) => current.map((item) => item.id === note.id ? { ...item, content: event.target.value } : item))}
                  onBlur={(event) => void updateNote(note.id, { content: event.target.value })}
                  placeholder="간단한 메모를 적어보세요..."
                  className="min-h-0 flex-1 resize-none bg-transparent p-3 leading-relaxed outline-none placeholder:text-current placeholder:opacity-35"
                  style={{ fontSize: note.font_size, color: note.text_color }}
                />
                <div className="flex items-end justify-between gap-1 border-t border-black/5 p-2">
                  <div className="space-y-1">
                    <FormatTools compact fontSize={note.font_size} textColor={note.text_color} onFontSize={(font_size) => void updateNote(note.id, { font_size })} onTextColor={(text_color) => void updateNote(note.id, { text_color })} />
                    <div className="flex items-center gap-1"><Palette className="h-3 w-3 opacity-40" />{NOTE_COLORS.map((color) => <button type="button" key={color} onClick={() => void updateNote(note.id, { background_color: color })} className={cn("h-3.5 w-3.5 rounded-full ring-1 ring-black/10", note.background_color === color && "ring-2 ring-primary ring-offset-1")} style={{ backgroundColor: color }} aria-label={`메모지색 ${color}`} />)}</div>
                  </div>
                  <button type="button" onPointerDown={(event) => startNotePointer(event, note, "resize")} className="cursor-nwse-resize rounded p-1 opacity-40 hover:bg-black/5 hover:opacity-80" aria-label="메모지 크기 조절"><Maximize2 className="h-4 w-4" /></button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
