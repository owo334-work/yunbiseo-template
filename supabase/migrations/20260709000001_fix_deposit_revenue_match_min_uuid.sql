-- 버그 수정: sync_revenue_paid_from_deposit 트리거가 min(candidate.id) 를 사용하는데
-- Postgres 에는 min(uuid) 집계함수가 없어, revenue_id 없이 입금을 넣으면(웹훅 입금 전부 해당)
-- "function min(uuid) does not exist" (42883) 로 항상 실패했다.
-- count(*) = 1 로 이미 단일 후보만 고르므로 (array_agg(candidate.id))[1] 로 바꿔도 의미가 같다.

CREATE OR REPLACE FUNCTION public.sync_revenue_paid_from_deposit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  matched_revenue_id uuid;
begin
  if new.revenue_id is null then
    select case when count(*) = 1 then (array_agg(candidate.id))[1] else null end
      into matched_revenue_id
      from (
        select r.id
          from public.revenues r
          left join public.projects p
            on p.id = r.project_id
          left join public.customers c
            on c.id = p.customer_id
         where r.is_paid = false
           and r.total_amount = new.amount
           and (
             public.normalize_business_name(new.depositor_name) <> ''
             and public.normalize_business_name(new.depositor_name) in (
               public.normalize_business_name(c.name),
               public.normalize_business_name(c.account_holder),
               public.normalize_business_name(p.client),
               public.normalize_business_name(p.name),
               public.normalize_business_name(r.title)
             )
           )
      ) candidate;

    if matched_revenue_id is not null then
      new.revenue_id := matched_revenue_id;
    end if;
  end if;

  if new.revenue_id is not null
     and (
       tg_op = 'INSERT'
       or old.revenue_id is distinct from new.revenue_id
       or old.deposit_date is distinct from new.deposit_date
     ) then
    update public.revenues
       set is_paid = true,
           paid_date = new.deposit_date
     where id = new.revenue_id;
  end if;

  return new;
end;
$$;
