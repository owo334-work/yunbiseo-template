-- 메모보드 위에 메모지처럼 독립적으로 배치하는 이미지 카드
CREATE TABLE IF NOT EXISTS public.work_journal_board_images (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    storage_path text NOT NULL UNIQUE,
    position_x integer NOT NULL DEFAULT 24,
    position_y integer NOT NULL DEFAULT 24,
    width integer NOT NULL DEFAULT 260 CHECK (width BETWEEN 140 AND 2400),
    height integer NOT NULL DEFAULT 200 CHECK (height BETWEEN 100 AND 2400),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_journal_board_images_employee_idx
    ON public.work_journal_board_images(employee_id, created_at);

ALTER TABLE public.work_journal_board_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees manage own work journal board images"
    ON public.work_journal_board_images TO authenticated
    USING (employee_id IN (SELECT id FROM public.employees WHERE auth_uid = auth.uid()))
    WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE auth_uid = auth.uid()));

GRANT ALL ON TABLE public.work_journal_board_images TO authenticated, service_role;
