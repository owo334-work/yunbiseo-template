import { createAdminClient } from "@/lib/supabase/admin";
import { decryptApiKey, encryptApiKey } from "@/lib/api-key-secret";
import {
  createRouteAuthErrorResponse,
  requireRouteUser,
} from "@/lib/route-auth";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET() {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) return createRouteAuthErrorResponse(authUnavailable);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("commerce_integrations")
    .select(
      "vendor_id, access_key_encrypted, secret_key_encrypted, is_active, last_tested_at, last_test_status, last_test_message, last_synced_at"
    )
    .eq("channel", "coupang")
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ configured: false });

  let accessKey = "";
  try {
    accessKey = decryptApiKey(data.access_key_encrypted);
  } catch {
    // 손상된 키는 노출하지 않고 재입력을 유도한다.
  }

  return Response.json({
    configured: true,
    vendor_id: data.vendor_id,
    access_key_hint: accessKey ? `${accessKey.slice(0, 4)}••••${accessKey.slice(-4)}` : "",
    is_active: data.is_active,
    last_tested_at: data.last_tested_at,
    last_test_status: data.last_test_status,
    last_test_message: data.last_test_message,
    last_synced_at: data.last_synced_at,
  });
}

export async function PUT(request: Request) {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) return createRouteAuthErrorResponse(authUnavailable);

  const body = await request.json();
  const vendorId = text(body.vendor_id);
  const accessKey = text(body.access_key);
  const secretKey = text(body.secret_key);

  if (!vendorId) {
    return Response.json({ error: "판매자 ID를 입력해주세요." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("commerce_integrations")
    .select("access_key_encrypted, secret_key_encrypted")
    .eq("channel", "coupang")
    .maybeSingle();

  if (existingError) {
    return Response.json({ error: existingError.message }, { status: 500 });
  }
  if (!existing && (!accessKey || !secretKey)) {
    return Response.json(
      { error: "처음 연결할 때는 Access Key와 Secret Key가 모두 필요합니다." },
      { status: 400 }
    );
  }

  const { data: store, error: storeError } = await admin
    .from("commerce_stores")
    .upsert(
      {
        channel: "coupang",
        store_name: `쿠팡 ${vendorId}`,
        seller_id: vendorId,
        is_active: true,
      },
      { onConflict: "channel,store_name" }
    )
    .select("id")
    .single();
  if (storeError) return Response.json({ error: storeError.message }, { status: 500 });

  const { error } = await admin.from("commerce_integrations").upsert(
    {
      channel: "coupang",
      store_id: store.id,
      vendor_id: vendorId,
      access_key_encrypted: accessKey
        ? encryptApiKey(accessKey)
        : existing?.access_key_encrypted,
      secret_key_encrypted: secretKey
        ? encryptApiKey(secretKey)
        : existing?.secret_key_encrypted,
      is_active: true,
      last_test_status: null,
      last_test_message: null,
    },
    { onConflict: "channel" }
  );

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
