import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import {
  getCoupangAccountPaths,
  readCoupangBrowserAccounts,
} from "@/lib/coupang-browser-local";
import {
  createRouteAuthErrorResponse,
  requireRouteUser,
} from "@/lib/route-auth";

export const runtime = "nodejs";

async function processIsRunning(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) return createRouteAuthErrorResponse(authUnavailable);

  const body = await request.json().catch(() => ({}));
  const accountId =
    typeof body.account_id === "string" ? body.account_id : "";
  const accounts = await readCoupangBrowserAccounts();
  const account = accounts.find((item) => item.id === accountId);
  if (!account) {
    return Response.json(
      { error: "연결할 쿠팡 계정을 찾지 못했습니다." },
      { status: 404 }
    );
  }
  const { lockFile, statusFile } = getCoupangAccountPaths(account.id);

  try {
    await access(lockFile);
    const pid = Number(await readFile(lockFile, "utf8"));
    if (await processIsRunning(pid)) {
      return Response.json({
        success: true,
        message: "쿠팡 로그인 전용 브라우저가 이미 열려 있습니다.",
      });
    }
  } catch {
    // 잠금 파일이 없으면 새 수집기를 실행한다.
  }

  const script = path.join(process.cwd(), "scripts", "coupang-browser-collector.mjs");
  const child = spawn(
    process.execPath,
    [script, "login", account.id, account.account_type],
    {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    windowsHide: false,
    }
  );
  child.unref();

  return Response.json({
    success: true,
    message:
      `${account.display_name} 전용 브라우저를 열었습니다. 비밀번호는 쿠팡 화면에서 직접 입력해주세요.`,
    status_file: path.relative(process.cwd(), statusFile),
  });
}
