"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Laptop,
  Plus,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AccountType = "wing_growth" | "rocket";
type Status = {
  state: "not_connected" | "opening" | "connected" | "needs_login" | "error";
  connected_at?: string;
  checked_at?: string;
  last_error?: string;
};
type Account = {
  id: string;
  display_name: string;
  account_type: AccountType;
  created_at: string;
  status: Status;
};

const accountTypeLabel: Record<AccountType, string> = {
  wing_growth: "쿠팡 판매자 Wing · 로켓그로스",
  rocket: "쿠팡로켓",
};

async function responseJson(response: Response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "요청을 처리하지 못했습니다.");
  return payload;
}

export function CoupangBrowserIntegrationDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await responseJson(
        await fetch("/api/commerce/coupang/browser/accounts", {
          cache: "no-store",
        })
      );
      setAccounts(payload.accounts);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "계정 목록을 확인하지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadAccounts();
  }, [loadAccounts, open]);

  useEffect(() => {
    if (!open || !accounts.some((account) => account.status.state === "opening")) {
      return;
    }
    const timer = window.setInterval(() => void loadAccounts(), 3_000);
    return () => window.clearInterval(timer);
  }, [accounts, loadAccounts, open]);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    const form = new FormData(event.currentTarget);
    try {
      const payload = await responseJson(
        await fetch("/api/commerce/coupang/browser/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            display_name: form.get("display_name"),
            account_type: form.get("account_type"),
          }),
        })
      );
      toast.success("쿠팡 계정을 추가했습니다. 이제 전용 브라우저에서 로그인해주세요.");
      setShowCreate(false);
      await loadAccounts();
      await launch(payload.account.id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "계정을 추가하지 못했습니다."
      );
    } finally {
      setCreating(false);
    }
  }

  async function launch(accountId: string) {
    setLaunchingId(accountId);
    try {
      const payload = await responseJson(
        await fetch("/api/commerce/coupang/browser/launch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: accountId }),
        })
      );
      toast.success(payload.message);
      setAccounts((current) =>
        current.map((account) =>
          account.id === accountId
            ? { ...account, status: { ...account.status, state: "opening" } }
            : account
        )
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "로그인 창을 열지 못했습니다."
      );
    } finally {
      setLaunchingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Laptop /> 쿠팡 로그인 연결
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>쿠팡 계정 로컬 연결</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-medium">계정별로 전용 Chrome을 따로 사용합니다.</p>
                <p className="mt-1">
                  아이디·비밀번호는 쿠팡 화면에서 직접 입력하며 윤비서와
                  Supabase에는 저장되지 않습니다.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium">연결 계정 {accounts.length}개</p>
              <p className="text-sm text-muted-foreground">
                5개 이상도 추가할 수 있으며 로그인 상태는 서로 섞이지 않습니다.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadAccounts} disabled={loading}>
                <RefreshCw className={loading ? "animate-spin" : ""} /> 상태 확인
              </Button>
              <Button onClick={() => setShowCreate((value) => !value)}>
                <Plus /> 계정 추가하기
              </Button>
            </div>
          </div>

          {showCreate ? (
            <form onSubmit={createAccount} className="space-y-4 rounded-xl border p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="coupang-account-name">스토어 구분명</Label>
                  <Input
                    id="coupang-account-name"
                    name="display_name"
                    placeholder="예: 한봄 로켓그로스"
                    maxLength={50}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>계정 유형</Label>
                  <Select name="account_type" defaultValue="wing_growth">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wing_growth">쿠팡 판매자 Wing · 로켓그로스</SelectItem>
                      <SelectItem value="rocket">쿠팡로켓</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                  취소
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? "추가 중..." : "추가 후 로그인"}
                </Button>
              </div>
            </form>
          ) : null}

          <div className="space-y-3">
            {accounts.length === 0 && !loading ? (
              <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                연결된 쿠팡 계정이 없습니다. `계정 추가하기`를 눌러주세요.
              </div>
            ) : (
              accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  launching={launchingId === account.id}
                  onLaunch={() => launch(account.id)}
                />
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccountCard({
  account,
  launching,
  onLaunch,
}: {
  account: Account;
  launching: boolean;
  onLaunch: () => void;
}) {
  const connected = account.status.state === "connected";
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{account.display_name}</p>
          <Badge variant="outline">{accountTypeLabel[account.account_type]}</Badge>
          {connected ? (
            <Badge className="bg-emerald-100 text-emerald-800">
              <CheckCircle2 /> 연결됨
            </Badge>
          ) : account.status.state === "opening" ? (
            <Badge variant="secondary">
              <RefreshCw className="animate-spin" /> 로그인 확인 중
            </Badge>
          ) : account.status.state === "error" ? (
            <Badge variant="destructive">
              <XCircle /> 실행 오류
            </Badge>
          ) : (
            <Badge variant="outline">로그인 필요</Badge>
          )}
        </div>
        {account.status.connected_at ? (
          <p className="text-xs text-muted-foreground">
            마지막 연결: {new Date(account.status.connected_at).toLocaleString("ko-KR")}
          </p>
        ) : null}
        {account.status.last_error ? (
          <p className="text-xs text-red-600">{account.status.last_error}</p>
        ) : null}
      </div>
      <Button
        type="button"
        variant={connected ? "outline" : "default"}
        onClick={onLaunch}
        disabled={launching || account.status.state === "opening"}
      >
        <ExternalLink />
        {launching
          ? "여는 중..."
          : connected
            ? "이 계정 다시 로그인"
            : "이 계정 로그인"}
      </Button>
    </div>
  );
}
