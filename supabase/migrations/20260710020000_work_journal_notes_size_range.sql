-- 메모지 크기 상한 800px 이 보드 폭보다 좁아, 조금만 키워도 CHECK 제약(23514)에 걸려 저장이 거부됐다.
-- 보드를 넓게 쓰는 화면에서도 크기가 남도록 상한을 올린다. 최소값은 그대로 둔다.
ALTER TABLE public.work_journal_notes DROP CONSTRAINT IF EXISTS work_journal_notes_width_check;
ALTER TABLE public.work_journal_notes DROP CONSTRAINT IF EXISTS work_journal_notes_height_check;

ALTER TABLE public.work_journal_notes
    ADD CONSTRAINT work_journal_notes_width_check CHECK (width BETWEEN 160 AND 2400);
ALTER TABLE public.work_journal_notes
    ADD CONSTRAINT work_journal_notes_height_check CHECK (height BETWEEN 120 AND 2400);
