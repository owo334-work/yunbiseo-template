import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import {
  COUPANG_BROWSER_LOCK_FILE,
  COUPANG_BROWSER_STATUS_FILE,
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

export async function POST() {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) return createRouteAuthErrorResponse(authUnavailable);

  try {
    await access(COUPANG_BROWSER_LOCK_FILE);
    const pid = Number(await readFile(COUPANG_BROWSER_LOCK_FILE, "utf8"));
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
  const child = spawn(process.execPath, [script, "login"], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();

  return Response.json({
    success: true,
    message:
      "쿠팡 로그인 전용 브라우저를 열었습니다. 비밀번호는 이 화면에서 직접 입력해주세요.",
    status_file: path.relative(process.cwd(), COUPANG_BROWSER_STATUS_FILE),
  });
}
