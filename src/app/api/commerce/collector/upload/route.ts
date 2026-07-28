import { createHash } from "node:crypto";

import { type NextRequest } from "next/server";

import { validateApiKey } from "@/lib/api-key";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type AccountType = "wing_growth" | "rocket";

type SalesRow = {
  sales_date?: unknown;
  option_id?: unknown;
  seller_product_id?: unknown;
  sku?: unknown;
  product_name?: unknown;
  option_name?: unknown;
  sales_method?: unknown;
  gross_sales?: unknown;
  order_quantity?: unknown;
  sale_quantity?: unknown;
  cancel_quantity?: unknown;
  commission_amount?: unknown;
  shipping_revenue?: unknown;
};

type InventoryRow = {
  snapshot_date?: unknown;
  option_id?: unknown;
  seller_product_id?: unknown;
  sku?: unknown;
  product_name?: unknown;
  option_name?: unknown;
  sale_price?: unknown;
  channel_stock?: unknown;
  warehouse_stock?: unknown;
  inbound_quantity?: unknown;
  reserved_quantity?: unknown;
};

function text(value: unknown, maxLength = 200) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function integer(value: unknown, fallback = 0) {
  const number =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replaceAll(",", "").replaceAll("원", "").trim());
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validAccountType(value: unknown): value is AccountType {
  return value === "wing_growth" || value === "rocket";
}

function batchKey(payload: Record<string, unknown>) {
  const supplied = text(payload.batch_key, 160);
  if (supplied) return supplied;
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

async function resolveCommerceOption(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
  row: SalesRow | InventoryRow
) {
  const optionId = text(row.option_id, 100);
  if (!optionId) throw new Error("옵션 ID가 비어 있습니다.");

  const productName = text(row.product_name) || `쿠팡 상품 ${optionId}`;
  const optionName = text(row.option_name) || "기본";
  const sku = text(row.sku, 100) || `CP-${optionId}`;

  const { data: existingOption, error: findError } = await admin
    .from("commerce_product_options")
    .select("id, product_id")
    .eq("store_id", storeId)
    .eq("channel_option_id", optionId)
    .maybeSingle();
  if (findError) throw new Error(findError.message);

  if (existingOption) {
    await admin
      .from("commerce_products")
      .update({ product_name: productName, is_active: true })
      .eq("id", existingOption.product_id);
    const { error } = await admin
      .from("commerce_product_options")
      .update({
        option_name: optionName,
        seller_product_id: text(row.seller_product_id, 100) || null,
        sale_price: Math.max(0, integer((row as InventoryRow).sale_price)),
        is_active: true,
      })
      .eq("id", existingOption.id);
    if (error) throw new Error(error.message);
    return { productId: existingOption.product_id, optionId: existingOption.id };
  }

  const { data: product, error: productError } = await admin
    .from("commerce_products")
    .upsert(
      { internal_sku: sku, product_name: productName, is_active: true },
      { onConflict: "internal_sku" }
    )
    .select("id")
    .single();
  if (productError || !product) {
    throw new Error(productError?.message || "상품 저장 실패");
  }

  const { data: option, error: optionError } = await admin
    .from("commerce_product_options")
    .insert({
      product_id: product.id,
      store_id: storeId,
      option_name: optionName,
      channel_option_id: optionId,
      seller_product_id: text(row.seller_product_id, 100) || null,
      sale_price: Math.max(0, integer((row as InventoryRow).sale_price)),
    })
    .select("id")
    .single();
  if (optionError || !option) {
    throw new Error(optionError?.message || "상품 옵션 저장 실패");
  }
  return { productId: product.id, optionId: option.id };
}

export async function POST(request: NextRequest) {
  if (!(await validateApiKey(request))) {
    return Response.json({ error: "Invalid API key" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!payload) {
    return Response.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const deviceName = text(payload.device_name, 80);
  const accountKey = text(payload.account_key, 120);
  const accountName = text(payload.account_name, 80);
  const accountType = payload.account_type;
  const sales = Array.isArray(payload.sales) ? (payload.sales as SalesRow[]) : [];
  const inventory = Array.isArray(payload.inventory)
    ? (payload.inventory as InventoryRow[])
    : [];

  if (!deviceName || !accountKey || !accountName || !validAccountType(accountType)) {
    return Response.json(
      { error: "device_name, account_key, account_name, account_type이 필요합니다." },
      { status: 400 }
    );
  }
  if (sales.length + inventory.length === 0) {
    return Response.json({ error: "전송할 판매 또는 재고 데이터가 없습니다." }, { status: 400 });
  }
  if (sales.length + inventory.length > 5_000) {
    return Response.json({ error: "한 번에 최대 5,000행까지 전송할 수 있습니다." }, { status: 413 });
  }
  if (sales.some((row) => !validDate(row.sales_date))) {
    return Response.json(
      { error: "모든 판매 행에 YYYY-MM-DD 형식의 sales_date가 필요합니다." },
      { status: 400 }
    );
  }
  if (inventory.some((row) => !validDate(row.snapshot_date))) {
    return Response.json(
      { error: "모든 재고 행에 YYYY-MM-DD 형식의 snapshot_date가 필요합니다." },
      { status: 400 }
    );
  }

  const dates = [
    ...sales.map((row) => String(row.sales_date)),
    ...inventory.map((row) => String(row.snapshot_date)),
  ].sort();
  const key = batchKey(payload);
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("commerce_collector_batches")
    .select("id, status, records_processed")
    .eq("batch_key", key)
    .maybeSingle();
  if (existing?.status === "success") {
    return Response.json({
      success: true,
      duplicate: true,
      processed: existing.records_processed,
      message: "이미 반영된 수집 배치입니다.",
    });
  }

  const dataTypes = [
    ...(sales.length ? ["sales"] : []),
    ...(inventory.length ? ["inventory"] : []),
  ];
  const { data: batch, error: batchError } = await admin
    .from("commerce_collector_batches")
    .upsert(
      {
        batch_key: key,
        device_name: deviceName,
        account_key: accountKey,
        account_name: accountName,
        account_type: accountType,
        data_types: dataTypes,
        period_from: dates[0],
        period_to: dates.at(-1),
        records_received: sales.length + inventory.length,
        records_processed: 0,
        status: "processing",
        error_message: null,
        processed_at: null,
      },
      { onConflict: "batch_key" }
    )
    .select("id")
    .single();
  if (batchError || !batch) {
    return Response.json({ error: batchError?.message || "배치 저장 실패" }, { status: 500 });
  }

  let processed = 0;
  try {
    const { data: store, error: storeError } = await admin
      .from("commerce_stores")
      .upsert(
        {
          channel: "coupang",
          store_name: accountName,
          seller_id: accountKey,
          is_active: true,
        },
        { onConflict: "channel,store_name" }
      )
      .select("id")
      .single();
    if (storeError || !store) {
      throw new Error(storeError?.message || "스토어 저장 실패");
    }

    for (const row of sales) {
      const ids = await resolveCommerceOption(admin, store.id, row);
      const orderQuantity = Math.max(
        0,
        integer(row.sale_quantity, integer(row.order_quantity))
      );
      const { error } = await admin.from("daily_product_sales").upsert(
        {
          sales_date: row.sales_date,
          store_id: store.id,
          product_id: ids.productId,
          product_option_id: ids.optionId,
          order_quantity: orderQuantity,
          cancel_quantity: Math.max(0, integer(row.cancel_quantity)),
          gross_sales: integer(row.gross_sales),
          commission_amount: Math.max(0, integer(row.commission_amount)),
          shipping_revenue: integer(row.shipping_revenue),
          source: "api",
        },
        { onConflict: "sales_date,store_id,product_id,product_option_id" }
      );
      if (error) throw new Error(error.message);
      processed += 1;
    }

    for (const row of inventory) {
      const ids = await resolveCommerceOption(admin, store.id, row);
      const { error } = await admin.from("inventory_snapshots").upsert(
        {
          snapshot_date: row.snapshot_date,
          store_id: store.id,
          product_option_id: ids.optionId,
          channel_stock: Math.max(0, integer(row.channel_stock)),
          warehouse_stock: Math.max(0, integer(row.warehouse_stock)),
          inbound_quantity: Math.max(0, integer(row.inbound_quantity)),
          reserved_quantity: Math.max(0, integer(row.reserved_quantity)),
          source: "api",
        },
        { onConflict: "snapshot_date,store_id,product_option_id" }
      );
      if (error) throw new Error(error.message);
      processed += 1;
    }

    await admin
      .from("commerce_collector_batches")
      .update({
        status: "success",
        records_processed: processed,
        processed_at: new Date().toISOString(),
      })
      .eq("id", batch.id);

    return Response.json({
      success: true,
      duplicate: false,
      processed,
      message: `${accountName} 판매 ${sales.length}행, 재고 ${inventory.length}행을 반영했습니다.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "수집 데이터 처리 실패";
    await admin
      .from("commerce_collector_batches")
      .update({
        status: processed > 0 ? "partial" : "failed",
        records_processed: processed,
        error_message: message,
        processed_at: new Date().toISOString(),
      })
      .eq("id", batch.id);
    return Response.json({ error: message, processed }, { status: 500 });
  }
}
