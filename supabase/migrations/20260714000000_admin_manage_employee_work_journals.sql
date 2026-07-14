-- 관리자는 사이드바에서 선택한 직원의 업무일지와 메모보드를 확인·관리할 수 있다.

DROP POLICY IF EXISTS "Employees manage own journal entries" ON public.work_journal_entries;
CREATE POLICY "Employees manage own or admin journal entries"
    ON public.work_journal_entries TO authenticated
    USING (
        employee_id IN (SELECT id FROM public.employees WHERE auth_uid = auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.employees
            WHERE auth_uid = auth.uid() AND employee_type = '관리자'
        )
    )
    WITH CHECK (
        employee_id IN (SELECT id FROM public.employees WHERE auth_uid = auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.employees
            WHERE auth_uid = auth.uid() AND employee_type = '관리자'
        )
    );

DROP POLICY IF EXISTS "Employees manage own journal notes" ON public.work_journal_notes;
CREATE POLICY "Employees manage own or admin journal notes"
    ON public.work_journal_notes TO authenticated
    USING (
        employee_id IN (SELECT id FROM public.employees WHERE auth_uid = auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.employees
            WHERE auth_uid = auth.uid() AND employee_type = '관리자'
        )
    )
    WITH CHECK (
        employee_id IN (SELECT id FROM public.employees WHERE auth_uid = auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.employees
            WHERE auth_uid = auth.uid() AND employee_type = '관리자'
        )
    );

DROP POLICY IF EXISTS "Employees manage own work journal board images" ON public.work_journal_board_images;
CREATE POLICY "Employees manage own or admin work journal board images"
    ON public.work_journal_board_images TO authenticated
    USING (
        employee_id IN (SELECT id FROM public.employees WHERE auth_uid = auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.employees
            WHERE auth_uid = auth.uid() AND employee_type = '관리자'
        )
    )
    WITH CHECK (
        employee_id IN (SELECT id FROM public.employees WHERE auth_uid = auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.employees
            WHERE auth_uid = auth.uid() AND employee_type = '관리자'
        )
    );
