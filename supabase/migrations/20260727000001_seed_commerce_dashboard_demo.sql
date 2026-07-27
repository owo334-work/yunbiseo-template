-- 쇼핑몰 매출 분석 화면 확인용 데모 데이터
-- 실제 데이터와 구분할 수 있도록 스토어명과 SKU에 DEMO 표시를 사용한다.

DO $$
DECLARE
    coupang_store_id uuid := '10000000-0000-0000-0000-000000000001';
    naver_store_id uuid := '10000000-0000-0000-0000-000000000002';
    product_1_id uuid := '20000000-0000-0000-0000-000000000001';
    product_2_id uuid := '20000000-0000-0000-0000-000000000002';
    product_3_id uuid := '20000000-0000-0000-0000-000000000003';
    product_4_id uuid := '20000000-0000-0000-0000-000000000004';
    option_1_id uuid := '30000000-0000-0000-0000-000000000001';
    option_2_id uuid := '30000000-0000-0000-0000-000000000002';
    option_3_id uuid := '30000000-0000-0000-0000-000000000003';
    option_4_id uuid := '30000000-0000-0000-0000-000000000004';
    demo_date date;
    day_index integer;
BEGIN
    INSERT INTO public.commerce_stores (id, channel, store_name, seller_id)
    VALUES
        (coupang_store_id, 'coupang', '[데모] 쿠팡 생활용품 스토어', 'DEMO-COUPANG'),
        (naver_store_id, 'naver', '[데모] 네이버 스마트스토어', 'DEMO-NAVER')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.commerce_products (id, internal_sku, product_name, brand, category)
    VALUES
        (product_1_id, 'DEMO-KITCHEN-01', '[데모] 실리콘 밀폐용기 4종', '윤리빙', '주방용품'),
        (product_2_id, 'DEMO-BATH-01', '[데모] 호텔 수건 10장 세트', '윤리빙', '욕실용품'),
        (product_3_id, 'DEMO-STORAGE-01', '[데모] 접이식 수납함 3개', '윤홈', '수납용품'),
        (product_4_id, 'DEMO-CLEAN-01', '[데모] 다목적 청소포 100매', '윤클린', '생활용품')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.commerce_product_options
        (id, product_id, store_id, option_name, channel_option_id, seller_product_id, exposure_product_id, sale_price)
    VALUES
        (option_1_id, product_1_id, coupang_store_id, '베이지 4종', 'DEMO-VENDOR-001', 'DEMO-SELLER-001', 'DEMO-EXPOSURE-001', 29900),
        (option_2_id, product_2_id, coupang_store_id, '화이트 10장', 'DEMO-VENDOR-002', 'DEMO-SELLER-002', 'DEMO-EXPOSURE-002', 34900),
        (option_3_id, product_3_id, naver_store_id, '아이보리 3개', 'DEMO-NAVER-003', 'DEMO-NAVER-PRODUCT-003', 'DEMO-NAVER-CHANNEL-003', 39900),
        (option_4_id, product_4_id, naver_store_id, '청소포 100매', 'DEMO-NAVER-004', 'DEMO-NAVER-PRODUCT-004', 'DEMO-NAVER-CHANNEL-004', 15900)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.product_cost_history
        (product_id, cost_price, packaging_cost, shipping_cost, other_cost, effective_from)
    VALUES
        (product_1_id, 11200, 700, 3000, 300, CURRENT_DATE - 90),
        (product_2_id, 14800, 900, 3000, 400, CURRENT_DATE - 90),
        (product_3_id, 17600, 1200, 3500, 500, CURRENT_DATE - 90)
    ON CONFLICT (product_id, effective_from) DO NOTHING;

    -- 최근 14일간 상품별 매출. 네 번째 상품은 일부러 원가를 비워 경고도 확인한다.
    FOR day_index IN 0..13 LOOP
        demo_date := CURRENT_DATE - day_index;

        INSERT INTO public.daily_product_sales
            (sales_date, store_id, product_id, product_option_id, order_quantity, cancel_quantity,
             gross_sales, commission_amount, shipping_revenue, source)
        VALUES
            (
                demo_date, coupang_store_id, product_1_id, option_1_id,
                8 + (day_index % 5), CASE WHEN day_index IN (3, 10) THEN 1 ELSE 0 END,
                (8 + (day_index % 5)) * 29900,
                ROUND((8 + (day_index % 5)) * 29900 * 0.108),
                0, 'manual'
            ),
            (
                demo_date, coupang_store_id, product_2_id, option_2_id,
                4 + (day_index % 4), CASE WHEN day_index = 6 THEN 1 ELSE 0 END,
                (4 + (day_index % 4)) * 34900,
                ROUND((4 + (day_index % 4)) * 34900 * 0.115),
                3000 * (4 + (day_index % 4)), 'manual'
            ),
            (
                demo_date, naver_store_id, product_3_id, option_3_id,
                3 + ((day_index * 2) % 5), 0,
                (3 + ((day_index * 2) % 5)) * 39900,
                ROUND((3 + ((day_index * 2) % 5)) * 39900 * 0.061),
                0, 'manual'
            ),
            (
                demo_date, naver_store_id, product_4_id, option_4_id,
                CASE WHEN day_index < 4 THEN 12 + day_index ELSE 5 + (day_index % 4) END,
                CASE WHEN day_index = 2 THEN 2 ELSE 0 END,
                (CASE WHEN day_index < 4 THEN 12 + day_index ELSE 5 + (day_index % 4) END) * 15900,
                ROUND((CASE WHEN day_index < 4 THEN 12 + day_index ELSE 5 + (day_index % 4) END) * 15900 * 0.057),
                0, 'manual'
            )
        ON CONFLICT (sales_date, store_id, product_id, product_option_id)
        DO UPDATE SET
            order_quantity = EXCLUDED.order_quantity,
            cancel_quantity = EXCLUDED.cancel_quantity,
            gross_sales = EXCLUDED.gross_sales,
            commission_amount = EXCLUDED.commission_amount,
            shipping_revenue = EXCLUDED.shipping_revenue;

        INSERT INTO public.daily_ad_costs
            (ad_date, store_id, product_id, ad_cost_ex_vat, vat_amount, impressions, clicks, ad_sales, source)
        VALUES
            (demo_date, coupang_store_id, product_1_id, 28000 + day_index * 700, 2800 + day_index * 70, 7200 + day_index * 40, 165 + day_index, 210000 + day_index * 4500, 'manual'),
            (demo_date, coupang_store_id, product_2_id, 19000 + day_index * 450, 1900 + day_index * 45, 5100 + day_index * 35, 98 + day_index, 145000 + day_index * 3200, 'manual'),
            (demo_date, naver_store_id, product_3_id, 15000 + day_index * 300, 1500 + day_index * 30, 4300 + day_index * 25, 82 + day_index, 118000 + day_index * 2800, 'manual'),
            (demo_date, naver_store_id, product_4_id, 22000 + day_index * 500, 2200 + day_index * 50, 8800 + day_index * 55, 210 + day_index, 185000 + day_index * 3900, 'manual')
        ON CONFLICT (ad_date, store_id, product_id)
        DO UPDATE SET
            ad_cost_ex_vat = EXCLUDED.ad_cost_ex_vat,
            vat_amount = EXCLUDED.vat_amount,
            impressions = EXCLUDED.impressions,
            clicks = EXCLUDED.clicks,
            ad_sales = EXCLUDED.ad_sales;
    END LOOP;

    -- 정상·주의·긴급·품절 상태가 모두 보이도록 재고를 다르게 설정한다.
    INSERT INTO public.inventory_snapshots
        (snapshot_date, store_id, product_option_id, channel_stock, warehouse_stock,
         inbound_quantity, reserved_quantity, source)
    VALUES
        (CURRENT_DATE, coupang_store_id, option_1_id, 180, 45, 60, 8, 'manual'),
        (CURRENT_DATE, coupang_store_id, option_2_id, 28, 8, 40, 3, 'manual'),
        (CURRENT_DATE, naver_store_id, option_3_id, 9, 3, 30, 1, 'manual'),
        (CURRENT_DATE, naver_store_id, option_4_id, 0, 0, 100, 0, 'manual')
    ON CONFLICT (snapshot_date, store_id, product_option_id)
    DO UPDATE SET
        channel_stock = EXCLUDED.channel_stock,
        warehouse_stock = EXCLUDED.warehouse_stock,
        inbound_quantity = EXCLUDED.inbound_quantity,
        reserved_quantity = EXCLUDED.reserved_quantity;

    INSERT INTO public.data_sync_runs
        (store_id, source, sync_type, started_at, finished_at, status, records_received)
    VALUES
        (coupang_store_id, 'demo', 'sales_inventory', now() - interval '2 minutes', now(), 'success', 112),
        (naver_store_id, 'demo', 'sales_inventory', now() - interval '1 minute', now(), 'success', 112);
END
$$;
