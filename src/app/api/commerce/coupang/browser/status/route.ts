import { readFile } from "node:fs/promises";

import {
  COUPANG_BROWSER_STATUS_FILE,
  emptyCoupangBrowserStatus,
  type CoupangBrowserStatus,
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
    const raw = await readFile(COUPANG_BROWSER_STATUS_FILE, "utf8");
    return Response.json(JSON.parse(raw) as CoupangBrowserStatus);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return Response.json(emptyCoupangBrowserStatus);
    return Response.json(
      { error: "쿠팡 로컬 연결 상태를 읽지 못했습니다." },
      { status: 500 }
    );
  }
}
