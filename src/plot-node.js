// Gráficos 2D (curvas y(x)) y 3D (superficie z(x, y)) que usan las variables de la página.
// En la página se ven quietos y se puede cambiar la altura arrastrando el borde de abajo.
// Doble clic (o "Abrir") abre la vista detallada: gráfico interactivo (rotar el 3D, zoom)
// y todas las opciones de edición.
import { Node } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { MathfieldElement } from 'mathlive';
import { engine, samplePlot, errText, evalText, math, Ctx } from './calc.js';
import { renderLatex, configureMathfield } from './math-nodes.js';
import { PLOT_DEFAULTS, parsePlotSource, serializePlot, markdownItPlot } from './md-rules.js';

let plotlyPromise = null;
const loadPlotly = () => (plotlyPromise ||= import('plotly.js-dist-min').then((m) => m.default || m));

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const COLORS = ['--accent', '--c2', '--c3', '--c4', '--c5'];
const SCALES = ['Viridis', 'Cividis', 'RdBu', 'Jet', 'Portland', 'Greys'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const unitText = (u) => u.replace(/\s*\/\s*/g, '/').replace(/\s+/g, '·');

// Límite de un eje escrito por el usuario (número, variable o con unidad) → número en la unidad del eje
function axisLimit(text, ctx, unit) {
  if (!String(text || '').trim()) return null;
  try {
    const v = evalText(text, ctx);
    if (typeof v === 'number') return v;
    if (math.isUnit(v)) return unit ? v.toNumber(unit) : v.toNumber();
  } catch { /* límite inválido: se ignora */ }
  return null;
}

// Dibuja el gráfico en `area`. Devuelve { legend, error }.
async function drawPlot(area, a, ctx, { interactive, height }) {
  const exprs = a.exprs.filter((e) => e.trim());
  if (!exprs.length) return { empty: true };
  let data;
  try {
    data = samplePlot({ ...a, exprs }, ctx);
  } catch (e) {
    return { error: errText(e) };
  }
  const Plotly = await loadPlotly();
  const ink = css('--ink'), rule = css('--rule'), muted = css('--muted');
  const grid = a.grilla !== 'no';
  const auto = (v, u) => (u ? `${v} [${unitText(u)}]` : v);
  const axis = (title, extra = {}) => ({
    title: { text: title, font: { size: 12, color: muted } },
    gridcolor: rule, showgrid: grid, zerolinecolor: muted, linecolor: rule, color: ink, tickfont: { size: 11 }, ...extra,
  });
  const base = { paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', font: { family: 'IBM Plex Sans, system-ui, sans-serif', color: ink, size: 12 }, showlegend: false, height };
  let traces, layout, legend;
  if (data.tipo === '3d') {
    const zr = [axisLimit(a.zlo, ctx, data.zUnit), axisLimit(a.zhi, ctx, data.zUnit)];
    traces = [{ type: 'surface', x: data.x, y: data.y, z: data.z, colorscale: a.escala || 'Viridis', showscale: true, colorbar: { thickness: 12, len: 0.7, tickfont: { color: ink, size: 10 } } }];
    layout = {
      ...base,
      margin: { l: 0, r: 0, t: 10, b: 0 },
      scene: {
        xaxis: axis(a.xlabel || auto('x', data.xUnit)),
        yaxis: axis(a.ylabel || auto('y', data.yUnit)),
        zaxis: axis(a.zlabel || auto('z', data.zUnit), zr[0] !== null && zr[1] !== null ? { range: zr } : {}),
        aspectmode: 'cube',
        camera: a.camara ? JSON.parse(a.camara) : undefined,
      },
    };
    legend = `<span class="pl-item">${renderLatex(`z=${exprs[0]}`, false)}</span>`;
  } else {
    const yr = [axisLimit(a.ylo, ctx, data.yUnit), axisLimit(a.yhi, ctx, data.yUnit)];
    traces = data.traces.map((t, i) => ({ type: 'scatter', mode: 'lines', x: data.x, y: t.y, line: { color: css(COLORS[i % COLORS.length]), width: 2.2 }, hovertemplate: `x=%{x:.4g}<br>y${i + 1}=%{y:.4g}<extra></extra>` }));
    layout = {
      ...base,
      margin: { l: 60, r: 16, t: 10, b: 46 },
      xaxis: axis(a.xlabel || auto('x', data.xUnit)),
      yaxis: axis(a.ylabel || auto('y', data.yUnit), yr[0] !== null && yr[1] !== null ? { range: yr } : {}),
      hovermode: interactive ? 'x unified' : false,
    };
    legend = data.traces.map((t, i) => `<span class="pl-item"><i style="background:var(${COLORS[i % COLORS.length]})"></i>${renderLatex(`y_{${i + 1}}=${t.latex}`, false)}</span>`).join('');
  }
  const config = interactive
    ? { displaylogo: false, responsive: true, modeBarButtonsToRemove: ['select2d', 'lasso2d'], toImageButtonOptions: { format: 'png', scale: 2, filename: a.titulo || 'grafico' } }
    : { staticPlot: true, responsive: true };
  await Plotly.react(area, traces, layout, config);
  return { legend: a.leyenda === 'no' ? '' : legend };
}

// ---------- vista en la página ----------
class PlotView {
  constructor({ node, view, getPos }) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.detail = null;
    this.dom = document.createElement('div');
    this.dom.className = 'plot-node';
    this.dom.contentEditable = 'false';
    this.dom.innerHTML = `
      <div class="plot-head">
        <span class="plot-title"></span>
        <span class="plot-kind"></span>
        <button type="button" class="tb plot-open" title="Ver en detalle y editar (también con doble clic)">Abrir</button>
        <button type="button" class="tb plot-del" title="Borrar el gráfico">Borrar</button>
      </div>
      <div class="plot-area" title="Doble clic para abrir en detalle"></div>
      <div class="plot-legend"></div>
      <p class="plot-msg" hidden></p>
      <div class="plot-resize" title="Arrastrá para cambiar la altura" role="separator" aria-orientation="horizontal"><span></span></div>`;
    this.area = this.dom.querySelector('.plot-area');
    this.msg = this.dom.querySelector('.plot-msg');
    this.dom.querySelector('.plot-open').addEventListener('click', () => this.openDetail());
    this.area.addEventListener('dblclick', () => this.openDetail());
    this.dom.querySelector('.plot-del').addEventListener('click', () => {
      const pos = this.getPos();
      if (typeof pos === 'number') this.view.dispatch(this.view.state.tr.delete(pos, pos + this.node.nodeSize));
    });
    this.setupResize();
    this.timer = null;
    engine.views.add(this);
    this.syncHead();
    this.refresh();
    if (node.attrs.exprs.every((e) => !e.trim())) setTimeout(() => this.openDetail(), 50);
  }

  attrs() { return this.node.attrs; }
  height() { return Math.min(1200, Math.max(160, parseInt(this.attrs().alto, 10) || 340)); }

  setAttrs(patch) {
    const pos = this.getPos();
    if (typeof pos !== 'number') return;
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, ...patch }));
  }

  setupResize() {
    const grip = this.dom.querySelector('.plot-resize');
    let startY = 0, startH = 0, h = 0, raf = 0;
    const move = (e) => {
      h = Math.min(1200, Math.max(160, startH + e.clientY - startY));
      this.area.style.height = `${h}px`;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { if (this.plotted && plotlyPromise) plotlyPromise.then((P) => P.relayout(this.area, { height: h })); });
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      this.dom.classList.remove('resizing');
      if (h && h !== startH) this.setAttrs({ alto: String(Math.round(h)) });
    };
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      startY = e.clientY;
      startH = this.area.offsetHeight || this.height();
      h = startH;
      grip.setPointerCapture(e.pointerId);
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      this.dom.classList.add('resizing');
    });
  }

  syncHead() {
    const a = this.attrs();
    this.dom.querySelector('.plot-title').textContent = a.titulo || (a.tipo === '3d' ? 'Superficie z(x, y)' : 'Gráfico y(x)');
    this.dom.querySelector('.plot-kind').textContent = a.tipo === '3d' ? '3D' : '2D';
  }

  ctx() {
    const pos = this.getPos();
    return (typeof pos === 'number' && engine.snaps.get(pos)) || new Ctx();
  }

  refresh() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.render(); this.detail?.render(); }, 60);
  }

  async render() {
    const legend = this.dom.querySelector('.plot-legend');
    this.area.style.height = `${this.height()}px`;
    const r = await drawPlot(this.area, this.attrs(), this.ctx(), { interactive: false, height: this.height() });
    if (r.empty) {
      if (this.plotted && plotlyPromise) (await plotlyPromise).purge(this.area);
      this.plotted = false;
      this.area.classList.add('empty');
      this.area.innerHTML = '<p class="plot-empty">Doble clic para escribir la función.</p>';
      legend.innerHTML = '';
      this.msg.hidden = true;
      return;
    }
    this.msg.hidden = !r.error;
    this.msg.textContent = r.error ? `⚠ ${r.error}` : '';
    if (r.error) return;
    if (this.area.classList.contains('empty')) { this.area.classList.remove('empty'); }
    this.plotted = true;
    legend.innerHTML = r.legend;
  }

  openDetail() {
    if (this.detail) return;
    this.detail = new PlotDetail(this, () => { this.detail = null; });
  }

  update(node) {
    if (node.type !== this.node.type) return false;
    const old = this.node.attrs;
    this.node = node;
    this.syncHead();
    this.detail?.attrsChanged(old);
    this.refresh();
    return true;
  }

  selectNode() { this.dom.classList.add('selected'); }
  deselectNode() { this.dom.classList.remove('selected'); }
  stopEvent(e) { return this.dom.contains(e.target) && !e.target.closest?.('.plot-head .plot-title'); }
  ignoreMutation() { return true; }
  destroy() {
    engine.views.delete(this);
    clearTimeout(this.timer);
    this.detail?.close();
    if (this.plotted && plotlyPromise) plotlyPromise.then((P) => P.purge(this.area));
  }
}

// ---------- vista detallada ----------
class PlotDetail {
  constructor(owner, onClose) {
    this.owner = owner;
    this.onClose = onClose;
    this.plotted = false;
    const dlg = document.createElement('dialog');
    dlg.className = 'plot-detail';
    dlg.innerHTML = `
      <div class="pd-main">
        <div class="pd-top">
          <span class="pd-title"></span>
          <span class="pd-hint"></span>
          <button type="button" class="icon-btn pd-close" aria-label="Cerrar">×</button>
        </div>
        <div class="pd-plot"></div>
        <div class="plot-legend pd-legend"></div>
        <p class="plot-msg" hidden></p>
      </div>
      <aside class="pd-side"></aside>`;
    document.body.appendChild(dlg);
    this.dlg = dlg;
    this.plotEl = dlg.querySelector('.pd-plot');
    this.side = dlg.querySelector('.pd-side');
    this.msg = dlg.querySelector('.plot-msg');
    dlg.querySelector('.pd-close').addEventListener('click', () => this.close());
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
    dlg.showModal();
    this.buildForm();
    this.render();
    this.onResize = () => { if (this.plotted && plotlyPromise) plotlyPromise.then((P) => P.Plots.resize(this.plotEl)); };
    window.addEventListener('resize', this.onResize);
    if (this.attrs().exprs.every((e) => !e.trim())) setTimeout(() => this.side.querySelector('math-field')?.focus(), 80);
  }

  attrs() { return this.owner.attrs(); }
  set(patch) { this.owner.setAttrs(patch); }

  async render() {
    const a = this.attrs();
    this.dlg.querySelector('.pd-title').textContent = a.titulo || (a.tipo === '3d' ? 'Superficie z(x, y)' : 'Gráfico y(x)');
    this.dlg.querySelector('.pd-hint').textContent = a.tipo === '3d' ? 'Arrastrá para rotar · rueda para acercar' : 'Arrastrá para hacer zoom · doble clic para volver';
    const h = Math.max(320, this.plotEl.clientHeight || 520);
    const r = await drawPlot(this.plotEl, a, this.owner.ctx(), { interactive: true, height: h });
    const legend = this.dlg.querySelector('.pd-legend');
    if (r.empty) {
      if (this.plotted && plotlyPromise) (await plotlyPromise).purge(this.plotEl);
      this.plotted = false;
      this.plotEl.innerHTML = '<p class="plot-empty">Escribí una función a la derecha para ver el gráfico.</p>';
      legend.innerHTML = '';
      this.msg.hidden = true;
      return;
    }
    this.msg.hidden = !r.error;
    this.msg.textContent = r.error ? `⚠ ${r.error}` : '';
    if (r.error) return;
    this.plotted = true;
    legend.innerHTML = r.legend;
    if (a.tipo === '3d' && !this.cameraHooked) {
      this.cameraHooked = true;
      // Guarda el ángulo de vista elegido para mostrarlo igual en la página
      this.plotEl.on?.('plotly_relayout', (ev) => {
        const cam = ev && ev['scene.camera'];
        if (cam) this.set({ camara: JSON.stringify(cam) });
      });
    }
  }

  attrsChanged(old) {
    const a = this.attrs();
    if ((old.tipo !== a.tipo || old.exprs.length !== a.exprs.length) && !this.side.contains(document.activeElement)) this.buildForm();
  }

  buildForm() {
    const a = this.attrs();
    const is3d = a.tipo === '3d';
    const field = (k, label, ph = '', cls = '') => `<label class="pf-field ${cls}"><span>${label}</span><input data-k="${k}" value="${esc(a[k])}" placeholder="${esc(ph)}"></label>`;
    const select = (k, label, opts) => `<label class="pf-field"><span>${label}</span><select data-k="${k}">${opts.map(([v, t]) => `<option value="${v}"${String(a[k]) === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`;
    this.side.innerHTML = `
      <section class="pd-sec">
        <h3>Gráfico</h3>
        <div class="pf-row">
          ${select('tipo', 'Tipo', [['2d', '2D · curvas y(x)'], ['3d', '3D · superficie z(x, y)']])}
          ${field('titulo', 'Título', 'Momento flector', 'grow')}
        </div>
      </section>
      <section class="pd-sec">
        <h3>${is3d ? 'Función z(x, y)' : 'Curvas y(x)'}</h3>
        <div class="pf-exprs"></div>
        ${is3d ? '' : '<button type="button" class="tb pf-add">+ curva</button>'}
        <p class="pf-hint">Usá <b>x</b>${is3d ? ' e <b>y</b>' : ''} como variable. Valen las variables y funciones definidas arriba con :=.</p>
      </section>
      <section class="pd-sec">
        <h3>Rangos</h3>
        <div class="pf-row">${field('xmin', 'x desde')}${field('xmax', 'x hasta')}</div>
        ${is3d
          ? `<div class="pf-row">${field('ymin', 'y desde')}${field('ymax', 'y hasta')}</div>
             <div class="pf-row">${field('zlo', 'z mínimo', 'auto')}${field('zhi', 'z máximo', 'auto')}</div>`
          : `<div class="pf-row">${field('ylo', 'y mínimo', 'auto')}${field('yhi', 'y máximo', 'auto')}</div>`}
        <p class="pf-hint">Se pueden usar variables y unidades: de 0 a L, o hasta 20 MPa. Vacío = automático.</p>
      </section>
      <section class="pd-sec">
        <h3>Ejes</h3>
        <div class="pf-row">${field('xlabel', 'Nombre eje x', 'automático (con unidades)', 'grow')}</div>
        <div class="pf-row">${field('ylabel', 'Nombre eje y', 'automático (con unidades)', 'grow')}</div>
        ${is3d ? `<div class="pf-row">${field('zlabel', 'Nombre eje z', 'automático (con unidades)', 'grow')}</div>` : ''}
      </section>
      <section class="pd-sec">
        <h3>Aspecto</h3>
        <div class="pf-row">
          ${select('grilla', 'Grilla', [['si', 'Sí'], ['no', 'No']])}
          ${select('leyenda', 'Fórmulas debajo', [['si', 'Sí'], ['no', 'No']])}
          ${is3d ? select('escala', 'Colores', SCALES.map((s) => [s, s])) : ''}
        </div>
        <div class="pf-row">
          ${field('puntos', 'Puntos', is3d ? '46 por lado' : '241')}
          ${field('alto', 'Alto en la página (px)', '340')}
        </div>
        ${is3d ? '<button type="button" class="tb pd-cam">Volver a la vista inicial</button>' : ''}
      </section>`;
    const list = this.side.querySelector('.pf-exprs');
    const exprs = is3d ? [a.exprs[0] || ''] : a.exprs;
    exprs.forEach((latex, i) => {
      const row = document.createElement('div');
      row.className = 'pf-expr';
      row.innerHTML = `<span class="pf-swatch" style="background:var(${COLORS[i % COLORS.length]})"></span><span class="pf-lhs">${is3d ? 'z =' : `y<sub>${i + 1}</sub> =`}</span>`;
      list.appendChild(row);
      const mf = new MathfieldElement();
      mf.className = 'math-editor pf-mf';
      row.appendChild(mf);
      configureMathfield(mf);
      mf.value = latex;
      mf.addEventListener('input', () => {
        const next = [...this.attrs().exprs];
        next[i] = mf.value;
        this.set({ exprs: next });
      });
      if (!is3d && exprs.length > 1) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'tb pf-del';
        del.title = 'Quitar curva';
        del.textContent = '×';
        del.addEventListener('click', () => {
          const next = this.attrs().exprs.filter((_, j) => j !== i);
          this.set({ exprs: next.length ? next : [''] });
          this.buildForm();
        });
        row.appendChild(del);
      }
    });
    this.side.querySelector('.pf-add')?.addEventListener('click', () => {
      this.set({ exprs: [...this.attrs().exprs, ''] });
      this.buildForm();
      const mfs = this.side.querySelectorAll('.pf-mf');
      mfs[mfs.length - 1]?.focus();
    });
    this.side.querySelector('.pd-cam')?.addEventListener('click', () => this.set({ camara: '' }));
    this.side.querySelectorAll('[data-k]').forEach((el) => {
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        const patch = { [el.dataset.k]: el.value };
        if (el.dataset.k === 'tipo' && el.value === '3d' && this.attrs().exprs.length > 1) patch.exprs = [this.attrs().exprs[0]];
        this.set(patch);
        if (el.dataset.k === 'tipo') this.buildForm();
      });
    });
  }

  close() {
    if (!this.dlg) return;
    window.removeEventListener('resize', this.onResize);
    if (this.plotted && plotlyPromise) plotlyPromise.then((P) => P.purge(this.plotEl));
    this.dlg.close();
    this.dlg.remove();
    this.dlg = null;
    this.onClose();
  }
}

export const Plot = Node.create({
  name: 'plot',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    const attr = (k) => ({ default: PLOT_DEFAULTS[k], parseHTML: (el) => parsePlotSource(el.getAttribute('data-src') || '')[k], renderHTML: () => ({}) });
    return Object.fromEntries(Object.keys(PLOT_DEFAULTS).map((k) => [k, attr(k)]));
  },
  parseHTML: () => [{ tag: 'div[data-type="plot"]' }],
  renderHTML: ({ node }) => ['div', { 'data-type': 'plot', 'data-src': serializePlot(node.attrs) }],
  addNodeView() { return (props) => new PlotView(props); },
  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write(`\`\`\`plot\n${serializePlot(node.attrs)}\n\`\`\``);
          state.closeBlock(node);
        },
        parse: { setup: markdownItPlot },
      },
    };
  },
  addCommands() {
    return {
      insertPlot: (attrs = {}) => ({ tr, dispatch }) => {
        const node = this.type.create({ ...PLOT_DEFAULTS, ...attrs });
        const { $from } = tr.selection;
        let pos;
        if ($from.parent.isTextblock && $from.parent.content.size === 0 && $from.depth > 0) {
          pos = $from.before();
          tr.replaceWith(pos, $from.after(), node);
        } else {
          pos = $from.depth > 0 ? $from.after(1) : $from.pos;
          tr.insert(pos, node);
        }
        if (dispatch) tr.setSelection(NodeSelection.create(tr.doc, pos));
        return true;
      },
    };
  },
});
