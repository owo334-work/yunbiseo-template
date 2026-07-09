import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateApiKey } from "@/lib/api-key";
import { logInfo } from "@/lib/logger";

/**
 * 인증번호(OTP) 48시간 자동 삭제.
 * Vercel Cron(또는 외부 스케줄러)이 주기적으로 호출한다(예: 매시간).
 * otp_messages 뿐 아니라 sms_inbox 의 OTP 원문도 함께 지워 인증코드가 남지 않게 한다.
 */
export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  try {
    if (!(await validateApiKey(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: otpDeleted, error: otpErr } = await supabase
      .from("otp_messages")
      .delete()
      .lt("received_at", cutoff)
      .select("id");
    if (otpErr) {
      return NextResponse.json({ error: otpErr.message }, { status: 500 });
    }

    // OTP 원문(sms_inbox)도 함께 삭제 — 인증코드가 원문에 남지 않도록
    const { data: inboxDeleted, error: inboxErr } = await supabase
      .from("sms_inbox")
      .delete()
      .eq("category", "otp")
      .lt("received_at", cutoff)
      .select("id");
    if (inboxErr) {
      return NextResponse.json({ error: inboxErr.message }, { status: 500 });
    }

    const otpCount = otpDeleted?.length ?? 0;
    const inboxCount = inboxDeleted?.length ?? 0;
    if (otpCount > 0 || inboxCount > 0) {
      logInfo("PURGE_OTP", `인증번호 자동삭제: otp ${otpCount}건, inbox ${inboxCount}건`, {
        resource: "otp_messages",
      });
    }

    return NextResponse.json(
      { success: true, deleted: { otp_messages: otpCount, sms_inbox: inboxCount } },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
