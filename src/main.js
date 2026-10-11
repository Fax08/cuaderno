import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/400-italic.css';
import '@fontsource/source-serif-4/600.css';
import './style.css';

import { EditorState } from '@tiptap/pm/state';
import { isValidYoutubeUrl } from '@tiptap/extension-youtube';
import {
  supported, pickRoot, storedRoot, hasPermission, readTree, readText, writeText,
  getDir, exists, createFile, safeName, saveAsset,
} from './fs.js';
import { SECTION_ORDER, PRESETS, KINDS, suggestKind, ESTADOS, today, splitFrontmatter, joinFrontmatter, tpl } from './templates.js';
import { createEditor } from './editor.js';
import { ask, toast, esc } from './ui.js';
import { scanMateria, resolveDuda, renderMateria, renderInicio } from './dashboard.js';
import { showHelp } from './help.js';
import { createSymbolPanel } from './symbols.js';
import { startReview, loadStore, parseCards } from './repaso.js';
import { createSearch, revealText } from './search.js';
import { spell } from './spell.js';
import { translator, parsePair, PAIRS, pairLabel } from './translate.js';
import { rescanTranslations, fillEmptyTranslations } from './translate-ext.js';

// ---------- estado ----------
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};
const S = {
  root: null,
  tree: null,
  page: null, // { path, handle, dir, meta }
  dirty: false,
  loading: false,
  open: new Set(ls.get('cuaderno.open', [])),
};

// ---------- estructura ----------
document.querySelector('#app').innerHTML = `
<div class="app" data-sidebar="${ls.get('cuaderno.sidebar', true) ? 'open' : 'closed'}">
  <aside class="sidebar" aria-label="Materias">
    <div class="side-head">
      <div class="brand">Cuaderno</div>
      <div class="folder" id="folderName" title="Carpeta de notas"></div>
      <div class="nav-row"><button type="button" class="nav-home" id="goHome">Inicio</button><button type="button" class="nav-home" id="goSearch" title="Buscar en todas las notas (Ctrl+P)">Buscar <kbd>Ctrl P</kbd></button></div>
    </div>
    <nav class="tree" id="tree"></nav>
    <div class="side-foot">
      <button class="btn primary" id="newMateria" type="button">+ Nueva carpeta</button>
      <div class="side-foot-row">
        <button class="link-btn" id="reload" type="button" title="Releer la carpeta si cambiaste archivos por fuera">Actualizar</button>
        <button class="link-btn" id="changeFolder" type="button">Cambiar carpeta</button>
      </div>
    </div>
  </aside>
  <main class="main">
    <header class="pagebar">
      <button class="icon-btn" id="toggleSide" type="button" title="Mostrar u ocultar materias" aria-label="Mostrar u ocultar materias">☰</button>
      <div class="crumbs" id="crumbs"></div>
      <div class="status" id="status" aria-live="polite"></div>
    </header>
    <div class="toolbar-slot" id="toolbarSlot" hidden></div>
    <div class="scroller" id="scroller">
      <article class="page" id="pageWrap" hidden>
        <div class="props" id="props"></div>
        <div id="editor"></div>
      </article>
      <section class="dash" id="dash" hidden></section>
    </div>
  </main>
  <aside class="outline" aria-label="Índice">
    <h2>Índice</h2>
    <ol id="outline"></ol>
  </aside>
</div>
<div class="gate" id="gate" hidden></div>
<input type="file" id="imgInput" accept="image/*" multiple hidden>`;

const $ = (id) => document.getElementById(id);
const appEl = document.querySelector('.app');
createSymbolPanel(document.querySelector('.outline'));

// ---------- editor ----------
const actions = {
  pickImage: () => { if (!S.page) return; $('imgInput').click(); },
  insertImageFile: async (file) => {
    if (!S.page) return;
    try {
      const src = await saveAsset(S.page.dir, file);
      editor.chain().focus().setImage({ src, alt: file.name || 'imagen' }).run();
    } catch (e) { toast(`No se pudo guardar la imagen: ${e.message}`, 'bad'); }
  },
  askVideo: async () => {
    const r = await ask({ title: 'Insertar video de YouTube', fields: [{ name: 'url', label: 'Link del video', placeholder: 'https://www.youtube.com/watch?v=…', required: true }], ok: 'Insertar' });
    if (!r) return editor.commands.focus();
    if (!isValidYoutubeUrl(r.url)) return toast('Ese link no es de YouTube. Copiá la dirección del video desde el navegador.', 'bad');
    editor.chain().focus().setYoutubeVideo({ src: r.url }).run();
  },
  askLink: async () => {
    const { empty, from, to } = editor.state.selection;
    const current = editor.getAttributes('link').href || '';
    const fields = [{ name: 'url', label: 'Dirección', value: current, placeholder: 'https://…' }];
    if (empty && !current) fields.unshift({ name: 'text', label: 'Texto a mostrar', placeholder: 'Apunte del profesor' });
    const r = await ask({ title: current ? 'Editar link' : 'Insertar link', text: current ? 'Dejá la dirección vacía para quitar el link.' : '', fields, ok: 'Listo' });
    if (!r) return editor.commands.focus();
    let url = r.url;
    if (url && !/^[a-z]+:/i.test(url)) url = `https://${url}`;
    if (!url) return editor.chain().focus().extendMarkRange('link').unsetLink().run();
    if (empty && !current) {
      const text = r.text || url;
      editor.chain().focus().insertContent({ type: 'text', text, marks: [{ type: 'link', attrs: { href: url } }] }).insertContent(' ').run();
    } else {
      editor.chain().focus().setTextSelection({ from, to }).extendMarkRange('link').setLink({ href: url }).run();
    }
  },
  showHelp,
  setTranslationPair: (v) => setTranslationPair(v),
  notify: (msg, kind) => toast(msg, kind),
};

const editor = createEditor({
  getPair: () => pagePair(),
  element: $('editor'),
  getPageDir: () => S.page?.dir,
  onChange: () => {
    if (S.loading) return;
    S.dirty = true;
    setStatus('Sin guardar');
    saveSoon();
    outlineSoon();
  },
  actions,
});
$('toolbarSlot').appendChild(editor.toolbarElement);
window.cuaderno = { editor }; // para depurar desde la consola
$('imgInput').addEventListener('change', (e) => { [...e.target.files].forEach(actions.insertImageFile); e.target.value = ''; });

// Ctrl+clic abre links
$('editor').addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (a && (e.ctrlKey || e.metaKey)) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); }
});

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  if (mod && e.key.toLowerCase() === 'p' && S.root) { e.preventDefault(); search.open(); }
  if (mod && e.key.toLowerCase() === 'k' && S.page) { e.preventDefault(); actions.askLink(); }
});

// ---------- guardado ----------
const debounce = (fn, ms) => { let t; const f = () => { clearTimeout(t); t = setTimeout(fn, ms); }; f.cancel = () => clearTimeout(t); return f; };
const saveSoon = debounce(() => save(), 700);
const outlineSoon = debounce(() => renderOutline(), 250);

function setStatus(text, kind = '') {
  const el = $('status');
  el.textContent = text;
  el.dataset.kind = kind;
}

async function save() {
  saveSoon.cancel();
  if (!S.page || !S.dirty) return;
  const page = S.page;
  const text = joinFrontmatter(page.meta, editor.getMarkdown());
  S.dirty = false;
  setStatus('Guardando…');
  try {
    await writeText(page.handle, text);
    if (S.page === page) setStatus('Guardado');
  } catch (e) {
    S.dirty = true;
    setStatus('Error al guardar', 'bad');
    toast(`No se pudo guardar: ${e.message}`, 'bad');
  }
}

window.addEventListener('beforeunload', (e) => {
  if (S.dirty) { save(); e.preventDefault(); }
});

// ---------- acceso a la carpeta ----------
function showGate(kind, handle) {
  const gate = $('gate');
  gate.hidden = false;
  if (kind === 'unsupported') {
    gate.innerHTML = `<div class="gate-card"><h1>Abrilo en Chrome o Edge</h1><p>El cuaderno guarda tus notas como archivos en una carpeta de tu computadora. Por ahora solo Chrome y Edge de escritorio permiten eso; Firefox y Safari no.</p></div>`;
    return;
  }
  if (kind === 'permit') {
    gate.innerHTML = `<div class="gate-card"><h1>Cuaderno</h1><p>Por seguridad, el navegador pide confirmar el acceso a tu carpeta de notas.</p>
      <button class="btn primary big" id="gateOk" type="button">Abrir “${esc(handle.name)}”</button>
      <button class="link-btn" id="gateOther" type="button">Elegir otra carpeta</button>
      <p class="fine">Si Chrome te ofrece <b>Permitir en cada visita</b>, elegilo y no vas a ver más este paso.</p></div>`;
    $('gateOk').onclick = async () => { if (await hasPermission(handle, true)) start(handle); };
    $('gateOther').onclick = choose;
    return;
  }
  gate.innerHTML = `<div class="gate-card"><h1>Cuaderno</h1><p>Elegí la carpeta donde se van a guardar tus materias. Te dejé creada <b>Documentos\\Posgrado</b>.</p>
    <button class="btn primary big" id="gatePick" type="button">Elegir carpeta</button>
    <p class="fine">Las notas nunca salen de tu computadora. Esta página solo lee y escribe en la carpeta que elijas.</p></div>`;
  $('gatePick').onclick = choose;
}

async function choose() {
  try { start(await pickRoot()); } catch (e) { if (e.name !== 'AbortError') toast(e.message, 'bad'); }
}

async function start(root) {
  S.root = root;
  spell.start(root);
  translator.start(root);
  $('gate').hidden = true;
  $('folderName').textContent = root.name;
  await refreshTree();
  const last = ls.get('cuaderno.last', null);
  if (Array.isArray(last) && last[0] === '@materia' && findNode(last.slice(1))) showMateria(last.slice(1));
  else if (Array.isArray(last) && last[0] !== '@inicio' && findNode(last)) openPage(last);
  else showInicio();
}

// ---------- Inicio y portada de materia ----------
const dash = { open: [], rerender: null, cards: [], titles: [] };

async function closePage() {
  await save();
  S.page = null;
  $('pageWrap').hidden = true;
  $('toolbarSlot').hidden = true;
  $('outline').innerHTML = '';
  setStatus('');
}

async function showDash(kind, path) {
  await closePage();
  const el = $('dash');
  el.hidden = false;
  el.innerHTML = '<p class="dash-loading">Leyendo la carpeta…</p>';
  $('scroller').scrollTop = 0;
  try {
    if (kind === 'materia') {
      const node = findNode(path);
      if (!node) return showInicio();
      const data = await scanMateria(node);
      dash.open = renderMateria(el, data, await loadStore(S.root));
      dash.cards = [data.cards];
      dash.titles = [data.name];
      dash.rerender = () => showMateria(path);
      $('crumbs').innerHTML = path.map((x, i) => `<span class="${i === path.length - 1 ? 'here' : ''}">${esc(x)}</span>`).join('<span class="sep">›</span>');
      document.title = `${node.name} · Cuaderno`;
      ls.set('cuaderno.last', ['@materia', ...path]);
    } else {
      const materias = S.tree.children.filter((c) => c.kind === 'dir');
      const all = await Promise.all(materias.map(scanMateria));
      dash.open = renderInicio(el, all, await loadStore(S.root));
      dash.cards = all.map((x) => x.cards);
      dash.titles = all.map((x) => x.name);
      dash.rerender = showInicio;
      $('crumbs').innerHTML = '<span class="here">Inicio</span>';
      document.title = 'Cuaderno';
      ls.set('cuaderno.last', ['@inicio']);
    }
  } catch (e) {
    el.innerHTML = `<p class="dash-loading">No se pudo leer la carpeta: ${esc(e.message)}</p>`;
  }
  renderTree();
}
const showInicio = () => showDash('inicio');
const showMateria = (path) => showDash('materia', path);

$('dash').addEventListener('click', async (e) => {
  const o = e.target.closest('[data-open]');
  if (o) { openPage(o.dataset.open.split('/')); return; }
  const rv = e.target.closest('[data-review]');
  if (rv) {
    const i = Number(rv.dataset.review);
    startReview({ root: S.root, cards: dash.cards[i] || [], title: `Repaso · ${dash.titles[i] || ''}`, onClose: () => dash.rerender?.() });
    return;
  }
  const r = e.target.closest('[data-resolve]');
  if (r) {
    try {
      await resolveDuda(dash.open[Number(r.dataset.resolve)]);
      toast('Duda marcada como resuelta.');
      dash.rerender?.();
    } catch (err) { toast(err.message, 'bad'); }
  }
});
$('goHome').addEventListener('click', () => showInicio());
const search = createSearch({ getTree: () => S.tree, openPage: (path, q) => openPage(path, q) });
$('goSearch').addEventListener('click', () => search.open());

// ---------- árbol ----------
async function refreshTree() {
  S.tree = await readTree(S.root);
  renderTree();
}

function findNode(path, node = S.tree) {
  if (!node) return null;
  if (!path.length) return node;
  const child = node.children.find((c) => c.name === path[0]);
  return child ? findNode(path.slice(1), child) : null;
}

const label = (name) => name.replace(/\.md$/i, '');
const P = (path) => esc(path.join('/'));
const isSection = (name) => SECTION_ORDER.includes(name);
// Carpeta "con portada": las de primer nivel y las que tienen secciones adentro (Clases, Vocabulario…)
const isHub = (d, depth) => depth === 0 || d.children.some((c) => c.kind === 'dir' && isSection(c.name));

function fileItem(f) {
  const active = S.page && S.page.path.join('/') === f.path.join('/');
  return `<li><button type="button" class="page-link${active ? ' active' : ''}" data-open="${P(f.path)}">${esc(label(f.name))}</button></li>`;
}

function details(key, summary, inner, cls) {
  return `<details class="${cls}" data-key="${esc(key)}"${S.open.has(key) ? ' open' : ''}><summary>${summary}</summary>${inner}</details>`;
}

const addBtn = (path) => `<button type="button" class="add" data-menu="${P(path)}" title="Agregar página o carpeta">+</button>`;

function sortDirs(dirs) {
  const rank = (d) => { const i = SECTION_ORDER.indexOf(d.name); return i < 0 ? 99 : i; };
  return [...dirs].sort((a, b) => rank(a) - rank(b));
}

function renderBody(d, depth) {
  const files = d.children.filter((c) => c.kind === 'file');
  const dirs = sortDirs(d.children.filter((c) => c.kind === 'dir'));
  let html = files.length ? `<ul class="pages">${files.map(fileItem).join('')}</ul>` : '';
  html += dirs.map((c) => renderDir(c, depth + 1)).join('');
  if (!files.length && !dirs.length) html += '<p class="none">Vacío</p>';
  return html;
}

function renderDir(d, depth) {
  if (depth > 0 && isSection(d.name)) {
    return `<div class="section"><div class="sec-head"><span class="sec-name">${esc(d.name)}</span>${addBtn(d.path)}</div>${renderBody(d, depth)}</div>`;
  }
  const home = isHub(d, depth) ? `<button type="button" class="add home" data-home="${P(d.path)}" title="Portada: entregas, dudas, clases y repaso">⌂</button>` : '';
  return details(d.path.join('/'), `<span class="sum-name">${esc(d.name)}</span>${home}${addBtn(d.path)}`, renderBody(d, depth), depth === 0 ? 'materia' : 'chapter');
}

function renderTree() {
  const files = S.tree.children.filter((c) => c.kind === 'file');
  const dirs = sortDirs(S.tree.children.filter((c) => c.kind === 'dir'));
  let html = files.length ? `<ul class="pages root-pages">${files.map(fileItem).join('')}</ul>` : '';
  html += dirs.map((d) => renderDir(d, 0)).join('');
  if (!dirs.length && !files.length) html = '<p class="none pad">La carpeta está vacía. Creá la primera carpeta con el botón de abajo.</p>';
  $('tree').innerHTML = html;
}

$('tree').addEventListener('toggle', (e) => {
  const d = e.target;
  if (!d.dataset?.key) return;
  if (d.open) S.open.add(d.dataset.key); else S.open.delete(d.dataset.key);
  ls.set('cuaderno.open', [...S.open]);
}, true);

$('tree').addEventListener('click', (e) => {
  const home = e.target.closest('[data-home]');
  if (home) { e.preventDefault(); e.stopPropagation(); showMateria(home.dataset.home.split('/')); return; }
  const add = e.target.closest('[data-menu]');
  if (add) { e.preventDefault(); e.stopPropagation(); openCreateMenu(add, add.dataset.menu.split('/')); return; }
  const link = e.target.closest('[data-open]');
  if (link) openPage(link.dataset.open.split('/'));
});

// ---------- menú "+" ----------
let menuEl = null;
function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
document.addEventListener('mousedown', (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

function openCreateMenu(btn, path) {
  closeMenu();
  const sug = suggestKind(path[path.length - 1]);
  const kinds = [KINDS.find((k) => k.id === sug), ...KINDS.filter((k) => k.id !== sug)];
  menuEl = document.createElement('div');
  menuEl.className = 'create-menu';
  menuEl.setAttribute('role', 'menu');
  menuEl.innerHTML = `<p class="cm-title">Agregar en “${esc(path[path.length - 1])}”</p>
    ${kinds.map((k, i) => `<button type="button" role="menuitem" class="cm-item${i === 0 ? ' sug' : ''}" data-kind="${k.id}">${esc(k.label)}${i === 0 ? '<span>sugerida</span>' : ''}</button>`).join('')}
    <hr><button type="button" role="menuitem" class="cm-item" data-kind="carpeta">Carpeta…</button>`;
  document.body.appendChild(menuEl);
  const r = btn.getBoundingClientRect();
  menuEl.style.left = `${Math.min(r.left, window.innerWidth - menuEl.offsetWidth - 12)}px`;
  menuEl.style.top = `${Math.min(r.bottom + 4, window.innerHeight - menuEl.offsetHeight - 12)}px`;
  menuEl.querySelector('.cm-item').focus();
  menuEl.addEventListener('click', (e) => {
    const it = e.target.closest('[data-kind]');
    if (!it) return;
    closeMenu();
    if (it.dataset.kind === 'carpeta') newFolder(path);
    else create(it.dataset.kind, path);
  });
}

// ---------- crear ----------
const pad2 = (n) => String(n).padStart(2, '0');
// Nombre de la materia / cuaderno al que pertenece una carpeta
const ownerName = (path) => (path.length > 1 && isSection(path[path.length - 1]) ? path[path.length - 2] : path[path.length - 1]);

async function create(kind, path) {
  try {
    const dirNode = findNode(path);
    const dir = await getDir(S.root, path);
    const materia = ownerName(path);
    let made;
    if (kind === 'clase') {
      const n = dirNode.children.filter((c) => c.kind === 'file' && /clase/i.test(c.name)).length + 1;
      const r = await ask({ title: `Nueva clase · ${materia}`, fields: [
        { name: 'fecha', label: 'Fecha', type: 'date', value: today() },
        { name: 'numero', label: 'Número de clase', value: pad2(n) },
        { name: 'tema', label: 'Tema (opcional)', placeholder: 'Tensores de esfuerzo' },
      ], ok: 'Crear clase' });
      if (!r) return;
      const name = safeName(`${r.fecha} Clase ${r.numero}${r.tema ? ` - ${r.tema}` : ''}`);
      made = await createFile(dir, `${name}.md`, tpl.clase({ materia, ...r }));
    } else if (kind === 'capitulo') {
      const n = dirNode.children.filter((c) => c.kind === 'dir').length + 1;
      const r = await ask({ title: `Nuevo capítulo · ${materia}`, text: 'Cada capítulo es una sub-carpeta: arranca con una página de teoría y le podés sumar las que quieras.', fields: [
        { name: 'numero', label: 'Número', value: pad2(n) },
        { name: 'nombre', label: 'Nombre', placeholder: 'Tensores', required: true },
      ], ok: 'Crear capítulo' });
      if (!r) return;
      const folder = safeName(`${r.numero} ${r.nombre}`);
      if (await exists(dir, folder)) return toast(`Ya existe “${folder}”.`, 'bad');
      const chapter = await dir.getDirectoryHandle(folder, { create: true });
      made = await createFile(chapter, 'Teoría.md', tpl.capitulo(r));
      path = [...path, folder];
    } else if (kind === 'trabajo') {
      const r = await ask({ title: `Nuevo trabajo · ${materia}`, fields: [
        { name: 'nombre', label: 'Nombre', placeholder: 'TP1 Círculos de Mohr', required: true },
        { name: 'entrega', label: 'Fecha de entrega', type: 'date', value: today() },
      ], ok: 'Crear trabajo' });
      if (!r) return;
      made = await createFile(dir, `${safeName(r.nombre)}.md`, tpl.trabajo(r));
    } else if (kind === 'apunte') {
      const r = await ask({ title: 'Nuevo apunte', fields: [
        { name: 'nombre', label: 'Título', placeholder: 'Introducción a NumPy', required: true },
        { name: 'fecha', label: 'Fecha', type: 'date', value: today() },
      ], ok: 'Crear apunte' });
      if (!r) return;
      made = await createFile(dir, `${safeName(r.nombre)}.md`, tpl.apunte(r));
    } else if (kind === 'vocabulario' || kind === 'gramatica') {
      const r = await ask({ title: kind === 'vocabulario' ? 'Nueva lista de vocabulario' : 'Nuevo tema de gramática', fields: [
        { name: 'nombre', label: 'Nombre', placeholder: kind === 'vocabulario' ? 'Verbos frecuentes' : 'Present perfect', required: true },
        { name: 'par', label: 'Traducción', options: PAIRS.map(pairLabel), value: pairLabel(guessPair(path)) },
      ], ok: 'Crear' });
      if (!r) return;
      const par = PAIRS.find((p) => pairLabel(p) === r.par) || guessPair(path);
      made = await createFile(dir, `${safeName(r.nombre)}.md`, tpl[kind]({ ...r, traduccion: par.join('-') }));
    } else {
      const r = await ask({ title: 'Nueva página', fields: [{ name: 'nombre', label: 'Nombre', placeholder: 'Ejercicios', required: true }], ok: 'Crear página' });
      if (!r) return;
      made = await createFile(dir, `${safeName(r.nombre)}.md`, tpl.pagina(r));
    }
    for (let i = 1; i <= path.length; i++) S.open.add(path.slice(0, i).join('/'));
    ls.set('cuaderno.open', [...S.open]);
    await refreshTree();
    openPage([...path, made.name]);
  } catch (e) { toast(e.message, 'bad'); }
}

async function newFolder(path) {
  const where = path.length ? `en “${path[path.length - 1]}”` : 'en la carpeta principal';
  const r = await ask({ title: 'Nueva carpeta', text: `Se crea ${where}. Podés elegir que venga con secciones armadas.`, fields: [
    { name: 'nombre', label: 'Nombre', placeholder: path.length ? 'Unidad 1' : 'Inglés', required: true },
    { name: 'tipo', label: 'Contenido', options: PRESETS.map((p) => p.label), value: PRESETS[0].label },
  ], ok: 'Crear carpeta' });
  if (!r) return;
  try {
    const parent = await getDir(S.root, path);
    const name = safeName(r.nombre);
    if (await exists(parent, name)) return toast(`Ya existe “${name}”.`, 'bad');
    const d = await parent.getDirectoryHandle(name, { create: true });
    const preset = PRESETS.find((p) => p.label === r.tipo) || PRESETS[0];
    for (const s of preset.sections) await d.getDirectoryHandle(s, { create: true });
    if (preset.sections.includes('Dudas')) await createFile(await d.getDirectoryHandle('Dudas'), 'Dudas.md', tpl.dudas({ materia: name }));
    if (preset.sections.includes('Vocabulario')) await createFile(await d.getDirectoryHandle('Vocabulario'), 'Vocabulario general.md', tpl.vocabulario({ nombre: `Vocabulario general · ${name}`, traduccion: guessPair([...path, name]).join('-') }));
    const full = [...path, name];
    for (let i = 1; i <= full.length; i++) S.open.add(full.slice(0, i).join('/'));
    ls.set('cuaderno.open', [...S.open]);
    await refreshTree();
    toast(`Carpeta “${name}” creada.`);
    if (preset.sections.length) showMateria(full);
  } catch (e) { toast(e.message, 'bad'); }
}

$('newMateria').addEventListener('click', () => newFolder([]));

$('reload').addEventListener('click', async () => { await save(); await refreshTree(); toast('Carpeta actualizada.'); });
$('changeFolder').addEventListener('click', async () => { await save(); choose(); });
$('toggleSide').addEventListener('click', () => {
  const open = appEl.dataset.sidebar !== 'open';
  appEl.dataset.sidebar = open ? 'open' : 'closed';
  ls.set('cuaderno.sidebar', open);
});

// ---------- abrir página ----------
async function openPage(path, query) {
  await save();
  const node = findNode(path);
  if (!node || node.kind !== 'file') return;
  try {
    const dir = await getDir(S.root, path.slice(0, -1));
    const text = await readText(node.handle);
    const { meta, body } = splitFrontmatter(text);
    S.page = { path, handle: node.handle, dir, meta };
    S.loading = true;
    editor.commands.setContent(body, { emitUpdate: false });
    // historial de deshacer limpio para cada página
    const st = editor.state;
    editor.view.updateState(EditorState.create({ doc: st.doc, plugins: st.plugins }));
    editor.runCalc();
    S.loading = false;
    S.dirty = false;
    $('pageWrap').hidden = false;
    $('dash').hidden = true;
    $('toolbarSlot').hidden = false;
    $('scroller').scrollTop = 0;
    renderProps();
    renderCrumbs();
    renderOutline();
    renderTree();
    setStatus('Guardado');
    document.title = `${label(node.name)} · Cuaderno`;
    ls.set('cuaderno.last', path);
    if (query) setTimeout(() => revealText(editor, query), 80);
    if (window.innerWidth < 900) { appEl.dataset.sidebar = 'closed'; }
  } catch (e) {
    S.loading = false;
    toast(`No se pudo abrir la página: ${e.message}`, 'bad');
  }
}

function renderCrumbs() {
  const p = S.page.path;
  $('crumbs').innerHTML = p.map((x, i) => `<span class="${i === p.length - 1 ? 'here' : ''}">${esc(label(x))}</span>`).join('<span class="sep">›</span>');
}

// ---------- propiedades (frontmatter) ----------
const TIPOS = { clase: 'Clase', capitulo: 'Capítulo', trabajo: 'Trabajo', dudas: 'Dudas', apunte: 'Apunte', vocabulario: 'Vocabulario', gramatica: 'Gramática' };
function renderProps() {
  const meta = S.page.meta;
  const tipo = meta.find(([k]) => k === 'tipo')?.[1];
  const fields = meta.map(([k, v], i) => {
    if (k === 'tipo' || k === 'materia') return '';
    const id = `prop-${i}`;
    let input;
    if (k === 'traduccion') input = `<select id="${id}" data-i="${i}" data-trad-prop><option value="">Desactivada</option>${PAIRS.map((p) => `<option value="${p.join('-')}"${p.join('-') === v ? ' selected' : ''}>${pairLabel(p)}</option>`).join('')}</select>`;
    else if (/fecha|entrega/.test(k)) input = `<input type="date" id="${id}" data-i="${i}" value="${esc(v)}">`;
    else if (k === 'estado' && ESTADOS[tipo]) input = `<select id="${id}" data-i="${i}" data-estado="${esc(v)}">${ESTADOS[tipo].map((o) => `<option${o === v ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
    else input = `<input id="${id}" data-i="${i}" value="${esc(v)}">`;
    return `<label class="prop"><span>${esc(k)}</span>${input}</label>`;
  }).join('');
  const auto = !meta.some(([k]) => k === 'traduccion') && pagePair();
  const autoTrad = auto ? `<label class="prop"><span>traduccion</span><select data-trad-auto><option value="no">Desactivada</option>${PAIRS.map((p) => `<option value="${p.join('-')}"${p.join('-') === auto.join('-') ? ' selected' : ''}>${pairLabel(p)}</option>`).join('')}</select><small class="prop-auto">automática</small></label>` : '';
  const review = autoTrad + (pagePair() ? '<button type="button" class="btn small" data-fill-trad title="Completa la columna Traducción de las filas que tienen la palabra pero no la traducción">Traducir vacías</button>' : '')
    + (tipo === 'vocabulario' ? '<button type="button" class="btn primary small" data-review-page>Repasar esta lista</button>' : '');
  $('props').innerHTML = (tipo ? `<span class="tipo tipo-${esc(tipo)}">${TIPOS[tipo] || esc(tipo)}</span>` : '') + fields + review;
  $('props').hidden = !tipo && !fields && !auto;
}
$('props').addEventListener('click', async (e) => {
  if (e.target.closest('[data-fill-trad]') && S.page) {
    const b = e.target.closest('[data-fill-trad]');
    b.disabled = true; b.textContent = 'Traduciendo…';
    const n = await fillEmptyTranslations(editor, pagePair());
    b.disabled = false; b.textContent = 'Traducir vacías';
    toast(n ? `Listo: ${n} traducción${n === 1 ? '' : 'es'}.` : 'No había filas para traducir (o no se encontró la traducción).');
    return;
  }
  if (!e.target.closest('[data-review-page]') || !S.page) return;
  await save();
  const name = label(S.page.path[S.page.path.length - 1]);
  const cards = parseCards(editor.getMarkdown(), name);
  if (!cards.length) return toast('Esta página no tiene una tabla con palabras. La primera columna es el frente y la segunda, la respuesta.', 'bad');
  startReview({ root: S.root, cards, title: `Repaso · ${name}` });
});
$('props').addEventListener('change', (e) => {
  if (e.target.matches('[data-trad-auto]')) { setTranslationPair(e.target.value === 'no' ? '' : e.target.value); return; }
  const i = e.target.dataset.i;
  if (i === undefined || !S.page) return;
  S.page.meta[Number(i)][1] = e.target.value;
  if (e.target.dataset.estado !== undefined) e.target.dataset.estado = e.target.value;
  S.dirty = true;
  save();
  if (e.target.matches('[data-trad-prop]')) { if (!e.target.value) setTranslationPair(''); else { renderProps(); rescanTranslations(); } }
});

// ---------- traducción ----------
// El corrector acepta también el idioma de la página (p. ej. alemán en una página de-es)
spell.pageLangs = () => pagePair() || [];
// Par de traducción de la página abierta:
//  · la propiedad "traduccion" manda (con "no" queda desactivada);
//  · si no está, se activa sola dentro de una carpeta de idioma (Alemán, Inglés…)
//    o en páginas de vocabulario y gramática.
function pagePair() {
  if (!S.page) return null;
  const v = S.page.meta.find(([k]) => k === 'traduccion');
  if (v) return parsePair(v[1]);
  return implicitPair();
}
function implicitPair() {
  if (!S.page) return null;
  const lang = langFromPath(S.page.path);
  if (lang) return [lang, 'es'];
  const tipo = S.page.meta.find(([k]) => k === 'tipo')?.[1];
  return tipo === 'vocabulario' || tipo === 'gramatica' ? ['en', 'es'] : null;
}
// Idioma según el nombre de las carpetas (Alemán, Deutsch, Inglés, English…)
function langFromPath(path) {
  const p = path.slice(0, -1).join('/').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (/aleman|deutsch|german/.test(p)) return 'de';
  if (/ingles|english/.test(p)) return 'en';
  return null;
}
function guessPair(path) {
  return [langFromPath([...path, '']) || 'en', 'es'];
}
function setTranslationPair(v) {
  if (!S.page) return toast('Abrí una página primero.', 'bad');
  const meta = S.page.meta.filter(([k]) => k !== 'traduccion');
  // Desactivar en una página donde se activaría sola: queda guardado "traduccion: no"
  const value = v || (implicitPair() ? 'no' : '');
  if (value) {
    const i = meta.findIndex(([k]) => k === 'tipo');
    meta.splice(i + 1, 0, ['traduccion', value]);
  }
  S.page.meta = meta;
  S.dirty = true;
  save();
  renderProps();
  rescanTranslations();
  spell.notify();
  toast(v ? `Traducción activada: ${pairLabel(parsePair(v))}.` : 'Traducción desactivada en esta página.');
}

// ---------- índice ----------
let headings = [];
function renderOutline() {
  headings = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') headings.push({ level: node.attrs.level, text: node.textContent || 'Sin título', pos });
    return node.type.name !== 'heading';
  });
  $('outline').innerHTML = headings.length
    ? headings.map((h, i) => `<li class="lv${h.level}"><button type="button" data-h="${i}">${esc(h.text)}</button></li>`).join('')
    : '<li class="none">Usá Títulos 1, 2 y 3 y van a aparecer acá.</li>';
  spy();
}
$('outline').addEventListener('click', (e) => {
  const b = e.target.closest('[data-h]');
  if (!b) return;
  const h = headings[Number(b.dataset.h)];
  const dom = editor.view.nodeDOM(h.pos);
  if (dom?.scrollIntoView) dom.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  editor.commands.setTextSelection(h.pos + 1);
  editor.commands.focus(undefined, { scrollIntoView: false });
});
function spy() {
  const top = $('scroller').getBoundingClientRect().top + 90;
  let current = -1;
  headings.forEach((h, i) => { const dom = editor.view.nodeDOM(h.pos); if (dom && dom.getBoundingClientRect().top <= top) current = i; });
  $('outline').querySelectorAll('[data-h]').forEach((b) => b.classList.toggle('current', Number(b.dataset.h) === Math.max(current, 0)));
}
$('scroller').addEventListener('scroll', debounce(spy, 60), { passive: true });

// ---------- inicio ----------
(async function init() {
  if (!supported) return showGate('unsupported');
  const handle = await storedRoot();
  if (!handle) return showGate('pick');
  if (await hasPermission(handle)) return start(handle);
  showGate('permit', handle);
})();
