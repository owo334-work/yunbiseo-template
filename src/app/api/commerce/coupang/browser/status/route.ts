import {
  LEGACY_COUPANG_ACCOUNT_ID,
  readCoupangAccountStatus,
} from "@/lib/coupang-browser-local";
import {
  createRouteAuthErrorResponse,
  requireRouteUser,
} from "@/lib/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) return createRouteAuthErrorResponse(authUnavailable);

  try {
    return Response.json(
      await readCoupangAccountStatus(LEGACY_COUPANG_ACCOUNT_ID)
    );
  } catch {
    return Response.json(
      { error: "쿠팡 로컬 연결 상태를 읽지 못했습니다." },
      { status: 500 }
    );
  }
}
