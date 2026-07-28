-- 쿠팡 판매분석의 최근 30일 합계는 일별 매출과 분리해 보관한다.
CREATE TABLE public.commerce_sales_period_snapshots (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    report_as_of date NOT NULL,
    period_from date NOT NULL,
    period_to date NOT NULL,
    period_kind text NOT NULL CHECK (period_kind IN ('recent_30_days')),
    store_id uuid NOT NULL REFERENCES public.commerce_stores(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES public.commerce_products(id) ON DELETE CASCADE,
    product_option_id uuid NOT NULL REFERENCES public.commerce_product_options(id) ON DELETE CASCADE,
    order_quantity integer DEFAULT 0 NOT NULL CHECK (order_quantity >= 0),
    sale_quantity integer DEFAULT 0 NOT NULL CHECK (sale_quantity >= 0),
    cancel_quantity integer DEFAULT 0 NOT NULL CHECK (cancel_quantity >= 0),
    gross_sales bigint DEFAULT 0 NOT NULL,
    total_sales bigint DEFAULT 0 NOT NULL,
    cancel_amount bigint DEFAULT 0 NOT NULL CHECK (cancel_amount >= 0),
    source text DEFAULT 'api' NOT NULL CHECK (source IN ('csv', 'api')),
    collected_at timestamptz DEFAULT now() NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CHECK (period_to >= period_from),
    UNIQUE (report_as_of, period_kind, store_id, product_option_id)
);

CREATE INDEX idx_commerce_period_snapshots_store_date
    ON public.commerce_sales_period_snapshots (store_id, report_as_of DESC);

ALTER TABLE public.commerce_sales_period_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users view commerce sales period snapshots"
    ON public.commerce_sales_period_snapshots
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages commerce sales period snapshots"
    ON public.commerce_sales_period_snapshots
    TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.commerce_sales_period_snapshots TO authenticated;
GRANT ALL ON public.commerce_sales_period_snapshots TO service_role;
