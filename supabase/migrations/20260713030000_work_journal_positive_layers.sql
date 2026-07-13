-- z-index 가 0 이하이면 보드 배경 뒤로 들어가 클릭할 수 없으므로
-- 직원별 메모지·이미지 전체를 1부터 다시 정렬한다.
WITH ordered AS (
    SELECT
        kind,
        id,
        row_number() OVER (
            PARTITION BY employee_id
            ORDER BY z_index, created_at, id
        )::integer AS layer
    FROM (
        SELECT 'note'::text AS kind, id, employee_id, z_index, created_at
        FROM public.work_journal_notes
        UNION ALL
        SELECT 'image'::text AS kind, id, employee_id, z_index, created_at
        FROM public.work_journal_board_images
    ) items
)
UPDATE public.work_journal_notes note
SET z_index = ordered.layer
FROM ordered
WHERE ordered.kind = 'note' AND ordered.id = note.id;

WITH ordered AS (
    SELECT
        kind,
        id,
        row_number() OVER (
            PARTITION BY employee_id
            ORDER BY z_index, created_at, id
        )::integer AS layer
    FROM (
        SELECT 'note'::text AS kind, id, employee_id, z_index, created_at
        FROM public.work_journal_notes
        UNION ALL
        SELECT 'image'::text AS kind, id, employee_id, z_index, created_at
        FROM public.work_journal_board_images
    ) items
)
UPDATE public.work_journal_board_images image
SET z_index = ordered.layer
FROM ordered
WHERE ordered.kind = 'image' AND ordered.id = image.id;

ALTER TABLE public.work_journal_notes
    ADD CONSTRAINT work_journal_notes_z_index_positive CHECK (z_index >= 1);
ALTER TABLE public.work_journal_board_images
    ADD CONSTRAINT work_journal_board_images_z_index_positive CHECK (z_index >= 1);
