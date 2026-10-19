// Isi setelah membuat project Supabase (Project Settings > API).
// Selama kosong, app berjalan dalam mode LOKAL (data hanya tersimpan di browser perangkat ini).
window.APP_CONFIG = {
  SUPABASE_URL: 'https://hincghlvmzkrtvdcutlo.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_CNaFu7pS6wvUTmRRM1-oSA_XhzWTLNK', // "anon public" key (aman dipasang di frontend, data dilindungi RLS + login)
  // Notifikasi: konfigurasi Web app Firebase + VAPID key (Project settings → Cloud Messaging → Web Push certificates).
  // Aman dipasang di frontend. Selama null, menu notifikasi tidak ditampilkan.
  FIREBASE: null,
  // FIREBASE: { apiKey: '', authDomain: '', projectId: '', messagingSenderId: '', appId: '', vapidKey: '' },
};
