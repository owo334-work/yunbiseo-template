-- 요청사항(instruction) 업무: 배정 권한을 '대리 이상 직책'까지 확대
--  · 기존: 본인/관리자만 work_status_tasks 를 추가할 수 있었다(지시사항=관리자 전용).
--  · 변경: 아랫사람이 윗사람에게 요청하는 업무도 있으므로, '요청사항' 배정은
--          기준 직책(기본 '대리') 이상인 직원이면 타인에게 보낼 수 있게 한다.
--  · 기준 직책은 system_settings('request_assign_min_position') 로 관리자가 [설정]에서 조정한다.

-- 1) 기준 직책 기본값('대리')을 system_settings 에 넣는다 (이미 있으면 건드리지 않음)
INSERT INTO public.system_settings (key, value)
VALUES ('request_assign_min_position', '대리')
ON CONFLICT (key) DO NOTHING;

-- 2) 직책 서열 함수: 사원1 < 주임2 < 대리3 < 과장4 < 차장5 < 부장6 < 이사7 < 상무8 < 전무9 < 부사장10 < 대표11
--    목록에 없는(비표준/빈) 직책은 0 = 권한 없음. ⚠️ src/lib/work-status.ts 의 POSITION_RANKS 와 일치시킬 것.
CREATE OR REPLACE FUNCTION public.position_rank(p text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE btrim(coalesce(p, ''))
    WHEN '사원'     THEN 1
    WHEN '주임'     THEN 2
    WHEN '대리'     THEN 3
    WHEN '과장'     THEN 4
    WHEN '차장'     THEN 5
    WHEN '부장'     THEN 6
    WHEN '이사'     THEN 7
    WHEN '상무'     THEN 8
    WHEN '전무'     THEN 9
    WHEN '부사장'   THEN 10
    WHEN '대표'     THEN 11
    WHEN '대표이사' THEN 11
    WHEN '사장'     THEN 11
    ELSE 0
  END;
$$;

-- 3) INSERT 정책 교체: 본인 / 관리자 / (요청사항일 때) 기준 직책 이상인 직원
DROP POLICY IF EXISTS "Owner or admin can insert work_status_tasks" ON public.work_status_tasks;

CREATE POLICY "Insert work_status_tasks (owner, admin, request assigner)"
    ON public.work_status_tasks FOR INSERT TO authenticated WITH CHECK (
        -- 본인 업무에 추가
        EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = work_status_tasks.employee_id AND e.auth_uid = auth.uid()
        )
        -- 관리자는 누구에게나
        OR EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.auth_uid = auth.uid() AND e.employee_type = '관리자'::text
        )
        -- 요청사항(instruction): 기준 직책 이상인 재직 직원이 타인에게 배정
        OR (
            work_status_tasks.list_type = 'instruction'::text
            AND EXISTS (
                SELECT 1 FROM public.employees e
                WHERE e.auth_uid = auth.uid()
                  AND e.is_active IS NOT FALSE
                  AND public.position_rank(e.position) > 0
                  AND public.position_rank(e.position) >= public.position_rank(
                        coalesce(
                            (SELECT value FROM public.system_settings WHERE key = 'request_assign_min_position'),
                            '대리'
                        )
                  )
            )
        )
    );
