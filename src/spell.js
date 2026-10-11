// Corrector ortográfico propio: subraya en rojo, clic derecho para sugerencias,
// idiomas elegibles (español siempre; inglés y alemán opcionales) y diccionario personal
// guardado en ".diccionario.txt" dentro de la carpeta de notas.
// Diccionarios Hunspell (los de LibreOffice) en public/diccionarios/, con sus licencias.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { esc } from './ui.js';

export const LANGS = {
  es: { label: 'Español', fixed: true },
  en: { label: 'Inglés' },
  de: { label: 'Alemán' },
};
const PERSONAL_FILE = '.diccionario.txt';
const abs = (u) => new URL(u, document.baseURI).href;
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};

// ---------- estado y comunicación con el worker ----------
export const spell = {
  enabled: ls.get('cuaderno.spell.on', true),
  langs: ['es', ...ls.get('cuaderno.spell.langs', []).filter((c) => c !== 'es' && LANGS[c])],
  personal: [],
  ignored: new Set(),
  root: null,
  worker: null,
  ready: null,
  cache: new Map(),
  listeners: new Set(),
  seq: 0,
  pending: new Map(),

  call(msg) {
    if (!this.worker) {
      this.worker = new Worker(new URL('./spell-worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => { const p = this.pending.get(e.data.id); if (p) { this.pending.delete(e.data.id); p(e.data); } };
    }
    const id = ++this.seq;
    return new Promise((resolve) => { this.pending.set(id, resolve); this.worker.postMessage({ ...msg, id }); });
  },

  init() {
    const langs = Object.fromEntries(this.langs.map((c) => [c, { aff: abs(`diccionarios/${c}.aff`), dic: abs(`diccionarios/${c}.dic`) }]));
    this.cache.clear();
    this.ready = this.call({ type: 'init', langs, keep: this.langs, personal: this.personal });
    this.ready.then(() => this.notify());
    return this.ready;
  },

  notify() { this.listeners.forEach((fn) => fn(0)); },

  async start(root) {
    this.root = root;
    try {
      const fh = await root.getFileHandle(PERSONAL_FILE);
      this.personal = (await (await fh.getFile()).text()).split(/\r?\n/).map((w) => w.trim()).filter(Boolean);
    } catch { this.personal = []; }
    if (this.ready) {
      await this.ready;
      await this.call({ type: 'personal', words: this.personal });
      this.cache.clear();
      this.notify();
    }
  },

  // Idiomas extra de la página abierta (los de su propiedad "traduccion"); lo define main.js
  pageLangs: () => [],

  async check(words) {
    if (!this.ready) this.init();
    await this.ready;
    const also = this.pageLangs().filter((c) => LANGS[c] && !this.langs.includes(c));
    const tag = also.sort().join(',');
    if (tag !== this.cacheTag) { this.cache.clear(); this.cacheTag = tag; }
    const unknown = words.filter((w) => !this.cache.has(w));
    if (unknown.length) {
      const need = Object.fromEntries(also.map((c) => [c, { aff: abs(`diccionarios/${c}.aff`), dic: abs(`diccionarios/${c}.dic`) }]));
      const r = await this.call({ type: 'check', words: unknown, need });
      const bad = new Set(r.bad || []);
      unknown.forEach((w) => this.cache.set(w, !bad.has(w)));
    }
    return new Set(words.filter((w) => this.cache.get(w) === false && !this.ignored.has(w)));
  },

  async suggest(word) {
    await this.ready;
    return (await this.call({ type: 'suggest', word })).list || [];
  },

  // { langs: idiomas donde la palabra es válida, loaded: idiomas cargados }
  async which(word, codes = []) {
    if (!this.ready) this.init();
    await this.ready;
    const need = Object.fromEntries(codes.map((c) => [c, { aff: abs(`diccionarios/${c}.aff`), dic: abs(`diccionarios/${c}.dic`) }]));
    const r = await this.call({ type: 'which', word, need });
    return { langs: r.langs || [], loaded: r.loaded || [] };
  },

  async savePersonal() {
    if (this.root) {
      const fh = await this.root.getFileHandle(PERSONAL_FILE, { create: true });
      const w = await fh.createWritable();
      await w.write(`${[...new Set(this.personal)].sort((a, b) => a.localeCompare(b, 'es')).join('\n')}\n`);
      await w.close();
    }
    await this.call({ type: 'personal', words: this.personal });
    this.cache.clear();
    this.notify();
  },

  async addWord(word) {
    if (!this.personal.includes(word)) this.personal.push(word);
    await this.savePersonal();
  },

  async removeWord(word) {
    this.personal = this.personal.filter((w) => w !== word);
    await this.savePersonal();
  },

  ignore(word) { this.ignored.add(word); this.notify(); },

  setEnabled(on) { this.enabled = on; ls.set('cuaderno.spell.on', on); this.notify(); },

  setLang(code, on) {
    const set = new Set(this.langs);
    if (on) set.add(code); else if (!LANGS[code].fixed) set.delete(code);
    this.langs = ['es', ...[...set].filter((c) => c !== 'es')];
    ls.set('cuaderno.spell.langs', this.langs.filter((c) => c !== 'es'));
    return this.init();
  },
};

// ---------- palabras a revisar ----------
const WORD = /\p{L}+(?:['’]\p{L}+)*/gu;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+/g;
const SKIP_MARKS = new Set(['code', 'link']);

function collectWords(doc) {
  const items = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'codeBlock') return false;
    if (!node.isText) return true;
    if (node.marks.some((m) => SKIP_MARKS.has(m.type.name))) return false;
    const text = node.text;
    const urls = [...text.matchAll(URL_RE)].map((m) => [m.index, m.index + m[0].length]);
    for (const m of text.matchAll(WORD)) {
      const w = m[0];
      const a = m.index, b = a + w.length;
      if (w.length < 2) continue;
      if (/\p{Lu}/u.test(w.slice(1))) continue; // siglas y unidades: MPa, TP, kN
      if (/\d/.test(text[a - 1] || '') || /\d/.test(text[b] || '')) continue; // 20cm, TP1
      if (urls.some(([x, y]) => a >= x && b <= y)) continue;
      items.push({ word: w, from: pos + a, to: pos + b });
    }
    return false;
  });
  return items;
}

// ---------- menú de clic derecho ----------
let menu = null;
function closeMenu() { if (menu) { menu.remove(); menu = null; } }
document.addEventListener('mousedown', (e) => { if (menu && !menu.contains(e.target)) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

async function openMenu(view, el, x, y) {
  closeMenu();
  const word = el.textContent;
  const from = view.posAtDOM(el, 0);
  const to = from + word.length;
  if (view.state.doc.textBetween(from, to) !== word) return;
  menu = document.createElement('div');
  menu.className = 'spell-menu';
  menu.innerHTML = '<p class="sm-wait">Buscando sugerencias…</p>';
  document.body.appendChild(menu);
  const place = () => {
    menu.style.left = `${Math.min(x, window.innerWidth - menu.offsetWidth - 10)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - menu.offsetHeight - 10)}px`;
  };
  place();
  const current = menu;
  const list = await spell.suggest(word);
  if (menu !== current) return;
  menu.innerHTML = `${list.length ? list.map((s, i) => `<button type="button" class="sm-item sug" data-s="${i}">${esc(s)}</button>`).join('') : '<p class="sm-wait">Sin sugerencias</p>'}
    <hr>
    <button type="button" class="sm-item" data-add>Agregar «${esc(word)}» al diccionario</button>
    <button type="button" class="sm-item" data-ignore>Ignorar en esta sesión</button>`;
  place();
  menu.addEventListener('mousedown', (e) => e.preventDefault());
  menu.addEventListener('click', (e) => {
    const s = e.target.closest('[data-s]');
    if (s) {
      if (view.state.doc.textBetween(from, to) === word) view.dispatch(view.state.tr.insertText(list[Number(s.dataset.s)], from, to));
      view.focus();
    } else if (e.target.closest('[data-add]')) spell.addWord(word);
    else if (e.target.closest('[data-ignore]')) spell.ignore(word);
    else return;
    closeMenu();
  });
}

// ---------- extensión del editor ----------
const key = new PluginKey('spell');

export const Spellcheck = Extension.create({
  name: 'spellcheck',
  addProseMirrorPlugins() {
    return [new Plugin({
      key,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, set) {
          const meta = tr.getMeta(key);
          if (meta) return meta;
          return set.map(tr.mapping, tr.doc);
        },
      },
      props: {
        decorations(state) { return key.getState(state); },
        handleDOMEvents: {
          contextmenu(view, e) {
            const el = e.target.closest && e.target.closest('.spell-err');
            if (!el) return false;
            e.preventDefault();
            openMenu(view, el, e.clientX, e.clientY);
            return true;
          },
        },
      },
      view(view) {
        let timer;
        const run = async () => {
          if (!spell.enabled) {
            if (key.getState(view.state) !== DecorationSet.empty) view.dispatch(view.state.tr.setMeta(key, DecorationSet.empty).setMeta('addToHistory', false));
            return;
          }
          const doc = view.state.doc;
          const items = collectWords(doc);
          const bad = await spell.check([...new Set(items.map((it) => it.word))]);
          if (view.isDestroyed) return;
          if (view.state.doc !== doc) { schedule(); return; }
          const head = view.state.selection.head;
          const decos = items
            .filter((it) => bad.has(it.word) && !(view.hasFocus() && head === it.to))
            .map((it) => Decoration.inline(it.from, it.to, { class: 'spell-err' }));
          view.dispatch(view.state.tr.setMeta(key, DecorationSet.create(doc, decos)).setMeta('addToHistory', false));
        };
        const schedule = (ms = 450) => { clearTimeout(timer); timer = setTimeout(run, ms); };
        spell.listeners.add(schedule);
        schedule(100);
        return {
          update(v, prev) { if (prev.doc !== v.state.doc || prev.selection.head !== v.state.selection.head) schedule(); },
          destroy() { spell.listeners.delete(schedule); clearTimeout(timer); },
        };
      },
    })];
  },
});

// ---------- panel de la barra ----------
export function spellPanelHTML() {
  return `<div class="pal-row col">
      <label class="sp-check"><input type="checkbox" data-spell-on ${spell.enabled ? 'checked' : ''}> Revisar ortografía</label>
      <span class="pal-label">Idiomas</span>
      ${Object.entries(LANGS).map(([code, l]) => `<label class="sp-check"><input type="checkbox" data-lang="${code}" ${spell.langs.includes(code) ? 'checked' : ''} ${l.fixed ? 'disabled' : ''}> ${l.label}${l.fixed ? ' <small>(siempre)</small>' : ''}</label>`).join('')}
      <p class="sp-note">Una palabra es correcta si lo es en alguno de los idiomas marcados.</p>
      <button type="button" class="tb" data-personal>Diccionario personal (${spell.personal.length})</button>
    </div>`;
}

export function showPersonalDictionary() {
  const dlg = document.createElement('dialog');
  dlg.className = 'dialog';
  const render = () => {
    dlg.innerHTML = `<div class="dialog-body-pad">
      <div class="help-top"><h2>Diccionario personal</h2><button type="button" class="icon-btn" data-close aria-label="Cerrar">×</button></div>
      <p class="dialog-text">Palabras que agregaste con clic derecho → "Agregar al diccionario". Se guardan en <code>.diccionario.txt</code> en tu carpeta de notas.</p>
      ${spell.personal.length
        ? `<ul class="pd-words">${[...spell.personal].sort((a, b) => a.localeCompare(b, 'es')).map((w) => `<li><span>${esc(w)}</span><button type="button" class="tb" data-del="${esc(w)}" title="Quitar">×</button></li>`).join('')}</ul>`
        : '<p class="dash-none">Todavía no agregaste palabras.</p>'}
    </div>`;
  };
  render();
  document.body.appendChild(dlg);
  dlg.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]') || e.target === dlg) { dlg.close(); dlg.remove(); return; }
    const d = e.target.closest('[data-del]');
    if (d) { await spell.removeWord(d.dataset.del); render(); }
  });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}
