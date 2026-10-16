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
