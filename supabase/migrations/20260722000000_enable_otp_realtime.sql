-- 인증번호가 저장되는 즉시 열린 대시보드 화면에 전달한다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'otp_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.otp_messages;
  END IF;
END
$$;
