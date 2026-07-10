-- 개인 업무일지: 주간 다이어리 항목 + 자유 메모보드

CREATE TABLE IF NOT EXISTS public.work_journal_entries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    journal_date date NOT NULL,
    content text NOT NULL DEFAULT '',
    font_size integer NOT NULL DEFAULT 14 CHECK (font_size BETWEEN 11 AND 28),
    text_color text NOT NULL DEFAULT '#334155',
    schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_journal_entries_employee_date_idx
    ON public.work_journal_entries(employee_id, journal_date);

CREATE TABLE IF NOT EXISTS public.work_journal_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    content text NOT NULL DEFAULT '',
    background_color text NOT NULL DEFAULT '#fef3c7',
    text_color text NOT NULL DEFAULT '#334155',
    font_size integer NOT NULL DEFAULT 14 CHECK (font_size BETWEEN 11 AND 28),
    position_x integer NOT NULL DEFAULT 24,
    position_y integer NOT NULL DEFAULT 24,
    width integer NOT NULL DEFAULT 220 CHECK (width BETWEEN 160 AND 800),
    height integer NOT NULL DEFAULT 180 CHECK (height BETWEEN 120 AND 800),
    is_archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_journal_notes_employee_archived_idx
    ON public.work_journal_notes(employee_id, is_archived, updated_at DESC);

ALTER TABLE public.work_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_journal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees manage own journal entries"
    ON public.work_journal_entries TO authenticated
    USING (employee_id IN (SELECT id FROM public.employees WHERE auth_uid = auth.uid()))
    WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE auth_uid = auth.uid()));

CREATE POLICY "Employees manage own journal notes"
    ON public.work_journal_notes TO authenticated
    USING (employee_id IN (SELECT id FROM public.employees WHERE auth_uid = auth.uid()))
    WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE auth_uid = auth.uid()));

GRANT ALL ON TABLE public.work_journal_entries TO authenticated, service_role;
GRANT ALL ON TABLE public.work_journal_notes TO authenticated, service_role;

