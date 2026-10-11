// Traducción de palabras y expresiones cortas para las páginas de idiomas.
// Fuentes: Wiktionary en español (acepciones, género) y, si no encuentra, MyMemory (filtrado).
// Las respuestas se guardan en ".traducciones.json" en la carpeta de notas (funciona sin conexión
// para lo ya buscado y no repite consultas).

export const TRAD_LANGS = { es: 'Español', en: 'Inglés', de: 'Alemán' };
export const PAIRS = [['de', 'es'], ['en', 'es'], ['es', 'de'], ['es', 'en']];
export const pairLabel = ([a, b]) => `${TRAD_LANGS[a]} → ${TRAD_LANGS[b]}`;
export function parsePair(v) {
  const m = /^(es|en|de)-(es|en|de)$/.exec(String(v || '').trim());
  return m && m[1] !== m[2] ? [m[1], m[2]] : null;
}

const CACHE_FILE = '.traducciones.json';
const ARTICLE = { m: 'der', f: 'die', n: 'das' };
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;

export const translator = {
  root: null,
  cache: {},
  inflight: new Map(),
  saveTimer: null,
  queue: Promise.resolve(),

  async start(root) {
    this.root = root;
    try {
      const fh = await root.getFileHandle(CACHE_FILE);
      this.cache = JSON.parse(await (await fh.getFile()).text()) || {};
    } catch { this.cache = {}; }
  },

  key(text, from, to) { return `${from}-${to}:${text.trim()}`; },
  cached(text, from, to) { return this.cache[this.key(text, from, to)] || null; },

  persist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      if (!this.root) return;
      try {
        const fh = await this.root.getFileHandle(CACHE_FILE, { create: true });
        const w = await fh.createWritable();
        await w.write(JSON.stringify(this.cache, null, 1));
        await w.close();
      } catch { /* se reintenta en la próxima traducción */ }
    }, 800);
  },

  // Devuelve { main, alts, notas, fuente } o null si no se encontró nada
  translate(text, from, to) {
    const clean = text.trim();
    if (!clean || from === to) return Promise.resolve(null);
    const k = this.key(clean, from, to);
    if (this.cache[k]) return Promise.resolve(this.cache[k]);
    if (this.inflight.has(k)) return this.inflight.get(k);
    // Consultas de a una, espaciadas, para no saturar los servicios gratuitos
    const p = (this.queue = this.queue.then(() => this.lookup(clean, from, to)).then(async (r) => {
      await new Promise((res) => setTimeout(res, 250));
      return r;
    }).catch(() => null));
    const done = p.then((raw) => {
      const r = tidy(raw);
      this.inflight.delete(k);
      if (r && r.main) { this.cache[k] = r; this.persist(); }
      return r && r.main ? r : null;
    });
    this.inflight.set(k, done);
    return done;
  },

  async lookup(text, from, to) {
    let w = null, m = null;
    try { w = await wiktionary(text, from, to); } catch { w = null; }
    try { m = await mymemory(text, from, to); } catch { m = null; }
    if (w && w.main && m && m.main) {
      // La traducción más usada (MyMemory) va primero si también es una acepción del diccionario
      const all = [w.main, ...w.alts];
      const hit = all.find((x) => x.toLowerCase() === m.main.toLowerCase());
      if (hit) return { ...w, main: hit, alts: all.filter((x) => x !== hit).slice(0, 5) };
      return w;
    }
    return w && w.main ? w : m;
  },
};


// Sin alternativas repetidas (ni que solo cambien en mayúsculas)
function tidy(r) {
  if (!r || !r.main) return r;
  const seen = new Set([r.main.toLowerCase()]);
  const alts = r.alts.filter((a) => { const k = a.toLowerCase(); if (!a || seen.has(k)) return false; seen.add(k); return true; });
  return { ...r, alts };
}

// ---------- Wiktionary en español ----------
const cleanWiki = (s) => s
  .replace(/\{\{(?:plm|l\+?|l-lite)\|(?:[a-z]{2}\|)?([^}|]+)[^}]*\}\}/g, '$1')
  .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, '$1')
  .replace(/\[\[([^\]]+)\]\]/g, '$1')
  .replace(/\{\{[^}]*\}\}/g, '')
  .replace(/'{2,}/g, '')
  .replace(/<[^>]+>/g, '')
  .replace(/\s+/g, ' ')
  .trim();

async function wikitext(title) {
  const url = `https://es.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json&origin=*&redirects=1`;
  const r = await fetch(url, { headers: { 'Api-User-Agent': 'Cuaderno/1.0 (https://github.com/Fax08/cuaderno)' } });
  if (!r.ok || !/json/.test(r.headers.get('content-type') || '')) return null;
  const j = await r.json();
  return j.error ? null : j.parse.wikitext['*'];
}

async function wiktionary(text, from, to) {
  if (words(text) > 3) return null;
  if (to === 'es') {
    // Palabra extranjera: buscar su entrada y tomar las acepciones en español
    const bare = from === 'de' ? text.replace(/^(der|die|das)\s+/i, '') : text.replace(/^to\s+/i, '');
    const titles = [bare, bare.toLowerCase(), bare.charAt(0).toUpperCase() + bare.slice(1)];
    for (const title of [...new Set(titles)]) {
      const t = await wikitext(title);
      if (!t) continue;
      const sec = t.split(/(?:^|\n)==\s*\{\{lengua\|/).find((s) => s.startsWith(`${from}}}`));
      if (!sec) continue;
      const terms = [];
      let gender = null;
      let pos = '';
      for (const line of sec.split('\n')) {
        const h = /^===+\s*\{\{([^}|]+)/.exec(line);
        if (h) { pos = h[1]; if (!gender) gender = /femenino/.test(pos) ? 'f' : /masculino/.test(pos) ? 'm' : /neutro/.test(pos) ? 'n' : null; continue; }
        const d = /^;\d+[^:]*:\s*(.+)$/.exec(line);
        if (!d) continue;
        for (const piece of cleanWiki(d[1]).split(/[,;]/)) {
          const term = piece.replace(/^[¡¿\s]+|[.!?\s]+$/g, '').trim();
          if (term && words(term) <= 4 && !terms.includes(term)) terms.push(term);
        }
        if (terms.length >= 6) break;
      }
      if (terms.length) {
        return { main: terms[0], alts: terms.slice(1, 6), notas: from === 'de' && gender ? ARTICLE[gender] : '', fuente: 'Wiktionary' };
      }
    }
    return null;
  }
  if (from === 'es') {
    // Palabra en español: buscar las traducciones listadas en su entrada
    const t = await wikitext(text.toLowerCase());
    if (!t) return null;
    const out = [];
    let notas = '';
    for (const m of t.matchAll(new RegExp(`\\{\\{t\\|${to}\\|([^}]*)\\}\\}`, 'g'))) {
      const params = Object.fromEntries(m[1].split('|').map((p) => p.split('=')).filter((p) => p.length === 2));
      for (let i = 1; i < 10; i++) {
        const v = params[`t${i}`];
        if (!v) continue;
        const term = cleanWiki(v);
        if (term && !out.includes(term)) {
          out.push(term);
          if (!notas && to === 'de' && ARTICLE[params[`g${i}`]]) notas = ARTICLE[params[`g${i}`]];
        }
      }
    }
    return out.length ? { main: out[0], alts: out.slice(1, 6), notas, fuente: 'Wiktionary' } : null;
  }
  return null;
}

// ---------- MyMemory (filtrado: descarta frases largas que no son traducciones) ----------
async function mymemory(text, from, to) {
  const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`);
  if (!r.ok) return null;
  const j = await r.json();
  const max = Math.max(3, words(text) * 2 + 1);
  const cands = [j.responseData && j.responseData.translatedText, ...(j.matches || []).map((m) => m.translation)]
    .filter(Boolean)
    .map((t) => t.trim().replace(/[.!¡]+$/, '').trim())
    .filter((t) => t && words(t) <= max && !/[.;]/.test(t) && t.toLowerCase() !== text.toLowerCase() && !/MYMEMORY WARNING/i.test(t));
  const count = new Map();
  for (const c of cands) { const k = c.toLowerCase(); const e = count.get(k); count.set(k, { t: e ? e.t : c, n: (e ? e.n : 0) + 1 }); }
  const best = [...count.values()].sort((a, b) => b.n - a.n).map((x) => x.t);
  return best.length ? { main: best[0], alts: best.slice(1, 5), notas: '', fuente: 'MyMemory' } : null;
}
