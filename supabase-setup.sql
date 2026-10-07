-- 아기맞이 장바구니: Supabase 설정
-- Supabase 대시보드 > SQL Editor > New query 에 전부 붙여넣고 Run 을 누르세요.
-- 여러 번 실행해도 괜찮아요(기본 품목은 표가 비어 있을 때만 들어가요).

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  priority text not null default '선택',
  note text not null default '',
  skip boolean not null default false,
  sort_order integer,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items on delete cascade,
  product text not null,
  brand text not null default '',
  price numeric(10,2),
  pros text not null default '',
  cons text not null default '',
  link text not null default '',
  note text not null default '',
  chosen boolean not null default false,
  bought boolean not null default false,
  added_by text not null default '',
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists candidates_item_id_idx on public.candidates (item_id);

-- 수정 시각 자동 기록
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists items_touch on public.items;
drop trigger if exists candidates_touch on public.candidates;
create trigger items_touch before update on public.items for each row execute function public.touch_updated_at();
create trigger candidates_touch before update on public.candidates for each row execute function public.touch_updated_at();

-- 로그인한 사람(두 분 계정)만 읽고 쓸 수 있게 막기. 목록은 두 분이 함께 써요.
alter table public.items enable row level security;
alter table public.candidates enable row level security;
drop policy if exists "signed in shared" on public.items;
drop policy if exists "signed in shared" on public.candidates;
create policy "signed in shared" on public.items for all to authenticated using (true) with check (true);
create policy "signed in shared" on public.candidates for all to authenticated using (true) with check (true);
revoke all on public.items, public.candidates from anon;
grant select, insert, update, delete on public.items, public.candidates to authenticated;

-- 한 사람이 바꾸면 다른 사람 화면에도 바로 보이게
do $$ begin
  begin alter publication supabase_realtime add table public.items; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.candidates; exception when duplicate_object then null; end;
end $$;
alter table public.items replica identity full;
alter table public.candidates replica identity full;

-- 기본 품목 36개 (표가 비어 있을 때만)
insert into public.items (name, category, priority, note, sort_order)
select * from (values
  ('신생아 카시트', '이동', '출산 전 필수', '퇴원할 때 필요. 미리 차에 설치해두기', 1),
  ('유모차', '이동', '출산 전 필수', '카시트 호환(트래블 시스템) 여부 확인', 2),
  ('아기띠', '이동', '선택', '', 3),
  ('젖병', '수유', '출산 전 필수', '', 4),
  ('젖꼭지', '수유', '출산 전 필수', '신생아용 단계 확인', 5),
  ('젖병솔·건조대', '수유', '출산 전 필수', '', 6),
  ('젖병세척기·소독건조기', '수유', '선택', '', 7),
  ('유축기', '수유', '출산 전 필수', '건강보험으로 받을 수 있는지 확인', 8),
  ('분유', '수유', '출산 전 필수', '소량만 먼저', 9),
  ('분유제조기', '수유', '선택', '', 10),
  ('수유쿠션', '수유', '선택', '', 11),
  ('가제손수건·턱받이', '수유', '출산 전 필수', '', 12),
  ('기저귀(신생아)', '위생·목욕', '출산 전 필수', '신생아 사이즈는 금방 작아짐', 13),
  ('물티슈', '위생·목욕', '출산 전 필수', '', 14),
  ('기저귀 크림', '위생·목욕', '출산 전 필수', '', 15),
  ('기저귀 교환대·패드', '위생·목욕', '출산 전 필수', '', 16),
  ('기저귀 휴지통', '위생·목욕', '선택', '', 17),
  ('아기 욕조', '위생·목욕', '출산 전 필수', '', 18),
  ('바디워시·로션', '위생·목욕', '출산 전 필수', '', 19),
  ('손톱깎이', '위생·목욕', '출산 전 필수', '', 20),
  ('체온계', '위생·목욕', '출산 전 필수', '', 21),
  ('콧물흡입기', '위생·목욕', '선택', '', 22),
  ('아기침대(배시넷·크립)', '수면', '출산 전 필수', '', 23),
  ('매트리스', '수면', '출산 전 필수', '단단하고 평평한 것', 24),
  ('방수 시트', '수면', '출산 전 필수', '', 25),
  ('스와들·슬립색', '수면', '출산 전 필수', '', 26),
  ('아기 모니터', '수면', '선택', '', 27),
  ('백색소음기', '수면', '선택', '', 28),
  ('아기매트', '놀이·생활', '출산 후 구매', '', 29),
  ('바운서', '놀이·생활', '선택', '', 30),
  ('아기 체육관', '놀이·생활', '출산 후 구매', '', 31),
  ('공갈젖꼭지', '놀이·생활', '선택', '', 32),
  ('바디수트·배냇저고리', '의류', '출산 전 필수', '', 33),
  ('겨울 우주복', '의류', '출산 전 필수', '1월 출생이라 퇴원용으로 필요', 34),
  ('양말·모자', '의류', '출산 전 필수', '', 35),
  ('속싸개', '의류', '출산 전 필수', '', 36)
) as v(name, category, priority, note, sort_order)
where not exists (select 1 from public.items);
