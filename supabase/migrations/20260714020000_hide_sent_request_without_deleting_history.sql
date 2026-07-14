-- 요청자가 완료 업무를 정리해도 작업자의 업무·보관함 기록은 유지한다.
ALTER TABLE public.work_status_tasks
    ADD COLUMN IF NOT EXISTS requester_hidden_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS work_status_tasks_requester_hidden_idx
    ON public.work_status_tasks(created_by, requester_hidden_at);

-- 실제 DELETE는 작업자 본인 또는 관리자만 가능하다.
DROP POLICY IF EXISTS "Owner admin or requester can delete completed work_status_tasks" ON public.work_status_tasks;
CREATE POLICY "Owner or admin can delete work_status_tasks"
    ON public.work_status_tasks FOR DELETE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = work_status_tasks.employee_id AND e.auth_uid = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.auth_uid = auth.uid() AND e.employee_type = '관리자'::text
        )
    );

CREATE OR REPLACE FUNCTION public.hide_completed_sent_request(p_task_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.work_status_tasks
    SET requester_hidden_at = now(), updated_at = now()
    WHERE id = p_task_id
      AND list_type = 'instruction'
      AND created_by = auth.uid()
      AND status = '완료';
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.hide_completed_sent_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hide_completed_sent_request(uuid) TO authenticated, service_role;
