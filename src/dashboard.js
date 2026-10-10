// Portada de cada materia e Inicio: entregas, dudas abiertas y clases recientes.
// Lee los .md de la carpeta; no guarda nada aparte.
import { readText, writeText } from './fs.js';
import { splitFrontmatter, today } from './templates.js';
import { esc } from './ui.js';

const label = (name) => name.replace(/\.md$/i, '');

async function* walk(node) {
  for (const c of node.children) {
    if (c.kind === 'file') yield c;
    else yield* walk(c);
  }
}

const TASK = /^(\s*)[-*+]\s+\[( |x|X)\]\s+(.*)$/;
const HEADING = /^#{1,6}\s+(.*)$/;

export async function scanMateria(materia) {
  const out = { name: materia.name, path: materia.path, trabajos: [], dudas: [], clases: [], capitulos: [] };
  const temario = materia.children.find((c) => c.kind === 'dir' && c.name === 'Temario');
  if (temario) out.capitulos = temario.children.filter((c) => c.kind === 'dir').map((c) => ({ name: c.name, first: c.children.find((f) => f.kind === 'file') }));
  for await (const f of walk(materia)) {
    let text;
    try { text = await readText(f.handle); } catch { continue; }
    const { meta } = splitFrontmatter(text);
    const m = Object.fromEntries(meta);
    const section = f.path[1];
    if (m.tipo === 'trabajo' || (section === 'Trabajos' && f.path.length === 3)) {
      out.trabajos.push({ path: f.path, name: label(f.name), entrega: m.entrega || '', estado: m.estado || 'pendiente' });
    }
    if (m.tipo === 'clase' || (section === 'Clases' && f.path.length === 3)) {
      out.clases.push({ path: f.path, name: label(f.name), fecha: m.fecha || '' });
    }
    let heading = '';
    text.split(/\r?\n/).forEach((line, idx) => {
      const h = HEADING.exec(line);
      if (h) { heading = h[1]; return; }
      const t = TASK.exec(line);
      if (!t) return;
      const txt = t[3].trim();
      if (!txt) return;
      if (!(section === 'Dudas' || /duda/i.test(heading) || /^[¿?]/.test(txt))) return;
      out.dudas.push({ path: f.path, handle: f.handle, line: idx, raw: line, text: txt, done: t[2] !== ' ', page: label(f.name), materia: materia.name });
    });
  }
  out.clases.sort((a, b) => (b.fecha || b.name).localeCompare(a.fecha || a.name));
  out.trabajos.sort((a, b) => (a.entrega || '9999').localeCompare(b.entrega || '9999'));
  return out;
}

export async function resolveDuda(d) {
  const text = await readText(d.handle);
  const lines = text.split(/\r?\n/);
  let idx = lines[d.line] === d.raw ? d.line : lines.indexOf(d.raw);
  if (idx < 0) throw new Error('La duda cambió en el archivo. Actualizá la carpeta y probá de nuevo.');
  lines[idx] = lines[idx].replace(/\[ \]/, '[x]');
  await writeText(d.handle, lines.join(text.includes('\r\n') ? '\r\n' : '\n'));
}

// ---------- presentación ----------
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  const [ty, tm, td] = today().split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
}

function dueChip(t) {
  if (t.estado === 'entregado') return '<span class="due due-done">entregado</span>';
  const n = daysUntil(t.entrega);
  if (n === null) return '<span class="due">sin fecha</span>';
  if (n < 0) return `<span class="due due-late">vencido hace ${-n} día${n === -1 ? '' : 's'}</span>`;
  if (n === 0) return '<span class="due due-urgent">vence hoy</span>';
  if (n === 1) return '<span class="due due-urgent">vence mañana</span>';
  return `<span class="due${n <= 3 ? ' due-urgent' : ''}">vence en ${n} días</span>`;
}

const fmtDate = (s) => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  if (!y) return s;
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};

const P = (path) => esc(path.join('/'));

function trabajosList(trabajos, showMateria) {
  if (!trabajos.length) return '<p class="dash-none">No hay trabajos cargados.</p>';
  return `<ul class="dash-list">${trabajos.map((t) => `
    <li class="dash-row${t.estado === 'entregado' ? ' muted' : ''}">
      <button type="button" class="dash-link" data-open="${P(t.path)}">${esc(t.name)}</button>
      ${showMateria ? `<span class="dash-sub">${esc(t.path[0])}</span>` : ''}
      <span class="dash-date">${fmtDate(t.entrega)}</span>
      <span class="estado estado-${esc(t.estado.replace(/\s/g, '-'))}">${esc(t.estado)}</span>
      ${dueChip(t)}
    </li>`).join('')}</ul>`;
}

function dudasList(dudas, showMateria) {
  if (!dudas.length) return '<p class="dash-none">No hay dudas abiertas.</p>';
  return `<ul class="dash-list">${dudas.map((d, i) => `
    <li class="dash-row duda">
      <span class="duda-text">${esc(d.text)}</span>
      <button type="button" class="dash-link small" data-open="${P(d.path)}">${showMateria ? `${esc(d.materia)} · ` : ''}${esc(d.page)}</button>
      <button type="button" class="tb" data-resolve="${i}">Resuelta</button>
    </li>`).join('')}</ul>`;
}

function clasesList(clases, showMateria) {
  if (!clases.length) return '<p class="dash-none">Todavía no hay clases.</p>';
  return `<ul class="dash-list">${clases.map((c) => `
    <li class="dash-row">
      <button type="button" class="dash-link" data-open="${P(c.path)}">${esc(c.name.replace(/^\d{4}-\d{2}-\d{2}\s*/, ''))}</button>
      ${showMateria ? `<span class="dash-sub">${esc(c.path[0])}</span>` : ''}
      <span class="dash-date">${fmtDate(c.fecha)}</span>
    </li>`).join('')}</ul>`;
}

export function renderMateria(el, data) {
  const pend = data.trabajos.filter((t) => t.estado !== 'entregado');
  const open = data.dudas.filter((d) => !d.done);
  const solved = data.dudas.length - open.length;
  el.innerHTML = `
    <header class="dash-head">
      <p class="dash-eyebrow">Materia</p>
      <h1>${esc(data.name)}</h1>
      <div class="dash-stats">
        <span><b>${data.clases.length}</b> clases</span>
        <span><b>${pend.length}</b> trabajos pendientes</span>
        <span><b>${open.length}</b> dudas abiertas</span>
      </div>
    </header>
    <section class="dash-card">
      <h2>Trabajos</h2>
      ${trabajosList(data.trabajos, false)}
    </section>
    <section class="dash-card">
      <h2>Dudas abiertas</h2>
      ${dudasList(open, false)}
      ${solved ? `<p class="dash-none">${solved} resuelta${solved === 1 ? '' : 's'}.</p>` : ''}
      <p class="dash-hint">Se juntan las tareas de la sección Dudas, las que estén bajo un título que diga “duda” en cualquier apunte, y las que empiecen con “¿”.</p>
    </section>
    <div class="dash-grid">
      <section class="dash-card">
        <h2>Clases</h2>
        ${clasesList(data.clases, false)}
      </section>
      <section class="dash-card">
        <h2>Temario</h2>
        ${data.capitulos.length ? `<ul class="dash-list">${data.capitulos.map((c) => `<li class="dash-row">${c.first ? `<button type="button" class="dash-link" data-open="${P(c.first.path)}">${esc(c.name)}</button>` : `<span>${esc(c.name)}</span>`}</li>`).join('')}</ul>` : '<p class="dash-none">Todavía no hay capítulos.</p>'}
      </section>
    </div>`;
  return open;
}

export function renderInicio(el, all) {
  const pend = all.flatMap((m) => m.trabajos.filter((t) => t.estado !== 'entregado'));
  pend.sort((a, b) => (a.entrega || '9999').localeCompare(b.entrega || '9999'));
  const open = all.flatMap((m) => m.dudas.filter((d) => !d.done));
  const clases = all.flatMap((m) => m.clases).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).slice(0, 6);
  const fecha = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  el.innerHTML = `
    <header class="dash-head">
      <p class="dash-eyebrow">${esc(fecha)}</p>
      <h1>Inicio</h1>
      <div class="dash-stats">
        <span><b>${all.length}</b> materia${all.length === 1 ? '' : 's'}</span>
        <span><b>${pend.length}</b> trabajos pendientes</span>
        <span><b>${open.length}</b> dudas abiertas</span>
      </div>
    </header>
    ${all.length ? '' : '<section class="dash-card"><h2>Empezá por acá</h2><p>Creá tu primera materia con el botón <b>+ Nueva materia</b> de la izquierda.</p></section>'}
    <section class="dash-card">
      <h2>Próximas entregas</h2>
      ${pend.length ? trabajosList(pend, true) : '<p class="dash-none">Nada pendiente.</p>'}
    </section>
    <section class="dash-card">
      <h2>Dudas abiertas</h2>
      ${dudasList(open, true)}
    </section>
    <section class="dash-card">
      <h2>Últimas clases</h2>
      ${clasesList(clases, true)}
    </section>
    <section class="dash-card tips-card">
      <h2>Atajos</h2>
      <ul class="tips">
        <li><kbd>/</kbd> menú para insertar títulos, ecuaciones, gráficos, tablas e imágenes.</li>
        <li><kbd>Ctrl</kbd>+<kbd>M</kbd> ecuación en el texto · <kbd>$$</kbd> + espacio ecuación aparte.</li>
        <li>En una ecuación: <code>P := 50kN</code> define, <code>σ =</code> calcula, <code>σ = MPa</code> convierte.</li>
        <li><kbd>Ctrl</kbd>+<kbd>V</kbd> pega capturas. Todo se guarda solo.</li>
      </ul>
    </section>`;
  return open;
}
