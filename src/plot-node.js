// Gráficos 2D (curvas y(x)) y 3D (superficie z(x, y)) que usan las variables de la página.
import { Node } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { MathfieldElement } from 'mathlive';
import { engine, samplePlot, errText, Ctx } from './calc.js';
import { renderLatex, configureMathfield } from './math-nodes.js';
import { PLOT_DEFAULTS, parsePlotSource, serializePlot, markdownItPlot } from './md-rules.js';

let plotlyPromise = null;
const loadPlotly = () => (plotlyPromise ||= import('plotly.js-dist-min').then((m) => m.default || m));

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const COLORS = ['--accent', '--c2', '--c3', '--c4', '--c5'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- vista ----------
class PlotView {
  constructor({ node, view, getPos }) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.dom = document.createElement('div');
    this.dom.className = 'plot-node';
    this.dom.contentEditable = 'false';
    this.dom.innerHTML = `
      <div class="plot-head">
        <span class="plot-title"></span>
        <span class="plot-kind"></span>
        <button type="button" class="tb plot-edit">Editar</button>
        <button type="button" class="tb plot-del" title="Borrar el gráfico">Borrar</button>
      </div>
      <div class="plot-area"></div>
      <div class="plot-legend"></div>
      <p class="plot-msg" hidden></p>
      <div class="plot-form" hidden></div>`;
    this.area = this.dom.querySelector('.plot-area');
    this.form = this.dom.querySelector('.plot-form');
    this.msg = this.dom.querySelector('.plot-msg');
    this.dom.querySelector('.plot-edit').addEventListener('click', () => this.toggleForm());
    this.dom.querySelector('.plot-del').addEventListener('click', () => {
      const pos = this.getPos();
      if (typeof pos === 'number') this.view.dispatch(this.view.state.tr.delete(pos, pos + this.node.nodeSize));
    });
    this.timer = null;
    engine.views.add(this);
    this.syncHead();
    if (node.attrs.exprs.every((e) => !e.trim())) this.toggleForm(true);
    this.refresh();
  }

  attrs() { return this.node.attrs; }

  setAttrs(patch) {
    const pos = this.getPos();
    if (typeof pos !== 'number') return;
    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, ...patch });
    tr.setMeta('addToHistory', true);
    this.view.dispatch(tr);
  }

  syncHead() {
    const a = this.attrs();
    this.dom.querySelector('.plot-title').textContent = a.titulo || (a.tipo === '3d' ? 'Superficie z(x, y)' : 'Gráfico y(x)');
    this.dom.querySelector('.plot-kind').textContent = a.tipo === '3d' ? '3D' : '2D';
  }

  toggleForm(force) {
    const open = force ?? this.form.hidden;
    this.form.hidden = !open;
    this.dom.querySelector('.plot-edit').textContent = open ? 'Listo' : 'Editar';
    this.dom.classList.toggle('editing', open);
    if (open) this.buildForm();
  }

  buildForm() {
    const a = this.attrs();
    const is3d = a.tipo === '3d';
    this.form.innerHTML = `
      <div class="pf-row">
        <label class="pf-field"><span>Tipo</span><select data-k="tipo"><option value="2d"${is3d ? '' : ' selected'}>2D · curvas y(x)</option><option value="3d"${is3d ? ' selected' : ''}>3D · superficie z(x, y)</option></select></label>
        <label class="pf-field grow"><span>Título</span><input data-k="titulo" value="${esc(a.titulo)}" placeholder="Momento flector"></label>
      </div>
      <div class="pf-exprs"></div>
      ${is3d ? '' : '<button type="button" class="tb pf-add">+ curva</button>'}
      <div class="pf-row">
        <label class="pf-field"><span>x desde</span><input data-k="xmin" value="${esc(a.xmin)}"></label>
        <label class="pf-field"><span>x hasta</span><input data-k="xmax" value="${esc(a.xmax)}"></label>
        ${is3d ? `<label class="pf-field"><span>y desde</span><input data-k="ymin" value="${esc(a.ymin)}"></label>
        <label class="pf-field"><span>y hasta</span><input data-k="ymax" value="${esc(a.ymax)}"></label>` : ''}
      </div>
      <p class="pf-hint">Usá <b>x</b>${is3d ? ' e <b>y</b>' : ''} como variable. Podés usar las variables y funciones definidas arriba con :=, también en los rangos (por ejemplo, de 0 a L).</p>`;
    const list = this.form.querySelector('.pf-exprs');
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
        this.setAttrs({ exprs: next });
      });
      if (!is3d && exprs.length > 1) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'tb pf-del';
        del.title = 'Quitar curva';
        del.textContent = '×';
        del.addEventListener('click', () => {
          const next = this.attrs().exprs.filter((_, j) => j !== i);
          this.setAttrs({ exprs: next.length ? next : [''] });
          this.buildForm();
        });
        row.appendChild(del);
      }
    });
    this.form.querySelector('.pf-add')?.addEventListener('click', () => {
      this.setAttrs({ exprs: [...this.attrs().exprs, ''] });
      this.buildForm();
      const mfs = this.form.querySelectorAll('.pf-mf');
      mfs[mfs.length - 1]?.focus();
    });
    this.form.querySelectorAll('[data-k]').forEach((el) => {
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        const patch = { [el.dataset.k]: el.value };
        if (el.dataset.k === 'tipo' && el.value === '3d' && this.attrs().exprs.length > 1) patch.exprs = [this.attrs().exprs[0]];
        this.setAttrs(patch);
        if (el.dataset.k === 'tipo') this.buildForm();
      });
    });
  }

  refresh() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.render(), 60);
  }

  showMsg(text) {
    this.msg.hidden = !text;
    this.msg.textContent = text ? `⚠ ${text}` : '';
  }

  async render() {
    const a = this.attrs();
    const pos = this.getPos();
    const legend = this.dom.querySelector('.plot-legend');
    if (a.exprs.every((e) => !e.trim())) {
      this.area.classList.add('empty');
      this.area.innerHTML = '<p class="plot-empty">Escribí una función para ver el gráfico.</p>';
      legend.innerHTML = '';
      this.showMsg('');
      this.plotted = false;
      return;
    }
    const ctx = (typeof pos === 'number' && engine.snaps.get(pos)) || new Ctx();
    let data;
    try {
      data = samplePlot({ ...a, exprs: a.exprs.filter((e) => e.trim()) }, ctx);
      this.showMsg('');
    } catch (e) {
      this.showMsg(errText(e));
      return;
    }
    const Plotly = await loadPlotly();
    if (this.area.classList.contains('empty')) { this.area.classList.remove('empty'); this.area.innerHTML = ''; }
    const ink = css('--ink'), rule = css('--rule'), muted = css('--muted');
    const label = (v, u) => (u ? `${v} [${u.replace(/\s*\/\s*/g, '/').replace(/\s+/g, '·')}]` : v);
    const axis = (title) => ({ title: { text: title, font: { size: 12, color: muted } }, gridcolor: rule, zerolinecolor: muted, linecolor: rule, color: ink, tickfont: { size: 11 } });
    const base = { paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', font: { family: 'IBM Plex Sans, system-ui, sans-serif', color: ink, size: 12 }, showlegend: false };
    let traces, layout;
    if (data.tipo === '3d') {
      traces = [{ type: 'surface', x: data.x, y: data.y, z: data.z, colorscale: 'Viridis', showscale: true, colorbar: { thickness: 12, len: 0.7, tickfont: { color: ink, size: 10 } } }];
      layout = { ...base, height: 420, margin: { l: 0, r: 0, t: 10, b: 0 }, scene: { xaxis: axis(label('x', data.xUnit)), yaxis: axis(label('y', data.yUnit)), zaxis: axis(label('z', data.zUnit)), aspectmode: 'cube' } };
      legend.innerHTML = `<span class="pl-item">${renderLatex(`z=${a.exprs[0]}`, false)}</span>`;
    } else {
      traces = data.traces.map((t, i) => ({ type: 'scatter', mode: 'lines', x: data.x, y: t.y, line: { color: css(COLORS[i % COLORS.length]), width: 2.2 }, hovertemplate: `x=%{x:.4g}<br>y${i + 1}=%{y:.4g}<extra></extra>` }));
      layout = { ...base, height: 320, margin: { l: 56, r: 16, t: 10, b: 44 }, xaxis: axis(label('x', data.xUnit)), yaxis: axis(label('y', data.yUnit)), hovermode: 'x unified' };
      legend.innerHTML = data.traces.map((t, i) => `<span class="pl-item"><i style="background:var(${COLORS[i % COLORS.length]})"></i>${renderLatex(`y_{${i + 1}}=${t.latex}`, false)}</span>`).join('');
    }
    await Plotly.react(this.area, traces, layout, { displaylogo: false, responsive: true, modeBarButtonsToRemove: ['select2d', 'lasso2d', 'toImage'] });
    this.plotted = true;
  }

  update(node) {
    if (node.type !== this.node.type) return false;
    const old = this.node.attrs;
    this.node = node;
    this.syncHead();
    if (!this.form.hidden && (old.tipo !== node.attrs.tipo || old.exprs.length !== node.attrs.exprs.length)) {
      if (!this.form.contains(document.activeElement)) this.buildForm();
    }
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
    if (this.plotted && plotlyPromise) plotlyPromise.then((P) => P.purge(this.area));
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
    return {
      tipo: attr('tipo'), titulo: attr('titulo'), exprs: attr('exprs'),
      xmin: attr('xmin'), xmax: attr('xmax'), ymin: attr('ymin'), ymax: attr('ymax'),
    };
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
