import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";

import {
  getCoupangAccountPaths,
  readCoupangAccountStatus,
  readCoupangBrowserAccounts,
  type CoupangAccountType,
  type CoupangBrowserAccount,
  writeCoupangBrowserAccounts,
} from "@/lib/coupang-browser-local";
import {
  createRouteAuthErrorResponse,
  requireRouteUser,
} from "@/lib/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const accountTypes: CoupangAccountType[] = ["wing_growth", "rocket"];

export async function GET() {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) return createRouteAuthErrorResponse(authUnavailable);

  try {
    const accounts = await readCoupangBrowserAccounts();
    const result = await Promise.all(
      accounts.map(async (account) => ({
        ...account,
        status: await readCoupangAccountStatus(account.id),
      }))
    );
    return Response.json({ accounts: result });
  } catch {
    return Response.json(
      { error: "쿠팡 계정 연결 목록을 읽지 못했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) return createRouteAuthErrorResponse(authUnavailable);

  const body = await request.json().catch(() => ({}));
  const displayName =
    typeof body.display_name === "string" ? body.display_name.trim() : "";
  const accountType = body.account_type as CoupangAccountType;

  if (!displayName || displayName.length > 50) {
    return Response.json(
      { error: "스토어 구분명은 1~50자로 입력해주세요." },
      { status: 400 }
    );
  }
  if (!accountTypes.includes(accountType)) {
    return Response.json(
      { error: "쿠팡 계정 유형을 선택해주세요." },
      { status: 400 }
    );
  }

  const accounts = await readCoupangBrowserAccounts();
  if (
    accounts.some(
      (account) =>
        account.display_name.toLocaleLowerCase("ko-KR") ===
        displayName.toLocaleLowerCase("ko-KR")
    )
  ) {
    return Response.json(
      { error: "같은 구분명의 쿠팡 계정이 이미 있습니다." },
      { status: 409 }
    );
  }

  const account: CoupangBrowserAccount = {
    id: randomUUID(),
    display_name: displayName,
    account_type: accountType,
    created_at: new Date().toISOString(),
  };
  const { accountDir } = getCoupangAccountPaths(account.id);
  await mkdir(accountDir, { recursive: true });
  await writeCoupangBrowserAccounts([...accounts, account]);

  return Response.json({ success: true, account }, { status: 201 });
}
