"use client";

import { Check, Copy, ShieldCheck, Smartphone } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingState, PageHeader, PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

interface OtpMessage {
  id: string;
  service: string | null;
  code: string;
  device_label: string | null;
  sender: string | null;
  received_at: string;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

export default function OtpPage() {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<OtpMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(false);
    const { data, error: err } = await supabase
      .from("otp_messages")
      .select("id, service, code, device_label, sender, received_at")
      .order("received_at", { ascending: false })
      .limit(500);
    if (err) {
      setError(true);
    } else {
      setMessages((data ?? []) as OtpMessage[]);
    }
    if (showLoading) setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel("otp-messages-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "otp_messages" },
        (payload) => {
          const incoming = payload.new as OtpMessage;
          if (!incoming.id) return;
          setMessages((current) => [
            incoming,
            ...current.filter((message) => message.id !== incoming.id),
          ]);
          toast.success("새 인증번호가 도착했습니다.");
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void fetchData(false);
      });

    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") void fetchData(false);
    };
    window.addEventListener("focus", syncWhenVisible);
    document.addEventListener("visibilitychange", syncWhenVisible);

    return () => {
      window.removeEventListener("focus", syncWhenVisible);
      document.removeEventListener("visibilitychange", syncWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [fetchData, supabase]);

  const copyCode = useCallback(async (msg: OtpMessage) => {
    try {
      await navigator.clipboard.writeText(msg.code);
      setCopiedId(msg.id);
      toast.success("인증번호를 복사했습니다.");
      setTimeout(() => setCopiedId((cur) => (cur === msg.id ? null : cur)), 1500);
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  }, []);

  const keyword = search.trim();
  const filtered = messages.filter((m) => {
    if (!keyword) return true;
    return (
      (m.service ?? "").includes(keyword) ||
      (m.device_label ?? "").includes(keyword) ||
      m.code.includes(keyword)
    );
  });

  return (
    <PageShell>
      <PageHeader
        title="인증번호"
        description="여러 폰으로 받은 인증번호(OTP)를 한곳에서 확인합니다. 보안을 위해 인증번호는 수신 후 48시간이 지나면 자동으로 삭제됩니다."
      />

      <div className="flex items-center gap-2 rounded-[1rem] border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-xs text-amber-800">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        인증번호는 타인에게 노출되지 않도록 주의하세요. 48시간 후 자동 삭제됩니다.
      </div>

      <Input
        placeholder="서비스·수신폰·번호로 검색"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full sm:max-w-sm"
      />

      {loading ? (
        <LoadingState title="인증번호를 불러오는 중입니다." />
      ) : error ? (
        <ErrorState onRetry={() => void fetchData()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={messages.length === 0 ? "받은 인증번호가 없습니다." : "조건에 맞는 인증번호가 없습니다."}
          description={
            messages.length === 0
              ? "폰에서 인증번호 문자가 전달되면 여기에 모입니다."
              : "검색어를 조정해 보세요."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <Card key={m.id} className="rounded-[1rem] border-border/70 bg-card/85">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex rounded-full border border-primary/15 bg-primary/8 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {m.service ?? "서비스 미상"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{formatWhen(m.received_at)}</span>
                </div>

                <button
                  type="button"
                  onClick={() => void copyCode(m)}
                  className="group flex w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-2 text-left transition-colors hover:border-primary/40"
                  aria-label="인증번호 복사"
                >
                  <span className="font-mono text-xl font-semibold tracking-widest text-foreground">
                    {m.code}
                  </span>
                  {copiedId === m.id ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                  )}
                </button>

                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Smartphone className="h-3.5 w-3.5" />
                  {m.device_label ?? "수신폰 미상"}
                  {m.sender ? <span className="text-muted-foreground/70">· {m.sender}</span> : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
