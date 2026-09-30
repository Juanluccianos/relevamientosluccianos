/*
 * Relevamientos Lucciano's — app (vanilla JS, sin dependencias)
 */

// ↓↓↓ CAMBIAR por la URL de tu Worker (sin barra final)
const API = 'https://relevamientos-api.lucciano-viaticos.workers.dev';
const VERSION = '2.4.0';
const PLAZO_DIAS = 7;          // mismo plazo que el Worker para corregir un incumplimiento
const PLAZO_DIAS_CRITICO = 2;
const DISTANCIA_MAX = 300; // metros: más lejos que esto, se marca como "cargado fuera del local"

/* ================================================================ utilidades */

const ESCALAS = {
  aprobado: 'Aprobado',
  observado: 'Observado',
  urgente: 'Atención urgente',
  critico: 'Crítico',
  sd: 'Sin dato'
};
const ORDEN_ESCALAS = ['critico', 'urgente', 'observado', 'aprobado', 'sd'];

const escala = s => s == null ? 'sd' : s >= 90 ? 'aprobado' : s >= 80 ? 'observado' : s >= 51 ? 'urgente' : 'critico';
const fmt = s => s == null ? 'S/D' : Number(s).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const periodoDe = iso => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 7);
const periodoActual = () => periodoDe(new Date().toISOString());
const fecha = iso => iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const mesLabel = p => {
  const [y, m] = p.split('-').map(Number);
  const t = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const mesCorto = p => {
  const [y, m] = p.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
};
// "Lucciano's Alem" → "Alem": el logo ya dice Lucciano's, así el nombre del local entra entero
const nom = n => String(n || '').replace(/^Lucciano[’'´`]?s\s+(•\s*)?/i, '');
const primerNombre = n => String(n || '').split(' ')[0];
const esJefe = () => ['admin', 'jefe'].includes(S.user?.role);

function distancia(lat1, lng1, lat2, lng2) {
  const R = 6371000, r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lng2 - lng1) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
/* ---- logo: negro sobre fondo claro, blanco sobre la barra oscura; si no carga, muestra el nombre en texto */
function logo(clase, variante = 'negro') {
  return `<span class="logo-wrap ${clase}"><img src="logo-${variante}.png" alt="Lucciano's" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="logo-txt" hidden>Lucciano's</span></span>`;
}

/* ---- campo de clave con ojito para mostrar u ocultar */
const OJO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const OJO_TACHADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10.1 10.1 0 0 1 12 19c-7 0-11-7-11-7a18.5 18.5 0 0 1 5.1-5.9"/><path d="M9.9 4.2A9.4 9.4 0 0 1 12 4c7 0 11 7 11 7a18.6 18.6 0 0 1-2.2 3.2"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2"/><path d="M1 1l22 22"/></svg>';
function campoClave(etiqueta, name, attrs = '') {
  return `<label>${etiqueta}<span class="clave-wrap"><input name="${name}" type="password" ${attrs}><button type="button" class="ojo" aria-label="Mostrar clave" aria-pressed="false">${OJO}</button></span></label>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('.ojo');
  if (!b) return;
  e.preventDefault();
  const inp = b.previousElementSibling;
  const ver = inp.type === 'password';
  inp.type = ver ? 'text' : 'password';
  b.innerHTML = ver ? OJO_TACHADO : OJO;
  b.setAttribute('aria-label', ver ? 'Ocultar clave' : 'Mostrar clave');
  b.setAttribute('aria-pressed', ver);
  inp.focus();
});

/* ---- validación de formularios con mensajes claros */
const emailValido = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
function validar(form) {
  for (const inp of form.querySelectorAll('input, select, textarea')) {
    const nombre = (inp.closest('label')?.childNodes[0]?.textContent || 'este campo').trim().replace(/\s*\(.*\)$/, '');
    const v = inp.value.trim();
    if (inp.required && !v) return `Completá el campo "${nombre}"`;
    if (inp.dataset.email !== undefined && v && !emailValido(v)) return 'El email tiene que tener un @ y un dominio, por ejemplo nombre@luccianos.com.ar';
    if (inp.minLength > 0 && v && v.length < inp.minLength) return `"${nombre}" tiene que tener al menos ${inp.minLength} caracteres`;
  }
  return null;
}
function errorForm(msg) {
  const el = $('#err');
  if (!el) return toast(msg);
  el.textContent = msg;
  el.hidden = !msg;
}

const fmtDist = m => m >= 1000 ? `${(m / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`;

// Mismo cálculo que el Worker (y que Linkup): puntos por capítulo, ponderados por el peso de cada capítulo.
// Cumple = todos los puntos, Parcial = la mitad, N/A no cuenta. Tope 100; crítico fallado, tope 79.
const VALOR_PUNTOS = { ok: 1, partial: 0.5, fail: 0 };
function puntosCapitulo(resp, items) {
  let ok = 0, tot = 0;
  for (const it of items) {
    const v = resp[it.id]?.valor;
    if (!v || v === 'na') continue;
    tot += it.weight;
    ok += it.weight * VALOR_PUNTOS[v];
  }
  return { ok, tot };
}
function calcularPuntaje(resp, items) {
  const pesos = new Map((S.cat?.chapters || []).map(c => [c.id, c.weight ?? 1]));
  const porCap = new Map();
  let crit = false;
  for (const it of items) {
    if (!porCap.has(it.chapter_id)) porCap.set(it.chapter_id, []);
    porCap.get(it.chapter_id).push(it);
    if (resp[it.id]?.valor === 'fail' && it.critical) crit = true;
  }
  let sw = 0, sum = 0;
  for (const [cap, its] of porCap) {
    const { ok, tot } = puntosCapitulo(resp, its);
    if (!tot) continue;
    const w = pesos.get(cap) ?? 1;
    sw += w;
    sum += w * ok / tot;
  }
  if (!sw) return null;
  let s = Math.min(100, Math.round(sum / sw * 10000) / 100);
  if (crit) s = Math.min(s, 79);
  return s;
}
const fmtPeso = n => Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPts = n => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 1 });

const ICON = {
  inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/></svg>',
  locales: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9h18"/><path d="M10 20v-6h4v6"/></svg>',
  resumen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 1.2 14H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 7 2.6 1.7 1.7 0 0 0 8 1.1V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V7a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  cuenta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 12a9 9 0 0 1 15.4-6.4L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/></svg>',
  atras: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  derecha: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  cruz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  mitad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/></svg>',
  menos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  sube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  baja: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  descarga: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
  buscar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  alerta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  nube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.3A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
  tareas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/></svg>',
  estrella: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 14h6M9 17h4"/></svg>',
  mas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  reloj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  llave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2"/></svg>',
  salir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  camara: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="4"/></svg>'
};

/* ================================================================ anillo de puntaje */

// Anillo que se llena según el puntaje; el color marca la escala.
function anillo(score, tam = 's') {
  const e = escala(score);
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score));
  const r = 20, c = 2 * Math.PI * r;
  const txt = score == null ? 'S/D' : (score >= 100 ? '100' : fmt(score));
  const label = score == null ? 'Sin dato' : `${fmt(score)} puntos, ${ESCALAS[e]}`;
  return `<span class="anillo ${tam} ${e}" role="img" aria-label="${label}">
    <svg viewBox="0 0 48 48" aria-hidden="true"><circle class="pista" cx="24" cy="24" r="${r}"/>
    <circle class="arco" cx="24" cy="24" r="${r}" stroke-dasharray="${(pct / 100 * c).toFixed(2)} ${c.toFixed(2)}"/></svg>
    <b>${txt}</b></span>`;
}
const chipEscala = e => `<span class="chip-escala ${e}">${ESCALAS[e]}</span>`;

/* ================================================================ estado */

const S = {
  token: localStorage.getItem('rl_token'),
  user: JSON.parse(localStorage.getItem('rl_user') || 'null'),
  cat: JSON.parse(localStorage.getItem('rl_cat') || 'null'),
  syncing: false,
  rid: 0,
  cont: null,       // contador de tareas para el badge
  filtroTareas: 'abiertas',
  adminTab: 'usuarios'
};

/* ================================================================ API */

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}),
        ...(opts.headers || {})
      }
    });
  } catch {
    throw new Error('No hay conexión con el servidor. Revisá tu internet.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (res.status === 401 && S.token) {
    salir();
    throw new Error(data?.error || 'Tu sesión venció. Volvé a ingresar.');
  }
  if (!res.ok) throw new Error(data?.error || `El servidor respondió con error ${res.status}`);
  return data;
}
const post = (path, data, method = 'POST') => api(path, { method, body: JSON.stringify(data) });

async function cargarCatalogo() {
  const d = await api('/api/catalogo');
  S.cat = d;
  localStorage.setItem('rl_cat', JSON.stringify(d));
  return d;
}

function entrar(d) {
  S.token = d.token;
  S.user = d.user;
  localStorage.setItem('rl_token', d.token);
  localStorage.setItem('rl_user', JSON.stringify(d.user));
  cargarCatalogo().catch(() => {}).finally(() => {
    location.hash = '#/';
    render();
    sincronizar();
  });
}

function salir() {
  S.token = null;
  S.user = null;
  localStorage.removeItem('rl_token');
  localStorage.removeItem('rl_user');
  location.hash = '#/login';
}

/* ================================================================ IndexedDB */

const idb = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('relevamientos', 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('cola', { keyPath: 'id' });
        r.result.createObjectStore('borradores', { keyPath: 'store_id' });
      };
      r.onsuccess = () => res(this.db = r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async tx(store, mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req?.result);
      t.onerror = () => rej(t.error);
    });
  },
  get(store, key) { return this.tx(store, 'readonly', s => s.get(key)); },
  all(store) { return this.tx(store, 'readonly', s => s.getAll()); },
  put(store, val) { return this.tx(store, 'readwrite', s => s.put(val)); },
  del(store, key) { return this.tx(store, 'readwrite', s => s.delete(key)); }
};

/* ================================================================ fotos */

async function comprimir(file) {
  let img;
  try {
    img = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('No se pudo leer la foto'));
      i.src = URL.createObjectURL(file);
    });
  }
  const max = 1280;
  const w = img.width, h = img.height;
  const r = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * r);
  c.height = Math.round(h * r);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.72));
}

function blobA64(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1]);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}

// Las fotos del historial de Linkup se ven desde su link original; las nuevas, a través del Worker
const fotoSrc = f => f.url || fotoUrl(f.drive_id);
const fotoUrl = driveId => `${API}/api/foto/${encodeURIComponent(driveId)}?t=${encodeURIComponent(S.token)}`;

/* ================================================================ sincronización */

const nombreLocal = id => nom(S.cat?.stores.find(s => s.id === id)?.name) || `Local ${id}`;

async function sincronizar() {
  if (S.syncing || !navigator.onLine || !S.token) return;
  S.syncing = true;
  actualizarBadge();
  try {
    const cola = await idb.all('cola');
    for (const r of cola) {
      try {
        if (!r.subido) {
          const out = await post('/api/relevamientos', {
            id: r.id, store_id: r.store_id, periodo: r.periodo, respuestas: r.respuestas,
            notas: r.notas, lat: r.lat, lng: r.lng, creado_cliente: r.creado,
            firma_nombre: r.firma_nombre, firma_png: r.firma_png
          });
          r.subido = true;
          r.score = out.score;
          r.tareas = out.tareas || 0;
          r.error = null;
          await idb.put('cola', r);
        }
        for (const f of r.fotos) {
          if (f.subida) continue;
          await post(`/api/relevamientos/${r.id}/fotos`, {
            pid: f.pid, item_id: f.item_id, mime: f.blob.type || 'image/jpeg', data: await blobA64(f.blob)
          });
          f.subida = true;
          await idb.put('cola', r);
        }
        await idb.del('cola', r.id);
        toast(`${nombreLocal(r.store_id)}: relevamiento enviado${r.tareas ? `, ${r.tareas} ${r.tareas === 1 ? 'tarea nueva' : 'tareas nuevas'}` : ''}`);
        S.cont = null;
      } catch (e) {
        r.error = e.message;
        await idb.put('cola', r);
      }
    }
  } finally {
    S.syncing = false;
    actualizarBadge();
    if (location.hash.startsWith('#/pendientes')) render();
  }
}

async function actualizarContador() {
  if (!S.token || !navigator.onLine) return pintarContador();
  try { S.cont = await api('/api/tareas/contador'); } catch { /* sin conexión */ }
  pintarContador();
}
function pintarContador() {
  const el = $('#badge-tareas');
  if (!el || !S.cont) return;
  const n = S.cont.vencidas || 0;
  el.hidden = n === 0;
  el.textContent = n > 99 ? '99+' : n;
  el.title = `${n} tareas vencidas`;
}

async function actualizarBadge() {
  const el = $('#sync-badge');
  if (!el) return;
  const n = (await idb.all('cola')).length;
  el.hidden = n === 0;
  el.textContent = n;
}

/* ================================================================ UI base */

function toast(msg) {
  let t = $('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('ver');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('ver'), 3200);
}

function nav() {
  const h = location.hash || '#/';
  const links = [
    ['#/', 'Inicio', ICON.inicio, h === '#/' || h === '#'],
    ['#/locales', 'Locales', ICON.locales, h.startsWith('#/locales') || h.startsWith('#/local/')],
    ['#/tareas', 'Tareas', ICON.tareas, h.startsWith('#/tarea'), 'tareas'],
    ...(esJefe() ? [['#/resumen', 'Resumen', ICON.resumen, h.startsWith('#/resumen')]] : []),
    ['#/cuenta', 'Cuenta', ICON.cuenta, h.startsWith('#/cuenta') || h.startsWith('#/admin')]
  ];
  return `<nav class="nav">${links.map(([href, txt, ico, act, extra]) =>
    `<a href="${href}" class="${act ? 'activo' : ''}" ${act ? 'aria-current="page"' : ''}>${ico}<span>${txt}</span>${extra === 'tareas' ? '<i class="nav-badge" id="badge-tareas" hidden></i>' : ''}</a>`).join('')}</nav>`;
}

function pintar(v) {
  const app = $('#app');
  if (v.sinNav) {
    app.innerHTML = v.html;
  } else {
    app.innerHTML = `
      <header class="top">
        ${v.atras
          ? `<a class="top-btn" href="${v.atras}" aria-label="Volver">${ICON.atras}</a>`
          : logo('marca', 'blanco')}
        <h1>${esc(v.titulo)}</h1>
        <a class="top-btn" href="#/pendientes" aria-label="Relevamientos pendientes de enviar">${ICON.sync}<span class="badge" id="sync-badge" hidden></span></a>
      </header>
      <main class="vista">${v.html}</main>
      ${nav()}`;
  }
  window.scrollTo(0, 0);
  v.montar?.(app);
  actualizarBadge();
  pintarContador();
  actualizarContador();
}

const cargando = () => $('#app .vista') ? ($('#app .vista').innerHTML = '<div class="cargando" aria-label="Cargando"></div>') : null;

/* ================================================================ router */

const RUTAS = [
  [/^#\/login$/, vLogin, true],
  [/^#\/instalar$/, vInstalar, true],
  [/^#\/?$/, vInicio],
  [/^#\/locales$/, vLocales],
  [/^#\/local\/(\d+)$/, vLocal],
  [/^#\/relevar\/(\d+)$/, vRelevar],
  [/^#\/rel\/([0-9a-f-]{36})$/i, vRelevamiento],
  [/^#\/resumen$/, vResumen],
  [/^#\/pendientes$/, vPendientes],
  [/^#\/admin$/, vAdmin],
  [/^#\/cuenta$/, vCuenta],
  [/^#\/tareas$/, vTareas],
  [/^#\/tareas\/nueva$/, vTareaNueva],
  [/^#\/tarea\/(\d+)$/, vTarea]
];

async function render() {
  const id = ++S.rid;
  const h = location.hash || '#/';
  for (const [re, fn, publica] of RUTAS) {
    const m = h.match(re);
    if (!m) continue;
    if (!publica && !S.token) { location.hash = '#/login'; return; }
    cargando();
    let v;
    try {
      v = await fn(...m.slice(1));
    } catch (e) {
      v = {
        titulo: 'No se pudo cargar',
        atras: '#/',
        html: `<div class="vacio"><p>${esc(e.message)}</p><button class="btn" onclick="render()">Reintentar</button></div>`
      };
    }
    if (id !== S.rid || !v) return;
    pintar(v);
    return;
  }
  location.hash = '#/';
}

/* ================================================================ vistas: acceso */

function vLogin() {
  if (S.token) { location.hash = '#/'; return null; }
  return {
    sinNav: true,
    html: `
      <div class="login-fondo"><div class="login">
        <div class="login-marca">${logo('logo-grande', 'blanco')}<p>Relevamientos de locales</p></div>
        <form id="f-login" class="card form" novalidate>
          <label>Email<input name="email" type="email" inputmode="email" autocomplete="username" required data-email></label>
          ${campoClave('Clave', 'clave', 'autocomplete="current-password" required')}
          <p class="error" id="err" hidden></p>
          <button class="btn primario" type="submit">Ingresar</button>
        </form>
        <a class="link-sutil" href="#/instalar">¿Primera vez? Configurar la app</a>
      </div></div>`,
    montar() {
      $('#f-login').onsubmit = async e => {
        e.preventDefault();
        const malo = validar(e.target);
        if (malo) return errorForm(malo);
        const f = new FormData(e.target);
        const btn = e.target.querySelector('button[type=submit]');
        btn.disabled = true;
        errorForm('');
        try {
          entrar(await post('/api/login', { email: f.get('email'), clave: f.get('clave') }));
        } catch (err) {
          $('#err').textContent = err.message;
          $('#err').hidden = false;
          btn.disabled = false;
        }
      };
    }
  };
}

function vInstalar() {
  return {
    sinNav: true,
    html: `
      <div class="login-fondo"><div class="login">
        <div class="login-marca">${logo('logo-grande', 'blanco')}<p>Crear el primer administrador</p></div>
        <form id="f-setup" class="card form" novalidate>
          ${campoClave('Clave de instalación', 'ci', 'autocomplete="off" required')}
          <label>Tu nombre<input name="nombre" autocomplete="name" required></label>
          <label>Email<input name="email" type="email" inputmode="email" autocomplete="username" required data-email></label>
          ${campoClave('Clave (mínimo 8 caracteres)', 'clave', 'autocomplete="new-password" minlength="8" required')}
          <p class="error" id="err" hidden></p>
          <button class="btn primario" type="submit">Crear administrador</button>
        </form>
        <a class="link-sutil" href="#/login">Ya tengo usuario</a>
      </div></div>`,
    montar() {
      $('#f-setup').onsubmit = async e => {
        e.preventDefault();
        const malo = validar(e.target);
        if (malo) return errorForm(malo);
        const f = new FormData(e.target);
        try {
          entrar(await post('/api/setup', {
            clave_instalacion: f.get('ci'), nombre: f.get('nombre'), email: f.get('email'), clave: f.get('clave')
          }));
        } catch (err) {
          $('#err').textContent = err.message;
          $('#err').hidden = false;
        }
      };
    }
  };
}

/* ================================================================ vistas: inicio */

function filaLocal(l, conBoton = false) {
  const e = l.escala || escala(l.score);
  const delta = (l.score != null && l.prev_score != null) ? Math.round((l.score - l.prev_score) * 10) / 10 : null;
  const deltaHtml = delta ? `<span class="delta ${delta > 0 ? 'sube' : 'baja'}">${delta > 0 ? ICON.sube : ICON.baja}${fmt(Math.abs(delta))}</span>` : '';
  const detalle = l.score == null && l.prev_score != null
    ? `Anterior ${fmt(l.prev_score)}`
    : (l.supervisor_name || l.code);
  return `
    <div class="fila">
      <a href="#/local/${l.id}" class="fila-link">
        ${anillo(l.score)}
        <span class="fila-txt"><strong>${esc(nom(l.name))}</strong><small>${esc(l.code)} · ${esc(detalle)}</small></span>
        ${conBoton ? '' : `<span class="fila-der">${deltaHtml}<span class="flecha">${ICON.derecha}</span></span>`}
      </a>
      ${conBoton
        ? `<a class="btn chico ${l.score == null ? 'primario' : ''}" href="#/relevar/${l.id}">${l.score == null ? 'Relevar' : 'Repetir'}</a>`
        : ''}
    </div>`;
}

async function avisosBorradores() {
  const b = await idb.all('borradores');
  if (!b.length) return '';
  return b.map(x => {
    const n = Object.values(x.resp).filter(r => r.valor).length;
    return `<a class="aviso" href="#/relevar/${x.store_id}">
      <div><strong>${esc(nombreLocal(x.store_id))}</strong><span class="sub">Relevamiento sin terminar, ${n} ítems respondidos</span></div>
      <span class="btn chico primario">Continuar</span></a>`;
  }).join('');
}

async function vInicio() {
  if (esJefe()) return vResumen();

  const periodo = periodoActual();
  let locales, offline = false;
  try {
    locales = (await api(`/api/locales?periodo=${periodo}`)).locales;
  } catch {
    offline = true;
    locales = (S.cat?.stores || []).filter(s => (s.supervisor_ids || [s.supervisor_id]).includes(S.user.id)).map(s => ({ ...s, score: null }));
  }
  const hechos = locales.filter(l => l.score != null).length;
  const pend = locales.filter(l => l.score == null);
  const listos = locales.filter(l => l.score != null);
  const pct = locales.length ? Math.round(hechos / locales.length * 100) : 0;

  return {
    titulo: 'Inicio',
    html: `
      <section class="hero">
        <p class="hero-sub">${mesLabel(periodo)}</p>
        <h2 class="hero-titulo">Hola, ${esc(primerNombre(S.user.name))}</h2>
        ${offline
          ? `<p class="hero-nota">${ICON.nube}Sin conexión. Podés relevar igual: se envía cuando vuelva la señal.</p>`
          : `<div class="hero-avance">
              <span class="hero-num">${hechos}<small>/${locales.length}</small></span>
              <span class="hero-lbl">locales relevados este mes</span>
            </div>
            <div class="barra clara"><span style="width:${pct}%"></span></div>`}
      </section>
      ${await avisosBorradores()}
      ${locales.length === 0 ? `
        <div class="vacio"><p>Todavía no tenés locales asignados. Pedile al administrador que te los asigne, o buscá cualquier local en la pestaña Locales.</p>
        <a class="btn" href="#/locales">Ver todos los locales</a></div>` : ''}
      ${pend.length ? `<div class="bloque"><h2>Para relevar este mes</h2><div class="lista">${pend.map(l => filaLocal(l, true)).join('')}</div></div>` : ''}
      ${listos.length ? `<div class="bloque"><h2>Ya relevados</h2><div class="lista">${listos.map(l => filaLocal(l, true)).join('')}</div></div>` : ''}`
  };
}

/* ================================================================ vistas: locales */

async function vLocales() {
  const periodo = periodoActual();
  let locales, offline = false;
  try {
    locales = (await api(`/api/locales?periodo=${periodo}`)).locales;
    if (S.user.role === 'supervisor') {
      // el supervisor ve sus locales con puntaje y el resto del catálogo para poder cubrir otros
      const mios = new Set(locales.map(l => l.id));
      const otros = (S.cat?.stores || []).filter(s => !mios.has(s.id)).map(s => ({ ...s, score: null, escala: 'sd', ajeno: true }));
      locales = locales.concat(otros);
    }
  } catch {
    offline = true;
    locales = (S.cat?.stores || []).map(s => ({ ...s, score: null }));
  }

  const estado = { q: '', filtro: 'todos', orden: 'peor' };

  const dibujar = () => {
    const q = estado.q.toLowerCase();
    let l = locales.filter(x =>
      (!q || x.name.toLowerCase().includes(q) || x.code.toLowerCase().includes(q) || (x.supervisor_name || '').toLowerCase().includes(q)) &&
      (estado.filtro === 'todos' || (x.escala || escala(x.score)) === estado.filtro));
    if (estado.orden === 'peor') {
      l.sort((a, b) => (a.score ?? 999) - (b.score ?? 999) || (a.prev_score ?? 999) - (b.prev_score ?? 999));
    } else {
      l.sort((a, b) => nom(a.name).localeCompare(nom(b.name), 'es'));
    }
    $('#lista-locales').innerHTML = l.length
      ? `<div class="lista">${l.map(x => filaLocal(x, x.ajeno)).join('')}</div>`
      : '<div class="vacio"><p>Ningún local coincide con la búsqueda.</p></div>';
    $('#cuenta-locales').textContent = `${l.length} locales`;
  };

  const cuenta = k => locales.filter(x => (x.escala || escala(x.score)) === k).length;

  return {
    titulo: 'Locales',
    html: `
      ${offline ? '<p class="sub">Sin conexión: mostrando el catálogo guardado, sin puntajes.</p>' : ''}
      <div class="buscador">
        <label class="buscar">${ICON.buscar}<input type="search" id="q" placeholder="Buscar por nombre, código o supervisor" autocomplete="off" aria-label="Buscar locales"></label>
        <div class="chips" id="chips">
          <button class="chip activo" data-f="todos">Todos</button>
          ${ORDEN_ESCALAS.map(k => `<button class="chip" data-f="${k}">${ESCALAS[k]} ${cuenta(k)}</button>`).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="sub" id="cuenta-locales"></span>
          <select id="orden" style="width:auto;min-height:36px">
            <option value="peor">Peor puntaje primero</option>
            <option value="az">Alfabético</option>
          </select>
        </div>
      </div>
      <div id="lista-locales"></div>`,
    montar() {
      $('#q').oninput = e => { estado.q = e.target.value; dibujar(); };
      $('#orden').onchange = e => { estado.orden = e.target.value; dibujar(); };
      $('#chips').onclick = e => {
        const b = e.target.closest('.chip');
        if (!b) return;
        estado.filtro = b.dataset.f;
        $$('.chip').forEach(c => c.classList.toggle('activo', c === b));
        dibujar();
      };
      dibujar();
    }
  };
}

async function vLocal(id) {
  const d = await api(`/api/locales/${id}`);
  const l = d.local;
  const ult = d.historial[0];
  const e = ult ? ult.escala : 'sd';
  const deEsteMes = ult && ult.period === periodoActual();

  return {
    titulo: l.code,
    atras: '#/locales',
    html: `
      <section class="hero">
        <div class="hero-ficha">
          <div>
            <p class="hero-sub">${esc(l.code)}</p>
            <h2 class="hero-titulo">${esc(nom(l.name))}</h2>
            <p class="hero-meta">${esc(l.supervisor_name || 'Sin supervisor asignado')}</p>
            <p class="hero-meta">${ult ? `Último relevamiento ${fecha(ult.fecha)}${deEsteMes ? '' : ', mes anterior'}` : 'Nunca relevado'}</p>
            ${chipEscala(e)}
          </div>
          ${anillo(ult?.score, 'l')}
        </div>
        <a class="btn blanco ancho" href="#/relevar/${l.id}">Relevar ahora</a>
      </section>

      ${d.capitulos.length ? `
      <div class="bloque">
        <h2>Por capítulo</h2>
        <div class="card">
          ${d.capitulos.map(c => `
            <div class="cap-fila">
              <span>${esc(c.nombre)}<small class="sub">${c.posibles ? ` ${fmtPts(c.puntos)}/${fmtPts(c.posibles)} ptos` : ' No aplica'}</small></span>
              <b class="txt-${c.escala}">${c.posibles ? fmt(c.score) : 'N/A'}</b>
              <div class="barra"><span class="${c.escala}" style="width:${c.score ?? 0}%"></span></div>
            </div>`).join('')}
        </div>
      </div>` : ''}

      ${d.tareas.length ? `
      <div class="bloque">
        <h2>Tareas abiertas (${d.tareas.length})</h2>
        <div class="lista">${d.tareas.map(t => filaTarea({ ...t, store_name: l.name, code: l.code }, true)).join('')}</div>
      </div>` : ''}

      <div class="bloque">
        <h2>Historial</h2>
        ${d.historial.length ? `<div class="lista">${d.historial.map(h => `
          <a class="fila" href="#/rel/${h.id}">
            ${anillo(h.score)}
            <span class="fila-txt"><strong>${mesLabel(h.period)}</strong><small>${fecha(h.fecha)} · ${esc(h.usuario)}${h.distance_m > DISTANCIA_MAX ? ` · a ${fmtDist(h.distance_m)} del local` : ''}</small></span>
            <span class="fila-der"><span class="flecha">${ICON.derecha}</span></span>
          </a>`).join('')}</div>` : '<div class="vacio"><p>Este local todavía no tiene relevamientos.</p></div>'}
      </div>`
  };
}

/* ================================================================ vistas: relevar */

async function vRelevar(storeId) {
  storeId = Number(storeId);
  if (!S.cat) await cargarCatalogo();
  const local = S.cat.stores.find(s => s.id === storeId);
  if (!local) throw new Error('Ese local no está en el catálogo guardado. Entrá a Cuenta y tocá "Actualizar datos".');
  if (!S.cat.items.length) throw new Error('El checklist está vacío. El administrador tiene que cargarlo desde Admin.');

  let b = await idb.get('borradores', storeId);
  if (!b) {
    b = { store_id: storeId, id: crypto.randomUUID(), creado: new Date().toISOString(), resp: {}, fotos: [], notas: '', lat: null, lng: null };
  }
  const items = S.cat.items;
  const caps = S.cat.chapters
    .map(c => {
      const its = items.filter(i => i.chapter_id === c.id);
      const secciones = [];
      for (const i of its) {
        const nombre = i.section || c.name;
        let sec = secciones.find(x => x.nombre === nombre);
        if (!sec) secciones.push(sec = { nombre, items: [] });
        sec.items.push(i);
      }
      return { ...c, items: its, secciones };
    })
    .filter(c => c.items.length);

  const OPCIONES = [['ok', 'Cumple'], ['partial', 'Parcial'], ['fail', 'No cumple'], ['na', 'N/A']];
  const itemHtml = i => {
    const r = b.resp[i.id] || {};
    return `
      <div class="item" data-item="${i.id}">
        <p>${esc(i.text)}<span class="pts">${fmtPts(i.weight)} ${i.weight === 1 ? 'pto' : 'ptos'}</span>${i.critical ? '<span class="tag-crit">Crítico</span>' : ''}</p>
        <div class="opciones" role="group" aria-label="Respuesta">
          ${OPCIONES.map(([v, t]) => `<button type="button" data-v="${v}" class="op ${v} ${r.valor === v ? 'sel' : ''}" aria-pressed="${r.valor === v}">${t}</button>`).join('')}
        </div>
        <div class="item-extra">
          <input type="text" class="coment" placeholder="Comentario (opcional)" value="${esc(r.comentario || '')}">
          <label class="foto-btn">${ICON.camara}Foto<input type="file" accept="image/*" capture="environment" hidden></label>
        </div>
        <p class="hint-tarea" ${r.valor === 'fail' || r.valor === 'partial' ? '' : 'hidden'}>${ICON.reloj}Se va a crear una tarea para corregirlo en ${i.critical ? PLAZO_DIAS_CRITICO : PLAZO_DIAS} días</p>
        <div class="thumbs"></div>
      </div>`;
  };

  let tGuardar;
  const guardarBorrador = () => {
    clearTimeout(tGuardar);
    tGuardar = setTimeout(() => idb.put('borradores', b), 400);
  };

  const actualizarPuntaje = () => {
    const s = calcularPuntaje(b.resp, items);
    const n = items.filter(i => b.resp[i.id]?.valor).length;
    const el = $('#live-score');
    if (!el) return;
    el.innerHTML = anillo(s, 'm');
    $('#live-prog').textContent = `${n} de ${items.length}`;
    $('#live-bar').style.width = `${Math.round(n / items.length * 100)}%`;
    for (const c of caps) {
      const { ok, tot } = puntosCapitulo(b.resp, c.items);
      const cn = c.items.filter(i => b.resp[i.id]?.valor).length;
      const todoNA = cn === c.items.length && !tot;
      const el2 = $(`[data-capscore="${c.id}"]`);
      if (el2) el2.textContent = todoNA ? 'No aplica' : cn ? `${fmtPts(ok)}/${fmtPts(tot)} ptos` : `0/${c.items.length}`;
      const bn = $(`[data-na-cap="${c.id}"]`);
      if (bn) bn.classList.toggle('on', todoNA);
      for (const sec of c.secciones) {
        const bs = $(`[data-na-sec="${c.id}|${CSS.escape(sec.nombre)}"]`);
        if (bs) bs.classList.toggle('on', sec.items.every(i => b.resp[i.id]?.valor === 'na'));
      }
    }
  };

  const marcar = (id, valor) => {
    b.resp[id] = { ...(b.resp[id] || {}), valor };
    const itemEl = $(`[data-item="${id}"]`);
    if (!itemEl) return;
    $$('.op', itemEl).forEach(x => {
      const sel = x.dataset.v === valor;
      x.classList.toggle('sel', sel);
      x.setAttribute('aria-pressed', sel);
    });
    itemEl.classList.remove('falta');
    $('.hint-tarea', itemEl).hidden = valor !== 'fail' && valor !== 'partial';
  };
  // "No aplica" para una sección o un capítulo entero; si ya estaba todo en N/A, lo desmarca
  const alternarNA = its => {
    const todo = its.every(i => b.resp[i.id]?.valor === 'na');
    its.forEach(i => marcar(i.id, todo ? null : 'na'));
    actualizarPuntaje();
    guardarBorrador();
  };

  const dibujarThumbs = itemId => {
    const cont = $(`[data-item="${itemId}"] .thumbs`);
    if (!cont) return;
    cont.innerHTML = '';
    b.fotos.filter(f => f.item_id === itemId).forEach(f => {
      const d = document.createElement('div');
      d.className = 'thumb';
      const url = URL.createObjectURL(f.blob);
      d.innerHTML = `<img src="${url}" alt="Foto del ítem"><button type="button" aria-label="Quitar foto">${ICON.cruz}</button>`;
      d.querySelector('button').onclick = () => {
        b.fotos = b.fotos.filter(x => x.pid !== f.pid);
        guardarBorrador();
        dibujarThumbs(itemId);
      };
      cont.appendChild(d);
    });
  };

  return {
    titulo: 'Relevamiento',
    atras: `#/local/${storeId}`,
    html: `
      <div class="rel-head">
        <div class="rel-head-row">
          <div><strong>${esc(nom(local.name))}</strong><small id="geo">${ICON.pin}Buscando ubicación…</small><small class="num prog" id="live-prog"></small></div>
          <div class="rel-score" id="live-score">${anillo(null, 'm')}</div>
        </div>
        <div class="barra" style="height:4px;margin-top:8px"><span id="live-bar"></span></div>
      </div>
      ${caps.map(c => `
        <section class="cap">
          <div class="cap-head">
            <h2>${esc(c.name)}</h2>
            <span class="cap-pts" data-capscore="${c.id}"></span>
            <button type="button" class="na-btn" data-na-cap="${c.id}">No aplica</button>
          </div>
          ${c.secciones.map(sec => `
            ${c.secciones.length > 1 || sec.nombre !== c.name ? `
            <div class="sec-head"><h3>${esc(sec.nombre)}</h3>
              ${c.secciones.length > 1 ? `<button type="button" class="na-btn chico" data-na-sec="${c.id}|${esc(sec.nombre)}">No aplica</button>` : ''}</div>` : ''}
            ${sec.items.map(itemHtml).join('')}`).join('')}
        </section>`).join('')}
      <div class="pie-rel">
        <label class="form"><span style="font-weight:600">Observaciones generales</span>
          <textarea id="notas" placeholder="Algo que el local tenga que saber o corregir">${esc(b.notas)}</textarea>
        </label>
        <div class="card form firma-card">
          <strong>Conformidad del encargado</strong>
          <label>Nombre de quien firma<input type="text" id="firma-nombre" value="${esc(b.firma_nombre || '')}" placeholder="Nombre y apellido" autocomplete="off"></label>
          <div class="firma-wrap">
            <canvas id="firma" aria-label="Espacio para firmar con el dedo"></canvas>
            <span class="firma-guia">Firmá acá con el dedo</span>
          </div>
          <button type="button" class="btn chico fantasma" id="firma-borrar">Borrar firma</button>
        </div>
        <button class="btn primario ancho" id="guardar">Guardar relevamiento</button>
        <button class="btn ancho fantasma" id="descartar">Descartar este relevamiento</button>
      </div>`,
    montar(app) {
      // los eventos van sobre .vista (se recrea en cada pantalla) para no acumular listeners
      const vista = $('.vista', app);
      items.forEach(i => dibujarThumbs(i.id));
      actualizarPuntaje();

      vista.addEventListener('click', e => {
        const nc = e.target.closest('[data-na-cap]');
        if (nc) return alternarNA(caps.find(c => c.id === Number(nc.dataset.naCap)).items);
        const ns = e.target.closest('[data-na-sec]');
        if (ns) {
          const [cid, ...rest] = ns.dataset.naSec.split('|');
          const cap = caps.find(c => c.id === Number(cid));
          return alternarNA(cap.secciones.find(x => x.nombre === rest.join('|')).items);
        }
        const op = e.target.closest('.op');
        if (!op) return;
        marcar(Number(op.closest('.item').dataset.item), op.dataset.v);
        actualizarPuntaje();
        guardarBorrador();
      });

      // Firma: se dibuja con el dedo o el mouse y se guarda como PNG en el borrador
      const cv = $('#firma');
      const ctx = cv.getContext('2d');
      const ajustar = () => {
        const r = cv.getBoundingClientRect(), k = window.devicePixelRatio || 1;
        cv.width = Math.round(r.width * k); cv.height = Math.round(r.height * k);
        ctx.setTransform(k, 0, 0, k, 0, 0);
        ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0a0a0a';
        if (b.firma_png) {
          const im = new Image();
          im.onload = () => ctx.drawImage(im, 0, 0, r.width, r.height);
          im.src = b.firma_png;
        }
        $('.firma-guia').hidden = !!b.firma_png;
      };
      ajustar();
      let dibujando = false, ult = null;
      const pto = ev => { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
      cv.addEventListener('pointerdown', ev => { dibujando = true; ult = pto(ev); cv.setPointerCapture(ev.pointerId); $('.firma-guia').hidden = true; ev.preventDefault(); });
      cv.addEventListener('pointermove', ev => {
        if (!dibujando) return;
        const p = pto(ev);
        ctx.beginPath(); ctx.moveTo(...ult); ctx.lineTo(...p); ctx.stroke();
        ult = p;
      });
      const fin = () => {
        if (!dibujando) return;
        dibujando = false;
        // se guarda chica para que no pese: 600 px de ancho alcanza para leerla en el PDF
        const c2 = document.createElement('canvas'), r = cv.getBoundingClientRect();
        c2.width = 600; c2.height = Math.round(600 * r.height / r.width);
        c2.getContext('2d').drawImage(cv, 0, 0, c2.width, c2.height);
        b.firma_png = c2.toDataURL('image/png');
        guardarBorrador();
      };
      cv.addEventListener('pointerup', fin);
      cv.addEventListener('pointercancel', fin);
      $('#firma-borrar').onclick = () => { b.firma_png = null; ctx.clearRect(0, 0, cv.width, cv.height); $('.firma-guia').hidden = false; guardarBorrador(); };
      $('#firma-nombre').oninput = e => { b.firma_nombre = e.target.value; guardarBorrador(); };

      vista.addEventListener('input', e => {
        if (e.target.classList.contains('coment')) {
          const id = Number(e.target.closest('.item').dataset.item);
          b.resp[id] = { ...(b.resp[id] || {}), comentario: e.target.value };
          guardarBorrador();
        } else if (e.target.id === 'notas') {
          b.notas = e.target.value;
          guardarBorrador();
        }
      });

      vista.addEventListener('change', async e => {
        if (e.target.type !== 'file' || !e.target.files[0]) return;
        const id = Number(e.target.closest('.item').dataset.item);
        const file = e.target.files[0];
        e.target.value = '';
        try {
          const blob = await comprimir(file);
          b.fotos.push({ pid: crypto.randomUUID(), item_id: id, blob });
          await idb.put('borradores', b);
          dibujarThumbs(id);
        } catch (err) {
          toast(err.message);
        }
      });

      // Ubicación
      const geo = $('#geo');
      if (!navigator.geolocation) {
        geo.innerHTML = ICON.pin + 'Este dispositivo no da ubicación';
      } else {
        navigator.geolocation.getCurrentPosition(pos => {
          b.lat = pos.coords.latitude;
          b.lng = pos.coords.longitude;
          guardarBorrador();
          if (local.lat != null && local.lng != null) {
            const d = distancia(b.lat, b.lng, local.lat, local.lng);
            geo.innerHTML = ICON.pin + (d > DISTANCIA_MAX ? `Estás a ${fmtDist(d)} del local` : 'Estás en el local');
            geo.classList.toggle('lejos', d > DISTANCIA_MAX);
          } else {
            geo.innerHTML = ICON.pin + 'Ubicación registrada';
          }
        }, () => {
          geo.innerHTML = ICON.pin + 'Sin ubicación: el permiso está bloqueado';
          geo.classList.add('lejos');
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
      }

      $('#guardar').onclick = async () => {
        const faltan = items.filter(i => !b.resp[i.id]?.valor);
        if (faltan.length) {
          faltan.forEach(i => $(`[data-item="${i.id}"]`)?.classList.add('falta'));
          $(`[data-item="${faltan[0].id}"]`).scrollIntoView({ behavior: 'smooth', block: 'center' });
          toast(`Faltan responder ${faltan.length} ${faltan.length === 1 ? 'ítem' : 'ítems'}`);
          return;
        }
        clearTimeout(tGuardar);
        const reg = {
          id: b.id,
          store_id: storeId,
          periodo: periodoDe(b.creado),
          creado: b.creado,
          respuestas: Object.entries(b.resp)
            .filter(([, r]) => r.valor)
            .map(([item_id, r]) => ({ item_id: Number(item_id), valor: r.valor, comentario: r.comentario || '' })),
          notas: b.notas,
          firma_nombre: b.firma_nombre || '',
          firma_png: b.firma_png || null,
          lat: b.lat,
          lng: b.lng,
          fotos: b.fotos.map(f => ({ ...f, subida: false })),
          subido: false,
          score: calcularPuntaje(b.resp, items)
        };
        await idb.put('cola', reg);
        await idb.del('borradores', storeId);
        toast(navigator.onLine ? 'Relevamiento guardado. Enviando…' : 'Guardado en el celular. Se envía cuando vuelva la señal.');
        location.hash = '#/pendientes';
        sincronizar();
      };

      $('#descartar').onclick = async () => {
        if (!confirm('¿Descartar este relevamiento? Se pierden las respuestas y las fotos cargadas.')) return;
        clearTimeout(tGuardar);
        await idb.del('borradores', storeId);
        location.hash = `#/local/${storeId}`;
      };
    }
  };
}

/* ================================================================ vistas: pendientes */

async function vPendientes() {
  const cola = await idb.all('cola');
  const borr = await idb.all('borradores');
  return {
    titulo: 'Pendientes de enviar',
    atras: '#/',
    html: `
      ${!cola.length && !borr.length ? `<div class="vacio"><span class="vacio-ico">${ICON.check}</span><p>Está todo enviado.</p><a class="btn" href="#/">Ir al inicio</a></div>` : ''}
      ${cola.length ? `
        <div class="lista">${cola.map(r => {
          const subidas = r.fotos.filter(f => f.subida).length;
          return `<div class="fila">
            ${anillo(r.score)}
            <span class="fila-txt"><strong>${esc(nombreLocal(r.store_id))}</strong>
              <small>${fecha(r.creado)} · ${r.subido ? 'Respuestas enviadas' : 'Respuestas sin enviar'} · Fotos ${subidas} de ${r.fotos.length}</small>
              ${r.error ? `<small class="error">${esc(r.error)}</small>` : ''}
            </span>
          </div>`;
        }).join('')}</div>
        <button class="btn primario ancho" style="margin-top:14px" id="sync" ${navigator.onLine ? '' : 'disabled'}>
          ${S.syncing ? 'Enviando…' : navigator.onLine ? 'Enviar ahora' : 'Sin conexión'}</button>` : ''}
      ${borr.length ? `
        <div class="bloque"><h2>Sin terminar</h2>
          <div class="lista">${borr.map(x => `
            <div class="fila">
              <span class="fila-txt"><strong>${esc(nombreLocal(x.store_id))}</strong><small>Empezado el ${fecha(x.creado)}</small></span>
              <a class="btn chico" href="#/relevar/${x.store_id}">Continuar</a>
            </div>`).join('')}</div>
        </div>` : ''}`,
    montar() {
      const b = $('#sync');
      if (b) b.onclick = () => { b.disabled = true; b.textContent = 'Enviando…'; sincronizar(); };
    }
  };
}

/* ================================================================ vistas: detalle de relevamiento */

async function vRelevamiento(id) {
  const d = await api(`/api/relevamientos/${id}`);
  const r = d.relevamiento;
  const fotosDe = itemId => d.fotos.filter(f => f.item_id === itemId);
  const fallas = d.respuestas.filter(x => x.value === 'fail' || x.value === 'partial');
  const respHtml = x => `
    <div class="resp">
      <div class="resp-top"><span class="ico ${x.value}">${{ ok: ICON.check, fail: ICON.cruz, partial: ICON.mitad, na: ICON.menos }[x.value]}</span>
        <p>${esc(x.text)}${x.value === 'partial' ? '<span class="tag-parcial">Parcial</span>' : ''}${x.critical ? '<span class="tag-crit">Crítico</span>' : ''}</p>
        <span class="pts">${x.value === 'na' ? 'N/A' : `${fmtPts(x.earned ?? x.weight * (VALOR_PUNTOS[x.value] ?? 0))}/${fmtPts(x.weight)}`}</span></div>
      ${x.comment ? `<p class="coment">${esc(x.comment)}</p>` : ''}
      ${fotosDe(x.item_id).length ? `<div class="thumbs">${fotosDe(x.item_id).map(f =>
        `<div class="thumb"><a href="${esc(fotoSrc(f))}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(fotoSrc(f))}" alt="Foto"></a></div>`).join('')}</div>` : ''}
    </div>`;
  const porCap = {};
  d.respuestas.forEach(x => (porCap[x.capitulo] ||= []).push(x));

  return {
    titulo: 'Relevamiento',
    atras: `#/local/${r.store_id}`,
    html: `
      <section class="hero">
        <div class="hero-ficha">
          <div>
            <p class="hero-sub">${esc(r.code)}</p>
            <h2 class="hero-titulo">${esc(nom(r.store_name))}</h2>
            <p class="hero-meta">${fecha(r.client_created_at)} por ${esc(r.usuario)}</p>
            ${r.distance_m > DISTANCIA_MAX ? `<p class="hero-alerta">${ICON.alerta}Cargado a ${fmtDist(r.distance_m)} del local</p>` : ''}
            ${chipEscala(r.escala)}
          </div>
          ${anillo(r.score, 'l')}
        </div>
        ${r.notes ? `<p class="hero-notas">${esc(r.notes)}</p>` : ''}
      </section>
      <button class="btn primario ancho" id="pdf" style="margin-top:14px">${ICON.pdf}Descargar informe PDF</button>
      <div class="bloque"><h2>Por capítulo</h2><div class="card">
        ${d.capitulos.map(c => `<div class="cap-fila"><span>${esc(c.nombre)}<small class="sub">${c.posibles ? ` ${fmtPts(c.puntos)}/${fmtPts(c.posibles)} ptos, pesa ${fmtPeso(c.peso)}%` : ' No aplica'}</small></span><b class="txt-${c.escala}">${c.posibles ? fmt(c.score) : 'N/A'}</b>
          <div class="barra"><span class="${c.escala}" style="width:${c.score ?? 0}%"></span></div></div>`).join('')}
      </div></div>
      <div class="bloque"><h2>Para corregir (${fallas.length})</h2>
        ${fallas.length ? `<div class="card">${fallas.map(respHtml).join('')}</div>` : '<div class="card sub">Sin incumplimientos.</div>'}
      </div>
      ${r.sign_name || r.sign_png ? `<div class="bloque"><h2>Conformidad del encargado</h2><div class="card firma-ver">
        ${r.sign_png ? `<img src="${r.sign_png}" alt="Firma de ${esc(r.sign_name || 'el encargado')}">` : ''}
        <p>${esc(r.sign_name || 'Sin nombre')}</p></div></div>` : ''}
      ${d.tareas.length ? `<div class="bloque"><h2>Planes de acción (${d.tareas.length})</h2>
        <div class="lista">${d.tareas.map(t => filaTarea({ ...t, store_name: r.store_name, code: r.code }, true)).join('')}</div></div>` : ''}
      <div class="bloque"><h2>Relevamiento completo</h2>
        ${Object.entries(porCap).map(([cap, xs]) => `<details class="card" style="margin-bottom:10px"><summary>${esc(cap)}</summary>${xs.map(respHtml).join('')}</details>`).join('')}
      </div>`,
    montar() {
      $('#pdf').onclick = async e => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.innerHTML = `${ICON.pdf}Armando el informe…`;
        try { await informePDF(d); }
        catch (err) { toast('No se pudo generar el PDF: ' + err.message); }
        btn.disabled = false;
        btn.innerHTML = `${ICON.pdf}Descargar informe PDF`;
      };
    }
  };
}

/* ================================================================ vistas: resumen */

async function vResumen() {
  S.periodoResumen ||= periodoActual();
  const p = S.periodoResumen;
  const d = await api(`/api/resumen?periodo=${p}`);
  const tot = d.total || 1;
  const maxTend = Math.max(1, ...d.tendencia.map(t => t.relevados));

  const listaCorta = arr => arr.length ? `<div class="lista">${arr.map(l => `
    <a class="fila" href="#/local/${l.id}">
      ${anillo(l.score)}
      <span class="fila-txt"><strong>${esc(nom(l.name))}</strong><small>${esc(l.code)} · ${esc(l.supervisor_name || 'Sin supervisor')}</small></span>
      <span class="fila-der">${l.delta != null ? `<span class="delta baja">${ICON.baja}${fmt(Math.abs(l.delta))}</span>` : ''}<span class="flecha">${ICON.derecha}</span></span>
    </a>`).join('')}</div>` : '<div class="card sub">Sin datos para este mes.</div>';

  return {
    titulo: 'Resumen',
    html: `
      <div class="periodo">
        <input type="month" id="periodo" value="${p}" max="${periodoActual()}" aria-label="Mes">
        <a class="btn chico" href="${API}/api/exportar?periodo=${p}&t=${encodeURIComponent(S.token)}" download>${ICON.descarga}Exportar a Excel</a>
      </div>

      <section class="hero">
        <div class="hero-resumen">
          <div class="hero-bloque">
            ${anillo(d.promedio, 'l')}
            <div><span class="hero-lbl">Promedio</span>${chipEscala(escala(d.promedio))}</div>
          </div>
          <div class="hero-bloque">
            <div class="hero-cob">
              <span class="hero-num">${d.relevados}<small>/${d.total}</small></span>
              <span class="hero-lbl">locales relevados</span>
              <div class="barra clara"><span style="width:${d.cobertura}%"></span></div>
              <span class="hero-lbl">${fmt(d.cobertura)}% de cobertura</span>
            </div>
          </div>
        </div>
        ${d.cobertura < 80 && d.total ? `<p class="hero-alerta">${ICON.alerta}El promedio solo refleja ${d.relevados} locales. ${d.total - d.relevados} todavía no se relevaron en ${mesLabel(p).toLowerCase()}.</p>` : ''}
      </section>

      <div class="bloque">
        <h2>Cómo están los locales</h2>
        <div class="card">
          <div class="dist">${ORDEN_ESCALAS.map(k => d.escalas[k] ? `<span class="${k}" style="width:${d.escalas[k] / tot * 100}%" title="${ESCALAS[k]}: ${d.escalas[k]}"></span>` : '').join('')}</div>
          <div class="leyenda">${ORDEN_ESCALAS.map(k => `<div><i class="${k}"></i>${ESCALAS[k]}<b>${d.escalas[k]}</b></div>`).join('')}</div>
        </div>
      </div>

      <div class="bloque">
        <h2>Planes de acción</h2>
        <div class="kpis">
          <a class="kpi" href="#/tareas"><b>${d.tareas.abiertas}</b><span>Abiertas</span></a>
          <a class="kpi ${d.tareas.vencidas ? 'mal' : ''}" href="#/tareas" data-filtro="vencidas"><b>${d.tareas.vencidas}</b><span>Vencidas</span></a>
          <a class="kpi" href="#/tareas" data-filtro="hoy"><b>${d.tareas.vencen_hoy}</b><span>Vencen hoy</span></a>
          <div class="kpi"><b>${d.tareas.cerradas_mes}</b><span>Cerradas en el mes${d.tareas.cerradas_mes ? `, ${Math.round(d.tareas.cerradas_a_tiempo / d.tareas.cerradas_mes * 100)}% a tiempo` : ''}</span></div>
        </div>
        ${d.tareas.por_responsable.length ? `<div class="card" style="margin-top:12px">${d.tareas.por_responsable.map(r => `
          <div class="sup-fila"><strong>${esc(r.nombre)}</strong>
            <span class="sup-prom ${r.vencidas ? 'txt-critico' : ''}">${r.vencidas} vencidas</span>
            <div class="sup-cump">${r.abiertas} abiertas</div></div>`).join('')}</div>` : ''}
      </div>

      <div class="bloque">
        <h2>Alertas</h2>
        ${[
          ['Estaban mal y no se volvieron a relevar', 'Atención urgente o crítico en el último relevamiento y sin relevar este mes', d.riesgos.criticos_sin_relevar, 'prev'],
          ['Cayeron a zona de riesgo', 'Tenían 80 o más y ahora quedaron por debajo', d.riesgos.cayeron_a_riesgo, 'delta'],
          ['Bajaron dos meses seguidos', 'Cada mes peor que el anterior', d.riesgos.caida_sostenida, 'delta'],
          ['Sin relevar hace más de un mes', 'Ni este mes ni el anterior', d.atrasados, 'prev'],
          ['Bajaron respecto del relevamiento anterior', 'Cualquier baja de puntaje', d.bajaron, 'delta']
        ].map(([t, sub, arr, tipo]) => `
          <details class="lista lista-plegable alerta ${arr.length ? '' : 'vacia'}" ${arr.length ? '' : 'aria-disabled="true"'}>
            <summary><span class="alerta-n ${arr.length ? '' : 'cero'}">${arr.length}</span><span class="alerta-txt"><strong>${t}</strong><small>${sub}</small></span></summary>
            ${arr.map(l => `
              <a class="fila" href="#/local/${l.id}">
                ${anillo(l.score)}
                <span class="fila-txt"><strong>${esc(nom(l.name))}</strong><small>${esc(l.code)} · ${esc(l.supervisor_name || 'Sin supervisor')}${tipo === 'prev' ? ` · ${l.prev_period ? `Último: ${mesLabel(l.prev_period)}` : 'Nunca relevado'}` : ''}</small></span>
                <span class="fila-der">${tipo === 'delta' && l.delta != null ? `<span class="delta baja">${ICON.baja}${fmt(Math.abs(l.delta))}</span>` : (l.prev_score != null && tipo === 'prev' ? `<span class="sub">${fmt(l.prev_score)}</span>` : '')}<span class="flecha">${ICON.derecha}</span></span>
              </a>`).join('')}
          </details>`).join('')}
      </div>

      <div class="bloque">
        <h2>Últimos 6 meses</h2>
        <div class="card">
          <div class="tend">${d.tendencia.map(t => `
            <div class="tend-col"><div class="tend-bar" style="height:${t.relevados / maxTend * 100}%">
              ${['aprobado', 'observado', 'urgente', 'critico'].map(k => t[k] ? `<span style="flex:${t[k]};background:var(--${k})"></span>` : '').join('')}
            </div></div>`).join('')}</div>
          <div class="tend-lbl">${d.tendencia.map(t => `<div><span>${mesCorto(t.periodo)}</span><b>${t.promedio == null ? '–' : fmt(t.promedio)}</b>${t.relevados} loc.</div>`).join('')}</div>
        </div>
      </div>

      <div class="bloque">
        <h2>Supervisores</h2>
        <div class="card">${d.supervisores.map(s => `
          <div class="sup-fila">
            <strong>${esc(s.nombre)}</strong>
            <span class="sup-prom"><span class="punto ${escala(s.promedio)}"></span>${fmt(s.promedio)}</span>
            <div class="sup-cump"><div class="barra"><span style="width:${s.cumplimiento}%"></span></div>${s.relevados} de ${s.asignados} relevados, ${Math.round(s.cumplimiento)}%</div>
          </div>`).join('')}
        </div>
      </div>

      <div class="dos-col bloque" style="margin-top:24px">
        <div><h2 class="h-bloque">Peores 10</h2>${listaCorta(d.peores)}</div>
        <div><h2 class="h-bloque">Mejores 10</h2>${listaCorta(d.mejores)}</div>
      </div>

      <div class="bloque">
        <h2>Ítems más incumplidos</h2>
        ${d.items.length ? `<div class="card">${d.items.map(i => `
          <div class="item-fail"><b>${i.n}</b><div>${esc(i.text)}<small>${esc(i.capitulo)}</small></div></div>`).join('')}</div>`
          : '<div class="card sub">Sin incumplimientos este mes.</div>'}
      </div>`,
    montar() {
      $$('.kpi[data-filtro]').forEach(k => k.onclick = () => { S.filtroTareas = k.dataset.filtro; });
      $$('details.alerta.vacia summary').forEach(x => x.onclick = e => e.preventDefault());
      $('#periodo').onchange = e => {
        if (!e.target.value) return;
        S.periodoResumen = e.target.value;
        render();
      };
    }
  };
}

/* ================================================================ hoja de edición */

// Ventana para editar: en el celular sube desde abajo, en la compu aparece al centro.
function abrirHoja({ titulo, html, montar, guardar, textoGuardar = 'Guardar', peligro = null }) {
  cerrarHoja();
  const fondo = document.createElement('div');
  fondo.className = 'hoja-fondo';
  fondo.innerHTML = `
    <div class="hoja" role="dialog" aria-modal="true" aria-labelledby="hoja-titulo">
      <div class="hoja-top"><h2 id="hoja-titulo">${esc(titulo)}</h2>
        <button type="button" class="hoja-x" aria-label="Cerrar">${ICON.cruz}</button></div>
      <div class="hoja-cuerpo form">${html}<p class="error" id="hoja-err" hidden></p></div>
      ${guardar || peligro ? `<div class="hoja-pie">
        ${peligro ? `<button type="button" class="btn fantasma peligro" id="hoja-peligro">${esc(peligro.texto)}</button>` : ''}
        ${guardar ? `<button type="button" class="btn primario" id="hoja-ok">${esc(textoGuardar)}</button>` : ''}
      </div>` : ''}
    </div>`;
  document.body.appendChild(fondo);
  document.body.classList.add('con-hoja');
  requestAnimationFrame(() => fondo.classList.add('ver'));
  const hoja = $('.hoja', fondo);
  const err = msg => { const e = $('#hoja-err', fondo); e.textContent = msg || ''; e.hidden = !msg; };
  fondo.addEventListener('click', e => { if (e.target === fondo) cerrarHoja(); });
  $('.hoja-x', fondo).onclick = cerrarHoja;
  fondo.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarHoja(); });
  const correr = async (btn, fn) => {
    btn.disabled = true;
    err('');
    try { if ((await fn(hoja, err)) !== false) cerrarHoja(); }
    catch (x) { err(x.message); }
    btn.disabled = false;
  };
  if (guardar) $('#hoja-ok', fondo).onclick = e => correr(e.currentTarget, guardar);
  if (peligro) $('#hoja-peligro', fondo).onclick = e => {
    if (peligro.confirmar && !confirm(peligro.confirmar)) return;
    correr(e.currentTarget, peligro.accion);
  };
  montar?.(hoja, err);
  setTimeout(() => $('input:not([type=hidden]):not([readonly]), textarea, select', hoja)?.focus(), 250);
}
function cerrarHoja() {
  const f = $('.hoja-fondo');
  if (!f) return;
  f.classList.remove('ver');
  document.body.classList.remove('con-hoja');
  setTimeout(() => f.remove(), 200);
}
const valor = (hoja, sel) => ($(sel, hoja)?.value ?? '').trim();
const iniciales = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('');
const ROL = { admin: 'Administrador', jefe: 'Jefe', supervisor: 'Supervisor' };

/* ================================================================ vistas: admin */

async function vAdmin() {
  if (!esJefe()) { location.hash = '#/'; return null; }
  const tab = S.adminTab || 'usuarios';
  const vistas = { usuarios: adminUsuarios, locales: adminLocales, checklist: adminChecklist };
  const v = await vistas[tab]();

  return {
    titulo: 'Administración',
    atras: '#/cuenta',
    html: `
      <div class="tabs" role="tablist">
        ${[['usuarios', 'Usuarios', ICON.cuenta], ['locales', 'Locales', ICON.locales], ['checklist', 'Checklist', ICON.tareas]].map(([k, t, i]) =>
          `<button role="tab" data-tab="${k}" class="${tab === k ? 'activo' : ''}" aria-selected="${tab === k}">${i}<span>${t}</span></button>`).join('')}
      </div>
      ${v.html}
      <div class="drive-card">
        <span class="drive-ico">${ICON.resumen}</span>
        <div><strong>Historial de Linkup</strong><p class="sub">Importá los relevamientos anteriores desde el archivo convertido.</p></div>
        <button class="btn chico" id="hist-importar">Importar</button>
      </div>
      <div class="drive-card" style="margin-top:10px">
        <span class="drive-ico">${ICON.nube}</span>
        <div><strong>Fotos en Drive</strong><p class="sub" id="drive-estado">Comprobá que las fotos se estén guardando.</p></div>
        <button class="btn chico" id="drive-probar">Probar</button>
      </div>`,
    montar(app) {
      $$('[data-tab]', app).forEach(b => b.onclick = () => { S.adminTab = b.dataset.tab; render(); });
      $('#drive-probar').onclick = async ev => {
        const est = $('#drive-estado');
        ev.currentTarget.disabled = true;
        est.textContent = 'Probando…';
        try {
          const r = await api('/api/admin/drive');
          est.innerHTML = `<span class="txt-aprobado"><b>Conectado</b></span>, carpeta "${esc(r.carpeta)}"`;
        } catch (err) {
          est.innerHTML = `<span class="txt-critico"><b>No conecta:</b></span> ${esc(err.message)}`;
        }
        ev.currentTarget.disabled = false;
      };
      $('#hist-importar').onclick = abrirImportarHistorial;
      v.montar(app);
    }
  };
}

function abrirImportarHistorial() {
  let datos = null;
  abrirHoja({
    titulo: 'Importar historial de Linkup',
    html: `
      <p class="sub" style="margin:0">Elegí el archivo <b>historial_linkup_importar.json</b>. Los relevamientos entran con su fecha, supervisor, puntaje, observaciones, firma y fotos. Si se sube dos veces, no se duplica nada.</p>
      <label class="archivo"><input type="file" id="h-arch" accept=".json,application/json"><span id="h-nombre">${ICON.descarga}Elegir archivo</span></label>
      <div id="h-info"></div>
      <div class="barra" id="h-barra" hidden><span style="width:0%"></span></div>
      <p class="sub" id="h-prog" hidden></p>
      <div id="h-res"></div>`,
    montar(hoja) {
      $('#h-arch', hoja).onchange = async e => {
        const f = e.target.files[0];
        if (!f) return;
        $('#h-nombre', hoja).innerHTML = `${ICON.check}${esc(f.name)}`;
        try {
          const j = JSON.parse(await f.text());
          if (j.formato !== 'relevamientos-historial-v1' || !Array.isArray(j.relevamientos)) throw new Error('Este archivo no es el historial convertido');
          datos = j.relevamientos;
          const fechas = datos.map(r => r.fecha).sort();
          $('#h-info', hoja).innerHTML = `<div class="ok-box"><b>${datos.length} relevamientos</b> de ${new Set(datos.map(r => r.code)).size} locales, del ${fecha(fechas[0])} al ${fecha(fechas[fechas.length - 1])}.</div>`;
        } catch (err) {
          datos = null;
          $('#h-info', hoja).innerHTML = `<p class="error">${esc(err.message)}</p>`;
        }
      };
    },
    textoGuardar: 'Importar',
    guardar: async (hoja, err) => {
      if (!datos) throw new Error('Elegí primero el archivo');
      const barra = $('#h-barra', hoja), prog = $('#h-prog', hoja);
      barra.hidden = prog.hidden = false;
      const tot = { creados: 0, ya_existian: 0, usuarios_nuevos: 0, errores: [] };
      const TANDA = 5;
      for (let i = 0; i < datos.length; i += TANDA) {
        let r;
        for (let intento = 1; intento <= 3; intento++) {
          try { r = await post('/api/admin/historial', { relevamientos: datos.slice(i, i + TANDA) }); break; }
          catch (e) { if (intento === 3) { tot.errores.push(`Tanda desde el #${i + 1}: ${e.message}`); r = null; } else await new Promise(ok => setTimeout(ok, 1500)); }
        }
        if (r) { tot.creados += r.creados; tot.ya_existian += r.ya_existian; tot.usuarios_nuevos += r.usuarios_nuevos; tot.errores.push(...r.errores); }
        const hechos = Math.min(i + TANDA, datos.length);
        $('span', barra).style.width = `${hechos / datos.length * 100}%`;
        prog.textContent = `${hechos} de ${datos.length}`;
      }
      $('#h-res', hoja).innerHTML = `<div class="ok-box"><b>${tot.creados} importados${tot.ya_existian ? `, ${tot.ya_existian} ya estaban` : ''}${tot.usuarios_nuevos ? `, ${tot.usuarios_nuevos} supervisores creados dados de baja` : ''}.</b>
        ${tot.errores.length ? `<ul>${tot.errores.slice(0, 20).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`;
      toast(`Historial: ${tot.creados} relevamientos importados`);
      return false;
    }
  });
}

function barraAdmin(placeholder, nuevo) {
  return `
    <div class="adm-barra">
      <label class="buscar">${ICON.buscar}<input type="search" id="adm-q" placeholder="${placeholder}" autocomplete="off" aria-label="${placeholder}"></label>
      <button class="btn primario" id="adm-nuevo">${ICON.mas}<span>${nuevo}</span></button>
    </div>`;
}
const botonMasivo = texto => `<button class="adm-masivo" id="adm-masivo">${ICON.descarga}${texto}</button>`;
function resultadoImport(r, extra = '') {
  return `<div class="resultado ok-box"><b>${extra}</b>${r.errores?.length ? `<ul>${r.errores.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`;
}

/* ---------- usuarios */

async function adminUsuarios() {
  const { usuarios } = await api('/api/admin/usuarios');
  const f = { q: '', rol: '' };
  const dibujar = () => {
    const q = f.q.toLowerCase();
    const l = usuarios.filter(u => (!q || u.name.toLowerCase().includes(q) || u.email.includes(q)) && (!f.rol || (f.rol === 'baja' ? !u.active : u.active && u.role === f.rol)));
    $('#adm-lista').innerHTML = l.length ? l.map(u => `
      <button class="adm-fila ${u.active ? '' : 'inactivo'}" data-id="${u.id}">
        <span class="avatar r-${u.role}">${esc(iniciales(u.name))}</span>
        <span class="fila-txt"><strong>${esc(u.name)}</strong><small>${esc(u.email)}</small></span>
        <span class="rol-chip r-${u.role}">${u.active ? ROL[u.role] : 'De baja'}</span>
        <span class="flecha">${ICON.derecha}</span>
      </button>`).join('') : '<div class="vacio"><p>Ningún usuario coincide.</p></div>';
  };
  const cuenta = r => r === 'baja' ? usuarios.filter(u => !u.active).length : usuarios.filter(u => u.active && u.role === r).length;

  const formUsuario = u => `
    <label>Nombre y apellido<input id="u-nombre" value="${esc(u?.name || '')}" autocomplete="off"></label>
    <label>Email${u ? `<input value="${esc(u.email)}" readonly class="solo-lectura">` : '<input id="u-email" type="email" inputmode="email" autocomplete="off">'}</label>
    <div class="campo"><span class="campo-lbl">Rol</span>
      <div class="segmento" id="u-rol">${['supervisor', 'jefe', 'admin'].map(r => `<button type="button" data-v="${r}" class="${(u?.role || 'supervisor') === r ? 'sel' : ''}">${ROL[r]}</button>`).join('')}</div>
      <small class="ayuda" id="u-rol-ayuda"></small></div>
    <label>${u ? 'Nueva clave (dejala vacía para no cambiarla)' : 'Clave inicial (mínimo 8 caracteres)'}
      <span class="clave-wrap"><input id="u-clave" type="password" autocomplete="new-password"><button type="button" class="ojo" aria-label="Mostrar clave">${OJO}</button></span></label>
    ${u && u.id !== S.user.id ? `<label class="interruptor"><input type="checkbox" id="u-activo" ${u.active ? 'checked' : ''}><span></span>Puede entrar a la app</label>` : ''}`;
  const AYUDA_ROL = {
    supervisor: 'Releva sus locales y resuelve sus tareas.',
    jefe: 'Ve todo, crea tareas y administra usuarios, locales y checklist.',
    admin: 'Igual que jefe. Pensado para quien mantiene la app.'
  };
  const montarForm = hoja => {
    const seg = $('#u-rol', hoja);
    const ayuda = () => { $('#u-rol-ayuda', hoja).textContent = AYUDA_ROL[$('.sel', seg).dataset.v]; };
    seg.onclick = e => { const b = e.target.closest('button'); if (!b) return; $$('button', seg).forEach(x => x.classList.toggle('sel', x === b)); ayuda(); };
    ayuda();
  };
  const abrir = u => abrirHoja({
    titulo: u ? 'Editar usuario' : 'Nuevo usuario',
    html: formUsuario(u),
    montar: montarForm,
    textoGuardar: u ? 'Guardar cambios' : 'Crear usuario',
    guardar: async hoja => {
      const rol = $('#u-rol .sel', hoja).dataset.v, clave = valor(hoja, '#u-clave'), nombre = valor(hoja, '#u-nombre');
      if (!nombre) throw new Error('Poné el nombre');
      if (u) {
        const datos = { nombre, rol };
        if (clave) datos.clave = clave;
        if ($('#u-activo', hoja)) datos.activo = $('#u-activo', hoja).checked;
        await post(`/api/admin/usuarios/${u.id}`, datos, 'PUT');
        toast('Usuario actualizado');
      } else {
        const email = valor(hoja, '#u-email');
        if (!emailValido(email)) throw new Error('El email tiene que tener un @ y un dominio');
        await post('/api/admin/usuarios', { nombre, email, rol, clave });
        toast('Usuario creado');
      }
      render();
    }
  });

  return {
    html: `
      ${barraAdmin('Buscar por nombre o email', 'Nuevo')}
      <div class="chips" id="adm-chips">
        <button class="chip activo" data-f="">Todos ${usuarios.filter(u => u.active).length}</button>
        ${[['supervisor', 'Supervisores'], ['jefe', 'Jefes'], ['admin', 'Administradores'], ['baja', 'De baja']].map(([r, t]) => `<button class="chip" data-f="${r}">${t} ${cuenta(r)}</button>`).join('')}
      </div>
      <div class="adm-lista" id="adm-lista"></div>
      ${botonMasivo('Cargar varios usuarios desde una planilla')}`,
    montar() {
      dibujar();
      $('#adm-q').oninput = e => { f.q = e.target.value; dibujar(); };
      $('#adm-chips').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; f.rol = c.dataset.f; $$('#adm-chips .chip').forEach(x => x.classList.toggle('activo', x === c)); dibujar(); };
      $('#adm-lista').onclick = e => { const b = e.target.closest('[data-id]'); if (b) abrir(usuarios.find(u => u.id === Number(b.dataset.id))); };
      $('#adm-nuevo').onclick = () => abrir(null);
      $('#adm-masivo').onclick = () => abrirHoja({
        titulo: 'Cargar varios usuarios',
        html: `<p class="sub" style="margin:0">Una fila por usuario: nombre, email y rol (supervisor, jefe o admin). Los emails que ya existen se saltean.</p>
          <pre class="plantilla">nombre;email;rol
Marina Herber;marina@luccianos.com.ar;supervisor</pre>
          <textarea id="m-csv" placeholder="Pegá acá las filas desde Excel o el Bloc de notas"></textarea>
          <label>Clave inicial para todos (mínimo 8 caracteres)<input id="m-clave" autocomplete="off"></label>
          <div id="m-res"></div>`,
        textoGuardar: 'Cargar usuarios',
        guardar: async hoja => {
          const r = await post('/api/admin/usuarios/importar', { csv: valor(hoja, '#m-csv'), clave: valor(hoja, '#m-clave') });
          $('#m-res', hoja).innerHTML = resultadoImport(r, `${r.creados} creados${r.ya_existian ? `, ${r.ya_existian} ya existían` : ''}.`);
          if (!r.errores.length) { toast(`${r.creados} usuarios creados`); render(); return true; }
          return false;
        }
      });
    }
  };
}

/* ---------- locales */

async function adminLocales() {
  const [{ locales }, { usuarios }] = await Promise.all([api('/api/admin/locales'), api('/api/admin/usuarios')]);
  const supervisores = usuarios.filter(u => u.active).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const f = { q: '', filtro: '' };
  const FILTROS = [
    ['', 'Todos', l => l.active],
    ['Propio', 'Propios', l => l.active && l.type === 'Propio'],
    ['Franquicia', 'Franquicias', l => l.active && l.type === 'Franquicia'],
    ['sinsup', 'Sin supervisor', l => l.active && !l.supervisores.length],
    ['sincoord', 'Sin ubicación', l => l.active && l.lat == null],
    ['baja', 'De baja', l => !l.active]
  ];
  const dibujar = () => {
    const q = f.q.toLowerCase(), fn = FILTROS.find(x => x[0] === f.filtro)[2];
    const l = locales.filter(x => fn(x) && (!q || x.name.toLowerCase().includes(q) || x.code.toLowerCase().includes(q) || (x.supervisor_name || '').toLowerCase().includes(q)));
    $('#adm-lista').innerHTML = l.length ? l.map(x => `
      <button class="adm-fila ${x.active ? '' : 'inactivo'}" data-id="${x.id}">
        <span class="codigo-chip">${esc(x.code)}</span>
        <span class="fila-txt"><strong>${esc(nom(x.name))}</strong>
          <small>${x.supervisores.length ? esc(x.supervisor_name) : '<span class="txt-urgente">Sin supervisor</span>'}${x.country && x.country !== 'Argentina' ? ` · ${esc(x.country)}` : ''}</small></span>
        ${x.lat == null ? `<span class="aviso-chip" title="Sin ubicación">${ICON.pin}</span>` : ''}
        <span class="flecha">${ICON.derecha}</span>
      </button>`).join('') : '<div class="vacio"><p>Ningún local coincide.</p></div>';
  };
  const paises = [...new Set(['Argentina', 'Uruguay', 'Chile', 'España', 'Estados Unidos', ...locales.map(l => l.country).filter(Boolean)])];

  const abrir = l => abrirHoja({
    titulo: l ? `${l.code} · ${nom(l.name)}` : 'Nuevo local',
    html: `
      <div class="dos-campos">
        <label>Código<input id="l-codigo" value="${esc(l?.code || '')}" maxlength="20" autocomplete="off" style="text-transform:uppercase"></label>
        <label>Región<input id="l-region" value="${esc(l?.region || '')}" placeholder="Opcional" autocomplete="off"></label>
      </div>
      <label>Nombre<input id="l-nombre" value="${esc(l?.name || "Lucciano's ")}" autocomplete="off"></label>
      <div class="campo"><span class="campo-lbl">Tipo</span>
        <div class="segmento" id="l-tipo">${['Propio', 'Franquicia', 'Otro'].map(t => `<button type="button" data-v="${t}" class="${(l?.type || 'Propio') === t || (t === 'Otro' && l?.type && !['Propio', 'Franquicia'].includes(l.type)) ? 'sel' : ''}">${t}</button>`).join('')}</div></div>
      <label>País<input id="l-pais" list="l-paises" value="${esc(l?.country || 'Argentina')}" autocomplete="off"><datalist id="l-paises">${paises.map(p => `<option value="${esc(p)}">`).join('')}</datalist></label>
      <div class="campo"><span class="campo-lbl">Supervisores <small class="sub">(el primero que marques es el responsable de las tareas)</small></span>
        <label class="buscar chico">${ICON.buscar}<input type="search" id="l-sup-q" placeholder="Buscar persona" autocomplete="off"></label>
        <div class="sel-lista chica" id="l-sups">${[...(l?.supervisor_ids || []).map(id => supervisores.find(u => u.id === id)).filter(Boolean), ...supervisores.filter(u => !l?.supervisor_ids.includes(u.id))].map(u => `
          <label class="sel-fila" data-n="${esc(u.name.toLowerCase())}"><input type="checkbox" value="${u.id}" ${l?.supervisor_ids.includes(u.id) ? 'checked' : ''}>
            <span class="fila-txt"><strong>${esc(u.name)}</strong><small>${ROL[u.role]}</small></span></label>`).join('')}</div></div>
      <div class="campo"><span class="campo-lbl">Ubicación <small class="sub">(para saber si el relevamiento se hizo en el local)</small></span>
        <div class="dos-campos">
          <input id="l-lat" inputmode="decimal" placeholder="Latitud" value="${l?.lat ?? ''}" aria-label="Latitud">
          <input id="l-lng" inputmode="decimal" placeholder="Longitud" value="${l?.lng ?? ''}" aria-label="Longitud">
        </div>
        <div class="ubic-acciones">
          <button type="button" class="btn chico" id="l-aqui">${ICON.pin}Estoy en el local</button>
          <a class="btn chico fantasma" id="l-mapa" target="_blank" rel="noopener">Ver en el mapa</a>
        </div>
        <small class="ayuda">Si no estás en el local: en Google Maps, clic derecho sobre el local y pegá acá el primer renglón.</small></div>
      ${l ? `<label class="interruptor"><input type="checkbox" id="l-activo" ${l.active ? 'checked' : ''}><span></span>Local activo (si lo das de baja deja de aparecer para relevar)</label>` : ''}`,
    montar(hoja) {
      const seg = $('#l-tipo', hoja);
      seg.onclick = e => { const b = e.target.closest('button'); if (b) $$('button', seg).forEach(x => x.classList.toggle('sel', x === b)); };
      $('#l-sup-q', hoja).oninput = e => { const q = e.target.value.toLowerCase(); $$('#l-sups .sel-fila', hoja).forEach(r => { r.hidden = q && !r.dataset.n.includes(q); }); };
      // el orden en que se tildan define quién es el responsable principal
      const orden = [...(l?.supervisor_ids || [])];
      $('#l-sups', hoja).onchange = e => { const id = Number(e.target.value); e.target.checked ? orden.push(id) : orden.splice(orden.indexOf(id), 1); };
      hoja._orden = orden;
      // pegar "-38.0105, -57.5364" en la latitud completa las dos
      $('#l-lat', hoja).addEventListener('input', e => {
        const m = e.target.value.match(/^\s*(-?\d+[.,]\d+)\s*[,; ]\s*(-?\d+[.,]\d+)\s*$/);
        if (m) { e.target.value = m[1].replace(',', '.'); $('#l-lng', hoja).value = m[2].replace(',', '.'); }
        mapa();
      });
      $('#l-lng', hoja).oninput = () => mapa();
      const mapa = () => {
        const la = valor(hoja, '#l-lat'), ln = valor(hoja, '#l-lng'), a = $('#l-mapa', hoja);
        a.href = la && ln ? `https://www.google.com/maps?q=${encodeURIComponent(la + ',' + ln)}` : `https://www.google.com/maps/search/${encodeURIComponent(valor(hoja, '#l-nombre'))}`;
      };
      mapa();
      $('#l-aqui', hoja).onclick = e => {
        const btn = e.currentTarget;
        if (!navigator.geolocation) return toast('Este dispositivo no da la ubicación');
        btn.disabled = true;
        navigator.geolocation.getCurrentPosition(p => {
          $('#l-lat', hoja).value = p.coords.latitude.toFixed(5);
          $('#l-lng', hoja).value = p.coords.longitude.toFixed(5);
          mapa(); btn.disabled = false; toast('Ubicación cargada');
        }, () => { btn.disabled = false; toast('No se pudo obtener la ubicación'); }, { enableHighAccuracy: true, timeout: 15000 });
      };
    },
    textoGuardar: l ? 'Guardar cambios' : 'Crear local',
    guardar: async hoja => {
      const datos = {
        codigo: valor(hoja, '#l-codigo'), nombre: valor(hoja, '#l-nombre'), region: valor(hoja, '#l-region'),
        tipo: $('#l-tipo .sel', hoja).dataset.v, pais: valor(hoja, '#l-pais'),
        lat: valor(hoja, '#l-lat'), lng: valor(hoja, '#l-lng'),
        supervisores: hoja._orden, activo: $('#l-activo', hoja) ? $('#l-activo', hoja).checked : true
      };
      await post(l ? `/api/admin/locales/${l.id}` : '/api/admin/locales', datos, l ? 'PUT' : 'POST');
      toast(l ? 'Local actualizado' : 'Local creado');
      await cargarCatalogo().catch(() => {});
      render();
    }
  });

  return {
    html: `
      ${barraAdmin('Buscar por nombre, código o supervisor', 'Nuevo')}
      <div class="chips" id="adm-chips">${FILTROS.map(([k, t, fn], i) => `<button class="chip ${i ? '' : 'activo'}" data-f="${k}">${t} ${locales.filter(fn).length}</button>`).join('')}</div>
      <div class="adm-lista" id="adm-lista"></div>
      ${botonMasivo('Cargar o actualizar locales desde una planilla')}`,
    montar() {
      dibujar();
      $('#adm-q').oninput = e => { f.q = e.target.value; dibujar(); };
      $('#adm-chips').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; f.filtro = c.dataset.f; $$('#adm-chips .chip').forEach(x => x.classList.toggle('activo', x === c)); dibujar(); };
      $('#adm-lista').onclick = e => { const b = e.target.closest('[data-id]'); if (b) abrir(locales.find(x => x.id === Number(b.dataset.id))); };
      $('#adm-nuevo').onclick = () => abrir(null);
      $('#adm-masivo').onclick = () => abrirHoja({
        titulo: 'Cargar locales desde una planilla',
        html: `<p class="sub" style="margin:0">Si el código ya existe, se actualiza. Los supervisores van con su email; si son varios, separalos con "/".</p>
          <pre class="plantilla">codigo;nombre;region;tipo;pais;emails_supervisores;lat;lng
PMALE;Lucciano's Alem;Mar del Plata;Propio;Argentina;operaciones.mdq@luccianos.com.ar;-38,02761;-57,53576</pre>
          <textarea id="m-csv" placeholder="Pegá acá las filas"></textarea><div id="m-res"></div>`,
        textoGuardar: 'Cargar locales',
        guardar: async hoja => {
          const r = await post('/api/admin/locales/importar', { csv: valor(hoja, '#m-csv') });
          $('#m-res', hoja).innerHTML = resultadoImport(r, `${r.importados} locales cargados.`);
          await cargarCatalogo().catch(() => {});
          if (!r.errores.length) { toast(`${r.importados} locales cargados`); render(); return true; }
          return false;
        }
      });
    }
  };
}

/* ---------- checklist */

async function adminChecklist() {
  const { items, capitulos } = await api('/api/admin/checklist');
  const verBajas = !!S.verBajas;
  const activos = items.filter(i => i.active);
  const pesoTotal = capitulos.filter(c => activos.some(i => i.chapter_id === c.id)).reduce((a, c) => a + c.weight, 0) || 1;
  const abiertos = S.capAbiertos ||= new Set();

  const capHtml = (c, idx) => {
    const its = items.filter(i => i.chapter_id === c.id && (verBajas || i.active));
    const act = its.filter(i => i.active);
    const pts = act.reduce((a, i) => a + i.weight, 0);
    const secciones = [];
    for (const i of its) {
      const n = i.seccion || '';
      let s = secciones.find(x => x.n === n);
      if (!s) secciones.push(s = { n, its: [] });
      s.its.push(i);
    }
    return `
      <details class="ck-cap" data-cap="${c.id}" ${abiertos.has(c.id) ? 'open' : ''}>
        <summary>
          <span class="ck-num">${idx + 1}</span>
          <span class="ck-cap-txt"><strong>${esc(c.name)}</strong>
            <small>${act.length} ${act.length === 1 ? 'ítem' : 'ítems'} · ${fmtPts(pts)} ptos</small></span>
          <span class="ck-peso" title="Peso en el puntaje total">${act.length ? fmtPeso(c.weight / pesoTotal * 100) + '%' : 'Sin ítems'}</span>
        </summary>
        <div class="ck-cap-acciones">
          <button class="btn chico" data-edit-cap="${c.id}">Editar capítulo</button>
          <button class="icono-btn" data-mover-cap="${c.id}" data-dir="arriba" aria-label="Subir capítulo" ${idx === 0 ? 'disabled' : ''}>${ICON.sube}</button>
          <button class="icono-btn" data-mover-cap="${c.id}" data-dir="abajo" aria-label="Bajar capítulo" ${idx === capitulos.length - 1 ? 'disabled' : ''}>${ICON.baja}</button>
        </div>
        ${secciones.map(s => `
          ${s.n ? `<div class="ck-sec">${esc(s.n)}</div>` : ''}
          ${s.its.map(i => {
            const vis = act.filter(x => (x.seccion || '') === s.n);
            const pos = vis.indexOf(i);
            return `
            <div class="ck-item ${i.active ? '' : 'inactivo'}">
              <button class="ck-item-txt" data-edit-item="${i.id}">
                <span>${esc(i.text)}</span>
                <span class="ck-tags"><span class="pts">${fmtPts(i.weight)} ${i.weight === 1 ? 'pto' : 'ptos'}</span>${i.critical ? '<span class="tag-crit">Crítico</span>' : ''}${i.active ? '' : '<span class="tag-baja">De baja</span>'}</span>
              </button>
              ${i.active ? `<span class="ck-mover">
                <button class="icono-btn" data-mover-item="${i.id}" data-dir="arriba" aria-label="Subir" ${pos <= 0 ? 'disabled' : ''}>${ICON.sube}</button>
                <button class="icono-btn" data-mover-item="${i.id}" data-dir="abajo" aria-label="Bajar" ${pos === vis.length - 1 ? 'disabled' : ''}>${ICON.baja}</button>
              </span>` : ''}
            </div>`;
          }).join('')}`).join('')}
        <button class="ck-agregar" data-nuevo-item="${c.id}">${ICON.mas}Agregar ítem a ${esc(c.name)}</button>
      </details>`;
  };

  const abrirCap = c => abrirHoja({
    titulo: c ? 'Editar capítulo' : 'Nuevo capítulo',
    html: `
      <label>Nombre<input id="c-nombre" value="${esc(c?.name || '')}" autocomplete="off"></label>
      <label>Peso en el puntaje total<input id="c-peso" inputmode="decimal" value="${c ? fmtPts(c.weight) : '11'}"></label>
      <small class="ayuda">Como en Linkup: cada capítulo pesa 11 y Actitudes 12. Lo que importa es la proporción entre capítulos: si uno pesa el doble que otro, cuenta el doble en el puntaje.</small>`,
    textoGuardar: c ? 'Guardar cambios' : 'Crear capítulo',
    guardar: async hoja => {
      await post(c ? `/api/admin/capitulos/${c.id}` : '/api/admin/capitulos', { nombre: valor(hoja, '#c-nombre'), peso: valor(hoja, '#c-peso') }, c ? 'PUT' : 'POST');
      toast(c ? 'Capítulo actualizado' : 'Capítulo creado');
      await cargarCatalogo().catch(() => {});
      render();
    }
  });

  const abrirItem = (i, capId) => {
    const cap = i ? i.chapter_id : capId;
    const secs = [...new Set(items.filter(x => x.chapter_id === cap && x.seccion).map(x => x.seccion))];
    abrirHoja({
      titulo: i ? 'Editar ítem' : 'Nuevo ítem',
      html: `
        <label>Qué hay que controlar<textarea id="i-texto" rows="3" style="min-height:90px">${esc(i?.text || '')}</textarea></label>
        <label>Capítulo<select id="i-cap">${capitulos.map(c => `<option value="${c.id}" ${c.id === cap ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label>Sección <small class="sub">(opcional, por ejemplo Exterior o Baños)</small><input id="i-sec" list="i-secs" value="${esc(i?.seccion || '')}" autocomplete="off">
          <datalist id="i-secs">${secs.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
        <div class="campo"><span class="campo-lbl">Puntos</span>
          <div class="stepper"><button type="button" data-d="-1" aria-label="Menos">${ICON.menos}</button><input id="i-pts" inputmode="decimal" value="${fmtPts(i?.weight ?? 3)}" aria-label="Puntos"><button type="button" data-d="1" aria-label="Más">${ICON.mas}</button></div>
          <small class="ayuda">Parcial suma la mitad de estos puntos.</small></div>
        <label class="interruptor"><input type="checkbox" id="i-crit" ${i?.critical ? 'checked' : ''}><span></span>Ítem crítico: si no se cumple, el local no puede pasar de 79</label>
        ${i && !i.active ? '<p class="sub" style="margin:0">Este ítem está dado de baja. Al guardar se vuelve a activar.</p>' : ''}`,
      montar(hoja) {
        $('.stepper', hoja).onclick = e => {
          const b = e.target.closest('button'); if (!b) return;
          const inp = $('#i-pts', hoja), v = Number(String(inp.value).replace(',', '.')) || 0;
          inp.value = fmtPts(Math.max(0.5, v + Number(b.dataset.d)));
        };
      },
      textoGuardar: i ? 'Guardar cambios' : 'Agregar ítem',
      guardar: async hoja => {
        await post(i ? `/api/admin/items/${i.id}` : '/api/admin/items', {
          texto: valor(hoja, '#i-texto'), capitulo: Number(valor(hoja, '#i-cap')), seccion: valor(hoja, '#i-sec'),
          puntos: valor(hoja, '#i-pts'), critico: $('#i-crit', hoja).checked, activo: true
        }, i ? 'PUT' : 'POST');
        abiertos.add(Number(valor(hoja, '#i-cap')));
        toast(i ? 'Ítem actualizado' : 'Ítem agregado');
        await cargarCatalogo().catch(() => {});
        render();
      },
      peligro: i && i.active ? {
        texto: 'Dar de baja',
        confirmar: 'El ítem deja de aparecer en los relevamientos nuevos. Los relevamientos anteriores no cambian. ¿Seguimos?',
        accion: async () => {
          await post(`/api/admin/items/${i.id}`, { texto: i.text, capitulo: i.chapter_id, seccion: i.seccion, puntos: i.weight, critico: !!i.critical, activo: false }, 'PUT');
          toast('Ítem dado de baja');
          await cargarCatalogo().catch(() => {});
          render();
        }
      } : null
    });
  };

  const totalPts = activos.reduce((a, i) => a + i.weight, 0);
  const capsVisibles = capitulos.filter(c => verBajas || items.some(i => i.chapter_id === c.id && i.active) || !items.some(i => i.chapter_id === c.id));
  return {
    html: `
      <div class="ck-resumen">
        <div><b>${capsVisibles.filter(c => activos.some(i => i.chapter_id === c.id)).length}</b><span>capítulos</span></div>
        <div><b>${activos.length}</b><span>ítems</span></div>
        <div><b>${fmtPts(totalPts)}</b><span>puntos</span></div>
      </div>
      <div class="adm-barra">
        <label class="interruptor chico"><input type="checkbox" id="ck-bajas" ${verBajas ? 'checked' : ''}><span></span>Mostrar dados de baja</label>
        <button class="btn primario con-texto" id="ck-nuevo-cap">${ICON.mas}<span>Capítulo</span></button>
      </div>
      <div class="ck-lista">${capsVisibles.map(capHtml).join('') || '<div class="vacio"><p>Todavía no hay capítulos. Creá el primero o cargá el checklist desde una planilla.</p></div>'}</div>
      ${botonMasivo('Cargar el checklist completo desde una planilla')}`,
    montar(app) {
      $('#ck-bajas').onchange = e => { S.verBajas = e.target.checked; render(); };
      $('#ck-nuevo-cap').onclick = () => abrirCap(null);
      $$('.ck-cap', app).forEach(d => d.addEventListener('toggle', () => { const id = Number(d.dataset.cap); d.open ? abiertos.add(id) : abiertos.delete(id); }));
      $('.ck-lista', app).addEventListener('click', async e => {
        const t = e.target.closest('[data-edit-cap],[data-mover-cap],[data-edit-item],[data-mover-item],[data-nuevo-item]');
        if (!t) return;
        e.preventDefault();
        if (t.dataset.editCap) return abrirCap(capitulos.find(c => c.id === Number(t.dataset.editCap)));
        if (t.dataset.editItem) return abrirItem(items.find(i => i.id === Number(t.dataset.editItem)));
        if (t.dataset.nuevoItem) return abrirItem(null, Number(t.dataset.nuevoItem));
        t.disabled = true;
        try {
          if (t.dataset.moverCap) await post(`/api/admin/capitulos/${t.dataset.moverCap}/mover`, { dir: t.dataset.dir });
          if (t.dataset.moverItem) await post(`/api/admin/items/${t.dataset.moverItem}/mover`, { dir: t.dataset.dir });
          await cargarCatalogo().catch(() => {});
          render();
        } catch (err) { toast(err.message); t.disabled = false; }
      });
      $('#adm-masivo').onclick = () => abrirHoja({
        titulo: 'Cargar el checklist desde una planilla',
        html: `<p class="sub" style="margin:0">Una fila por ítem. Los puntos son lo que vale el ítem; el peso del capítulo, cuánto pesa en el total.</p>
          <pre class="plantilla">capitulo;peso_capitulo;seccion;item;puntos;critico
Cámara de helados;11;Control;Temperatura adecuada (-20 °C a -25 °C);5;no</pre>
          <textarea id="m-csv" placeholder="Pegá acá las filas"></textarea>
          <label class="interruptor"><input type="checkbox" id="m-reemp"><span></span>Reemplazar el checklist entero (lo que no esté en la planilla se da de baja)</label>
          <div id="m-res"></div>`,
        textoGuardar: 'Cargar checklist',
        guardar: async hoja => {
          const reemp = $('#m-reemp', hoja).checked;
          if (reemp && !confirm('¿Reemplazar el checklist entero? Los relevamientos anteriores no cambian.')) return false;
          const r = await post('/api/admin/checklist/importar', { csv: valor(hoja, '#m-csv'), reemplazar: reemp });
          $('#m-res', hoja).innerHTML = resultadoImport(r, `${r.importados} ítems cargados.`);
          await cargarCatalogo().catch(() => {});
          if (!r.errores.length) { toast(`${r.importados} ítems cargados`); render(); return true; }
          return false;
        }
      });
    }
  };
}

/* ================================================================ tareas */

const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400e3);
const hoyAR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const fechaCorta = ymd => ymd ? ymd.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '';

function estadoTarea(t) {
  if (t.status === 'cerrada') return { cls: 'cerrada', txt: t.closed_at ? `Cerrada el ${fecha(t.closed_at)}` : 'Cerrada' };
  const d = diasEntre(hoyAR(), t.due_date);
  if (d < 0) return { cls: 'vencida', txt: `Venció hace ${-d} ${d === -1 ? 'día' : 'días'}` };
  if (d === 0) return { cls: 'hoy', txt: 'Vence hoy' };
  return { cls: 'abierta', txt: d === 1 ? 'Vence mañana' : `Vence en ${d} días (${fechaCorta(t.due_date)})` };
}

function filaTarea(t, sinLocal = false) {
  const e = estadoTarea(t);
  return `
    <a class="fila tarea" href="#/tarea/${t.id}">
      <span class="t-estado ${e.cls}">${e.cls === 'cerrada' ? ICON.check : e.cls === 'vencida' ? ICON.alerta : ICON.reloj}</span>
      <span class="fila-txt"><strong>${esc(t.title)}</strong>
        <small>${sinLocal ? '' : `${esc(nom(t.store_name))} · `}<span class="t-venc ${e.cls}">${e.txt}</span>${t.assignee_name && !sinLocal ? ` · ${esc(t.assignee_name)}` : ''}</small></span>
      <span class="fila-der">${t.starred ? `<span class="estrella">${ICON.estrella}</span>` : ''}<span class="flecha">${ICON.derecha}</span></span>
    </a>`;
}

async function vTareas() {
  const filtro = S.filtroTareas || 'abiertas';
  const d = await api(`/api/tareas?estado=${filtro === 'cerradas' ? 'cerradas' : 'abiertas'}`);
  const todas = d.tareas;
  const hoy = d.hoy;
  const responsables = [...new Set(todas.map(t => t.assignee_name).filter(Boolean))].sort();
  const estado = { q: '', resp: '' };
  const filtros = [
    ['abiertas', 'Abiertas', t => true],
    ['vencidas', 'Vencidas', t => t.due_date < hoy],
    ['hoy', 'Vencen hoy', t => t.due_date === hoy],
    ['destacadas', 'Destacadas', t => t.starred],
    ['cerradas', 'Cerradas', t => true]
  ];
  const fn = filtros.find(f => f[0] === filtro)[2];

  const dibujar = () => {
    const q = estado.q.toLowerCase();
    const l = todas.filter(t => fn(t)
      && (!estado.resp || t.assignee_name === estado.resp)
      && (!q || t.title.toLowerCase().includes(q) || nom(t.store_name).toLowerCase().includes(q) || t.code.toLowerCase().includes(q)));
    $('#lista-tareas').innerHTML = l.length
      ? `<div class="lista">${l.slice(0, 300).map(t => filaTarea(t)).join('')}</div>${l.length > 300 ? `<p class="sub" style="text-align:center;margin-top:10px">Mostrando 300 de ${l.length}. Usá el buscador para acotar.</p>` : ''}`
      : `<div class="vacio"><span class="vacio-ico">${ICON.check}</span><p>${filtro === 'cerradas' ? 'Todavía no hay tareas cerradas.' : 'No hay tareas en esta vista.'}</p></div>`;
    $('#cuenta-tareas').textContent = `${l.length} ${l.length === 1 ? 'tarea' : 'tareas'}`;
  };

  return {
    titulo: 'Tareas',
    html: `
      ${esJefe() ? `<a class="btn primario ancho" href="#/tareas/nueva" style="margin-bottom:16px">${ICON.mas}Nueva tarea</a>` : ''}
      <div class="buscador">
        <label class="buscar">${ICON.buscar}<input type="search" id="q" placeholder="Buscar por tarea o local" autocomplete="off" aria-label="Buscar tareas"></label>
        <div class="chips">${filtros.map(([k, t, f]) => `<button class="chip ${k === filtro ? 'activo' : ''}" data-f="${k}">${t}${k !== 'cerradas' && filtro !== 'cerradas' ? ` ${todas.filter(f).length}` : ''}</button>`).join('')}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <span class="sub" id="cuenta-tareas"></span>
          ${esJefe() && responsables.length > 1 ? `<select id="resp" style="width:auto;min-height:38px;max-width:60%"><option value="">Todos los responsables</option>${responsables.map(r => `<option>${esc(r)}</option>`).join('')}</select>` : ''}
        </div>
      </div>
      <div id="lista-tareas"></div>`,
    montar() {
      $('#q').oninput = e => { estado.q = e.target.value; dibujar(); };
      const r = $('#resp');
      if (r) r.onchange = e => { estado.resp = e.target.value; dibujar(); };
      $$('.chip[data-f]').forEach(c => c.onclick = () => { S.filtroTareas = c.dataset.f; render(); });
      dibujar();
    }
  };
}

async function vTarea(id) {
  const { tarea: t, hallazgo: h } = await api(`/api/tareas/${id}`);
  const e = estadoTarea(t);
  let foto = null;

  return {
    titulo: 'Tarea',
    atras: '#/tareas',
    html: `
      <section class="hero">
        <p class="hero-sub">${esc(t.code)} · ${esc(nom(t.store_name))}</p>
        <h2 class="hero-titulo">${esc(t.title)}</h2>
        <p class="hero-meta">Responsable: ${esc(t.assignee_name || 'Sin asignar')}</p>
        <p class="hero-meta">${t.origin === 'relevamiento' ? `Surgió del relevamiento del ${fecha(h?.fecha || t.created_at)}` : `Creada por ${esc(t.creator_name || '')} el ${fecha(t.created_at)}`}</p>
        <div class="hero-chips"><span class="chip-tarea ${e.cls}">${e.txt}</span>
          <button class="chip-estrella ${t.starred ? 'on' : ''}" id="estrella" aria-pressed="${!!t.starred}">${ICON.estrella}${t.starred ? 'Destacada' : 'Destacar'}</button></div>
      </section>

      ${t.detail || h ? `
      <div class="bloque"><h2>${h ? 'Lo que se encontró' : 'Detalle'}</h2>
        <div class="card">
          ${t.detail ? `<p style="margin:0">${esc(t.detail)}</p>` : '<p class="sub" style="margin:0">Sin comentario del relevamiento.</p>'}
          ${h?.fotos.length ? `<div class="thumbs">${h.fotos.map(f => `<div class="thumb"><a href="${fotoUrl(f)}" target="_blank" rel="noopener"><img loading="lazy" src="${fotoUrl(f)}" alt="Foto del hallazgo"></a></div>`).join('')}</div>` : ''}
          ${h ? `<p class="sub" style="margin-top:12px">Relevado por ${esc(h.usuario || '')}. <a href="#/rel/${t.audit_id}">Ver relevamiento</a></p>` : ''}
        </div>
      </div>` : ''}

      ${t.status === 'abierta' ? `
      <div class="bloque"><h2>Cerrar la tarea</h2>
        <div class="card form">
          <label>Qué se hizo<textarea id="nota" placeholder="Por ejemplo: se cambiaron los focos del salón"></textarea></label>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <label class="foto-btn">${ICON.camara}Foto de cómo quedó<input type="file" id="foto" accept="image/*" capture="environment" hidden></label>
            <div class="thumbs" id="foto-prev"></div>
          </div>
          <p class="error" id="err" hidden></p>
          <button class="btn primario" id="cerrar" ${navigator.onLine ? '' : 'disabled'}>${ICON.check}${navigator.onLine ? 'Marcar como resuelta' : 'Sin conexión'}</button>
        </div>
      </div>
      ${esJefe() ? `
      <div class="bloque"><h2>Cambiar vencimiento</h2>
        <div class="card" style="display:flex;gap:10px"><input type="date" id="vence" value="${t.due_date}" style="flex:1"><button class="btn" id="guardar-venc">Guardar</button></div>
      </div>` : ''}` : `
      <div class="bloque"><h2>Resolución</h2>
        <div class="card">
          <p style="margin:0">${esc(t.close_note || 'Sin comentario.')}</p>
          ${t.close_drive_id ? `<div class="thumbs"><div class="thumb"><a href="${fotoUrl(t.close_drive_id)}" target="_blank" rel="noopener"><img src="${fotoUrl(t.close_drive_id)}" alt="Foto de la corrección"></a></div></div>` : ''}
          <p class="sub" style="margin-top:12px">Cerrada ${t.closer_name ? `por ${esc(t.closer_name)} ` : ''}el ${fecha(t.closed_at)}${t.closed_at && hoyAR() && t.closed_at.slice(0, 10) > t.due_date ? ', fuera de plazo' : ''}.</p>
        </div>
        ${esJefe() ? `<button class="btn ancho fantasma" id="reabrir" style="margin-top:10px">Reabrir la tarea</button>` : ''}
      </div>`}`,
    montar() {
      $('#estrella').onclick = async () => {
        try { await post(`/api/tareas/${t.id}`, { destacada: !t.starred }, 'PUT'); render(); }
        catch (err) { toast(err.message); }
      };
      const f = $('#foto');
      if (f) f.onchange = async ev => {
        const file = ev.target.files[0];
        if (!file) return;
        foto = await comprimir(file);
        $('#foto-prev').innerHTML = `<div class="thumb"><img src="${URL.createObjectURL(foto)}" alt="Foto"><button type="button" aria-label="Quitar foto">${ICON.cruz}</button></div>`;
        $('#foto-prev button').onclick = () => { foto = null; $('#foto-prev').innerHTML = ''; };
      };
      const c = $('#cerrar');
      if (c) c.onclick = async () => {
        const nota = $('#nota').value.trim();
        if (!nota && !foto) { errorForm('Contá qué se hizo o subí una foto de cómo quedó'); return; }
        c.disabled = true;
        c.textContent = 'Guardando…';
        try {
          await post(`/api/tareas/${t.id}/cerrar`, { nota, data: foto ? await blobA64(foto) : null });
          toast('Tarea resuelta');
          S.cont = null;
          location.hash = '#/tareas';
        } catch (err) {
          errorForm(err.message);
          c.disabled = false;
          c.innerHTML = `${ICON.check}Marcar como resuelta`;
        }
      };
      const g = $('#guardar-venc');
      if (g) g.onclick = async () => {
        try { await post(`/api/tareas/${t.id}`, { vence: $('#vence').value }, 'PUT'); toast('Vencimiento actualizado'); render(); }
        catch (err) { toast(err.message); }
      };
      const r = $('#reabrir');
      if (r) r.onclick = async () => {
        try { await post(`/api/tareas/${t.id}/reabrir`, {}); toast('Tarea reabierta'); render(); }
        catch (err) { toast(err.message); }
      };
    }
  };
}

async function vTareaNueva() {
  if (!esJefe()) { location.hash = '#/tareas'; return null; }
  if (!S.cat) await cargarCatalogo();
  const locales = [...S.cat.stores].sort((a, b) => nom(a.name).localeCompare(nom(b.name), 'es'));
  const sups = [...new Set(locales.flatMap(l => (l.supervisores || []).map(x => x.name)))].sort();
  const tipos = [...new Set(locales.map(l => l.type).filter(Boolean))].sort();
  const paises = [...new Set(locales.map(l => l.country).filter(Boolean))].sort();
  const elegidos = new Set();
  const f = { q: '', sup: '', tipo: '', pais: '' };
  const visibles = () => locales.filter(l =>
    (!f.q || nom(l.name).toLowerCase().includes(f.q) || l.code.toLowerCase().includes(f.q)) &&
    (!f.sup || (l.supervisores || []).some(x => x.name === f.sup)) && (!f.tipo || l.type === f.tipo) && (!f.pais || l.country === f.pais));
  const en7 = new Date(Date.now() - 3 * 3600e3 + 7 * 86400e3).toISOString().slice(0, 10);

  const dibujar = () => {
    const v = visibles();
    $('#sel-lista').innerHTML = v.map(l => `
      <label class="sel-fila"><input type="checkbox" value="${l.id}" ${elegidos.has(l.id) ? 'checked' : ''}>
        <span class="fila-txt"><strong>${esc(nom(l.name))}</strong><small>${esc(l.code)} · ${esc(l.supervisor_name || 'Sin supervisor')}</small></span></label>`).join('')
      || '<p class="sub" style="padding:14px">Ningún local coincide.</p>';
    $('#sel-n').textContent = `${elegidos.size} ${elegidos.size === 1 ? 'local elegido' : 'locales elegidos'}`;
  };
  const opciones = (arr, todos) => `<option value="">${todos}</option>${arr.map(x => `<option>${esc(x)}</option>`).join('')}`;

  return {
    titulo: 'Nueva tarea',
    atras: '#/tareas',
    html: `
      <div class="card form">
        <label>Qué hay que hacer<input id="titulo" placeholder="Por ejemplo: revisión de aires acondicionados" maxlength="300"></label>
        <label>Detalle (opcional)<textarea id="detalle" placeholder="Instrucciones, a quién llamar, qué foto sacar"></textarea></label>
        <label>Vence el<input type="date" id="vence" value="${en7}"></label>
        <label class="check"><input type="checkbox" id="dest"> Destacarla (aparece primero en la lista de cada responsable)</label>
      </div>
      <div class="bloque">
        <h2>En qué locales</h2>
        <p class="sub" style="margin:-6px 0 12px">Se crea una tarea por local, asignada a su supervisor.</p>
        <div class="card">
          <label class="buscar">${ICON.buscar}<input type="search" id="sel-q" placeholder="Buscar local" autocomplete="off" aria-label="Buscar local"></label>
          <div class="sel-filtros">
            <select id="sel-sup">${opciones(sups, 'Todos los supervisores')}</select>
            ${tipos.length ? `<select id="sel-tipo">${opciones(tipos, 'Todos los tipos')}</select>` : ''}
            ${paises.length > 1 ? `<select id="sel-pais">${opciones(paises, 'Todos los países')}</select>` : ''}
          </div>
          <div class="sel-acciones"><button class="btn chico" id="sel-todos">Marcar los de la lista</button><button class="btn chico fantasma" id="sel-ninguno">Desmarcar todos</button><span class="sub" id="sel-n"></span></div>
          <div class="sel-lista" id="sel-lista"></div>
        </div>
      </div>
      <p class="error" id="err" hidden style="margin-top:14px"></p>
      <button class="btn primario ancho" id="crear" style="margin-top:16px">${ICON.mas}Crear tareas</button>`,
    montar() {
      $('#sel-q').oninput = e => { f.q = e.target.value.toLowerCase(); dibujar(); };
      $('#sel-sup').onchange = e => { f.sup = e.target.value; dibujar(); };
      if ($('#sel-tipo')) $('#sel-tipo').onchange = e => { f.tipo = e.target.value; dibujar(); };
      if ($('#sel-pais')) $('#sel-pais').onchange = e => { f.pais = e.target.value; dibujar(); };
      $('#sel-todos').onclick = () => { visibles().forEach(l => elegidos.add(l.id)); dibujar(); };
      $('#sel-ninguno').onclick = () => { elegidos.clear(); dibujar(); };
      $('#sel-lista').onchange = e => {
        const id = Number(e.target.value);
        e.target.checked ? elegidos.add(id) : elegidos.delete(id);
        $('#sel-n').textContent = `${elegidos.size} ${elegidos.size === 1 ? 'local elegido' : 'locales elegidos'}`;
      };
      $('#crear').onclick = async ev => {
        const titulo = $('#titulo').value.trim();
        if (!titulo) return errorForm('Escribí qué hay que hacer');
        if (!$('#vence').value) return errorForm('Elegí la fecha de vencimiento');
        if (!elegidos.size) return errorForm('Elegí al menos un local');
        ev.currentTarget.disabled = true;
        try {
          const r = await post('/api/tareas', { titulo, detalle: $('#detalle').value, vence: $('#vence').value, destacada: $('#dest').checked, locales: [...elegidos] });
          toast(`${r.creadas} ${r.creadas === 1 ? 'tarea creada' : 'tareas creadas'}`);
          S.cont = null;
          location.hash = '#/tareas';
        } catch (err) {
          errorForm(err.message);
          ev.currentTarget.disabled = false;
        }
      };
      dibujar();
    }
  };
}

/* ================================================================ informe PDF */

let _jspdf = null;
function cargarJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (_jspdf) return _jspdf;
  _jspdf = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    sc.onload = () => res(window.jspdf.jsPDF);
    sc.onerror = () => { _jspdf = null; rej(new Error('no se pudo cargar el generador, revisá la conexión')); };
    document.head.appendChild(sc);
  });
  return _jspdf;
}

// Baja la foto de Drive y la achica para que el PDF no pese de más
async function fotoParaPDF(f) {
  const r = await fetch(fotoSrc(f));
  if (!r.ok) throw new Error('foto');
  const img = await createImageBitmap(await r.blob());
  const max = 700, k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return { data: c.toDataURL('image/jpeg', 0.7), w: c.width, h: c.height };
}
function imgLocal(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    if (/^https?:/.test(src) && !src.startsWith(location.origin)) i.crossOrigin = 'anonymous';
    i.onload = () => res(i); i.onerror = rej; i.src = src;
  });
}
// Helvetica del PDF no tiene algunos signos tipográficos: los paso a su versión simple
const txtPDF = t => String(t ?? '').replace(/[’´`]/g, "'").replace(/[“”]/g, '"').replace(/[•·]/g, '-').replace(/[–—]/g, '-').replace(/…/g, '...');

async function informePDF(d) {
  const jsPDF = await cargarJsPDF();
  const r = d.relevamiento;
  const fallas = d.respuestas.filter(x => x.value === 'fail' || x.value === 'partial');
  const parciales = d.respuestas.filter(x => x.value === 'partial').length;
  const cumple = d.respuestas.filter(x => x.value === 'ok').length;
  const na = d.respuestas.filter(x => x.value === 'na').length;
  const tareaDe = itemId => d.tareas.find(t => t.item_id === itemId);

  const logo = await imgLocal('logo-blanco.png').catch(() => null);
  const fotos = {};
  for (const f of d.fotos) {
    if (!fallas.some(x => x.item_id === f.item_id)) continue;
    (fotos[f.item_id] ||= []);
    if (fotos[f.item_id].length >= 3) continue;
    try { fotos[f.item_id].push(await fotoParaPDF(f)); } catch { /* si una foto no baja (por ejemplo, un link de Linkup), sigue sin ella */ }
  }

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
  const INK = [10, 10, 10], SOFT = [92, 93, 97], MUTE = [150, 151, 156], LINE = [225, 225, 228], PAPER = [244, 244, 245];
  const COL = { aprobado: [28, 122, 69], observado: [179, 121, 31], urgente: [196, 83, 27], critico: [179, 38, 30], sd: [160, 161, 165] };
  let y = 0;
  const salto = need => { if (y + need > H - 50) { doc.addPage(); y = 50; } };
  const texto = (t, x, yy, o = {}) => doc.text(txtPDF(t), x, yy, o);
  const lineas = (t, ancho) => doc.splitTextToSize(txtPDF(t), ancho);

  // ---- encabezado
  doc.setFillColor(...INK); doc.rect(0, 0, W, 132, 'F');
  if (logo) { const lh = 36, lw = lh * (logo.width / logo.height); doc.addImage(logo, 'PNG', M, 30, lw, lh); }
  doc.setTextColor(170, 170, 175); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  texto('INFORME DE RELEVAMIENTO', W - M, 40, { align: 'right' });
  doc.setTextColor(255, 255, 255); doc.setFontSize(18);
  texto(nom(r.store_name), W - M, 62, { align: 'right' });
  doc.setTextColor(180, 180, 185); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  texto(`${r.code}  |  ${mesLabel(r.period)}`, W - M, 78, { align: 'right' });
  doc.setFontSize(9.5);
  texto(`Relevado el ${fecha(r.client_created_at)} por ${r.usuario}`, M, 110);
  if (r.distance_m > DISTANCIA_MAX) {
    doc.setTextColor(241, 185, 90);
    texto(`Cargado a ${fmtDist(r.distance_m)} del local`, W - M, 110, { align: 'right' });
  }

  // ---- puntaje
  y = 160;
  const col = COL[r.escala];
  doc.setFillColor(...PAPER); doc.roundedRect(M, y, W - 2 * M, 92, 10, 10, 'F');
  doc.setFillColor(...col); doc.roundedRect(M, y, 6, 92, 3, 3, 'F');
  doc.setTextColor(...col); doc.setFont('helvetica', 'bold'); doc.setFontSize(40);
  texto(fmt(r.score), M + 26, y + 54);
  doc.setFontSize(11); texto(ESCALAS[r.escala], M + 28, y + 74);
  const stats = [[cumple, 'Cumplen'], [parciales, 'Parciales'], [fallas.length - parciales, 'No cumplen'], [na, 'No aplican']];
  stats.forEach(([n, l], i) => {
    const x = W - M - 20 - (3 - i) * 74;
    doc.setTextColor(...INK); doc.setFontSize(22); doc.setFont('helvetica', 'bold');
    texto(String(n), x, y + 50, { align: 'right' });
    doc.setTextColor(...SOFT); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    texto(l, x, y + 66, { align: 'right' });
  });
  y += 122;

  // ---- capítulos
  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  texto('Resultado por capítulo', M, y); y += 20;
  d.capitulos.forEach(c => {
    salto(30);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...INK);
    texto(c.nombre, M, y);
    doc.setTextColor(...MUTE); doc.setFontSize(8.5);
    texto(c.posibles ? `${fmtPts(c.puntos)}/${fmtPts(c.posibles)} ptos  |  pesa ${fmtPeso(c.peso)}%` : 'No aplica', W - M - 52, y, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...COL[c.escala]);
    texto(c.posibles ? fmt(c.score) : 'N/A', W - M, y, { align: 'right' });
    doc.setFillColor(...LINE); doc.roundedRect(M, y + 6, W - 2 * M, 5, 2.5, 2.5, 'F');
    if (c.score) { doc.setFillColor(...COL[c.escala]); doc.roundedRect(M, y + 6, (W - 2 * M) * c.score / 100, 5, 2.5, 2.5, 'F'); }
    y += 28;
  });

  // ---- incumplimientos
  y += 12; salto(60);
  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  texto(fallas.length ? `Qué hay que corregir (${fallas.length})` : 'Sin incumplimientos', M, y); y += 18;
  fallas.forEach(x => {
    // el ancho de cada renglón depende de la letra: se fija antes de partir el texto
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
    const ls = lineas(x.text, W - 2 * M - 24);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9.5);
    const cm = x.comment ? lineas(x.comment, W - 2 * M - 24) : [];
    const fs = fotos[x.item_id] || [];
    const t = tareaDe(x.item_id);
    const alto = 16 + ls.length * 13 + 14 + cm.length * 12 + (fs.length ? 118 : 0) + (t ? 16 : 0) + 10;
    salto(alto);
    const y0 = y;
    doc.setFillColor(...(x.value === 'partial' ? COL.observado : COL.critico)); doc.rect(M, y0, 3, alto - 10, 'F');
    y += 12;
    doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
    doc.text(ls, M + 14, y); y += ls.length * 13;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTE);
    texto(`${x.capitulo}${x.seccion ? ' / ' + x.seccion : ''}  |  ${x.value === 'partial' ? `PARCIAL ${fmtPts(x.earned ?? x.weight / 2)} de ${fmtPts(x.weight)} ptos` : `NO CUMPLE 0 de ${fmtPts(x.weight)} ptos`}${x.critical ? '  |  ITEM CRITICO' : ''}`, M + 14, y); y += 14;
    if (cm.length) { doc.setTextColor(...SOFT); doc.setFont('helvetica', 'italic'); doc.setFontSize(9.5); doc.text(cm, M + 14, y); y += cm.length * 12; }
    if (fs.length) {
      let x0 = M + 14;
      fs.forEach(f => {
        const h = 108, w = Math.min(160, h * f.w / f.h);
        doc.addImage(f.data, 'JPEG', x0, y + 2, w, h);
        x0 += w + 8;
      });
      y += 118;
    }
    if (t) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK);
      texto(t.status === 'cerrada' ? `Tarea resuelta el ${fecha(t.closed_at)}` : `Corregir antes del ${fechaCorta(t.due_date)}/${t.due_date.slice(0, 4)}${t.assignee_name ? `  |  Responsable: ${t.assignee_name}` : ''}`, M + 14, y + 4);
      y += 16;
    }
    y += 12;
  });

  // ---- observaciones
  if (r.notes) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const ls = lineas(r.notes, W - 2 * M - 28);
    salto(40 + ls.length * 13);
    y += 6;
    doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    texto('Observaciones generales', M, y); y += 12;
    doc.setFillColor(...PAPER); doc.roundedRect(M, y, W - 2 * M, ls.length * 13 + 20, 8, 8, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...SOFT);
    doc.text(ls, M + 14, y + 17); y += ls.length * 13 + 30;
  }

  // ---- firma
  if (r.sign_name || r.sign_png) {
    salto(150);
    y += 10;
    doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    texto('Conformidad del encargado', M, y); y += 12;
    if (r.sign_png) {
      const im = await imgLocal(r.sign_png).catch(() => null);
      if (im) {
        const w = 220, h = Math.min(90, w * im.height / im.width);
        try { doc.addImage(im, 'PNG', M, y, w, h); y += h; } catch { /* firma externa que no se puede incrustar */ }
      }
    }
    doc.setDrawColor(...LINE); doc.line(M, y + 4, M + 240, y + 4);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...SOFT);
    texto(r.sign_name || '', M, y + 18);
    y += 30;
  }

  // ---- pie de página
  const n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE); doc.line(M, H - 34, W - M, H - 34);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTE);
    texto(`Lucciano's - Relevamientos  |  ${r.code} ${nom(r.store_name)}  |  Generado el ${fecha(new Date().toISOString())}`, M, H - 20);
    texto(`Página ${i} de ${n}`, W - M, H - 20, { align: 'right' });
  }

  doc.save(`Informe_${r.code}_${r.period}.pdf`);
}

/* ================================================================ vistas: cuenta */

function vCuenta() {
  const u = S.user;
  return {
    titulo: 'Cuenta',
    html: `
      <section class="perfil">
        <span class="avatar grande r-${u.role}">${esc(iniciales(u.name))}</span>
        <div><h2>${esc(u.name)}</h2><p>${esc(u.email)}</p><span class="rol-chip r-${u.role}">${ROL[u.role]}</span></div>
      </section>

      <div class="menu">
        ${esJefe() ? `
        <a class="menu-fila" href="#/admin">
          <span class="menu-ico">${ICON.admin}</span>
          <span class="fila-txt"><strong>Administración</strong><small>Usuarios, locales y checklist</small></span>
          <span class="flecha">${ICON.derecha}</span></a>` : ''}
        <button class="menu-fila" id="act">
          <span class="menu-ico">${ICON.sync}</span>
          <span class="fila-txt"><strong>Actualizar datos</strong><small>${S.cat ? `${S.cat.stores.length} locales y ${S.cat.items.length} ítems, al ${fecha(S.cat.at)}` : 'Todavía no se descargaron'}</small></span>
        </button>
        <button class="menu-fila" id="clave">
          <span class="menu-ico">${ICON.llave}</span>
          <span class="fila-txt"><strong>Cambiar clave</strong><small>Para entrar a la app</small></span>
          <span class="flecha">${ICON.derecha}</span>
        </button>
        <button class="menu-fila salir" id="salir">
          <span class="menu-ico">${ICON.salir}</span>
          <span class="fila-txt"><strong>Cerrar sesión</strong></span>
        </button>
      </div>
      <p class="version">Relevamientos Lucciano's · versión ${VERSION}</p>`,
    montar() {
      $('#act').onclick = async e => {
        const b = e.currentTarget;
        b.disabled = true;
        try { await cargarCatalogo(); toast('Datos actualizados'); render(); }
        catch (err) { toast(err.message); b.disabled = false; }
      };
      $('#clave').onclick = () => abrirHoja({
        titulo: 'Cambiar clave',
        html: `${campoClave('Clave actual', 'actual', 'autocomplete="current-password"')}
               ${campoClave('Clave nueva (mínimo 8 caracteres)', 'nueva', 'autocomplete="new-password"')}`,
        textoGuardar: 'Cambiar clave',
        guardar: async hoja => {
          const actual = $('[name=actual]', hoja).value, nueva = $('[name=nueva]', hoja).value;
          if (!actual) throw new Error('Escribí tu clave actual');
          if (nueva.length < 8) throw new Error('La clave nueva tiene que tener al menos 8 caracteres');
          await post('/api/cambiar-clave', { actual, nueva });
          toast('Clave cambiada');
        }
      });
      $('#salir').onclick = async () => {
        const n = (await idb.all('cola')).length;
        if (n && !confirm(`Tenés ${n} relevamiento(s) sin enviar. Si cerrás sesión no se van a poder enviar hasta que vuelvas a ingresar. ¿Salir igual?`)) return;
        salir();
      };
    }
  };
}

/* ================================================================ arranque */

window.addEventListener('hashchange', render);
window.addEventListener('online', () => { toast('Volvió la conexión'); sincronizar(); });
setInterval(sincronizar, 60000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
if (S.token && navigator.onLine) {
  cargarCatalogo().catch(() => {});
  sincronizar();
}
