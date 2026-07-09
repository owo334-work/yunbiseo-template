"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { ACCOUNT_ALIASES_KEY, type AccountAliasMap } from "@/lib/account-aliases";

export interface AccountRef {
  last4: string;
  bank: string | null;
}

export function AccountAliasDialog({
  open,
  onOpenChange,
  accounts,
  aliases,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: AccountRef[];
  aliases: AccountAliasMap;
  onSaved: (map: AccountAliasMap) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>계좌 별칭</DialogTitle>
          <DialogDescription>
            계좌 끝 4자리마다 이름을 지정하면, 그 계좌의 모든 입금에 자동으로 표시됩니다.
          </DialogDescription>
        </DialogHeader>
        {/* 열릴 때만 마운트 → 매번 현재 별칭으로 초기화 (effect 불필요) */}
        {open ? (
          <AliasForm
            accounts={accounts}
            aliases={aliases}
            onSaved={onSaved}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AliasForm({
  accounts,
  aliases,
  onSaved,
  onClose,
}: {
  accounts: AccountRef[];
  aliases: AccountAliasMap;
  onSaved: (map: AccountAliasMap) => void;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [draft, setDraft] = useState<AccountAliasMap>(() => ({ ...aliases }));
  const [saving, setSaving] = useState(false);

  // 입금에서 보인 계좌 + 이미 별칭이 있는 계좌(입금이 사라져도 유지)를 합쳐 표시
  const rows = useMemo(() => {
    const byLast4 = new Map<string, string | null>();
    for (const a of accounts) byLast4.set(a.last4, a.bank);
    for (const last4 of Object.keys(aliases)) {
      if (!byLast4.has(last4)) byLast4.set(last4, null);
    }
    return Array.from(byLast4.entries())
      .map(([last4, bank]) => ({ last4, bank }))
      .sort((a, b) => a.last4.localeCompare(b.last4));
  }, [accounts, aliases]);

  const handleSave = async () => {
    setSaving(true);
    const cleaned: AccountAliasMap = {};
    for (const [last4, name] of Object.entries(draft)) {
      const trimmed = name.trim();
      if (trimmed) cleaned[last4] = trimmed;
    }
    const { error } = await supabase
      .from("system_settings")
      .upsert({ key: ACCOUNT_ALIASES_KEY, value: JSON.stringify(cleaned) }, { onConflict: "key" });
    setSaving(false);
    if (error) {
      toast.error("계좌 별칭 저장에 실패했습니다.");
      return;
    }
    toast.success("계좌 별칭을 저장했습니다.");
    onSaved(cleaned);
    onClose();
  };

  return (
    <>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          아직 계좌 끝자리가 있는 입금이 없습니다.
        </p>
      ) : (
        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {rows.map((row) => (
            <div key={row.last4} className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-sm">
                {row.bank ? <span className="text-muted-foreground">{row.bank} </span> : null}
                <span className="font-mono">···{row.last4}</span>
              </span>
              <Input
                value={draft[row.last4] ?? ""}
                onChange={(e) => setDraft((prev) => ({ ...prev, [row.last4]: e.target.value }))}
                placeholder="별칭 (예: 운영통장)"
                className="h-9"
              />
            </div>
          ))}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          취소
        </Button>
        <Button onClick={() => void handleSave()} disabled={saving || rows.length === 0}>
          {saving ? "저장 중…" : "저장"}
        </Button>
      </DialogFooter>
    </>
  );
}
