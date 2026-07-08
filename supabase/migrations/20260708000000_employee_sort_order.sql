-- 직원 표시 순서(업무현황·워크스페이스 카드 정렬)
-- 값이 있으면 수동 순서를 그대로 사용하고, 비어(null) 있으면
-- 직급 높은 순 → 같은 직급은 이름 가나다 순으로 자동 정렬한다.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS sort_order integer;

COMMENT ON COLUMN public.employees.sort_order IS
  '업무현황/워크스페이스 카드 수동 정렬 순서. null 이면 직급→가나다 자동정렬.';
