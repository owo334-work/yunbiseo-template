-- 업무현황 보관함(월별 업무일지)
-- 마감기한 업무(deadline)·요청사항 업무(instruction) 완료건을 삭제하지 않고 '보관'으로 넘겨
-- 월별로 모아 볼 수 있도록 두 컬럼과 완료시각 자동기록 트리거를 추가한다.
--   completed_at : 상태가 '완료'가 된 순간 (완료날짜 표기·월별 그룹핑 기준)
--   archived_at  : 보관 시각 (NULL=활성 목록, 값 있음=보관함)

-- ── 컬럼 추가 ────────────────────────────────────────────────────────
ALTER TABLE public.work_status_tasks
    ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;
ALTER TABLE public.work_status_tasks
    ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone;

-- 기존 '완료' 행 백필: 완료시각을 마지막 수정시각으로 간주
UPDATE public.work_status_tasks
    SET completed_at = updated_at
    WHERE status = '완료' AND completed_at IS NULL;

-- ── 완료시각 자동 기록 트리거 ────────────────────────────────────────
-- 상태가 '완료'가 되면 completed_at 을 채우고(이미 있으면 유지),
-- '완료'가 아니게 되면 비운다. 슬라이더 100%·상태 드롭다운·체크박스 어느 경로든 일관되게 동작.
CREATE OR REPLACE FUNCTION public.work_status_set_completed_at()
    RETURNS trigger
    LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = '완료' THEN
        IF NEW.completed_at IS NULL THEN
            NEW.completed_at := now();
        END IF;
    ELSE
        NEW.completed_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_status_tasks_completed_at ON public.work_status_tasks;
CREATE TRIGGER work_status_tasks_completed_at
    BEFORE INSERT OR UPDATE ON public.work_status_tasks
    FOR EACH ROW EXECUTE FUNCTION public.work_status_set_completed_at();

-- ── 보관함 조회용 인덱스 ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS work_status_tasks_archive_idx
    ON public.work_status_tasks USING btree (employee_id, archived_at, completed_at);
