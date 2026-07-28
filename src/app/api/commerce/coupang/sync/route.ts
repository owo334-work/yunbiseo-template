import { createAdminClient } from "@/lib/supabase/admin";
import { decryptApiKey } from "@/lib/api-key-secret";
import {
  fetchCoupangRevenueHistory,
  type CoupangRevenueRow,
} from "@/lib/coupang-open-api";
import {
  createRouteAuthErrorResponse,
  requireRouteUser,
} from "@/lib/route-auth";

interface Aggregate {
  date: string;
  vendorItemId: string;
  sku: string;
  productName: string;
  optionName: string;
  salePrice: number;
  orderQuantity: number;
  cancelQuantity: number;
  grossSales: number;
  commissionAmount: number;
  shippingRevenue: number;
}

function dateDaysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function aggregateRows(rows: CoupangRevenueRow[]) {
  const map = new Map<string, Aggregate>();

  for (const revenue of rows) {
    for (const [itemIndex, item] of (revenue.items ?? []).entries()) {
      const vendorItemId = String(item.vendorItemId);
      const key = `${revenue.recognitionDate}:${vendorItemId}`;
      const current = map.get(key) ?? {
        date: revenue.recognitionDate,
        vendorItemId,
        sku: item.externalSellerSkuCode?.trim() || `CP-${vendorItemId}`,
        productName: item.productName || `쿠팡 상품 ${vendorItemId}`,
        optionName: item.vendorItemName || "기본",
        salePrice: item.quantity ? Math.round(Math.abs(item.salePrice) / item.quantity) : 0,
        orderQuantity: 0,
        cancelQuantity: 0,
        grossSales: 0,
        commissionAmount: 0,
        shippingRevenue: 0,
      };

      const refund = revenue.saleType === "REFUND";
      const quantity = Math.abs(Number(item.quantity) || 0);
      const saleAmount = Math.abs(Number(item.saleAmount) || 0);
      const commission =
        Math.abs(Number(item.serviceFee) || 0) +
        Math.abs(Number(item.serviceFeeVat) || 0);
      const deliveryAmount =
        itemIndex === 0 ? Math.abs(Number(revenue.deliveryFee?.amount) || 0) : 0;

      if (refund) {
        current.cancelQuantity += quantity;
        current.grossSales -= saleAmount;
        current.commissionAmount = Math.max(0, current.commissionAmount - commission);
        current.shippingRevenue -= deliveryAmount;
      } else {
        current.orderQuantity += quantity;
        current.grossSales += saleAmount;
        current.commissionAmount += commission;
        current.shippingRevenue += deliveryAmount;
      }
      map.set(key, current);
    }
  }

  return [...map.values()];
}

export async function POST(request: Request) {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) return createRouteAuthErrorResponse(authUnavailable);

  const body = await request.json().catch(() => ({}));
  const dateFrom = validDate(body.date_from) ? body.date_from : dateDaysAgo(7);
  const dateTo = validDate(body.date_to) ? body.date_to : dateDaysAgo(1);
  const fromTime = new Date(`${dateFrom}T00:00:00Z`).getTime();
  const toTime = new Date(`${dateTo}T00:00:00Z`).getTime();
  if (fromTime > toTime || (toTime - fromTime) / 86_400_000 > 30) {
    return Response.json(
      { error: "조회 기간은 전일까지, 최대 31일 이내로 선택해주세요." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: integration, error: integrationError } = await admin
    .from("commerce_integrations")
    .select("store_id, vendor_id, access_key_encrypted, secret_key_encrypted")
    .eq("channel", "coupang")
    .eq("is_active", true)
    .maybeSingle();

  if (integrationError) {
    return Response.json({ error: integrationError.message }, { status: 500 });
  }
  if (!integration?.store_id) {
    return Response.json({ error: "쿠팡 연결 정보를 먼저 저장해주세요." }, { status: 400 });
  }

  const { data: run, error: runError } = await admin
    .from("data_sync_runs")
    .insert({
      store_id: integration.store_id,
      source: "coupang",
      sync_type: "revenue",
      status: "running",
    })
    .select("id")
    .single();
  if (runError) return Response.json({ error: runError.message }, { status: 500 });

  try {
    const rows = await fetchCoupangRevenueHistory(
      {
        vendorId: integration.vendor_id,
        accessKey: decryptApiKey(integration.access_key_encrypted),
        secretKey: decryptApiKey(integration.secret_key_encrypted),
      },
      dateFrom,
      dateTo
    );
    const aggregates = aggregateRows(rows);

    for (const aggregate of aggregates) {
      const { data: product, error: productError } = await admin
        .from("commerce_products")
        .upsert(
          {
            internal_sku: aggregate.sku,
            product_name: aggregate.productName,
            is_active: true,
          },
          { onConflict: "internal_sku" }
        )
        .select("id")
        .single();
      if (productError || !product) throw new Error(productError?.message || "상품 저장 실패");

      const { data: existingOption, error: optionFindError } = await admin
        .from("commerce_product_options")
        .select("id")
        .eq("store_id", integration.store_id)
        .eq("channel_option_id", aggregate.vendorItemId)
        .maybeSingle();
      if (optionFindError) throw new Error(optionFindError.message);

      let optionId = existingOption?.id;
      if (optionId) {
        const { error } = await admin
          .from("commerce_product_options")
          .update({
            product_id: product.id,
            option_name: aggregate.optionName,
            exposure_product_id: null,
            sale_price: aggregate.salePrice,
            is_active: true,
          })
          .eq("id", optionId);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await admin
          .from("commerce_product_options")
          .insert({
            product_id: product.id,
            store_id: integration.store_id,
            option_name: aggregate.optionName,
            channel_option_id: aggregate.vendorItemId,
            sale_price: aggregate.salePrice,
          })
          .select("id")
          .single();
        if (error || !data) throw new Error(error?.message || "상품 옵션 저장 실패");
        optionId = data.id;
      }

      const { error: salesError } = await admin.from("daily_product_sales").upsert(
        {
          sales_date: aggregate.date,
          store_id: integration.store_id,
          product_id: product.id,
          product_option_id: optionId,
          order_quantity: aggregate.orderQuantity,
          cancel_quantity: aggregate.cancelQuantity,
          gross_sales: aggregate.grossSales,
          commission_amount: Math.max(0, aggregate.commissionAmount),
          shipping_revenue: aggregate.shippingRevenue,
          source: "api",
        },
        { onConflict: "sales_date,store_id,product_id,product_option_id" }
      );
      if (salesError) throw new Error(salesError.message);
    }

    const finishedAt = new Date().toISOString();
    await Promise.all([
      admin
        .from("data_sync_runs")
        .update({
          finished_at: finishedAt,
          status: "success",
          records_received: rows.length,
          records_failed: 0,
        })
        .eq("id", run.id),
      admin
        .from("commerce_integrations")
        .update({ last_synced_at: finishedAt })
        .eq("channel", "coupang"),
    ]);

    return Response.json({
      success: true,
      message: `${dateFrom}~${dateTo} 쿠팡 매출 ${rows.length}건, 상품별 일 집계 ${aggregates.length}건을 반영했습니다.`,
      received: rows.length,
      aggregated: aggregates.length,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "쿠팡 매출 동기화 실패";
    await admin
      .from("data_sync_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "failed",
        records_failed: 1,
        error_message: message,
      })
      .eq("id", run.id);
    return Response.json({ error: message }, { status: 502 });
  }
}
