-- 자유 메모보드 클립보드 이미지 첨부
ALTER TABLE public.work_journal_notes
    ADD COLUMN IF NOT EXISTS image_paths text[] NOT NULL DEFAULT '{}'::text[];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'work-journal-images',
    'work-journal-images',
    true,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Employees upload own work journal images"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'work-journal-images'
        AND EXISTS (
            SELECT 1 FROM public.employees employee
            WHERE employee.auth_uid = auth.uid()
              AND employee.id::text = (storage.foldername(name))[1]
        )
    );

CREATE POLICY "Employees update own work journal images"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
        bucket_id = 'work-journal-images'
        AND EXISTS (
            SELECT 1 FROM public.employees employee
            WHERE employee.auth_uid = auth.uid()
              AND employee.id::text = (storage.foldername(name))[1]
        )
    );

CREATE POLICY "Employees delete own work journal images"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'work-journal-images'
        AND EXISTS (
            SELECT 1 FROM public.employees employee
            WHERE employee.auth_uid = auth.uid()
              AND employee.id::text = (storage.foldername(name))[1]
        )
    );
