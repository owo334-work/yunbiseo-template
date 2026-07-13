-- 메모지와 이미지 카드가 하나의 앞뒤 순서를 공유하도록 레이어 값 추가
ALTER TABLE public.work_journal_notes
    ADD COLUMN IF NOT EXISTS z_index integer NOT NULL DEFAULT 1;
ALTER TABLE public.work_journal_board_images
    ADD COLUMN IF NOT EXISTS z_index integer NOT NULL DEFAULT 1;

WITH ordered AS (
    SELECT kind, id, row_number() OVER (ORDER BY created_at, id)::integer AS layer
    FROM (
        SELECT 'note'::text AS kind, id, created_at FROM public.work_journal_notes
        UNION ALL
        SELECT 'image'::text AS kind, id, created_at FROM public.work_journal_board_images
    ) items
)
UPDATE public.work_journal_notes note
SET z_index = ordered.layer
FROM ordered
WHERE ordered.kind = 'note' AND ordered.id = note.id;

WITH ordered AS (
    SELECT kind, id, row_number() OVER (ORDER BY created_at, id)::integer AS layer
    FROM (
        SELECT 'note'::text AS kind, id, created_at FROM public.work_journal_notes
        UNION ALL
        SELECT 'image'::text AS kind, id, created_at FROM public.work_journal_board_images
    ) items
)
UPDATE public.work_journal_board_images image
SET z_index = ordered.layer
FROM ordered
WHERE ordered.kind = 'image' AND ordered.id = image.id;
