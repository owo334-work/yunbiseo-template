-- 쇼핑몰 통합 매출 대시보드 1차 스키마
-- 원본 주문/API 연동 전에도 수동 입력으로 일별 손익과 품절예측을 검증할 수 있다.

CREATE TABLE public.commerce_stores (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    channel text NOT NULL CHECK (channel IN ('coupang', 'naver', 'manual')),
    store_name text NOT NULL,
    seller_id text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (channel, store_name)
);

CREATE TABLE public.commerce_products (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    internal_sku text NOT NULL UNIQUE,
    product_name text NOT NULL,
    brand text,
    category text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.commerce_product_options (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid NOT NULL REFERENCES public.commerce_products(id) ON DELETE CASCADE,
    store_id uuid NOT NULL REFERENCES public.commerce_stores(id) ON DELETE CASCADE,
    option_name text NOT NULL DEFAULT '기본',
    channel_option_id text,
    seller_product_id text,
    exposure_product_id text,
    barcode text,
    sale_price bigint DEFAULT 0 NOT NULL CHECK (sale_price >= 0),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (store_id, channel_option_id)
);

CREATE TABLE public.product_cost_history (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid NOT NULL REFERENCES public.commerce_products(id) ON DELETE CASCADE,
    cost_price bigint DEFAULT 0 NOT NULL CHECK (cost_price >= 0),
    packaging_cost bigint DEFAULT 0 NOT NULL CHECK (packaging_cost >= 0),
    shipping_cost bigint DEFAULT 0 NOT NULL CHECK (shipping_cost >= 0),
    other_cost bigint DEFAULT 0 NOT NULL CHECK (other_cost >= 0),
    effective_from date NOT NULL,
    effective_to date,
    created_at timestamptz DEFAULT now() NOT NULL,
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    UNIQUE (product_id, effective_from)
);

CREATE TABLE public.daily_product_sales (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    sales_date date NOT NULL,
    store_id uuid NOT NULL REFERENCES public.commerce_stores(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES public.commerce_products(id) ON DELETE CASCADE,
    product_option_id uuid REFERENCES public.commerce_product_options(id) ON DELETE SET NULL,
    order_quantity integer DEFAULT 0 NOT NULL CHECK (order_quantity >= 0),
    cancel_quantity integer DEFAULT 0 NOT NULL CHECK (cancel_quantity >= 0),
    gross_sales bigint DEFAULT 0 NOT NULL,
    commission_amount bigint DEFAULT 0 NOT NULL CHECK (commission_amount >= 0),
    shipping_revenue bigint DEFAULT 0 NOT NULL,
    source text DEFAULT 'manual' NOT NULL CHECK (source IN ('manual', 'csv', 'api')),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE NULLS NOT DISTINCT (sales_date, store_id, product_id, product_option_id)
);

CREATE TABLE public.daily_ad_costs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    ad_date date NOT NULL,
    store_id uuid NOT NULL REFERENCES public.commerce_stores(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.commerce_products(id) ON DELETE SET NULL,
    ad_cost_ex_vat bigint DEFAULT 0 NOT NULL CHECK (ad_cost_ex_vat >= 0),
    vat_amount bigint DEFAULT 0 NOT NULL CHECK (vat_amount >= 0),
    impressions bigint DEFAULT 0 NOT NULL CHECK (impressions >= 0),
    clicks bigint DEFAULT 0 NOT NULL CHECK (clicks >= 0),
    ad_sales bigint DEFAULT 0 NOT NULL CHECK (ad_sales >= 0),
    source text DEFAULT 'manual' NOT NULL CHECK (source IN ('manual', 'csv', 'api')),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE NULLS NOT DISTINCT (ad_date, store_id, product_id)
);

CREATE TABLE public.inventory_snapshots (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    snapshot_date date NOT NULL,
    snapshot_at timestamptz DEFAULT now() NOT NULL,
    store_id uuid NOT NULL REFERENCES public.commerce_stores(id) ON DELETE CASCADE,
    product_option_id uuid NOT NULL REFERENCES public.commerce_product_options(id) ON DELETE CASCADE,
    channel_stock integer DEFAULT 0 NOT NULL CHECK (channel_stock >= 0),
    warehouse_stock integer DEFAULT 0 NOT NULL CHECK (warehouse_stock >= 0),
    inbound_quantity integer DEFAULT 0 NOT NULL CHECK (inbound_quantity >= 0),
    reserved_quantity integer DEFAULT 0 NOT NULL CHECK (reserved_quantity >= 0),
    source text DEFAULT 'manual' NOT NULL CHECK (source IN ('manual', 'csv', 'api')),
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (snapshot_date, store_id, product_option_id)
);

CREATE TABLE public.data_sync_runs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id uuid REFERENCES public.commerce_stores(id) ON DELETE SET NULL,
    source text NOT NULL,
    sync_type text NOT NULL,
    started_at timestamptz DEFAULT now() NOT NULL,
    finished_at timestamptz,
    status text DEFAULT 'running' NOT NULL CHECK (status IN ('running', 'success', 'failed', 'partial')),
    records_received integer DEFAULT 0 NOT NULL CHECK (records_received >= 0),
    records_failed integer DEFAULT 0 NOT NULL CHECK (records_failed >= 0),
    error_message text,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_daily_product_sales_date ON public.daily_product_sales (sales_date DESC);
CREATE INDEX idx_daily_product_sales_product ON public.daily_product_sales (product_id, sales_date DESC);
CREATE INDEX idx_daily_ad_costs_date ON public.daily_ad_costs (ad_date DESC);
CREATE INDEX idx_inventory_snapshots_option_date ON public.inventory_snapshots (product_option_id, snapshot_date DESC);
CREATE INDEX idx_product_cost_history_effective ON public.product_cost_history (product_id, effective_from DESC);
CREATE INDEX idx_data_sync_runs_started ON public.data_sync_runs (started_at DESC);

CREATE OR REPLACE VIEW public.commerce_daily_product_metrics AS
SELECT
    sales.id,
    sales.sales_date,
    sales.store_id,
    stores.channel,
    stores.store_name,
    sales.product_id,
    products.internal_sku,
    products.product_name,
    sales.product_option_id,
    options.option_name,
    sales.order_quantity,
    sales.cancel_quantity,
    GREATEST(sales.order_quantity - sales.cancel_quantity, 0) AS net_quantity,
    sales.gross_sales,
    sales.shipping_revenue,
    sales.commission_amount,
    COALESCE(costs.cost_price, 0) AS unit_cost_price,
    COALESCE(costs.packaging_cost, 0) AS unit_packaging_cost,
    COALESCE(costs.shipping_cost, 0) AS unit_shipping_cost,
    COALESCE(costs.other_cost, 0) AS unit_other_cost,
    GREATEST(sales.order_quantity - sales.cancel_quantity, 0)
      * (COALESCE(costs.cost_price, 0)
       + COALESCE(costs.packaging_cost, 0)
       + COALESCE(costs.shipping_cost, 0)
       + COALESCE(costs.other_cost, 0)) AS total_cost,
    sales.gross_sales + sales.shipping_revenue - sales.commission_amount
      - GREATEST(sales.order_quantity - sales.cancel_quantity, 0)
        * (COALESCE(costs.cost_price, 0)
         + COALESCE(costs.packaging_cost, 0)
         + COALESCE(costs.shipping_cost, 0)
         + COALESCE(costs.other_cost, 0)) AS profit_before_ads,
    costs.id IS NULL AS is_cost_missing
FROM public.daily_product_sales sales
JOIN public.commerce_stores stores ON stores.id = sales.store_id
JOIN public.commerce_products products ON products.id = sales.product_id
LEFT JOIN public.commerce_product_options options ON options.id = sales.product_option_id
LEFT JOIN LATERAL (
    SELECT cost.*
    FROM public.product_cost_history cost
    WHERE cost.product_id = sales.product_id
      AND cost.effective_from <= sales.sales_date
      AND (cost.effective_to IS NULL OR cost.effective_to >= sales.sales_date)
    ORDER BY cost.effective_from DESC
    LIMIT 1
) costs ON true;

CREATE OR REPLACE VIEW public.commerce_stockout_forecasts AS
WITH latest_inventory AS (
    SELECT DISTINCT ON (snapshot.product_option_id)
        snapshot.product_option_id,
        snapshot.store_id,
        snapshot.snapshot_date,
        snapshot.channel_stock,
        snapshot.warehouse_stock,
        snapshot.inbound_quantity,
        snapshot.reserved_quantity
    FROM public.inventory_snapshots snapshot
    ORDER BY snapshot.product_option_id, snapshot.snapshot_date DESC, snapshot.snapshot_at DESC
),
sales_7d AS (
    SELECT
        sales.product_option_id,
        SUM(GREATEST(sales.order_quantity - sales.cancel_quantity, 0))::integer AS net_quantity_7d
    FROM public.daily_product_sales sales
    WHERE sales.product_option_id IS NOT NULL
      AND sales.sales_date >= CURRENT_DATE - 6
    GROUP BY sales.product_option_id
)
SELECT
    inventory.product_option_id,
    options.product_id,
    inventory.store_id,
    products.internal_sku,
    products.product_name,
    options.option_name,
    inventory.snapshot_date,
    GREATEST(
        inventory.channel_stock + inventory.warehouse_stock
        - inventory.reserved_quantity,
        0
    ) AS available_quantity,
    inventory.inbound_quantity,
    COALESCE(sales.net_quantity_7d, 0) AS sales_7d,
    ROUND(COALESCE(sales.net_quantity_7d, 0)::numeric / 7, 2) AS avg_daily_sales_7d,
    CASE
        WHEN GREATEST(inventory.channel_stock + inventory.warehouse_stock - inventory.reserved_quantity, 0) = 0 THEN 0
        WHEN COALESCE(sales.net_quantity_7d, 0) = 0 THEN NULL
        ELSE CEIL(
            GREATEST(inventory.channel_stock + inventory.warehouse_stock - inventory.reserved_quantity, 0)
            / (sales.net_quantity_7d::numeric / 7)
        )::integer
    END AS days_until_stockout,
    CASE
        WHEN GREATEST(inventory.channel_stock + inventory.warehouse_stock - inventory.reserved_quantity, 0) = 0 THEN 'out_of_stock'
        WHEN COALESCE(sales.net_quantity_7d, 0) = 0 THEN 'no_sales'
        WHEN CEIL(
            GREATEST(inventory.channel_stock + inventory.warehouse_stock - inventory.reserved_quantity, 0)
            / (sales.net_quantity_7d::numeric / 7)
        ) <= 3 THEN 'critical'
        WHEN CEIL(
            GREATEST(inventory.channel_stock + inventory.warehouse_stock - inventory.reserved_quantity, 0)
            / (sales.net_quantity_7d::numeric / 7)
        ) <= 7 THEN 'warning'
        ELSE 'normal'
    END AS status
FROM latest_inventory inventory
JOIN public.commerce_product_options options ON options.id = inventory.product_option_id
JOIN public.commerce_products products ON products.id = options.product_id
LEFT JOIN sales_7d sales ON sales.product_option_id = inventory.product_option_id;

CREATE TRIGGER commerce_stores_updated_at
    BEFORE UPDATE ON public.commerce_stores
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER commerce_products_updated_at
    BEFORE UPDATE ON public.commerce_products
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER commerce_product_options_updated_at
    BEFORE UPDATE ON public.commerce_product_options
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER daily_product_sales_updated_at
    BEFORE UPDATE ON public.daily_product_sales
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER daily_ad_costs_updated_at
    BEFORE UPDATE ON public.daily_ad_costs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.commerce_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_product_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_cost_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_product_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_ad_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage commerce stores"
    ON public.commerce_stores TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage commerce products"
    ON public.commerce_products TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage commerce product options"
    ON public.commerce_product_options TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage product costs"
    ON public.product_cost_history TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage daily product sales"
    ON public.daily_product_sales TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage daily ad costs"
    ON public.daily_ad_costs TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage inventory snapshots"
    ON public.inventory_snapshots TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users view sync runs"
    ON public.data_sync_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages sync runs"
    ON public.data_sync_runs TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON public.commerce_stores TO authenticated, service_role;
GRANT ALL ON public.commerce_products TO authenticated, service_role;
GRANT ALL ON public.commerce_product_options TO authenticated, service_role;
GRANT ALL ON public.product_cost_history TO authenticated, service_role;
GRANT ALL ON public.daily_product_sales TO authenticated, service_role;
GRANT ALL ON public.daily_ad_costs TO authenticated, service_role;
GRANT ALL ON public.inventory_snapshots TO authenticated, service_role;
GRANT ALL ON public.data_sync_runs TO service_role;
GRANT SELECT ON public.data_sync_runs TO authenticated;
GRANT SELECT ON public.commerce_daily_product_metrics TO authenticated, service_role;
GRANT SELECT ON public.commerce_stockout_forecasts TO authenticated, service_role;
