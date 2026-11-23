-- 英単語カード：学習記録をユーザーごとに保存するテーブル
-- Supabase の SQL Editor に貼り付けて実行してください。

create table if not exists public.user_progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 行単位のアクセス制御：自分の行だけ読み書きできる
alter table public.user_progress enable row level security;

create policy "read own progress" on public.user_progress
  for select using (auth.uid() = user_id);
create policy "insert own progress" on public.user_progress
  for insert with check (auth.uid() = user_id);
create policy "update own progress" on public.user_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
