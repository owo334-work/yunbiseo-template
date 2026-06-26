-- 업무현황: 직원별 업무 체크리스트
-- 일간/주간/월간 업무리스트 + 추가 지시사항리스트, 진행상태(미진행/진행중/완료/보류)
-- 권한: 전체 열람(authenticated) / 추가·수정·삭제는 본인(과 관리자)만

CREATE TABLE IF NOT EXISTS public.work_status_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    list_type text DEFAULT 'daily'::text NOT NULL,
    title text NOT NULL,
    detail text,
    status text DEFAULT '미진행'::text NOT NULL,
    due_date date,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT work_status_tasks_pkey PRIMARY KEY (id),
    CONSTRAINT work_status_tasks_employee_id_fkey FOREIGN KEY (employee_id)
        REFERENCES public.employees(id) ON DELETE CASCADE,
    CONSTRAINT work_status_tasks_list_type_check
        CHECK ((list_type = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text, 'instruction'::text]))),
    CONSTRAINT work_status_tasks_status_check
        CHECK ((status = ANY (ARRAY['미진행'::text, '진행중'::text, '완료'::text, '보류'::text])))
);

CREATE INDEX IF NOT EXISTS work_status_tasks_employee_id_idx
    ON public.work_status_tasks USING btree (employee_id);
CREATE INDEX IF NOT EXISTS work_status_tasks_employee_list_idx
    ON public.work_status_tasks USING btree (employee_id, list_type);

CREATE TRIGGER work_status_tasks_updated_at
    BEFORE UPDATE ON public.work_status_tasks
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.work_status_tasks ENABLE ROW LEVEL SECURITY;

-- 전체 열람: 로그인한 모든 직원이 다른 직원의 업무현황을 볼 수 있다
CREATE POLICY "Authenticated users can view work_status_tasks"
    ON public.work_status_tasks FOR SELECT TO authenticated USING (true);

-- 추가: 본인(employee_id 가 내 계정) 또는 관리자만
CREATE POLICY "Owner or admin can insert work_status_tasks"
    ON public.work_status_tasks FOR INSERT TO authenticated WITH CHECK (
        (EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = work_status_tasks.employee_id AND e.auth_uid = auth.uid()
        ))
        OR (EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.auth_uid = auth.uid() AND e.employee_type = '관리자'::text
        ))
    );

-- 수정: 본인 또는 관리자만
CREATE POLICY "Owner or admin can update work_status_tasks"
    ON public.work_status_tasks FOR UPDATE TO authenticated USING (
        (EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = work_status_tasks.employee_id AND e.auth_uid = auth.uid()
        ))
        OR (EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.auth_uid = auth.uid() AND e.employee_type = '관리자'::text
        ))
    );

-- 삭제: 본인 또는 관리자만
CREATE POLICY "Owner or admin can delete work_status_tasks"
    ON public.work_status_tasks FOR DELETE TO authenticated USING (
        (EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = work_status_tasks.employee_id AND e.auth_uid = auth.uid()
        ))
        OR (EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.auth_uid = auth.uid() AND e.employee_type = '관리자'::text
        ))
    );
