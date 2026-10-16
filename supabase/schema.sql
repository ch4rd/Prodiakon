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

-- Master umat penerima SMK (berlaku lintas bulan).
-- smk_groups.members menyimpan [{umat_id, nama}]; nama = cadangan bila umat dihapus dari master.
create table if not exists public.umat (
  id         uuid primary key default gen_random_uuid(),
  nama       text not null,
  lingkungan text not null default '',
  alamat     text not null default '',
  telp       text not null default '',
  note       text not null default '',
  active     boolean not null default true,      -- false = tidak dilayani lagi (pindah, sembuh, meninggal)
  updated_at timestamptz not null default now()
);

-- Master petugas (prodiakon). Jadwal misa/SMK menyimpan nama; nama hanya boleh dipilih dari master ini.
create table if not exists public.petugas (
  id         uuid primary key default gen_random_uuid(),
  nama       text not null,
  telp       text not null default '',
  note       text not null default '',
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);
create unique index if not exists petugas_nama_uq on public.petugas (lower(nama));

-- updated_at otomatis
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists months_touch on public.months;
create trigger months_touch before update on public.months for each row execute function public.touch_updated_at();
drop trigger if exists misa_touch on public.misa;
create trigger misa_touch before update on public.misa for each row execute function public.touch_updated_at();
drop trigger if exists smk_groups_touch on public.smk_groups;
create trigger smk_groups_touch before update on public.smk_groups for each row execute function public.touch_updated_at();
drop trigger if exists petugas_touch on public.petugas;
create trigger petugas_touch before update on public.petugas for each row execute function public.touch_updated_at();
drop trigger if exists umat_touch on public.umat;
create trigger umat_touch before update on public.umat for each row execute function public.touch_updated_at();

-- Keamanan:
--  * Orang bisa DAFTAR sendiri dari app → status 'pending' di tabel app_users.
--  * Hanya user yang DISETUJUI admin (status 'approved') yang boleh MELIHAT data.
--  * Hanya user di tabel admins yang boleh MENGUBAH data dan menyetujui pendaftar.
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

-- Pengguna app + status persetujuan
create table if not exists public.app_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null default '',
  nama       text not null default '',
  status     text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
alter table public.app_users enable row level security;
-- Nama petugas di jadwal yang ditautkan admin ke akun ini (untuk tab "Saya")
alter table public.app_users add column if not exists petugas text not null default '';

-- Setiap akun baru (daftar dari app atau dibuat di dashboard) otomatis masuk app_users sebagai 'pending'
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.app_users (user_id, email, nama)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'nama', ''))
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Akun yang sudah ada sebelum fitur daftar dianggap sudah disetujui
insert into public.app_users (user_id, email, status)
select id, coalesce(email, ''), 'approved' from auth.users
on conflict (user_id) do nothing;

create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.app_users where user_id = auth.uid() and status = 'approved');
$$;
revoke all on function public.is_approved() from public, anon;
grant execute on function public.is_approved() to authenticated;

drop policy if exists app_users_select on public.app_users;
create policy app_users_select on public.app_users for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists app_users_update on public.app_users;
create policy app_users_update on public.app_users for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists app_users_delete on public.app_users;
create policy app_users_delete on public.app_users for delete to authenticated
  using (public.is_admin());

alter table public.months     enable row level security;
alter table public.misa       enable row level security;
alter table public.smk_groups enable row level security;
alter table public.umat       enable row level security;
alter table public.petugas    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['months', 'misa', 'smk_groups', 'umat', 'petugas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_auth', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_approved())', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_write', t);
  end loop;
end $$;

-- Menjadikan user sebagai admin (ganti emailnya, jalankan di SQL Editor):
--   insert into public.admins (user_id, email)
--   select id, email from auth.users where email = 'nama@contoh.com'
--   on conflict do nothing;
-- Mencabut admin:
--   delete from public.admins where email = 'nama@contoh.com';
