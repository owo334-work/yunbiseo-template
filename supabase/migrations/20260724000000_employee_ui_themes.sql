CREATE TABLE IF NOT EXISTS public.employee_ui_themes (
    employee_id uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
    theme jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_ui_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view own UI theme"
    ON public.employee_ui_themes FOR SELECT TO authenticated
    USING (
        employee_id IN (
            SELECT id FROM public.employees WHERE auth_uid = auth.uid()
        )
    );

CREATE POLICY "Employees can create own UI theme"
    ON public.employee_ui_themes FOR INSERT TO authenticated
    WITH CHECK (
        employee_id IN (
            SELECT id FROM public.employees WHERE auth_uid = auth.uid()
        )
    );

CREATE POLICY "Employees can update own UI theme"
    ON public.employee_ui_themes FOR UPDATE TO authenticated
    USING (
        employee_id IN (
            SELECT id FROM public.employees WHERE auth_uid = auth.uid()
        )
    )
    WITH CHECK (
        employee_id IN (
            SELECT id FROM public.employees WHERE auth_uid = auth.uid()
        )
    );

CREATE POLICY "Employees can delete own UI theme"
    ON public.employee_ui_themes FOR DELETE TO authenticated
    USING (
        employee_id IN (
            SELECT id FROM public.employees WHERE auth_uid = auth.uid()
        )
    );

GRANT ALL ON TABLE public.employee_ui_themes TO authenticated, service_role;
