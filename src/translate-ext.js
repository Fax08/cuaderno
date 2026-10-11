// Traducción dentro del editor (solo en páginas con la propiedad "traduccion", p. ej. de-es):
//  · Tabla de vocabulario: al salir de la celda "Palabra", completa "Traducción" (y el artículo
//    alemán en "Notas") si están vacías.
//  · Texto: una línea "hallo:" muestra al lado "→ hola", como el resultado de una ecuación.
//    Tab o clic lo deja escrito; también se puede elegir una alternativa.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { translator } from './translate.js';
import { spell } from './spell.js';

const key = new PluginKey('translate');
const TRIGGER = /^\s*(\p{L}[\p{L}'’\- ]{0,48}?)\s*:[\s.…·]*$/u;
const WORD_HEAD = /^(palabra|word|wort|t[ée]rmino|vocablo|expresi[óo]n)/i;
const TRAD_HEAD = /^(traducci[óo]n|translation|übersetzung|significado)/i;
const NOTE_HEAD = /^(notas?|notes?|g[ée]nero)/i;
const rescans = new Set();
export const rescanTranslations = () => rescans.forEach((fn) => fn(0));

// Dirección para una palabra: si está escrita en español en una página de-es, se traduce es→de
async function direction(word, pair) {
  const [from, to] = pair;
  if (from === 'es' || to !== 'es') return pair;
  try {
    // Una palabra válida en los dos idiomas (p. ej. "hallo") se traduce en la dirección de la página
    const w = await spell.which(word, [from, 'es']);
    if (w.langs.includes('es') && w.loaded.includes(from) && !w.langs.includes(from)) return [to, from];
  } catch { /* sin corrector: se usa la dirección de la página */ }
  return pair;
}

async function translateWord(word, pair) {
  const dir = await direction(word, pair);
  const r = await translator.translate(word, dir[0], dir[1]);
  return r ? { ...r, dir } : null;
}

// ---------- tablas ----------
function tableInfo(state, cellPos) {
  const cell = state.doc.nodeAt(cellPos);
  if (!cell || !/^table(Cell|Header)$/.test(cell.type.name)) return null;
  const $c = state.doc.resolve(cellPos);
  const row = $c.parent;
  const table = $c.node($c.depth - 1);
  if (!row || row.type.name !== 'tableRow' || !table) return null;
  const head = table.child(0);
  const heads = [];
  head.forEach((c) => heads.push(c.textContent.trim()));
  const col = $c.index();
  const tradCol = Math.max(heads.findIndex((h) => TRAD_HEAD.test(h)), 1);
  const noteCol = heads.findIndex((h) => NOTE_HEAD.test(h));
  const cellAt = (i) => {
    if (i < 0 || i >= row.childCount) return null;
    let pos = $c.start();
    for (let j = 0; j < i; j++) pos += row.child(j).nodeSize;
    return { pos, node: row.child(i) };
  };
  return { cell, row, col, heads, tradCol, noteCol, isHeader: cell.type.name === 'tableHeader' || $c.index($c.depth - 1) === 0, cellAt, vocab: WORD_HEAD.test(heads[0] || '') };
}

async function fillRow(view, cellPos, pair) {
  let info = tableInfo(view.state, cellPos);
  if (!info || info.isHeader || info.col !== 0) return false;
  const word = info.cell.textContent.trim();
  const target = info.cellAt(info.tradCol);
  if (!word || !target || target.node.textContent.trim()) return false;
  const r = await translateWord(word, pair);
  if (!r) return false;
  // Volver a ubicar las celdas: el documento pudo cambiar mientras se traducía
  info = tableInfo(view.state, cellPos);
  if (!info || info.cell.textContent.trim() !== word) return false;
  const t = info.cellAt(info.tradCol);
  if (!t || t.node.textContent.trim()) return false;
  const n = info.noteCol > info.tradCol ? info.cellAt(info.noteCol) : null;
  let tr = view.state.tr;
  if (n && r.notas && !n.node.textContent.trim()) tr = tr.insertText(r.notas, n.pos + 2);
  tr = tr.insertText(r.main, t.pos + 2);
  view.dispatch(tr);
  return true;
}

// Completa todas las traducciones vacías de las tablas de la página
export async function fillEmptyTranslations(editor, pair) {
  const view = editor.view;
  const cells = [];
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'tableRow') {
      const first = node.firstChild;
      if (first && first.type.name === 'tableCell' && first.textContent.trim()) cells.push(pos + 1);
      return false;
    }
    return true;
  });
  let done = 0;
  // De abajo hacia arriba para que insertar texto no corra las posiciones pendientes
  for (const pos of cells.reverse()) {
    if (await fillRow(view, pos, pair)) done++;
  }
  return done;
}

// ---------- extensión ----------
export function createTranslate({ getPair }) {
  return Extension.create({
    name: 'translateHelper',
    addProseMirrorPlugins() {
      return [new Plugin({
        key,
        state: {
          init: () => ({ decos: DecorationSet.empty, leftCell: null }),
          apply(tr, value, oldState, newState) {
            const meta = tr.getMeta(key);
            let decos = meta && meta.decos ? meta.decos : value.decos.map(tr.mapping, tr.doc);
            let leftCell = meta && meta.consumed ? null : value.leftCell;
            // ¿Salió el cursor de una celda de la primera columna?
            const $old = oldState.selection.$from;
            for (let d = $old.depth; d > 0; d--) {
              const n = $old.node(d);
              if (n.type.name === 'tableCell' || n.type.name === 'tableHeader') {
                const cellPos = $old.before(d);
                const $new = newState.selection.$from;
                let still = false;
                for (let e = $new.depth; e > 0; e--) if ($new.before(e) === tr.mapping.map(cellPos) && /^table(Cell|Header)$/.test($new.node(e).type.name)) still = true;
                if (!still && $old.index(d - 1) === 0) leftCell = tr.mapping.map(cellPos);
                break;
              }
            }
            return { decos, leftCell };
          },
        },
        props: {
          decorations(state) { return key.getState(state).decos; },
          handleKeyDown(view, e) {
            if (e.key !== 'Tab' || e.shiftKey) return false;
            const pair = getPair();
            const { $from, empty } = view.state.selection;
            if (!pair || !empty || !$from.parent.isTextblock) return false;
            for (let d = $from.depth; d > 0; d--) if (/^table/.test($from.node(d).type.name)) return false; // Tab en tablas = celda siguiente
            const m = TRIGGER.exec($from.parent.textContent);
            if (!m || $from.parentOffset !== $from.parent.content.size) return false;
            const ghost = view.dom.querySelector('.trad-ghost[data-ready]');
            const t = ghost && ghost.dataset.main;
            if (!t) return false;
            insertAfterColon(view, $from.end(), $from.parent.textContent, t);
            return true;
          },
        },
        view(view) {
          let timer;
          let handling = null;
          const scan = async () => {
            const pair = getPair();
            const doc = view.state.doc;
            const found = [];
            if (pair) {
              doc.descendants((node, pos) => {
                if (node.type.name === 'table' || node.type.name === 'heading' || node.type.name === 'codeBlock') return false;
                if (!node.isTextblock) return true;
                const m = TRIGGER.exec(node.textContent);
                if (m && m[1].trim().split(/\s+/).length <= 4) found.push({ text: m[1].trim(), end: pos + node.nodeSize - 1, full: node.textContent });
                return false;
              });
            }
            const results = await Promise.all(found.map(async (f) => ({ ...f, r: await (async () => {
              const dir = await direction(f.text, pair);
              return translator.cached(f.text, dir[0], dir[1]) || null;
            })() })));
            if (view.isDestroyed || view.state.doc !== doc) { schedule(); return; }
            const decos = results.map((f) => Decoration.widget(f.end, () => ghostDOM(view, f), { side: 1, key: `${f.text}|${f.r ? f.r.main : '…'}` }));
            view.dispatch(view.state.tr.setMeta(key, { decos: DecorationSet.create(doc, decos) }).setMeta('addToHistory', false));
            // Pedir las que faltan; al llegar, se vuelve a dibujar
            for (const f of results) if (!f.r) translateWord(f.text, pair).then(() => schedule(0));
          };
          const schedule = (ms = 350) => { clearTimeout(timer); timer = setTimeout(scan, ms); };
          rescans.add(schedule);
          schedule(100);
          return {
            update(v, prev) {
              if (prev.doc !== v.state.doc) schedule();
              const st = key.getState(v.state);
              if (st.leftCell !== null && st.leftCell !== undefined && st.leftCell !== handling) {
                const cellPos = st.leftCell;
                handling = cellPos;
                setTimeout(() => {
                  handling = null;
                  if (v.isDestroyed) return;
                  v.dispatch(v.state.tr.setMeta(key, { consumed: true }).setMeta('addToHistory', false));
                  const pair = getPair();
                  const info = tableInfo(v.state, cellPos);
                  if (info && !info.isHeader && pair) fillRow(v, cellPos, pair);
                }, 0);
              }
            },
            destroy() { rescans.delete(schedule); clearTimeout(timer); },
          };
        },
      })];
    },
  });
}

// Deja "**palabra**: *traducción*": la palabra en negrita y la traducción en cursiva.
// Reemplaza lo que haya después de los dos puntos (espacios, un punto suelto).
function insertAfterColon(view, endPos, fullText, term) {
  const { schema } = view.state;
  const start = endPos - fullText.length;
  const colon = fullText.lastIndexOf(':');
  const from = start + colon + 1;
  const lead = fullText.length - fullText.trimStart().length;
  const wordEnd = start + fullText.slice(0, colon).trimEnd().length;
  const tr = view.state.tr.delete(from, endPos);
  if (schema.marks.bold && wordEnd > start + lead) tr.addMark(start + lead, wordEnd, schema.marks.bold.create());
  tr.insert(from, schema.text(' '));
  tr.insert(from + 1, schema.text(term, schema.marks.italic ? [schema.marks.italic.create()] : []));
  tr.setSelection(TextSelection.create(tr.doc, from + 1 + term.length));
  tr.setStoredMarks([]); // lo que se escriba después va sin formato
  view.dispatch(tr);
  view.focus();
}

function ghostDOM(view, f) {
  const el = document.createElement('span');
  el.className = 'trad-ghost';
  el.contentEditable = 'false';
  if (!f.r) {
    el.innerHTML = '<span class="tg-wait">→ traduciendo…</span>';
    return el;
  }
  el.dataset.ready = '1';
  el.dataset.main = f.r.main;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const opts = [f.r.main, ...f.r.alts.slice(0, 3)];
  el.innerHTML = `<span class="tg-arrow">→</span>${opts.map((t, i) => `<button type="button" class="tg-opt${i === 0 ? ' main' : ''}" data-t="${esc(t)}" title="${i === 0 ? 'Tab o clic para escribirla' : 'Clic para usar esta'}">${esc(t)}</button>`).join('<span class="tg-sep">·</span>')}${f.r.notas ? `<span class="tg-note">${esc(f.r.notas)}</span>` : ''}<kbd>Tab</kbd>`;
  el.addEventListener('mousedown', (e) => e.preventDefault());
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    // Ubicar de nuevo el final de la línea (el documento pudo cambiar)
    let end = null, full = '';
    view.state.doc.descendants((node, pos) => {
      if (end !== null) return false;
      if (node.isTextblock && node.textContent === f.full) { end = pos + node.nodeSize - 1; full = node.textContent; }
      return !node.isTextblock;
    });
    if (end !== null) insertAfterColon(view, end, full, `${f.r.notas && b.classList.contains('main') && /^(der|die|das)$/.test(f.r.notas) && f.r.dir[1] === 'de' ? `${f.r.notas} ` : ''}${b.dataset.t}`);
  });
  return el;
}
