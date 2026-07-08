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

// 위젯별 크기: w=가로 칸 수(TOTAL_COLS 기준, MIN_SPAN~TOTAL_COLS), h=세로 픽셀(없으면 내용 높이 자동)
type WidgetSize = { w: number; h?: number };
type SizeMap = Record<string, WidgetSize>;

const GRID_GAP = 16; // gap-4
const MIN_HEIGHT = 140;
const TOTAL_COLS = 24; // 24칸 그리드 (가로 조절을 더 촘촘하게 — 1/24 단위)
const MIN_SPAN = 4; // 최소 가로 (24칸 중 4 = 1/6 → 한 줄에 최대 6개)

// 저장된 크기의 기준 칸수 전환 이력 (12칸 → 24칸). 값이 바뀌면 자동 환산한다.
const SIZE_SCALE_VERSION = 2;

// 컨테이너 폭 → 기본 가로 칸 수(TOTAL_COLS 기준). 폭이 줄면 카드가 알아서 넓어진다.
function defaultSpan(width: number): number {
  if (width >= 1600) return 6; // 4개/줄
  if (width >= 1100) return 8; // 3개/줄
  if (width >= 700) return 12; // 2개/줄
  return 24; // 1개/줄
}

// ── 메이슨리 배치 계산 ────────────────────────────────────────────────
// 각 위젯을 순서대로, 지금까지 가장 낮게 채워진 열 자리에 떨어뜨려 세로 여백을 없앤다.
// (같은 줄에서 제일 긴 위젯 높이에 나머지가 끌려가는 그리드 여백 문제 해결)
type WidgetPos = { x: number; y: number; w: number };
function packMasonry(
  order: string[],
  present: Set<string>,
  sizes: SizeMap,
  resizing: { id: string; w: number; h: number } | null,
  width: number,
  heights: Record<string, number>,
): { pos: Record<string, WidgetPos>; containerHeight: number } {
  const cols = TOTAL_COLS;
  const colWidth = width > 0 ? (width - GRID_GAP * (cols - 1)) / cols : 0;
  const colBottoms = new Array<number>(cols).fill(0);
  const pos: Record<string, WidgetPos> = {};

  for (const id of order) {
    if (!present.has(id)) continue;
    const live = resizing && resizing.id === id ? resizing : null;
    const spanBase = live?.w ?? sizes[id]?.w ?? defaultSpan(width);
    const span = Math.min(cols, Math.max(MIN_SPAN, spanBase));
    const explicitH = live?.h ?? sizes[id]?.h;
    const h = explicitH ?? heights[id] ?? MIN_HEIGHT;

    // span 폭이 들어갈 수 있는 시작 열 중 가장 낮은(위쪽) 자리를 찾는다.
    let bestCol = 0;
    let bestY = Infinity;
    for (let c = 0; c <= cols - span; c++) {
      let y = 0;
      for (let k = c; k < c + span; k++) y = Math.max(y, colBottoms[k]);
      if (y < bestY - 0.5) {
        bestY = y;
        bestCol = c;
      }
    }
    if (!Number.isFinite(bestY)) bestY = 0;

    pos[id] = {
      x: bestCol * (colWidth + GRID_GAP),
      y: bestY,
      w: span * colWidth + (span - 1) * GRID_GAP,
    };
    const bottom = bestY + h + GRID_GAP;
    for (let k = bestCol; k < bestCol + span; k++) colBottoms[k] = bottom;
  }

  const containerHeight = Math.max(0, ...colBottoms.map((b) => b - GRID_GAP));
  return { pos, containerHeight };
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
  const sizeVersionKey = `${storageKey}:sizeVersion`;

  const [order, setOrder] = useState<string[]>(() => widgets.map((w) => w.id));
  const [sizes, setSizes] = useState<SizeMap>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);

  // 위젯별 실제 렌더 높이(px) — 메이슨리 세로 배치 계산용
  const [heights, setHeights] = useState<Record<string, number>>({});
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const roRef = useRef<ResizeObserver | null>(null);
  const refCbCache = useRef<Map<string, (el: HTMLDivElement | null) => void>>(new Map());

  // id별로 안정된 ref 콜백을 돌려준다(렌더마다 새로 만들지 않아 관찰 churn 방지).
  const getMeasureRef = (id: string) => {
    let cb = refCbCache.current.get(id);
    if (!cb) {
      cb = (el: HTMLDivElement | null) => {
        const prev = itemRefs.current.get(id);
        if (prev && prev !== el) roRef.current?.unobserve(prev);
        if (el) {
          el.dataset.wid = id;
          itemRefs.current.set(id, el);
          roRef.current?.observe(el);
        } else {
          itemRefs.current.delete(id);
        }
      };
      refCbCache.current.set(id, cb);
    }
    return cb;
  };

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

      // 기준 칸수가 바뀌었으면(예: 12→24) 저장된 가로 값을 비례 환산해 배치를 유지한다.
      const savedVersion = Number(localStorage.getItem(sizeVersionKey) || "1");
      if (savedVersion < SIZE_SCALE_VERSION && Object.keys(savedSizes).length > 0) {
        const factor = 2; // 12칸 → 24칸
        savedSizes = Object.fromEntries(
          Object.entries(savedSizes).map(([id, s]) => [
            id,
            { ...s, w: Math.min(TOTAL_COLS, Math.max(MIN_SPAN, s.w * factor)) },
          ]),
        );
        localStorage.setItem(sizeKey, JSON.stringify(savedSizes));
      }
      localStorage.setItem(sizeVersionKey, String(SIZE_SCALE_VERSION));
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

  // 각 위젯의 높이를 관찰해 메이슨리 배치에 반영
  useLayoutEffect(() => {
    const ro = new ResizeObserver((entries) => {
      setHeights((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const id = el.dataset.wid;
          if (!id) continue;
          const h = el.offsetHeight;
          if (Math.abs((next[id] ?? 0) - h) > 0.5) {
            next[id] = h;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
    roRef.current = ro;
    // 최초 마운트 시 이미 등록된 위젯들을 관찰
    itemRefs.current.forEach((el) => ro.observe(el));
    return () => {
      ro.disconnect();
      roRef.current = null;
    };
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

  const { pos, containerHeight } = packMasonry(
    order,
    new Set(byId.keys()),
    sizes,
    resizing,
    width,
    heights,
  );

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

      <div ref={containerRef} className="relative" style={{ height: `${containerHeight}px` }}>
        {ordered.map((w) => {
          const live = resizing && resizing.id === w.id ? resizing : null;
          const p = pos[w.id];
          if (!p) return null;
          const explicitH = live?.h ?? sizes[w.id]?.h;
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
                position: "absolute",
                left: 0,
                top: 0,
                transform: `translate(${p.x}px, ${p.y}px)`,
                width: `${p.w}px`,
                height: explicitH ? `${explicitH}px` : undefined,
              }}
              className={`group/widget overflow-hidden rounded-xl ${
                live ? "" : "transition-transform duration-150 ease-out"
              } ${
                overId === w.id && dragId !== w.id
                  ? "ring-2 ring-primary/50 ring-offset-2 ring-offset-background"
                  : ""
              } ${dragId === w.id ? "opacity-40" : ""} ${
                live ? "z-20 ring-2 ring-primary/60" : ""
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

              {/* 내용 (높이 지정 시 내부 스크롤). 이 래퍼의 실제 높이를 관찰해 세로 배치에 사용 */}
              <div ref={getMeasureRef(w.id)} className={explicitH ? "h-full overflow-auto" : ""}>
                {w.node}
              </div>

              {/* 리사이즈 중 크기 표시 */}
              {live ? (
                <span className="pointer-events-none absolute bottom-1 right-6 z-10 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                  가로 {live.w}/{TOTAL_COLS}
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
