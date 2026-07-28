-- 각 PC의 쿠팡 수집기가 Vercel API로 전송한 배치를 추적한다.
-- 쿠팡 로그인 쿠키·아이디·비밀번호는 저장하지 않는다.

CREATE TABLE public.commerce_collector_batches (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    batch_key text NOT NULL UNIQUE,
    device_name text NOT NULL,
    account_key text NOT NULL,
    account_name text NOT NULL,
    account_type text NOT NULL CHECK (account_type IN ('wing_growth', 'rocket')),
    data_types text[] DEFAULT '{}'::text[] NOT NULL,
    period_from date,
    period_to date,
    records_received integer DEFAULT 0 NOT NULL CHECK (records_received >= 0),
    records_processed integer DEFAULT 0 NOT NULL CHECK (records_processed >= 0),
    status text DEFAULT 'received' NOT NULL
        CHECK (status IN ('received', 'processing', 'success', 'failed', 'partial')),
    error_message text,
    received_at timestamptz DEFAULT now() NOT NULL,
    processed_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_commerce_collector_batches_received
    ON public.commerce_collector_batches (received_at DESC);
CREATE INDEX idx_commerce_collector_batches_account
    ON public.commerce_collector_batches (account_key, received_at DESC);

ALTER TABLE public.commerce_collector_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users view commerce collector batches"
    ON public.commerce_collector_batches
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages commerce collector batches"
    ON public.commerce_collector_batches
    TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.commerce_collector_batches TO authenticated;
GRANT ALL ON public.commerce_collector_batches TO service_role;
