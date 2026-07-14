-- 요청받은 직원이 삭제해도 요청자의 보낸 업무 기록은 유지한다.
ALTER TABLE public.work_status_tasks
    ADD COLUMN IF NOT EXISTS recipient_deleted_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS work_status_tasks_recipient_deleted_idx
    ON public.work_status_tasks(employee_id, recipient_deleted_at);

-- 요청자는 완료된 본인의 요청업무를 최종 삭제할 수 있다.
DROP POLICY IF EXISTS "Owner or admin can delete work_status_tasks" ON public.work_status_tasks;
CREATE POLICY "Owner admin or requester can delete completed work_status_tasks"
    ON public.work_status_tasks FOR DELETE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = work_status_tasks.employee_id AND e.auth_uid = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.auth_uid = auth.uid() AND e.employee_type = '관리자'::text
        )
        OR (
            work_status_tasks.list_type = 'instruction'
            AND work_status_tasks.created_by = auth.uid()
            AND work_status_tasks.status = '완료'
        )
    );
