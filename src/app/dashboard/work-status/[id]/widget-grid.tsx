"use client";

import { GripVertical, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

export type Widget = { id: string; node: ReactNode };

// 저장된 순서와 현재 위젯 목록을 정합화한다.
// - 저장된 순서 중 실제 존재하는 것만 유지
// - 저장에 없는 새 위젯은 뒤에 붙임
function reconcile(saved: string[], widgets: Widget[]): string[] {
  const ids = widgets.map((w) => w.id);
  const kept = saved.filter((id) => ids.includes(id));
  const added = ids.filter((id) => !kept.includes(id));
  return [...kept, ...added];
}

// 폰 위젯처럼 카드를 드래그해 순서를 바꾸고, 배치를 브라우저(localStorage)에 저장한다.
export function WidgetGrid({
  storageKey,
  widgets,
}: {
  storageKey: string;
  widgets: Widget[];
}) {
  const [order, setOrder] = useState<string[]>(() => widgets.map((w) => w.id));
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // 최초 1회: 저장된 순서 불러오기
  useEffect(() => {
    let saved: string[] = [];
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) saved = JSON.parse(raw) as string[];
    } catch {
      saved = [];
    }
    setOrder(reconcile(saved, widgets));
    setHydrated(true);
    // storageKey 만 의존 (위젯 목록 변동은 아래 effect 에서 반영)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // 위젯이 추가/제거되면 순서 목록도 정합화
  useEffect(() => {
    if (!hydrated) return;
    setOrder((prev) => {
      const next = reconcile(prev, widgets);
      return next.length === prev.length && next.every((id, i) => id === prev[i])
        ? prev
        : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets.map((w) => w.id).join("|"), hydrated]);

  const persist = useCallback(
    (next: string[]) => {
      setOrder(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // 저장 실패는 조용히 무시 (배치는 세션 동안 유지됨)
      }
    },
    [storageKey],
  );

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const next = [...order];
    const from = next.indexOf(dragId);
    const to = next.indexOf(targetId);
    if (from === -1 || to === -1) return;
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    persist(next);
    setDragId(null);
    setOverId(null);
  };

  const resetLayout = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setOrder(widgets.map((w) => w.id));
  };

  const byId = new Map(widgets.map((w) => [w.id, w] as const));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as Widget[];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          카드 왼쪽 위 <GripVertical className="inline h-3 w-3" /> 손잡이를 잡아 원하는 곳으로
          끌어다 배치하세요. 배치는 이 브라우저에 저장됩니다.
        </p>
        <button
          type="button"
          onClick={resetLayout}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          배치 초기화
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ordered.map((w) => (
          <div
            key={w.id}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              if (overId !== w.id) setOverId(w.id);
            }}
            onDrop={() => handleDrop(w.id)}
            className={`group/widget relative rounded-xl transition-all ${
              overId === w.id && dragId !== w.id
                ? "ring-2 ring-primary/50 ring-offset-2 ring-offset-background"
                : ""
            } ${dragId === w.id ? "opacity-40" : ""}`}
          >
            {/* 드래그 손잡이 */}
            <button
              type="button"
              draggable
              onDragStart={() => setDragId(w.id)}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              aria-label="위젯 이동"
              className="absolute left-1 top-1 z-10 cursor-grab rounded-md p-1 text-muted-foreground/60 opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/widget:opacity-100 active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            {w.node}
          </div>
        ))}
      </div>
    </div>
  );
}
