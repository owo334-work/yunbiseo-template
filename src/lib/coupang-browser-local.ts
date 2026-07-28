import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const COUPANG_BROWSER_DIR = path.join(
  process.cwd(),
  ".yunbiseo-browser",
  "coupang"
);

export const COUPANG_BROWSER_PROFILE_DIR = path.join(
  COUPANG_BROWSER_DIR,
  "profile"
);

export const COUPANG_BROWSER_STATUS_FILE = path.join(
  COUPANG_BROWSER_DIR,
  "status.json"
);

export const COUPANG_BROWSER_LOCK_FILE = path.join(
  COUPANG_BROWSER_DIR,
  "collector.lock"
);

export const COUPANG_BROWSER_ACCOUNTS_FILE = path.join(
  COUPANG_BROWSER_DIR,
  "accounts.json"
);

export const LEGACY_COUPANG_ACCOUNT_ID = "legacy-default";

export type CoupangAccountType = "wing_growth" | "rocket";

export type CoupangBrowserStatus = {
  state: "not_connected" | "opening" | "connected" | "needs_login" | "error";
  connected_at?: string;
  checked_at?: string;
  last_error?: string;
};

export const emptyCoupangBrowserStatus: CoupangBrowserStatus = {
  state: "not_connected",
};

export type CoupangBrowserAccount = {
  id: string;
  display_name: string;
  account_type: CoupangAccountType;
  created_at: string;
};

export type CoupangBrowserAccountWithStatus = CoupangBrowserAccount & {
  status: CoupangBrowserStatus;
};

export function isValidCoupangAccountId(value: string) {
  return (
    value === LEGACY_COUPANG_ACCOUNT_ID ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

export function getCoupangAccountDir(accountId: string) {
  if (!isValidCoupangAccountId(accountId)) {
    throw new Error("올바르지 않은 쿠팡 계정 연결 ID입니다.");
  }
  return accountId === LEGACY_COUPANG_ACCOUNT_ID
    ? COUPANG_BROWSER_DIR
    : path.join(COUPANG_BROWSER_DIR, "accounts", accountId);
}

export function getCoupangAccountPaths(accountId: string) {
  const accountDir = getCoupangAccountDir(accountId);
  return {
    accountDir,
    profileDir: path.join(accountDir, "profile"),
    statusFile: path.join(accountDir, "status.json"),
    lockFile: path.join(accountDir, "collector.lock"),
  };
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readCoupangBrowserAccounts() {
  try {
    const raw = await readFile(COUPANG_BROWSER_ACCOUNTS_FILE, "utf8");
    return JSON.parse(raw) as CoupangBrowserAccount[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const hasLegacyConnection =
    (await fileExists(COUPANG_BROWSER_STATUS_FILE)) ||
    (await fileExists(COUPANG_BROWSER_PROFILE_DIR));

  return hasLegacyConnection
    ? [
        {
          id: LEGACY_COUPANG_ACCOUNT_ID,
          display_name: "기존 쿠팡 계정",
          account_type: "wing_growth" as const,
          created_at: new Date().toISOString(),
        },
      ]
    : [];
}

export async function writeCoupangBrowserAccounts(
  accounts: CoupangBrowserAccount[]
) {
  await mkdir(COUPANG_BROWSER_DIR, { recursive: true });
  await writeFile(
    COUPANG_BROWSER_ACCOUNTS_FILE,
    `${JSON.stringify(accounts, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 }
  );
}

export async function readCoupangAccountStatus(accountId: string) {
  const { statusFile } = getCoupangAccountPaths(accountId);
  try {
    return JSON.parse(
      await readFile(statusFile, "utf8")
    ) as CoupangBrowserStatus;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyCoupangBrowserStatus;
    }
    throw error;
  }
}
