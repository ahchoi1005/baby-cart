-- 아기맞이 장바구니: 세일 가격 기능 추가
-- 이미 supabase-setup.sql 을 실행했다면, 이 파일만 SQL Editor 에 붙여넣고 Run 하세요.
-- 여러 번 실행해도 괜찮아요.

alter table public.candidates add column if not exists sale_price numeric(10,2);
alter table public.candidates add column if not exists sale_until date;
alter table public.candidates add column if not exists sale_note text not null default '';
alter table public.candidates add column if not exists paid_price numeric(10,2);

-- 새 칸을 앱이 바로 알아보도록 새로고침
notify pgrst, 'reload schema';
