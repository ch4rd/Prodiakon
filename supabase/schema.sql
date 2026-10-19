-- Jalankan di Supabase: SQL Editor > New query > paste > Run.
-- Aman dijalankan berulang. Data versi lama (satu paroki) otomatis dipindah ke paroki pertama: St. Albertus.

/* ================= Master paroki ================= */
create table if not exists public.paroki (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,                -- dipakai di link: ...?p=slug
  nama       text not null,                       -- mis. 'St. Albertus' → judul 'Prodiakon St. Albertus'
  kota       text not null default '',
  misa_slots jsonb not null default '[]',         -- [{key, day (0=Minggu..6=Sabtu), time, label}]
  smk_extra  jsonb not null default '[]',         -- slot SMK di luar jam misa: [{key, label}]
  logo       text not null default '',             -- gambar logo kecil (data URL, diperkecil di app)
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.paroki (slug, nama, kota, misa_slots, smk_extra) values (
  'albertus', 'St. Albertus', 'Harapan Indah, Bekasi',
  '[{"key":"M1","day":6,"time":"17.30","label":"Sabtu 17.30"},
    {"key":"M2","day":0,"time":"06.00","label":"Minggu 06.00"},
    {"key":"M3","day":0,"time":"08.30","label":"Minggu 08.30"},
    {"key":"M4","day":0,"time":"17.30","label":"Minggu 17.30"}]',
  '[{"key":"PRIVAT","label":"Privat (petugas tetap)"},{"key":"JUMAT","label":"Jumat (Suster)"}]'
) on conflict (slug) do nothing;

-- tabel paroki versi lama: tambah kolom logo + batas ukuran (±200 KB)
alter table public.paroki add column if not exists logo text not null default '';
alter table public.paroki drop constraint if exists paroki_logo_size;
alter table public.paroki add constraint paroki_logo_size
  check (logo = '' or (logo like 'data:image/%' and length(logo) <= 200000));

/* ================= Data jadwal ================= */
create table if not exists public.months (
  paroki_id  uuid references public.paroki(id) on delete cascade,
  id         text not null,                       -- format 'YYYY-MM' (unik per paroki)
  weeks      text[] not null default '{}',
  notes      text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.misa (
  id          uuid primary key default gen_random_uuid(),
  paroki_id   uuid references public.paroki(id) on delete cascade,
  month_id    text not null,
  date        date not null,
  slot        text not null,                      -- kode slot misa paroki | LAIN
  title       text not null default '',
  time        text not null default '',
  place       text not null default '',
  color       text not null default '',
  need        int  not null default 0,
  officers    text[] not null default '{}',
  coordinator text not null default '',
  note        text not null default '',
  updated_at  timestamptz not null default now()
);

create table if not exists public.smk_groups (
  id         uuid primary key default gen_random_uuid(),
  paroki_id  uuid references public.paroki(id) on delete cascade,
  month_id   text not null,
  slot       text not null,
  no         text not null default '',
  sort       int  not null default 0,
  officers   text[] not null default '{}',        -- petugas per minggu
  members    jsonb  not null default '[]',        -- [{umat_id, nama}]
  updated_at timestamptz not null default now()
);

-- Master umat penerima SMK (lintas bulan, per paroki)
create table if not exists public.umat (
  id         uuid primary key default gen_random_uuid(),
  paroki_id  uuid references public.paroki(id) on delete cascade,
  nama       text not null,
  lingkungan text not null default '',
  alamat     text not null default '',
  telp       text not null default '',
  note       text not null default '',
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Master petugas (per paroki). Nama di jadwal hanya boleh dipilih dari sini.
create table if not exists public.petugas (
  id         uuid primary key default gen_random_uuid(),
  paroki_id  uuid references public.paroki(id) on delete cascade,
  nama       text not null,
  telp       text not null default '',
  note       text not null default '',
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);

/* ================= Pengguna & admin ================= */
create table if not exists public.app_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  paroki_id  uuid references public.paroki(id) on delete set null,
  email      text not null default '',
  nama       text not null default '',
  wa         text not null default '',
  petugas    text not null default '',            -- nama di Master petugas yang ditautkan admin (tab "Saya")
  status     text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- Admin per paroki
create table if not exists public.admins (
  user_id    uuid not null references auth.users(id) on delete cascade,
  paroki_id  uuid references public.paroki(id) on delete cascade,
  email      text not null default '',
  created_at timestamptz not null default now()
);

-- Super admin: kelola Master paroki & semua paroki
create table if not exists public.super_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null default '',
  created_at timestamptz not null default now()
);

/* ================= Migrasi dari versi satu paroki ================= */
do $$
declare
  pid uuid := (select id from public.paroki where slug = 'albertus');
  t text;
begin
  -- kolom yang mungkin belum ada di tabel lama
  foreach t in array array['months', 'misa', 'smk_groups', 'umat', 'petugas', 'app_users', 'admins'] loop
    execute format('alter table public.%I add column if not exists paroki_id uuid references public.paroki(id) on delete cascade', t);
    execute format('update public.%I set paroki_id = $1 where paroki_id is null', t) using pid;
  end loop;
  alter table public.app_users add column if not exists petugas text not null default '';
  alter table public.app_users add column if not exists wa text not null default '';

  foreach t in array array['months', 'misa', 'smk_groups', 'umat', 'petugas', 'admins'] loop
    execute format('alter table public.%I alter column paroki_id set not null', t);
  end loop;

  -- months: kunci (paroki_id, id) supaya 'YYYY-MM' boleh sama di paroki berbeda
  alter table public.misa       drop constraint if exists misa_month_id_fkey;
  alter table public.smk_groups drop constraint if exists smk_groups_month_id_fkey;
  alter table public.misa       drop constraint if exists misa_month_fk;
  alter table public.smk_groups drop constraint if exists smk_groups_month_fk;
  alter table public.months     drop constraint if exists months_pkey;
  alter table public.months     add constraint months_pkey primary key (paroki_id, id);
  alter table public.misa       add constraint misa_month_fk
    foreign key (paroki_id, month_id) references public.months(paroki_id, id) on delete cascade;
  alter table public.smk_groups add constraint smk_groups_month_fk
    foreign key (paroki_id, month_id) references public.months(paroki_id, id) on delete cascade;

  -- admins: satu user bisa admin di satu/lebih paroki
  alter table public.admins drop constraint if exists admins_pkey;
  alter table public.admins add constraint admins_pkey primary key (user_id, paroki_id);
end $$;

drop index if exists public.petugas_nama_uq;
create unique index if not exists petugas_paroki_nama_uq on public.petugas (paroki_id, lower(nama));
create index if not exists misa_month_idx       on public.misa (paroki_id, month_id);
create index if not exists smk_groups_month_idx on public.smk_groups (paroki_id, month_id);
create index if not exists umat_paroki_idx      on public.umat (paroki_id);
create index if not exists app_users_paroki_idx on public.app_users (paroki_id);

/* ================= updated_at otomatis ================= */
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['months', 'misa', 'smk_groups', 'umat', 'petugas'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

/* ================= Fungsi hak akses ================= */
create or replace function public.is_super() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.super_admins where user_id = auth.uid());
$$;

create or replace function public.is_admin_of(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super() or exists (select 1 from public.admins where user_id = auth.uid() and paroki_id = p);
$$;

create or replace function public.is_member_of(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin_of(p)
      or exists (select 1 from public.app_users where user_id = auth.uid() and paroki_id = p and status = 'approved');
$$;

revoke all on function public.is_super() from public, anon;
revoke all on function public.is_admin_of(uuid) from public, anon;
revoke all on function public.is_member_of(uuid) from public, anon;
grant execute on function public.is_super() to authenticated;
grant execute on function public.is_admin_of(uuid) to authenticated;
grant execute on function public.is_member_of(uuid) to authenticated;

-- Profil sendiri: pengguna hanya boleh mengubah nama & No. WA miliknya (bukan status/peran/paroki).
-- Bila akun tertaut ke Master petugas, No. WA ikut diperbarui di sana.
create or replace function public.update_my_profile(p_nama text, p_wa text) returns void
language plpgsql security definer set search_path = public as $$
declare u public.app_users;
begin
  if coalesce(trim(p_nama), '') = '' then raise exception 'Nama wajib diisi'; end if;
  update public.app_users set nama = left(trim(p_nama), 100), wa = left(coalesce(trim(p_wa), ''), 20)
  where user_id = auth.uid() returning * into u;
  if not found then raise exception 'Profil tidak ditemukan'; end if;
  if u.petugas <> '' and u.wa <> '' then
    update public.petugas set telp = u.wa where paroki_id = u.paroki_id and lower(nama) = lower(u.petugas);
  end if;
end $$;
revoke all on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;

/* ================= Akun baru → app_users ================= */
-- Paroki diambil dari slug yang dikirim app saat daftar (metadata 'paroki')
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.app_users (user_id, email, nama, wa, paroki_id)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'nama', ''),
          coalesce(new.raw_user_meta_data ->> 'wa', ''),
          (select id from public.paroki where slug = new.raw_user_meta_data ->> 'paroki' and active))
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Akun yang sudah ada sebelum fitur daftar dianggap disetujui (di paroki pertama)
insert into public.app_users (user_id, email, status, paroki_id)
select id, coalesce(email, ''), 'approved', (select id from public.paroki where slug = 'albertus') from auth.users
on conflict (user_id) do nothing;

/* ================= RLS ================= */
alter table public.paroki       enable row level security;
alter table public.months       enable row level security;
alter table public.misa         enable row level security;
alter table public.smk_groups   enable row level security;
alter table public.umat         enable row level security;
alter table public.petugas      enable row level security;
alter table public.app_users    enable row level security;
alter table public.admins       enable row level security;
alter table public.super_admins enable row level security;

-- Paroki: nama boleh dilihat siapa saja (halaman login/daftar). Super admin tambah/hapus, admin paroki ubah pengaturan.
drop policy if exists paroki_read   on public.paroki;
drop policy if exists paroki_read_anon on public.paroki;
drop policy if exists paroki_insert on public.paroki;
drop policy if exists paroki_update on public.paroki;
drop policy if exists paroki_delete on public.paroki;
create policy paroki_read_anon on public.paroki for select to anon using (active);
create policy paroki_read   on public.paroki for select to authenticated using (active or public.is_super());
create policy paroki_insert on public.paroki for insert to authenticated with check (public.is_super());
create policy paroki_update on public.paroki for update to authenticated using (public.is_admin_of(id)) with check (public.is_admin_of(id));
create policy paroki_delete on public.paroki for delete to authenticated using (public.is_super());

-- Data jadwal & master: anggota paroki (disetujui) boleh lihat, admin paroki boleh ubah
do $$
declare t text;
begin
  foreach t in array array['months', 'misa', 'smk_groups', 'umat', 'petugas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_auth', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member_of(paroki_id))', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin_of(paroki_id)) with check (public.is_admin_of(paroki_id))', t || '_write', t);
  end loop;
end $$;

-- Pengguna: lihat diri sendiri; admin paroki lihat & kelola pengguna parokinya
drop policy if exists app_users_select on public.app_users;
drop policy if exists app_users_update on public.app_users;
drop policy if exists app_users_delete on public.app_users;
create policy app_users_select on public.app_users for select to authenticated
  using (user_id = auth.uid() or public.is_admin_of(paroki_id));
create policy app_users_update on public.app_users for update to authenticated
  using (public.is_admin_of(paroki_id)) with check (public.is_admin_of(paroki_id));
create policy app_users_delete on public.app_users for delete to authenticated
  using (public.is_admin_of(paroki_id));

-- Admin: admin paroki boleh mengangkat/mencabut admin di parokinya sendiri
drop policy if exists admins_select on public.admins;
drop policy if exists admins_insert on public.admins;
drop policy if exists admins_delete on public.admins;
create policy admins_select on public.admins for select to authenticated
  using (user_id = auth.uid() or public.is_admin_of(paroki_id));
create policy admins_insert on public.admins for insert to authenticated with check (public.is_admin_of(paroki_id));
create policy admins_delete on public.admins for delete to authenticated using (public.is_admin_of(paroki_id));

-- super_admins: hanya bisa dibaca sendiri; diisi dari SQL Editor
drop policy if exists super_admins_select on public.super_admins;
create policy super_admins_select on public.super_admins for select to authenticated using (user_id = auth.uid());

/* ================= Sponsor per paroki ================= */
-- Kartu "Didukung oleh …" di app; dikelola admin paroki, dilihat anggota yang sudah disetujui.
create table if not exists public.sponsor (
  id         uuid primary key default gen_random_uuid(),
  paroki_id  uuid not null references public.paroki(id) on delete cascade,
  nama       text not null,
  teks       text not null default '',
  logo       text not null default '',              -- data URL kecil (diperkecil di app)
  link       text not null default '',              -- https://… (website / wa.me)
  mulai      date,                                  -- kosong = langsung tayang
  selesai    date,                                  -- kosong = tanpa batas
  active     boolean not null default true,
  urutan     int not null default 0,
  updated_at timestamptz not null default now(),
  constraint sponsor_logo_size check (logo = '' or (logo like 'data:image/%' and length(logo) <= 200000)),
  constraint sponsor_teks_len  check (length(teks) <= 200),
  constraint sponsor_link_ok   check (link = '' or link ~ '^https://'),
  constraint sponsor_periode   check (mulai is null or selesai is null or mulai <= selesai)
);
-- Gambar banner lebar (seperti header), opsional; data URL ≤ 300 KB
alter table public.sponsor add column if not exists banner text not null default '';
alter table public.sponsor drop constraint if exists sponsor_banner_size;
alter table public.sponsor add constraint sponsor_banner_size
  check (banner = '' or (banner like 'data:image/%' and length(banner) <= 300000));
create index if not exists sponsor_paroki_idx on public.sponsor (paroki_id);
drop trigger if exists sponsor_touch on public.sponsor;
create trigger sponsor_touch before update on public.sponsor for each row execute function public.touch_updated_at();
alter table public.sponsor enable row level security;
drop policy if exists sponsor_read  on public.sponsor;
drop policy if exists sponsor_write on public.sponsor;
create policy sponsor_read  on public.sponsor for select to authenticated using (public.is_member_of(paroki_id));
create policy sponsor_write on public.sponsor for all to authenticated
  using (public.is_admin_of(paroki_id)) with check (public.is_admin_of(paroki_id));

-- Fungsi versi lama (satu paroki) dihapus setelah semua policy lama diganti
drop function if exists public.is_approved();
drop function if exists public.is_admin();

-- Muat ulang struktur di API Supabase
notify pgrst, 'reload schema';

/* ================= Perintah manual (SQL Editor) =================
-- Menjadikan diri sendiri SUPER ADMIN (sekali saja, ganti emailnya):
--   insert into public.super_admins (user_id, email)
--   select id, email from auth.users where email = 'nama@contoh.com'
--   on conflict do nothing;
--
-- Admin paroki diangkat dari app: Menu ⋮ → Pengguna → "Jadikan admin".
-- Atau manual:
--   insert into public.admins (user_id, paroki_id, email)
--   select u.id, p.id, u.email from auth.users u, public.paroki p
--   where u.email = 'nama@contoh.com' and p.slug = 'albertus'
--   on conflict do nothing;
*/
