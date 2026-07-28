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

export type CoupangBrowserStatus = {
  state: "not_connected" | "opening" | "connected" | "needs_login" | "error";
  connected_at?: string;
  checked_at?: string;
  last_error?: string;
};

export const emptyCoupangBrowserStatus: CoupangBrowserStatus = {
  state: "not_connected",
};
