-- 개인 업무 대시보드 확장
-- 1) work_status_tasks: '마감기한 업무(deadline)' 종류 추가 + 진척도(progress 0~100%) 컬럼
--    (고정 업무=daily/weekly/monthly 간단 체크리스트, deadline=마감·진척·메모, instruction=관리자 지시)
-- 2) shared_notes: 팀 공유 정보란 (전 직원=company / 팀=부서 기준 team)

-- ── work_status_tasks 확장 ───────────────────────────────────────────
-- list_type CHECK 제약에 'deadline' 추가
ALTER TABLE public.work_status_tasks
    DROP CONSTRAINT IF EXISTS work_status_tasks_list_type_check;
ALTER TABLE public.work_status_tasks
    ADD CONSTRAINT work_status_tasks_list_type_check
    CHECK (list_type = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text, 'deadline'::text, 'instruction'::text]));

-- 진척도(0~100%)
ALTER TABLE public.work_status_tasks
    ADD COLUMN IF NOT EXISTS progress integer DEFAULT 0 NOT NULL;
ALTER TABLE public.work_status_tasks
    DROP CONSTRAINT IF EXISTS work_status_tasks_progress_check;
ALTER TABLE public.work_status_tasks
    ADD CONSTRAINT work_status_tasks_progress_check CHECK (progress >= 0 AND progress <= 100);

-- ── shared_notes: 공유 정보란 ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shared_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope text NOT NULL,          -- 'company'(전 직원) | 'team'(같은 부서)
    team_key text,                -- scope='team' 일 때 부서명; company 면 NULL
    content text NOT NULL,
    author_employee_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shared_notes_pkey PRIMARY KEY (id),
    CONSTRAINT shared_notes_scope_check CHECK (scope = ANY (ARRAY['company'::text, 'team'::text])),
    CONSTRAINT shared_notes_author_fkey FOREIGN KEY (author_employee_id)
        REFERENCES public.employees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS shared_notes_scope_team_idx
    ON public.shared_notes USING btree (scope, team_key);

CREATE TRIGGER shared_notes_updated_at
    BEFORE UPDATE ON public.shared_notes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.shared_notes ENABLE ROW LEVEL SECURITY;

-- 열람: 전사(company)는 전 직원 / 팀(team)은 같은 부서 직원만
CREATE POLICY "View shared_notes"
    ON public.shared_notes FOR SELECT TO authenticated USING (
        scope = 'company'
        OR (scope = 'team' AND EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.auth_uid = auth.uid() AND e.department = shared_notes.team_key
        ))
    );

-- 작성: 본인 글로만(author=본인) + 팀 글은 같은 부서만
CREATE POLICY "Insert shared_notes"
    ON public.shared_notes FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = shared_notes.author_employee_id AND e.auth_uid = auth.uid()
        )
        AND (
            scope = 'company'
            OR (scope = 'team' AND EXISTS (
                SELECT 1 FROM public.employees e
                WHERE e.auth_uid = auth.uid() AND e.department = shared_notes.team_key
            ))
        )
    );

-- 수정: 작성자 본인 또는 관리자
CREATE POLICY "Update shared_notes"
    ON public.shared_notes FOR UPDATE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = shared_notes.author_employee_id AND e.auth_uid = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.auth_uid = auth.uid() AND e.employee_type = '관리자'::text
        )
    );

-- 삭제: 작성자 본인 또는 관리자
CREATE POLICY "Delete shared_notes"
    ON public.shared_notes FOR DELETE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = shared_notes.author_employee_id AND e.auth_uid = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.auth_uid = auth.uid() AND e.employee_type = '관리자'::text
        )
    );
