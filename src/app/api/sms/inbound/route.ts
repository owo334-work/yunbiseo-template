import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { validateApiKey } from "@/lib/api-key";
import { classifySms } from "@/lib/sms-classifier";
import { parseOtpSms } from "@/lib/otp-sms-parser";
import { parseDepositSms } from "@/lib/deposit-sms-parser";
import { parseCardSms } from "@/lib/card-sms-parser";
import { logInfo } from "@/lib/logger";

/**
 * 통합 SMS 수신 webhook. 안드로이드 자동전달앱(Tasker/MacroDroid 등)이 문자 수신 시 호출한다.
 *
 * 인증: x-api-key 헤더(또는 Bearer). [시스템설정]에서 발급.
 *
 * 본문(아래 중 아무 형식이나 가능):
 *   - form-urlencoded: text=<SMS원문>&sender=<발신번호>&device=<수신폰라벨>
 *   - JSON:            {"text":"...","sender":"...","device":"대표폰"}
 *   - raw text:        <SMS원문>  (sender/device 없음)
 *
 * 처리: 원문을 sms_inbox 에 항상 저장(중복 제외) → 3종 분류 → 각 테이블로 라우팅.
 *   otp     → otp_messages
 *   deposit → deposits (계좌 끝4자리 포함)
 *   card    → card_transactions (카드 끝4자리로 corporate_cards 매칭)
 *   unknown → inbox 에만 보관 (나중에 재분류)
 */
export async function POST(request: NextRequest) {
  try {
    if (!(await validateApiKey(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
    const bodyRaw = await request.text();

    let text = "";
    let sender: string | null = null;
    let device: string | null = null;

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const p = new URLSearchParams(bodyRaw);
      text = p.get("text") ?? "";
      sender = p.get("sender");
      device = p.get("device");
      if (!text && sender) {
        text = sender;
        sender = null;
      }
    } else if (contentType.includes("application/json")) {
      try {
        const parsed = JSON.parse(bodyRaw);
        if (typeof parsed === "string") {
          text = parsed;
        } else if (parsed && typeof parsed === "object") {
          const o = parsed as Record<string, unknown>;
          text = typeof o.text === "string" ? o.text : "";
          sender = typeof o.sender === "string" ? o.sender : null;
          device = typeof o.device === "string" ? o.device : null;
        }
      } catch {
        text = bodyRaw;
      }
    } else {
      text = bodyRaw;
    }

    text = text.trim();
    if (!text) {
      return NextResponse.json({ error: "Empty body" }, { status: 400 });
    }
    sender = sender?.trim() || null;
    device = device?.trim() || null;

    const supabase = createAdminClient();
    const receivedAt = new Date();
    const category = classifySms(text);

    // 중복 방지: device|sender|body 해시 (자동전달앱 재시도 대비, 원문이 같으면 1건만 저장)
    const dedupKey = createHash("sha256")
      .update(`${device ?? ""}|${sender ?? ""}|${text}`)
      .digest("hex");

    const { data: inbox, error: inboxError } = await supabase
      .from("sms_inbox")
      .insert({
        device_label: device,
        sender,
        body: text,
        category,
        received_at: receivedAt.toISOString(),
        dedup_key: dedupKey,
      })
      .select("id")
      .single();

    // 이미 받은 문자면(unique 위반) 조용히 성공 처리
    if (inboxError) {
      if (inboxError.code === "23505") {
        return NextResponse.json({ success: true, duplicate: true }, { status: 200 });
      }
      return NextResponse.json({ error: inboxError.message }, { status: 500 });
    }

    let routed: Record<string, unknown> = { category };

    // ── 인증번호 ──────────────────────────────────────────────────────
    if (category === "otp") {
      const otp = parseOtpSms(text);
      const { data, error } = await supabase
        .from("otp_messages")
        .insert({
          service: otp.service,
          code: otp.code ?? "(미상)",
          device_label: device,
          sender,
          raw_message: text,
          received_at: receivedAt.toISOString(),
        })
        .select("id")
        .single();
      if (!error && data) {
        await supabase.from("sms_inbox").update({ otp_id: data.id }).eq("id", inbox.id);
        routed = { category, service: otp.service, code_captured: otp.code != null };
      }
    }

    // ── 계좌입금 ──────────────────────────────────────────────────────
    else if (category === "deposit") {
      const dep = parseDepositSms(text);
      if (dep.amount > 0) {
        const kstToday = new Date(receivedAt.getTime() + 9 * 3600 * 1000)
          .toISOString()
          .slice(0, 10);
        const { data, error } = await supabase
          .from("deposits")
          .insert({
            deposit_date: dep.depositDate ?? kstToday,
            amount: dep.amount,
            depositor_name: dep.depositorName ?? "(미상)",
            bank_name: dep.bankName,
            account_last4: dep.accountLast4,
            received_device: device,
            source: "webhook",
            raw_message: text,
          })
          .select("id")
          .single();
        if (!error && data) {
          await supabase.from("sms_inbox").update({ deposit_id: data.id }).eq("id", inbox.id);
          routed = {
            category,
            amount: dep.amount,
            account_last4: dep.accountLast4,
            parse_status: dep.status,
          };
        }
      }
    }

    // ── 카드결제승인 ──────────────────────────────────────────────────
    else if (category === "card") {
      const parsed = parseCardSms(text, receivedAt);
      if (Number.isNaN(parsed.approvedAt.getTime())) parsed.approvedAt = receivedAt;

      let cardId: string | null = null;
      if (parsed.last4) {
        const { data: card } = await supabase
          .from("corporate_cards")
          .select("id")
          .eq("last4", parsed.last4)
          .eq("is_active", true)
          .maybeSingle();
        cardId = card?.id ?? null;
      }

      const { data, error } = await supabase
        .from("card_transactions")
        .insert({
          card_id: cardId,
          card_last4: parsed.last4,
          amount: parsed.amount,
          currency: parsed.currency,
          foreign_amount: parsed.foreignAmount,
          merchant: parsed.merchant,
          approved_at: parsed.approvedAt.toISOString(),
          raw_text: text,
          parse_status: parsed.status,
          status: "pending",
          received_device: device,
        })
        .select("id")
        .single();
      if (!error && data) {
        await supabase
          .from("sms_inbox")
          .update({ card_transaction_id: data.id })
          .eq("id", inbox.id);
        routed = {
          category,
          last4: parsed.last4,
          amount: parsed.amount,
          merchant: parsed.merchant,
          card_matched: cardId != null,
          parse_status: parsed.status,
        };
      }
    }

    logInfo("SMS_INBOUND", `SMS 수신·분류: ${category} (${device ?? "폰미상"})`, {
      resource: "sms_inbox",
      resource_id: inbox.id,
      details: routed,
    });

    return NextResponse.json({ success: true, id: inbox.id, ...routed }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
