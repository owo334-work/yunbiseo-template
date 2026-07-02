"use client";

import { Send, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { SharedNote, SharedNoteScope } from "@/lib/types";

function formatWhen(iso: string) {
  // 2026-07-02T05:30:00Z -> 07-02 14:30 (로컬)
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

export function SharedNotesBoard({
  scope,
  teamKey,
  title,
  description,
  notes: initialNotes,
  currentEmployeeId,
  isAdmin,
  canPost,
  disabledHint,
}: {
  scope: SharedNoteScope;
  teamKey: string | null;
  title: string;
  description: string;
  notes: SharedNote[];
  currentEmployeeId: string | null;
  isAdmin: boolean;
  canPost: boolean;
  disabledHint?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [notes, setNotes] = useState<SharedNote[]>(initialNotes);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const addNote = async () => {
    const content = draft.trim();
    if (!content || !currentEmployeeId) return;
    setPosting(true);
    const { data, error } = await supabase
      .from("shared_notes")
      .insert({
        scope,
        team_key: scope === "team" ? teamKey : null,
        content,
        author_employee_id: currentEmployeeId,
      })
      .select("*, author:employees!shared_notes_author_fkey(id, name)")
      .single();
    if (error) {
      console.error("공유 정보 작성 실패:", error.message);
      toast.error("작성에 실패했습니다.");
    } else if (data) {
      setNotes((prev) => [...prev, data as SharedNote]);
      setDraft("");
    }
    setPosting(false);
  };

  const deleteNote = async (id: string) => {
    if (!confirm("이 공유 내용을 삭제할까요?")) return;
    const prev = notes;
    setNotes((cur) => cur.filter((n) => n.id !== id));
    const { error } = await supabase.from("shared_notes").delete().eq("id", id);
    if (error) {
      toast.error("삭제에 실패했습니다.");
      setNotes(prev);
    }
  };

  return (
    <Card className="border-border/70 bg-card/85">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {notes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
            아직 공유된 내용이 없습니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {notes.map((note) => {
              const canDelete = isAdmin || note.author_employee_id === currentEmployeeId;
              return (
                <li
                  key={note.id}
                  className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                      {note.content}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {note.author?.name ?? "알 수 없음"} · {formatWhen(note.created_at)}
                    </p>
                  </div>
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() => void deleteNote(note.id)}
                      className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                      aria-label="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {canPost ? (
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void addNote();
              }}
              placeholder="공유할 내용을 입력하세요 (Ctrl+Enter 등록)"
              rows={2}
              className="flex-1 resize-y rounded-lg border border-border/70 bg-background/80 px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <Button size="sm" onClick={() => void addNote()} disabled={posting || !draft.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {disabledHint ?? "이 보드에 글을 쓸 권한이 없습니다."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
