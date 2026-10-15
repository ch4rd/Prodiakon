-- Jalankan di Supabase: SQL Editor > New query > paste > Run.

create table if not exists public.months (
  id         text primary key,                 -- format 'YYYY-MM'
  weeks      text[] not null default '{}',     -- label minggu, mis. {'3-4 Okt','10-11 Okt'}
  notes      text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.misa (
  id          uuid primary key default gen_random_uuid(),
  month_id    text not null references public.months(id) on delete cascade,
  date        date not null,
  slot        text not null,                   -- M1 | M2 | M3 | M4 | LAIN
  title       text not null default '',
  time        text not null default '',
  place       text not null default '',
  color       text not null default '',        -- warna liturgi
  need        int  not null default 0,         -- jumlah petugas dibutuhkan (0 = bebas)
  officers    text[] not null default '{}',
  coordinator text not null default '',
  note        text not null default '',
  updated_at  timestamptz not null default now()
);
create index if not exists misa_month_idx on public.misa(month_id);

create table if not exists public.smk_groups (
  id         uuid primary key default gen_random_uuid(),
  month_id   text not null references public.months(id) on delete cascade,
  slot       text not null,                    -- M1..M4 | PRIVAT | JUMAT
  no         text not null default '',
  sort       int  not null default 0,
  officers   text[] not null default '{}',     -- petugas per minggu (urut sesuai months.weeks)
  members    jsonb  not null default '[]',     -- [{nama, lingkungan, alamat, telp}]
  updated_at timestamptz not null default now()
);
create index if not exists smk_groups_month_idx on public.smk_groups(month_id);

-- updated_at otomatis
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists months_touch on public.months;
create trigger months_touch before update on public.months for each row execute function public.touch_updated_at();
drop trigger if exists misa_touch on public.misa;
create trigger misa_touch before update on public.misa for each row execute function public.touch_updated_at();
drop trigger if exists smk_groups_touch on public.smk_groups;
create trigger smk_groups_touch before update on public.smk_groups for each row execute function public.touch_updated_at();

-- Keamanan: hanya user yang sudah login yang bisa baca/tulis.
-- User dibuat manual di Authentication > Users, dan matikan "Allow new users to sign up".
alter table public.months     enable row level security;
alter table public.misa       enable row level security;
alter table public.smk_groups enable row level security;

drop policy if exists months_auth on public.months;
create policy months_auth on public.months for all to authenticated using (true) with check (true);
drop policy if exists misa_auth on public.misa;
create policy misa_auth on public.misa for all to authenticated using (true) with check (true);
drop policy if exists smk_groups_auth on public.smk_groups;
create policy smk_groups_auth on public.smk_groups for all to authenticated using (true) with check (true);
