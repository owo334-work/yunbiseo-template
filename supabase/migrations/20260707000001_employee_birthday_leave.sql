-- 생일(직원) + 연차/월차(일정 유형)
-- 1) employees.birthday: 직원관리에서 입력하는 생일 (전 직원 캘린더에 🎂 로 표시)
-- 2) schedule_categories 에 '연차'/'월차' 유형 추가 (관리자가 일정 등록 시 선택)

-- ── 생일 컬럼 ────────────────────────────────────────────────────────
ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS birthday date;

-- ── 일정 유형: 연차/월차 ─────────────────────────────────────────────
-- schedule_categories 가 비어 있으면(앱 코드 기본값에 의존 중) 기본 유형을 먼저 채운다.
INSERT INTO public.schedule_categories (value, label, color, sort_order)
SELECT t.value, t.label, t.color, t.sort_order
FROM (VALUES
    ('meeting', '미팅', '#3b82f6', 1),
    ('lecture', '강의', '#8b5cf6', 2),
    ('business_trip', '출장', '#f59e0b', 3),
    ('vacation', '휴가', '#22c55e', 4),
    ('deadline', '마감', '#ef4444', 5),
    ('other', '기타', '#6b7280', 6)
) AS t(value, label, color, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.schedule_categories);

-- 연차/월차 추가 (같은 value 가 이미 있으면 건너뜀)
INSERT INTO public.schedule_categories (value, label, color, sort_order)
SELECT t.value, t.label, t.color, t.sort_order
FROM (VALUES
    ('annual_leave', '연차', '#f43f5e', 50),
    ('monthly_leave', '월차', '#fb923c', 51)
) AS t(value, label, color, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM public.schedule_categories sc WHERE sc.value = t.value
);
