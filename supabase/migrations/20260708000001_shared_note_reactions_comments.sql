-- 공유 정보란(shared_notes)에 반응(읽음/긍정/부정)과 댓글 기능 추가
-- 반응: 한 사람당 한 글에 하나(읽음 read / 긍정 up / 부정 down), 토글·변경 가능
-- 댓글: 글에 대한 코멘트 (작성자 본인/관리자만 삭제)
-- 열람·작성 권한은 부모 글(shared_notes)의 가시성 규칙을 그대로 따른다.

-- ── 반응 ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shared_note_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    kind text NOT NULL,           -- 'read'(읽음) | 'up'(긍정) | 'down'(부정)
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shared_note_reactions_pkey PRIMARY KEY (id),
    CONSTRAINT shared_note_reactions_kind_check CHECK (kind = ANY (ARRAY['read'::text, 'up'::text, 'down'::text])),
    CONSTRAINT shared_note_reactions_note_fkey FOREIGN KEY (note_id)
        REFERENCES public.shared_notes(id) ON DELETE CASCADE,
    CONSTRAINT shared_note_reactions_emp_fkey FOREIGN KEY (employee_id)
        REFERENCES public.employees(id) ON DELETE CASCADE,
    CONSTRAINT shared_note_reactions_unique UNIQUE (note_id, employee_id)
);

CREATE INDEX IF NOT EXISTS shared_note_reactions_note_idx
    ON public.shared_note_reactions USING btree (note_id);

ALTER TABLE public.shared_note_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View shared_note_reactions"
    ON public.shared_note_reactions FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.shared_notes n
            WHERE n.id = shared_note_reactions.note_id AND (
                n.scope = 'company'
                OR (n.scope = 'team' AND EXISTS (
                    SELECT 1 FROM public.employees e
                    WHERE e.auth_uid = auth.uid() AND e.department = n.team_key
                ))
            )
        )
    );

CREATE POLICY "Insert shared_note_reactions"
    ON public.shared_note_reactions FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = shared_note_reactions.employee_id AND e.auth_uid = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM public.shared_notes n
            WHERE n.id = shared_note_reactions.note_id AND (
                n.scope = 'company'
                OR (n.scope = 'team' AND EXISTS (
                    SELECT 1 FROM public.employees e
                    WHERE e.auth_uid = auth.uid() AND e.department = n.team_key
                ))
            )
        )
    );

CREATE POLICY "Update shared_note_reactions"
    ON public.shared_note_reactions FOR UPDATE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = shared_note_reactions.employee_id AND e.auth_uid = auth.uid()
        )
    );

CREATE POLICY "Delete shared_note_reactions"
    ON public.shared_note_reactions FOR DELETE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = shared_note_reactions.employee_id AND e.auth_uid = auth.uid()
        )
    );

-- ── 댓글 ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shared_note_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_id uuid NOT NULL,
    content text NOT NULL,
    author_employee_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shared_note_comments_pkey PRIMARY KEY (id),
    CONSTRAINT shared_note_comments_note_fkey FOREIGN KEY (note_id)
        REFERENCES public.shared_notes(id) ON DELETE CASCADE,
    CONSTRAINT shared_note_comments_author_fkey FOREIGN KEY (author_employee_id)
        REFERENCES public.employees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS shared_note_comments_note_idx
    ON public.shared_note_comments USING btree (note_id, created_at);

CREATE TRIGGER shared_note_comments_updated_at
    BEFORE UPDATE ON public.shared_note_comments
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.shared_note_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View shared_note_comments"
    ON public.shared_note_comments FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.shared_notes n
            WHERE n.id = shared_note_comments.note_id AND (
                n.scope = 'company'
                OR (n.scope = 'team' AND EXISTS (
                    SELECT 1 FROM public.employees e
                    WHERE e.auth_uid = auth.uid() AND e.department = n.team_key
                ))
            )
        )
    );

CREATE POLICY "Insert shared_note_comments"
    ON public.shared_note_comments FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = shared_note_comments.author_employee_id AND e.auth_uid = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM public.shared_notes n
            WHERE n.id = shared_note_comments.note_id AND (
                n.scope = 'company'
                OR (n.scope = 'team' AND EXISTS (
                    SELECT 1 FROM public.employees e
                    WHERE e.auth_uid = auth.uid() AND e.department = n.team_key
                ))
            )
        )
    );

CREATE POLICY "Update shared_note_comments"
    ON public.shared_note_comments FOR UPDATE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = shared_note_comments.author_employee_id AND e.auth_uid = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.auth_uid = auth.uid() AND e.employee_type = '관리자'::text
        )
    );

CREATE POLICY "Delete shared_note_comments"
    ON public.shared_note_comments FOR DELETE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = shared_note_comments.author_employee_id AND e.auth_uid = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.auth_uid = auth.uid() AND e.employee_type = '관리자'::text
        )
    );
