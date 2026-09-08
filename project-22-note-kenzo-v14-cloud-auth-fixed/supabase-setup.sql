-- NOTE KENZO V13 - Supabase setup
-- Jalankan seluruh file ini di Supabase > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  title text not null default 'Untitled.txt',
  content text not null default '',
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_user_client_unique unique (user_id, client_id)
);

alter table public.notes enable row level security;

drop policy if exists "Users can view own notes" on public.notes;
create policy "Users can view own notes"
on public.notes for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own notes" on public.notes;
create policy "Users can insert own notes"
on public.notes for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own notes" on public.notes;
create policy "Users can update own notes"
on public.notes for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own notes" on public.notes;
create policy "Users can delete own notes"
on public.notes for delete
using (auth.uid() = user_id);

create index if not exists notes_user_updated_idx
on public.notes (user_id, updated_at desc);
