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

## Setup Supabase (gratis)
1. Daftar di https://supabase.com → **New project** (region: Singapore).
2. **SQL Editor** → New query → paste isi `supabase/schema.sql` → **Run**.
3. **Authentication → Sign In / Providers**: matikan *Allow new users to sign up*.
4. **Authentication → Users → Add user**: buat akun (email + password) untuk tiap pengelola.
5. **Project Settings → API**: salin *Project URL* dan *anon public key* ke `config.js`.
6. Buka app, login, lalu **Menu ⋮ → Muat data Oktober 2026** (atau Import backup JSON dari mode lokal).

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
