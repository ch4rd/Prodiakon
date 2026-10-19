// Supabase Edge Function "notify": kirim push notification lewat Firebase Cloud Messaging (FCM HTTP v1).
// Dipanggil oleh database (pemicu & jadwal di supabase/notifications.sql), bukan oleh browser.
//
// Secrets (Edge Functions → Secrets):
//   NOTIFY_SECRET            = isi dari: select value from private.settings where key = 'notify_secret';
//   FIREBASE_SERVICE_ACCOUNT = isi file JSON service account Firebase (rahasia, jangan dibagikan)
//   APP_URL                  = (opsional) alamat app, default https://ch4rd.github.io/Prodiakon/
// SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY sudah tersedia otomatis.
// Saat deploy, matikan "Verify JWT" (pengaman memakai header x-notify-secret).

/* ================= Logika murni (bisa diuji tanpa Deno) ================= */
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parseD = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// Tanggal besok menurut WIB (UTC+7)
export function tomorrowWIB(now = new Date()): string {
  const d = new Date(now.getTime() + 7 * 3600_000);
  d.setUTCDate(d.getUTCDate() + 1);
  return iso(d);
}

// Hari Minggu tiap akhir pekan dalam bulan (sama dengan weekendsOf di app.js)
export function sundaysOf(ym: string): string[] {
  const [y, m] = ym.split('-').map(Number);
  const out: string[] = [];
  for (let d = new Date(Date.UTC(y, m - 1, 1)); d.getUTCMonth() === m - 1; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 0) out.push(iso(d));
  }
  return out;
}

type Slot = { key: string; day: number; time: string };
// Tanggal slot misa rutin pada akhir pekan dengan hari Minggu `sun` (Sabtu = sehari sebelumnya, dst.)
export function slotDate(slot: Slot, sun: string): string {
  const d = parseD(sun);
  d.setUTCDate(d.getUTCDate() + (slot.day ? slot.day - 7 : 0));
  return iso(d);
}

type Misa = { date: string; slot: string; title?: string; time?: string; place?: string; officers: string[]; coordinator?: string };
type Group = { month_id: string; slot: string; no: string; officers: string[]; members?: unknown[] };

// Tugas per nama petugas (huruf kecil) pada tanggal `day` untuk satu paroki
export function tasksOn(day: string, slots: Slot[], misa: Misa[], groups: Group[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (name: string, text: string) => {
    const k = norm(name);
    if (!k || k === '-') return;
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(text);
  };
  const slotOf = (k: string) => slots.find(s => s.key === k);
  for (const m of misa.filter(x => x.date === day)) {
    const s = slotOf(m.slot);
    const label = m.slot === 'LAIN' ? (m.title || 'Misa') : `Misa ${m.slot}${s ? ` ${DAYS[s.day]}` : ''}`;
    const when = m.time ? ` pk ${m.time}` : '';
    for (const n of m.officers) add(n, `${label}${when}${norm(n) === norm(m.coordinator) ? ' (koordinator)' : ''}`);
  }
  // SMK rutin: petugas minggu ke-i, bila tanggal slot pada minggu itu = day
  const sundays = sundaysOf(day.slice(0, 7));
  for (const g of groups.filter(x => x.month_id === day.slice(0, 7))) {
    const s = slotOf(g.slot);
    if (!s) continue; // slot tambahan (privat/Jumat) tidak punya tanggal pasti
    sundays.forEach((sun, i) => {
      if (slotDate(s, sun) !== day || !g.officers[i]) return;
      const n = (g.members || []).length;
      add(g.officers[i], `Antar SMK grup ${g.no} (${DAYS[s.day]} pk ${s.time}${n ? `, ${n} umat` : ''})`);
    });
  }
  return out;
}

/* ================= FCM ================= */
type ServiceAccount = { client_email: string; private_key: string; project_id: string };
const b64url = (b: ArrayBuffer | string) =>
  btoa(typeof b === 'string' ? b : String.fromCharCode(...new Uint8Array(b))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

async function googleToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claim}`));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${head}.${claim}.${b64url(sig)}`,
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('Gagal token Google: ' + JSON.stringify(j));
  return j.access_token;
}

// Kirim ke banyak token; kembalikan token yang sudah tidak berlaku (untuk dihapus)
async function sendAll(sa: ServiceAccount, tokens: string[], title: string, body: string, link: string) {
  if (!tokens.length) return { sent: 0, dead: [] as string[] };
  const access = await googleToken(sa);
  const dead: string[] = [];
  let sent = 0;
  await Promise.all(tokens.map(async token => {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          data: { title, body, link },
          webpush: { headers: { Urgency: 'high', TTL: '86400' }, fcm_options: { link } },
        },
      }),
    });
    if (res.ok) sent++;
    else if (res.status === 404 || res.status === 400) dead.push(token); // UNREGISTERED / token tidak valid
    else console.error('FCM', res.status, await res.text());
  }));
  return { sent, dead };
}
export const __test_sendAll = sendAll; // untuk uji otomatis

/* ================= Handler ================= */
// deno-lint-ignore no-explicit-any
declare const Deno: any;
if (typeof Deno !== 'undefined') {
  Deno.serve(async (req: Request) => {
    if (req.headers.get('x-notify-secret') !== Deno.env.get('NOTIFY_SECRET')) return new Response('forbidden', { status: 403 });
    const { createClient } = await import('npm:@supabase/supabase-js@2.45.4');
    const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const sa: ServiceAccount = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT') || '{}');
    const appUrl = (Deno.env.get('APP_URL') || 'https://ch4rd.github.io/Prodiakon/').replace(/\/?$/, '/');
    const { type, user_id } = await req.json();
    const tokensOf = async (ids: string[]) => {
      if (!ids.length) return [];
      const { data } = await db.from('push_tokens').select('token').in('user_id', ids);
      return (data || []).map((t: { token: string }) => t.token);
    };
    const report = { type, sent: 0, dead: 0 };
    const send = async (ids: string[], title: string, body: string, link: string) => {
      const r = await sendAll(sa, await tokensOf(ids), title, body, link);
      report.sent += r.sent; report.dead += r.dead.length;
      if (r.dead.length) await db.from('push_tokens').delete().in('token', r.dead);
    };

    if (type === 'new_user' || type === 'approved') {
      const { data: u } = await db.from('app_users').select('*').eq('user_id', user_id).maybeSingle();
      if (!u?.paroki_id) return Response.json(report);
      const { data: p } = await db.from('paroki').select('slug, nama').eq('id', u.paroki_id).single();
      const link = `${appUrl}?p=${p.slug}`;
      if (type === 'new_user') {
        const { data: adm } = await db.from('admins').select('user_id').eq('paroki_id', u.paroki_id);
        await send((adm || []).map((a: { user_id: string }) => a.user_id),
          'Pendaftar baru', `${u.nama || u.email} mendaftar di ${p.nama}. Buka Menu → Pengguna untuk menyetujui.`, link);
      } else {
        await send([user_id], 'Akun disetujui', `Akun Anda di Prodiakon ${p.nama} sudah disetujui. Jadwal tugas sudah bisa dilihat.`, link);
      }
    }

    if (type === 'test') {
      // Uji coba: select public.notify_call('test', '<user_id>');
      await send([user_id], 'Tes notifikasi Prodiakon', 'Notifikasi berhasil diterima di perangkat ini. 🙏', appUrl);
    }

    if (type === 'reminder') {
      const day = tomorrowWIB();
      const { data: parokis } = await db.from('paroki').select('*').eq('active', true);
      for (const p of parokis || []) {
        const [{ data: misa }, { data: groups }, { data: users }] = await Promise.all([
          db.from('misa').select('*').eq('paroki_id', p.id).eq('date', day),
          db.from('smk_groups').select('*').eq('paroki_id', p.id).eq('month_id', day.slice(0, 7)),
          db.from('app_users').select('user_id, petugas').eq('paroki_id', p.id).eq('status', 'approved').neq('petugas', ''),
        ]);
        const tasks = tasksOn(day, p.misa_slots || [], misa || [], groups || []);
        const d = parseD(day);
        for (const u of users || []) {
          const list = tasks.get(norm(u.petugas));
          if (!list?.length) continue;
          await send([u.user_id], `Besok ${DAYS[d.getUTCDay()]} Anda bertugas`, list.join(' · '), `${appUrl}?p=${p.slug}`);
        }
      }
    }
    return Response.json(report);
  });
}
