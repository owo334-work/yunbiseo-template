"use client";

import { ChangeEvent, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

const COLUMNS = [
  "날짜",
  "채널",
  "스토어명",
  "SKU",
  "상품명",
  "옵션명",
  "채널옵션ID",
  "판매가",
  "상품원가",
  "포장비",
  "배송비",
  "주문수량",
  "취소수량",
  "상품매출",
  "판매수수료",
  "배송비수익",
  "광고비공급가",
  "광고비VAT",
  "채널재고",
  "창고재고",
  "입고예정",
  "예약수량",
] as const;

type CsvRow = Record<(typeof COLUMNS)[number], string>;

const EXAMPLE_ROWS = [
  [
    "2026-07-28",
    "쿠팡",
    "쿠팡 본점",
    "SKU-001",
    "실리콘 밀폐용기",
    "베이지",
    "123456789",
    "29900",
    "11200",
    "700",
    "3000",
    "10",
    "1",
    "299000",
    "32292",
    "0",
    "28000",
    "2800",
    "80",
    "20",
    "50",
    "3",
  ],
  [
    "2026-07-28",
    "네이버",
    "네이버 스마트스토어",
    "SKU-002",
    "호텔 수건 10장",
    "화이트",
    "NAVER-002",
    "34900",
    "14800",
    "900",
    "3000",
    "6",
    "0",
    "209400",
    "12773",
    "18000",
    "19000",
    "1900",
    "35",
    "10",
    "30",
    "2",
  ],
];

function escapeCsv(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function downloadTemplate() {
  const content = [COLUMNS, ...EXAMPLE_ROWS]
    .map((row) => row.map((value) => escapeCsv(String(value))).join(","))
    .join("\r\n");
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "쇼핑몰_매출_가져오기_양식.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function toInteger(value: string, label: string, rowNumber: number) {
  if (!value) return 0;
  const normalized = value.replaceAll(",", "").replaceAll("원", "").trim();
  const number = Number(normalized);
  if (!Number.isFinite(number) || !Number.isInteger(number)) {
    throw new Error(`${rowNumber}행의 ${label} 값이 숫자가 아닙니다.`);
  }
  return number;
}

function normalizeChannel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["쿠팡", "coupang"].includes(normalized)) return "coupang";
  if (["네이버", "naver", "스마트스토어"].includes(normalized)) return "naver";
  if (["수동", "기타", "manual"].includes(normalized)) return "manual";
  throw new Error(`채널 '${value}'은 쿠팡, 네이버, 수동 중 하나여야 합니다.`);
}

function validateRows(parsed: string[][]): CsvRow[] {
  if (parsed.length < 2) throw new Error("제목 아래에 가져올 데이터가 없습니다.");
  const header = parsed[0].map((value) => value.replace(/^\uFEFF/, "").trim());
  const missing = COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) throw new Error(`필수 열이 없습니다: ${missing.join(", ")}`);
  if (parsed.length - 1 > 500) throw new Error("한 번에 최대 500행까지 가져올 수 있습니다.");

  return parsed.slice(1).map((values, index) => {
    const result = {} as CsvRow;
    for (const column of COLUMNS) {
      result[column] = values[header.indexOf(column)]?.trim() ?? "";
    }

    const rowNumber = index + 2;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result.날짜)) {
      throw new Error(`${rowNumber}행의 날짜를 YYYY-MM-DD 형식으로 입력해주세요.`);
    }
    for (const key of ["채널", "스토어명", "SKU", "상품명"] as const) {
      if (!result[key]) throw new Error(`${rowNumber}행의 ${key} 값이 비어 있습니다.`);
    }
    normalizeChannel(result.채널);
    for (const key of COLUMNS.slice(7)) toInteger(result[key], key, rowNumber);
    return result;
  });
}

export function CommerceCsvImportDialog({ onComplete }: { onComplete: () => Promise<void> }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvRow[]>([]);
  const [importing, setImporting] = useState(false);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setPreview([]);
    if (!selected) return;

    try {
      const rows = validateRows(parseCsv(await selected.text()));
      setPreview(rows);
      toast.success(`${rows.length}행을 확인했습니다.`);
    } catch (error) {
      setFile(null);
      event.target.value = "";
      toast.error(error instanceof Error ? error.message : "CSV 파일을 확인하지 못했습니다.");
    }
  }

  async function importRows() {
    if (!file || preview.length === 0) return;
    setImporting(true);

    try {
      let completed = 0;
      for (const [index, row] of preview.entries()) {
        const rowNumber = index + 2;
        const channel = normalizeChannel(row.채널);
        const { data: store, error: storeError } = await supabase
          .from("commerce_stores")
          .upsert(
            { channel, store_name: row.스토어명, is_active: true },
            { onConflict: "channel,store_name" }
          )
          .select("id")
          .single();
        if (storeError || !store) throw new Error(`${rowNumber}행 스토어 저장 실패: ${storeError?.message}`);

        const { data: product, error: productError } = await supabase
          .from("commerce_products")
          .upsert(
            { internal_sku: row.SKU, product_name: row.상품명, is_active: true },
            { onConflict: "internal_sku" }
          )
          .select("id")
          .single();
        if (productError || !product) throw new Error(`${rowNumber}행 상품 저장 실패: ${productError?.message}`);

        const optionName = row.옵션명 || "기본";
        let optionQuery = supabase
          .from("commerce_product_options")
          .select("id")
          .eq("store_id", store.id)
          .eq("product_id", product.id)
          .eq("option_name", optionName);
        if (row.채널옵션ID) optionQuery = optionQuery.eq("channel_option_id", row.채널옵션ID);
        const { data: existingOption, error: optionFindError } = await optionQuery.maybeSingle();
        if (optionFindError) throw new Error(`${rowNumber}행 옵션 조회 실패: ${optionFindError.message}`);

        let optionId = existingOption?.id;
        if (optionId) {
          const { error } = await supabase
            .from("commerce_product_options")
            .update({
              sale_price: toInteger(row.판매가, "판매가", rowNumber),
              channel_option_id: row.채널옵션ID || null,
              is_active: true,
            })
            .eq("id", optionId);
          if (error) throw new Error(`${rowNumber}행 옵션 수정 실패: ${error.message}`);
        } else {
          const { data, error } = await supabase
            .from("commerce_product_options")
            .insert({
              product_id: product.id,
              store_id: store.id,
              option_name: optionName,
              channel_option_id: row.채널옵션ID || null,
              sale_price: toInteger(row.판매가, "판매가", rowNumber),
            })
            .select("id")
            .single();
          if (error || !data) throw new Error(`${rowNumber}행 옵션 저장 실패: ${error?.message}`);
          optionId = data.id;
        }

        const { error: costError } = await supabase.from("product_cost_history").upsert(
          {
            product_id: product.id,
            effective_from: row.날짜,
            cost_price: toInteger(row.상품원가, "상품원가", rowNumber),
            packaging_cost: toInteger(row.포장비, "포장비", rowNumber),
            shipping_cost: toInteger(row.배송비, "배송비", rowNumber),
            other_cost: 0,
          },
          { onConflict: "product_id,effective_from" }
        );
        if (costError) throw new Error(`${rowNumber}행 원가 저장 실패: ${costError.message}`);

        const { error: salesError } = await supabase.from("daily_product_sales").upsert(
          {
            sales_date: row.날짜,
            store_id: store.id,
            product_id: product.id,
            product_option_id: optionId,
            order_quantity: toInteger(row.주문수량, "주문수량", rowNumber),
            cancel_quantity: toInteger(row.취소수량, "취소수량", rowNumber),
            gross_sales: toInteger(row.상품매출, "상품매출", rowNumber),
            commission_amount: toInteger(row.판매수수료, "판매수수료", rowNumber),
            shipping_revenue: toInteger(row.배송비수익, "배송비수익", rowNumber),
            source: "csv",
          },
          { onConflict: "sales_date,store_id,product_id,product_option_id" }
        );
        if (salesError) throw new Error(`${rowNumber}행 매출 저장 실패: ${salesError.message}`);

        const { error: adError } = await supabase.from("daily_ad_costs").upsert(
          {
            ad_date: row.날짜,
            store_id: store.id,
            product_id: product.id,
            ad_cost_ex_vat: toInteger(row.광고비공급가, "광고비공급가", rowNumber),
            vat_amount: toInteger(row.광고비VAT, "광고비VAT", rowNumber),
            source: "csv",
          },
          { onConflict: "ad_date,store_id,product_id" }
        );
        if (adError) throw new Error(`${rowNumber}행 광고비 저장 실패: ${adError.message}`);

        const hasInventory = ["채널재고", "창고재고", "입고예정", "예약수량"].some((key) => row[key as keyof CsvRow]);
        if (hasInventory) {
          const { error: inventoryError } = await supabase.from("inventory_snapshots").upsert(
            {
              snapshot_date: row.날짜,
              store_id: store.id,
              product_option_id: optionId,
              channel_stock: toInteger(row.채널재고, "채널재고", rowNumber),
              warehouse_stock: toInteger(row.창고재고, "창고재고", rowNumber),
              inbound_quantity: toInteger(row.입고예정, "입고예정", rowNumber),
              reserved_quantity: toInteger(row.예약수량, "예약수량", rowNumber),
              source: "csv",
            },
            { onConflict: "snapshot_date,store_id,product_option_id" }
          );
          if (inventoryError) throw new Error(`${rowNumber}행 재고 저장 실패: ${inventoryError.message}`);
        }
        completed += 1;
      }

      toast.success(`${completed}행을 쇼핑몰 매출분석에 반영했습니다.`);
      setOpen(false);
      setFile(null);
      setPreview([]);
      await onComplete();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "CSV 가져오기에 실패했습니다.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Upload /> CSV 가져오기</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>쇼핑몰 매출 CSV 가져오기</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-3">
          <div className="rounded-xl border bg-muted/30 p-4 text-sm">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">표준 양식을 먼저 내려받으세요.</p>
                <p className="mt-1 text-muted-foreground">
                  제목은 바꾸지 말고, 예시 행을 지운 뒤 실제 자료를 입력해 CSV로 저장합니다.
                </p>
              </div>
            </div>
            <Button type="button" variant="outline" className="mt-3" onClick={downloadTemplate}>
              <Download /> CSV 양식 다운로드
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="commerce-csv-file">작성한 CSV 파일</Label>
            <Input
              id="commerce-csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              disabled={importing}
            />
          </div>

          {preview.length > 0 ? (
            <div className="rounded-xl border p-4 text-sm">
              <p className="font-medium">{file?.name}</p>
              <p className="mt-1 text-muted-foreground">
                {preview.length}행 · {new Set(preview.map((row) => row.SKU)).size}개 상품을 가져올 준비가 됐습니다.
              </p>
              <div className="mt-3 max-h-40 overflow-auto rounded-lg bg-muted/40 p-3 text-xs">
                {preview.slice(0, 5).map((row, index) => (
                  <p key={`${row.날짜}-${row.SKU}-${index}`}>
                    {row.날짜} · {row.스토어명} · {row.상품명} · {row.주문수량}개
                  </p>
                ))}
                {preview.length > 5 ? <p>외 {preview.length - 5}행</p> : null}
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={importing}>
            취소
          </Button>
          <Button type="button" onClick={() => void importRows()} disabled={preview.length === 0 || importing}>
            {importing ? "가져오는 중..." : `${preview.length || ""}행 가져오기`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
