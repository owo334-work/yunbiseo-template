-- 월차(monthly_leave) 일정 유형 제거.
-- 월차 구분 없이 연차로 통일한다(1년 미만 근로자도 연차로 월 1일 자동 부여).
-- 기존 데이터 호환을 위해 애플리케이션의 LEAVE_CATEGORY_VALUES 판별에는 monthly_leave 를 남겨두되,
-- 선택 가능한 유형 목록(schedule_categories)에서는 제거한다.
DELETE FROM public.schedule_categories WHERE value = 'monthly_leave';
