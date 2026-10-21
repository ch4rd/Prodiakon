'use strict';

/* ================= Konstanta ================= */
const CFG = window.APP_CONFIG || {};
const ONLINE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);

// Pengaturan paroki (jam misa, slot SMK) dibaca dari tabel paroki; ini default untuk mode lokal.
const DEFAULT_PAROKI = {
  id: 'local', slug: 'albertus', nama: 'St. Albertus', kota: 'Harapan Indah, Bekasi', active: true,
  misa_slots: [
    { key: 'M1', day: 6, time: '17.30', need: 14 }, { key: 'M2', day: 0, time: '06.00', need: 10 },
    { key: 'M3', day: 0, time: '08.30', need: 20 }, { key: 'M4', day: 0, time: '17.30', need: 26 },
  ],
  auto_month: false, // jadwal bulan baru dibuat manual oleh admin
  smk_extra: [{ key: 'PRIVAT', label: 'Privat (petugas tetap)' }, { key: 'JUMAT', label: 'Jumat (Suster)' }],
};
let P = DEFAULT_PAROKI;      // paroki aktif
let MISA_SLOTS = [];         // [{key, day, time, label}] + LAIN
let SMK_SLOTS = [];          // slot jam misa + slot tambahan
let REGULAR = [];            // kode slot misa rutin
function applyParoki(p) {
  P = p;
  const reg = (p.misa_slots || []).filter(x => x.key && x.key !== 'LAIN');
  REGULAR = reg.map(x => x.key);
  MISA_SLOTS = [...reg.map(x => ({ ...x, label: `${DAYS[x.day] ?? ''} ${x.time}`.trim() })), { key: 'LAIN', label: 'Misa lainnya', time: '' }];
  SMK_SLOTS = [...reg.map(x => ({ key: x.key, label: `${DAYS[x.day] ?? ''}, pk ${x.time}` })), ...(p.smk_extra || [])];
  document.title = `Prodiakon ${p.nama}`;
  $$('.paroki-logo').forEach(img => { img.src = p.logo || 'icons/icon.svg'; });
  $$('.paroki-name').forEach(el => { el.textContent = p.nama; });
}
// Tanggal misa rutin pada akhir pekan tsb: Minggu = hari Minggu, Sabtu = sehari sebelumnya, dst.
const slotDate = (slot, sunIso) => { const d = parseD(sunIso); d.setDate(d.getDate() + (slot.day ? slot.day - 7 : 0)); return iso(d); };
const urlSlug = () => new URLSearchParams(location.search).get('p')?.trim().toLowerCase() || '';
// warna liturgi: [label, warna penanda]
const COLORS = {
  '': ['—', '#facc15'],
  hijau: ['Hijau', '#22c55e'],
  putih: ['Putih', '#d1d5db'],
  merah: ['Merah', '#ef4444'],
  ungu: ['Ungu', '#a855f7'],
  'merah muda': ['Merah muda', '#f472b6'],
};
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/* ================= Util ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  }));
const pad = n => String(n).padStart(2, '0');
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtShort = s => { const d = parseD(s); return `${DAYS[d.getDay()].slice(0, 3)}, ${d.getDate()} ${MON3[d.getMonth()]}`; };
const fmtLong = s => { const d = parseD(s); return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const monthName = id => { const [y, m] = id.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const slotLabel = k => (MISA_SLOTS.find(s => s.key === k) || {}).label || k;
const smkSlotLabel = k => (SMK_SLOTS.find(s => s.key === k) || {}).label || k;
const smkUnits = name => { const m = /\((\d+)\s*SMK\)/i.exec(name || ''); return m ? Number(m[1]) : 1; };
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* abaikan */ } };

// Akhir pekan berdasarkan hari Minggu di bulan tsb: [{sat, sun, label}]
function weekendsOf(ym) {
  const [y, m] = ym.split('-').map(Number);
  const out = [];
  for (let d = new Date(y, m - 1, 1); d.getMonth() === m - 1; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0) continue;
    const sun = new Date(d), sat = new Date(d); sat.setDate(sat.getDate() - 1);
    const label = sat.getMonth() === sun.getMonth()
      ? `${sat.getDate()}-${sun.getDate()} ${MON3[sun.getMonth()]}`
      : `${sat.getDate()} ${MON3[sat.getMonth()]}-${sun.getDate()} ${MON3[sun.getMonth()]}`;
    out.push({ sat: iso(sat), sun: iso(sun), label });
  }
  return out;
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}
// Pesan error teknis dari server diterjemahkan ke bahasa pengguna (tanpa detail sistem)
function friendlyError(e) {
  const m = String(e?.message || e || '');
  if (/row-level security|permission denied|42501|not allowed/i.test(m)) return 'Anda tidak punya izin untuk perubahan ini.';
  if (/JWT|jwt expired|invalid claim|refresh token|session/i.test(m)) return 'Sesi login sudah habis, silakan keluar lalu masuk lagi.';
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return 'Tidak ada koneksi internet. Coba lagi sebentar lagi.';
  if (/duplicate key|23505|already exists/i.test(m)) return 'Data dengan nama yang sama sudah ada.';
  if (/violates foreign key|23503/i.test(m)) return 'Data ini masih dipakai di tempat lain, jadi belum bisa dihapus.';
  if (/schema cache|PGRST|relation .* does not exist|column .* does not exist/i.test(m)) return 'Server sedang diperbarui. Coba muat ulang app beberapa saat lagi.';
  return m;
}
async function run(fn) {
  try { return await fn(); } catch (e) { console.error(e); toast('Gagal: ' + friendlyError(e)); return false; }
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ================= Penyimpanan ================= */
// Antarmuka yang sama untuk lokal & Supabase: list / upsert / remove.
class LocalStore {
  constructor() { this.key = 'prodiakon.data.v1'; }
  read() {
    const empty = { months: [], misa: [], smk_groups: [], umat: [], petugas: [], sponsor: [], absences: [], wilayah: [], lingkungan: [], attendance: [] };
    try { return { ...empty, ...JSON.parse(lsGet(this.key) || '{}') }; } catch { return empty; }
  }
  write(d) { localStorage.setItem(this.key, JSON.stringify(d)); }
  async list(kind, monthId) {
    const rows = this.read()[kind] || [];
    return structuredClone(monthId ? rows.filter(r => r.month_id === monthId) : rows);
  }
  async insert(kind, rows) {
    const d = this.read();
    if (rows.some(r => d[kind].some(x => x.id === r.id))) throw new Error('duplicate');
    d[kind].push(...rows); this.write(d);
  }
  async upsert(kind, rows) {
    const d = this.read(); const arr = d[kind];
    for (const r of rows) {
      const i = arr.findIndex(x => x.id === r.id);
      if (i >= 0) arr[i] = r; else arr.push(r);
    }
    this.write(d);
  }
  async replaceOfficer(misaId, oldN, newN) {
    const d = this.read(), m = d.misa.find(x => x.id === misaId);
    if (!m) throw new Error('Misa tidak ditemukan');
    if (m.officers.some(o => norm(o) === norm(newN))) throw new Error(`Petugas ${newN} sudah ada di misa ini`);
    m.officers = m.officers.map(o => (norm(o) === norm(oldN) ? newN : o));
    if (norm(m.coordinator) === norm(oldN)) m.coordinator = newN;
    const put = r => { const i = d.attendance.findIndex(x => x.misa_id === misaId && norm(x.petugas) === norm(r.petugas)); if (i >= 0) d.attendance[i] = { ...d.attendance[i], ...r }; else d.attendance.push({ id: uid(), ...r }); };
    put({ misa_id: misaId, month_id: m.month_id, petugas: oldN, present: false, note: 'diganti ' + newN, substitute_for: '' });
    put({ misa_id: misaId, month_id: m.month_id, petugas: newN, present: true, substitute_for: oldN, note: '' });
    this.write(d);
  }
  async remove(kind, id) {
    const d = this.read();
    d[kind] = d[kind].filter(r => r.id !== id);
    if (kind === 'months') {
      d.misa = d.misa.filter(r => r.month_id !== id);
      d.smk_groups = d.smk_groups.filter(r => r.month_id !== id);
    }
    this.write(d);
  }
}

class SupaStore {
  constructor() { this.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY); }
  async list(kind, monthId) {
    let q = this.sb.from(kind).select('*').eq('paroki_id', P.id);
    if (monthId) q = q.eq('month_id', monthId);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
  async insert(kind, rows) {
    const { error } = await this.sb.from(kind).insert(rows.map(r => ({ ...r, paroki_id: P.id })));
    if (error) throw error;
  }
  async upsert(kind, rows) {
    if (!rows.length) return;
    const clean = rows.map(({ updated_at, ...r }) => ({ ...r, paroki_id: P.id }));
    const { error } = await this.sb.from(kind).upsert(clean);
    if (error) throw error;
  }
  async remove(kind, id) {
    const { error } = await this.sb.from(kind).delete().eq('id', id).eq('paroki_id', P.id);
    if (error) throw error;
  }
  async replaceOfficer(misaId, oldN, newN) {
    const { error } = await this.sb.rpc('replace_officer', { p_misa: misaId, p_old: oldN, p_new: newN });
    if (error) throw error;
  }
  async isAdmin(pid = P.id) {
    const { data, error } = await this.sb.rpc('is_admin_of', { p: pid });
    return !error && data === true;
  }
  async updateMyProfile(nama, wa) {
    const { error } = await this.sb.rpc('update_my_profile', { p_nama: nama, p_wa: wa });
    if (error) throw error;
  }
  async changePassword(password) {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw error;
  }
  async registerPushToken(token) {
    const { error } = await this.sb.rpc('register_push_token', { p_token: token, p_ua: navigator.userAgent });
    if (error) throw error;
  }
  async unregisterPushToken(token) {
    const { error } = await this.sb.rpc('unregister_push_token', { p_token: token });
    if (error) throw error;
  }
  async isSuper() {
    const { data, error } = await this.sb.rpc('is_super');
    return !error && data === true;
  }
  async listParoki() {
    const { data, error } = await this.sb.from('paroki').select('*').order('nama');
    if (error) throw error;
    return data;
  }
  async saveParoki(row) {
    const { data, error } = await this.sb.from('paroki').upsert(row).select().single();
    if (error) throw error;
    return data;
  }
  async listAdmins() {
    const { data, error } = await this.sb.from('admins').select('user_id').eq('paroki_id', P.id);
    if (error) throw error;
    return data.map(x => x.user_id);
  }
  async deleteUser(id) {
    const { error } = await this.sb.rpc('delete_user', { p_user: id });
    if (error) throw error;
  }
  async setAdmin(u, on) {
    const q = on
      ? this.sb.from('admins').insert({ user_id: u.user_id, paroki_id: P.id, email: u.email })
      : this.sb.from('admins').delete().eq('user_id', u.user_id).eq('paroki_id', P.id);
    const { error } = await q;
    if (error) throw error;
  }
  // Status persetujuan akun yang sedang login: pending | approved | rejected
  async me() {
    const { data: { user } } = await this.sb.auth.getUser();
    const { data } = await this.sb.from('app_users').select('*').eq('user_id', user.id).maybeSingle();
    return {
      id: user.id, email: user.email, status: data?.status || 'pending', nama: data?.nama || '',
      petugas: data?.petugas || '', paroki_id: data?.paroki_id || null, wa: data?.wa || '',
    };
  }
  async listUsers() {
    const { data, error } = await this.sb.from('app_users').select('*').eq('paroki_id', P.id).order('created_at');
    if (error) throw error;
    return data;
  }
  async setUserStatus(id, status) {
    const { error } = await this.sb.from('app_users').update({ status }).eq('user_id', id);
    if (error) throw error;
  }
  async setUserPetugas(id, petugas) {
    const { error } = await this.sb.from('app_users').update({ petugas }).eq('user_id', id);
    if (error) throw error;
  }
}

/* ================= State ================= */
let store;
const S = {
  months: [], monthId: null, misa: [], smk: [],
  tab: lsGet('prodiakon.tab') || 'misa',
  misaFilter: 'ALL', smkQ: '', personQ: '', person: null,
  admin: true, // false = hanya bisa melihat (bukan admin)
  umat: [], smkView: lsGet('prodiakon.smkView') || 'grup', umatQ: '',
  userId: null, pendingUsers: 0, me: null, pickName: false,
  petugas: [], petugasView: 'tugas', petugasQ: '',
  absences: [], absenceShowPast: false,
  wilayah: [], lingkungan: [], smkWil: '', petugasWil: '',
  attendance: [], koorMisa: null, koorDraft: null,
  super: false, parokiList: [], sponsor: [], sponsorAt: Math.floor(Math.random() * 1000),
};
// Master umat: UM = Map(id → umat). Anggota grup menyimpan {umat_id, nama}; mem(g) mengisi detail dari master.
let UM = new Map();
function setUmat(list) {
  S.umat = list.sort((a, b) => a.nama.localeCompare(b.nama));
  UM = new Map(S.umat.map(u => [u.id, u]));
}
const mem = g => g.members.map(m => {
  const u = m.umat_id && UM.get(m.umat_id);
  return u ? { ...u, umat_id: u.id } : m;
});
// Master petugas: nama di jadwal hanya boleh dipilih dari sini
function setPetugas(list) { S.petugas = list.sort((a, b) => a.nama.localeCompare(b.nama)); }
const masterNames = () => S.petugas.filter(p => p.active).map(p => p.nama);
const inMaster = n => S.petugas.find(p => norm(p.nama) === norm(n));
// <option> petugas aktif; nama lama yang tidak ada di master tetap tampil agar tidak hilang diam-diam
// Petugas berhalangan (sementara) pada tanggal tertentu → catatan berhalangan atau null
function absenceOn(name, date) {
  const p = date && inMaster(name);
  return p ? S.absences.find(a => a.petugas_id === p.id && a.start_date <= date && a.end_date >= date) || null : null;
}
const absenceLabel = a => `berhalangan s/d ${fmtShort(a.end_date)}${a.reason ? ` – ${a.reason}` : ''}`;
// Pengecualian rutin: slot misa yang tidak pernah bisa diikuti petugas (petugas.blocked_slots)
const slotBlocked = (name, slot) => !!(slot && inMaster(name)?.blocked_slots?.includes(slot));
const blockedLabel = slot => `tidak bisa ${slot}${slotByKey(slot)?.label ? ` · ${slotByKey(slot).label}` : ''}`;
// Alasan petugas tidak bisa bertugas pada tanggal & slot itu ('' = bisa)
function unavailable(name, date, slot) {
  if (slotBlocked(name, slot)) return blockedLabel(slot);
  const a = absenceOn(name, date);
  return a ? absenceLabel(a) : '';
}
// date/slot: bila diisi, petugas yang berhalangan / tidak bisa di slot itu ditandai dan tidak bisa dipilih
function petugasOpts(cur, placeholder, exclude = [], date = '', slot = '') {
  const ex = new Set(exclude.map(norm));
  const names = masterNames().filter(n => !ex.has(norm(n)) || norm(n) === norm(cur));
  const extra = cur && !names.some(n => norm(n) === norm(cur)) ? opt(cur, `${cur} (bukan dari master)`, cur) : '';
  const selName = names.find(x => norm(x) === norm(cur));
  // Petugas yang berhalangan / terkena pengecualian slot tidak ditampilkan, kecuali yang sudah terpilih
  return opt('', placeholder, cur ? null : '') + extra + names.map(n => {
    const why = unavailable(n, date, slot);
    if (!why) return opt(n, n, selName);
    return n === selName ? `<option value="${h(n)}" selected>🚫 ${h(n)} (${h(why)})</option>` : '';
  }).join('');
}
const hasSeedData = () => !!window.SEED && P.slug === 'albertus'; // data awal hanya milik St. Albertus
const umatLabel = u => (u.lingkungan ? `${u.nama} · ${u.lingkungan}` : u.nama);
const curMonth = () => S.months.find(m => m.id === S.monthId);
const weeks = () => (curMonth()?.weeks || []);
const misaOfSlot = slot => S.misa.filter(m => m.slot === slot).sort(cmpMisa);
// Misa rutin pada minggu ke-i: dicocokkan dengan TANGGAL akhir pekan itu (Senin s/d Minggu),
// bukan urutan, agar satu misa yang belum dibuat tidak menggeser minggu-minggu sesudahnya.
const linkedMisa = (slot, i) => {
  if (!REGULAR.includes(slot)) return null;
  const sun = weekendsOf(S.monthId || '2000-01')[i]?.sun;
  if (!sun) return null;
  const from = parseD(sun); from.setDate(from.getDate() - 6);
  return misaOfSlot(slot).find(m => m.date >= iso(from) && m.date <= sun) || null;
};
function cmpMisa(a, b) {
  return a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '') || a.slot.localeCompare(b.slot);
}

async function loadMonths() {
  S.sponsor = await store.list('sponsor').catch(() => []);
  S.absences = await store.list('absences').catch(() => []);
  S.wilayah = await store.list('wilayah').catch(() => []);
  S.lingkungan = await store.list('lingkungan').catch(() => []);
  S.months = (await store.list('months')).sort((a, b) => b.id.localeCompare(a.id));
  const saved = lsGet('prodiakon.month');
  const now = iso(new Date()).slice(0, 7);
  S.monthId = [saved, S.monthId, now].find(id => id && S.months.some(m => m.id === id)) || S.months[0]?.id || null;
  await loadMonth();
}
async function loadMonth() {
  if (S.monthId) {
    lsSet('prodiakon.month', S.monthId);
    const [m, g, u, pt, at] = await Promise.all([store.list('misa', S.monthId), store.list('smk_groups', S.monthId), store.list('umat'), store.list('petugas'),
      store.list('attendance', S.monthId).catch(() => [])]);
    S.misa = m; S.attendance = at;
    S.smk = g.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    setUmat(u); setPetugas(pt);
    if (S.admin) {
      const n = await syncPetugasFromSchedule();
      if (n) toast(`${n} nama petugas dari jadwal dimasukkan ke Master petugas`);
      const nl = await run(syncLingkungan);
      if (nl) toast(`${nl} lingkungan dari data umat dimasukkan ke Master lingkungan`);
    }
    if (S.admin && S.smk.some(x => x.members.some(y => !y.umat_id))) {
      const n = await linkLegacy(S.smk);
      if (n) toast(`${n} umat dipindah ke Master umat`);
    }
  } else {
    S.misa = []; S.smk = [];
    setUmat(await store.list('umat')); setPetugas(await store.list('petugas'));
  }
  render();
}

/* ================= Render ================= */
function render() {
  $('#monthSel').innerHTML = S.months.length
    ? S.months.map(m => `<option value="${h(m.id)}" ${m.id === S.monthId ? 'selected' : ''}>${h(monthName(m.id))}</option>`).join('')
    : '<option>Belum ada data</option>';
  if (S.tab === 'cek' && !S.admin) S.tab = 'saya';
  $('.tabs [data-tab="cek"]').hidden = !S.admin;
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  $('#fab').hidden = !S.admin || !S.monthId || !(['misa', 'smk'].includes(S.tab) || (S.tab === 'petugas' && S.petugasView === 'master'));
  $('#names').innerHTML = masterNames().map(n => `<option value="${h(n)}">`).join('');
  const n = S.admin ? activeIssues().length : 0;
  $('#cekCount').textContent = n ? String(n) : '';

  const main = $('#main');
  const masterView = (S.tab === 'smk' && ['wilayah', 'umat'].includes(S.smkView)) || (S.tab === 'petugas' && S.petugasView === 'master');
  if (!S.monthId && !masterView) { main.innerHTML = emptyState(); return; }
  if (S.tab === 'koor') renderKoor(main);
  else if (S.tab === 'saya') renderSaya(main);
  else if (S.tab === 'misa') renderMisa(main);
  else if (S.tab === 'smk') renderSmk(main);
  else if (S.tab === 'petugas') renderPetugas(main);
  else renderCek(main);
}

function emptyState() {
  if (!S.admin) return `<div class="empty-state"><p>Belum ada jadwal. Hubungi admin.</p></div>`;
  return `<div class="empty-state">
    <p>Belum ada data bulan apa pun.</p>
    <div class="btns" style="justify-content:center">
      ${hasSeedData() ? `<button class="btn primary" data-act="load-seed">Muat data Oktober 2026</button>` : ""}
      <button class="btn" data-act="new-month">Buat bulan baru</button>
    </div></div>`;
}

function allNames() {
  const map = new Map();
  for (const m of S.misa) for (const n of m.officers) if (n.trim()) map.set(norm(n), n.trim());
  for (const g of S.smk) for (const n of g.officers) if (n.trim() && n.trim() !== '-') map.set(norm(n), n.trim());
  return [...map.values()].sort((a, b) => a.localeCompare(b));
}

/* ---- Misa ---- */
function renderMisa(main) {
  const f = S.misaFilter;
  const pills = ['ALL', ...MISA_SLOTS.map(s => s.key)].map(k => {
    const lbl = k === 'ALL' ? 'Semua' : k === 'LAIN' ? 'Lainnya' : `${k} · ${slotLabel(k)}`;
    return `<button class="pill ${f === k ? 'on' : ''}" data-act="misa-filter" data-k="${k}">${lbl}</button>`;
  }).join('');
  const list = S.misa.filter(m => f === 'ALL' || m.slot === f).sort(cmpMisa);
  let html = `<div class="bar">${pills}</div>`;
  const kurang = S.admin ? shortMisa().reduce((a, m) => a + (m.need - m.officers.length), 0) : 0;
  if (kurang) html += `<div class="push-cta">🎲 ${kurang} tempat petugas misa belum terisi.
    <button class="btn small primary" data-act="auto-fill">Isi otomatis</button></div>`;
  if (!list.length) html += '<div class="empty-state">Belum ada jadwal misa. Tekan ＋ untuk menambah.</div>';
  let last = '';
  for (const m of list) {
    if (m.date !== last) { html += `<h3 class="day">${h(fmtLong(m.date))}</h3>`; last = m.date; }
    html += misaCard(m);
  }
  main.innerHTML = html + sponsorCard();
}

function misaCard(m, highlight) {
  const col = COLORS[m.color] || COLORS[''];
  const koor = norm(m.coordinator);
  const offs = [...m.officers].sort((a, b) => (norm(b) === koor) - (norm(a) === koor));
  const empty = Math.max(0, (m.need || 0) - m.officers.length);
  const chips = offs.map(n => {
    const cls = ['chip', norm(n) === koor ? 'koor' : '', highlight && norm(n) === highlight ? 'me' : ''].join(' ');
    return `<span class="${cls}">${norm(n) === koor ? '★ ' : ''}${h(n)}</span>`;
  }).join('') + '<span class="chip empty">kosong</span>'.repeat(empty);
  const sub = [m.time && `pk ${m.time}`, m.place].filter(Boolean).join(' · ');
  return `<article class="card${S.admin ? ' tap' : ''}" ${S.admin ? `data-act="edit-misa" data-id="${h(m.id)}"` : ''}>
    <div class="c-head" style="border-left:6px solid ${col[1]}">
      <span class="badge">${m.slot === 'LAIN' ? 'Khusus' : h(m.slot)}</span>
      <span class="t">${h(m.title || slotLabel(m.slot))}</span>
      <span class="sub">${h(sub)}</span>
      ${m.color ? `<span class="lit">${h(col[0])}</span>` : ''}
    </div>
    <div class="c-body">
      ${chips ? `<div class="chips">${chips}</div>` : '<span class="count">Belum ada petugas</span>'}
      ${m.note ? `<div class="note">📝 ${h(m.note)}</div>` : ''}
      <div class="count" style="margin-top:6px">${m.officers.length} petugas${m.need ? ` / butuh ${m.need}` : ''}${attSummary(m)}</div>
      <div class="btns" style="margin-top:6px">
        <button class="btn small" data-act="share-misa" data-id="${h(m.id)}">📤 Bagikan</button>
        ${canCoordinate(m) && m.date <= todayIso() ? `<button class="btn small" data-act="koor" data-id="${h(m.id)}">📋 Absen petugas</button>` : ''}
      </div>
    </div>
  </article>`;
}

/* ---- SMK ---- */
function renderSmk(main) {
  const v = ['umat', 'wilayah'].includes(S.smkView) ? S.smkView : 'grup';
  const bar = `<div class="bar">
    <button class="pill ${v === 'grup' ? 'on' : ''}" data-act="smk-view" data-k="grup">Grup hantaran</button>
    <button class="pill ${v === 'umat' ? 'on' : ''}" data-act="smk-view" data-k="umat">Master umat (${S.umat.filter(u => u.active).length})</button>
    <button class="pill ${v === 'wilayah' ? 'on' : ''}" data-act="smk-view" data-k="wilayah">Wilayah & lingkungan (${S.wilayah.length})</button>
  </div>`;
  if (v === 'umat') return renderUmat(main, bar);
  if (v === 'wilayah') return renderWilayah(main, bar);
  const wilOpts = sortedWilayah().map(w => opt(w.id, w.nama, S.smkWil)).join('');
  const kosong = S.admin ? emptyHantaran().length : 0;
  main.innerHTML = bar + `${kosong ? `<div class="push-cta">🎲 ${kosong} minggu hantaran belum ada petugasnya.
      <button class="btn small primary" data-act="auto-hantaran">Isi otomatis</button></div>` : ''}
    ${S.wilayah.length ? `<select class="search" id="smkWil">${opt('', 'Semua wilayah', S.smkWil)}${wilOpts}</select>` : ''}
    <input class="search" id="smkQ" type="search" placeholder="Cari umat, petugas, lingkungan, alamat…" value="${h(S.smkQ)}">
    <div id="smkList"></div>
    ${curMonth()?.notes ? `<div class="notes-box"><b>Catatan</b>\n${h(curMonth().notes)}</div>` : ''}`;
  $('#smkQ').addEventListener('input', e => { S.smkQ = e.target.value; renderSmkList(); });
  $('#smkWil')?.addEventListener('change', e => { S.smkWil = e.target.value; renderSmkList(); });
  renderSmkList();
}

function renderSmkList() {
  const q = norm(S.smkQ);
  const match = g => (!S.smkWil || groupWilayah(g).some(w => w.id === S.smkWil))
    && (!q || norm([g.no, ...g.officers, ...mem(g).flatMap(m => [m.nama, m.lingkungan, wilayahOfLing(m.lingkungan)?.nama, m.alamat, m.telp])].join(' ')).includes(q));
  let html = '';
  for (const s of SMK_SLOTS) {
    const groups = S.smk.filter(g => g.slot === s.key && match(g));
    if (!groups.length) continue;
    const umat = groups.reduce((a, g) => a + mem(g).length, 0);
    const units = groups.reduce((a, g) => a + mem(g).reduce((x, m) => x + smkUnits(m.nama), 0), 0);
    html += `<div class="sec-title">${h(s.label)} <span class="count">${groups.length} grup · ${umat} umat · ${units} SMK</span></div>`;
    html += groups.map(smkCard).join('');
  }
  $('#smkList').innerHTML = html || '<div class="empty-state">Tidak ada data.</div>';
}

function smkCard(g) {
  const wk = weeks().map((w, i) => {
    const name = g.officers[i] || '';
    const lm = linkedMisa(g.slot, i);
    const bad = name && lm && !lm.officers.some(n => norm(n) === norm(name));
    return `<div class="wk ${bad || !name ? 'bad' : ''}" title="${bad ? 'Tidak ada di jadwal misa minggu ini' : ''}">
      <small>${h(w)}</small><b>${h(name || '—')}</b></div>`;
  }).join('');
  const memHtml = mem(g).map(m => `<div class="member">
      <div><span class="nm">${h(m.nama)}</span>${m.lingkungan ? `<span class="ln">${h(m.lingkungan)}</span>` : ''}</div>
      ${m.alamat ? `<div class="ad">📍 ${h(m.alamat)}</div>` : ''}
      ${m.telp ? `<div class="phones">${phoneLinks(m.telp)}</div>` : ''}
    </div>`).join('');
  return `<article class="card">
    <div class="c-head">
      <span class="badge">${h(g.no)}</span>
      <span class="sub">${mem(g).length} umat</span>
      ${groupWilayah(g).map(w => `<span class="tag wil">${h(w.nama)}</span>`).join('')}
      ${S.admin ? `<button class="btn small" style="margin-left:auto" data-act="edit-smk" data-id="${h(g.id)}">Ubah</button>` : ''}
    </div>
    <div class="c-body"><div class="weeks">${wk}</div>${memHtml || '<span class="count">Belum ada umat</span>'}</div>
  </article>`;
}

function phoneLinks(t) {
  return t.split('/').map(s => s.trim()).filter(Boolean).map(p => {
    const d = p.replace(/\D/g, '');
    const wa = /^08\d{7,}$/.test(d) ? `<a class="wa" href="https://wa.me/62${d.slice(1)}" target="_blank" rel="noopener">WA</a>` : '';
    return `<a href="tel:${d}">📞 ${h(p)}</a>${wa}`;
  }).join('');
}

/* ---- Petugas ---- */
function buildAssignments() {
  const map = new Map();
  const add = (name, item) => {
    const k = norm(name);
    if (!k || k === '-') return;
    if (!map.has(k)) map.set(k, { key: k, name: name.trim(), items: [] });
    map.get(k).items.push(item);
  };
  for (const m of S.misa) {
    for (const n of m.officers) {
      add(n, {
        type: 'misa', date: m.date, time: m.time || '',
        text: `${m.slot === 'LAIN' ? '' : m.slot + ' '}${m.title || slotLabel(m.slot)}${m.place ? ' – ' + m.place : ''}`,
        koor: norm(n) === norm(m.coordinator),
      });
    }
  }
  const we = weekendsOf(S.monthId || '2000-01');
  for (const g of S.smk) {
    g.officers.forEach((n, i) => {
      const lm = linkedMisa(g.slot, i);
      add(n, {
        type: 'smk', date: lm?.date || we[i]?.sat || '', time: lm?.time || '', week: weeks()[i] || '',
        text: `Hantaran grup ${g.no} (${smkSlotLabel(g.slot)})`,
        members: mem(g), // detail umat (alamat, telp) dari Master umat
      });
    });
  }
  const list = [...map.values()];
  for (const p of list) p.items.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || (a.type === 'smk') - (b.type === 'smk'));
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

function renderPetugas(main) {
  const all = buildAssignments();
  if (S.person) {
    const p = all.find(x => x.key === S.person);
    if (p) { main.innerHTML = personDetail(p); return; }
    S.person = null;
  }
  const v = S.petugasView === 'master' ? 'master' : 'tugas';
  const bar = `<div class="bar">
    <button class="pill ${v === 'tugas' ? 'on' : ''}" data-act="petugas-view" data-k="tugas">Tugas per petugas</button>
    <button class="pill ${v === 'master' ? 'on' : ''}" data-act="petugas-view" data-k="master">Master petugas (${masterNames().length})</button>
  </div>`;
  if (v === 'master') return renderMasterPetugas(main, bar, all);
  main.innerHTML = bar + `<input class="search" id="pQ" type="search" placeholder="Cari nama petugas…" value="${h(S.personQ)}">
    <div class="count" id="pCount" style="margin:0 2px 8px"></div><div id="pList"></div>`;
  const draw = () => {
    const q = norm(S.personQ);
    const list = all.filter(p => !q || p.key.includes(q));
    $('#pCount').textContent = `${list.length} petugas`;
    $('#pList').innerHTML = list.length ? `<div class="list">${list.map(p => {
      const mi = p.items.filter(i => i.type === 'misa').length, sm = p.items.filter(i => i.type === 'smk').length;
      return `<div class="row" data-act="person" data-k="${h(p.key)}"><span class="nm">${h(p.name)}</span>
        ${mi ? `<span class="num">${mi} misa</span>` : ''}${sm ? `<span class="num s">${sm} hantaran</span>` : ''}</div>`;
    }).join('')}</div>` : '<div class="empty-state">Tidak ditemukan.</div>';
  };
  $('#pQ').addEventListener('input', e => { S.personQ = e.target.value; draw(); });
  draw();
}

/* ---- Master petugas ---- */
function renderMasterPetugas(main, bar, all) {
  const noWil = S.petugas.filter(p => p.active && !petugasWilayah(p)).length;
  main.innerHTML = bar + `${S.wilayah.length ? `<select class="search" id="mpWil">${opt('', 'Semua wilayah', S.petugasWil)}${opt('none', `Wilayah belum diatur (${noWil})`, S.petugasWil)}${sortedWilayah().map(w => opt(w.id, w.nama, S.petugasWil)).join('')}</select>` : ''}
    <input class="search" id="mpQ" type="search" placeholder="Cari nama petugas…" value="${h(S.petugasQ)}">
    ${S.admin && S.wilayah.length && noWil ? `<div class="push-cta">🗺️ ${noWil} petugas aktif belum punya wilayah.
      <button class="btn small primary" data-act="petugas-wil-auto">Isi otomatis dari hantaran</button></div>` : ''}
    <div id="mpList"></div>`;
  const draw = () => {
    const q = norm(S.petugasQ);
    const row = p => {
      const a = all.find(x => x.key === norm(p.nama));
      const mi = a ? a.items.filter(i => i.type === 'misa').length : 0, sm = a ? a.items.filter(i => i.type === 'smk').length : 0;
      return `<div class="umat${S.admin ? ' tap' : ''}" ${S.admin ? `data-act="edit-petugas" data-id="${h(p.id)}"` : ''}>
        <div><span class="nm">${h(p.nama)}</span>${(p.blocked_slots || []).filter(k => REGULAR.includes(k)).map(k => ` <span class="tag warn" title="${h(blockedLabel(k))}">Tidak bisa ${h(k)}</span>`).join('')}${petugasWilayah(p) ? ` <span class="tag wil">${h(petugasWilayah(p).nama)}</span>` : (S.wilayah.length && p.active ? ' <span class="tag warn">wilayah?</span>' : '')}${(() => { const a = nextAbsence(p.id); if (!a) return ''; const per = a.start_date <= todayIso() ? `s/d ${fmtShort(a.end_date)}` : `${fmtShort(a.start_date)} – ${fmtShort(a.end_date)}`; return ` <span class="tag warn" title="${h(a.reason)}">🚫 Berhalangan ${h(per)}</span>`; })()}</div>
        ${p.telp ? `<div class="phones">${phoneLinks(p.telp)}</div>` : ''}
        ${p.note ? `<div class="ad">📝 ${h(p.note)}</div>` : ''}
        <div class="tags">${mi || sm ? `${mi ? `<span class="tag">${mi} misa</span>` : ''}${sm ? `<span class="tag">${sm} hantaran</span>` : ''}`
          : `<span class="tag ${p.active ? 'warn' : ''}">Tidak ada tugas bulan ini</span>`}</div>
      </div>`;
    };
    const sec = (title, list) => (list.length ? `<div class="sec-title">${title} <span class="count">${list.length} orang</span></div>
      <div class="list">${list.map(row).join('')}</div>` : '');
    const match = p => (!S.petugasWil || (S.petugasWil === 'none' ? !petugasWilayah(p) : p.wilayah_id === S.petugasWil))
      && (!q || norm([p.nama, p.telp, p.note, petugasWilayah(p)?.nama].join(' ')).includes(q));
    const html = sec('Aktif', S.petugas.filter(p => p.active && match(p))) + sec('Tidak aktif', S.petugas.filter(p => !p.active && match(p)));
    $('#mpList').innerHTML = html || `<div class="empty-state">${S.petugas.length ? 'Tidak ditemukan.' : `Belum ada petugas.${S.admin ? ' Tekan ＋ untuk menambah.' : ''}`}</div>`;
  };
  $('#mpQ').addEventListener('input', e => { S.petugasQ = e.target.value; draw(); });
  $('#mpWil')?.addEventListener('change', e => { S.petugasWil = e.target.value; draw(); });
  draw();
}

function openPetugasForm(p) {
  const isNew = !p;
  p = p ? { ...p } : { id: uid(), nama: '', telp: '', note: '', active: true, wilayah_id: null };
  const body = `
    <label class="fld">Nama (sesuai yang dipakai di jadwal)<input name="nama" required value="${h(p.nama)}"></label>
    <label class="fld">Telp / HP<input name="telp" value="${h(p.telp)}" inputmode="tel"></label>
    ${REGULAR.length ? `<div class="fld">Tidak bisa bertugas rutin di (misa & hantaran)</div>
      <div class="chips">${MISA_SLOTS.filter(x => x.key !== 'LAIN').map(x => `<label class="chip check"><input type="checkbox" name="blk_${h(x.key)}" ${(p.blocked_slots || []).includes(x.key) ? 'checked' : ''}> ${h(x.key)} · ${h(x.label)}</label>`).join('')}</div>` : ''}
    <label class="fld">Wilayah (petugas hantaran hanya melayani umat di wilayah ini)<select name="wilayah_id">${opt('', '— belum diatur —', p.wilayah_id || '')}${sortedWilayah().map(w => opt(w.id, w.nama, p.wilayah_id)).join('')}</select></label>
    <label class="fld">Catatan<input name="note" value="${h(p.note)}"></label>
    <label><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Aktif (bisa dipilih di jadwal)</label>
    ${isNew ? '' : '<p class="hint">Mengganti nama akan ikut mengganti nama ini di semua jadwal misa & hantaran.</p>'}
    ${isNew ? '' : `<div class="fld">Berhalangan</div>
      <div class="list">${S.absences.filter(a => a.petugas_id === p.id && a.end_date >= todayIso()).sort((a, b) => a.start_date.localeCompare(b.start_date))
        .map(a => `<div class="urow tap" data-sh="ab-edit" data-id="${h(a.id)}"><div class="mi"><span class="nm">${h(fmtShort(a.start_date))} – ${h(fmtShort(a.end_date))}</span>
          <div class="ad">${h(a.reason || 'tanpa keterangan')}</div></div><span class="go">›</span></div>`).join('') || '<div class="empty-state small">Tidak ada jadwal berhalangan.</div>'}</div>
      <button type="button" class="btn small" data-sh="ab-new">🚫 Atur berhalangan</button>`}`;
  openSheet(isNew ? 'Petugas baru' : 'Ubah petugas', body, {
    onClick: b => {
      if (b.dataset.sh === 'ab-new') { dlg.close(); openAbsenceForm({ petugas_id: p.id }); }
      else if (b.dataset.sh === 'ab-edit') { dlg.close(); openAbsenceForm(S.absences.find(a => a.id === b.dataset.id)); }
    },
    save: async fd => {
      const row = { ...p, nama: fd.get('nama').trim().replace(/\s+/g, ' '), telp: fd.get('telp').trim(), note: fd.get('note').trim(), active: !!fd.get('active'), wilayah_id: fd.get('wilayah_id') || null,
        blocked_slots: [...REGULAR.filter(k => fd.get('blk_' + k)), ...(p.blocked_slots || []).filter(k => !REGULAR.includes(k))] };
      if (!row.nama) { toast('Nama wajib diisi'); return false; }
      if (S.petugas.some(x => x.id !== row.id && norm(x.nama) === norm(row.nama))) { toast(`"${row.nama}" sudah ada di master`); return false; }
      await store.upsert('petugas', [row]);
      if (!isNew && row.nama !== p.nama) await renameInSchedules(p.nama, row.nama);
      setPetugas([...S.petugas.filter(x => x.id !== row.id), row]);
      render(); toast('Tersimpan');
    },
    del: isNew ? null : async () => {
      if (buildAssignments().some(a => a.key === norm(p.nama))) {
        toast(`${p.nama} masih ada di jadwal bulan ini. Hapus dari jadwal dulu, atau tandai tidak aktif.`);
        return false;
      }
      await store.remove('petugas', p.id);
      setPetugas(S.petugas.filter(x => x.id !== p.id)); render(); toast('Dihapus');
    },
  });
}

// Ganti nama petugas di semua bulan (misa: officers + koordinator, SMK: petugas per minggu)
async function renameInSchedules(oldName, newName) {
  const k = norm(oldName), sw = n => (norm(n) === k ? newName : n);
  const [misa, groups] = await Promise.all([store.list('misa'), store.list('smk_groups')]);
  const mc = misa.filter(m => m.officers.some(n => norm(n) === k) || norm(m.coordinator) === k)
    .map(m => ({ ...m, officers: m.officers.map(sw), coordinator: sw(m.coordinator) }));
  const gc = groups.filter(g => g.officers.some(n => norm(n) === k)).map(g => ({ ...g, officers: g.officers.map(sw) }));
  await store.upsert('misa', mc);
  await store.upsert('smk_groups', gc);
  S.misa = S.misa.map(m => mc.find(x => x.id === m.id) || m);
  S.smk = S.smk.map(g => gc.find(x => x.id === g.id) || g);
}

// Nama yang sudah ada di jadwal tapi belum di master → dimasukkan (sekali, saat admin membuka bulan)
async function syncPetugasFromSchedule() {
  const add = allNames().filter(n => !inMaster(n)).map(nama => ({ id: uid(), nama, telp: '', note: '', active: true }));
  if (!add.length) return 0;
  await store.upsert('petugas', add);
  setPetugas([...S.petugas, ...add]);
  return add.length;
}

function asgItem(i, cls = '', tag = '') {
  return `<div class="asg ${cls}">
      <div class="d">${tag}${i.date ? h(fmtShort(i.date)) : ''}${i.time ? ' · pk ' + h(i.time) : ''}${i.week && i.type === 'smk' ? ' · minggu ' + h(i.week) : ''}</div>
      <div>${i.type === 'smk' ? '🕊️' : '⛪'} ${h(i.text)}${i.koor ? ' <b>(Koordinator)</b>' : ''}</div>
      ${i.members ? (i.members.length ? `<div class="visit">${i.members.map(visitBlock).join('')}</div>` : '<div class="count">Belum ada umat di grup ini</div>') : ''}
    </div>`;
}

function personDetail(p) {
  const items = p.items.map(i => asgItem(i)).join('');
  return `<button class="back" data-act="back">‹ Semua petugas</button>
    <h2 style="margin:0 0 10px">${h(p.name)}</h2>
    <div class="list">${items}</div>
    <div class="btns" style="margin-top:12px">
      <button class="btn primary" data-act="share" data-k="${h(p.key)}">Bagikan / salin teks</button>
    </div>`;
}

/* ---- Saya: jadwal petugas yang login ---- */
// Urutan: nama yang ditautkan admin → pilihan di perangkat ini → nama saat mendaftar
function myName(ignorePick = false) {
  if (S.pickName && !ignorePick) return '';
  const all = [...masterNames(), ...allNames()];
  const pick = n => (n ? all.find(x => norm(x) === norm(n)) : null);
  return pick(S.me?.petugas) || pick(lsGet('prodiakon.myName')) || pick(S.me?.nama) || '';
}
const nameLocked = () => !!(S.me?.petugas && [...masterNames(), ...allNames()].some(x => norm(x) === norm(S.me.petugas)));

function renderSaya(main) {
  const name = myName();
  if (!name) {
    main.innerHTML = `<div class="pick-card">
      <h3>Siapa nama Anda di jadwal?</h3>
      <select id="myNameInp" class="search">${petugasOpts('', '— pilih nama Anda —')}</select>
      <button class="btn primary" data-act="set-myname">Tampilkan jadwal saya</button>
      ${S.pickName && myName(true) ?'<button class="link-btn" data-act="cancel-myname">Batal</button>' : ''}
      <p class="hint">Disimpan di perangkat ini. Admin juga bisa menautkan nama Anda ke akun (menu Pengguna).</p>
    </div>`;
    return;
  }
  const p = buildAssignments().find(x => x.key === norm(name));
  const items = p?.items || [];
  const today = iso(new Date());
  const block = (list, emptyMsg) => {
    if (!list.length) return `<div class="empty-state small">${emptyMsg}</div>`;
    const next = list.find(i => i.date && i.date >= today);
    return `<div class="list">${list.map(i => {
      const past = i.date && i.date < today;
      return asgItem(i, past ? 'past' : i === next ? 'next' : '', i === next ? '<span class="tag">Berikutnya</span> ' : '');
    }).join('')}</div>`;
  };
  const smk = items.filter(i => i.type === 'smk'), misa = items.filter(i => i.type === 'misa');
  const ps = pushState();
  const pushCta = ps === 'off' || ps === 'ios-install'
    ? `<div class="push-cta">🔔 ${ps === 'off' ? 'Dapatkan pengingat H-1 sebelum bertugas.' : h(PUSH_TEXT['ios-install'])}
        ${ps === 'off' ? '<button class="btn small primary" data-act="push-on">Aktifkan</button>' : ''}</div>` : '';
  // Koordinator (akun ditautkan ke nama koordinator): misa hari ini → tombol besar; berikutnya → info
  const myKoor = S.misa.filter(m => S.me?.petugas && norm(m.coordinator) === norm(S.me.petugas) && m.date >= todayIso()).sort(cmpMisa);
  const koorCta = myKoor.filter(m => m.date === todayIso()).map(m => `<div class="koor-cta">
      <div><div class="hint">Hari ini Anda koordinator</div><b>${h(misaTitle(m))}</b>${attSummary(m)}</div>
      <button class="btn primary" data-act="koor" data-id="${h(m.id)}">📋 Mulai absen</button></div>`).join('')
    || (myKoor[0] ? `<div class="push-cta">⭐ Anda koordinator ${h(misaTitle(myKoor[0]))} — absen dibuka pada hari misa.</div>` : '');
  main.innerHTML = `${koorCta}${pushCta}<div class="me-head">
      <div><div class="hint">Jadwal saya · ${h(monthName(S.monthId))}</div><h2>${h(name)}</h2></div>
      ${nameLocked() ? '' : '<button class="link-btn" data-act="change-myname">Bukan saya?</button>'}
    </div>
    <div class="sec-title">🕊️ Hantaran saya <span class="count">${smk.length} tugas</span></div>
    ${block(smk, 'Tidak ada tugas hantaran bulan ini.')}
    <div class="sec-title">⛪ Misa saya <span class="count">${misa.length} tugas</span></div>
    ${block(misa, 'Tidak ada tugas misa bulan ini.')}
    ${items.length ? `<div class="btns" style="margin-top:12px"><button class="btn primary" data-act="share" data-k="${h(norm(name))}">Bagikan / salin jadwal saya</button></div>` : ''}
    ${sponsorCard()}`;
}
const mapsUrl = alamat => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(alamat)}`;

// Umat yang dikunjungi petugas: alamat (+ peta), telp/WA, catatan
function visitBlock(m) {
  return `<div class="member">
    <div><span class="nm">${h(m.nama)}</span>${m.lingkungan ? `<span class="ln">${h(m.lingkungan)}</span>` : ''}</div>
    ${m.alamat ? `<div class="ad">📍 ${h(m.alamat)} <a class="map" href="${h(mapsUrl(m.alamat))}" target="_blank" rel="noopener">Peta</a></div>` : '<div class="ad warn">Alamat belum diisi di Master umat</div>'}
    ${m.telp ? `<div class="phones">${phoneLinks(m.telp)}</div>` : ''}
    ${m.note ? `<div class="ad">📝 ${h(m.note)}</div>` : ''}
  </div>`;
}

function personText(p) {
  const lines = p.items.map(i => {
    const when = [i.date && fmtShort(i.date), i.time && 'pk ' + i.time].filter(Boolean).join(' ');
    let line = `• ${when} – ${i.text}${i.koor ? ' (Koordinator)' : ''}`;
    if (i.type === 'smk') {
      for (const m of i.members || []) {
        line += `
   – ${m.nama}${m.lingkungan ? ` (${m.lingkungan})` : ''}`;
        if (m.alamat) line += `
     📍 ${m.alamat}
     ${mapsUrl(m.alamat)}`;
        if (m.telp) line += `
     📞 ${m.telp}`;
        if (m.note) line += `
     📝 ${m.note}`;
      }
    }
    return line;
  });
  return `Jadwal tugas *${p.name}* – ${monthName(S.monthId)}\n${lines.join('\n')}`;
}

/* ---- Cek ---- */
function buildIssues() {
  const out = [];
  const W = weeks();
  for (const g of S.smk) {
    W.forEach((w, i) => {
      const name = (g.officers[i] || '').trim();
      const sun = weekendsOf(S.monthId)[i]?.sun || '';
      const day = sun && slotByKey(g.slot) ? slotDate(slotByKey(g.slot), sun) : sun;
      if (!name) { out.push(['⚠️', `Hantaran grup ${g.no} (${smkSlotLabel(g.slot)}) minggu ${w} belum ada petugas.`, `smk:${g.id}`, day]); return; }
      const gw = groupWilayah(g), pw = petugasWilayah(inMaster(name));
      if (gw.length && pw && !gw.some(w => w.id === pw.id)) out.push(['⚠️', `${name} (wilayah ${pw.nama}) mengantar hantaran grup ${g.no} di wilayah ${gw.map(w => w.nama).join(', ')} (${w}).`, `smk:${g.id}`, day]);
      if (!REGULAR.includes(g.slot)) return;
      const lm = linkedMisa(g.slot, i);
      if (!lm) out.push(['⚠️', `Jadwal misa ${g.slot} minggu ke-${i + 1} (${w}) belum dibuat, padahal ada petugas Hantaran grup ${g.no}.`, `misa-new:${g.slot}|${day}`, day]);
      else if (!lm.officers.some(n => norm(n) === norm(name))) {
        out.push(['❗', `${name} bertugas hantaran grup ${g.no} (${w}) tapi tidak ada di jadwal misa ${g.slot} ${fmtShort(lm.date)}.`, `misa:${lm.id}`, lm.date]);
      }
    });
  }
  // Petugas yang dijadwalkan di slot yang rutin tidak bisa ia ikuti
  for (const m of S.misa) for (const n of m.officers) {
    if (slotBlocked(n, m.slot)) out.push(['❗', `${n} ${blockedLabel(m.slot)}, tapi dijadwalkan di misa ${m.slot} ${fmtShort(m.date)}.`, `misa:${m.id}`, m.date]);
  }
  for (const g of S.smk) g.officers.forEach((n, i) => {
    if (n && slotBlocked(n, g.slot)) out.push(['❗', `${n} ${blockedLabel(g.slot)}, tapi mengantar hantaran grup ${g.no} (${weeks()[i] || ''}).`, `smk:${g.id}`, smkDay(g.slot, i)]);
  });
  // Petugas yang dijadwalkan pada tanggal ia berhalangan
  for (const m of S.misa) {
    for (const n of m.officers) {
      const a = absenceOn(n, m.date);
      if (a) out.push(['❗', `${n} ${absenceLabel(a)}, tapi dijadwalkan di ${m.slot === 'LAIN' ? m.title : m.slot} ${fmtShort(m.date)}.`, `misa:${m.id}`, m.date]);
    }
  }
  for (const g of S.smk) {
    g.officers.forEach((n, i) => {
      const day = smkDay(g.slot, i), a = n && absenceOn(n, day);
      if (a) out.push(['❗', `${n} ${absenceLabel(a)}, tapi bertugas hantaran grup ${g.no} (${weeks()[i] || ''}).`, `smk:${g.id}`, day]);
    });
  }
  for (const n of allNames()) {
    const p = inMaster(n);
    if (!p) out.push(['❗', `Petugas "${n}" ada di jadwal tapi tidak ada di Master petugas.`, `petugas-new:${n}`]);
    else if (!p.active) out.push(['⚠️', `Petugas ${p.nama} sudah tidak aktif tapi masih ada di jadwal bulan ini.`, `person:${norm(p.nama)}`]);
  }
  if (S.lingkungan.length) {
    for (const l of S.lingkungan) if (l.active && !S.wilayah.some(w => w.id === l.wilayah_id)) out.push(['ℹ️', `Lingkungan ${l.nama} belum dimasukkan ke wilayah mana pun.`, `ling:${l.id}`]);
    for (const u of S.umat) if (u.active && u.lingkungan && !lingOf(u.lingkungan)) out.push(['⚠️', `Umat ${u.nama}: lingkungan "${u.lingkungan}" tidak ada di Master lingkungan.`, `umat:${u.id}`]);
  }
  const asg = umatAssignments();
  for (const u of S.umat) {
    const gs = asg.get(u.id) || [];
    const nm = u.nama + (u.lingkungan ? ` (${u.lingkungan})` : '');
    if (gs.length > 1) out.push(['❗', `Umat ${nm} tercantum di ${gs.length} grup hantaran: ${gs.map(g => g.no).join(', ')}.`, `smk:${gs[1].id}`]);
    if (!u.active && gs.length) out.push(['⚠️', `Umat ${nm} sudah tidak aktif tapi masih ada di grup hantaran ${gs.map(g => g.no).join(', ')}.`, `smk:${gs[0].id}`]);
    if (u.active && !gs.length && S.smk.length) out.push(['ℹ️', `Umat ${nm} aktif tapi belum masuk grup hantaran bulan ini.`, `umat:${u.id}`]);
  }
  const perDay = new Map();
  for (const m of S.misa) {
    const label = `${m.slot === 'LAIN' ? m.title : m.slot} ${fmtShort(m.date)}`;
    if ((m.need || 0) > m.officers.length) out.push(['⚠️', `${label}: kurang ${m.need - m.officers.length} petugas.`, `misa:${m.id}`, m.date]);
    if (REGULAR.includes(m.slot) && !m.officers.length) out.push(['⚠️', `${label}: belum ada petugas.`, `misa:${m.id}`, m.date]);
    if (m.officers.length && !m.coordinator) out.push(['ℹ️', `${label}: koordinator belum ditentukan.`, `misa:${m.id}`, m.date]);
    const seen = new Set();
    for (const n of m.officers) {
      const k = norm(n);
      if (seen.has(k)) out.push(['❗', `${label}: nama "${n}" tercantum dua kali.`, `misa:${m.id}`, m.date]);
      seen.add(k);
      const dk = m.date + '|' + k;
      if (!perDay.has(dk)) perDay.set(dk, { name: n, list: [] });
      perDay.get(dk).list.push(m.slot === 'LAIN' ? m.title : `${m.slot} ${m.time}`);
    }
  }
  for (const [dk, v] of perDay) {
    if (v.list.length > 1) out.push(['ℹ️', `${v.name} bertugas ${v.list.length}× pada ${fmtShort(dk.split('|')[0])}: ${v.list.join(', ')}.`, `person:${norm(v.name)}`, dk.split('|')[0]]);
  }
  return out;
}

// Klik temuan di Cek → buka data yang perlu diperbaiki
function goIssue(link) {
  const i = link.indexOf(':'), type = link.slice(0, i), v = link.slice(i + 1);
  if (type === 'misa') return openMisa(S.misa.find(m => m.id === v));
  if (type === 'smk') return openSmk(S.smk.find(g => g.id === v));
  if (type === 'umat') return openUmat(UM.get(v));
  if (type === 'ling') return openLingkunganForm(S.lingkungan.find(l => l.id === v));
  if (type === 'petugas-new') { openPetugasForm(); $('#sheetForm').elements.nama.value = v; return; }
  if (type === 'person') { S.tab = 'petugas'; S.petugasView = 'tugas'; S.person = v; lsSet('prodiakon.tab', S.tab); render(); window.scrollTo(0, 0); return; }
  if (type === 'misa-new') {
    const [slot, date] = v.split('|');
    openMisa();
    const f = $('#sheetForm'), sl = slotByKey(slot);
    f.elements.slot.value = slot;
    if (date) f.elements.date.value = date;
    if (sl?.time) f.elements.time.value = sl.time;
    if (!f.elements.title.value) f.elements.title.value = 'Minggu Biasa';
  }
}

// Temuan [ikon, teks, tautan, tanggal]; yang bertanggal sebelum hari ini tidak ditampilkan
function activeIssues() {
  const today = iso(new Date());
  return buildIssues().filter(i => !i[3] || i[3] >= today);
}

function renderCek(main) {
  const all = buildIssues(), issues = activeIssues(), past = all.length - issues.length;
  const pastNote = past ? `<div class="count" style="margin:8px 2px 0">${past} catatan untuk tanggal yang sudah lewat tidak ditampilkan.</div>` : '';
  main.innerHTML = issues.length
    ? `<div class="count" style="margin:0 2px 8px">${issues.length} catatan · ❗ perlu diperbaiki · ⚠️ belum lengkap · ℹ️ info</div>
       <div class="list">${issues.map(([ic, t, link]) => `<div class="issue${link ? ' tap' : ''}" ${link ? `data-act="cek-go" data-k="${h(link)}"` : ''}>
         <span class="ic">${ic}</span><span class="tx">${h(t)}</span>${link ? '<span class="go">›</span>' : ''}</div>`).join('')}</div>
      ${pastNote}`
    : `<div class="ok">✅ Tidak ada masalah pada jadwal bulan ini${past ? ' yang belum lewat' : ''}.</div>${pastNote}`;
}

/* ================= Sheet (dialog) ================= */
const dlg = $('#sheet');
function openSheet(title, body, { save, del, saveLabel = 'Simpan', onClick } = {}) {
  const f = $('#sheetForm');
  f.innerHTML = `<div class="sh-head"><span>${h(title)}</span><button type="button" class="icon-btn" data-sh="close">✕</button></div>
    <div class="sh-body">${body}</div>
    ${save || del ? `<div class="sh-foot">
      ${del ? '<button type="button" class="btn danger" data-sh="del">Hapus</button>' : ''}
      <span class="sp"></span>
      <button type="button" class="btn" data-sh="close">Batal</button>
      ${save ? `<button type="submit" class="btn primary">${h(saveLabel)}</button>` : ''}
    </div>` : ''}`;
  // Validasi ditangani sendiri: di Safari iPhone pesan validasi bawaan sering tidak tampil di dalam dialog,
  // sehingga tombol Simpan terlihat tidak bereaksi.
  f.noValidate = true;
  f.onsubmit = async e => {
    e.preventDefault();
    const bad = [...f.elements].find(el => el.willValidate && !el.checkValidity());
    if (bad) {
      const label = (bad.closest('label')?.childNodes[0]?.textContent || bad.name || 'Isian').trim();
      toast(bad.validity.valueMissing ? `${label} wajib diisi` : `${label}: ${bad.validationMessage}`);
      bad.classList.add('invalid'); bad.focus?.(); bad.scrollIntoView?.({ block: 'center' });
      bad.addEventListener('input', () => bad.classList.remove('invalid'), { once: true });
      return;
    }
    const ok = await run(() => save(new FormData(f), f));
    if (ok !== false) dlg.close();
  };
  f.onclick = async e => {
    const b = e.target.closest('[data-sh]');
    if (!b) return;
    if (b.dataset.sh === 'close') dlg.close();
    else if (b.dataset.sh === 'del') {
      if (confirm('Hapus data ini?') && (await run(del)) !== false) dlg.close();
    } else if (onClick) onClick(b, f);
  };
  dlg.showModal();
  dlg.querySelector('.sh-body').scrollTop = 0;
}
const opt = (val, label, sel) => `<option value="${h(val)}" ${val === sel ? 'selected' : ''}>${h(label)}</option>`;

/* ---- Edit misa ---- */
function openMisa(m) {
  const isNew = !m;
  m = m ? structuredClone(m) : {
    id: uid(), month_id: S.monthId, date: S.monthId + '-01', slot: 'LAIN', title: '', time: '', place: '',
    color: 'hijau', need: 0, officers: [], coordinator: '', note: '',
  };
  const body = `
    <label class="fld">Jenis misa<select name="slot">${MISA_SLOTS.map(s => opt(s.key, s.key === 'LAIN' ? 'Misa khusus / lainnya' : `${s.key} · ${s.label}`, m.slot)).join('')}</select></label>
    <div class="grid2 date-row">
      <label class="fld">Tanggal<input type="date" name="date" required value="${h(m.date)}"></label>
      <label class="fld">Jam<input type="time" name="time" value="${h(toTimeInput(m.time || slotByKey(m.slot)?.time || ''))}"></label>
    </div>
    <label class="fld">Nama misa / perayaan<input name="title" value="${h(m.title)}" placeholder="Minggu Biasa"></label>
    <div class="grid2">
      <label class="fld">Tempat<input name="place" value="${h(m.place)}" placeholder="Gereja"></label>
      <label class="fld">Warna liturgi<select name="color">${Object.entries(COLORS).map(([k, v]) => opt(k, v[0], m.color)).join('')}</select></label>
    </div>
    <label class="fld">Jumlah petugas dibutuhkan<input type="number" min="0" name="need" value="${m.need || 0}" inputmode="numeric"></label>
    <div class="fld">Petugas <span id="offCount"></span></div>
    <div class="chips" id="offChips"></div>
    <div id="offAbsent"></div>
    <div class="grid2" style="grid-template-columns:minmax(0,1fr) auto;align-items:end">
      <label class="fld">Tambah petugas (dari Master petugas)<select id="addName"></select></label>
      <button type="button" class="btn" data-sh="rand-off" title="Ambil petugas yang paling sedikit bertugas bulan ini">🎲 Isi acak</button>
    </div>
    <label class="fld">Koordinator<select name="coordinator"></select></label>
    <label class="fld">Catatan<input name="note" value="${h(m.note)}"></label>`;
  openSheet(isNew ? 'Tambah misa' : 'Ubah misa', body, {
    save: async fd => {
      const row = {
        ...m, date: fd.get('date'), slot: fd.get('slot'), title: fd.get('title').trim(),
        time: REGULAR.includes(fd.get('slot')) ? slotByKey(fd.get('slot')).time : fromTimeInput(fd.get('time')),
        place: fd.get('place').trim(), color: fd.get('color'), need: Number(fd.get('need')) || 0,
        officers, coordinator: fd.get('coordinator') || '', note: fd.get('note').trim(),
      };
      await store.upsert('misa', [row]);
      const i = S.misa.findIndex(x => x.id === row.id);
      if (i >= 0) S.misa[i] = row; else S.misa.push(row);
      render(); toast('Tersimpan');
    },
    del: isNew ? null : async () => {
      await store.remove('misa', m.id);
      S.misa = S.misa.filter(x => x.id !== m.id); render(); toast('Dihapus');
    },
    onClick: b => {
      if (b.dataset.sh === 'rm-off') { officers.splice(Number(b.dataset.i), 1); renderOfficers(); }
      else if (b.dataset.sh === 'rand-off') {
        const f = $('#sheetForm'), need = Number(f.elements.need.value) || 0;
        const n = Math.max(1, need - officers.length);
        const picks = randomPetugas(n, { date: f.elements.date.value, slot: f.elements.slot.value, exclude: officers, misaId: m.id });
        if (!picks.length) { toast('Tidak ada petugas lain yang tersedia di akhir pekan ini'); return; }
        officers.push(...picks); renderOfficers();
        toast(`${picks.length} petugas ditambahkan acak${picks.length < n ? ` (kurang ${n - picks.length}, tidak ada yang tersedia)` : ''}`);
      }
    },
  });
  const f = $('#sheetForm');
  // Petugas hanya dipilih dari Master petugas (chip), tidak bisa diketik bebas.
  const officers = [...m.officers];
  const renderOfficers = () => {
    const day = f.elements.date.value, slot = f.elements.slot.value;
    $('#addName').innerHTML = petugasOpts('', masterNames().length ? '＋ Pilih petugas…' : 'Master petugas masih kosong', officers, day, slot);
    $('#offChips').innerHTML = officers.length
      ? officers.map((n, i) => {
        const why = unavailable(n, day, slot), warn = !inMaster(n) ? 'Tidak ada di Master petugas' : why;
        return `<span class="chip edit${warn ? ' warn' : ''}" title="${h(warn)}">${why ? '🚫 ' : ''}${h(n)}<button type="button" data-sh="rm-off" data-i="${i}" aria-label="Hapus ${h(n)}">✕</button></span>`;
      }).join('')
      : '<span class="hint">Belum ada petugas.</span>';
    const offs = officers.map(n => [n, unavailable(n, day, slot)]).filter(x => x[1]);
    $('#offAbsent').innerHTML = offs.map(([n, why]) => `<div class="ad warn">🚫 ${h(n)} ${h(why)}</div>`).join('');
    $('#offCount').textContent = officers.length ? `(${officers.length}${m.need ? '/' + m.need : ''})` : '';
    syncKoor();
  };
  const syncKoor = () => {
    const sel = f.elements.coordinator, cur = sel.value || m.coordinator;
    const selected = officers.find(n => norm(n) === norm(cur)) || '';
    sel.innerHTML = opt('', '— belum ditentukan —', selected) + officers.map(n => opt(n, n, selected)).join('');
  };
  $('#addName').addEventListener('change', e => {
    const n = e.target.value;
    if (n && !officers.some(x => norm(x) === norm(n))) officers.push(n);
    renderOfficers();
  });
  f.elements.date.addEventListener('change', renderOfficers);
  f.elements.slot.addEventListener('change', renderOfficers);
  // Misa rutin: jam mengikuti pengaturan paroki & dikunci; misa khusus: pilih lewat pemilih jam
  const syncTime = () => {
    const s = MISA_SLOTS.find(x => x.key === f.elements.slot.value), rutin = REGULAR.includes(f.elements.slot.value);
    if (rutin && s?.time) f.elements.time.value = toTimeInput(s.time);
    f.elements.time.readOnly = rutin;
    f.elements.time.closest('.fld').classList.toggle('locked', rutin);
  };
  syncTime();
  f.elements.slot.addEventListener('change', () => {
    const s = MISA_SLOTS.find(x => x.key === f.elements.slot.value);
    syncTime();
    if (s && s.key !== 'LAIN' && !f.elements.title.value) f.elements.title.value = 'Minggu Biasa';
    if (s?.need && !Number(f.elements.need.value)) f.elements.need.value = s.need; // jumlah petugas default slot
  });
  renderOfficers();
}

/* ---- Master umat ---- */
// Grup yang memuat tiap umat di bulan aktif: Map(umat_id → [grup])
function umatAssignments() {
  const map = new Map();
  for (const g of S.smk) {
    for (const m of g.members) {
      if (!m.umat_id) continue;
      if (!map.has(m.umat_id)) map.set(m.umat_id, []);
      map.get(m.umat_id).push(g);
    }
  }
  return map;
}

function renderUmat(main, bar) {
  main.innerHTML = bar + `<input class="search" id="umatQ" type="search" placeholder="Cari nama, lingkungan, alamat, telp…" value="${h(S.umatQ)}">
    <div id="umatList"></div>`;
  $('#umatQ').addEventListener('input', e => { S.umatQ = e.target.value; drawUmat(); });
  drawUmat();
}

function drawUmat() {
  const q = norm(S.umatQ), asg = umatAssignments();
  const match = u => !q || norm([u.nama, u.lingkungan, u.alamat, u.telp, u.note].join(' ')).includes(q);
  const sec = (title, list) => (list.length
    ? `<div class="sec-title">${title} <span class="count">${list.length} umat</span></div>
       <div class="list">${list.map(u => umatRow(u, asg.get(u.id))).join('')}</div>`
    : '');
  const html = sec('Aktif', S.umat.filter(u => u.active && match(u))) + sec('Tidak aktif', S.umat.filter(u => !u.active && match(u)));
  $('#umatList').innerHTML = html || `<div class="empty-state">${S.umat.length ? 'Tidak ditemukan.'
    : `Belum ada umat.${S.admin ? ' Tekan ＋ untuk menambah.' : ''}`}</div>`;
}

function umatRow(u, groups = []) {
  const where = groups.length
    ? groups.map(g => `<span class="tag">Grup ${h(g.no)} · ${h(smkSlotLabel(g.slot))}</span>`).join('')
    : (u.active && S.monthId ? '<span class="tag warn">Belum masuk grup bulan ini</span>' : '');
  return `<div class="umat${S.admin ? ' tap' : ''}" ${S.admin ? `data-act="edit-umat" data-id="${h(u.id)}"` : ''}>
    <div><span class="nm">${h(u.nama)}</span>${u.lingkungan ? `<span class="ln">${h(u.lingkungan)}</span>` : ''}${wilayahOfLing(u.lingkungan) ? ` <span class="tag wil">${h(wilayahOfLing(u.lingkungan).nama)}</span>` : ''}</div>
    ${u.alamat ? `<div class="ad">📍 ${h(u.alamat)}</div>` : ''}
    ${u.telp ? `<div class="phones">${phoneLinks(u.telp)}</div>` : ''}
    ${u.note ? `<div class="ad">📝 ${h(u.note)}</div>` : ''}
    ${where ? `<div class="tags">${where}</div>` : ''}
  </div>`;
}

function openUmat(u) {
  const isNew = !u;
  u = u ? { ...u } : { id: uid(), nama: '', lingkungan: '', alamat: '', telp: '', note: '', active: true };
  const body = `
    <label class="fld">Nama<input name="nama" required value="${h(u.nama)}" placeholder="mis. Ibu Maria (2 SMK)"></label>
    <div class="grid2">
      <label class="fld">Lingkungan${S.lingkungan.length ? `<select name="lingkungan">${lingkunganOpts(u.lingkungan)}</select>` : `<input name="lingkungan" value="${h(u.lingkungan)}">`}</label>
      <label class="fld">Telp / HP<input name="telp" value="${h(u.telp)}" inputmode="tel" placeholder="0812… / 0813…"></label>
    </div>
    <label class="fld">Alamat<input name="alamat" value="${h(u.alamat)}"></label>
    <label class="fld">Catatan<input name="note" value="${h(u.note)}" placeholder="mis. lantai 2, hanya pagi"></label>
    <label><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Masih dilayani (aktif)</label>
    <p class="hint">Tulis "(2 SMK)" di nama bila satu rumah menerima lebih dari satu. Umat yang pindah/sembuh/meninggal cukup ditandai tidak aktif.</p>`;
  openSheet(isNew ? 'Umat baru' : 'Ubah umat', body, {
    save: async fd => {
      const row = {
        ...u, nama: fd.get('nama').trim(), lingkungan: fd.get('lingkungan').trim(), alamat: fd.get('alamat').trim(),
        telp: fd.get('telp').trim(), note: fd.get('note').trim(), active: !!fd.get('active'),
      };
      if (!row.nama) { toast('Nama wajib diisi'); return false; }
      const dup = S.umat.find(x => x.id !== row.id && norm(x.nama) === norm(row.nama) && norm(x.alamat) === norm(row.alamat));
      if (dup && !confirm(`"${row.nama}" dengan alamat yang sama sudah ada di master. Tetap simpan?`)) return false;
      await store.upsert('umat', [row]);
      setUmat([...S.umat.filter(x => x.id !== row.id), row]);
      render(); toast('Tersimpan');
    },
    del: isNew ? null : async () => {
      const used = S.smk.filter(g => g.members.some(m => m.umat_id === u.id));
      if (used.length) {
        toast(`Masih ada di grup ${used.map(g => g.no).join(', ')} bulan ini. Keluarkan dulu dari grup, atau tandai tidak aktif.`);
        return false;
      }
      await store.remove('umat', u.id);
      setUmat(S.umat.filter(x => x.id !== u.id)); render(); toast('Dihapus');
    },
  });
}

// Anggota grup lama (nama/alamat diketik langsung) → dipindah ke master umat, grup menyimpan {umat_id, nama}.
async function linkLegacy(groups, persistGroups = true) {
  const added = [], changed = [];
  const find = m => [...S.umat, ...added].find(u => norm(u.nama) === norm(m.nama)
    && (!m.alamat || !u.alamat || norm(u.alamat) === norm(m.alamat)));
  for (const g of groups) {
    const before = (g.members || []).length;
    let dirty = false;
    g.members = (g.members || []).filter(m => m.umat_id || String(m.nama || '').trim()).map(m => {
      if (m.umat_id) return m;
      dirty = true;
      let u = find(m);
      if (!u) {
        u = {
          id: uid(), nama: m.nama.trim(), lingkungan: (m.lingkungan || '').trim(), alamat: (m.alamat || '').trim(),
          telp: (m.telp || '').trim(), note: '', active: true,
        };
        added.push(u);
      }
      return { umat_id: u.id, nama: u.nama };
    });
    if (dirty || g.members.length !== before) changed.push(g);
  }
  if (added.length) { await store.upsert('umat', added); setUmat([...S.umat, ...added]); }
  if (persistGroups && changed.length) await store.upsert('smk_groups', changed);
  return added.length;
}

/* ---- Edit grup hantaran ---- */
function openSmk(g) {
  const isNew = !g;
  const maxNo = Math.max(0, ...S.smk.map(x => Number(x.no) || 0));
  g = g ? structuredClone(g) : {
    id: uid(), month_id: S.monthId, slot: 'M1', no: String(maxNo + 1),
    sort: Math.max(-1, ...S.smk.map(x => x.sort ?? 0)) + 1, officers: [], members: [],
  };
  const members = g.members.filter(m => m.umat_id || String(m.nama || '').trim());
  const body = `
    <div class="grid2">
      <label class="fld">No<input name="no" value="${h(g.no)}"></label>
      <label class="fld">Jam layanan<select name="slot">${SMK_SLOTS.map(s => opt(s.key, s.label, g.slot)).join('')}</select></label>
    </div>
    <div class="fld">Petugas per minggu <span class="hint" id="wilHint"></span></div>
    <div class="grid2" id="weekSel">${weeks().map((w, i) => `<label class="fld">${h(w)}<select name="off${i}"></select></label>`).join('')}</div>
    <label id="otherWilBox"><input type="checkbox" id="otherWil"> Ambil petugas dari wilayah lain</label>
    <div class="fld">Umat yang dilayani <span id="memCount"></span></div>
    <div id="memList" class="mem-list"></div>
    <div class="grid2" style="grid-template-columns:1fr auto;align-items:end">
      <label class="fld">Tambah umat dari master<input id="addUmat" list="umatOpts" placeholder="Pilih / ketik nama umat…" autocomplete="off"></label>
      <button type="button" class="btn" data-sh="add-umat">Tambah</button>
    </div>
    <datalist id="umatOpts"></datalist>
    <p class="hint">Alamat & telp diubah di Hantaran → Master umat.</p>`;
  openSheet(isNew ? 'Tambah grup hantaran' : `Ubah grup hantaran ${g.no}`, body, {
    save: async fd => {
      const row = {
        ...g, no: fd.get('no').trim(), slot: fd.get('slot'),
        officers: weeks().map((_, i) => (fd.get('off' + i) || '').trim()),
        members: members.map(m => (m.umat_id ? { umat_id: m.umat_id, nama: UM.get(m.umat_id)?.nama || m.nama } : m)),
      };
      await store.upsert('smk_groups', [row]);
      const i = S.smk.findIndex(x => x.id === row.id);
      if (i >= 0) S.smk[i] = row; else S.smk.push(row);
      // Petugas hantaran = petugas misa di hari & jam yang sama → otomatis masuk jadwal misa
      const r = await addHantaranToMisa(row);
      render();
      toast(['Tersimpan', r.added && `${r.added} petugas hantaran ditambahkan ke jadwal misa`, r.noMisa && `${r.noMisa} minggu belum ada jadwal misanya`].filter(Boolean).join(' · '));
    },
    del: isNew ? null : async () => {
      await store.remove('smk_groups', g.id);
      S.smk = S.smk.filter(x => x.id !== g.id); render(); toast('Dihapus');
    },
    onClick: b => {
      if (b.dataset.sh === 'add-umat') addUmat($('#addUmat').value);
      else if (b.dataset.sh === 'rm-mem') { members.splice(Number(b.dataset.i), 1); drawMem(); }
    },
  });
  const otherGroups = id => S.smk.filter(x => x.id !== g.id && x.members.some(m => m.umat_id === id)).map(x => x.no);
  // Pilihan petugas per minggu mengikuti wilayah umat di grup ini (diperbarui saat umat ditambah/dihapus)
  const renderWeekSelects = () => {
    const f = $('#sheetForm'), slot = f.elements.slot.value;
    const wil = groupWilayah({ members });
    $('#wilHint').textContent = wil.length ? `— wilayah ${wil.map(w => w.nama).join(', ')}` : '';
    $('#otherWilBox').hidden = !wil.length;
    const other = $('#otherWil').checked;
    weeks().forEach((_, i) => {
      const sel = f.elements['off' + i], cur = sel.dataset.ready ? sel.value : (g.officers[i] || '');
      sel.dataset.ready = '1';
      sel.innerHTML = hantaranOpts(cur, wil, smkDay(slot, i), slot, other);
    });
  };
  const drawMem = () => {
    $('#memList').innerHTML = members.length ? members.map((m, i) => {
      const u = m.umat_id && UM.get(m.umat_id), d = u || m;
      const other = m.umat_id ? otherGroups(m.umat_id) : [];
      const warn = [
        !u && (m.umat_id ? 'Sudah dihapus dari master' : 'Belum terhubung ke master'),
        u && !u.active && 'Tidak aktif di master',
        other.length && `Juga di grup ${other.join(', ')}`,
      ].filter(Boolean);
      return `<div class="mem-row"><div class="mi">
          <span class="nm">${h(d.nama)}</span>${d.lingkungan ? `<span class="ln">${h(d.lingkungan)}</span>` : ''}
          ${d.alamat ? `<div class="ad">${h(d.alamat)}</div>` : ''}
          ${warn.map(w => `<div class="ad warn">⚠️ ${h(w)}</div>`).join('')}
        </div><button type="button" class="icon-btn" data-sh="rm-mem" data-i="${i}" aria-label="Keluarkan dari grup">✕</button></div>`;
    }).join('') : '<span class="hint">Belum ada umat.</span>';
    $('#memCount').textContent = members.length ? `(${members.length})` : '';
    const inGroup = new Set(members.map(m => m.umat_id));
    $('#umatOpts').innerHTML = S.umat.filter(u => u.active && !inGroup.has(u.id))
      .map(u => `<option value="${h(umatLabel(u))}">`).join('');
    renderWeekSelects();
  };
  const addUmat = async text => {
    const t = String(text).trim();
    if (!t) return;
    const byName = S.umat.filter(x => norm(x.nama) === norm(t));
    let u = S.umat.find(x => norm(umatLabel(x)) === norm(t)) || (byName.length === 1 ? byName[0] : null);
    if (!u) {
      if (byName.length > 1) { toast(`Ada ${byName.length} umat bernama "${t}", pilih dari daftar (lihat lingkungannya).`); return; }
      if (!confirm(`"${t}" belum ada di Master umat. Tambahkan sebagai umat baru?\nAlamat & telp bisa dilengkapi nanti di Master umat.`)) return;
      u = { id: uid(), nama: t, lingkungan: '', alamat: '', telp: '', note: '', active: true };
      const nu = u;
      if ((await run(async () => { await store.upsert('umat', [nu]); setUmat([...S.umat, nu]); })) === false) return;
    }
    if (!members.some(m => m.umat_id === u.id)) members.push({ umat_id: u.id, nama: u.nama });
    $('#addUmat').value = '';
    drawMem();
  };
  const inp = $('#addUmat');
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addUmat(inp.value); } });
  inp.addEventListener('input', e => { if (e.inputType === 'insertReplacementText' || !e.inputType) addUmat(inp.value); });
  $('#sheetForm').elements.slot.addEventListener('change', renderWeekSelects);
  $('#otherWil').addEventListener('change', renderWeekSelects);
  drawMem();
}

/* ---- Bulan ---- */
const AUTO_MONTH_DAY = 20; // mulai tanggal ini, bulan depan dibuat otomatis (admin)
const nextYm = ym => { const [y, m] = ym.split('-').map(Number); return iso(new Date(y, m, 1)).slice(0, 7); };

// Buat bulan ym: misa rutin tiap akhir pekan (jam & jumlah petugas dari pengaturan paroki),
// grup hantaran disalin dari bulan copyFrom (petugas dikosongkan, kecuali slot tetap/privat).
async function createMonth(ym, { gen = true, copyFrom = null, notesFrom = '', insertOnly = false } = {}) {
  const we = weekendsOf(ym);
  const month = { id: ym, weeks: we.map(w => w.label), notes: notesFrom };
  const misa = [], groups = [];
  if (gen) {
    for (const w of we) {
      for (const k of REGULAR) {
        const sl = slotByKey(k);
        misa.push({
          id: uid(), month_id: ym, date: slotDate(sl, w.sun), slot: k, title: 'Minggu Biasa',
          time: sl.time, place: '', color: 'hijau', need: Number(sl.need) || 0, officers: [], coordinator: '', note: '',
        });
      }
    }
  }
  if (copyFrom) {
    const src = copyFrom === S.monthId ? S.smk : await store.list('smk_groups', copyFrom);
    for (const g of src) {
      const fixed = !REGULAR.includes(g.slot);
      const { updated_at, ...rest } = structuredClone(g);
      groups.push({ ...rest, id: uid(), month_id: ym, officers: we.map(() => (fixed ? g.officers[0] || '' : '')) });
    }
  }
  if (insertOnly) await store.insert('months', [month]); // gagal bila bulan itu sudah dibuat admin lain
  else await store.upsert('months', [month]);
  await store.upsert('misa', misa);
  await store.upsert('smk_groups', groups);
  return { misa: misa.length, groups: groups.length };
}

// Admin membuka app pada/after tanggal 20 → bulan depan dibuat otomatis bila belum ada
async function autoNextMonth() {
  if (!S.admin || P.auto_month !== true || !REGULAR.length || !S.months.length) return; // hanya bila paroki menyalakannya
  const today = iso(new Date());
  if (Number(today.slice(8, 10)) < AUTO_MONTH_DAY) return;
  const ym = nextYm(today.slice(0, 7));
  if (S.months.some(m => m.id === ym)) return;
  const src = S.months.find(m => m.id === today.slice(0, 7)) || S.months[0] || null;
  try {
    const r = await createMonth(ym, { copyFrom: src?.id || null, notesFrom: src?.notes || '', insertOnly: true });
    S.months = (await store.list('months')).sort((a, b) => b.id.localeCompare(a.id));
    render();
    toast(`Jadwal ${monthName(ym)} dibuat otomatis: ${r.misa} misa rutin${r.groups ? `, ${r.groups} grup hantaran` : ''}`);
  } catch (e) {
    if (!/duplicate|23505|already exists/i.test(String(e.message || e.code || e))) console.warn('autoNextMonth', e);
  }
}

function openNewMonth() {
  const base = S.monthId ? parseD(S.monthId + '-01') : new Date();
  const next = new Date(base.getFullYear(), base.getMonth() + (S.monthId ? 1 : 0), 1);
  const slotTx = MISA_SLOTS.filter(x => x.key !== 'LAIN').map(x => `${x.key} ${x.label}${x.need ? ` (${x.need} petugas)` : ''}`).join(', ');
  const body = `
    <label class="fld">Bulan<input type="month" name="ym" required value="${iso(next).slice(0, 7)}"></label>
    ${S.monthId ? `<label><input type="checkbox" name="copy" checked> Salin daftar grup & umat hantaran dari ${h(monthName(S.monthId))} (petugas dikosongkan, kecuali privat/Jumat)</label>` : ''}
    <label><input type="checkbox" name="gen" checked> Buat misa rutin tiap akhir pekan</label>
    <p class="hint">${h(slotTx)}. Jam & jumlah petugas diatur di Menu ⋮ → Pengaturan paroki.</p>`;
  openSheet('Bulan baru', body, {
    saveLabel: 'Buat',
    save: async fd => {
      const ym = fd.get('ym');
      if (S.months.some(m => m.id === ym)) { toast('Bulan itu sudah ada'); return false; }
      await createMonth(ym, { gen: !!fd.get('gen'), copyFrom: fd.get('copy') ? S.monthId : null, notesFrom: curMonth()?.notes || '' });
      S.monthId = ym; lsSet('prodiakon.month', ym);
      await loadMonths(); toast(`${monthName(ym)} dibuat`);
    },
  });
}
const slotByKey = k => MISA_SLOTS.find(s => s.key === k);
// Jam tersimpan sebagai '17.30'; input type=time memakai '17:30'
const toTimeInput = t => { const m = /^(\d{1,2})[.:](\d{2})$/.exec(String(t || '').trim()); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''; };
const fromTimeInput = v => (v ? v.slice(0, 5).replace(':', '.') : '');

function openMonthSettings() {
  const m = curMonth();
  const body = `
    <label class="fld">Label minggu (satu per baris, urutan = kolom petugas hantaran)<textarea name="weeks" rows="5">${h(m.weeks.join('\n'))}</textarea></label>
    <label class="fld">Catatan untuk petugas hantaran<textarea name="notes" rows="7">${h(m.notes)}</textarea></label>`;
  openSheet(`Pengaturan ${monthName(m.id)}`, body, {
    save: async fd => {
      const row = { ...m, weeks: String(fd.get('weeks')).split('\n').map(s => s.trim()).filter(Boolean), notes: String(fd.get('notes')).trim() };
      await store.upsert('months', [row]);
      Object.assign(m, row); render(); toast('Tersimpan');
    },
    del: async () => {
      if (!confirm(`Yakin hapus SELURUH data ${monthName(m.id)}? Sebaiknya backup dulu.`)) return false;
      await store.remove('months', m.id);
      S.monthId = null; await loadMonths(); toast('Bulan dihapus');
    },
  });
}

/* ---- Menu ---- */
function openMenu() {
  const hasSeed = S.months.some(m => m.id === window.SEED?.months[0].id);
  const items = [
    S.admin && ['new-month', '📅 Buat bulan baru'],
    S.admin && S.monthId && ['settings', '⚙️ Pengaturan bulan ini (label minggu, catatan)'],
    S.monthId && ['print', '🖨️ Cetak jadwal ' + (S.tab === 'smk' ? 'hantaran' : 'misa')],
    S.monthId && ['csv', '📄 Export daftar hantaran (CSV/Excel)'],
    ['backup', '💾 Backup semua data (JSON)'],
    S.admin && ['import', '📥 Import dari backup JSON'],
    S.admin && hasSeedData() && !hasSeed && ['load-seed', '🧾 Muat data Oktober 2026'],
    ONLINE && S.admin && ['users', `👥 Pengguna${S.pendingUsers ? ` (${S.pendingUsers} menunggu)` : ''}`],
    ['#', 'Master data'],
    ['go-wilayah', `🗺️ Wilayah & lingkungan (${S.wilayah.length} wilayah · ${S.lingkungan.length} lingkungan)`],
    ['go-umat', `🏠 Master umat (${S.umat.filter(u => u.active).length})`],
    ['go-petugas', `👤 Master petugas (${masterNames().length})`],
    ['#', 'Pengaturan'],
    S.admin && ['paroki-settings', '⛪ Pengaturan paroki (nama, jam misa)'],
    S.admin && ['absences', `🚫 Petugas berhalangan${upcomingAbsences().length ? ` (${upcomingAbsences().length})` : ''}`],
    S.admin && ['sponsor', `🤝 Sponsor${S.sponsor.length ? ` (${activeSponsors().length} tayang)` : ''}`],
    ONLINE && S.super && ['paroki', '🏛️ Master paroki (super admin)'],
    S.months.length && ['reports', '📑 Laporan (PDF)'],
    ONLINE && ['profile', '👤 Profil saya'],
    ONLINE && ['logout', '🚪 Keluar'],
  ].filter(Boolean);
  const body = `<div class="menu-list">${items.map(([k, l]) => (k === '#' ? `<div class="menu-sec">${h(l)}</div>`
    : `<button type="button" data-sh="menu" data-k="${k}">${h(l)}</button>`)).join('')}</div>
    <p class="hint">Paroki: <b>${h(P.nama)}</b>${P.kota ? ` · ${h(P.kota)}` : ''}</p>
    <p class="hint">Peran: ${ONLINE ? (S.super ? 'Super admin' : S.admin ? 'Admin – bisa mengubah' : 'Lihat saja – hanya admin yang bisa mengubah') : 'Mode coba – data hanya tersimpan di perangkat ini'}</p>`;
  openSheet('Menu', body, {
    onClick: (b) => { dlg.close(); menuAction(b.dataset.k); },
  });
}

async function menuAction(k) {
  if (!S.admin && ['new-month', 'settings', 'import', 'load-seed', 'users', 'paroki-settings', 'sponsor', 'absences'].includes(k)) return;
  if (k === 'go-wilayah' || k === 'go-umat') { S.tab = 'smk'; S.smkView = k === 'go-wilayah' ? 'wilayah' : 'umat'; S.person = null; lsSet('prodiakon.tab', S.tab); lsSet('prodiakon.smkView', S.smkView); render(); window.scrollTo(0, 0); return; }
  if (k === 'go-petugas') { S.tab = 'petugas'; S.petugasView = 'master'; S.person = null; lsSet('prodiakon.tab', S.tab); render(); window.scrollTo(0, 0); return; }
  if (k === 'users') return run(openUsers);
  if (k === 'profile') return openProfile();
  if (k === 'reports') return openReports();
  if (k === 'paroki-settings') return openParokiForm(P);
  if (k === 'sponsor') return openSponsorList();
  if (k === 'absences') return openAbsenceList();
  if (k === 'paroki') return S.super && run(openMasterParoki);
  if (k === 'new-month') openNewMonth();
  else if (k === 'settings') openMonthSettings();
  else if (k === 'print') printView();
  else if (k === 'csv') exportCsv();
  else if (k === 'backup') run(backup);
  else if (k === 'import') $('#importFile').click();
  else if (k === 'load-seed') run(loadSeed);
  else if (k === 'logout') { await disablePush().catch(() => {}); await store.sb.auth.signOut(); location.reload(); }
}

async function importData(data, msg) {
  const withId = rows => (rows || []).map(r => ({ ...r, id: r.id || uid() }));
  await store.upsert('months', data.months || []);
  await store.upsert('misa', withId(data.misa));
  await store.upsert('umat', withId(data.umat));
  setUmat(await store.list('umat'));
  if (data.petugas?.length) {
    const have = await store.list('petugas');
    await store.upsert('petugas', withId(data.petugas).filter(p => !have.some(x => x.id !== p.id && norm(x.nama) === norm(p.nama))));
  }
  const groups = withId(data.smk_groups);
  await linkLegacy(groups, false); // backup/seed lama: anggota → master umat
  await store.upsert('smk_groups', groups);
  await loadMonths(); toast(msg);
}
async function loadSeed() {
  const seed = structuredClone(window.SEED);
  S.monthId = seed.months[0].id;
  await importData(seed, 'Data Oktober 2026 dimuat');
}
async function backup() {
  const [months, misa, smk_groups, umat, petugas] = await Promise.all(['months', 'misa', 'smk_groups', 'umat', 'petugas'].map(k => store.list(k)));
  download(`prodiakon-backup-${iso(new Date())}.json`, JSON.stringify({ app: 'prodiakon', version: 3, months, misa, smk_groups, umat, petugas }, null, 1), 'application/json');
}
$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  await run(async () => {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.months)) throw new Error('File bukan backup aplikasi ini');
    if (!confirm(`Import ${data.months.length} bulan, ${data.misa?.length || 0} misa, ${data.smk_groups?.length || 0} grup hantaran, ${data.umat?.length || 0} umat? Data dengan ID sama akan ditimpa.`)) return;
    await importData(data, 'Import selesai');
  });
});

function exportCsv() {
  const W = weeks();
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['No', 'Jam layanan', ...W, 'Nama umat', 'Lingkungan', 'Alamat', 'Telp']];
  for (const s of SMK_SLOTS) {
    for (const g of S.smk.filter(x => x.slot === s.key)) {
      (mem(g).length ? mem(g) : [{}]).forEach((m, i) => rows.push([
        i ? '' : g.no, i ? '' : s.label, ...W.map((_, j) => (i ? '' : g.officers[j] || '')),
        m.nama, m.lingkungan, m.alamat, m.telp,
      ]));
    }
  }
  download(`smk-${S.monthId}.csv`, '﻿' + rows.map(r => r.map(esc).join(';')).join('\r\n'), 'text/csv');
}

function printView() {
  const p = $('#print');
  const title = monthName(S.monthId);
  if (S.tab === 'smk') {
    const W = weeks();
    let rows = '';
    for (const s of SMK_SLOTS) {
      const gs = S.smk.filter(x => x.slot === s.key);
      if (!gs.length) continue;
      rows += `<tr class="sec"><td colspan="${6 + W.length}">${h(s.label.toUpperCase())}</td></tr>`;
      for (const g of gs) {
        const ms = mem(g).length ? mem(g) : [{}];
        ms.forEach((m, i) => {
          rows += `<tr>${i ? '' : `<td rowspan="${ms.length}">${h(g.no)}</td>${W.map((_, j) => `<td rowspan="${ms.length}">${h(g.officers[j] || '')}</td>`).join('')}`}
            <td>${h(m.nama)}</td><td>${h(m.lingkungan)}</td><td>${h(m.alamat)}</td><td>${h(m.telp)}</td></tr>`;
        });
      }
    }
    p.innerHTML = `<h2>DAFTAR PETUGAS PRODIAKON LAYANAN HANTARAN – ${h(title.toUpperCase())}</h2>
      <table><thead><tr><th>No</th>${W.map(w => `<th>${h(w)}</th>`).join('')}<th>Nama</th><th>Lingkungan</th><th>Alamat</th><th>Telp/HP/WA</th></tr></thead>
      <tbody>${rows}</tbody></table>
      ${curMonth().notes ? `<p style="white-space:pre-wrap"><b>Catatan:</b>\n${h(curMonth().notes)}</p>` : ''}`;
  } else {
    let html = `<h2>JADWAL TUGAS PRODIAKON – ${h(title.toUpperCase())}</h2>`;
    const table = list => {
      const max = Math.max(...list.map(m => Math.max(m.officers.length, m.need || 0)), 1);
      let t = `<table><thead>
        <tr>${list.map(m => `<th>${h(fmtShort(m.date).toUpperCase())}</th>`).join('')}</tr>
        <tr>${list.map(m => `<th>${h(m.title || '')}${m.color ? ' · ' + h(COLORS[m.color]?.[0] || m.color) : ''}</th>`).join('')}</tr>
        <tr>${list.map(m => `<th>${m.slot === 'LAIN' ? '' : h(m.slot) + ' – '}${h([m.place, m.time && 'pk ' + m.time].filter(Boolean).join(' '))}</th>`).join('')}</tr>
        </thead><tbody>`;
      for (let i = 0; i < max; i++) {
        t += '<tr>' + list.map(m => {
          const n = m.officers[i] || '';
          return `<td class="${n && norm(n) === norm(m.coordinator) ? 'k' : ''}">${h(n || (i === 0 && m.note ? m.note : ''))}</td>`;
        }).join('') + '</tr>';
      }
      return t + '</tbody></table>';
    };
    for (const s of REGULAR) { const l = misaOfSlot(s); if (l.length) html += table(l); }
    const lain = misaOfSlot('LAIN');
    for (let i = 0; i < lain.length; i += 4) html += table(lain.slice(i, i + 4));
    html += '<p>Sel biru = koordinator.</p>';
    p.innerHTML = html;
  }
  setTimeout(() => window.print(), 50);
}

/* ================= Event global ================= */
$('#main').addEventListener('click', e => {
  if (e.target.closest('a')) return; // link telp/WA di dalam kartu
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, id, k } = el.dataset;
  if (!S.admin && ['edit-misa', 'edit-smk', 'edit-umat', 'edit-petugas', 'load-seed', 'new-month'].includes(act)) return;
  if (act === 'smk-view') { S.smkView = k; lsSet('prodiakon.smkView', k); render(); return; }
  if (act === 'cek-go') { if (S.admin) goIssue(k); return; }
  if (act === 'push-on' || act === 'push-off') { togglePush(act === 'push-on'); return; }
  if (act === 'petugas-view') { S.petugasView = k; render(); return; }
  if (act === 'edit-petugas') { openPetugasForm(S.petugas.find(p => p.id === id)); return; }
  if (act === 'change-myname') { S.pickName = true; render(); $('#myNameInp')?.focus(); return; }
  if (act === 'cancel-myname') { S.pickName = false; render(); return; }
  if (act === 'set-myname') {
    const n = $('#myNameInp').value;
    if (!n) { toast('Pilih nama Anda dulu'); return; }
    lsSet('prodiakon.myName', n); S.pickName = false; render(); return;
  }
  if (act === 'edit-umat') { openUmat(UM.get(id)); return; }
  if (act === 'edit-wil') { if (S.admin) openWilayahForm(S.wilayah.find(w => w.id === id)); return; }
  if (act === 'edit-ling') { if (S.admin) openLingkunganForm(S.lingkungan.find(l => l.id === id)); return; }
  if (act === 'new-wil') { if (S.admin) openWilayahForm(); return; }
  if (act === 'petugas-wil-auto') { if (S.admin) run(autoPetugasWilayah); return; }
  if (act === 'new-ling') { if (S.admin) openLingkunganForm(k ? { wilayah_id: k } : undefined); return; }
  if (act === 'share-misa') { const m = S.misa.find(x => x.id === id); if (m) run(() => openMisaPoster(m)); return; }
  if (act === 'auto-fill') { if (S.admin) openAutoFill(); return; }
  if (act === 'auto-hantaran') { if (S.admin) openHantaranFill(); return; }
  if (act === 'koor') { const m = S.misa.find(x => x.id === id); if (m && canCoordinate(m)) { S.prevTab = S.tab; S.tab = 'koor'; S.koorMisa = id; S.koorDraft = null; render(); window.scrollTo(0, 0); } return; }
  if (act === 'koor-back') { S.tab = S.prevTab && S.prevTab !== 'koor' ? S.prevTab : 'saya'; S.koorMisa = null; render(); return; }
  if (act === 'koor-toggle') { S.koorDraft.set(k, !S.koorDraft.get(k)); renderKoor($('#main')); return; }
  if (act === 'koor-all') { for (const n of S.koorDraft.keys()) S.koorDraft.set(n, true); renderKoor($('#main')); return; }
  if (act === 'koor-save') { run(saveKoor); return; }
  if (act === 'koor-ganti') { openGanti(k); return; }
  if (act === 'misa-filter') { S.misaFilter = k; render(); }
  else if (act === 'edit-misa') openMisa(S.misa.find(m => m.id === id));
  else if (act === 'edit-smk') openSmk(S.smk.find(g => g.id === id));
  else if (act === 'person') { S.person = k; render(); window.scrollTo(0, 0); }
  else if (act === 'back') { S.person = null; render(); }
  else if (act === 'load-seed') run(loadSeed);
  else if (act === 'new-month') openNewMonth();
  else if (act === 'share') {
    const p = buildAssignments().find(x => x.key === k);
    if (!p) return;
    const text = personText(p);
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else navigator.clipboard.writeText(text).then(() => toast('Teks disalin'), () => toast('Gagal menyalin'));
  }
});
$$('.tabs button').forEach(b => b.addEventListener('click', () => {
  S.tab = b.dataset.tab; S.person = null; lsSet('prodiakon.tab', S.tab);
  render(); window.scrollTo(0, 0);
}));
$('#monthSel').addEventListener('change', e => { S.monthId = e.target.value; S.person = null; run(loadMonth); });
$('#menuBtn').addEventListener('click', openMenu);
$('#fab').addEventListener('click', () => {
  if (!S.admin) return;
  if (S.tab === 'petugas') openPetugasForm();
  else if (S.tab === 'smk') (S.smkView === 'umat' ? openUmat() : S.smkView === 'wilayah' ? openLingkunganForm() : openSmk());
  else openMisa();
});
document.addEventListener('visibilitychange', () => {
  // ambil perubahan dari pengguna lain saat app dibuka kembali
  if (!document.hidden && ONLINE && !dlg.open && !$('#app').hidden) run(loadMonth);
});

/* ---- Pengguna (persetujuan pendaftar) ---- */
// Pendaftar disetujui → akun ditautkan (bind) ke petugas di master (tab Saya).
// bound = nama yang dipilih admin; bila kosong, nama pendaftar (+ No. WA) ditambahkan ke Master petugas.
async function approveToMaster(u, bound = '') {
  const nama = String(bound || u?.nama || '').trim().replace(/\s+/g, ' ');
  if (!nama) return '';
  let p = inMaster(nama);
  if (!p || !p.active || (!p.telp && u.wa)) {
    p = p ? { ...p, active: true, telp: p.telp || u.wa || '' } : { id: uid(), nama, telp: u.wa || '', note: '', active: true };
    await store.upsert('petugas', [p]);
    setPetugas([...S.petugas.filter(x => x.id !== p.id), p]);
  }
  if (norm(u.petugas) !== norm(p.nama)) await store.setUserPetugas(u.user_id, p.nama);
  return p.nama;
}
async function openUsers() {
  const [list, admins] = await Promise.all([store.listUsers(), store.listAdmins().catch(() => [])]);
  S.pendingUsers = list.filter(u => u.status === 'pending').length;
  const row = u => {
    // Tombol di baris sendiri di bawah info; "Hapus akun" dipisah di kiri agar tidak tertekan tak sengaja
    const me = u.user_id === S.userId;
    const main = me ? [] : [
      u.status !== 'approved' && `<button type="button" class="btn small primary" data-sh="u-approved" data-id="${h(u.user_id)}">Setujui</button>`,
      u.status !== 'rejected' && `<button type="button" class="btn small" data-sh="u-rejected" data-id="${h(u.user_id)}">${u.status === 'approved' ? 'Cabut akses' : 'Tolak'}</button>`,
      u.status === 'approved' && `<button type="button" class="btn small" data-sh="u-admin" data-id="${h(u.user_id)}">${admins.includes(u.user_id) ? 'Cabut admin' : 'Jadikan admin'}</button>`,
    ].filter(Boolean);
    const del = !me && S.super ? `<button type="button" class="btn small danger" data-sh="u-delete" data-id="${h(u.user_id)}">Hapus akun</button>` : '';
    const btns = main.length || del ? `<div class="u-actions">${del}<span class="sp"></span>${main.join('')}</div>` : '';
    const names = masterNames();
    const cur = names.find(x => norm(x) === norm(u.petugas)) || u.petugas
      || (u.status === 'pending' ? names.find(x => norm(x) === norm(u.nama)) || '' : '');
    const link = u.status === 'rejected' ? '' : `<label class="u-link">Nama di jadwal
        <select data-uid="${h(u.user_id)}">${opt('', '— belum ditautkan —', cur)}${(cur && !names.includes(cur) ? [cur] : []).concat(names).map(n => opt(n, n, cur)).join('')}</select></label>`;
    return `<div class="urow u-card"><div class="mi"><span class="nm">${h(u.nama || '(tanpa nama)')}</span>${admins.includes(u.user_id) ? ' <span class="tag">Admin</span>' : ''}${me ? ' <span class="tag">Anda</span>' : ''}
      <div class="ad">${h(u.email)}</div><div class="ad">Daftar ${h(fmtShort(u.created_at.slice(0, 10)))}</div>
      ${u.wa ? `<div class="phones">${phoneLinks(u.wa)}</div>` : ''}${link}</div>${btns}</div>`;
  };
  const sec = (st, title) => {
    const l = list.filter(u => u.status === st);
    return l.length ? `<div class="sec-title">${title} <span class="count">${l.length}</span></div><div class="list">${l.map(row).join('')}</div>` : '';
  };
  const body = (sec('pending', 'Menunggu persetujuan') + sec('approved', 'Disetujui') + sec('rejected', 'Ditolak / dicabut')
    || '<div class="empty-state">Belum ada pengguna.</div>')
    + '<p class="hint">Sebelum <b>Setujui</b>, pilih "Nama di jadwal" untuk menautkan ke petugas yang sudah ada. Bila dibiarkan kosong, nama pendaftar ditambahkan ke Master petugas.</p>'
    + '<p class="hint">Yang disetujui bisa melihat jadwal & alamat umat (tanpa bisa mengubah). Admin bisa mengubah data paroki ini dan mengangkat admin lain lewat tombol Jadikan admin.</p>';
  openSheet('Pengguna', body, {
    onClick: async b => {
      if (b.dataset.sh === 'u-delete') {
        const u = list.find(x => x.user_id === b.dataset.id), who = u.nama || u.email;
        if (!confirm(`Hapus akun ${who} (${u.email}) secara permanen?

Orang ini tidak bisa login lagi; status admin & token notifikasinya ikut terhapus. Jadwal tidak berubah. Ia bisa mendaftar ulang bila perlu.`)) return;
        if (prompt(`Ketik HAPUS untuk menghapus akun ${who}`) !== 'HAPUS') { toast('Dibatalkan'); return; }
        if ((await run(() => store.deleteUser(u.user_id))) === false) return;
        toast(`Akun ${who} dihapus`);
        dlg.close(); await run(openUsers); return;
      }
      if (b.dataset.sh === 'u-admin') {
        const u = list.find(x => x.user_id === b.dataset.id), on = !admins.includes(u.user_id);
        if (!confirm(on ? `Jadikan ${u.nama || u.email} admin ${P.nama}? Admin bisa mengubah semua data paroki ini.` : `Cabut hak admin ${u.nama || u.email}?`)) return;
        if ((await run(() => store.setAdmin(u, on))) === false) return;
        toast(on ? 'Sekarang admin' : 'Hak admin dicabut');
        dlg.close(); await run(openUsers); return;
      }
      const st = { 'u-approved': 'approved', 'u-rejected': 'rejected' }[b.dataset.sh];
      if (!st) return;
      if (st === 'rejected' && !confirm('Tolak / cabut akses pengguna ini?')) return;
      if ((await run(() => store.setUserStatus(b.dataset.id, st))) === false) return;
      let msg = st === 'approved' ? 'Disetujui' : 'Akses dicabut';
      if (st === 'approved') {
        const bound = $(`.u-link select[data-uid="${b.dataset.id}"]`)?.value || '';
        const nama = await run(() => approveToMaster(list.find(u => u.user_id === b.dataset.id), bound));
        if (nama) msg += ` · ditautkan ke ${nama}`;
      }
      toast(msg);
      dlg.close(); await run(openUsers);
    },
  });
  $$('.u-link select').forEach(sel => sel.addEventListener('change', () => run(async () => {
    if (list.find(u => u.user_id === sel.dataset.uid)?.status === 'pending') return; // dipakai saat Setujui
    await store.setUserPetugas(sel.dataset.uid, sel.value);
    if (sel.dataset.uid === S.userId) S.me.petugas = sel.value;
    toast(sel.value ? `Ditautkan ke ${sel.value}` : 'Tautan dihapus');
  })));
}

/* ---- Notifikasi (Firebase Cloud Messaging) ---- */
const FB = CFG.FIREBASE || null; // { apiKey, authDomain, projectId, messagingSenderId, appId, vapidKey }
const FB_VER = '10.14.1';
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// unsupported | ios-install | blocked | on | off
function pushState() {
  if (!ONLINE || !FB?.vapidKey || !('serviceWorker' in navigator) || !('Notification' in window)) return 'unsupported';
  if (isIOS && !isStandalone()) return 'ios-install';
  if (!('PushManager' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return Notification.permission === 'granted' && lsGet('prodiakon.pushToken') ? 'on' : 'off';
}
const loadScript = src => new Promise((ok, fail) => {
  if ([...document.scripts].some(x => x.src === src)) return ok();
  const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = () => fail(new Error('Gagal memuat ' + src));
  document.head.appendChild(el);
});
async function fbMessaging() {
  await loadScript(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app-compat.js`);
  await loadScript(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-messaging-compat.js`);
  if (!firebase.apps.length) firebase.initializeApp(FB);
  return firebase.messaging();
}
async function enablePush() {
  const st = pushState();
  if (st === 'ios-install') throw new Error('Di iPhone: buka di Safari → Share → Add to Home Screen, lalu buka app dari ikon itu dan aktifkan notifikasi.');
  if (st === 'blocked') throw new Error('Notifikasi diblokir. Izinkan lewat pengaturan situs di browser, lalu coba lagi.');
  if (st === 'unsupported') throw new Error('Perangkat/browser ini belum mendukung notifikasi.');
  if (await Notification.requestPermission() !== 'granted') throw new Error('Izin notifikasi tidak diberikan.');
  const reg = await navigator.serviceWorker.ready;
  const token = await (await fbMessaging()).getToken({ vapidKey: FB.vapidKey, serviceWorkerRegistration: reg });
  if (!token) throw new Error('Gagal mendapatkan token notifikasi.');
  await store.registerPushToken(token);
  lsSet('prodiakon.pushToken', token);
}
async function disablePush() {
  const token = lsGet('prodiakon.pushToken');
  if (token) {
    await store.unregisterPushToken(token).catch(() => {});
    await (await fbMessaging()).deleteToken().catch(() => {});
  }
  lsSet('prodiakon.pushToken', '');
}
// Token bisa berubah sewaktu-waktu → segarkan diam-diam saat app dibuka (juga menautkan ke akun yang sedang login)
async function refreshPush() {
  if (pushState() !== 'on') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const token = await (await fbMessaging()).getToken({ vapidKey: FB.vapidKey, serviceWorkerRegistration: reg });
    if (token) { await store.registerPushToken(token); lsSet('prodiakon.pushToken', token); }
  } catch (e) { console.warn('refreshPush', e); }
}
const PUSH_TEXT = {
  on: '🔔 Notifikasi aktif di perangkat ini.',
  off: 'Notifikasi belum aktif di perangkat ini.',
  blocked: 'Notifikasi diblokir di browser. Izinkan lewat pengaturan situs.',
  'ios-install': 'Di iPhone, notifikasi hanya bisa setelah app dipasang: Safari → Share → Add to Home Screen.',
  unsupported: 'Perangkat/browser ini belum mendukung notifikasi.',
};
function pushBlock() {
  const st = pushState();
  if (!FB) return '';
  return `<div class="push-box" id="pushBox">
    <div><b>Notifikasi</b><div class="hint">${h(PUSH_TEXT[st])}</div>
      <div class="hint">Pengingat tugas H-1 pukul 18.00${S.admin ? ', pendaftar baru' : ''}, dan persetujuan akun.</div></div>
    ${st === 'on' ? '<button type="button" class="btn small" data-sh="push-off" data-act="push-off">Matikan</button>'
      : st === 'off' ? '<button type="button" class="btn small primary" data-sh="push-on" data-act="push-on">Aktifkan</button>' : ''}
  </div>`;
}
async function togglePush(on) {
  const ok = await run(async () => { await (on ? enablePush() : disablePush()); });
  if (ok === false) return;
  toast(on ? 'Notifikasi aktif' : 'Notifikasi dimatikan');
  const box = $('#pushBox'); if (box) box.outerHTML = pushBlock();
  if (S.tab === 'saya' && !dlg.open) render();
}

/* ---- Profil saya ---- */
function openProfile() {
  const me = S.me || {};
  const role = S.super ? 'Super admin' : S.admin ? `Admin ${P.nama}` : me.status === 'approved' ? 'Petugas (lihat saja)' : 'Menunggu persetujuan';
  const body = `
    <div class="profile-info">
      <div><span class="hint">Email</span><b>${h(me.email || '')}</b></div>
      <div><span class="hint">Paroki</span><b>${h(P.nama)}</b></div>
      <div><span class="hint">Peran</span><b>${h(role)}</b></div>
      <div><span class="hint">Nama di jadwal</span><b>${h(me.petugas || '— belum ditautkan admin —')}</b></div>
    </div>
    <label class="fld">Nama lengkap<input name="nama" required value="${h(me.nama || '')}" autocomplete="name"></label>
    <label class="fld">No. WA<input name="wa" type="tel" inputmode="tel" value="${h(me.wa || '')}" placeholder="08xxxxxxxxxx" autocomplete="tel"></label>
    <div class="fld">Ganti password <span class="hint">(kosongkan bila tidak diganti)</span></div>
    <div class="grid2">
      <label class="fld">Password baru<input name="pw1" type="password" minlength="6" autocomplete="new-password"></label>
      <label class="fld">Ulangi password<input name="pw2" type="password" minlength="6" autocomplete="new-password"></label>
    </div>
    <p class="hint">Email, paroki, peran, dan nama di jadwal diatur admin.${me.petugas ? ' No. WA ikut diperbarui di Master petugas.' : ''}</p>
    ${pushBlock()}`;
  openSheet('Profil saya', body, {
    onClick: b => { if (b.dataset.sh === 'push-on' || b.dataset.sh === 'push-off') togglePush(b.dataset.sh === 'push-on'); },
    save: async fd => {
      const nama = fd.get('nama').trim(), waIn = fd.get('wa').trim(), pw1 = fd.get('pw1'), pw2 = fd.get('pw2');
      const wa = waIn ? normWa(waIn) : '';
      if (!nama) throw new Error('Nama wajib diisi');
      if (waIn && !wa) throw new Error('No. WA tidak valid. Contoh: 081234567890');
      if (pw1 || pw2) {
        if (pw1.length < 6) throw new Error('Password minimal 6 karakter');
        if (pw1 !== pw2) throw new Error('Ulangi password tidak sama');
      }
      await store.updateMyProfile(nama, wa);
      if (pw1) await store.changePassword(pw1);
      S.me = { ...me, nama, wa };
      const pt = me.petugas && inMaster(me.petugas);
      if (pt && wa) setPetugas([...S.petugas.filter(x => x.id !== pt.id), { ...pt, telp: wa }]);
      render();
      toast(pw1 ? 'Profil & password tersimpan' : 'Profil tersimpan');
    },
  });
}

/* ---- Paroki ---- */
const HARI = { minggu: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, "jum'at": 5, sabtu: 6 };
const slotsToText = p => (p.misa_slots || []).map(x => `${x.key} | ${DAYS[x.day]} | ${x.time}${x.need ? ` | ${x.need}` : ''}`).join('\n');
const extraToText = p => (p.smk_extra || []).map(x => `${x.key} | ${x.label}`).join('\n');
function parseSlots(text) {
  const out = [];
  for (const [i, line] of String(text).split('\n').entries()) {
    if (!line.trim()) continue;
    const [key, hari, time, needTx = ''] = line.split('|').map(x => (x || '').trim());
    const day = HARI[norm(hari)];
    if (!key || day === undefined || !/^\d{1,2}[.:]\d{2}$/.test(time)) throw new Error(`Jam misa baris ${i + 1} tidak sesuai format "M1 | Sabtu | 17.30 | 14"`);
    if (needTx && !/^\d{1,3}$/.test(needTx)) throw new Error(`Jumlah petugas baris ${i + 1} harus angka`);
    if (key.toUpperCase() === 'LAIN') throw new Error('Kode "LAIN" sudah dipakai untuk misa khusus');
    out.push({ key: key.toUpperCase(), day, time: time.replace(':', '.'), need: Number(needTx) || 0 });
  }
  if (new Set(out.map(x => x.key)).size !== out.length) throw new Error('Kode jam misa ada yang dobel');
  return out;
}
function parseExtra(text) {
  return String(text).split('\n').filter(l => l.trim()).map((line, i) => {
    const [key, label] = line.split('|').map(x => (x || '').trim());
    if (!key || !label) throw new Error(`Slot hantaran baris ${i + 1} tidak sesuai format "PRIVAT | Privat (petugas tetap)"`);
    return { key: key.toUpperCase(), label };
  });
}
const parokiLink = p => `${location.origin}${location.pathname}?p=${encodeURIComponent(p.slug)}`;

// Tambah / ubah paroki. Admin paroki mengubah parokinya; slug & aktif hanya super admin.
function openParokiForm(p) {
  const isNew = !p;
  p = p ? structuredClone(p) : { slug: '', nama: '', kota: '', logo: '', misa_slots: DEFAULT_PAROKI.misa_slots, smk_extra: [], active: true };
  let logo = p.logo || '';
  const body = `
    <div class="logo-edit">
      <img id="logoPrev" src="${h(logo || 'icons/icon.svg')}" alt="Logo paroki" width="72" height="72">
      <div class="logo-btns">
        <div class="fld">Logo / gambar paroki</div>
        <label class="btn small">Pilih gambar…<input type="file" id="logoFile" accept="image/*" hidden></label>
        <button type="button" class="btn small" data-sh="logo-clear">Pakai ikon bawaan</button>
        <div class="hint">Otomatis diperkecil (maks. 256 px). Tampil di halaman login & header.</div>
      </div>
    </div>
    <label class="fld">Nama paroki (tampil sebagai "Prodiakon …")<input name="nama" required value="${h(p.nama)}" placeholder="St. Albertus"></label>
    <label class="fld">Kota / lokasi<input name="kota" value="${h(p.kota)}" placeholder="Harapan Indah, Bekasi"></label>
    ${S.super ? `<label class="fld">Kode link (huruf kecil, angka, tanda -)<input name="slug" required value="${h(p.slug)}" placeholder="albertus" pattern="[a-z0-9\\-]+"></label>
      <label><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Aktif (bisa dipilih saat daftar)</label>` : ''}
    ${p.slug ? `<p class="hint">Link paroki: <b>${h(parokiLink(p))}</b></p>` : ''}
    <label class="fld">Jam misa rutin (satu per baris: Kode | Hari | Jam | Jumlah petugas)<textarea name="slots" rows="5">${h(slotsToText(p))}</textarea></label>
    <label><input type="checkbox" name="auto_month" ${p.auto_month === true ? 'checked' : ''}> Buat jadwal bulan depan otomatis (mulai tanggal ${AUTO_MONTH_DAY} tiap bulan, saat admin membuka app)</label>
    <label class="fld">Slot hantaran tambahan di luar jam misa (Kode | Nama)<textarea name="extra" rows="3">${h(extraToText(p))}</textarea></label>
    <p class="hint">Contoh: <code>M1 | Sabtu | 17.30 | 14</code> (14 = jumlah petugas dibutuhkan, boleh dikosongkan).
      Mengubah jam misa tidak mengubah jadwal yang sudah dibuat; berlaku untuk bulan berikutnya.</p>`;
  openSheet(isNew ? 'Paroki baru' : `Pengaturan ${p.nama}`, body, {
    save: async fd => {
      const row = {
        ...(p.id ? { id: p.id } : {}), nama: fd.get('nama').trim(), kota: fd.get('kota').trim(),
        slug: S.super ? fd.get('slug').trim().toLowerCase() : p.slug,
        active: S.super ? !!fd.get('active') : p.active,
        misa_slots: parseSlots(fd.get('slots')), smk_extra: parseExtra(fd.get('extra')), auto_month: !!fd.get('auto_month'), logo,
      };
      if (!row.nama) throw new Error('Nama paroki wajib diisi');
      if (!/^[a-z0-9-]+$/.test(row.slug)) throw new Error('Kode link hanya huruf kecil, angka, dan tanda -');
      if (!ONLINE) { applyParoki({ ...P, ...row }); render(); toast('Tersimpan (mode lokal)'); return; }
      const saved = await store.saveParoki(row);
      S.parokiList = [...S.parokiList.filter(x => x.id !== saved.id), saved].sort((a, b) => a.nama.localeCompare(b.nama));
      if (saved.id === P.id) { applyParoki(saved); render(); }
      toast(isNew ? `Paroki ${saved.nama} dibuat` : 'Tersimpan');
    },
    onClick: b => { if (b.dataset.sh === 'logo-clear') { logo = ''; $('#logoPrev').src = 'icons/icon.svg'; } },
  });
  $('#logoFile').addEventListener('change', e => run(async () => {
    const file = e.target.files[0];
    if (!file) return;
    logo = await shrinkImage(file, 256);
    $('#logoPrev').src = logo;
    toast(`Logo siap (${Math.round(logo.length / 1024)} KB) — tekan Simpan`);
  }));
}

// Perkecil gambar di browser (sisi terpanjang ≤ max px) → data URL WebP, agar ringan disimpan.
// photo: true → cadangan JPEG (untuk banner foto; Safari tidak bisa menyimpan WebP), kualitas diturunkan bila masih besar.
async function shrinkImage(file, max, { limit = 200000, photo = false } = {}) {
  if (!file.type.startsWith('image/')) throw new Error('File harus berupa gambar');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('Gambar tidak bisa dibaca')); i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext('2d');
    if (photo) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); } // JPEG tidak punya transparansi
    ctx.drawImage(img, 0, 0, c.width, c.height);
    let out = '';
    for (const qv of [0.85, 0.72, 0.6, 0.48]) {
      out = c.toDataURL('image/webp', qv);
      if (!out.startsWith('data:image/webp')) out = photo ? c.toDataURL('image/jpeg', qv) : c.toDataURL('image/png');
      if (out.length <= limit || (!photo && !out.startsWith('data:image/webp'))) break;
    }
    if (out.length > limit) throw new Error('Gambar terlalu besar setelah diperkecil, coba gambar lain');
    return out;
  } finally { URL.revokeObjectURL(url); }
}

/* ---- Wilayah & lingkungan ---- */
const sortedWilayah = () => [...S.wilayah].sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0) || a.nama.localeCompare(b.nama));
const lingOf = name => (name ? S.lingkungan.find(l => norm(l.nama) === norm(name)) : null);
const wilayahOfLing = name => { const l = lingOf(name); return l ? S.wilayah.find(w => w.id === l.wilayah_id) || null : null; };
// Wilayah umat dalam satu grup hantaran (unik, urut)
function groupWilayah(g) {
  const ids = new Set(mem(g).map(m => wilayahOfLing(m.lingkungan)?.id).filter(Boolean));
  return sortedWilayah().filter(w => ids.has(w.id));
}
// Nama dasar wilayah dari nama lingkungan: "Theresia 2" → "Theresia", "Felisitas 1A" → "Felisitas"
const baseWilayah = name => String(name).trim().replace(/\s+\d+[A-Za-z]?$/, '').trim() || String(name).trim();
// <option> lingkungan dikelompokkan per wilayah
function lingkunganOpts(cur) {
  const groups = sortedWilayah().map(w => [w.nama, S.lingkungan.filter(l => l.wilayah_id === w.id)]);
  const none = S.lingkungan.filter(l => !S.wilayah.some(w => w.id === l.wilayah_id));
  if (none.length) groups.push(['Tanpa wilayah', none]);
  const found = lingOf(cur);
  const extra = cur && !found ? opt(cur, `${cur} (bukan dari master)`, cur) : '';
  return opt('', '— pilih lingkungan —', cur ? null : '') + extra + groups.filter(([, ls]) => ls.length).map(([wn, ls]) =>
    `<optgroup label="${h(wn)}">${ls.sort((a, b) => a.nama.localeCompare(b.nama, 'id', { numeric: true }))
      .filter(l => l.active || l === found).map(l => opt(l.nama, l.nama, found?.nama)).join('')}</optgroup>`).join('');
}

// Lingkungan yang dipakai umat tapi belum ada di master → dibuat, dikelompokkan ke wilayah sesuai nama depannya
async function syncLingkungan() {
  const names = [...new Map(S.umat.filter(u => (u.lingkungan || '').trim()).map(u => [norm(u.lingkungan), u.lingkungan.trim()])).values()];
  const missing = names.filter(n => !lingOf(n));
  if (!missing.length) return 0;
  const newW = [];
  const wOf = n => { const b = baseWilayah(n); return [...S.wilayah, ...newW].find(w => norm(w.nama) === norm(b)) || (newW.push({ id: uid(), nama: b, urutan: 0, active: true }), newW.at(-1)); };
  const newL = missing.map(n => ({ id: uid(), nama: n, wilayah_id: wOf(n).id, active: true }));
  if (newW.length) await store.upsert('wilayah', newW);
  await store.upsert('lingkungan', newL);
  S.wilayah = [...S.wilayah, ...newW]; S.lingkungan = [...S.lingkungan, ...newL];
  return newL.length;
}

function renderWilayah(main, bar) {
  const umatIn = l => S.umat.filter(u => u.active && norm(u.lingkungan) === norm(l.nama)).length;
  const lingChip = l => `<span class="chip${S.admin ? ' tap' : ''}${l.active ? '' : ' off'}" ${S.admin ? `data-act="edit-ling" data-id="${h(l.id)}"` : ''}>${h(l.nama)} <small>${umatIn(l)}</small></span>`;
  const card = (title, ls, w) => {
    const total = ls.reduce((a, l) => a + umatIn(l), 0);
    return `<article class="card"><div class="c-head">
        <span class="t">${h(title)}</span><span class="sub">${ls.length} lingkungan · ${total} umat</span>
        ${S.admin && w ? `<button class="btn small" style="margin-left:auto" data-act="edit-wil" data-id="${h(w.id)}">Ubah</button>` : ''}
      </div><div class="c-body"><div class="chips">${ls.sort((a, b) => a.nama.localeCompare(b.nama, 'id', { numeric: true })).map(lingChip).join('') || '<span class="count">Belum ada lingkungan</span>'}
        ${S.admin && w ? `<span class="chip add tap" data-act="new-ling" data-k="${h(w.id)}">＋ lingkungan</span>` : ''}</div></div></article>`;
  };
  const none = S.lingkungan.filter(l => !S.wilayah.some(w => w.id === l.wilayah_id));
  main.innerHTML = bar + (S.wilayah.length || S.lingkungan.length
    ? sortedWilayah().map(w => card(w.nama + (w.active ? '' : ' (nonaktif)'), S.lingkungan.filter(l => l.wilayah_id === w.id), w)).join('')
      + (none.length ? card('Tanpa wilayah', none, null) : '')
    : `<div class="empty-state">Belum ada wilayah.${S.admin ? ' Tekan ＋ untuk menambah lingkungan, atau isi lingkungan di data umat.' : ''}</div>`)
    + (S.admin ? '<div class="btns" style="margin-top:10px"><button class="btn" data-act="new-wil">＋ Wilayah baru</button></div>' : '')
    + '<p class="hint" style="margin:8px 2px">Angka di tiap lingkungan = jumlah umat aktif.</p>';
}

function openWilayahForm(w) {
  const isNew = !w;
  w = w ? { ...w } : { id: uid(), nama: '', urutan: 0, active: true };
  const ls = S.lingkungan.filter(l => l.wilayah_id === w.id);
  const body = `
    <label class="fld">Nama wilayah<input name="nama" required maxlength="60" value="${h(w.nama)}" placeholder="Theresia"></label>
    <div class="grid2">
      <label class="fld">Urutan (kecil tampil dulu)<input type="number" name="urutan" value="${w.urutan ?? 0}"></label>
      <label style="align-self:end"><input type="checkbox" name="active" ${w.active ? 'checked' : ''}> Aktif</label>
    </div>
    ${isNew ? '' : `<p class="hint">Lingkungan: ${ls.length ? h(ls.map(l => l.nama).join(', ')) : '—'}. Untuk memindahkan lingkungan, buka lingkungannya lalu ganti wilayah.</p>`}`;
  openSheet(isNew ? 'Wilayah baru' : `Ubah wilayah ${w.nama}`, body, {
    save: async fd => {
      const row = { ...w, nama: fd.get('nama').trim().replace(/\s+/g, ' '), urutan: Number(fd.get('urutan')) || 0, active: !!fd.get('active') };
      if (!row.nama) throw new Error('Nama wilayah wajib diisi');
      if (S.wilayah.some(x => x.id !== row.id && norm(x.nama) === norm(row.nama))) throw new Error(`Wilayah "${row.nama}" sudah ada`);
      await store.upsert('wilayah', [row]);
      S.wilayah = [...S.wilayah.filter(x => x.id !== row.id), row];
      render(); toast('Tersimpan');
    },
    del: isNew ? null : async () => {
      if (ls.length) throw new Error(`Masih ada ${ls.length} lingkungan di wilayah ini. Pindahkan ke wilayah lain dulu.`);
      await store.remove('wilayah', w.id);
      S.wilayah = S.wilayah.filter(x => x.id !== w.id); render(); toast('Wilayah dihapus');
    },
  });
}

function openLingkunganForm(l = {}) {
  const isNew = !l.id;
  l = { id: uid(), nama: '', wilayah_id: '', active: true, ...l };
  const used = isNew ? [] : S.umat.filter(u => norm(u.lingkungan) === norm(l.nama));
  const body = `
    <label class="fld">Nama lingkungan<input name="nama" required maxlength="60" value="${h(l.nama)}" placeholder="Theresia 1"></label>
    <label class="fld">Wilayah<select name="wilayah_id">${opt('', '— tanpa wilayah —', l.wilayah_id || '')}${sortedWilayah().map(w => opt(w.id, w.nama, l.wilayah_id)).join('')}</select></label>
    <label><input type="checkbox" name="active" ${l.active ? 'checked' : ''}> Aktif (bisa dipilih di data umat)</label>
    ${isNew ? '' : `<p class="hint">${used.length} umat di lingkungan ini. Mengganti nama ikut mengganti lingkungan di data umat tersebut.</p>`}`;
  openSheet(isNew ? 'Lingkungan baru' : `Ubah lingkungan ${l.nama}`, body, {
    save: async fd => {
      const row = { ...l, nama: fd.get('nama').trim().replace(/\s+/g, ' '), wilayah_id: fd.get('wilayah_id') || null, active: !!fd.get('active') };
      if (!row.nama) throw new Error('Nama lingkungan wajib diisi');
      if (S.lingkungan.some(x => x.id !== row.id && norm(x.nama) === norm(row.nama))) throw new Error(`Lingkungan "${row.nama}" sudah ada`);
      await store.upsert('lingkungan', [row]);
      if (!isNew && row.nama !== l.nama && used.length) {
        const changed = used.map(u => ({ ...u, lingkungan: row.nama }));
        await store.upsert('umat', changed);
        setUmat(S.umat.map(u => changed.find(c => c.id === u.id) || u));
      }
      S.lingkungan = [...S.lingkungan.filter(x => x.id !== row.id), row];
      render(); toast('Tersimpan');
    },
    del: isNew ? null : async () => {
      if (used.length) throw new Error(`Masih dipakai ${used.length} umat. Pindahkan umatnya dulu, atau tandai lingkungan tidak aktif.`);
      await store.remove('lingkungan', l.id);
      S.lingkungan = S.lingkungan.filter(x => x.id !== l.id); render(); toast('Lingkungan dihapus');
    },
  });
}

/* ---- Wilayah petugas & hantaran ---- */
const petugasWilayah = p => (p?.wilayah_id ? S.wilayah.find(w => w.id === p.wilayah_id) || null : null);
// Pilihan petugas hantaran: wilayah yang sama dulu; wilayah lain tidak bisa dipilih; berhalangan ikut dikunci
// Pilihan petugas hantaran: default HANYA wilayah yang sama dengan umat grup itu.
// otherWil = true → petugas wilayah lain & yang wilayahnya belum diatur ikut ditampilkan (boleh dipilih).
// Petugas yang sedang dipilih tetap tampil walau di luar wilayah, agar tidak hilang diam-diam.
function hantaranOpts(cur, wil, date, slot = '', otherWil = false) {
  const ids = new Set(wil.map(w => w.id));
  // aktif & tersedia pada tanggal/slot itu; yang sudah terpilih tetap tampil (diberi tanda)
  const all = S.petugas.filter(p => norm(p.nama) === norm(cur) || (p.active && !unavailable(p.nama, date, slot)))
    .sort((a, b) => a.nama.localeCompare(b.nama));
  const one = p => {
    const off = unavailable(p.nama, date, slot), sel = norm(p.nama) === norm(cur);
    const pw = petugasWilayah(p), outside = ids.size && !ids.has(p.wilayah_id);
    const why = off || (outside ? (pw ? `wilayah ${pw.nama}` : 'wilayah belum diatur') : '');
    return `<option value="${h(p.nama)}" ${sel ? 'selected' : ''}>${off ? '🚫 ' : ''}${h(p.nama)}${why ? ` (${h(why)})` : ''}</option>`;
  };
  const grp = (label, list) => (list.length ? `<optgroup label="${h(label)}">${list.map(one).join('')}</optgroup>` : '');
  const extra = cur && !all.some(p => norm(p.nama) === norm(cur)) ? opt(cur, `${cur} (bukan dari master)`, cur) : '';
  const head = opt('', '— kosong —', cur ? null : '') + extra;
  if (!ids.size) return head + grp('Semua petugas (umat grup ini belum punya wilayah)', all);
  const same = all.filter(p => ids.has(p.wilayah_id));
  const rest = all.filter(p => !ids.has(p.wilayah_id));
  const curOut = rest.filter(p => norm(p.nama) === norm(cur));
  if (!otherWil) return head + grp(`Wilayah ${wil.map(w => w.nama).join(', ')}`, same) + grp('Terpilih (di luar wilayah)', curOut);
  return head + grp(`Wilayah ${wil.map(w => w.nama).join(', ')}`, same)
    + grp('Wilayah lain', rest.filter(p => petugasWilayah(p)))
    + grp('Wilayah belum diatur', rest.filter(p => !petugasWilayah(p)));
}
// Petugas hantaran tiap minggu → ditambahkan ke misa rutin pada hari & jam yang sama
async function addHantaranToMisa(g) {
  if (!REGULAR.includes(g.slot)) return { added: 0, noMisa: 0 };
  let added = 0, noMisa = 0;
  const changed = new Map();
  g.officers.forEach((n, i) => {
    if (!n || n === '-') return;
    const lm = linkedMisa(g.slot, i);
    if (!lm) { noMisa++; return; }
    const m = changed.get(lm.id) || { ...lm, officers: [...lm.officers] };
    if (!m.officers.some(x => norm(x) === norm(n))) { m.officers.push(n); added++; changed.set(m.id, m); }
  });
  if (changed.size) {
    await store.upsert('misa', [...changed.values()]);
    S.misa = S.misa.map(m => changed.get(m.id) || m);
  }
  return { added, noMisa };
}
// Isi wilayah petugas yang kosong dari grup hantaran yang paling sering dilayani (bulan aktif); seri → dibiarkan
async function autoPetugasWilayah() {
  const count = new Map();
  for (const g of S.smk) {
    const gw = groupWilayah(g);
    if (gw.length !== 1) continue; // grup campuran tidak dipakai sebagai acuan
    for (const n of g.officers) {
      const p = n && inMaster(n);
      if (!p || petugasWilayah(p)) continue;
      const c = count.get(p.id) || {}; c[gw[0].id] = (c[gw[0].id] || 0) + 1; count.set(p.id, c);
    }
  }
  const rows = [];
  for (const [pid, c] of count) {
    const top = Object.entries(c).sort((a, b) => b[1] - a[1]);
    if (top.length > 1 && top[0][1] === top[1][1]) continue;
    rows.push({ ...S.petugas.find(p => p.id === pid), wilayah_id: top[0][0] });
  }
  if (!rows.length) { toast('Tidak ada petugas yang bisa diisi otomatis dari hantaran bulan ini'); return; }
  await store.upsert('petugas', rows);
  setPetugas(S.petugas.map(p => rows.find(r => r.id === p.id) || p));
  render();
  const left = S.petugas.filter(p => p.active && !petugasWilayah(p)).length;
  toast(`${rows.length} petugas diisi wilayahnya${left ? ` · ${left} belum (atur manual)` : ''}`);
}

/* ---- Poster jadwal misa (PNG / PDF untuk WhatsApp) ---- */
const loadImg = src => new Promise(ok => { if (!src) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
// Warna teks yang terbaca di atas warna liturgi
const LIT_TEXT = { putih: '#334155', '': '#3f3f00' };

async function drawMisaPoster(m) {
  const W = 1080, PAD = 64;
  const col = COLORS[m.color] || COLORS[''];
  const koor = norm(m.coordinator);
  const offs = [...m.officers].sort((a, b) => (norm(b) === koor) - (norm(a) === koor));
  const hant = hantaranOfMisa(m);
  const logo = await loadImg(P.logo || 'icons/icon-192.png');
  const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const font = (wt, px) => `${wt} ${px}px ${FONT}`;
  // ukur tinggi dulu
  const cols = 2, rowH = 70, rows = Math.max(1, Math.ceil(offs.length / cols));
  const hantH = hant.length ? 90 + hant.length * 56 : 0;
  const noteH = m.note ? 90 : 0;
  const H = 360 + 330 + 90 + rows * rowH + 40 + hantH + noteH + 150; // sama dengan urutan gambar di bawah
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rr = (x, y, w, hh, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, hh, r) : g.rect(x, y, w, hh); };
  const fit = (text, max, f) => { g.font = f; let t = String(text); while (t.length > 1 && g.measureText(t).width > max) t = t.slice(0, -2) + '…'; return t; };

  // latar
  g.fillStyle = '#f5f2ea'; g.fillRect(0, 0, W, H);
  // header
  const grd = g.createLinearGradient(0, 0, W, 300); grd.addColorStop(0, '#14532d'); grd.addColorStop(1, '#166534');
  g.fillStyle = grd; g.fillRect(0, 0, W, 300);
  g.globalAlpha = .08; g.fillStyle = '#fff';
  for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(W - 120 + i * 10, -40 + i * 60, 160 - i * 18, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
  if (logo) { g.save(); g.beginPath(); g.arc(PAD + 70, 150, 70, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.clip(); g.drawImage(logo, PAD + 10, 90, 120, 120); g.restore(); }
  const tx = logo ? PAD + 170 : PAD;
  g.fillStyle = 'rgba(255,255,255,.75)'; g.font = font(600, 30); g.fillText('JADWAL PETUGAS PRODIAKON', tx, 120);
  g.fillStyle = '#fff'; g.fillText(fit(P.nama, W - tx - PAD, font(800, 64)), tx, 192);
  if (P.kota) { g.fillStyle = 'rgba(255,255,255,.8)'; g.font = font(400, 30); g.fillText(fit(P.kota, W - tx - PAD, font(400, 30)), tx, 240); }
  // garis warna liturgi
  g.fillStyle = col[1]; g.fillRect(0, 300, W, 18);

  // kartu misa
  let y = 360;
  g.fillStyle = '#fff'; rr(PAD - 16, y - 20, W - 2 * PAD + 32, 300, 28); g.fill();
  g.fillStyle = '#64748b'; g.font = font(600, 30);
  g.fillText(m.slot === 'LAIN' ? 'MISA KHUSUS' : `MISA ${m.slot}`, PAD + 16, y + 30);
  g.fillStyle = '#0f172a'; g.fillText(fit(fmtLong(m.date) + ' ' + parseD(m.date).getFullYear(), W - 2 * PAD - 32, font(800, 58)), PAD + 16, y + 110);
  g.fillStyle = '#14532d'; g.fillText(fit(m.title || slotLabel(m.slot), W - 2 * PAD - 32, font(700, 40)), PAD + 16, y + 170);
  g.fillStyle = '#334155'; g.font = font(500, 34);
  g.fillText(fit([m.time && `Pukul ${m.time}`, m.place].filter(Boolean).join('  ·  ') || ' ', W - 2 * PAD - 260, font(500, 34)), PAD + 16, y + 230);
  if (m.color) { // label warna liturgi
    g.font = font(700, 28); const lw = g.measureText(col[0]).width + 48;
    g.fillStyle = col[1]; rr(W - PAD - lw - 16, y + 196, lw, 48, 24); g.fill();
    g.fillStyle = LIT_TEXT[m.color] || '#fff'; g.fillText(col[0], W - PAD - lw + 8, y + 230);
  }
  y += 330;

  // petugas
  g.fillStyle = '#14532d'; g.font = font(800, 38); g.fillText(`Petugas (${offs.length}${m.need ? `/${m.need}` : ''})`, PAD, y + 40);
  y += 90;
  const cw = (W - 2 * PAD) / cols;
  offs.forEach((n, i) => {
    const cx = PAD + (i % cols) * cw, cy = y + Math.floor(i / cols) * rowH;
    const isK = norm(n) === koor;
    g.fillStyle = isK ? '#fef3c7' : '#fff'; rr(cx, cy, cw - 20, rowH - 14, 16); g.fill();
    g.fillStyle = isK ? '#b45309' : '#14532d'; g.beginPath(); g.arc(cx + 34, cy + (rowH - 14) / 2, 20, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = font(700, 22); g.textAlign = 'center'; g.fillText(isK ? '★' : String(i + (koor && offs.some(x => norm(x) === koor) ? 0 : 1)), cx + 34, cy + (rowH - 14) / 2 + 8); g.textAlign = 'left';
    g.fillStyle = '#0f172a'; g.fillText(fit(n + (isK ? ' (koordinator)' : ''), cw - 110, font(isK ? 700 : 500, 30)), cx + 70, cy + (rowH - 14) / 2 + 11);
  });
  if (!offs.length) { g.fillStyle = '#94a3b8'; g.font = font(500, 30); g.fillText('Belum ada petugas', PAD, y + 40); }
  y += rows * rowH + 40;

  // hantaran
  if (hant.length) {
    g.fillStyle = '#14532d'; g.font = font(800, 38); g.fillText('Hantaran setelah misa', PAD, y + 40);
    y += 90;
    for (const { g: grp, n } of hant) {
      const wil = groupWilayah(grp).map(w => w.nama).join(', ');
      g.fillStyle = '#0f172a'; g.font = font(700, 30); const nm = fit(n, 420, font(700, 30)); g.fillText(nm, PAD, y + 34);
      const nw = g.measureText(nm).width;
      g.fillStyle = '#475569'; g.font = font(400, 30);
      g.fillText(fit(`→ Grup ${grp.no}${wil ? ` · ${wil}` : ''} · ${mem(grp).length} umat`, W - 2 * PAD - nw - 20, font(400, 30)), PAD + nw + 16, y + 34);
      y += 56;
    }
  }
  if (m.note) { g.fillStyle = '#334155'; g.font = font(500, 30); g.fillText(fit('Catatan: ' + m.note, W - 2 * PAD, font(500, 30)), PAD, y + 50); y += noteH; }

  // footer
  g.fillStyle = '#14532d'; g.fillRect(0, H - 110, W, 110);
  g.fillStyle = 'rgba(255,255,255,.7)'; g.font = font(400, 24); g.textAlign = 'right';
  g.fillText(`Dibuat ${fmtShort(todayIso())}`, W - PAD, H - 48); g.textAlign = 'left';
  return c;
}

async function openMisaPoster(m) {
  const c = await drawMisaPoster(m);
  const url = c.toDataURL('image/png');
  const fname = `jadwal-${(m.slot === 'LAIN' ? 'misa' : m.slot).toLowerCase()}-${m.date}`;
  const body = `<img class="poster-prev" src="${url}" alt="Poster jadwal misa">
    <div class="btns poster-btns">
      <button type="button" class="btn primary" data-sh="ps-share">📤 Bagikan (WhatsApp)</button>
      <button type="button" class="btn" data-sh="ps-png">⬇️ Unduh PNG</button>
      <button type="button" class="btn" data-sh="ps-pdf">📄 Unduh PDF</button>
    </div>
    <p class="hint">Alamat & nomor umat tidak ditampilkan di gambar.</p>`;
  const blob = () => new Promise(ok => c.toBlob(ok, 'image/png'));
  openSheet(misaTitle(m), body, {
    onClick: b => run(async () => {
      if (b.dataset.sh === 'ps-png') { const a = document.createElement('a'); a.href = url; a.download = fname + '.png'; a.click(); }
      else if (b.dataset.sh === 'ps-pdf') await downloadPosterPdf(c, fname);
      else if (b.dataset.sh === 'ps-share') {
        const file = new File([await blob()], fname + '.png', { type: 'image/png' });
        const text = `Jadwal petugas ${misaTitle(m)} – Prodiakon ${P.nama}`;
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text }).catch(e => { if (e.name !== 'AbortError') throw e; });
        else { const a = document.createElement('a'); a.href = url; a.download = fname + '.png'; a.click(); toast('Perangkat ini belum bisa berbagi gambar langsung — gambar diunduh, lalu kirim lewat WhatsApp'); }
      }
    }),
  });
}

/* ---- Laporan bulanan (PDF): jadwal tugas prodiakon & daftar hantaran ---- */
async function loadPdfLib() {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
  return window.jspdf.jsPDF;
}
// Data bulan ym (bulan yang sedang dibuka memakai data di layar)
async function reportData(ym) {
  const month = S.months.find(m => m.id === ym);
  if (ym === S.monthId) return { month, misa: S.misa, smk: S.smk };
  const [misa, smk] = await Promise.all([store.list('misa', ym), store.list('smk_groups', ym)]);
  return { month, misa, smk: smk.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)) };
}
// Misa slot rutin pada akhir pekan ke-i bulan ym (dicocokkan dengan tanggal, Senin–Minggu)
function misaOfWeek(misa, ym, slot, i) {
  const sun = weekendsOf(ym)[i]?.sun;
  if (!sun) return null;
  const from = parseD(sun); from.setDate(from.getDate() - 6);
  return misa.filter(m => m.slot === slot).find(m => m.date >= iso(from) && m.date <= sun) || null;
}
const monthShort = ym => { const [y, mo] = ym.split('-').map(Number); return `${MON3[mo - 1]}-${String(y).slice(2)}`; };
function pdfFooter(doc) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`Prodiakon ${P.nama} · dicetak ${fmtShort(todayIso())}`, 10, doc.internal.pageSize.getHeight() - 6);
    doc.text(`Hal. ${i}/${n}`, doc.internal.pageSize.getWidth() - 10, doc.internal.pageSize.getHeight() - 6, { align: 'right' });
  }
}

// 1) Jadwal tugas prodiakon: satu tabel per jam misa, kolom per akhir pekan, koordinator biru tebal
async function reportJadwal(ym) {
  const jsPDF = await loadPdfLib();
  const { misa } = await reportData(ym);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = weekendsOf(ym);
  const GREEN = [146, 208, 80], KOOR = [184, 204, 228];
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(0);
  doc.text('JADWAL TUGAS PRODIAKON', 10, 14);
  doc.text(monthShort(ym), doc.internal.pageSize.getWidth() - 10, 14, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(`Paroki ${P.nama}${P.kota ? ' – ' + P.kota : ''}`, 10, 19);
  let y = 23;
  for (const k of REGULAR) {
    const cols = W.map((_, i) => misaOfWeek(misa, ym, k, i));
    if (!cols.some(Boolean)) continue;
    const sl = slotByKey(k);
    const dayName = DAYS[sl.day].toUpperCase();
    const head = [
      ['', ...cols.map((m, i) => m ? `TGL. ${parseD(m.date).getDate()} ${MON3[parseD(m.date).getMonth()].toUpperCase()} - ${DAYS[parseD(m.date).getDay()].toUpperCase()}` : `${W[i].label} - ${dayName}`)],
      ['', ...cols.map(m => `WARNA LITURGI : ${m ? (COLORS[m.color] || COLORS[''])[0].toUpperCase() : '-'}`)],
      ['', ...cols.map(m => (m?.title || '-').toUpperCase())],
      ['', ...cols.map(m => `${k} - PK. ${m?.time || sl.time}`)],
    ];
    const n = Math.max(1, ...cols.map(m => Math.max(m?.officers.length || 0, m?.need || 0)));
    // urutan sesuai jadwal (seperti Excel); koordinator ditandai biru tebal di posisinya
    const lists = cols.map(m => (m ? [...m.officers] : []));
    const body = Array.from({ length: n }, (_, r) => [String(r + 1), ...lists.map(l => l[r] || '')]);
    doc.autoTable({
      startY: y, head, body, theme: 'grid', margin: { left: 10, right: 10 },
      styles: { fontSize: 8, cellPadding: 0.9, halign: 'center', lineColor: [140, 140, 140], lineWidth: 0.1, textColor: 20 },
      headStyles: { fillColor: GREEN, textColor: 0, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: { cellWidth: 8, halign: 'right', textColor: 90 } },
      didParseCell: d => {
        if (d.section !== 'body' || d.column.index === 0) return;
        const m = cols[d.column.index - 1];
        if (m && d.cell.raw && norm(d.cell.raw) === norm(m.coordinator)) { d.cell.styles.fillColor = KOOR; d.cell.styles.fontStyle = 'bold'; }
      },
    });
    y = doc.lastAutoTable.finalY + 6;
  }
  // misa khusus / lainnya
  const lain = misa.filter(m => m.slot === 'LAIN').sort(cmpMisa);
  if (lain.length) {
    doc.autoTable({
      startY: y, theme: 'grid', margin: { left: 10, right: 10 },
      head: [['TANGGAL', 'MISA', 'JAM', 'TEMPAT', 'KOORDINATOR', 'PETUGAS']],
      body: lain.map(m => [fmtShort(m.date), m.title || '-', m.time || '', m.place || '', m.coordinator || '', m.officers.filter(o => norm(o) !== norm(m.coordinator)).join(', ')]),
      styles: { fontSize: 8, cellPadding: 1, lineColor: [140, 140, 140], lineWidth: 0.1, textColor: 20 },
      headStyles: { fillColor: GREEN, textColor: 0, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 45 }, 2: { cellWidth: 14 }, 3: { cellWidth: 28 }, 4: { cellWidth: 32 } },
    });
  }
  pdfFooter(doc);
  doc.save(`jadwal-prodiakon-${ym}.pdf`);
}

// 2) Daftar petugas prodiakon layanan hantaran: per jam layanan, kolom petugas tiap minggu + data umat
async function reportHantaran(ym) {
  const jsPDF = await loadPdfLib();
  const { month, smk } = await reportData(ym);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const weeksL = month?.weeks?.length ? month.weeks : weekendsOf(ym).map(w => w.label);
  const ORANGE = [255, 192, 0], BLUE = [0, 176, 240];
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(0);
  doc.text('DAFTAR PETUGAS PRODIAKON LAYANAN HANTARAN', 10, 13);
  doc.setFontSize(10); doc.text(`BULAN  ${monthName(ym).toUpperCase()}`, 10, 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(`Paroki ${P.nama}${P.kota ? ' – ' + P.kota : ''}`, doc.internal.pageSize.getWidth() - 10, 13, { align: 'right' });
  const nW = weeksL.length, nCol = 2 + nW + 4;
  const head = [
    [{ content: 'NO.', rowSpan: 2 }, 'JAM', { content: 'TANGGAL', colSpan: nW }, { content: 'DAFTAR UMAT LAYANAN HANTARAN', colSpan: 4 }],
    ['LAYANAN', ...weeksL, 'NAMA', 'LINGKUNGAN', 'ALAMAT', 'TELP / HP / WA'],
  ];
  const body = [];
  for (const sl of SMK_SLOTS) {
    const groups = smk.filter(g => g.slot === sl.key);
    if (!groups.length) continue;
    body.push([{ content: sl.label.toUpperCase(), colSpan: nCol, styles: { fillColor: BLUE, fontStyle: 'bold', halign: 'center', textColor: 0 } }]);
    for (const g of groups) {
      const ms = mem(g).length ? mem(g) : [{}];
      const jam = REGULAR.includes(g.slot) ? `${DAYS[slotByKey(g.slot).day].toUpperCase()} ${slotByKey(g.slot).time}` : sl.label;
      ms.forEach((m, i) => body.push([
        i ? '' : String(g.no), i ? '' : jam, ...weeksL.map((_, j) => (i ? '' : g.officers[j] || '')),
        m.nama || '', m.lingkungan || '', m.alamat || '', m.telp || '',
      ]));
    }
  }
  doc.autoTable({
    startY: 22, head, body, theme: 'grid', margin: { left: 8, right: 8 },
    styles: { fontSize: 7, cellPadding: 0.8, lineColor: [150, 150, 150], lineWidth: 0.1, textColor: 20, valign: 'middle' },
    headStyles: { fillColor: ORANGE, textColor: 0, fontStyle: 'bold', halign: 'center' },
    columnStyles: Object.assign({ 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 20, halign: 'center' } },
      Object.fromEntries(weeksL.map((_, j) => [2 + j, { cellWidth: 21, halign: 'center' }])),
      { [2 + nW]: { cellWidth: 42 }, [3 + nW]: { cellWidth: 20, halign: 'center' }, [5 + nW]: { cellWidth: 30 } }),
  });
  pdfFooter(doc);
  doc.save(`hantaran-${ym}.pdf`);
}

function openReports() {
  const body = `
    <label class="fld">Bulan<select name="ym">${S.months.map(m => opt(m.id, monthName(m.id), S.monthId)).join('')}</select></label>
    <div class="menu-list">
      <button type="button" data-sh="rp-jadwal">📅 Jadwal tugas prodiakon (per jam misa, per minggu)</button>
      <button type="button" data-sh="rp-hantaran">🕊️ Daftar petugas layanan hantaran (dengan alamat umat)</button>
    </div>
    <p class="hint">PDF A4 landscape, siap cetak atau dikirim. Laporan hantaran memuat alamat & nomor umat — bagikan hanya ke petugas.</p>`;
  openSheet('Laporan (PDF)', body, {
    onClick: b => {
      const ym = $('#sheetForm').elements.ym.value;
      if (b.dataset.sh === 'rp-jadwal') run(async () => { toast('Menyiapkan PDF…'); await reportJadwal(ym); });
      else if (b.dataset.sh === 'rp-hantaran') run(async () => { toast('Menyiapkan PDF…'); await reportHantaran(ym); });
    },
  });
}

async function downloadPosterPdf(c, fname) {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  const { jsPDF } = window.jspdf;
  const wmm = 148, hmm = wmm * c.height / c.width; // lebar A5, tinggi mengikuti gambar
  const pdf = new jsPDF({ unit: 'mm', format: [wmm, hmm], orientation: hmm > wmm ? 'portrait' : 'landscape' });
  pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, wmm, hmm);
  pdf.save(fname + '.pdf');
}

/* ---- Absen petugas misa (koordinator) ---- */
const misaTitle = m => `${m.slot === 'LAIN' ? (m.title || 'Misa') : `${m.slot} ${slotLabel(m.slot)}`} · ${fmtShort(m.date)}`;
// Admin, atau akun yang ditautkan ke nama koordinator misa itu
const canCoordinate = m => S.admin || !!(S.me?.petugas && m.coordinator && norm(m.coordinator) === norm(S.me.petugas));
const attOf = m => S.attendance.filter(a => a.misa_id === m.id);
function attSummary(m) {
  const at = attOf(m);
  if (!at.length) return '';
  const hadir = m.officers.filter(n => at.find(a => norm(a.petugas) === norm(n))?.present).length;
  return ` · <span class="tag ${hadir === m.officers.length ? 'ok' : 'warn'}">Hadir ${hadir}/${m.officers.length}</span>`;
}
// Hantaran yang berangkat setelah misa ini (grup hantaran slot sama, minggu yang sama)
function hantaranOfMisa(m) {
  const out = [];
  for (const g of S.smk) g.officers.forEach((n, i) => { if (n && linkedMisa(g.slot, i)?.id === m.id) out.push({ g, n }); });
  return out;
}

function renderKoor(main) {
  const m = S.misa.find(x => x.id === S.koorMisa);
  if (!m) { S.tab = 'saya'; return render(); }
  if (!S.koorDraft) {
    const at = attOf(m);
    S.koorDraft = new Map(m.officers.map(n => [n, !!at.find(a => norm(a.petugas) === norm(n))?.present]));
  }
  for (const n of m.officers) if (!S.koorDraft.has(n)) S.koorDraft.set(n, true); // pengganti baru → hadir
  for (const n of [...S.koorDraft.keys()]) if (!m.officers.includes(n)) S.koorDraft.delete(n);
  const at = attOf(m), hadir = [...S.koorDraft.values()].filter(Boolean).length;
  const hant = hantaranOfMisa(m);
  const row = n => {
    const on = S.koorDraft.get(n), a = at.find(x => norm(x.petugas) === norm(n));
    const hg = hant.filter(x => norm(x.n) === norm(n)).map(x => `Hantaran grup ${x.g.no}`);
    return `<div class="koor-row ${on ? 'on' : ''}">
      <button type="button" class="koor-check" data-act="koor-toggle" data-k="${h(n)}" aria-pressed="${on}">${on ? '✓' : ''}</button>
      <div class="mi" data-act="koor-toggle" data-k="${h(n)}"><span class="nm">${h(n)}</span>${norm(n) === norm(m.coordinator) ? ' <span class="tag">Koordinator</span>' : ''}
        ${a?.substitute_for ? `<span class="tag ok">pengganti ${h(a.substitute_for)}</span>` : ''}${hg.map(t => ` <span class="tag wil">${h(t)}</span>`).join('')}</div>
      <button type="button" class="btn small" data-act="koor-ganti" data-k="${h(n)}">Ganti</button>
    </div>`;
  };
  const replaced = at.filter(a => !a.present && a.note.startsWith('diganti'));
  main.innerHTML = `<div class="koor">
    <button class="back" data-act="koor-back">‹ Kembali</button>
    <div class="koor-head">
      <div class="hint">Absen petugas · koordinator ${h(m.coordinator || '—')}</div>
      <h2>${h(misaTitle(m))}</h2>
      <div class="sub">${m.time ? `pk ${h(m.time)}` : ''}${m.place ? ` · ${h(m.place)}` : ''}</div>
      <div class="koor-count"><b>${hadir}</b> / ${m.officers.length} hadir${m.need ? ` <span class="hint">(butuh ${m.need})</span>` : ''}</div>
    </div>
    <div class="btns"><button class="btn small" data-act="koor-all">Tandai semua hadir</button></div>
    <div class="list koor-list">${m.officers.map(row).join('') || '<div class="empty-state small">Belum ada petugas di misa ini.</div>'}</div>
    ${replaced.length ? `<div class="hint" style="margin:8px 2px">Diganti: ${replaced.map(a => `${h(a.petugas)} (${h(a.note)})`).join(', ')}</div>` : ''}
    ${hant.length ? `<div class="sec-title">🕊️ Lanjut hantaran setelah misa <span class="count">${hant.length}</span></div>
      <div class="list">${hant.map(({ g, n }) => `<div class="asg"><div><b>${h(n)}</b> → grup ${h(g.no)} · ${mem(g).length} umat
        ${groupWilayah(g).map(w => `<span class="tag wil">${h(w.nama)}</span>`).join('')}</div></div>`).join('')}</div>` : ''}
    <button class="btn primary koor-save" data-act="koor-save">💾 Simpan absen</button>
  </div>`;
}

async function saveKoor() {
  const m = S.misa.find(x => x.id === S.koorMisa);
  const at = attOf(m);
  const rows = m.officers.map(n => {
    const a = at.find(x => norm(x.petugas) === norm(n));
    return { ...(a || { id: uid(), substitute_for: '', note: '' }), misa_id: m.id, month_id: m.month_id, petugas: n, present: !!S.koorDraft.get(n), checked_by: S.userId || null, checked_at: new Date().toISOString() };
  });
  await store.upsert('attendance', rows);
  S.attendance = [...S.attendance.filter(a => !rows.some(r => r.id === a.id)), ...rows];
  const hadir = rows.filter(r => r.present).length;
  toast(`Absen tersimpan · ${hadir}/${rows.length} hadir`);
  renderKoor($('#main'));
}

// Pilih pengganti: petugas aktif, belum di misa ini, bisa di slot & tanggal itu; yang tidak bertugas hari itu didahulukan
function openGanti(oldN) {
  const m = S.misa.find(x => x.id === S.koorMisa);
  const busy = new Set(S.misa.filter(x => x.date === m.date).flatMap(x => x.officers.map(norm)));
  const cands = S.petugas.filter(p => p.active && !m.officers.some(o => norm(o) === norm(p.nama)) && !unavailable(p.nama, m.date, m.slot))
    .sort((a, b) => busy.has(norm(a.nama)) - busy.has(norm(b.nama)) || a.nama.localeCompare(b.nama));
  const free = cands.filter(p => !busy.has(norm(p.nama))), other = cands.filter(p => busy.has(norm(p.nama)));
  const grp = (label, l) => (l.length ? `<optgroup label="${h(label)}">${l.map(p => opt(p.nama, `${p.nama}${petugasWilayah(p) ? ` · ${petugasWilayah(p).nama}` : ''}`, null)).join('')}</optgroup>` : '');
  const body = `<p>Ganti <b>${h(oldN)}</b> yang berhalangan di ${h(misaTitle(m))}:</p>
    <label class="fld">Pengganti<select name="pengganti" required>${opt('', '— pilih pengganti —', '')}${grp('Tidak bertugas hari ini', free)}${grp('Sudah bertugas di misa lain hari ini', other)}</select></label>
    <p class="hint">${h(oldN)} dicatat tidak hadir, pengganti dicatat hadir, dan jadwal misa langsung diperbarui.</p>`;
  openSheet('Ganti petugas', body, {
    saveLabel: 'Ganti',
    save: async fd => {
      const newN = fd.get('pengganti');
      if (!newN) throw new Error('Pilih pengganti dulu');
      await store.replaceOfficer(m.id, oldN, newN);
      const [ms, at] = await Promise.all([store.list('misa', S.monthId), store.list('attendance', S.monthId)]);
      S.misa = ms; S.attendance = at;
      if (S.koorDraft) { S.koorDraft.delete(oldN); S.koorDraft.set(newN, true); }
      renderKoor($('#main'));
      toast(`${oldN} diganti ${newN}`);
    },
  });
}

/* ---- Isi otomatis petugas hantaran ---- */
// Minggu hantaran (slot rutin, belum lewat) yang belum ada petugasnya: [{g, i, day}]
function emptyHantaran() {
  const t = todayIso(), out = [];
  for (const g of S.smk) {
    if (!REGULAR.includes(g.slot) || !mem(g).length) continue;
    weeks().forEach((_, i) => { const day = smkDay(g.slot, i); if (day && day >= t && !(g.officers[i] || '').trim()) out.push({ g, i, day }); });
  }
  return out;
}

// Calon: wilayah sama dengan umat grup, tersedia di tanggal & slot itu, belum mengantar hantaran lain
// di akhir pekan itu, dan tidak bertugas misa di jam lain pada akhir pekan itu.
// Urutan: yang sudah bertugas di misa jam itu dulu, lalu yang paling sedikit hantarannya bulan ini, acak.
function planHantaranFill() {
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const hBusy = new Map(), mBusy = new Map(), hCount = new Map();
  const add = (map, wk, n, v) => { if (!map.has(wk)) map.set(wk, new Map()); map.get(wk).set(norm(n), v); };
  for (const m of S.misa) for (const n of m.officers) add(mBusy, weekKey(m.date), n, m.id);
  for (const g of S.smk) g.officers.forEach((n, i) => {
    const d = smkDay(g.slot, i);
    if (n && d) { add(hBusy, weekKey(d), n, true); hCount.set(norm(n), (hCount.get(norm(n)) || 0) + 1); }
  });
  const plan = [];
  for (const { g, i, day } of emptyHantaran().sort((a, b) => a.day.localeCompare(b.day) || String(a.g.no).localeCompare(String(b.g.no), 'id', { numeric: true }))) {
    const wil = groupWilayah(g), ids = new Set(wil.map(w => w.id));
    if (!ids.size) { plan.push({ g, i, day, pick: '', why: 'umat grup ini belum punya wilayah' }); continue; }
    const wk = weekKey(day), lm = linkedMisa(g.slot, i);
    const inMisa = n => !!lm && lm.officers.some(o => norm(o) === norm(n));
    const cands = shuffle(S.petugas.filter(p => {
      if (!p.active || !ids.has(p.wilayah_id) || unavailable(p.nama, day, g.slot)) return false;
      if (hBusy.get(wk)?.has(norm(p.nama))) return false;                  // sudah mengantar hantaran lain minggu itu
      const misaId = mBusy.get(wk)?.get(norm(p.nama));
      return !misaId || misaId === lm?.id;                                  // bertugas misa lain minggu itu → tidak
    })).sort((a, b) => (inMisa(b.nama) - inMisa(a.nama)) || ((hCount.get(norm(a.nama)) || 0) - (hCount.get(norm(b.nama)) || 0)));
    const p = cands[0];
    if (!p) { plan.push({ g, i, day, pick: '', why: `tidak ada petugas wilayah ${wil.map(w => w.nama).join(', ')} yang tersedia` }); continue; }
    add(hBusy, wk, p.nama, true); hCount.set(norm(p.nama), (hCount.get(norm(p.nama)) || 0) + 1);
    if (lm) add(mBusy, wk, p.nama, lm.id);
    plan.push({ g, i, day, pick: p.nama, inMisa: inMisa(p.nama) });
  }
  return plan;
}

function openHantaranFill() {
  let plan = planHantaranFill();
  if (!plan.length) { toast('Semua minggu hantaran yang belum lewat sudah ada petugasnya'); return; }
  const draw = () => {
    const ok = plan.filter(x => x.pick), miss = plan.filter(x => !x.pick);
    const byGroup = new Map();
    for (const x of plan) { if (!byGroup.has(x.g.id)) byGroup.set(x.g.id, []); byGroup.get(x.g.id).push(x); }
    return `<p class="hint">Petugas dipilih dari <b>wilayah yang sama</b> dengan umat. Yang sudah bertugas di misa jam itu didahulukan;
        tidak memilih yang berhalangan, terkena pengecualian, atau sudah mengantar hantaran lain di akhir pekan itu.</p>
      <div class="sec-title">${ok.length} minggu terisi${miss.length ? ` <span class="tag warn">${miss.length} masih kosong</span>` : ''}</div>
      <div class="list">${[...byGroup.values()].map(xs => {
        const g = xs[0].g;
        return `<div class="asg"><div class="d">Grup ${h(g.no)} · ${h(smkSlotLabel(g.slot))} ${groupWilayah(g).map(w => `<span class="tag wil">${h(w.nama)}</span>`).join('')}</div>
          ${xs.map(x => `<div>${h(weeks()[x.i] || fmtShort(x.day))}: ${x.pick ? `<b>${h(x.pick)}</b>${x.inMisa ? ' <span class="tag ok">sudah di misa</span>' : ''}` : `<span class="ad warn">⚠️ kosong — ${h(x.why)}</span>`}</div>`).join('')}</div>`;
      }).join('')}</div>
      <div class="btns"><button type="button" class="btn small" data-sh="hf-again">🎲 Acak ulang</button></div>
      <p class="hint">Setelah diterapkan, petugas hantaran otomatis ditambahkan ke jadwal misa di jam yang sama.</p>`;
  };
  openSheet('Isi otomatis petugas hantaran', `<div id="hfBody">${draw()}</div>`, {
    saveLabel: 'Terapkan',
    save: async () => {
      const ok = plan.filter(x => x.pick);
      if (!ok.length) { toast('Tidak ada petugas yang bisa diisi'); return false; }
      const rows = new Map();
      for (const x of ok) {
        const r = rows.get(x.g.id) || { ...x.g, officers: weeks().map((_, i) => x.g.officers[i] || '') };
        r.officers[x.i] = x.pick; rows.set(x.g.id, r);
      }
      await store.upsert('smk_groups', [...rows.values()]);
      S.smk = S.smk.map(g => rows.get(g.id) || g);
      let added = 0;
      for (const r of rows.values()) added += (await addHantaranToMisa(r)).added;
      render();
      toast(`${ok.length} petugas hantaran diisi${added ? ` · ${added} ditambahkan ke jadwal misa` : ''}`);
    },
    onClick: b => { if (b.dataset.sh === 'hf-again') { plan = planHantaranFill(); $('#hfBody').innerHTML = draw(); } },
  });
}

/* ---- Pilih petugas acak untuk satu misa ---- */
// Calon: aktif, belum di misa ini, tersedia di tanggal & slot, belum bertugas (misa lain / hantaran) di akhir pekan itu.
// Urut: paling sedikit tugas bulan ini (misa + hantaran), acak di antara yang sama.
function randomPetugas(n, { date, slot, exclude = [], misaId = null }) {
  const wk = date ? weekKey(date) : '', ex = new Set(exclude.map(norm)), busy = new Set(), cnt = new Map();
  const inc = k => cnt.set(k, (cnt.get(k) || 0) + 1);
  for (const m of S.misa) {
    if (m.id === misaId) continue;
    for (const o of m.officers) { inc(norm(o)); if (wk && weekKey(m.date) === wk) busy.add(norm(o)); }
  }
  for (const g of S.smk) g.officers.forEach((o, i) => {
    if (!o) return;
    inc(norm(o));
    const d = smkDay(g.slot, i);
    // petugas hantaran di jam misa INI boleh (memang harus ikut misa ini); hantaran jam lain → sibuk
    if (wk && d && weekKey(d) === wk && !(g.slot === slot && d === date)) busy.add(norm(o));
  });
  const pool = S.petugas.filter(p => p.active && !ex.has(norm(p.nama)) && !busy.has(norm(p.nama)) && !unavailable(p.nama, date, slot));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.sort((a, b) => (cnt.get(norm(a.nama)) || 0) - (cnt.get(norm(b.nama)) || 0)).slice(0, n).map(p => p.nama);
}

/* ---- Isi otomatis petugas misa yang kurang ---- */
// Misa yang belum lewat dan petugasnya kurang dari jumlah dibutuhkan
const shortMisa = () => S.misa.filter(m => m.date >= todayIso() && (m.need || 0) > m.officers.length);
// Kunci "minggu": hari Minggu pada/after tanggal itu (akhir pekan Sabtu–Minggu jadi satu)
const weekKey = d => { const x = parseD(d); x.setDate(x.getDate() + ((7 - x.getDay()) % 7)); return iso(x); };

// Rencana pengisian: misa rutin (Sabtu–Minggu) didahulukan, lalu misa lainnya.
// Calon = petugas aktif yang belum bertugas (misa/hantaran) di minggu itu, tidak berhalangan & tidak
// terkena pengecualian slot. Yang paling sedikit tugasnya bulan ini didahulukan, acak di antara yang sama.
function planAutoFill() {
  const weekOf = new Map(), monthCount = new Map();
  const mark = (n, wk) => {
    const k = norm(n);
    if (!weekOf.has(wk)) weekOf.set(wk, new Set());
    weekOf.get(wk).add(k);
    monthCount.set(k, (monthCount.get(k) || 0) + 1);
  };
  for (const m of S.misa) for (const n of m.officers) mark(n, weekKey(m.date));
  for (const g of S.smk) g.officers.forEach((n, i) => { const d = smkDay(g.slot, i); if (n && d) mark(n, weekKey(d)); });
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const todo = shortMisa().sort((a, b) => (REGULAR.includes(b.slot) - REGULAR.includes(a.slot)) || cmpMisa(a, b));
  const plan = [];
  for (const m of todo) {
    const wk = weekKey(m.date), taken = weekOf.get(wk) || new Set();
    const cands = shuffle(S.petugas.filter(p => p.active && !taken.has(norm(p.nama)) && !unavailable(p.nama, m.date, m.slot)))
      .sort((a, b) => (monthCount.get(norm(a.nama)) || 0) - (monthCount.get(norm(b.nama)) || 0));
    const pick = cands.slice(0, (m.need || 0) - m.officers.length).map(p => p.nama);
    pick.forEach(n => mark(n, wk));
    plan.push({ misa: m, add: pick, still: (m.need || 0) - m.officers.length - pick.length });
  }
  return plan;
}

function openAutoFill() {
  let plan = planAutoFill();
  const draw = () => {
    const total = plan.reduce((a, x) => a + x.add.length, 0), still = plan.reduce((a, x) => a + x.still, 0);
    return `<p class="hint">Petugas dipilih acak dari yang <b>belum bertugas di minggu itu</b> (misa & hantaran), tidak berhalangan,
        dan bisa di slot tersebut. Misa Sabtu–Minggu didahulukan; yang paling sedikit tugasnya bulan ini diprioritaskan.</p>
      <div class="sec-title">${total} petugas akan ditambahkan${still ? ` <span class="tag warn">${still} tempat masih kosong</span>` : ''}</div>
      <div class="list">${plan.map(x => `<div class="asg">
        <div class="d">${h(fmtShort(x.misa.date))} · ${h(x.misa.slot === 'LAIN' ? x.misa.title : `${x.misa.slot} ${slotLabel(x.misa.slot)}`)} ·
          ${x.misa.officers.length + x.add.length}/${x.misa.need} petugas</div>
        <div class="chips">${x.add.map(n => `<span class="chip">＋ ${h(n)}</span>`).join('') || '<span class="hint">Tidak ada calon yang tersedia</span>'}</div>
        ${x.still ? `<div class="ad warn">⚠️ Masih kurang ${x.still} — tidak ada petugas lain yang tersedia di minggu itu</div>` : ''}
      </div>`).join('')}</div>
      <div class="btns"><button type="button" class="btn small" data-sh="af-again">🎲 Acak ulang</button></div>`;
  };
  if (!plan.length) { toast('Semua misa yang belum lewat sudah cukup petugasnya'); return; }
  openSheet('Isi otomatis petugas misa', `<div id="afBody">${draw()}</div>`, {
    saveLabel: 'Terapkan',
    save: async () => {
      const rows = plan.filter(x => x.add.length).map(x => ({ ...x.misa, officers: [...x.misa.officers, ...x.add] }));
      if (!rows.length) { toast('Tidak ada petugas yang bisa ditambahkan'); return false; }
      await store.upsert('misa', rows);
      S.misa = S.misa.map(m => rows.find(r => r.id === m.id) || m);
      render();
      toast(`${rows.reduce((a, r) => a + r.officers.length, 0) - plan.filter(x => x.add.length).reduce((a, x) => a + x.misa.officers.length, 0)} petugas ditambahkan ke ${rows.length} misa`);
    },
    onClick: b => { if (b.dataset.sh === 'af-again') { plan = planAutoFill(); $('#afBody').innerHTML = draw(); } },
  });
}

/* ---- Petugas berhalangan ---- */
// Tanggal tugas SMK minggu ke-i (slot rutin → hari misa; slot tambahan → hari Minggu)
function smkDay(slot, i) {
  const sun = weekendsOf(S.monthId || '2000-01')[i]?.sun;
  if (!sun) return '';
  const sl = slotByKey(slot);
  return sl ? slotDate(sl, sun) : sun;
}
const upcomingAbsences = () => S.absences.filter(a => a.end_date >= todayIso());
const nextAbsence = pid => upcomingAbsences().filter(a => a.petugas_id === pid).sort((a, b) => a.start_date.localeCompare(b.start_date))[0] || null;
const petugasName = id => S.petugas.find(p => p.id === id)?.nama || '(petugas dihapus)';

function openAbsenceList() {
  const t = todayIso();
  const list = [...S.absences].sort((a, b) => a.start_date.localeCompare(b.start_date) || petugasName(a.petugas_id).localeCompare(petugasName(b.petugas_id)));
  const now = list.filter(a => a.start_date <= t && a.end_date >= t), soon = list.filter(a => a.start_date > t), past = list.filter(a => a.end_date < t);
  const row = a => `<div class="urow tap" data-sh="ab-edit" data-id="${h(a.id)}"><div class="mi">
      <span class="nm">${h(petugasName(a.petugas_id))}</span>
      <div class="ad">${h(fmtShort(a.start_date))} – ${h(fmtShort(a.end_date))}${a.reason ? ` · ${h(a.reason)}` : ''}</div></div><span class="go">›</span></div>`;
  const sec = (title, l) => (l.length ? `<div class="sec-title">${title} <span class="count">${l.length}</span></div><div class="list">${l.map(row).join('')}</div>` : '');
  const body = (sec('Sedang berhalangan', now) + sec('Akan berhalangan', soon)
      + (past.length ? (S.absenceShowPast ? sec('Sudah lewat', past.reverse()) : `<button type="button" class="link-btn" data-sh="ab-past">Tampilkan ${past.length} yang sudah lewat</button>`) : '')
      || '<div class="empty-state small">Belum ada petugas yang berhalangan.</div>')
    + `<button type="button" class="btn primary" data-sh="ab-new">＋ Catat petugas berhalangan</button>
    <p class="hint">Petugas yang berhalangan tidak bisa dipilih di jadwal pada tanggal itu, dan tab Cek memberi tanda bila ia sudah terlanjur dijadwalkan.</p>`;
  openSheet('Petugas berhalangan', body, {
    onClick: b => {
      if (b.dataset.sh === 'ab-past') { S.absenceShowPast = true; dlg.close(); openAbsenceList(); }
      else if (b.dataset.sh === 'ab-new') { dlg.close(); openAbsenceForm(); }
      else if (b.dataset.sh === 'ab-edit') { dlg.close(); openAbsenceForm(S.absences.find(a => a.id === b.dataset.id)); }
    },
  });
}

function openAbsenceForm(a = {}) {
  const isNew = !a.id;
  const t = todayIso();
  a = { id: uid(), petugas_id: '', start_date: t, end_date: t, reason: '', ...a };
  const opts = S.petugas.filter(p => p.active || p.id === a.petugas_id).sort((x, y) => x.nama.localeCompare(y.nama))
    .map(p => opt(p.id, p.nama, a.petugas_id)).join('');
  const body = `
    <label class="fld">Petugas<select name="petugas_id" required>${opt('', '— pilih petugas —', a.petugas_id || '')}${opts}</select></label>
    <div class="grid2">
      <label class="fld">Dari tanggal<input type="date" name="start_date" required value="${h(a.start_date)}"></label>
      <label class="fld">Sampai tanggal<input type="date" name="end_date" required value="${h(a.end_date)}"></label>
    </div>
    <label class="fld">Keterangan (opsional)<input name="reason" maxlength="200" value="${h(a.reason)}" placeholder="mis. sakit, ke luar kota"></label>
    <div id="abHit"></div>`;
  openSheet(isNew ? 'Catat berhalangan' : 'Ubah berhalangan', body, {
    save: async fd => {
      const row = { ...a, petugas_id: fd.get('petugas_id'), start_date: fd.get('start_date'), end_date: fd.get('end_date'), reason: fd.get('reason').trim() };
      if (!row.petugas_id) throw new Error('Pilih petugas');
      if (!row.start_date || !row.end_date) throw new Error('Isi tanggal mulai & selesai');
      if (row.start_date > row.end_date) throw new Error('Tanggal selesai harus sama atau setelah tanggal mulai');
      await store.upsert('absences', [row]);
      S.absences = [...S.absences.filter(x => x.id !== row.id), row];
      render();
      const hits = absenceHits(row);
      toast(hits.length ? `Tersimpan · ${hits.length} tugas bentrok, lihat tab Cek` : 'Tersimpan');
    },
    del: isNew ? null : async () => {
      await store.remove('absences', a.id);
      S.absences = S.absences.filter(x => x.id !== a.id); render(); toast('Dihapus');
    },
  });
  // Tampilkan tugas yang sudah terjadwal di rentang itu (bulan yang sedang dibuka)
  const f = $('#sheetForm');
  const showHits = () => {
    const hits = absenceHits({ petugas_id: f.elements.petugas_id.value, start_date: f.elements.start_date.value, end_date: f.elements.end_date.value });
    $('#abHit').innerHTML = hits.length
      ? `<div class="ad warn">⚠️ Sudah terjadwal di rentang ini: ${hits.map(x => h(x)).join(', ')}. Ganti petugasnya lewat tab Cek.</div>` : '';
  };
  ['petugas_id', 'start_date', 'end_date'].forEach(k => f.elements[k].addEventListener('change', () => {
    if (k === 'start_date' && f.elements.end_date.value < f.elements.start_date.value) f.elements.end_date.value = f.elements.start_date.value;
    showHits();
  }));
  showHits();
}
// Tugas (bulan aktif) milik petugas pada rentang berhalangan
function absenceHits(a) {
  const p = S.petugas.find(x => x.id === a.petugas_id);
  if (!p || !a.start_date || !a.end_date) return [];
  const inR = d => d && d >= a.start_date && d <= a.end_date;
  const k = norm(p.nama), out = [];
  for (const m of S.misa) if (inR(m.date) && m.officers.some(n => norm(n) === k)) out.push(`${m.slot === 'LAIN' ? m.title : m.slot} ${fmtShort(m.date)}`);
  for (const g of S.smk) g.officers.forEach((n, i) => { if (norm(n) === k && inR(smkDay(g.slot, i))) out.push(`Hantaran grup ${g.no} ${fmtShort(smkDay(g.slot, i))}`); });
  return out;
}

/* ---- Sponsor ---- */
const todayIso = () => iso(new Date());
const sponsorStatus = sp => {
  const t = todayIso();
  if (!sp.active) return ['Nonaktif', 'warn'];
  if (sp.mulai && sp.mulai > t) return [`Mulai ${fmtShort(sp.mulai)}`, ''];
  if (sp.selesai && sp.selesai < t) return ['Selesai', 'warn'];
  return ['Tayang', 'ok'];
};
const activeSponsors = () => S.sponsor.filter(sp => sponsorStatus(sp)[0] === 'Tayang')
  .sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0) || a.nama.localeCompare(b.nama));
// Satu sponsor per tampilan, bergantian setiap kali halaman digambar ulang
function sponsorCard() {
  const list = activeSponsors();
  if (!list.length) return '';
  const sp = list[S.sponsorAt++ % list.length];
  if (sp.banner) {
    const inner = `<img class="sp-banner" src="${h(sp.banner)}" alt="${h(sp.nama)}" loading="lazy">
      <div class="sp-cap"><span class="hint">Didukung oleh</span> <b>${h(sp.nama)}</b>${sp.teks ? ` · ${h(sp.teks)}` : ''}</div>`;
    return /^https:\/\//.test(sp.link)
      ? `<a class="sponsor banner" href="${h(sp.link)}" target="_blank" rel="noopener sponsored">${inner}</a>`
      : `<div class="sponsor banner">${inner}</div>`;
  }
  const inner = `${sp.logo ? `<img src="${h(sp.logo)}" alt="" loading="lazy">` : ''}
    <div class="sp-tx"><div class="hint">Didukung oleh</div><b>${h(sp.nama)}</b>${sp.teks ? `<div class="sp-desc">${h(sp.teks)}</div>` : ''}</div>
    ${sp.link ? '<span class="go">›</span>' : ''}`;
  return /^https:\/\//.test(sp.link)
    ? `<a class="sponsor" href="${h(sp.link)}" target="_blank" rel="noopener sponsored">${inner}</a>`
    : `<div class="sponsor">${inner}</div>`;
}
// Link sponsor: https://… atau nomor WA → https://wa.me/62…
function normSponsorLink(v) {
  const t = String(v || '').trim();
  if (!t) return '';
  if (/^https:\/\/\S+$/i.test(t)) return t;
  if (/^http:\/\//i.test(t)) return t.replace(/^http:/i, 'https:');
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return 'https://' + t;
  const wa = normWa(t);
  if (wa) return `https://wa.me/62${wa.slice(1)}`;
  throw new Error('Link harus alamat web (https://…) atau nomor WA (08…)');
}

function openSponsorList() {
  const rows = [...S.sponsor].sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0) || a.nama.localeCompare(b.nama)).map(sp => {
    const [st, cls] = sponsorStatus(sp);
    const per = [sp.mulai && fmtShort(sp.mulai), sp.selesai && fmtShort(sp.selesai)];
    return `<div class="urow tap" data-sh="sp-edit" data-id="${h(sp.id)}">
      ${sp.logo ? `<img class="sp-thumb" src="${h(sp.logo)}" alt="">` : '<span class="sp-thumb">🤝</span>'}
      <div class="mi"><span class="nm">${h(sp.nama)}</span> <span class="tag ${cls}">${h(st)}</span>
        <div class="ad">${per[0] || per[1] ? `${per[0] || '…'} – ${per[1] || 'seterusnya'}` : 'Tanpa batas waktu'}${sp.banner ? ' · banner' : ''}${sp.link ? ' · ada link' : ''}</div></div>
      <span class="go">›</span></div>`;
  }).join('');
  const body = `<div class="list">${rows || '<div class="empty-state small">Belum ada sponsor.</div>'}</div>
    <button type="button" class="btn primary" data-sh="sp-new">＋ Sponsor baru</button>
    <p class="hint">Kartu "Didukung oleh …" tampil di bawah tab Saya dan Misa untuk pengguna ${h(P.nama)} yang sudah login,
      bergantian bila lebih dari satu. Tidak memakai iklan pihak ketiga.</p>`;
  openSheet(`Sponsor ${P.nama}`, body, {
    onClick: b => {
      if (b.dataset.sh === 'sp-new') { dlg.close(); openSponsorForm(); }
      else if (b.dataset.sh === 'sp-edit') { dlg.close(); openSponsorForm(S.sponsor.find(x => x.id === b.dataset.id)); }
    },
  });
}

function openSponsorForm(sp) {
  const isNew = !sp;
  sp = sp ? { ...sp } : { id: uid(), nama: '', teks: '', logo: '', banner: '', link: '', mulai: null, selesai: null, active: true, urutan: 0 };
  let logo = sp.logo || '', banner = sp.banner || '';
  const body = `
    <div class="logo-edit">
      <img id="spLogoPrev" src="${h(logo || 'icons/icon.svg')}" alt="" width="72" height="72">
      <div class="logo-btns">
        <div class="fld">Logo sponsor (opsional)</div>
        <label class="btn small">Pilih gambar…<input type="file" id="spLogoFile" accept="image/*" hidden></label>
        <button type="button" class="btn small" data-sh="sp-logo-clear">Tanpa logo</button>
      </div>
    </div>
    <div class="fld">Gambar banner lebar (opsional, disarankan ±3:1, mis. 900×300)</div>
    <div class="banner-edit">
      <div id="spBannerPrev" class="banner-prev">${banner ? `<img src="${h(banner)}" alt="">` : '<span class="hint">Belum ada banner — kartu memakai logo + teks</span>'}</div>
      <div class="btns">
        <label class="btn small">Pilih banner…<input type="file" id="spBannerFile" accept="image/*" hidden></label>
        <button type="button" class="btn small" data-sh="sp-banner-clear">Hapus banner</button>
      </div>
    </div>
    <label class="fld">Nama sponsor<input name="nama" required maxlength="80" value="${h(sp.nama)}" placeholder="Toko Rohani Santo Yosef"></label>
    <label class="fld">Teks singkat (maks. 200 huruf)<textarea name="teks" rows="2" maxlength="200" placeholder="Perlengkapan liturgi & rosario. Diskon 10% untuk umat.">${h(sp.teks)}</textarea></label>
    <label class="fld">Link: website atau nomor WA<input name="link" value="${h(sp.link)}" placeholder="https://… atau 0812…" inputmode="url"></label>
    <div class="grid2">
      <label class="fld">Mulai tayang<input type="date" name="mulai" value="${h(sp.mulai || '')}"></label>
      <label class="fld">Selesai tayang<input type="date" name="selesai" value="${h(sp.selesai || '')}"></label>
    </div>
    <div class="grid2">
      <label class="fld">Urutan (kecil tampil dulu)<input type="number" name="urutan" value="${sp.urutan ?? 0}"></label>
      <label style="align-self:end"><input type="checkbox" name="active" ${sp.active ? 'checked' : ''}> Aktif</label>
    </div>
    <p class="hint">Kosongkan tanggal bila tanpa batas waktu.</p>`;
  openSheet(isNew ? 'Sponsor baru' : 'Ubah sponsor', body, {
    save: async fd => {
      const row = {
        ...sp, nama: fd.get('nama').trim(), teks: fd.get('teks').trim(), logo, banner, link: normSponsorLink(fd.get('link')),
        mulai: fd.get('mulai') || null, selesai: fd.get('selesai') || null,
        urutan: Number(fd.get('urutan')) || 0, active: !!fd.get('active'),
      };
      if (!row.nama) throw new Error('Nama sponsor wajib diisi');
      if (row.mulai && row.selesai && row.mulai > row.selesai) throw new Error('Tanggal selesai harus setelah tanggal mulai');
      await store.upsert('sponsor', [row]);
      S.sponsor = [...S.sponsor.filter(x => x.id !== row.id), row];
      render(); toast(`${isNew ? 'Sponsor ditambahkan' : 'Tersimpan'} · ${sponsorStatus(row)[0]}`);
    },
    del: isNew ? null : async () => {
      await store.remove('sponsor', sp.id);
      S.sponsor = S.sponsor.filter(x => x.id !== sp.id); render(); toast('Sponsor dihapus');
    },
    onClick: b => {
      if (b.dataset.sh === 'sp-logo-clear') { logo = ''; $('#spLogoPrev').src = 'icons/icon.svg'; }
      if (b.dataset.sh === 'sp-banner-clear') { banner = ''; $('#spBannerPrev').innerHTML = '<span class="hint">Banner dihapus — tekan Simpan</span>'; }
    },
  });
  $('#spBannerFile').addEventListener('change', e => run(async () => {
    const file = e.target.files[0];
    if (!file) return;
    banner = await shrinkImage(file, 960, { limit: 300000, photo: true });
    $('#spBannerPrev').innerHTML = `<img src="${h(banner)}" alt="">`;
    toast(`Banner siap (${Math.round(banner.length / 1024)} KB) — tekan Simpan`);
  }));
  $('#spLogoFile').addEventListener('change', e => run(async () => {
    const file = e.target.files[0];
    if (!file) return;
    logo = await shrinkImage(file, 256);
    $('#spLogoPrev').src = logo;
    toast(`Logo siap (${Math.round(logo.length / 1024)} KB) — tekan Simpan`);
  }));
}

async function openMasterParoki() {
  S.parokiList = await store.listParoki();
  const rows = S.parokiList.map(p => `<div class="urow"><img class="p-thumb" src="${h(p.logo || 'icons/icon.svg')}" alt="" width="36" height="36"><div class="mi">
      <span class="nm">${h(p.nama)}</span>${p.id === P.id ? ' <span class="tag">Sedang dibuka</span>' : ''}${p.active ? '' : ' <span class="tag warn">Nonaktif</span>'}
      <div class="ad">${h(p.kota || '')}${p.kota ? ' · ' : ''}?p=${h(p.slug)}</div></div>
      <button type="button" class="btn small" data-sh="p-link" data-id="${h(p.id)}">Salin link</button>
      ${p.id === P.id ? '' : `<button type="button" class="btn small primary" data-sh="p-open" data-id="${h(p.id)}">Buka</button>`}
      <button type="button" class="btn small" data-sh="p-edit" data-id="${h(p.id)}">Ubah</button></div>`).join('');
  const body = `<div class="list">${rows || '<div class="empty-state">Belum ada paroki.</div>'}</div>
    <button type="button" class="btn primary" data-sh="p-new">＋ Paroki baru</button>
    <p class="hint">Paroki baru: bagikan linknya ke calon admin, minta mendaftar, lalu buka paroki itu → Pengguna → Setujui → Jadikan admin.</p>`;
  openSheet('Master paroki', body, {
    onClick: b => {
      const p = S.parokiList.find(x => x.id === b.dataset.id);
      if (b.dataset.sh === 'p-new') { dlg.close(); openParokiForm(); }
      else if (b.dataset.sh === 'p-edit') { dlg.close(); openParokiForm(p); }
      else if (b.dataset.sh === 'p-open') { lsSet('prodiakon.paroki', p.slug); location.href = parokiLink(p); }
      else if (b.dataset.sh === 'p-link') {
        navigator.clipboard.writeText(parokiLink(p)).then(() => toast('Link disalin'), () => toast(parokiLink(p)));
      }
    },
  });
}

/* ================= Boot ================= */
let authMode = 'login';
// No. WA → format 08xxxxxxxxxx ('' bila tidak valid). Terima 08…, 628…, +62 8…
function normWa(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('62')) d = '0' + d.slice(2);
  return /^08\d{7,12}$/.test(d) ? d : '';
}
function setAuthMode(mode, hint = '') {
  authMode = mode;
  const su = mode === 'signup', f = $('#loginForm');
  $('#namaFld').hidden = !su; f.elements.nama.required = su;
  $('#waFld').hidden = !su; f.elements.wa.required = su;
  $('#parokiFld').hidden = !su;
  f.elements.password.autocomplete = su ? 'new-password' : 'current-password';
  $('#authBtn').textContent = su ? 'Daftar' : 'Masuk';
  $('#authToggle').textContent = su ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar';
  hint = hint || (su ? 'Setelah mendaftar, akun perlu disetujui admin dulu sebelum bisa melihat jadwal.' : '');
  $('#authHint').textContent = hint; $('#authHint').hidden = !hint;
  $('#loginErr').textContent = '';
}
function showLogin() {
  $('#app').hidden = true; $('#login').hidden = false; $('#loginForm').hidden = false; $('#pending').hidden = true;
}
function showPending(me) {
  $('#app').hidden = true; $('#login').hidden = false; $('#loginForm').hidden = true; $('#pending').hidden = false;
  const rej = me.status === 'rejected', none = me.status === 'no-paroki';
  $('#pendingTitle').textContent = none ? 'Akun belum terhubung ke paroki' : rej ? 'Pendaftaran tidak disetujui' : 'Menunggu persetujuan admin';
  $('#pendingText').textContent = none
    ? `Akun ${me.email} belum terdaftar di paroki mana pun. Hubungi admin paroki Anda.`
    : rej
      ? `Akun ${me.email} tidak disetujui. Hubungi admin bila ini keliru.`
      : `Akun ${me.email} sudah terdaftar di ${P.nama}. Admin perlu menyetujuinya dulu sebelum Anda bisa melihat jadwal. Tekan "Cek lagi" setelah disetujui.`;
}
async function showApp() {
  if (ONLINE) {
    const me = await store.me();
    S.userId = me.id; S.me = me;
    S.super = await store.isSuper();
    S.parokiList = await store.listParoki().catch(() => []);
    const p = await pickParoki(me);
    if (!p) return showPending({ ...me, status: 'no-paroki' });
    applyParoki(p); lsSet('prodiakon.paroki', p.slug);
    S.admin = await store.isAdmin();
    if (!S.admin && me.status !== 'approved') return showPending(me);
    $('#modeBadge').textContent = S.super ? 'Super admin' : S.admin ? 'Admin' : 'Lihat saja';
    if (!S.admin && !lsGet('prodiakon.tab')) S.tab = 'saya'; // petugas: langsung jadwal sendiri
  }
  $('#login').hidden = true; $('#app').hidden = false;
  await run(loadMonths);
  await autoNextMonth();
  refreshPush();
  if (ONLINE && S.admin) {
    const users = await store.listUsers().catch(() => []);
    S.pendingUsers = users.filter(u => u.status === 'pending').length;
    if (S.pendingUsers) toast(`${S.pendingUsers} pendaftar menunggu persetujuan (Menu ⋮ → Pengguna)`);
  }
}
// Paroki yang dibuka: super admin bebas (link ?p / terakhir dibuka); lainnya paroki akunnya,
// kecuali ia juga admin di paroki pada link ?p.
async function pickParoki(me) {
  const all = S.parokiList, want = urlSlug() || lsGet('prodiakon.paroki');
  const own = all.find(x => x.id === me.paroki_id);
  if (S.super) return all.find(x => x.slug === want) || own || all[0] || null;
  const other = want && want !== own?.slug ? all.find(x => x.slug === want) : null;
  if (other && await store.isAdmin(other.id)) return other;
  return own || null;
}

async function onAuthSubmit(e) {
  e.preventDefault();
  const fd = new FormData(e.target), email = fd.get('email').trim(), password = fd.get('password');
  const err = $('#loginErr'), btn = $('#authBtn');
  err.textContent = ''; btn.disabled = true;
  try {
    if (authMode === 'signup') {
      const wa = normWa(fd.get('wa'));
      if (!wa) { err.textContent = 'No. WA tidak valid. Contoh: 081234567890'; return; }
      const paroki = fd.get('paroki') || '';
      if (!paroki) { err.textContent = 'Pilih paroki Anda.'; return; }
      const { data, error } = await store.sb.auth.signUp({
        email, password,
        options: { data: { nama: fd.get('nama').trim(), wa, paroki }, emailRedirectTo: parokiLink({ slug: paroki }) },
      });
      if (error) {
        err.textContent = /not allowed|disabled/i.test(error.message) ? 'Pendaftaran sedang ditutup. Hubungi admin.'
          : /already registered|already exists/i.test(error.message) ? 'Email ini sudah terdaftar. Silakan masuk.'
          : /password/i.test(error.message) ? 'Password minimal 6 karakter.'
          : 'Daftar gagal: ' + friendlyError(error);
        return;
      }
      if (data.session) return await showApp(); // konfirmasi email dimatikan → langsung ke layar menunggu persetujuan
      setAuthMode('login', `Pendaftaran terkirim. Buka email ${email}, klik link konfirmasinya, lalu masuk di sini. Setelah itu tunggu persetujuan admin.`);
      return;
    }
    const { error } = await store.sb.auth.signInWithPassword({ email, password });
    if (error) err.textContent = 'Login gagal: ' + (/confirm/i.test(error.message) ? 'email belum dikonfirmasi, cek kotak masuk email.'
      : /invalid login|invalid credentials/i.test(error.message) ? 'email atau password salah.' : friendlyError(error));
    else await showApp();
  } catch (ex) {
    err.textContent = 'Gagal: ' + friendlyError(ex);
  } finally { btn.disabled = false; }
}
async function boot() {
  store = ONLINE ? new SupaStore() : new LocalStore();
  $('#modeBadge').textContent = ONLINE ? 'Online' : 'Lokal';
  applyParoki(DEFAULT_PAROKI);
  if (!ONLINE) return showApp();
  // Halaman login/daftar: nama paroki dari link ?p=, atau pilih paroki saat daftar
  S.parokiList = await store.listParoki().catch(() => []);
  const linked = S.parokiList.find(x => x.slug === (urlSlug() || lsGet('prodiakon.paroki')));
  applyParoki(linked || { ...DEFAULT_PAROKI, nama: S.parokiList.length === 1 ? S.parokiList[0].nama : 'Gereja Katolik' });
  const sel = $('#loginForm').elements.paroki;
  sel.innerHTML = opt('', '— pilih paroki —', linked?.slug || '')
    + S.parokiList.filter(x => x.active).map(x => opt(x.slug, x.kota ? `${x.nama} – ${x.kota}` : x.nama, linked?.slug || '')).join('');
  if (S.parokiList.length === 1 && !linked) sel.value = S.parokiList[0].slug;
  $('#loginForm').addEventListener('submit', onAuthSubmit);
  $('#authToggle').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'signup' : 'login'));
  $('#pendingRetry').addEventListener('click', () => run(showApp));
  $('#pendingProfile').addEventListener('click', openProfile);
  $('#pendingLogout').addEventListener('click', async () => { await store.sb.auth.signOut(); location.reload(); });
  const { data } = await store.sb.auth.getSession();
  if (data.session) return run(showApp);
  setAuthMode('login'); showLogin();
}
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
