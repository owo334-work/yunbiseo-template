-- 연/월차(휴가) 관리
-- 일정(schedules)의 연차/월차 카테고리를 직원별 휴가로 집계하기 위해 컬럼을 추가한다.
-- - leave_employee_id : 이 휴가가 "누구"의 것인지 (등록자 created_by 와 별개; 관리자가 대신 등록 가능)
-- - leave_days        : 휴가 일수 (1=종일, 0.5=반차, 0.25=반반차)
-- 연차 부여일수는 입사일 기준으로 코드에서 자동계산하고, 직원별 조정값(이월/특별부여)만 저장한다.
-- 월차는 회사마다 운영이 달라 부여일수를 수동으로 둔다(기본 0 = 사용내역만 집계).
-- 계산 기준(회계연도/입사일)은 system_settings 의 'leave_basis' 로 전환한다(기본 회계연도).

ALTER TABLE public.schedules
    ADD COLUMN IF NOT EXISTS leave_employee_id uuid,
    ADD COLUMN IF NOT EXISTS leave_days numeric(4, 2);

ALTER TABLE public.schedules
    ADD CONSTRAINT schedules_leave_employee_fkey FOREIGN KEY (leave_employee_id)
        REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS schedules_leave_employee_idx
    ON public.schedules USING btree (leave_employee_id)
    WHERE (leave_employee_id IS NOT NULL);

-- 직원: 연차 조정값(자동계산 부여일수에 ± 가산), 월차 부여일수(수동)
ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS annual_leave_adjust numeric(5, 2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS monthly_leave_granted numeric(5, 2) DEFAULT 0 NOT NULL;
