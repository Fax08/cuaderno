// Corrector ortográfico en segundo plano (Hunspell vía nspell).
// Una palabra es correcta si lo es en alguno de los idiomas activos o está en el diccionario personal.
import nspell from 'nspell';

let spells = {}; // código → instancia nspell (idiomas activos en el corrector)
let extra = {}; // diccionarios cargados solo para detectar el idioma de una palabra
let personal = new Set();
const dict = (code) => spells[code] || extra[code];

const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

function correctIn(code, word) {
  const sp = dict(code);
  if (!sp) return false;
  if (sp.correct(word)) return true;
  if (code === 'de') return compoundDe(word, 0);
  return false;
}

// Alemán: acepta compuestos si sus partes son palabras válidas (con "s" de unión opcional)
function compoundDe(word, depth) {
  if (depth > 2 || word.length < 7) return false;
  const sp = dict('de');
  for (let i = 3; i <= word.length - 3; i++) {
    const left = word.slice(0, i);
    const rest = word.slice(i);
    const lefts = [left];
    if (left.endsWith('s') && left.length > 3) lefts.push(left.slice(0, -1));
    const leftOk = lefts.some((l) => sp.correct(l) || sp.correct(cap(l)));
    if (!leftOk) continue;
    const r = cap(rest.toLowerCase());
    if (sp.correct(r) || sp.correct(rest) || compoundDe(r, depth + 1)) return true;
  }
  return false;
}

function isCorrect(word, also = []) {
  if (personal.has(word) || personal.has(word.toLowerCase())) return true;
  return [...new Set([...Object.keys(spells), ...also])].some((code) => correctIn(code, word));
}

async function loadExtra(need) {
  for (const [code, urls] of Object.entries(need || {})) {
    if (dict(code)) continue;
    const [aff, dic] = await Promise.all([fetch(urls.aff).then((r) => r.text()), fetch(urls.dic).then((r) => r.text())]);
    extra[code] = nspell(aff, dic);
  }
}

// Español: tildes y confusiones frecuentes (s/c/z, b/v, ll/y, h)
const ACCENTS = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' };
const SWAPS = [['s', 'c'], ['c', 's'], ['s', 'z'], ['z', 's'], ['c', 'z'], ['z', 'c'], ['b', 'v'], ['v', 'b'], ['ll', 'y'], ['y', 'll'], ['j', 'g'], ['g', 'j'], ['n', 'ñ'], ['rr', 'r'], ['r', 'rr']];
function spanishCandidates(word) {
  const w = word.toLowerCase();
  const variants = new Set([w, w.replace(/^h/, ''), `h${w}`]);
  for (const [a, b] of SWAPS) {
    let i = w.indexOf(a);
    while (i >= 0) { variants.add(w.slice(0, i) + b + w.slice(i + a.length)); i = w.indexOf(a, i + 1); }
  }
  const out = new Set();
  for (const v of variants) {
    out.add(v);
    for (let i = 0; i < v.length; i++) if (ACCENTS[v[i]]) out.add(v.slice(0, i) + ACCENTS[v[i]] + v.slice(i + 1));
  }
  out.delete(w);
  return [...out];
}

// Distancia de edición (sin distinguir tildes ni mayúsculas) para ordenar sugerencias
const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function distance(a, b) {
  a = plain(a); b = plain(b);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function suggest(word) {
  const list = [];
  const push = (s) => { if (s && !list.includes(s) && s !== word) list.push(s); };
  const upper = word[0] === word[0].toUpperCase();
  if (spells.es) {
    for (const c of spanishCandidates(word)) if (spells.es.correct(c)) push(upper ? cap(c) : c);
  }
  for (const code of Object.keys(spells)) {
    try { spells[code].suggest(word).slice(0, 5).forEach(push); } catch { /* sin sugerencias */ }
  }
  return list
    .map((s, i) => ({ s, i, d: distance(word, s) }))
    .sort((x, y) => x.d - y.d || x.i - y.i)
    .slice(0, 7)
    .map((x) => x.s);
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      const next = {};
      for (const [code, urls] of Object.entries(m.langs)) {
        if (spells[code] && m.keep?.includes(code)) { next[code] = spells[code]; continue; }
        const [aff, dic] = await Promise.all([fetch(urls.aff).then((r) => r.text()), fetch(urls.dic).then((r) => r.text())]);
        next[code] = nspell(aff, dic);
      }
      spells = next;
      personal = new Set(m.personal || []);
      self.postMessage({ type: 'ready', id: m.id });
    } else if (m.type === 'check') {
      // "also": idiomas de la página (p. ej. alemán en una página de-es), aunque no estén activos
      await loadExtra(m.need);
      const also = Object.keys(m.need || {});
      self.postMessage({ type: 'checked', id: m.id, bad: m.words.filter((w) => !isCorrect(w, also)) });
    } else if (m.type === 'suggest') {
      self.postMessage({ type: 'suggested', id: m.id, list: suggest(m.word) });
    } else if (m.type === 'which') {
      // En qué idiomas es válida una palabra (para elegir la dirección de traducción).
      // Carga los diccionarios que hagan falta aunque no estén activos en el corrector.
      await loadExtra(m.need);
      const codes = [...new Set([...Object.keys(spells), ...Object.keys(extra)])];
      self.postMessage({ type: 'which', id: m.id, langs: codes.filter((c) => correctIn(c, m.word)), loaded: codes });
    } else if (m.type === 'personal') {
      personal = new Set(m.words);
      self.postMessage({ type: 'ok', id: m.id });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String(err && err.message || err) });
  }
};
