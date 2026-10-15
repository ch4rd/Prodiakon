'use strict';

/* ================= Konstanta ================= */
const CFG = window.APP_CONFIG || {};
const ONLINE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);

const MISA_SLOTS = [
  { key: 'M1', label: 'Sabtu 17.30', time: '17.30' },
  { key: 'M2', label: 'Minggu 06.00', time: '06.00' },
  { key: 'M3', label: 'Minggu 08.30', time: '08.30' },
  { key: 'M4', label: 'Minggu 17.30', time: '17.30' },
  { key: 'LAIN', label: 'Misa lainnya', time: '' },
];
const SMK_SLOTS = [
  { key: 'M1', label: 'Sabtu, pk 17.30' },
  { key: 'M2', label: 'Minggu, pk 06.00' },
  { key: 'M3', label: 'Minggu, pk 08.30' },
  { key: 'M4', label: 'Minggu, pk 17.30' },
  { key: 'PRIVAT', label: 'Privat (petugas tetap)' },
  { key: 'JUMAT', label: 'Jumat (Suster)' },
];
const REGULAR = ['M1', 'M2', 'M3', 'M4'];
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
async function run(fn) {
  try { return await fn(); } catch (e) { console.error(e); toast('Gagal: ' + (e.message || e)); return false; }
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
    const empty = { months: [], misa: [], smk_groups: [] };
    try { return { ...empty, ...JSON.parse(lsGet(this.key) || '{}') }; } catch { return empty; }
  }
  write(d) { localStorage.setItem(this.key, JSON.stringify(d)); }
  async list(kind, monthId) {
    const rows = this.read()[kind] || [];
    return structuredClone(monthId ? rows.filter(r => r.month_id === monthId) : rows);
  }
  async upsert(kind, rows) {
    const d = this.read(); const arr = d[kind];
    for (const r of rows) {
      const i = arr.findIndex(x => x.id === r.id);
      if (i >= 0) arr[i] = r; else arr.push(r);
    }
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
    let q = this.sb.from(kind).select('*');
    if (monthId) q = q.eq('month_id', monthId);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
  async upsert(kind, rows) {
    if (!rows.length) return;
    const clean = rows.map(({ updated_at, ...r }) => r);
    const { error } = await this.sb.from(kind).upsert(clean);
    if (error) throw error;
  }
  async remove(kind, id) {
    const { error } = await this.sb.from(kind).delete().eq('id', id);
    if (error) throw error;
  }
}

/* ================= State ================= */
let store;
const S = {
  months: [], monthId: null, misa: [], smk: [],
  tab: lsGet('prodiakon.tab') || 'misa',
  misaFilter: 'ALL', smkQ: '', personQ: '', person: null,
};
const curMonth = () => S.months.find(m => m.id === S.monthId);
const weeks = () => (curMonth()?.weeks || []);
const misaOfSlot = slot => S.misa.filter(m => m.slot === slot).sort(cmpMisa);
const linkedMisa = (slot, i) => (REGULAR.includes(slot) ? misaOfSlot(slot)[i] : null);
function cmpMisa(a, b) {
  return a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '') || a.slot.localeCompare(b.slot);
}

async function loadMonths() {
  S.months = (await store.list('months')).sort((a, b) => b.id.localeCompare(a.id));
  const saved = lsGet('prodiakon.month');
  const now = iso(new Date()).slice(0, 7);
  S.monthId = [saved, S.monthId, now].find(id => id && S.months.some(m => m.id === id)) || S.months[0]?.id || null;
  await loadMonth();
}
async function loadMonth() {
  if (S.monthId) {
    lsSet('prodiakon.month', S.monthId);
    const [m, g] = await Promise.all([store.list('misa', S.monthId), store.list('smk_groups', S.monthId)]);
    S.misa = m;
    S.smk = g.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  } else {
    S.misa = []; S.smk = [];
  }
  render();
}

/* ================= Render ================= */
function render() {
  $('#monthSel').innerHTML = S.months.length
    ? S.months.map(m => `<option value="${h(m.id)}" ${m.id === S.monthId ? 'selected' : ''}>${h(monthName(m.id))}</option>`).join('')
    : '<option>Belum ada data</option>';
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  $('#fab').hidden = !S.monthId || !['misa', 'smk'].includes(S.tab);
  $('#names').innerHTML = allNames().map(n => `<option value="${h(n)}">`).join('');
  const n = buildIssues().length;
  $('#cekCount').textContent = n ? String(n) : '';

  const main = $('#main');
  if (!S.monthId) { main.innerHTML = emptyState(); return; }
  if (S.tab === 'misa') renderMisa(main);
  else if (S.tab === 'smk') renderSmk(main);
  else if (S.tab === 'petugas') renderPetugas(main);
  else renderCek(main);
}

function emptyState() {
  return `<div class="empty-state">
    <p>Belum ada data bulan apa pun.</p>
    <div class="btns" style="justify-content:center">
      ${window.SEED ? `<button class="btn primary" data-act="load-seed">Muat data Oktober 2026</button>` : ""}
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
  if (!list.length) html += '<div class="empty-state">Belum ada jadwal misa. Tekan ＋ untuk menambah.</div>';
  let last = '';
  for (const m of list) {
    if (m.date !== last) { html += `<h3 class="day">${h(fmtLong(m.date))}</h3>`; last = m.date; }
    html += misaCard(m);
  }
  main.innerHTML = html;
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
  return `<article class="card tap" data-act="edit-misa" data-id="${h(m.id)}">
    <div class="c-head" style="border-left:6px solid ${col[1]}">
      <span class="badge">${m.slot === 'LAIN' ? 'Khusus' : h(m.slot)}</span>
      <span class="t">${h(m.title || slotLabel(m.slot))}</span>
      <span class="sub">${h(sub)}</span>
      ${m.color ? `<span class="lit">${h(col[0])}</span>` : ''}
    </div>
    <div class="c-body">
      ${chips ? `<div class="chips">${chips}</div>` : '<span class="count">Belum ada petugas</span>'}
      ${m.note ? `<div class="note">📝 ${h(m.note)}</div>` : ''}
      <div class="count" style="margin-top:6px">${m.officers.length} petugas${m.need ? ` / butuh ${m.need}` : ''}</div>
    </div>
  </article>`;
}

/* ---- SMK ---- */
function renderSmk(main) {
  main.innerHTML = `<input class="search" id="smkQ" type="search" placeholder="Cari umat, petugas, lingkungan, alamat…" value="${h(S.smkQ)}">
    <div id="smkList"></div>
    ${curMonth()?.notes ? `<div class="notes-box"><b>Catatan</b>\n${h(curMonth().notes)}</div>` : ''}`;
  $('#smkQ').addEventListener('input', e => { S.smkQ = e.target.value; renderSmkList(); });
  renderSmkList();
}

function renderSmkList() {
  const q = norm(S.smkQ);
  const match = g => !q || norm([g.no, ...g.officers, ...g.members.flatMap(m => [m.nama, m.lingkungan, m.alamat, m.telp])].join(' ')).includes(q);
  let html = '';
  for (const s of SMK_SLOTS) {
    const groups = S.smk.filter(g => g.slot === s.key && match(g));
    if (!groups.length) continue;
    const umat = groups.reduce((a, g) => a + g.members.length, 0);
    const units = groups.reduce((a, g) => a + g.members.reduce((x, m) => x + smkUnits(m.nama), 0), 0);
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
  const mem = g.members.map(m => `<div class="member">
      <div><span class="nm">${h(m.nama)}</span>${m.lingkungan ? `<span class="ln">${h(m.lingkungan)}</span>` : ''}</div>
      ${m.alamat ? `<div class="ad">📍 ${h(m.alamat)}</div>` : ''}
      ${m.telp ? `<div class="phones">${phoneLinks(m.telp)}</div>` : ''}
    </div>`).join('');
  return `<article class="card">
    <div class="c-head">
      <span class="badge">${h(g.no)}</span>
      <span class="sub">${g.members.length} umat</span>
      <button class="btn small" style="margin-left:auto" data-act="edit-smk" data-id="${h(g.id)}">Ubah</button>
    </div>
    <div class="c-body"><div class="weeks">${wk}</div>${mem || '<span class="count">Belum ada umat</span>'}</div>
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
        text: `Antaran SMK grup ${g.no} (${smkSlotLabel(g.slot)})`,
        members: g.members.map(m => m.nama),
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
  main.innerHTML = `<input class="search" id="pQ" type="search" placeholder="Cari nama petugas…" value="${h(S.personQ)}">
    <div class="count" id="pCount" style="margin:0 2px 8px"></div><div id="pList"></div>`;
  const draw = () => {
    const q = norm(S.personQ);
    const list = all.filter(p => !q || p.key.includes(q));
    $('#pCount').textContent = `${list.length} petugas`;
    $('#pList').innerHTML = list.length ? `<div class="list">${list.map(p => {
      const mi = p.items.filter(i => i.type === 'misa').length, sm = p.items.filter(i => i.type === 'smk').length;
      return `<div class="row" data-act="person" data-k="${h(p.key)}"><span class="nm">${h(p.name)}</span>
        ${mi ? `<span class="num">${mi} misa</span>` : ''}${sm ? `<span class="num s">${sm} SMK</span>` : ''}</div>`;
    }).join('')}</div>` : '<div class="empty-state">Tidak ditemukan.</div>';
  };
  $('#pQ').addEventListener('input', e => { S.personQ = e.target.value; draw(); });
  draw();
}

function personDetail(p) {
  const items = p.items.map(i => `<div class="asg">
      <div class="d">${i.date ? h(fmtShort(i.date)) : ''}${i.time ? ' · pk ' + h(i.time) : ''}${i.week && i.type === 'smk' ? ' · minggu ' + h(i.week) : ''}</div>
      <div>${i.type === 'smk' ? '🕊️' : '⛪'} ${h(i.text)}${i.koor ? ' <b>(Koordinator)</b>' : ''}</div>
      ${i.members ? `<div class="count">${h(i.members.join(', '))}</div>` : ''}
    </div>`).join('');
  return `<button class="back" data-act="back">‹ Semua petugas</button>
    <h2 style="margin:0 0 10px">${h(p.name)}</h2>
    <div class="list">${items}</div>
    <div class="btns" style="margin-top:12px">
      <button class="btn primary" data-act="share" data-k="${h(p.key)}">Bagikan / salin teks</button>
    </div>`;
}

function personText(p) {
  const lines = p.items.map(i => {
    const when = [i.date && fmtShort(i.date), i.time && 'pk ' + i.time].filter(Boolean).join(' ');
    const extra = i.type === 'smk' && i.members?.length ? `: ${i.members.join(', ')}` : '';
    return `• ${when} – ${i.text}${i.koor ? ' (Koordinator)' : ''}${extra}`;
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
      if (!name) { out.push(['⚠️', `SMK grup ${g.no} (${smkSlotLabel(g.slot)}) minggu ${w} belum ada petugas.`]); return; }
      if (!REGULAR.includes(g.slot)) return;
      const lm = linkedMisa(g.slot, i);
      if (!lm) out.push(['⚠️', `Jadwal misa ${g.slot} minggu ke-${i + 1} (${w}) belum dibuat, padahal ada petugas SMK grup ${g.no}.`]);
      else if (!lm.officers.some(n => norm(n) === norm(name))) {
        out.push(['❗', `${name} bertugas antar SMK grup ${g.no} (${w}) tapi tidak ada di jadwal misa ${g.slot} ${fmtShort(lm.date)}.`]);
      }
    });
  }
  const perDay = new Map();
  for (const m of S.misa) {
    const label = `${m.slot === 'LAIN' ? m.title : m.slot} ${fmtShort(m.date)}`;
    if ((m.need || 0) > m.officers.length) out.push(['⚠️', `${label}: kurang ${m.need - m.officers.length} petugas.`]);
    if (REGULAR.includes(m.slot) && !m.officers.length) out.push(['⚠️', `${label}: belum ada petugas.`]);
    if (m.officers.length && !m.coordinator) out.push(['ℹ️', `${label}: koordinator belum ditentukan.`]);
    const seen = new Set();
    for (const n of m.officers) {
      const k = norm(n);
      if (seen.has(k)) out.push(['❗', `${label}: nama "${n}" tercantum dua kali.`]);
      seen.add(k);
      const dk = m.date + '|' + k;
      if (!perDay.has(dk)) perDay.set(dk, { name: n, list: [] });
      perDay.get(dk).list.push(m.slot === 'LAIN' ? m.title : `${m.slot} ${m.time}`);
    }
  }
  for (const [dk, v] of perDay) {
    if (v.list.length > 1) out.push(['ℹ️', `${v.name} bertugas ${v.list.length}× pada ${fmtShort(dk.split('|')[0])}: ${v.list.join(', ')}.`]);
  }
  return out;
}

function renderCek(main) {
  const issues = buildIssues();
  main.innerHTML = issues.length
    ? `<div class="count" style="margin:0 2px 8px">${issues.length} catatan · ❗ perlu diperbaiki · ⚠️ belum lengkap · ℹ️ info</div>
       <div class="list">${issues.map(([ic, t]) => `<div class="issue"><span class="ic">${ic}</span><span>${h(t)}</span></div>`).join('')}</div>`
    : '<div class="ok">✅ Tidak ada masalah pada jadwal bulan ini.</div>';
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
  f.onsubmit = async e => {
    e.preventDefault();
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
    <div class="grid2">
      <label class="fld">Tanggal<input type="date" name="date" required value="${h(m.date)}"></label>
      <label class="fld">Jenis<select name="slot">${MISA_SLOTS.map(s => opt(s.key, s.key === 'LAIN' ? 'Misa khusus/lain' : `${s.key} · ${s.label}`, m.slot)).join('')}</select></label>
    </div>
    <label class="fld">Nama misa / perayaan<input name="title" value="${h(m.title)}" placeholder="Minggu Biasa"></label>
    <div class="grid2">
      <label class="fld">Jam<input name="time" value="${h(m.time)}" placeholder="17.30"></label>
      <label class="fld">Tempat<input name="place" value="${h(m.place)}" placeholder="Gereja"></label>
    </div>
    <div class="grid2">
      <label class="fld">Warna liturgi<select name="color">${Object.entries(COLORS).map(([k, v]) => opt(k, v[0], m.color)).join('')}</select></label>
      <label class="fld">Jumlah dibutuhkan<input type="number" min="0" name="need" value="${m.need || 0}"></label>
    </div>
    <div class="grid2" style="grid-template-columns:1fr auto;align-items:end">
      <label class="fld">Tambah petugas<input id="addName" list="names" placeholder="Ketik nama…"></label>
      <button type="button" class="btn" data-sh="add-name">Tambah</button>
    </div>
    <label class="fld">Petugas (satu nama per baris)<textarea name="officers" rows="10">${h(m.officers.join('\n'))}</textarea></label>
    <label class="fld">Koordinator<select name="coordinator"></select></label>
    <label class="fld">Catatan<input name="note" value="${h(m.note)}"></label>`;
  openSheet(isNew ? 'Tambah misa' : 'Ubah misa', body, {
    save: async fd => {
      const officers = String(fd.get('officers')).split('\n').map(s => s.trim()).filter(Boolean);
      const row = {
        ...m, date: fd.get('date'), slot: fd.get('slot'), title: fd.get('title').trim(), time: fd.get('time').trim(),
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
    onClick: (b, f) => {
      if (b.dataset.sh !== 'add-name') return;
      const inp = $('#addName', f), v = inp.value.trim();
      if (!v) return;
      const ta = f.elements.officers;
      ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + v;
      inp.value = ''; inp.focus(); syncKoor();
    },
  });
  const f = $('#sheetForm');
  const syncKoor = () => {
    const sel = f.elements.coordinator, cur = sel.value || m.coordinator;
    const names = f.elements.officers.value.split('\n').map(s => s.trim()).filter(Boolean);
    const selected = names.find(n => norm(n) === norm(cur)) || '';
    sel.innerHTML = opt('', '— belum ditentukan —', selected) + names.map(n => opt(n, n, selected)).join('');
  };
  f.elements.officers.addEventListener('input', syncKoor);
  f.elements.slot.addEventListener('change', () => {
    const s = MISA_SLOTS.find(x => x.key === f.elements.slot.value);
    if (s?.time) f.elements.time.value = s.time;
    if (s && s.key !== 'LAIN' && !f.elements.title.value) f.elements.title.value = 'Minggu Biasa';
  });
  syncKoor();
}

/* ---- Edit grup SMK ---- */
const memberBlock = (m = {}) => `<div class="mem-edit">
  <button type="button" class="icon-btn rm" data-sh="rm-mem" aria-label="Hapus umat">✕</button>
  <label class="fld">Nama<input data-f="nama" value="${h(m.nama)}" required></label>
  <div class="grid2">
    <label class="fld">Lingkungan<input data-f="lingkungan" value="${h(m.lingkungan)}"></label>
    <label class="fld">Telp / HP<input data-f="telp" value="${h(m.telp)}" inputmode="tel"></label>
  </div>
  <label class="fld">Alamat<input data-f="alamat" value="${h(m.alamat)}"></label>
</div>`;

function openSmk(g) {
  const isNew = !g;
  const maxNo = Math.max(0, ...S.smk.map(x => Number(x.no) || 0));
  g = g ? structuredClone(g) : {
    id: uid(), month_id: S.monthId, slot: 'M1', no: String(maxNo + 1),
    sort: Math.max(-1, ...S.smk.map(x => x.sort ?? 0)) + 1, officers: [], members: [{}],
  };
  const body = `
    <div class="grid2">
      <label class="fld">No<input name="no" value="${h(g.no)}"></label>
      <label class="fld">Jam layanan<select name="slot">${SMK_SLOTS.map(s => opt(s.key, s.label, g.slot)).join('')}</select></label>
    </div>
    <div class="fld">Petugas per minggu</div>
    <div class="grid2">${weeks().map((w, i) => `<label class="fld">${h(w)}<input name="off${i}" list="names" value="${h(g.officers[i] || '')}"></label>`).join('')}</div>
    <div class="fld">Umat yang dilayani</div>
    <div id="memWrap" style="display:flex;flex-direction:column;gap:8px">${g.members.map(memberBlock).join('')}</div>
    <button type="button" class="btn small" data-sh="add-mem">＋ Tambah umat</button>`;
  openSheet(isNew ? 'Tambah grup SMK' : `Ubah grup SMK ${g.no}`, body, {
    save: async (fd, f) => {
      const members = $$('.mem-edit', f).map(el => Object.fromEntries($$('[data-f]', el).map(i => [i.dataset.f, i.value.trim()])))
        .filter(m => m.nama);
      const row = {
        ...g, no: fd.get('no').trim(), slot: fd.get('slot'),
        officers: weeks().map((_, i) => (fd.get('off' + i) || '').trim()), members,
      };
      await store.upsert('smk_groups', [row]);
      const i = S.smk.findIndex(x => x.id === row.id);
      if (i >= 0) S.smk[i] = row; else S.smk.push(row);
      render(); toast('Tersimpan');
    },
    del: isNew ? null : async () => {
      await store.remove('smk_groups', g.id);
      S.smk = S.smk.filter(x => x.id !== g.id); render(); toast('Dihapus');
    },
    onClick: (b, f) => {
      if (b.dataset.sh === 'add-mem') {
        $('#memWrap', f).insertAdjacentHTML('beforeend', memberBlock());
        $('#memWrap', f).lastElementChild.querySelector('input').focus();
      } else if (b.dataset.sh === 'rm-mem') b.closest('.mem-edit').remove();
    },
  });
}

/* ---- Bulan ---- */
function openNewMonth() {
  const base = S.monthId ? parseD(S.monthId + '-01') : new Date();
  const next = new Date(base.getFullYear(), base.getMonth() + (S.monthId ? 1 : 0), 1);
  const body = `
    <label class="fld">Bulan<input type="month" name="ym" required value="${iso(next).slice(0, 7)}"></label>
    ${S.monthId ? `<label><input type="checkbox" name="copy" checked> Salin daftar grup & umat SMK dari ${h(monthName(S.monthId))} (petugas dikosongkan, kecuali privat/Jumat)</label>` : ''}
    <label><input type="checkbox" name="gen" checked> Buat slot misa rutin M1–M4 untuk tiap akhir pekan</label>
    <p class="hint">Minggu dihitung dari hari Minggu di bulan tersebut.</p>`;
  openSheet('Bulan baru', body, {
    saveLabel: 'Buat',
    save: async fd => {
      const ym = fd.get('ym');
      if (S.months.some(m => m.id === ym)) { toast('Bulan itu sudah ada'); return false; }
      const we = weekendsOf(ym);
      const month = { id: ym, weeks: we.map(w => w.label), notes: curMonth()?.notes || '' };
      const misa = [], groups = [];
      if (fd.get('gen')) {
        for (const w of we) {
          for (const s of REGULAR) {
            misa.push({
              id: uid(), month_id: ym, date: s === 'M1' ? w.sat : w.sun, slot: s, title: 'Minggu Biasa',
              time: slotByKey(s).time, place: '', color: 'hijau', need: 0, officers: [], coordinator: '', note: '',
            });
          }
        }
      }
      if (fd.get('copy')) {
        for (const g of S.smk) {
          const fixed = !REGULAR.includes(g.slot);
          groups.push({ ...structuredClone(g), id: uid(), month_id: ym, officers: we.map(() => (fixed ? g.officers[0] || '' : '')) });
        }
      }
      await store.upsert('months', [month]);
      await store.upsert('misa', misa);
      await store.upsert('smk_groups', groups);
      S.monthId = ym;
      await loadMonths(); toast(`${monthName(ym)} dibuat`);
    },
  });
}
const slotByKey = k => MISA_SLOTS.find(s => s.key === k);

function openMonthSettings() {
  const m = curMonth();
  const body = `
    <label class="fld">Label minggu (satu per baris, urutan = kolom petugas SMK)<textarea name="weeks" rows="5">${h(m.weeks.join('\n'))}</textarea></label>
    <label class="fld">Catatan untuk petugas SMK<textarea name="notes" rows="7">${h(m.notes)}</textarea></label>`;
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
    ['new-month', '📅 Buat bulan baru'],
    S.monthId && ['settings', '⚙️ Pengaturan bulan ini (label minggu, catatan)'],
    S.monthId && ['print', '🖨️ Cetak jadwal ' + (S.tab === 'smk' ? 'SMK' : 'misa')],
    S.monthId && ['csv', '📄 Export daftar SMK (CSV/Excel)'],
    ['backup', '💾 Backup semua data (JSON)'],
    ['import', '📥 Import dari backup JSON'],
    window.SEED && !hasSeed && ['load-seed', '🧾 Muat data Oktober 2026'],
    ONLINE && ['logout', '🚪 Keluar'],
  ].filter(Boolean);
  const body = `<div class="menu-list">${items.map(([k, l]) => `<button type="button" data-sh="menu" data-k="${k}">${h(l)}</button>`).join('')}</div>
    <p class="hint">Mode: ${ONLINE ? 'Online (Supabase)' : 'Lokal – data hanya di perangkat ini. Isi config.js untuk menyambung ke Supabase.'}</p>`;
  openSheet('Menu', body, {
    onClick: (b) => { dlg.close(); menuAction(b.dataset.k); },
  });
}

async function menuAction(k) {
  if (k === 'new-month') openNewMonth();
  else if (k === 'settings') openMonthSettings();
  else if (k === 'print') printView();
  else if (k === 'csv') exportCsv();
  else if (k === 'backup') run(backup);
  else if (k === 'import') $('#importFile').click();
  else if (k === 'load-seed') run(loadSeed);
  else if (k === 'logout') { await store.sb.auth.signOut(); location.reload(); }
}

async function importData(data, msg) {
  const withId = rows => (rows || []).map(r => ({ ...r, id: r.id || uid() }));
  await store.upsert('months', data.months || []);
  await store.upsert('misa', withId(data.misa));
  await store.upsert('smk_groups', withId(data.smk_groups));
  await loadMonths(); toast(msg);
}
async function loadSeed() {
  const seed = structuredClone(window.SEED);
  S.monthId = seed.months[0].id;
  await importData(seed, 'Data Oktober 2026 dimuat');
}
async function backup() {
  const [months, misa, smk_groups] = await Promise.all([store.list('months'), store.list('misa'), store.list('smk_groups')]);
  download(`prodiakon-backup-${iso(new Date())}.json`, JSON.stringify({ app: 'prodiakon', version: 1, months, misa, smk_groups }, null, 1), 'application/json');
}
$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  await run(async () => {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.months)) throw new Error('File bukan backup aplikasi ini');
    if (!confirm(`Import ${data.months.length} bulan, ${data.misa?.length || 0} misa, ${data.smk_groups?.length || 0} grup SMK? Data dengan ID sama akan ditimpa.`)) return;
    await importData(data, 'Import selesai');
  });
});

function exportCsv() {
  const W = weeks();
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['No', 'Jam layanan', ...W, 'Nama umat', 'Lingkungan', 'Alamat', 'Telp']];
  for (const s of SMK_SLOTS) {
    for (const g of S.smk.filter(x => x.slot === s.key)) {
      (g.members.length ? g.members : [{}]).forEach((m, i) => rows.push([
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
        const ms = g.members.length ? g.members : [{}];
        ms.forEach((m, i) => {
          rows += `<tr>${i ? '' : `<td rowspan="${ms.length}">${h(g.no)}</td>${W.map((_, j) => `<td rowspan="${ms.length}">${h(g.officers[j] || '')}</td>`).join('')}`}
            <td>${h(m.nama)}</td><td>${h(m.lingkungan)}</td><td>${h(m.alamat)}</td><td>${h(m.telp)}</td></tr>`;
        });
      }
    }
    p.innerHTML = `<h2>DAFTAR PETUGAS PRODIAKON LAYANAN ANTARAN SMK – ${h(title.toUpperCase())}</h2>
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
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, id, k } = el.dataset;
  if (act === 'misa-filter') { S.misaFilter = k; render(); }
  else if (act === 'edit-misa') openMisa(S.misa.find(m => m.id === id));
  else if (act === 'edit-smk') openSmk(S.smk.find(g => g.id === id));
  else if (act === 'person') { S.person = k; render(); window.scrollTo(0, 0); }
  else if (act === 'back') { S.person = null; render(); }
  else if (act === 'load-seed') run(loadSeed);
  else if (act === 'new-month') openNewMonth();
  else if (act === 'share') {
    const p = buildAssignments().find(x => x.key === k);
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
$('#fab').addEventListener('click', () => (S.tab === 'smk' ? openSmk() : openMisa()));
document.addEventListener('visibilitychange', () => {
  // ambil perubahan dari pengguna lain saat app dibuka kembali
  if (!document.hidden && ONLINE && !dlg.open && !$('#app').hidden) run(loadMonth);
});

/* ================= Boot ================= */
async function showApp() {
  $('#login').hidden = true; $('#app').hidden = false;
  await run(loadMonths);
}
async function boot() {
  store = ONLINE ? new SupaStore() : new LocalStore();
  $('#modeBadge').textContent = ONLINE ? 'Online' : 'Lokal';
  if (!ONLINE) return showApp();
  const { data } = await store.sb.auth.getSession();
  if (data.session) return showApp();
  $('#login').hidden = false;
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    $('#loginErr').textContent = '';
    const { error } = await store.sb.auth.signInWithPassword({ email: fd.get('email'), password: fd.get('password') });
    if (error) $('#loginErr').textContent = 'Login gagal: ' + error.message;
    else showApp();
  });
}
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
