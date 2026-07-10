-- 기존에 완료로 체크돼 있던 고정업무는 현재 주기의 체크로 이어받는다.
UPDATE public.work_status_tasks
SET routine_checked_key = CASE list_type
    WHEN 'daily' THEN to_char(CURRENT_DATE, 'YYYY-MM-DD')
    WHEN 'weekly' THEN to_char(date_trunc('week', CURRENT_DATE)::date, 'YYYY-MM-DD')
    WHEN 'monthly' THEN to_char(CURRENT_DATE, 'YYYY-MM')
    ELSE routine_checked_key
END
WHERE list_type IN ('daily', 'weekly', 'monthly')
  AND status = '완료'
  AND routine_checked_key IS NULL;
