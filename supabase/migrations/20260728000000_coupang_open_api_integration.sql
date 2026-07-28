-- 쿠팡 Open API 연결 정보
-- 비밀키는 애플리케이션에서 AES-256-GCM으로 암호화한 값만 저장한다.

CREATE TABLE public.commerce_integrations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    channel text NOT NULL UNIQUE CHECK (channel IN ('coupang', 'naver')),
    store_id uuid REFERENCES public.commerce_stores(id) ON DELETE SET NULL,
    vendor_id text NOT NULL,
    access_key_encrypted text NOT NULL,
    secret_key_encrypted text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_tested_at timestamptz,
    last_test_status text CHECK (last_test_status IN ('success', 'failed')),
    last_test_message text,
    last_synced_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TRIGGER commerce_integrations_updated_at
    BEFORE UPDATE ON public.commerce_integrations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.commerce_integrations ENABLE ROW LEVEL SECURITY;

-- 브라우저에서 비밀값을 직접 읽을 수 없도록 service_role만 접근한다.
CREATE POLICY "Service role manages commerce integrations"
    ON public.commerce_integrations
    TO service_role
    USING (true)
    WITH CHECK (true);

GRANT ALL ON public.commerce_integrations TO service_role;
