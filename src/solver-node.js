// Bloque "Resolver" (como Given/Find de MathCad): incógnitas con valor inicial + ecuaciones.
// Busca las soluciones desde muchos puntos de partida, las lista y la elegida queda definida
// para toda la página. En el .md se guarda como un bloque ```resolver.
import { Node } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { MathfieldElement } from 'mathlive';
import { engine, prettyName, valueToLatex } from './calc.js';
import { renderLatex, configureMathfield } from './math-nodes.js';
import { SOLVER_DEFAULTS, parseSolverSource, serializeSolver, markdownItPlot } from './md-rules.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MAX_SHOWN = 8;

// θ ← theta, σ_x ← sigma_x
const nameLatex = (name) => {
  const prime = name.endsWith('_prime');
  const [base, ...sub] = (prime ? name.slice(0, -6) : name).split('_');
  const greek = /^(alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Sigma|Phi|Psi|Omega)$/.test(base);
  return `${greek ? `\\${base}` : base}${prime ? "'" : ''}${sub.length ? `_{${sub.join('')}}` : ''}`;
};

class SolverView {
  constructor({ node, view, getPos }) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.dom = document.createElement('div');
    this.dom.className = 'solver-node';
    this.dom.contentEditable = 'false';
    this.dom.innerHTML = `
      <div class="sv-head">
        <span class="sv-title">Resolver</span>
        <span class="sv-sub">ecuaciones con incógnitas</span>
        <button type="button" class="tb sv-del" title="Borrar el bloque">Borrar</button>
      </div>
      <label class="sv-field"><span>Incógnitas y valores iniciales</span>
        <input class="sv-vars" spellcheck="false" placeholder="t = 1, a = 1, b = 1, c = 1  (con unidades: R = 10 kN)"></label>
      <div class="sv-eqs-label">Ecuaciones (se usa todo lo definido arriba con :=)</div>
      <div class="sv-eqs"></div>
      <button type="button" class="tb sv-add">+ ecuación</button>
      <div class="sv-out" aria-live="polite"></div>`;
    this.eqBox = this.dom.querySelector('.sv-eqs');
    this.out = this.dom.querySelector('.sv-out');
    const vars = this.dom.querySelector('.sv-vars');
    vars.value = node.attrs.vars;
    vars.addEventListener('input', () => this.set({ vars: vars.value }));
    this.dom.querySelector('.sv-add').addEventListener('click', () => {
      this.set({ eqs: [...this.node.attrs.eqs, ''] });
      this.buildEqs();
      const mfs = this.eqBox.querySelectorAll('math-field');
      mfs[mfs.length - 1]?.focus();
    });
    this.dom.querySelector('.sv-del').addEventListener('click', () => {
      const pos = this.getPos();
      if (typeof pos === 'number') this.view.dispatch(this.view.state.tr.delete(pos, pos + this.node.nodeSize));
    });
    this.out.addEventListener('change', (e) => {
      if (e.target.name === 'sv-pick') this.set({ usar: String(Number(e.target.value) + 1) });
    });
    this.buildEqs();
    engine.views.add(this);
    this.refresh();
  }

  set(patch) {
    const pos = this.getPos();
    if (typeof pos !== 'number') return;
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, ...patch }));
  }

  buildEqs() {
    // MathLive necesita que el campo ya esté en la página: si el bloque todavía no se insertó, esperar
    if (!this.dom.isConnected) { requestAnimationFrame(() => this.buildEqs()); return; }
    this.eqBox.innerHTML = '';
    const eqs = this.node.attrs.eqs.length ? this.node.attrs.eqs : [''];
    eqs.forEach((latex, i) => {
      const row = document.createElement('div');
      row.className = 'sv-eq';
      row.innerHTML = `<span class="sv-n">${i + 1}</span>`;
      this.eqBox.appendChild(row);
      const mf = new MathfieldElement();
      mf.className = 'math-editor sv-mf';
      row.appendChild(mf);
      configureMathfield(mf);
      mf.placeholder = '\\text{ecuación, p. ej. } J\\cdot d=0';
      mf.value = latex;
      mf.addEventListener('input', () => {
        const next = [...(this.node.attrs.eqs.length ? this.node.attrs.eqs : [''])];
        next[i] = mf.value;
        this.set({ eqs: next });
      });
      if (eqs.length > 1) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'tb sv-x';
        del.title = 'Quitar esta ecuación';
        del.textContent = '×';
        del.addEventListener('click', () => {
          this.set({ eqs: this.node.attrs.eqs.filter((_, j) => j !== i) });
          this.buildEqs();
        });
        row.appendChild(del);
      }
    });
  }

  refresh() {
    const pos = this.getPos();
    const r = typeof pos === 'number' ? engine.results.get(pos) : null;
    if (!r) { this.out.innerHTML = ''; return; }
    if (r.error) { this.out.innerHTML = `<p class="sv-error">⚠ ${esc(r.error)}</p>`; return; }
    if (!r.solutions) { this.out.innerHTML = ''; return; }
    const names = r.names;
    const shown = r.solutions.slice(0, MAX_SHOWN);
    const fmtVal = (x, i) => (r.units && r.units[i] ? `${valueToLatex(x)}\\,\\mathrm{${r.units[i].replace(/\s+/g, '{\\cdot}')}}` : valueToLatex(x));
    this.out.innerHTML = `
      <div class="sv-summary">${r.solutions.length === 1 ? '✓ 1 solución' : `✓ ${r.solutions.length} soluciones${r.solutions.length > MAX_SHOWN ? ` (se muestran ${MAX_SHOWN}; puede haber infinitas)` : ''} · elegí cuál usar en la página`}</div>
      <div class="sv-table-wrap"><table class="sv-table">
        <thead><tr>${r.solutions.length > 1 ? '<th></th>' : ''}${names.map((n) => `<th>${renderLatex(nameLatex(n), false)}</th>`).join('')}</tr></thead>
        <tbody>${shown.map((x, k) => `<tr class="${k === r.chosen ? 'on' : ''}">${r.solutions.length > 1 ? `<td><input type="radio" name="sv-pick" value="${k}" ${k === r.chosen ? 'checked' : ''} aria-label="Usar la solución ${k + 1}"></td>` : ''}${x.map((v, i) => `<td>${renderLatex(fmtVal(v, i), false)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
      ${r.warning ? `<p class="sv-warn">${esc(r.warning)}</p>` : ''}
      <p class="sv-hint">Las incógnitas quedan definidas con la solución elegida: podés usarlas en las ecuaciones de abajo (por ejemplo <b>t =</b>). Otras soluciones: cambiá los valores iniciales.</p>`;
  }

  update(node) {
    if (node.type !== this.node.type) return false;
    const old = this.node.attrs;
    this.node = node;
    const vars = this.dom.querySelector('.sv-vars');
    if (document.activeElement !== vars && vars.value !== node.attrs.vars) vars.value = node.attrs.vars;
    if (old.eqs.length !== node.attrs.eqs.length && !this.eqBox.contains(document.activeElement)) this.buildEqs();
    return true;
  }

  selectNode() { this.dom.classList.add('selected'); }
  deselectNode() { this.dom.classList.remove('selected'); }
  stopEvent(e) { return this.dom.contains(e.target) && !e.target.closest?.('.sv-title'); }
  ignoreMutation() { return true; }
  destroy() { engine.views.delete(this); }
}

export const Solver = Node.create({
  name: 'solver',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    const attr = (k) => ({ default: SOLVER_DEFAULTS[k], parseHTML: (el) => parseSolverSource(el.getAttribute('data-src') || '')[k], renderHTML: () => ({}) });
    return { vars: attr('vars'), eqs: attr('eqs'), usar: attr('usar') };
  },
  parseHTML: () => [{ tag: 'div[data-type="solver"]' }],
  renderHTML: ({ node }) => ['div', { 'data-type': 'solver', 'data-src': serializeSolver(node.attrs) }],
  addNodeView() { return (props) => new SolverView(props); },
  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write(`\`\`\`resolver\n${serializeSolver(node.attrs)}\n\`\`\``);
          state.closeBlock(node);
        },
        parse: { setup: markdownItPlot },
      },
    };
  },
  addCommands() {
    return {
      insertSolver: () => ({ tr, dispatch }) => {
        const node = this.type.create({ ...SOLVER_DEFAULTS, eqs: [''] });
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
