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

-- Keamanan:
--  * Semua user yang login boleh MELIHAT data.
--  * Hanya user yang terdaftar di tabel admins yang boleh MENGUBAH (tambah/ubah/hapus).
-- User dibuat manual di Authentication > Users, dan matikan "Allow new users to sign up".
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null default '',
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
-- (sengaja tanpa policy: tabel admins hanya diubah dari SQL Editor / dashboard)

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.months     enable row level security;
alter table public.misa       enable row level security;
alter table public.smk_groups enable row level security;

do $$
declare t text;
begin
  foreach t in array array['months', 'misa', 'smk_groups'] loop
    execute format('drop policy if exists %I on public.%I', t || '_auth', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_write', t);
  end loop;
end $$;

-- Menjadikan user sebagai admin (ganti emailnya, jalankan di SQL Editor):
--   insert into public.admins (user_id, email)
--   select id, email from auth.users where email = 'nama@contoh.com'
--   on conflict do nothing;
-- Mencabut admin:
--   delete from public.admins where email = 'nama@contoh.com';
