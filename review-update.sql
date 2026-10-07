-- 아기맞이 장바구니: 리뷰 요약 칸 추가
-- 이미 supabase-setup.sql 을 실행했다면, 이 파일만 SQL Editor 에 붙여넣고 Run 하세요.
-- 여러 번 실행해도 괜찮아요. 세일 기능(sale-update.sql)도 아직이면 같이 넣어둘게요.

alter table public.candidates add column if not exists sale_price numeric(10,2);
alter table public.candidates add column if not exists sale_until date;
alter table public.candidates add column if not exists sale_note text not null default '';
alter table public.candidates add column if not exists paid_price numeric(10,2);

alter table public.candidates add column if not exists review_summary text not null default '';
alter table public.candidates add column if not exists review_by text not null default '';
alter table public.candidates add column if not exists review_at timestamptz;

notify pgrst, 'reload schema';
