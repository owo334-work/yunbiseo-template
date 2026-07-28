"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Link2, RefreshCw, ShoppingBag, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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

interface CoupangStatus {
  configured: boolean;
  vendor_id?: string;
  access_key_hint?: string;
  last_tested_at?: string | null;
  last_test_status?: "success" | "failed" | null;
  last_test_message?: string | null;
  last_synced_at?: string | null;
}

async function responseJson(response: Response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "요청을 처리하지 못했습니다.");
  return payload;
}

export function CoupangIntegrationDialog({ onSynced }: { onSynced: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<CoupangStatus>({ configured: false });
  const [vendorId, setVendorId] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const payload = (await responseJson(
        await fetch("/api/commerce/coupang/settings", { cache: "no-store" })
      )) as CoupangStatus;
      setStatus(payload);
      setVendorId(payload.vendor_id ?? "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "쿠팡 연결 상태를 확인하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadStatus();
  }, [loadStatus, open]);

  async function save() {
    if (!vendorId.trim()) return toast.error("판매자 ID를 입력해주세요.");
    if (!status.configured && (!accessKey.trim() || !secretKey.trim())) {
      return toast.error("처음 연결할 때는 Access Key와 Secret Key가 필요합니다.");
    }

    setSaving(true);
    try {
      await responseJson(
        await fetch("/api/commerce/coupang/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendor_id: vendorId,
            access_key: accessKey,
            secret_key: secretKey,
          }),
        })
      );
      setAccessKey("");
      setSecretKey("");
      toast.success("쿠팡 연결 정보를 안전하게 저장했습니다.");
      await loadStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "연결 정보를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const payload = await responseJson(
        await fetch("/api/commerce/coupang/test", { method: "POST" })
      );
      toast.success(payload.message);
      await loadStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "쿠팡 연결 시험에 실패했습니다.");
      await loadStatus();
    } finally {
      setTesting(false);
    }
  }

  async function sync() {
    setSyncing(true);
    try {
      const payload = await responseJson(
        await fetch("/api/commerce/coupang/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );
      toast.success(payload.message);
      await Promise.all([loadStatus(), onSynced()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "쿠팡 매출을 가져오지 못했습니다.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><ShoppingBag /> 쿠팡 자동연동</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>쿠팡 Open API 연결</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">연결 상태 확인 중...</div>
        ) : (
          <div className="space-y-5 py-3">
            <div className="rounded-xl border bg-muted/30 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">연결 상태</p>
                {!status.configured ? (
                  <Badge variant="outline">미설정</Badge>
                ) : status.last_test_status === "success" ? (
                  <Badge className="bg-emerald-100 text-emerald-800"><CheckCircle2 /> 연결됨</Badge>
                ) : status.last_test_status === "failed" ? (
                  <Badge variant="destructive"><XCircle /> 확인 필요</Badge>
                ) : (
                  <Badge variant="secondary">시험 전</Badge>
                )}
              </div>
              {status.access_key_hint ? (
                <p className="mt-2 text-muted-foreground">저장된 Access Key: {status.access_key_hint}</p>
              ) : null}
              {status.last_test_message ? (
                <p className="mt-1 text-muted-foreground">{status.last_test_message}</p>
              ) : null}
              {status.last_synced_at ? (
                <p className="mt-1 text-muted-foreground">
                  마지막 매출 가져오기: {new Date(status.last_synced_at).toLocaleString("ko-KR")}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="coupang-vendor-id">판매자 ID</Label>
              <Input
                id="coupang-vendor-id"
                value={vendorId}
                onChange={(event) => setVendorId(event.target.value)}
                placeholder="예: A00012345"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupang-access-key">Access Key</Label>
              <Input
                id="coupang-access-key"
                type="password"
                value={accessKey}
                onChange={(event) => setAccessKey(event.target.value)}
                placeholder={status.configured ? "변경할 때만 입력" : "Wing에서 발급받은 Access Key"}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupang-secret-key">Secret Key</Label>
              <Input
                id="coupang-secret-key"
                type="password"
                value={secretKey}
                onChange={(event) => setSecretKey(event.target.value)}
                placeholder={status.configured ? "변경할 때만 입력" : "Wing에서 발급받은 Secret Key"}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                키는 암호화해서 저장하며 화면에 다시 표시하지 않습니다. 로그인 정보는 입력하지 않습니다.
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Wing 판매자센터에서 직접 발급받은 Open API 키가 필요합니다. 키 입력은 사장님이 직접 해주세요.
            </div>
          </div>
        )}

        <DialogFooter className="flex-wrap sm:justify-between">
          <Button type="button" onClick={save} disabled={loading || saving}>
            <Link2 /> {saving ? "저장 중..." : "연결정보 저장"}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={test} disabled={!status.configured || testing}>
              <CheckCircle2 /> {testing ? "시험 중..." : "연결 시험"}
            </Button>
            <Button type="button" variant="outline" onClick={sync} disabled={status.last_test_status !== "success" || syncing}>
              <RefreshCw className={syncing ? "animate-spin" : ""} />
              {syncing ? "가져오는 중..." : "최근 7일 매출 가져오기"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
