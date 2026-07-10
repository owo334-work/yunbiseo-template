-- 초기 카드형 업무일지에서 같은 날짜에 여러 행을 만들 수 있었던 데이터를 정리한다.
-- 가장 최근에 수정한 행을 남기고, 서로 다른 내용은 빈 문단으로 이어 붙여 보존한다.
WITH grouped AS (
    SELECT
        employee_id,
        journal_date,
        (array_agg(id ORDER BY updated_at DESC, created_at DESC))[1] AS keep_id,
        string_agg(DISTINCT NULLIF(content, ''), '<div><br></div>') AS merged_content
    FROM public.work_journal_entries
    GROUP BY employee_id, journal_date
    HAVING count(*) > 1
)
UPDATE public.work_journal_entries entry
SET content = COALESCE(grouped.merged_content, entry.content),
    updated_at = now()
FROM grouped
WHERE entry.id = grouped.keep_id;

WITH ranked AS (
    SELECT
        id,
        row_number() OVER (
            PARTITION BY employee_id, journal_date
            ORDER BY updated_at DESC, created_at DESC
        ) AS row_number
    FROM public.work_journal_entries
)
DELETE FROM public.work_journal_entries entry
USING ranked
WHERE entry.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS work_journal_entries_employee_date_unique
    ON public.work_journal_entries(employee_id, journal_date);
