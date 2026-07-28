import { createAdminClient } from "@/lib/supabase/admin";
import { decryptApiKey } from "@/lib/api-key-secret";
import { fetchCoupangRevenueHistory } from "@/lib/coupang-open-api";
import {
  createRouteAuthErrorResponse,
  requireRouteUser,
} from "@/lib/route-auth";

function yesterday() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export async function POST() {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) return createRouteAuthErrorResponse(authUnavailable);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("commerce_integrations")
    .select("vendor_id, access_key_encrypted, secret_key_encrypted")
    .eq("channel", "coupang")
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) {
    return Response.json({ error: "쿠팡 연결 정보를 먼저 저장해주세요." }, { status: 400 });
  }

  try {
    const date = yesterday();
    const rows = await fetchCoupangRevenueHistory(
      {
        vendorId: data.vendor_id,
        accessKey: decryptApiKey(data.access_key_encrypted),
        secretKey: decryptApiKey(data.secret_key_encrypted),
      },
      date,
      date
    );

    await admin
      .from("commerce_integrations")
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: "success",
        last_test_message: `연결 성공 · 전일 매출 ${rows.length}건 확인`,
      })
      .eq("channel", "coupang");

    return Response.json({
      success: true,
      message: `쿠팡 연결에 성공했습니다. 전일 매출 ${rows.length}건을 확인했습니다.`,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "쿠팡 연결에 실패했습니다.";
    await admin
      .from("commerce_integrations")
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: "failed",
        last_test_message: message,
      })
      .eq("channel", "coupang");
    return Response.json({ error: message }, { status: 502 });
  }
}
