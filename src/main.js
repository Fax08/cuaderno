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
import { SECTIONS, ESTADOS, today, splitFrontmatter, joinFrontmatter, tpl } from './templates.js';
import { createEditor } from './editor.js';
import { ask, toast, esc } from './ui.js';
import { scanMateria, resolveDuda, renderMateria, renderInicio } from './dashboard.js';
import { showHelp } from './help.js';
import { createSymbolPanel } from './symbols.js';

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
      <button type="button" class="nav-home" id="goHome">Inicio</button>
    </div>
    <nav class="tree" id="tree"></nav>
    <div class="side-foot">
      <button class="btn primary" id="newMateria" type="button">+ Nueva materia</button>
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
};

const editor = createEditor({
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
  $('gate').hidden = true;
  $('folderName').textContent = root.name;
  await refreshTree();
  const last = ls.get('cuaderno.last', null);
  if (Array.isArray(last) && last[0] === '@materia' && findNode([last[1]])) showMateria([last[1]]);
  else if (Array.isArray(last) && last[0] !== '@inicio' && findNode(last)) openPage(last);
  else showInicio();
}

// ---------- Inicio y portada de materia ----------
const dash = { open: [], rerender: null };

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
      dash.open = renderMateria(el, await scanMateria(node));
      dash.rerender = () => showMateria(path);
      $('crumbs').innerHTML = `<span class="here">${esc(path[0])}</span>`;
      document.title = `${path[0]} · Cuaderno`;
      ls.set('cuaderno.last', ['@materia', path[0]]);
    } else {
      const materias = S.tree.children.filter((c) => c.kind === 'dir');
      dash.open = renderInicio(el, await Promise.all(materias.map(scanMateria)));
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

function fileItem(f) {
  const active = S.page && S.page.path.join('/') === f.path.join('/');
  return `<li><button type="button" class="page-link${active ? ' active' : ''}" data-open="${P(f.path)}">${esc(label(f.name))}</button></li>`;
}

function details(key, summary, inner, cls) {
  return `<details class="${cls}" data-key="${esc(key)}"${S.open.has(key) ? ' open' : ''}><summary>${summary}</summary>${inner}</details>`;
}

function sectionAction(sectionName, depthInTemario) {
  if (depthInTemario === 1) return ['pagina', '+ página'];
  return ({ Clases: ['clase', '+ clase'], Temario: ['capitulo', '+ capítulo'], Trabajos: ['trabajo', '+ trabajo'], Dudas: ['pagina', '+ página'] })[sectionName] || ['pagina', '+ página'];
}

function renderDirBody(dir, sectionName, depthInTemario) {
  const files = dir.children.filter((c) => c.kind === 'file');
  const dirs = dir.children.filter((c) => c.kind === 'dir');
  let html = '';
  if (files.length) html += `<ul class="pages">${files.map(fileItem).join('')}</ul>`;
  for (const d of dirs) {
    const [act, txt] = sectionAction(sectionName, depthInTemario + 1);
    html += details(d.path.join('/'),
      `<span class="sum-name">${esc(d.name)}</span><button type="button" class="add" data-act="${act}" data-path="${P(d.path)}" title="${txt}">+</button>`,
      renderDirBody(d, sectionName, depthInTemario + 1), 'chapter');
  }
  if (!files.length && !dirs.length) html += '<p class="none">Vacío</p>';
  return html;
}

function renderTree() {
  const materias = S.tree.children.filter((c) => c.kind === 'dir');
  const order = (n) => { const i = SECTIONS.indexOf(n.name); return i < 0 ? 99 : i; };
  let html = '';
  for (const m of materias) {
    const secs = m.children.filter((c) => c.kind === 'dir').sort((a, b) => order(a) - order(b));
    const loose = m.children.filter((c) => c.kind === 'file');
    const inner = (loose.length ? `<ul class="pages">${loose.map(fileItem).join('')}</ul>` : '')
      + secs.map((s) => {
        const [act, txt] = sectionAction(s.name, 0);
        return `<div class="section"><div class="sec-head"><span class="sec-name">${esc(s.name)}</span><button type="button" class="add" data-act="${act}" data-path="${P(s.path)}" title="${txt}">+</button></div>${renderDirBody(s, s.name, 0)}</div>`;
      }).join('');
    html += details(m.path.join('/'), `<span class="sum-name">${esc(m.name)}</span><button type="button" class="add home" data-home="${P(m.path)}" title="Portada: entregas, dudas y clases">⌂</button>`, inner, 'materia');
  }
  if (!materias.length) html = '<p class="none pad">Todavía no hay materias. Creá la primera con el botón de abajo.</p>';
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
  const add = e.target.closest('.add');
  if (add) { e.preventDefault(); e.stopPropagation(); create(add.dataset.act, add.dataset.path.split('/')); return; }
  const link = e.target.closest('[data-open]');
  if (link) openPage(link.dataset.open.split('/'));
});

// ---------- crear ----------
const pad2 = (n) => String(n).padStart(2, '0');

async function create(kind, path) {
  try {
    const dirNode = findNode(path);
    const dir = await getDir(S.root, path);
    const materia = path[0];
    let made;
    if (kind === 'clase') {
      const n = dirNode.children.filter((c) => c.kind === 'file').length + 1;
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
      const r = await ask({ title: `Nuevo capítulo · ${materia}`, text: 'Cada capítulo es un sub-libro: arranca con una página de teoría y le podés sumar las que quieras.', fields: [
        { name: 'numero', label: 'Número', value: pad2(n) },
        { name: 'nombre', label: 'Nombre', placeholder: 'Tensores', required: true },
      ], ok: 'Crear capítulo' });
      if (!r) return;
      const folder = safeName(`${r.numero} ${r.nombre}`);
      if (await exists(dir, folder)) return toast(`Ya existe el capítulo “${folder}”.`, 'bad');
      const chapter = await dir.getDirectoryHandle(folder, { create: true });
      made = await createFile(chapter, 'Teoría.md', tpl.capitulo(r));
      path = [...path, folder];
      S.open.add(path.join('/'));
    } else if (kind === 'trabajo') {
      const r = await ask({ title: `Nuevo trabajo · ${materia}`, fields: [
        { name: 'nombre', label: 'Nombre', placeholder: 'TP1 Círculos de Mohr', required: true },
        { name: 'entrega', label: 'Fecha de entrega', type: 'date', value: today() },
      ], ok: 'Crear trabajo' });
      if (!r) return;
      made = await createFile(dir, `${safeName(r.nombre)}.md`, tpl.trabajo(r));
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

$('newMateria').addEventListener('click', async () => {
  const r = await ask({ title: 'Nueva materia', text: 'Se crean las secciones Clases, Dudas, Temario y Trabajos.', fields: [{ name: 'nombre', label: 'Nombre de la materia', placeholder: 'Mecánica del Continuo', required: true }], ok: 'Crear materia' });
  if (!r) return;
  try {
    const name = safeName(r.nombre);
    if (await exists(S.root, name)) return toast(`Ya existe “${name}”.`, 'bad');
    const m = await S.root.getDirectoryHandle(name, { create: true });
    for (const s of SECTIONS) await m.getDirectoryHandle(s, { create: true });
    const dudas = await m.getDirectoryHandle('Dudas');
    await createFile(dudas, 'Dudas.md', tpl.dudas({ materia: name }));
    S.open.add(name);
    ls.set('cuaderno.open', [...S.open]);
    await refreshTree();
    toast(`Materia “${name}” creada.`);
    showMateria([name]);
  } catch (e) { toast(e.message, 'bad'); }
});

$('reload').addEventListener('click', async () => { await save(); await refreshTree(); toast('Carpeta actualizada.'); });
$('changeFolder').addEventListener('click', async () => { await save(); choose(); });
$('toggleSide').addEventListener('click', () => {
  const open = appEl.dataset.sidebar !== 'open';
  appEl.dataset.sidebar = open ? 'open' : 'closed';
  ls.set('cuaderno.sidebar', open);
});

// ---------- abrir página ----------
async function openPage(path) {
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
const TIPOS = { clase: 'Clase', capitulo: 'Capítulo', trabajo: 'Trabajo', dudas: 'Dudas' };
function renderProps() {
  const meta = S.page.meta;
  const tipo = meta.find(([k]) => k === 'tipo')?.[1];
  const fields = meta.map(([k, v], i) => {
    if (k === 'tipo' || k === 'materia') return '';
    const id = `prop-${i}`;
    let input;
    if (/fecha|entrega/.test(k)) input = `<input type="date" id="${id}" data-i="${i}" value="${esc(v)}">`;
    else if (k === 'estado' && ESTADOS[tipo]) input = `<select id="${id}" data-i="${i}" data-estado="${esc(v)}">${ESTADOS[tipo].map((o) => `<option${o === v ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
    else input = `<input id="${id}" data-i="${i}" value="${esc(v)}">`;
    return `<label class="prop"><span>${esc(k)}</span>${input}</label>`;
  }).join('');
  $('props').innerHTML = (tipo ? `<span class="tipo tipo-${esc(tipo)}">${TIPOS[tipo] || esc(tipo)}</span>` : '') + fields;
  $('props').hidden = !tipo && !fields;
}
$('props').addEventListener('change', (e) => {
  const i = e.target.dataset.i;
  if (i === undefined || !S.page) return;
  S.page.meta[Number(i)][1] = e.target.value;
  if (e.target.dataset.estado !== undefined) e.target.dataset.estado = e.target.value;
  S.dirty = true;
  save();
});

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
