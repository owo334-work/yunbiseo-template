"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Laptop,
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

type Status = {
  state: "not_connected" | "opening" | "connected" | "needs_login" | "error";
  connected_at?: string;
  checked_at?: string;
  last_error?: string;
};

async function responseJson(response: Response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "요청을 처리하지 못했습니다.");
  return payload;
}

export function CoupangBrowserIntegrationDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [status, setStatus] = useState<Status>({ state: "not_connected" });

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(
        await responseJson(
          await fetch("/api/commerce/coupang/browser/status", {
            cache: "no-store",
          })
        )
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "연결 상태를 확인하지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadStatus();
  }, [loadStatus, open]);

  useEffect(() => {
    if (!open || status.state !== "opening") return;
    const timer = window.setInterval(() => void loadStatus(), 3_000);
    return () => window.clearInterval(timer);
  }, [loadStatus, open, status.state]);

  async function launch() {
    setLaunching(true);
    try {
      const payload = await responseJson(
        await fetch("/api/commerce/coupang/browser/launch", { method: "POST" })
      );
      toast.success(payload.message);
      setStatus((current) => ({ ...current, state: "opening" }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "로그인 창을 열지 못했습니다."
      );
    } finally {
      setLaunching(false);
    }
  }

  const connected = status.state === "connected";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Laptop /> 쿠팡 로그인 연결
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>쿠팡 판매자센터 로컬 연결</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="rounded-xl border bg-muted/30 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">연결 상태</p>
              {connected ? (
                <Badge className="bg-emerald-100 text-emerald-800">
                  <CheckCircle2 /> 연결됨
                </Badge>
              ) : status.state === "opening" ? (
                <Badge variant="secondary">
                  <RefreshCw className="animate-spin" /> 로그인 확인 중
                </Badge>
              ) : status.state === "error" ? (
                <Badge variant="destructive">
                  <XCircle /> 실행 오류
                </Badge>
              ) : (
                <Badge variant="outline">로그인 필요</Badge>
              )}
            </div>
            {status.connected_at ? (
              <p className="mt-2 text-muted-foreground">
                마지막 연결:{" "}
                {new Date(status.connected_at).toLocaleString("ko-KR")}
              </p>
            ) : null}
            {status.last_error ? (
              <p className="mt-2 text-red-600">{status.last_error}</p>
            ) : null}
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">비밀번호를 윤비서에 저장하지 않습니다.</p>
                <p>
                  전용 브라우저가 열리면 사장님이 쿠팡 화면에 직접 로그인합니다.
                  로그인 쿠키는 이 PC의 비공개 폴더에만 남고 Supabase에는 올라가지
                  않습니다.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p>1. 아래 버튼으로 쿠팡 전용 브라우저를 엽니다.</p>
            <p>2. 아이디·비밀번호와 추가 인증을 직접 완료합니다.</p>
            <p>
              3. 연결 완료 후에는 판매정보 화면의 읽기 전용 수집 경로를
              학습시킬 수 있습니다.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-wrap sm:justify-between">
          <Button type="button" variant="outline" onClick={loadStatus} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> 상태 확인
          </Button>
          <Button type="button" onClick={launch} disabled={launching || status.state === "opening"}>
            <ExternalLink />
            {connected ? "다시 로그인하기" : launching ? "여는 중..." : "로그인 창 열기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
