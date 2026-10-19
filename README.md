# Jadwal Prodiakon (PWA)

Web app untuk jadwal tugas prodiakon dan layanan antaran SMK. Dibuka dari HP, bisa di-"Add to Home Screen".
Tanpa build: cukup file statis (HTML/CSS/JS).

## Fitur
- **Misa**: jadwal M1–M4 + misa khusus, warna liturgi, koordinator (★), jumlah petugas dibutuhkan.
- **SMK**: grup antaran per jam misa, petugas per minggu, daftar umat (alamat, tombol telepon/WA).
- **Petugas**: semua tugas satu orang dalam sebulan, bisa dibagikan ke WA.
- **Cek**: deteksi otomatis, mis. petugas SMK yang tidak ada di jadwal misa minggu itu, misa kurang petugas, nama dobel.
- Bulan baru (salin daftar umat SMK + buat slot misa rutin), cetak (A4 landscape), export CSV, backup/import JSON.

## Mode penyimpanan
- `config.js` kosong → **mode Lokal**: data hanya di browser perangkat itu (untuk coba-coba).
- `config.js` diisi → **mode Online (Supabase)**: data di cloud, wajib login, bisa dipakai bersama.

## Multi-paroki
Satu app & satu database untuk banyak paroki; data tiap paroki terpisah (dijaga RLS di database).
- **Super admin**: tambah/ubah paroki (Menu ⋮ → Master paroki), bisa membuka semua paroki.
- **Admin paroki**: kelola jadwal, master umat/petugas, pengguna, dan jam misa parokinya sendiri;
  bisa mengangkat admin lain di parokinya (Menu ⋮ → Pengguna → Jadikan admin).
- **Petugas**: daftar sendiri lewat link paroki `…/?p=kode-paroki`, disetujui admin, lalu melihat jadwal (tab Saya).

## Setup Supabase (gratis)
1. Daftar di https://supabase.com → **New project** (region: Singapore).
2. **SQL Editor** → New query → paste isi `supabase/schema.sql` → **Run** (aman dijalankan ulang;
   data versi satu-paroki otomatis dipindah ke paroki pertama).
3. **Authentication → Sign In / Providers**: *Allow new users to sign up* ON, *Confirm email* OFF (disarankan).
4. **Project Settings → API**: salin *Project URL* dan *publishable/anon key* ke `config.js`.
5. Daftar akun Anda dari app, lalu jadikan super admin (SQL Editor, ganti emailnya):
   `insert into public.super_admins (user_id, email) select id, email from auth.users where email = 'nama@contoh.com' on conflict do nothing;`
6. Login → Menu ⋮ → **Master paroki** untuk menambah paroki dan membagikan linknya.

## Notifikasi (Firebase Cloud Messaging) – opsional
Pengingat tugas H-1 pukul 18.00 WIB, pendaftar baru (ke admin paroki), dan akun disetujui. Gratis.

1. **Firebase** (https://console.firebase.google.com) → buat project → *Add app* → **Web**.
   - Salin konfigurasi web (apiKey, authDomain, projectId, messagingSenderId, appId).
   - *Project settings → Cloud Messaging → Web Push certificates → Generate key pair* → salin **VAPID key**.
   - Isi keduanya di `config.js` bagian `FIREBASE` (aman untuk publik).
   - *Project settings → Service accounts → Generate new private key* → file JSON **rahasia** (jangan di-commit / dibagikan).
2. **Supabase → Database → Extensions**: aktifkan `pg_net` dan `pg_cron`.
3. **SQL Editor**: jalankan `supabase/notifications.sql`, lalu ambil secret-nya:
   `select value from private.settings where key = 'notify_secret';`
4. **Edge Functions → Deploy a new function → Via Editor**: nama `notify`, paste isi
   `supabase/functions/notify/index.ts`, deploy. Di pengaturan function, **matikan "Verify JWT"**
   (pengamannya header `x-notify-secret`).
5. **Edge Functions → Secrets**: tambahkan
   - `NOTIFY_SECRET` = hasil langkah 3
   - `FIREBASE_SERVICE_ACCOUNT` = seluruh isi file JSON service account
   - `APP_URL` = alamat app (opsional, default `https://ch4rd.github.io/Prodiakon/`)
6. Di app: **Menu ⋮ → Profil saya → Notifikasi → Aktifkan** (iPhone: pasang ke layar utama dulu).
   Uji kirim: `select public.notify_call('reminder');` · cek hasil:
   `select status_code, content from net._http_response order by id desc limit 5;`

## Deploy (gratis)
Pilih salah satu, upload seluruh folder ini:
- **Netlify Drop**: https://app.netlify.com/drop → seret folder.
- **Cloudflare Pages** / **Vercel** / **GitHub Pages**.

Wajib HTTPS (semua layanan di atas sudah HTTPS) agar bisa di-install di HP.
Setiap update file, naikkan `VERSION` di `sw.js` supaya HP mengambil versi baru.

## Install di HP
- Android (Chrome): buka URL → menu ⋮ → *Tambahkan ke layar utama / Install app*.
- iPhone (Safari): tombol Share → *Add to Home Screen*.

## Coba lokal di PC
```
npx serve D:\Project\prodiakon_pwa
```
