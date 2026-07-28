"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  CircleDollarSign,
  DollarSign,
  PackagePlus,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  LoadingState,
  PageHeader,
  PageShell,
  StatCard,
  StatsGrid,
} from "@/components/page-shell";
import { CommerceCsvImportDialog } from "@/components/commerce-csv-import-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";

type Store = {
  id: string;
  channel: "coupang" | "naver" | "manual";
  store_name: string;
};

type Product = {
  id: string;
  internal_sku: string;
  product_name: string;
  brand: string | null;
};

type Option = {
  id: string;
  product_id: string;
  store_id: string;
  option_name: string;
  sale_price: number;
  commerce_products?: Product | null;
  commerce_stores?: Store | null;
};

type DailyMetric = {
  id: string;
  sales_date: string;
  store_id: string;
  store_name: string;
  channel: string;
  product_id: string;
  internal_sku: string;
  product_name: string;
  product_option_id: string | null;
  option_name: string | null;
  order_quantity: number;
  cancel_quantity: number;
  net_quantity: number;
  gross_sales: number;
  shipping_revenue: number;
  commission_amount: number;
  total_cost: number;
  profit_before_ads: number;
  is_cost_missing: boolean;
};

type AdCost = {
  ad_date: string;
  store_id: string;
  product_id: string | null;
  ad_cost_ex_vat: number;
  vat_amount: number;
};

type StockForecast = {
  product_option_id: string;
  internal_sku: string;
  product_name: string;
  option_name: string;
  available_quantity: number;
  inbound_quantity: number;
  sales_7d: number;
  avg_daily_sales_7d: number;
  days_until_stockout: number | null;
  status: "out_of_stock" | "no_sales" | "critical" | "warning" | "normal";
};

const channelLabel: Record<string, string> = {
  coupang: "쿠팡",
  naver: "네이버",
  manual: "수동",
};

const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function CommerceRevenuePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [metrics, setMetrics] = useState<DailyMetric[]>([]);
  const [adCosts, setAdCosts] = useState<AdCost[]>([]);
  const [forecasts, setForecasts] = useState<StockForecast[]>([]);
  const [storeDialog, setStoreDialog] = useState(false);
  const [productDialog, setProductDialog] = useState(false);
  const [salesDialog, setSalesDialog] = useState(false);
  const [inventoryDialog, setInventoryDialog] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => dateKey(new Date()).slice(0, 7));

  const loadData = useCallback(async () => {
    setLoading(true);
    const startDate = `${selectedMonth}-01`;
    const end = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0);
    const endDate = dateKey(end);

    const [storeResult, optionResult, metricResult, adResult, forecastResult] =
      await Promise.all([
        supabase.from("commerce_stores").select("id, channel, store_name").order("store_name"),
        supabase
          .from("commerce_product_options")
          .select("id, product_id, store_id, option_name, sale_price, commerce_products(id, internal_sku, product_name, brand), commerce_stores(id, channel, store_name)")
          .eq("is_active", true)
          .order("created_at"),
        supabase
          .from("commerce_daily_product_metrics")
          .select("*")
          .gte("sales_date", startDate)
          .lte("sales_date", endDate)
          .order("sales_date", { ascending: false }),
        supabase
          .from("daily_ad_costs")
          .select("ad_date, store_id, product_id, ad_cost_ex_vat, vat_amount")
          .gte("ad_date", startDate)
          .lte("ad_date", endDate),
        supabase
          .from("commerce_stockout_forecasts")
          .select("*")
          .order("days_until_stockout", { ascending: true, nullsFirst: false }),
      ]);

    const error =
      storeResult.error ||
      optionResult.error ||
      metricResult.error ||
      adResult.error ||
      forecastResult.error;

    if (error) {
      toast.error(`쇼핑몰 데이터를 불러오지 못했습니다: ${error.message}`);
    } else {
      setStores((storeResult.data ?? []) as Store[]);
      setOptions((optionResult.data ?? []) as unknown as Option[]);
      setMetrics((metricResult.data ?? []) as DailyMetric[]);
      setAdCosts((adResult.data ?? []) as AdCost[]);
      setForecasts((forecastResult.data ?? []) as StockForecast[]);
    }
    setLoading(false);
  }, [selectedMonth, supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const adByDate = useMemo(() => {
    const result = new Map<string, number>();
    for (const row of adCosts) {
      result.set(row.ad_date, (result.get(row.ad_date) ?? 0) + row.ad_cost_ex_vat + row.vat_amount);
    }
    return result;
  }, [adCosts]);

  const dailyRows = useMemo(() => {
    const map = new Map<string, { sales: number; profit: number; quantity: number }>();
    for (const row of metrics) {
      const current = map.get(row.sales_date) ?? { sales: 0, profit: 0, quantity: 0 };
      current.sales += row.gross_sales + row.shipping_revenue;
      current.profit += row.profit_before_ads;
      current.quantity += row.net_quantity;
      map.set(row.sales_date, current);
    }
    return [...map.entries()]
      .map(([date, value]) => ({
        date,
        ...value,
        adCost: adByDate.get(date) ?? 0,
        netProfit: value.profit - (adByDate.get(date) ?? 0),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [adByDate, metrics]);

  const totals = useMemo(
    () =>
      dailyRows.reduce(
        (sum, row) => ({
          sales: sum.sales + row.sales,
          profit: sum.profit + row.profit,
          adCost: sum.adCost + row.adCost,
          netProfit: sum.netProfit + row.netProfit,
        }),
        { sales: 0, profit: 0, adCost: 0, netProfit: 0 }
      ),
    [dailyRows]
  );

  const productRows = useMemo(() => {
    const map = new Map<string, {
      sku: string;
      name: string;
      sales: number;
      quantity: number;
      profit: number;
      costMissing: boolean;
    }>();
    for (const row of metrics) {
      const current = map.get(row.product_id) ?? {
        sku: row.internal_sku,
        name: row.product_name,
        sales: 0,
        quantity: 0,
        profit: 0,
        costMissing: false,
      };
      current.sales += row.gross_sales + row.shipping_revenue;
      current.quantity += row.net_quantity;
      current.profit += row.profit_before_ads;
      current.costMissing ||= row.is_cost_missing;
      map.set(row.product_id, current);
    }
    return [...map.values()].sort((a, b) => b.sales - a.sales);
  }, [metrics]);

  const calendarDays = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const first = new Date(year, month - 1, 1);
    const days = new Date(year, month, 0).getDate();
    return [
      ...Array.from({ length: first.getDay() }, () => null),
      ...Array.from({ length: days }, (_, index) => {
        const key = `${selectedMonth}-${String(index + 1).padStart(2, "0")}`;
        return { day: index + 1, row: dailyRows.find((item) => item.date === key) ?? null };
      }),
    ];
  }, [dailyRows, selectedMonth]);

  async function submitStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.from("commerce_stores").insert({
      channel: form.get("channel"),
      store_name: String(form.get("store_name") ?? "").trim(),
      seller_id: String(form.get("seller_id") ?? "").trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("판매채널을 등록했습니다.");
    setStoreDialog(false);
    await loadData();
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const { data: product, error } = await supabase
      .from("commerce_products")
      .insert({
        internal_sku: String(form.get("internal_sku") ?? "").trim(),
        product_name: String(form.get("product_name") ?? "").trim(),
        brand: String(form.get("brand") ?? "").trim() || null,
      })
      .select("id")
      .single();
    if (!error && product) {
      const optionError = (
        await supabase.from("commerce_product_options").insert({
          product_id: product.id,
          store_id: form.get("store_id"),
          option_name: String(form.get("option_name") ?? "").trim() || "기본",
          channel_option_id: String(form.get("channel_option_id") ?? "").trim() || null,
          sale_price: Number(form.get("sale_price") ?? 0),
        })
      ).error;
      const costError = (
        await supabase.from("product_cost_history").insert({
          product_id: product.id,
          cost_price: Number(form.get("cost_price") ?? 0),
          packaging_cost: Number(form.get("packaging_cost") ?? 0),
          shipping_cost: Number(form.get("shipping_cost") ?? 0),
          other_cost: 0,
          effective_from: form.get("effective_from"),
        })
      ).error;
      if (optionError || costError) {
        setSaving(false);
        return toast.error((optionError || costError)?.message);
      }
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("상품·옵션·원가를 등록했습니다.");
    setProductDialog(false);
    await loadData();
  }

  async function submitSales(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const option = options.find((item) => item.id === form.get("product_option_id"));
    if (!option) {
      setSaving(false);
      return toast.error("상품 옵션을 선택해주세요.");
    }
    const salesDate = String(form.get("sales_date"));
    const [salesResult, adResult] = await Promise.all([
      supabase.from("daily_product_sales").upsert(
        {
          sales_date: salesDate,
          store_id: option.store_id,
          product_id: option.product_id,
          product_option_id: option.id,
          order_quantity: Number(form.get("order_quantity") ?? 0),
          cancel_quantity: Number(form.get("cancel_quantity") ?? 0),
          gross_sales: Number(form.get("gross_sales") ?? 0),
          commission_amount: Number(form.get("commission_amount") ?? 0),
          shipping_revenue: Number(form.get("shipping_revenue") ?? 0),
          source: "manual",
        },
        { onConflict: "sales_date,store_id,product_id,product_option_id" }
      ),
      supabase.from("daily_ad_costs").upsert(
        {
          ad_date: salesDate,
          store_id: option.store_id,
          product_id: option.product_id,
          ad_cost_ex_vat: Number(form.get("ad_cost_ex_vat") ?? 0),
          vat_amount: Number(form.get("ad_vat") ?? 0),
          source: "manual",
        },
        { onConflict: "ad_date,store_id,product_id" }
      ),
    ]);
    setSaving(false);
    if (salesResult.error || adResult.error) {
      return toast.error((salesResult.error || adResult.error)?.message);
    }
    toast.success("일별 매출과 광고비를 저장했습니다.");
    setSalesDialog(false);
    await loadData();
  }

  async function submitInventory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const option = options.find((item) => item.id === form.get("product_option_id"));
    if (!option) {
      setSaving(false);
      return toast.error("상품 옵션을 선택해주세요.");
    }
    const { error } = await supabase.from("inventory_snapshots").upsert(
      {
        snapshot_date: form.get("snapshot_date"),
        store_id: option.store_id,
        product_option_id: option.id,
        channel_stock: Number(form.get("channel_stock") ?? 0),
        warehouse_stock: Number(form.get("warehouse_stock") ?? 0),
        inbound_quantity: Number(form.get("inbound_quantity") ?? 0),
        reserved_quantity: Number(form.get("reserved_quantity") ?? 0),
        source: "manual",
      },
      { onConflict: "snapshot_date,store_id,product_option_id" }
    );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("재고 스냅샷을 저장했습니다.");
    setInventoryDialog(false);
    await loadData();
  }

  const today = dateKey(new Date());

  return (
    <PageShell>
      <PageHeader
        title="쇼핑몰 매출 분석"
        description="쿠팡·네이버 상품의 일별 매출, 원가, 광고비, 순이익과 품절 위험을 관리합니다."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => router.push("/dashboard/revenues")}>
              <ArrowLeft /> 기존 매출관리
            </Button>
            <Button variant="outline" onClick={() => void loadData()} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} /> 새로고침
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          type="month"
          value={selectedMonth}
          onChange={(event) => setSelectedMonth(event.target.value)}
          className="w-44"
        />
        <div className="flex flex-wrap gap-2">
          <CommerceCsvImportDialog onComplete={loadData} />
          <StoreDialog open={storeDialog} onOpenChange={setStoreDialog} onSubmit={submitStore} saving={saving} />
          <ProductDialog open={productDialog} onOpenChange={setProductDialog} onSubmit={submitProduct} stores={stores} saving={saving} today={today} />
          <SalesDialog open={salesDialog} onOpenChange={setSalesDialog} onSubmit={submitSales} options={options} saving={saving} today={today} />
          <InventoryDialog open={inventoryDialog} onOpenChange={setInventoryDialog} onSubmit={submitInventory} options={options} saving={saving} today={today} />
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <div className="space-y-5">
          <section className="space-y-5" aria-labelledby="commerce-profit-heading">
            <div>
              <h2 id="commerce-profit-heading" className="text-xl font-semibold tracking-tight">
                손익 대시보드
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                선택한 달의 매출과 비용 흐름을 한눈에 확인합니다.
              </p>
            </div>
            <StatsGrid>
              <StatCard label="선택 월 매출" value={won(totals.sales)} description="배송비 수익 포함" icon={TrendingUp} />
              <StatCard label="광고 전 이익" value={won(totals.profit)} description="원가·수수료 차감" icon={DollarSign} tone="positive" />
              <StatCard label="광고비(VAT 포함)" value={won(totals.adCost)} description="수동 입력 및 향후 API 연동" icon={CircleDollarSign} tone="warning" />
              <StatCard label="순이익" value={won(totals.netProfit)} description="광고 전 이익 - 광고비" icon={ShoppingCart} tone={totals.netProfit >= 0 ? "brand" : "warning"} />
            </StatsGrid>

            <Card>
              <CardHeader>
                <CardTitle>{selectedMonth.replace("-", "년 ")}월 손익 캘린더</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 border-l border-t text-center text-xs font-medium text-muted-foreground">
                  {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                    <div key={day} className="border-b border-r p-2">{day}</div>
                  ))}
                  {calendarDays.map((item, index) => (
                    <div key={index} className="min-h-24 border-b border-r p-2 text-left">
                      {item ? (
                        <>
                          <div className="mb-2 font-medium text-foreground">{item.day}</div>
                          {item.row ? (
                            <div className="space-y-1">
                              <p>매출 {won(item.row.sales)}</p>
                              <p className="text-muted-foreground">광고 {won(item.row.adCost)}</p>
                              <p className={item.row.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}>
                                순익 {won(item.row.netProfit)}
                              </p>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>최근 일별 손익</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                {dailyRows.length === 0 ? (
                  <EmptyState title="집계할 매출이 없습니다." description="상단의 ‘일별 실적 입력’에서 첫 데이터를 등록해주세요." />
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>날짜</TableHead><TableHead className="text-right">판매수량</TableHead>
                      <TableHead className="text-right">매출</TableHead><TableHead className="text-right">광고 전 이익</TableHead>
                      <TableHead className="text-right">광고비</TableHead><TableHead className="text-right">순이익</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>{dailyRows.slice(0, 14).map((row) => (
                      <TableRow key={row.date}>
                        <TableCell>{row.date}</TableCell><TableCell className="text-right">{row.quantity.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{won(row.sales)}</TableCell><TableCell className="text-right">{won(row.profit)}</TableCell>
                        <TableCell className="text-right">{won(row.adCost)}</TableCell>
                        <TableCell className={`text-right font-medium ${row.netProfit < 0 ? "text-red-600" : "text-emerald-600"}`}>{won(row.netProfit)}</TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-3" aria-labelledby="commerce-products-heading">
            <div>
              <h2 id="commerce-products-heading" className="text-xl font-semibold tracking-tight">
                상품별 매출
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                상품별 판매량과 매출, 원가 등록 상태를 비교합니다.
              </p>
            </div>
            <Card>
              <CardHeader><CardTitle>상품별 선택 월 실적</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                {productRows.length === 0 ? (
                  <EmptyState title="상품별 실적이 없습니다." description="상품 등록 후 일별 실적을 입력해주세요." />
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>SKU</TableHead><TableHead>상품명</TableHead><TableHead className="text-right">판매량</TableHead>
                      <TableHead className="text-right">매출</TableHead><TableHead className="text-right">광고 전 이익</TableHead><TableHead>원가</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>{productRows.map((row) => (
                      <TableRow key={row.sku}>
                        <TableCell className="font-mono text-xs">{row.sku}</TableCell><TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-right">{row.quantity.toLocaleString()}</TableCell><TableCell className="text-right">{won(row.sales)}</TableCell>
                        <TableCell className="text-right">{won(row.profit)}</TableCell>
                        <TableCell>{row.costMissing ? <Badge variant="destructive">미입력</Badge> : <Badge variant="secondary">등록</Badge>}</TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-3" aria-labelledby="commerce-stock-heading">
            <div>
              <h2 id="commerce-stock-heading" className="text-xl font-semibold tracking-tight">
                품절예측
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                최근 7일 판매 속도와 현재 가용재고를 기준으로 위험 상품을 확인합니다.
              </p>
            </div>
            <Card>
              <CardHeader><CardTitle>최근 7일 판매량 기준 품절예측</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                {forecasts.length === 0 ? (
                  <EmptyState title="재고 데이터가 없습니다." description="상품 등록 후 ‘재고 입력’으로 현재 재고를 저장해주세요." />
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>상품</TableHead><TableHead>옵션</TableHead><TableHead className="text-right">가용재고</TableHead>
                      <TableHead className="text-right">입고예정</TableHead><TableHead className="text-right">7일 판매</TableHead>
                      <TableHead className="text-right">일평균</TableHead><TableHead>예상 잔여일</TableHead><TableHead>상태</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>{forecasts.map((row) => (
                      <TableRow key={row.product_option_id}>
                        <TableCell><div className="font-medium">{row.product_name}</div><div className="text-xs text-muted-foreground">{row.internal_sku}</div></TableCell>
                        <TableCell>{row.option_name}</TableCell><TableCell className="text-right">{row.available_quantity}</TableCell>
                        <TableCell className="text-right">{row.inbound_quantity}</TableCell><TableCell className="text-right">{row.sales_7d}</TableCell>
                        <TableCell className="text-right">{Number(row.avg_daily_sales_7d).toFixed(1)}</TableCell>
                        <TableCell>{row.days_until_stockout === null ? "계산 불가" : `${row.days_until_stockout}일`}</TableCell>
                        <TableCell><ForecastBadge status={row.status} /></TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </PageShell>
  );
}

function StoreDialog({ open, onOpenChange, onSubmit, saving }: {
  open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; saving: boolean;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogTrigger asChild><Button variant="outline"><ShoppingCart /> 판매채널 등록</Button></DialogTrigger>
    <DialogContent><form onSubmit={onSubmit}><DialogHeader><DialogTitle>판매채널 등록</DialogTitle></DialogHeader>
      <div className="space-y-4 py-4"><Field label="채널"><Select name="channel" defaultValue="coupang"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="coupang">쿠팡</SelectItem><SelectItem value="naver">네이버</SelectItem><SelectItem value="manual">기타/수동</SelectItem>
      </SelectContent></Select></Field><Field label="스토어명"><Input name="store_name" required /></Field><Field label="판매자 ID"><Input name="seller_id" /></Field></div>
      <DialogFooter><Button type="submit" disabled={saving}>{saving ? "저장 중..." : "저장"}</Button></DialogFooter>
    </form></DialogContent></Dialog>;
}

function ProductDialog({ open, onOpenChange, onSubmit, stores, saving, today }: {
  open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; stores: Store[]; saving: boolean; today: string;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogTrigger asChild><Button variant="outline" disabled={stores.length === 0}><PackagePlus /> 상품·원가 등록</Button></DialogTrigger>
    <DialogContent className="max-h-[90vh] overflow-y-auto"><form onSubmit={onSubmit}><DialogHeader><DialogTitle>상품·옵션·원가 등록</DialogTitle></DialogHeader>
      <div className="grid gap-4 py-4 sm:grid-cols-2">
        <Field label="판매채널"><Select name="store_id" required><SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger><SelectContent>{stores.map((store) => <SelectItem key={store.id} value={store.id}>{channelLabel[store.channel]} · {store.store_name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="사내 SKU"><Input name="internal_sku" required /></Field><Field label="상품명"><Input name="product_name" required /></Field>
        <Field label="브랜드"><Input name="brand" /></Field><Field label="옵션명"><Input name="option_name" defaultValue="기본" /></Field>
        <Field label="채널 옵션 ID"><Input name="channel_option_id" /></Field><Field label="판매가"><Input name="sale_price" type="number" min="0" defaultValue="0" /></Field>
        <Field label="상품 원가"><Input name="cost_price" type="number" min="0" required /></Field><Field label="포장비"><Input name="packaging_cost" type="number" min="0" defaultValue="0" /></Field>
        <Field label="배송비"><Input name="shipping_cost" type="number" min="0" defaultValue="0" /></Field><Field label="원가 적용일"><Input name="effective_from" type="date" defaultValue={today} required /></Field>
      </div><DialogFooter><Button type="submit" disabled={saving}>{saving ? "저장 중..." : "저장"}</Button></DialogFooter>
    </form></DialogContent></Dialog>;
}

function SalesDialog({ open, onOpenChange, onSubmit, options, saving, today }: {
  open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; options: Option[]; saving: boolean; today: string;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogTrigger asChild><Button disabled={options.length === 0}><TrendingUp /> 일별 실적 입력</Button></DialogTrigger>
    <DialogContent className="max-h-[90vh] overflow-y-auto"><form onSubmit={onSubmit}><DialogHeader><DialogTitle>일별 매출·광고비 입력</DialogTitle></DialogHeader>
      <div className="grid gap-4 py-4 sm:grid-cols-2"><Field label="날짜"><Input name="sales_date" type="date" defaultValue={today} required /></Field>
        <Field label="상품 옵션"><OptionSelect options={options} /></Field><Field label="주문 수량"><Input name="order_quantity" type="number" min="0" defaultValue="0" required /></Field>
        <Field label="취소 수량"><Input name="cancel_quantity" type="number" min="0" defaultValue="0" /></Field><Field label="상품 매출"><Input name="gross_sales" type="number" defaultValue="0" required /></Field>
        <Field label="배송비 수익"><Input name="shipping_revenue" type="number" defaultValue="0" /></Field><Field label="판매 수수료"><Input name="commission_amount" type="number" min="0" defaultValue="0" /></Field>
        <Field label="광고비(공급가)"><Input name="ad_cost_ex_vat" type="number" min="0" defaultValue="0" /></Field><Field label="광고비 VAT"><Input name="ad_vat" type="number" min="0" defaultValue="0" /></Field>
      </div><DialogFooter><Button type="submit" disabled={saving}>{saving ? "저장 중..." : "저장"}</Button></DialogFooter>
    </form></DialogContent></Dialog>;
}

function InventoryDialog({ open, onOpenChange, onSubmit, options, saving, today }: {
  open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; options: Option[]; saving: boolean; today: string;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogTrigger asChild><Button variant="outline" disabled={options.length === 0}><Boxes /> 재고 입력</Button></DialogTrigger>
    <DialogContent><form onSubmit={onSubmit}><DialogHeader><DialogTitle>재고 스냅샷 입력</DialogTitle></DialogHeader>
      <div className="grid gap-4 py-4 sm:grid-cols-2"><Field label="기준일"><Input name="snapshot_date" type="date" defaultValue={today} required /></Field>
        <Field label="상품 옵션"><OptionSelect options={options} /></Field><Field label="채널 재고"><Input name="channel_stock" type="number" min="0" defaultValue="0" required /></Field>
        <Field label="창고 재고"><Input name="warehouse_stock" type="number" min="0" defaultValue="0" /></Field><Field label="입고 예정"><Input name="inbound_quantity" type="number" min="0" defaultValue="0" /></Field>
        <Field label="예약 수량"><Input name="reserved_quantity" type="number" min="0" defaultValue="0" /></Field>
      </div><DialogFooter><Button type="submit" disabled={saving}>{saving ? "저장 중..." : "저장"}</Button></DialogFooter>
    </form></DialogContent></Dialog>;
}

function OptionSelect({ options }: { options: Option[] }) {
  return <Select name="product_option_id" required><SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger><SelectContent>{options.map((option) => (
    <SelectItem key={option.id} value={option.id}>{option.commerce_products?.product_name} · {option.option_name} ({option.commerce_stores?.store_name})</SelectItem>
  ))}</SelectContent></Select>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function ForecastBadge({ status }: { status: StockForecast["status"] }) {
  if (status === "out_of_stock") return <Badge variant="destructive"><AlertTriangle /> 품절</Badge>;
  if (status === "critical") return <Badge variant="destructive">긴급</Badge>;
  if (status === "warning") return <Badge className="bg-amber-100 text-amber-900">주의</Badge>;
  if (status === "no_sales") return <Badge variant="outline">판매 없음</Badge>;
  return <Badge variant="secondary">정상</Badge>;
}
