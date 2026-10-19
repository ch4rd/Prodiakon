-- Notifikasi (Firebase Cloud Messaging). Jalankan SETELAH schema.sql. Aman dijalankan berulang.
-- Butuh Edge Function "notify" (supabase/functions/notify) yang sudah di-deploy.

/* ================= Token perangkat ================= */
create table if not exists public.push_tokens (
  token      text primary key,                    -- token FCM perangkat/browser
  user_id    uuid not null references auth.users(id) on delete cascade,
  paroki_id  uuid references public.paroki(id) on delete cascade,
  ua         text not null default '',
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
drop policy if exists push_tokens_select on public.push_tokens;
create policy push_tokens_select on public.push_tokens for select to authenticated using (user_id = auth.uid());

-- Simpan / lepas token milik sendiri. Satu perangkat bisa berganti akun → token pindah ke akun yang login.
create or replace function public.register_push_token(p_token text, p_ua text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(p_token, '') = '' then raise exception 'Tidak valid'; end if;
  insert into public.push_tokens (token, user_id, paroki_id, ua)
  values (p_token, auth.uid(), (select paroki_id from public.app_users where user_id = auth.uid()), left(coalesce(p_ua, ''), 300))
  on conflict (token) do update
    set user_id = excluded.user_id, paroki_id = excluded.paroki_id, ua = excluded.ua, last_seen = now();
end $$;

create or replace function public.unregister_push_token(p_token text) returns void
language sql security definer set search_path = public as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

revoke all on function public.register_push_token(text, text) from public, anon;
revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

/* ================= Pengaturan rahasia (tidak terlihat dari API) ================= */
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.settings (key text primary key, value text not null);
insert into private.settings (key, value) values
  ('notify_url', 'https://hincghlvmzkrtvdcutlo.supabase.co/functions/v1/notify'),
  ('notify_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

/* ================= Panggil Edge Function ================= */
-- Dipakai pemicu & jadwal. Tidak pernah menggagalkan transaksi (mis. pendaftaran tetap jalan bila notifikasi error).
create or replace function public.notify_call(p_type text, p_user uuid default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_url text; v_secret text;
begin
  select value into v_url from private.settings where key = 'notify_url';
  select value into v_secret from private.settings where key = 'notify_secret';
  if v_url is null or to_regproc('net.http_post') is null then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body := jsonb_build_object('type', p_type, 'user_id', p_user)
  );
exception when others then
  raise warning 'notify_call % gagal: %', p_type, sqlerrm;
end $$;
revoke all on function public.notify_call(text, uuid) from public, anon, authenticated;

-- Pendaftar baru → admin paroki. Akun disetujui → pengguna itu.
create or replace function public.notify_app_users() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_call('new_user', new.user_id);
  elsif new.status = 'approved' and old.status is distinct from 'approved' then
    perform public.notify_call('approved', new.user_id);
  end if;
  return new;
end $$;
drop trigger if exists app_users_notify on public.app_users;
create trigger app_users_notify after insert or update of status on public.app_users
  for each row execute function public.notify_app_users();

/* ================= Ekstensi & jadwal harian ================= */
-- pg_net: HTTP dari database; pg_cron: jadwal. Pengingat H-1 tiap hari 18.00 WIB (= 11.00 UTC).
do $$
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;
  perform cron.schedule('prodiakon-reminder', '0 11 * * *', 'select public.notify_call(''reminder'')');
exception when others then
  raise warning 'Ekstensi/jadwal belum aktif: % (aktifkan pg_net & pg_cron di Database → Extensions lalu jalankan ulang)', sqlerrm;
end $$;

notify pgrst, 'reload schema';

/* ================= Perintah manual =================
-- Lihat secret untuk diisi ke Edge Function (NOTIFY_SECRET):
--   select value from private.settings where key = 'notify_secret';
-- Uji kirim pengingat sekarang:
--   select public.notify_call('reminder');
-- Riwayat panggilan HTTP (cek status / error):
--   select id, status_code, content, created from net._http_response order by id desc limit 10;
*/
