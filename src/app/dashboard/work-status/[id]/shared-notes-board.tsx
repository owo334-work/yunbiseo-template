"use client";

import {
  Eye,
  MessageSquare,
  Send,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type {
  SharedNote,
  SharedNoteComment,
  SharedNoteReaction,
  SharedNoteReactionKind,
  SharedNoteScope,
} from "@/lib/types";

function formatWhen(iso: string) {
  // 2026-07-02T05:30:00Z -> 07-02 14:30 (로컬)
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

const REACTIONS: { kind: SharedNoteReactionKind; label: string; Icon: typeof Eye }[] = [
  { kind: "read", label: "읽음", Icon: Eye },
  { kind: "up", label: "좋아요", Icon: ThumbsUp },
  { kind: "down", label: "아쉬워요", Icon: ThumbsDown },
];

const COMMENT_SELECT =
  "*, author:employees!shared_note_comments_author_fkey(id, name)";

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

  const [reactions, setReactions] = useState<SharedNoteReaction[]>([]);
  const [comments, setComments] = useState<SharedNoteComment[]>([]);
  const [openComments, setOpenComments] = useState<Set<string>>(new Set());
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});

  const canInteract = currentEmployeeId != null;
  const noteIdsKey = notes.map((n) => n.id).join(",");

  // 반응·댓글 불러오기 (현재 글 목록 기준)
  useEffect(() => {
    const ids = notes.map((n) => n.id);
    if (ids.length === 0) {
      setReactions([]);
      setComments([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [rRes, cRes] = await Promise.all([
        supabase.from("shared_note_reactions").select("*").in("note_id", ids),
        supabase
          .from("shared_note_comments")
          .select(COMMENT_SELECT)
          .in("note_id", ids)
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      if (!rRes.error) setReactions((rRes.data ?? []) as SharedNoteReaction[]);
      if (!cRes.error) setComments((cRes.data ?? []) as SharedNoteComment[]);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteIdsKey]);

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

  // 반응 토글: 같은 반응 다시 누르면 취소, 다른 반응이면 교체, 없으면 추가
  const toggleReaction = async (noteId: string, kind: SharedNoteReactionKind) => {
    if (!currentEmployeeId) return;
    const mine = reactions.find(
      (r) => r.note_id === noteId && r.employee_id === currentEmployeeId,
    );
    if (mine && mine.kind === kind) {
      const { error } = await supabase.from("shared_note_reactions").delete().eq("id", mine.id);
      if (error) return toast.error("반응 취소에 실패했습니다.");
      setReactions((prev) => prev.filter((r) => r.id !== mine.id));
    } else if (mine) {
      const { error } = await supabase
        .from("shared_note_reactions")
        .update({ kind })
        .eq("id", mine.id);
      if (error) return toast.error("반응 변경에 실패했습니다.");
      setReactions((prev) => prev.map((r) => (r.id === mine.id ? { ...r, kind } : r)));
    } else {
      const { data, error } = await supabase
        .from("shared_note_reactions")
        .insert({ note_id: noteId, employee_id: currentEmployeeId, kind })
        .select("*")
        .single();
      if (error || !data) return toast.error("반응 등록에 실패했습니다.");
      setReactions((prev) => [...prev, data as SharedNoteReaction]);
    }
  };

  const toggleComments = (noteId: string) => {
    setOpenComments((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  };

  const addComment = async (noteId: string) => {
    const content = (commentDraft[noteId] ?? "").trim();
    if (!content || !currentEmployeeId) return;
    const { data, error } = await supabase
      .from("shared_note_comments")
      .insert({ note_id: noteId, content, author_employee_id: currentEmployeeId })
      .select(COMMENT_SELECT)
      .single();
    if (error || !data) {
      toast.error("댓글 작성에 실패했습니다.");
      return;
    }
    setComments((prev) => [...prev, data as SharedNoteComment]);
    setCommentDraft((prev) => ({ ...prev, [noteId]: "" }));
  };

  const deleteComment = async (id: string) => {
    if (!confirm("이 댓글을 삭제할까요?")) return;
    const prev = comments;
    setComments((cur) => cur.filter((c) => c.id !== id));
    const { error } = await supabase.from("shared_note_comments").delete().eq("id", id);
    if (error) {
      toast.error("댓글 삭제에 실패했습니다.");
      setComments(prev);
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
              const myKind = reactions.find(
                (r) => r.note_id === note.id && r.employee_id === currentEmployeeId,
              )?.kind;
              const noteComments = comments.filter((c) => c.note_id === note.id);
              const commentsOpen = openComments.has(note.id);
              return (
                <li
                  key={note.id}
                  className="rounded-lg border border-border/60 bg-background/60 px-3 py-2"
                >
                  <div className="flex items-start gap-2">
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
                  </div>

                  {/* 반응 + 댓글 토글 */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {REACTIONS.map(({ kind, label, Icon }) => {
                      const count = reactions.filter(
                        (r) => r.note_id === note.id && r.kind === kind,
                      ).length;
                      const active = myKind === kind;
                      return (
                        <button
                          key={kind}
                          type="button"
                          disabled={!canInteract}
                          onClick={() => void toggleReaction(note.id, kind)}
                          aria-pressed={active}
                          aria-label={label}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            active
                              ? "border-primary/40 bg-primary/10 font-medium text-primary"
                              : "border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <Icon className="h-3 w-3" />
                          {label}
                          {count > 0 ? <span className="tabular-nums">{count}</span> : null}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => toggleComments(note.id)}
                      aria-expanded={commentsOpen}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                        commentsOpen
                          ? "border-primary/40 bg-primary/10 font-medium text-primary"
                          : "border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <MessageSquare className="h-3 w-3" />
                      댓글
                      {noteComments.length > 0 ? (
                        <span className="tabular-nums">{noteComments.length}</span>
                      ) : null}
                    </button>
                  </div>

                  {/* 댓글 목록 + 작성 */}
                  {commentsOpen ? (
                    <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
                      {noteComments.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">아직 댓글이 없습니다.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {noteComments.map((c) => {
                            const canDeleteComment =
                              isAdmin || c.author_employee_id === currentEmployeeId;
                            return (
                              <li key={c.id} className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="whitespace-pre-wrap break-words text-xs text-foreground">
                                    {c.content}
                                  </p>
                                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                                    {c.author?.name ?? "알 수 없음"} · {formatWhen(c.created_at)}
                                  </p>
                                </div>
                                {canDeleteComment ? (
                                  <button
                                    type="button"
                                    onClick={() => void deleteComment(c.id)}
                                    className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                                    aria-label="댓글 삭제"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {canInteract ? (
                        <div className="flex items-end gap-2">
                          <textarea
                            value={commentDraft[note.id] ?? ""}
                            onChange={(e) =>
                              setCommentDraft((prev) => ({ ...prev, [note.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                                void addComment(note.id);
                            }}
                            placeholder="댓글 달기 (Ctrl+Enter 등록)"
                            rows={1}
                            className="flex-1 resize-y rounded-lg border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void addComment(note.id)}
                            disabled={!(commentDraft[note.id] ?? "").trim()}
                          >
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
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
