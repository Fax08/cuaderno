// Búsqueda en todas las notas (Ctrl+P). Busca en nombres de página y en el texto.
import { esc } from './ui.js';
import { splitFrontmatter } from './templates.js';

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cache = new Map(); // ruta → { mod, name, body, plain }

async function* walk(node) {
  for (const c of node.children) {
    if (c.kind === 'file') yield c;
    else yield* walk(c);
  }
}

// Texto legible para mostrar fragmentos (sin marcas de Markdown ni HTML)
const toPlain = (body) => body
  .replace(/<[^>]+>/g, '')
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/\$\$[\s\S]*?\$\$/g, ' [ecuación] ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/^#{1,6}\s+/gm, '')
  .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '')
  .replace(/[*_`>|]/g, ' ')
  .replace(/\\([[\]])/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();

async function index(tree) {
  const items = [];
  for await (const f of walk(tree)) {
    const key = f.path.join('/');
    try {
      const file = await f.handle.getFile();
      let c = cache.get(key);
      if (!c || c.mod !== file.lastModified) {
        const { body } = splitFrontmatter(await file.text());
        const plain = toPlain(body);
        c = { mod: file.lastModified, body, plain, nplain: norm(plain), nname: norm(f.name.replace(/\.md$/i, '')) };
        cache.set(key, c);
      }
      items.push({ path: f.path, name: f.name.replace(/\.md$/i, ''), ...c });
    } catch { /* archivo ilegible: se saltea */ }
  }
  return items;
}

function snippet(item, words) {
  const n = item.nplain;
  let at = -1;
  for (const w of words) { const i = n.indexOf(w); if (i >= 0 && (at < 0 || i < at)) at = i; }
  if (at < 0) return esc(item.plain.slice(0, 120));
  const start = Math.max(0, at - 50);
  const raw = item.plain.slice(start, at + 110);
  let html = esc(raw);
  // resaltar cada palabra (comparando sin acentos)
  const nraw = norm(raw);
  const marks = [];
  for (const w of words) { let i = nraw.indexOf(w); while (i >= 0) { marks.push([i, i + w.length]); i = nraw.indexOf(w, i + w.length); } }
  if (marks.length) {
    marks.sort((a, b) => a[0] - b[0]);
    let out = '', last = 0;
    for (const [a, b] of marks) { if (a < last) continue; out += esc(raw.slice(last, a)) + `<mark>${esc(raw.slice(a, b))}</mark>`; last = b; }
    html = out + esc(raw.slice(last));
  }
  return `${start > 0 ? '…' : ''}${html}…`;
}

export function createSearch({ getTree, openPage }) {
  let dlg = null;

  async function open() {
    if (dlg) { dlg.querySelector('input').focus(); return; }
    const tree = getTree();
    if (!tree) return;
    dlg = document.createElement('dialog');
    dlg.className = 'dialog search';
    dlg.innerHTML = `<div class="search-box">
      <input type="search" id="searchInput" placeholder="Buscar en todas las notas…" autocomplete="off" aria-label="Buscar">
      <ul class="search-results" role="listbox"></ul>
      <p class="search-foot">↑ ↓ para moverte · Enter para abrir · Esc para cerrar</p>
    </div>`;
    document.body.appendChild(dlg);
    const input = dlg.querySelector('input');
    const list = dlg.querySelector('.search-results');
    let items = [];
    let results = [];
    let sel = 0;
    const close = () => { if (!dlg) return; dlg.close(); dlg.remove(); dlg = null; };
    dlg.addEventListener('close', () => { dlg?.remove(); dlg = null; });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });

    function render() {
      const q = norm(input.value.trim());
      const words = q.split(/\s+/).filter(Boolean);
      if (!words.length) {
        list.innerHTML = '<li class="search-empty">Escribí una palabra: un tema, una fórmula, una duda…</li>';
        results = [];
        return;
      }
      results = items.map((it) => {
        let score = 0;
        for (const w of words) {
          const inName = it.nname.includes(w);
          const count = it.nplain.split(w).length - 1;
          if (!inName && !count) return null;
          score += (inName ? 20 : 0) + Math.min(count, 10);
        }
        return { it, score };
      }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 40);
      sel = Math.min(sel, Math.max(results.length - 1, 0));
      list.innerHTML = results.length
        ? results.map(({ it }, i) => `<li><button type="button" class="search-item${i === sel ? ' on' : ''}" data-i="${i}">
            <span class="si-name">${esc(it.name)}</span>
            <span class="si-path">${esc(it.path.slice(0, -1).join(' › '))}</span>
            <span class="si-snip">${snippet(it, words)}</span></button></li>`).join('')
        : '<li class="search-empty">No encontré nada con esas palabras.</li>';
      list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
    }

    function choose(i) {
      const r = results[i];
      if (!r) return;
      const query = input.value.trim();
      close();
      openPage(r.it.path, query);
    }

    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, results.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(sel); }
    });
    list.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) choose(Number(b.dataset.i)); });

    dlg.showModal();
    input.focus();
    list.innerHTML = '<li class="search-empty">Leyendo las notas…</li>';
    items = await index(tree);
    render();
  }

  return { open };
}

// Selecciona y muestra la primera aparición del texto buscado en el editor
export function revealText(editor, query) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return;
  const w = words[0];
  let found = null;
  editor.state.doc.descendants((node, pos) => {
    if (found || !node.isText) return !found;
    const i = norm(node.text).indexOf(w);
    if (i >= 0) found = { from: pos + i, to: pos + i + w.length };
    return false;
  });
  if (!found) return;
  editor.chain().focus().setTextSelection(found).scrollIntoView().run();
  const dom = editor.view.domAtPos(found.from).node;
  (dom.nodeType === 3 ? dom.parentElement : dom)?.scrollIntoView({ block: 'center' });
}
