"use client";

import { GripVertical, Maximize2, RotateCcw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type Widget = { id: string; node: ReactNode };

// 위젯별 크기: w=가로 칸 수(12칸 기준, MIN_SPAN~12), h=세로 픽셀(없으면 내용 높이 자동)
type WidgetSize = { w: number; h?: number };
type SizeMap = Record<string, WidgetSize>;

const GRID_GAP = 16; // gap-4
const MIN_HEIGHT = 140;
const TOTAL_COLS = 12; // 12칸 그리드 (가로 조절을 촘촘하게)
const MIN_SPAN = 3; // 최소 가로 (12칸 중 3 = 1/4)

// 컨테이너 폭 → 기본 가로 칸 수(12칸 기준). 폭이 줄면 카드가 알아서 넓어진다.
function defaultSpan(width: number): number {
  if (width >= 1280) return 3; // 4개/줄
  if (width >= 920) return 4; // 3개/줄
  if (width >= 620) return 6; // 2개/줄
  return 12; // 1개/줄
}

// 저장된 순서와 현재 위젯 목록을 정합화한다.
function reconcile(saved: string[], widgets: Widget[]): string[] {
  const ids = widgets.map((w) => w.id);
  const kept = saved.filter((id) => ids.includes(id));
  const added = ids.filter((id) => !kept.includes(id));
  return [...kept, ...added];
}

// 폰 위젯처럼 카드를 드래그해 순서를 바꾸고, 모서리를 끌어 가로·세로 크기를 조절한다.
// 배치(순서/크기)는 브라우저(localStorage)에 저장된다.
export function WidgetGrid({
  storageKey,
  widgets,
}: {
  storageKey: string;
  widgets: Widget[];
}) {
  const orderKey = `${storageKey}:order`;
  const sizeKey = `${storageKey}:size`;

  const [order, setOrder] = useState<string[]>(() => widgets.map((w) => w.id));
  const [sizes, setSizes] = useState<SizeMap>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);

  // 리사이즈 진행 상태 (드래그 중인 위젯의 임시 크기)
  const resizeRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    unit: number; // 1칸 폭(px) + gap
  } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; w: number; h: number } | null>(null);

  // 최초 1회: 저장된 순서/크기 불러오기
  useEffect(() => {
    let savedOrder: string[] = [];
    let savedSizes: SizeMap = {};
    try {
      const rawOrder = localStorage.getItem(orderKey);
      if (rawOrder) savedOrder = JSON.parse(rawOrder) as string[];
      const rawSize = localStorage.getItem(sizeKey);
      if (rawSize) savedSizes = JSON.parse(rawSize) as SizeMap;
    } catch {
      savedOrder = [];
      savedSizes = {};
    }
    setOrder(reconcile(savedOrder, widgets));
    setSizes(savedSizes);
    setHydrated(true);
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

  // 컨테이너 폭 관찰
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const persistOrder = useCallback(
    (next: string[]) => {
      setOrder(next);
      try {
        localStorage.setItem(orderKey, JSON.stringify(next));
      } catch {
        /* 저장 실패는 조용히 무시 */
      }
    },
    [orderKey],
  );

  const persistSizes = useCallback(
    (next: SizeMap) => {
      setSizes(next);
      try {
        localStorage.setItem(sizeKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [sizeKey],
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
    persistOrder(next);
    setDragId(null);
    setOverId(null);
  };

  const resetLayout = () => {
    try {
      localStorage.removeItem(orderKey);
      localStorage.removeItem(sizeKey);
    } catch {
      /* ignore */
    }
    setOrder(widgets.map((w) => w.id));
    setSizes({});
  };

  // 현재 폭에서의 위젯 span (저장값 없으면 기본값)
  const spanOf = (id: string) => {
    const live = resizing && resizing.id === id ? resizing.w : undefined;
    const saved = sizes[id]?.w;
    const base = live ?? saved ?? defaultSpan(width);
    return Math.min(TOTAL_COLS, Math.max(MIN_SPAN, base));
  };

  // ── 리사이즈 (오른쪽 아래 모서리 드래그) ─────────────────────────
  const startResize = (e: React.PointerEvent, id: string, el: HTMLElement) => {
    e.preventDefault();
    e.stopPropagation();
    const gridWidth = el.parentElement!.clientWidth;
    const colWidth = (gridWidth - GRID_GAP * (TOTAL_COLS - 1)) / TOTAL_COLS;
    resizeRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      startW: spanOf(id),
      startH: sizes[id]?.h ?? el.offsetHeight,
      unit: colWidth + GRID_GAP,
    };
    setResizing({ id, w: spanOf(id), h: sizes[id]?.h ?? el.offsetHeight });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveResize = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    const dx = e.clientX - r.startX;
    const dy = e.clientY - r.startY;
    const spanDelta = Math.round(dx / r.unit);
    const newW = Math.min(TOTAL_COLS, Math.max(MIN_SPAN, r.startW + spanDelta));
    const newH = Math.max(MIN_HEIGHT, Math.round(r.startH + dy));
    setResizing({ id: r.id, w: newW, h: newH });
  };

  const endResize = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r || !resizing) {
      resizeRef.current = null;
      setResizing(null);
      return;
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    persistSizes({ ...sizes, [r.id]: { w: resizing.w, h: resizing.h } });
    resizeRef.current = null;
    setResizing(null);
  };

  const byId = new Map(widgets.map((w) => [w.id, w] as const));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as Widget[];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <GripVertical className="inline h-3 w-3" /> 손잡이로 이동,{" "}
          <Maximize2 className="inline h-3 w-3" /> 오른쪽 아래 모서리를 좌우/상하로 끌어 가로·세로
          크기 조절. 배치는 이 브라우저에 저장됩니다.
        </p>
        <button
          type="button"
          onClick={resetLayout}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          배치 초기화
        </button>
      </div>

      <div
        ref={containerRef}
        className="grid items-start gap-4"
        style={{ gridTemplateColumns: `repeat(${TOTAL_COLS}, minmax(0, 1fr))` }}
      >
        {ordered.map((w) => {
          const live = resizing && resizing.id === w.id ? resizing : null;
          const span = spanOf(w.id);
          const height = live?.h ?? sizes[w.id]?.h;
          return (
            <div
              key={w.id}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                if (overId !== w.id) setOverId(w.id);
              }}
              onDrop={() => handleDrop(w.id)}
              style={{
                gridColumn: `span ${span} / span ${span}`,
                height: height ? `${height}px` : undefined,
              }}
              className={`group/widget relative min-w-0 overflow-hidden rounded-xl transition-shadow ${
                overId === w.id && dragId !== w.id
                  ? "ring-2 ring-primary/50 ring-offset-2 ring-offset-background"
                  : ""
              } ${dragId === w.id ? "opacity-40" : ""} ${
                live ? "ring-2 ring-primary/60" : ""
              }`}
            >
              {/* 이동 손잡이 */}
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

              {/* 내용 (높이 지정 시 내부 스크롤) */}
              <div className={height ? "h-full overflow-auto" : ""}>{w.node}</div>

              {/* 리사이즈 중 크기 표시 */}
              {live ? (
                <span className="pointer-events-none absolute bottom-1 right-6 z-10 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                  가로 {live.w}/12
                </span>
              ) : null}

              {/* 리사이즈 손잡이 (오른쪽 아래 모서리) */}
              <span
                role="slider"
                aria-label="위젯 크기 조절"
                tabIndex={-1}
                onPointerDown={(e) =>
                  startResize(e, w.id, e.currentTarget.parentElement as HTMLElement)
                }
                onPointerMove={moveResize}
                onPointerUp={endResize}
                className="absolute bottom-0 right-0 z-10 flex h-5 w-5 cursor-nwse-resize items-end justify-end p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground group-hover/widget:opacity-100"
              >
                <Maximize2 className="h-3 w-3 rotate-90" />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
