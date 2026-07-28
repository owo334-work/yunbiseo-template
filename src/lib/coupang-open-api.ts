import { createHmac } from "crypto";

const COUPANG_HOST = "https://api-gateway.coupang.com";

export interface CoupangCredentials {
  vendorId: string;
  accessKey: string;
  secretKey: string;
}

export interface CoupangRevenueItem {
  productId: number;
  productName: string;
  vendorItemId: number;
  vendorItemName: string;
  salePrice: number;
  quantity: number;
  saleAmount: number;
  serviceFee: number;
  serviceFeeVat: number;
  externalSellerSkuCode?: string;
}

export interface CoupangRevenueRow {
  orderId: number;
  saleType: "SALE" | "REFUND";
  saleDate: string;
  recognitionDate: string;
  settlementDate: string;
  deliveryFee?: {
    amount?: number;
    fee?: number;
    feeVat?: number;
  };
  items: CoupangRevenueItem[];
}

export interface CoupangRevenueResponse {
  code: number;
  message: string;
  data: CoupangRevenueRow[];
  hasNext: boolean;
  nextToken?: string;
}

function signedDate() {
  return new Date()
    .toISOString()
    .slice(2, 19)
    .replaceAll("-", "")
    .replaceAll(":", "") + "Z";
}

function authorization(
  method: string,
  path: string,
  query: string,
  accessKey: string,
  secretKey: string
) {
  const datetime = signedDate();
  const signature = createHmac("sha256", secretKey)
    .update(`${datetime}${method}${path}${query}`)
    .digest("hex");

  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

export async function coupangRequest<T>(
  credentials: CoupangCredentials,
  path: string,
  params: Record<string, string>
): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${COUPANG_HOST}${path}?${query}`, {
    method: "GET",
    headers: {
      Authorization: authorization(
        "GET",
        path,
        query,
        credentials.accessKey,
        credentials.secretKey
      ),
      "Content-Type": "application/json;charset=UTF-8",
      "X-Requested-By": credentials.vendorId,
      "X-MARKET": "KR",
    },
    cache: "no-store",
  });

  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`쿠팡 응답을 읽지 못했습니다. (HTTP ${response.status})`);
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : `HTTP ${response.status}`;
    throw new Error(`쿠팡 API 오류: ${message}`);
  }

  return payload as T;
}

export async function fetchCoupangRevenueHistory(
  credentials: CoupangCredentials,
  dateFrom: string,
  dateTo: string
) {
  const path = "/v2/providers/openapi/apis/api/v1/revenue-history";
  const rows: CoupangRevenueRow[] = [];
  let token = "";

  do {
    const response = await coupangRequest<CoupangRevenueResponse>(credentials, path, {
      vendorId: credentials.vendorId,
      recognitionDateFrom: dateFrom,
      recognitionDateTo: dateTo,
      token,
      maxPerPage: "50",
    });

    rows.push(...(response.data ?? []));
    token = response.hasNext ? response.nextToken ?? "" : "";
  } while (token);

  return rows;
}
