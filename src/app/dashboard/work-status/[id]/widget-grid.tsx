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

// 위젯별 크기(자동정렬 모드에서 사용): w=가로 칸 수, h=세로 픽셀(없으면 내용 높이 자동)
type WidgetSize = { w: number; h?: number };
type SizeMap = Record<string, WidgetSize>;

// 자유 배치 위치: x=시작 열(0~), y=세로 픽셀, w=가로 칸 수, h=세로 픽셀(없으면 자동)
type WidgetPlacement = { x: number; y: number; w: number; h?: number };
type PlacementMap = Record<string, WidgetPlacement>;

const GRID_GAP = 16; // gap-4
const MIN_HEIGHT = 140;
const TOTAL_COLS = 24; // 24칸 그리드 (가로 조절/배치를 촘촘하게 — 1/24 단위)
const MIN_SPAN = 4; // 최소 가로 (24칸 중 4 = 1/6 → 한 줄에 최대 6개)
const BOTTOM_PAD = 8; // 컨테이너 아래 여유

// 저장된 크기의 기준 칸수 전환 이력 (12칸 → 24칸). 값이 바뀌면 자동 환산한다.
const SIZE_SCALE_VERSION = 2;

// 컨테이너 폭 → 기본 가로 칸 수(TOTAL_COLS 기준). 폭이 줄면 카드가 알아서 넓어진다.
function defaultSpan(width: number): number {
  if (width >= 1600) return 6; // 4개/줄
  if (width >= 1100) return 8; // 3개/줄
  if (width >= 700) return 12; // 2개/줄
  return 24; // 1개/줄
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ── 자동정렬 배치(초기값) 계산 ─────────────────────────────────────────
// 위젯을 순서대로 좌→우로 놓되(폭이 넘치면 다음 줄), 세로 위치는 그 위젯이 차지하는
// 열들 바로 위까지만 끌어올린다. 사용자가 위젯을 옮기기 전의 기본 배치로 사용된다.
type AutoPos = { col: number; y: number; span: number };
function autoPack(
  order: string[],
  present: Set<string>,
  sizes: SizeMap,
  width: number,
  heights: Record<string, number>,
): Record<string, AutoPos> {
  const cols = TOTAL_COLS;
  const colBottoms = new Array<number>(cols).fill(0);
  const pos: Record<string, AutoPos> = {};
  let cursor = 0;

  for (const id of order) {
    if (!present.has(id)) continue;
    const spanBase = sizes[id]?.w ?? defaultSpan(width);
    const span = clamp(spanBase, MIN_SPAN, cols);
    const h = sizes[id]?.h ?? heights[id] ?? MIN_HEIGHT;

    if (cursor + span > cols) cursor = 0;
    const startCol = cursor;
    let y = 0;
    for (let k = startCol; k < startCol + span; k++) y = Math.max(y, colBottoms[k]);

    pos[id] = { col: startCol, y, span };
    const bottom = y + h + GRID_GAP;
    for (let k = startCol; k < startCol + span; k++) colBottoms[k] = bottom;
    cursor += span;
  }
  return pos;
}

// ── 겹침 해소: 방금 옮긴/키운 위젯(active)과 겹치는 이웃을 "겹친 만큼" 줄인다 ──
// 밀어내면 다른 위젯 자리가 틀어지므로, 이웃의 반대쪽 모서리는 고정한 채 겹친 부분만
// 축소한다(가로 겹침이면 폭, 세로 겹침이면 높이). 겹침이 작은 축을 골라 최소로 줄인다.
function resolveOverlaps(
  place: PlacementMap,
  activeId: string,
  colUnit: number,
  heights: Record<string, number>,
): PlacementMap {
  const A = place[activeId];
  if (!A) return place;
  const hOf = (id: string) => place[id]?.h ?? heights[id] ?? MIN_HEIGHT;
  const aLeft = A.x;
  const aRight = A.x + A.w;
  const aTop = A.y;
  const aBottom = A.y + hOf(activeId);

  const next: PlacementMap = { ...place };
  for (const [id, B] of Object.entries(place)) {
    if (id === activeId) continue;
    const bLeft = B.x;
    const bRight = B.x + B.w;
    const bTop = B.y;
    const bBottom = B.y + hOf(id);

    const colOv = Math.min(aRight, bRight) - Math.max(aLeft, bLeft); // 칸
    const yOv = Math.min(aBottom, bBottom) - Math.max(aTop, bTop); // px
    if (colOv <= 0 || yOv <= 0) continue; // 안 겹치면 그대로

    const nb: WidgetPlacement = { ...B };
    if (colOv * colUnit <= yOv) {
      // 가로로 겹침 → 겹친 열만큼 폭 축소(반대쪽 모서리 고정)
      if (bLeft >= aLeft) {
        const newX = Math.max(0, Math.min(aRight, bRight - MIN_SPAN));
        nb.x = newX;
        nb.w = Math.max(MIN_SPAN, bRight - newX);
      } else {
        nb.w = Math.max(MIN_SPAN, aLeft - bLeft);
      }
    } else {
      // 세로로 겹침 → 겹친 높이만큼 축소(반대쪽 모서리 고정)
      if (bTop >= aTop) {
        const newY = Math.max(0, Math.min(aBottom, bBottom - MIN_HEIGHT));
        nb.y = newY;
        nb.h = Math.max(MIN_HEIGHT, bBottom - newY);
      } else {
        nb.h = Math.max(MIN_HEIGHT, aTop - bTop);
      }
    }
    next[id] = nb;
  }
  return next;
}

// 저장된 순서와 현재 위젯 목록을 정합화한다.
function reconcile(saved: string[], widgets: Widget[]): string[] {
  const ids = widgets.map((w) => w.id);
  const kept = saved.filter((id) => ids.includes(id));
  const added = ids.filter((id) => !kept.includes(id));
  return [...kept, ...added];
}

// 카드를 손잡이로 자유롭게 끌어 원하는 위치에 놓고(여백 허용), 모서리를 끌어 크기를 조절한다.
// 배치(순서/크기/자유위치)는 브라우저(localStorage)에 저장된다.
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
  const placeKey = `${storageKey}:place`;

  const [order, setOrder] = useState<string[]>(() => widgets.map((w) => w.id));
  const [sizes, setSizes] = useState<SizeMap>({});
  const [placements, setPlacements] = useState<PlacementMap>({});
  const placementsRef = useRef<PlacementMap>({});
  const [hydrated, setHydrated] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);

  // 위젯별 실제 렌더 높이(px) — 자동정렬/컨테이너 높이 계산용
  const [heights, setHeights] = useState<Record<string, number>>({});
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const roRef = useRef<ResizeObserver | null>(null);
  const refCbCache = useRef<Map<string, (el: HTMLDivElement | null) => void>>(new Map());

  // 이동/리사이즈 진행 상태
  const [moving, setMoving] = useState<{ id: string; x: number; y: number } | null>(null);
  const moveRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origCol: number;
    origY: number;
    span: number;
    unit: number;
  } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; w: number; h: number } | null>(null);
  const resizeRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    unit: number;
  } | null>(null);

  // id별 안정된 ref 콜백(렌더마다 새로 만들지 않아 관찰 churn 방지)
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

  // 최초 1회: 저장된 순서/크기/자유위치 불러오기
  useEffect(() => {
    let savedOrder: string[] = [];
    let savedSizes: SizeMap = {};
    let savedPlace: PlacementMap = {};
    try {
      const rawOrder = localStorage.getItem(orderKey);
      if (rawOrder) savedOrder = JSON.parse(rawOrder) as string[];
      const rawSize = localStorage.getItem(sizeKey);
      if (rawSize) savedSizes = JSON.parse(rawSize) as SizeMap;
      const rawPlace = localStorage.getItem(placeKey);
      if (rawPlace) savedPlace = JSON.parse(rawPlace) as PlacementMap;

      // 기준 칸수가 바뀌었으면(예: 12→24) 저장된 가로 값을 비례 환산해 배치를 유지한다.
      const savedVersion = Number(localStorage.getItem(sizeVersionKey) || "1");
      if (savedVersion < SIZE_SCALE_VERSION) {
        const factor = 2; // 12칸 → 24칸
        if (Object.keys(savedSizes).length > 0) {
          savedSizes = Object.fromEntries(
            Object.entries(savedSizes).map(([id, s]) => [
              id,
              { ...s, w: clamp(s.w * factor, MIN_SPAN, TOTAL_COLS) },
            ]),
          );
          localStorage.setItem(sizeKey, JSON.stringify(savedSizes));
        }
        localStorage.setItem(sizeVersionKey, String(SIZE_SCALE_VERSION));
      }
    } catch {
      savedOrder = [];
      savedSizes = {};
      savedPlace = {};
    }
    setOrder(reconcile(savedOrder, widgets));
    setSizes(savedSizes);
    placementsRef.current = savedPlace;
    setPlacements(savedPlace);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // 위젯이 추가/제거되면 순서 목록도 정합화
  useEffect(() => {
    if (!hydrated) return;
    setOrder((prev) => {
      const next = reconcile(prev, widgets);
      return next.length === prev.length && next.every((id, i) => id === prev[i]) ? prev : next;
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

  // 각 위젯의 높이를 관찰
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
    itemRefs.current.forEach((el) => ro.observe(el));
    return () => {
      ro.disconnect();
      roRef.current = null;
    };
  }, []);

  const byId = new Map(widgets.map((w) => [w.id, w] as const));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as Widget[];
  const present = new Set(ordered.map((w) => w.id));

  const persistPlacements = useCallback(
    (next: PlacementMap) => {
      placementsRef.current = next;
      setPlacements(next);
      try {
        localStorage.setItem(placeKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [placeKey],
  );

  // 현재 렌더 기준값들
  const colWidth = width > 0 ? (width - GRID_GAP * (TOTAL_COLS - 1)) / TOTAL_COLS : 0;
  const unit = colWidth + GRID_GAP; // 1칸 이동 단위(px)
  const auto = autoPack(order, present, sizes, width, heights);

  // 위젯의 현재 배치(자유위치 우선, 없으면 자동정렬). 이동/리사이즈 중이면 임시값 반영.
  const placeOf = (id: string): { col: number; y: number; span: number; h?: number } => {
    const p = placements[id];
    let col: number;
    let y: number;
    let span: number;
    let h: number | undefined;
    if (p) {
      col = p.x;
      y = p.y;
      span = p.w;
      h = p.h;
    } else {
      const a = auto[id];
      col = a?.col ?? 0;
      y = a?.y ?? 0;
      span = a?.span ?? defaultSpan(width);
      h = sizes[id]?.h;
    }
    if (moving && moving.id === id) {
      col = moving.x;
      y = moving.y;
    }
    if (resizing && resizing.id === id) {
      span = resizing.w;
      h = resizing.h;
    }
    span = clamp(span, MIN_SPAN, TOTAL_COLS);
    col = clamp(col, 0, TOTAL_COLS - span);
    y = Math.max(0, y);
    return { col, y, span, h };
  };

  // 위젯을 옮기기 전, 현재 보이는 자동정렬 배치를 자유위치로 고정(스냅샷)한다.
  const freezeIfNeeded = (): PlacementMap => {
    if (Object.keys(placementsRef.current).length > 0) return placementsRef.current;
    const snap: PlacementMap = {};
    for (const w of ordered) {
      const a = auto[w.id];
      snap[w.id] = {
        x: a?.col ?? 0,
        y: a?.y ?? 0,
        w: clamp(a?.span ?? sizes[w.id]?.w ?? defaultSpan(width), MIN_SPAN, TOTAL_COLS),
        h: sizes[w.id]?.h,
      };
    }
    persistPlacements(snap);
    return snap;
  };

  // ── 이동 (손잡이 드래그) ──────────────────────────────────────────────
  const startMove = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const snap = freezeIfNeeded();
    const base = snap[id];
    const cur = placeOf(id);
    const col = base?.x ?? cur.col;
    const y = base?.y ?? cur.y;
    const span = base?.w ?? cur.span;
    const gridWidth = containerRef.current?.clientWidth ?? width;
    const cw = (gridWidth - GRID_GAP * (TOTAL_COLS - 1)) / TOTAL_COLS;
    moveRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origCol: col,
      origY: y,
      span,
      unit: cw + GRID_GAP,
    };
    setMoving({ id, x: col, y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveMove = (e: React.PointerEvent) => {
    const r = moveRef.current;
    if (!r) return;
    const dCol = Math.round((e.clientX - r.startX) / r.unit);
    const nx = clamp(r.origCol + dCol, 0, TOTAL_COLS - r.span);
    const ny = Math.max(0, Math.round(r.origY + (e.clientY - r.startY)));
    setMoving({ id: r.id, x: nx, y: ny });
  };

  const endMove = (e: React.PointerEvent) => {
    const r = moveRef.current;
    if (!r || !moving) {
      moveRef.current = null;
      setMoving(null);
      return;
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const prev = placementsRef.current[r.id] ?? { x: moving.x, y: moving.y, w: r.span };
    const merged = {
      ...placementsRef.current,
      [r.id]: { ...prev, x: moving.x, y: moving.y },
    };
    persistPlacements(resolveOverlaps(merged, r.id, unit, heights));
    moveRef.current = null;
    setMoving(null);
  };

  // ── 리사이즈 (오른쪽 아래 모서리 드래그) ─────────────────────────────
  const startResize = (e: React.PointerEvent, id: string, el: HTMLElement) => {
    e.preventDefault();
    e.stopPropagation();
    const snap = freezeIfNeeded();
    const cur = placeOf(id);
    const startW = snap[id]?.w ?? cur.span;
    const startH = snap[id]?.h ?? cur.h ?? el.offsetHeight;
    const gridWidth = el.parentElement!.clientWidth;
    const cw = (gridWidth - GRID_GAP * (TOTAL_COLS - 1)) / TOTAL_COLS;
    resizeRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      startW,
      startH,
      unit: cw + GRID_GAP,
    };
    setResizing({ id, w: startW, h: startH });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveResize = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    const dx = e.clientX - r.startX;
    const dy = e.clientY - r.startY;
    const spanDelta = Math.round(dx / r.unit);
    const newW = clamp(r.startW + spanDelta, MIN_SPAN, TOTAL_COLS);
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
    const prev = placementsRef.current[r.id] ?? { x: 0, y: 0, w: resizing.w };
    // 폭이 커져 오른쪽을 넘으면 시작 열을 당겨준다.
    const x = clamp(prev.x, 0, TOTAL_COLS - resizing.w);
    const merged = {
      ...placementsRef.current,
      [r.id]: { ...prev, x, w: resizing.w, h: resizing.h },
    };
    persistPlacements(resolveOverlaps(merged, r.id, unit, heights));
    resizeRef.current = null;
    setResizing(null);
  };

  const resetLayout = () => {
    try {
      localStorage.removeItem(orderKey);
      localStorage.removeItem(sizeKey);
      localStorage.removeItem(placeKey);
    } catch {
      /* ignore */
    }
    setOrder(widgets.map((w) => w.id));
    setSizes({});
    persistPlacements({});
  };

  // 자유 배치 모드인데 아직 위치가 없는 새 위젯은 맨 아래에 추가한다.
  useEffect(() => {
    if (!hydrated) return;
    const current = placementsRef.current;
    if (Object.keys(current).length === 0) return; // 자동정렬 모드면 그대로 둔다
    const missing = ordered.map((w) => w.id).filter((id) => !current[id]);
    if (missing.length === 0) return;
    let y = 0;
    for (const [id, p] of Object.entries(current)) {
      y = Math.max(y, p.y + (p.h ?? heights[id] ?? MIN_HEIGHT) + GRID_GAP);
    }
    const add: PlacementMap = {};
    for (const id of missing) {
      add[id] = { x: 0, y, w: defaultSpan(width), h: undefined };
      y += (heights[id] ?? MIN_HEIGHT) + GRID_GAP;
    }
    persistPlacements({ ...current, ...add });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered.map((w) => w.id).join("|"), hydrated]);

  // 컨테이너 높이 = 가장 아래 위젯의 끝
  let containerHeight = 0;
  for (const w of ordered) {
    const p = placeOf(w.id);
    const h = p.h ?? heights[w.id] ?? MIN_HEIGHT;
    containerHeight = Math.max(containerHeight, p.y + h);
  }
  containerHeight += BOTTOM_PAD;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <GripVertical className="inline h-3 w-3" /> 손잡이로 원하는 위치에 자유롭게 이동(여백 가능),{" "}
          <Maximize2 className="inline h-3 w-3" /> 오른쪽 아래 모서리를 끌어 크기 조절. 배치는 이
          브라우저에 저장됩니다.
        </p>
        <button
          type="button"
          onClick={resetLayout}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          자동정렬로 초기화
        </button>
      </div>

      <div ref={containerRef} className="relative" style={{ height: `${containerHeight}px` }}>
        {ordered.map((w) => {
          const p = placeOf(w.id);
          const active = moving?.id === w.id || resizing?.id === w.id;
          const explicitH = p.h;
          const x = p.col * unit;
          const wPx = p.span * colWidth + (p.span - 1) * GRID_GAP;
          return (
            <div
              key={w.id}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                transform: `translate(${x}px, ${p.y}px)`,
                width: `${wPx}px`,
                height: explicitH ? `${explicitH}px` : undefined,
                zIndex: active ? 20 : undefined,
              }}
              className={`group/widget overflow-hidden rounded-xl ${
                active ? "ring-2 ring-primary/60" : "transition-transform duration-150 ease-out"
              }`}
            >
              {/* 이동 손잡이 */}
              <button
                type="button"
                onPointerDown={(e) => startMove(e, w.id)}
                onPointerMove={moveMove}
                onPointerUp={endMove}
                aria-label="위젯 이동"
                className="absolute left-1 top-1 z-10 cursor-grab touch-none rounded-md p-1 text-muted-foreground/60 opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/widget:opacity-100 active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4" />
              </button>

              {/* 내용 (높이 지정 시 내부 스크롤). 이 래퍼의 실제 높이를 관찰해 배치에 사용 */}
              <div ref={getMeasureRef(w.id)} className={explicitH ? "h-full overflow-auto" : ""}>
                {w.node}
              </div>

              {/* 이동/리사이즈 중 크기 표시 */}
              {active ? (
                <span className="pointer-events-none absolute bottom-1 right-6 z-10 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                  가로 {p.span}/{TOTAL_COLS}
                </span>
              ) : null}

              {/* 리사이즈 손잡이 (오른쪽 아래 모서리) */}
              <span
                role="slider"
                aria-label="위젯 크기 조절"
                aria-valuenow={p.span}
                aria-valuemin={MIN_SPAN}
                aria-valuemax={TOTAL_COLS}
                tabIndex={-1}
                onPointerDown={(e) =>
                  startResize(e, w.id, e.currentTarget.parentElement as HTMLElement)
                }
                onPointerMove={moveResize}
                onPointerUp={endResize}
                className="absolute bottom-0 right-0 z-10 flex h-5 w-5 cursor-nwse-resize touch-none items-end justify-end p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground group-hover/widget:opacity-100"
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
