import { access, readFile, rm } from "node:fs/promises";

import {
  getCoupangAccountPaths,
  LEGACY_COUPANG_ACCOUNT_ID,
  readCoupangBrowserAccounts,
  type CoupangAccountType,
  writeCoupangBrowserAccounts,
} from "@/lib/coupang-browser-local";
import {
  createRouteAuthErrorResponse,
  requireRouteUser,
} from "@/lib/route-auth";

export const runtime = "nodejs";

const accountTypes: CoupangAccountType[] = ["wing_growth", "rocket"];

async function processIsRunning(lockFile: string) {
  try {
    await access(lockFile);
    const pid = Number(await readFile(lockFile, "utf8"));
    if (!Number.isInteger(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function findAccount(accountId: string) {
  const accounts = await readCoupangBrowserAccounts();
  const index = accounts.findIndex((account) => account.id === accountId);
  return { accounts, index };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) return createRouteAuthErrorResponse(authUnavailable);

  const { accountId } = await params;
  const { accounts, index } = await findAccount(accountId);
  if (index < 0) {
    return Response.json(
      { error: "수정할 쿠팡 계정을 찾지 못했습니다." },
      { status: 404 }
    );
  }

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
  if (
    accounts.some(
      (account, accountIndex) =>
        accountIndex !== index &&
        account.display_name.toLocaleLowerCase("ko-KR") ===
          displayName.toLocaleLowerCase("ko-KR")
    )
  ) {
    return Response.json(
      { error: "같은 구분명의 쿠팡 계정이 이미 있습니다." },
      { status: 409 }
    );
  }

  accounts[index] = {
    ...accounts[index],
    display_name: displayName,
    account_type: accountType,
  };
  await writeCoupangBrowserAccounts(accounts);

  return Response.json({ success: true, account: accounts[index] });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) return createRouteAuthErrorResponse(authUnavailable);

  const { accountId } = await params;
  const { accounts, index } = await findAccount(accountId);
  if (index < 0) {
    return Response.json(
      { error: "삭제할 쿠팡 계정을 찾지 못했습니다." },
      { status: 404 }
    );
  }

  const { accountDir, profileDir, statusFile, lockFile } =
    getCoupangAccountPaths(accountId);
  if (await processIsRunning(lockFile)) {
    return Response.json(
      { error: "이 계정의 로그인 창을 먼저 닫은 뒤 삭제해주세요." },
      { status: 409 }
    );
  }

  if (accountId === LEGACY_COUPANG_ACCOUNT_ID) {
    await Promise.all([
      rm(profileDir, { recursive: true, force: true }),
      rm(statusFile, { force: true }),
      rm(lockFile, { force: true }),
    ]);
  } else {
    // accountDir은 검증된 UUID로 만든 .yunbiseo-browser/coupang/accounts 하위 경로다.
    await rm(accountDir, { recursive: true, force: true });
  }

  await writeCoupangBrowserAccounts(
    accounts.filter((account) => account.id !== accountId)
  );

  return Response.json({
    success: true,
    message:
      "쿠팡 로그인 연결을 삭제했습니다. 기존 매출·상품·재고 데이터는 유지됩니다.",
  });
}
