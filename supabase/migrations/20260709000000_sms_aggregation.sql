-- 다수 안드로이드 폰의 SMS 취합 기능 (인증번호 / 계좌입금 / 카드결제승인)
-- 자동전달앱(Tasker/MacroDroid 등)이 문자를 웹훅으로 보내면 원문을 항상 sms_inbox 에 저장하고,
-- 3종으로 분류해 각각 otp_messages / deposits / card_transactions 로 라우팅한다.
-- - 수신 폰은 '라벨'(대표폰/경리폰 등)로 구분한다.
-- - 인증번호는 민감정보라 48시간 후 자동 삭제 대상이다(별도 정리 작업에서 처리).

-- ── 원문 보관함 (모든 수신 SMS 원본, 분류 실패해도 유실 방지) ──────────────
CREATE TABLE IF NOT EXISTS public.sms_inbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    device_label text,                       -- 수신 폰 라벨 (예: 대표폰)
    sender text,                             -- 발신번호 (예: 1670-9853)
    body text NOT NULL,                      -- SMS 원문
    category text DEFAULT 'unknown' NOT NULL, -- 'otp' | 'deposit' | 'card' | 'unknown'
    received_at timestamp with time zone DEFAULT now() NOT NULL, -- 문자 수신시각
    dedup_key text,                          -- 중복 방지 해시 (device|sender|body|received_at)
    otp_id uuid,                             -- 분류 결과 연결 (추적용)
    deposit_id uuid,
    card_transaction_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sms_inbox_pkey PRIMARY KEY (id),
    CONSTRAINT sms_inbox_category_check
        CHECK (category = ANY (ARRAY['otp'::text, 'deposit'::text, 'card'::text, 'unknown'::text])),
    CONSTRAINT sms_inbox_dedup_unique UNIQUE (dedup_key)
);

CREATE INDEX IF NOT EXISTS sms_inbox_received_at_idx
    ON public.sms_inbox USING btree (received_at DESC);
CREATE INDEX IF NOT EXISTS sms_inbox_category_idx
    ON public.sms_inbox USING btree (category);

ALTER TABLE public.sms_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read sms_inbox"
    ON public.sms_inbox FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete sms_inbox"
    ON public.sms_inbox FOR DELETE TO authenticated USING (true);
CREATE POLICY "Service role full access on sms_inbox"
    ON public.sms_inbox TO service_role USING (true) WITH CHECK (true);

-- ── 인증번호 (48시간 후 자동 삭제 대상) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.otp_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service text,                            -- 서비스명 (예: 쿠팡)
    code text NOT NULL,                      -- 인증번호
    device_label text,                       -- 수신 폰 라벨
    sender text,                             -- 발신번호
    raw_message text,                        -- 원문
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT otp_messages_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS otp_messages_received_at_idx
    ON public.otp_messages USING btree (received_at DESC);

ALTER TABLE public.otp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read otp_messages"
    ON public.otp_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete otp_messages"
    ON public.otp_messages FOR DELETE TO authenticated USING (true);
CREATE POLICY "Service role full access on otp_messages"
    ON public.otp_messages TO service_role USING (true) WITH CHECK (true);

-- sms_inbox → 분류 결과 FK (OTP 자동삭제 시 inbox 는 남기고 링크만 끊는다)
ALTER TABLE public.sms_inbox
    ADD CONSTRAINT sms_inbox_otp_fkey FOREIGN KEY (otp_id)
        REFERENCES public.otp_messages(id) ON DELETE SET NULL,
    ADD CONSTRAINT sms_inbox_deposit_fkey FOREIGN KEY (deposit_id)
        REFERENCES public.deposits(id) ON DELETE SET NULL,
    ADD CONSTRAINT sms_inbox_card_tx_fkey FOREIGN KEY (card_transaction_id)
        REFERENCES public.card_transactions(id) ON DELETE SET NULL;

-- ── 기존 테이블 확장 ──────────────────────────────────────────────────────
-- 입금: 계좌 끝4자리로 그룹핑 + 수신 폰 라벨
ALTER TABLE public.deposits
    ADD COLUMN IF NOT EXISTS account_last4 text,
    ADD COLUMN IF NOT EXISTS received_device text;

CREATE INDEX IF NOT EXISTS deposits_account_last4_idx
    ON public.deposits USING btree (account_last4);

-- 카드: 수신 폰 라벨
ALTER TABLE public.card_transactions
    ADD COLUMN IF NOT EXISTS received_device text;
