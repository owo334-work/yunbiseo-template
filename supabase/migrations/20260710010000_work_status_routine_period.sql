-- 고정업무 체크 상태를 일간/주간/월간 주기마다 새로 시작하기 위한 완료 주기 키
ALTER TABLE public.work_status_tasks
    ADD COLUMN IF NOT EXISTS routine_checked_key text;

COMMENT ON COLUMN public.work_status_tasks.routine_checked_key IS
    '고정업무 마지막 완료 주기: daily=YYYY-MM-DD, weekly=해당 주 월요일, monthly=YYYY-MM';
