import { constants } from "node:fs";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const rootDir = process.cwd();
const localDir = path.join(rootDir, ".yunbiseo-browser", "coupang");
const profileDir = path.join(localDir, "profile");
const statusFile = path.join(localDir, "status.json");
const lockFile = path.join(localDir, "collector.lock");
const wingUrl = "https://wing.coupang.com/";

async function writeStatus(status) {
  await mkdir(localDir, { recursive: true });
  let previous = {};
  try {
    previous = JSON.parse(await readFile(statusFile, "utf8"));
  } catch {
    // 첫 실행에는 이전 상태가 없다.
  }
  await writeFile(
    statusFile,
    `${JSON.stringify({ ...previous, ...status, checked_at: new Date().toISOString() }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 }
  );
}

function isAuthenticated(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "wing.coupang.com") return false;
    const value = `${parsed.pathname}${parsed.search}`.toLowerCase();
    return !["login", "signin", "member/login"].some((keyword) =>
      value.includes(keyword)
    );
  } catch {
    return false;
  }
}

async function main() {
  if (process.argv[2] !== "login") {
    throw new Error("지원하지 않는 실행 모드입니다.");
  }

  await mkdir(profileDir, { recursive: true });
  try {
    await access(lockFile, constants.F_OK);
    const oldPid = Number(await readFile(lockFile, "utf8"));
    if (Number.isInteger(oldPid) && oldPid > 0) {
      try {
        process.kill(oldPid, 0);
        return;
      } catch {
        // 종료된 프로세스의 잠금 파일은 아래에서 교체한다.
      }
    }
  } catch {
    // 잠금 파일이 없으면 정상 진행한다.
  }

  await writeFile(lockFile, String(process.pid), "utf8");
  await writeStatus({ state: "opening", last_error: undefined });

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: null,
    args: ["--start-maximized"],
  });

  try {
    const pages = context.pages();
    const page = pages[0] ?? (await context.newPage());
    await page.goto(wingUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

    // 사용자가 직접 로그인할 시간을 준다. 비밀번호 입력과 추가 인증은 자동화하지 않는다.
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      if (isAuthenticated(page.url())) {
        await page.waitForTimeout(3_000);
        if (isAuthenticated(page.url())) {
          await writeStatus({
            state: "connected",
            connected_at: new Date().toISOString(),
            last_error: undefined,
          });
          await page
            .evaluate(() => {
              document.title = "윤비서 쿠팡 연결 완료 — 창을 닫아도 됩니다";
            })
            .catch(() => undefined);
          await page.waitForTimeout(5_000);
          return;
        }
      }
      await page.waitForTimeout(1_000);
    }

    await writeStatus({
      state: "needs_login",
      last_error: "10분 안에 로그인이 확인되지 않았습니다. 다시 연결해주세요.",
    });
  } finally {
    await context.close();
  }
}

main()
  .catch(async (error) => {
    await writeStatus({
      state: "error",
      last_error:
        error instanceof Error ? error.message : "쿠팡 로그인 브라우저 실행 실패",
    }).catch(() => undefined);
    process.exitCode = 1;
  })
  .finally(async () => {
    await rm(lockFile, { force: true }).catch(() => undefined);
  });
