// Bloque "Tensiones principales" (autovalores y autovectores de una matriz, p. ej. el tensor σ):
// ecuación característica, invariantes, tensiones principales, cosenos directores (l²+m²+n²=1)
// y matriz de tensiones principales. Deja definidos λ₁, λ₂… y n₁, n₂… para el resto de la página.
// En el .md se guarda como un bloque ```autovalores.
import { Node } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { MathfieldElement } from 'mathlive';
import { engine, fmtNum } from './calc.js';
import { renderLatex, configureMathfield } from './math-nodes.js';
import { EIGEN_DEFAULTS, parseEigenSource, serializeEigen, markdownItPlot } from './md-rules.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const GREEK = /^(alpha|beta|gamma|delta|epsilon|theta|lambda|mu|nu|xi|pi|rho|sigma|tau|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Sigma|Phi|Psi|Omega)$/;
const sym = (name) => (GREEK.test(name) ? `\\${name}` : name);
const unitTex = (u) => (u ? `\\,\\mathrm{${u.replace(/\s*\/\s*/g, '/').replace(/\s+/g, '{\\cdot}')}}` : '');
const signed = (v, first = false) => {
  const t = fmtNum(Math.abs(v));
  if (first) return v < 0 ? `-${t}` : t;
  return v < 0 ? ` - ${t}` : ` + ${t}`;
};

class EigenView {
  constructor({ node, view, getPos }) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.dom = document.createElement('div');
    this.dom.className = 'eigen-node';
    this.dom.contentEditable = 'false';
    this.dom.innerHTML = `
      <div class="sv-head">
        <span class="sv-title">Tensiones principales</span>
        <span class="sv-sub">autovalores y autovectores</span>
        <button type="button" class="tb sv-del" title="Borrar el bloque">Borrar</button>
      </div>
      <div class="eg-row">
        <label class="eg-mat"><span>Matriz (una variable como σ, o escribila)</span><div class="eg-mf"></div></label>
        <label class="sv-field eg-name"><span>Valores</span><input data-k="valores" spellcheck="false"></label>
        <label class="sv-field eg-name"><span>Direcciones</span><input data-k="vectores" spellcheck="false"></label>
      </div>
      <div class="sv-out eg-out" aria-live="polite"></div>`;
    this.out = this.dom.querySelector('.eg-out');
    this.dom.querySelectorAll('[data-k]').forEach((el) => {
      el.value = node.attrs[el.dataset.k];
      el.addEventListener('input', () => this.set({ [el.dataset.k]: el.value }));
    });
    this.dom.querySelector('.sv-del').addEventListener('click', () => {
      const pos = this.getPos();
      if (typeof pos === 'number') this.view.dispatch(this.view.state.tr.delete(pos, pos + this.node.nodeSize));
    });
    this.buildField();
    engine.views.add(this);
    this.refresh();
  }

  buildField() {
    if (!this.dom.isConnected) { requestAnimationFrame(() => this.buildField()); return; }
    const box = this.dom.querySelector('.eg-mf');
    box.innerHTML = '';
    const mf = new MathfieldElement();
    mf.className = 'math-editor';
    box.appendChild(mf);
    configureMathfield(mf);
    mf.placeholder = '\\sigma';
    mf.value = this.node.attrs.matriz;
    mf.addEventListener('input', () => this.set({ matriz: mf.value }));
    this.mf = mf;
    if (!this.node.attrs.matriz.trim()) requestAnimationFrame(() => mf.focus());
  }

  set(patch) {
    const pos = this.getPos();
    if (typeof pos !== 'number') return;
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, ...patch }));
  }

  refresh() {
    const pos = this.getPos();
    const r = typeof pos === 'number' ? engine.results.get(pos) : null;
    if (!r) { this.out.innerHTML = ''; return; }
    if (r.error) { this.out.innerHTML = `<p class="sv-error">⚠ ${esc(r.error)}</p>`; return; }
    const { n, values, vectors, invariants, unit } = r;
    const L = sym(r.valuesName);
    const D = sym(r.vectorsName);
    const comps = n === 3 ? ['l', 'm', 'n'] : n === 2 ? ['l', 'm'] : values.map((_, i) => `c_{${i + 1}}`);
    const mat = this.node.attrs.matriz.trim() || 'A';
    // Ecuación característica
    // Polinomio sin los términos que valen 0: λ³ − I₁λ² + I₂λ − I₃
    const poly = (terms) => terms.filter(([c], i) => i === 0 || Math.abs(c) > 1e-12).map(([c, p], i) => (i === 0 ? p : `${signed(c)}${p ? `\\,${p}` : ''}`)).join('');
    let charEq;
    if (n === 3) {
      const [I1, I2, I3] = invariants;
      charEq = `\\det\\left(${mat}-${L}\\,I\\right)=0\\;\\Rightarrow\\;${poly([[1, `${L}^3`], [-I1, `${L}^2`], [I2, L], [-I3, '']])}=0`;
    } else if (n === 2) {
      const [I1, , I3] = invariants;
      charEq = `\\det\\left(${mat}-${L}\\,I\\right)=0\\;\\Rightarrow\\;${poly([[1, `${L}^2`], [-I1, L], [I3, '']])}=0`;
    } else {
      charEq = `\\det\\left(${mat}-${L}\\,I\\right)=0`;
    }
    const inv = n <= 3 ? invariants.slice(0, n === 2 ? 3 : 3).map((v, i) => (n === 2 && i === 1 ? null : `I_{${i + 1}}=${fmtNum(v)}`)).filter(Boolean).join(',\\quad ') : '';
    const rows = values.map((v, i) => {
      const vec = vectors[i];
      const check = vec.reduce((a, x) => a + x * x, 0);
      return `<tr><td>${renderLatex(`${L}_{${i + 1}}`, false)}</td><td class="eg-val">${renderLatex(`${fmtNum(v)}${unitTex(unit)}`, false)}</td>${vec.map((x) => `<td>${renderLatex(fmtNum(x), false)}</td>`).join('')}<td class="eg-check">${Math.abs(check - 1) < 1e-9 ? '✓ 1' : fmtNum(check)}</td></tr>`;
    }).join('');
    const diag = `\\begin{bmatrix}${values.map((v, i) => values.map((_, j) => (i === j ? fmtNum(v) : '0')).join(' & ')).join(' \\\\ ')}\\end{bmatrix}${unitTex(unit)}`;
    const dirs = `\\begin{bmatrix}${vectors.map((vec) => vec.map((x) => fmtNum(x)).join(' & ')).join(' \\\\ ')}\\end{bmatrix}`;
    this.out.innerHTML = `
      ${r.symmetric ? '' : '<p class="sv-warn">⚠ La matriz no es simétrica. Un tensor de tensiones cumple σ<sub>ij</sub> = σ<sub>ji</sub>: revisá las componentes fuera de la diagonal.</p>'}
      <div class="eg-line"><span class="eg-label">Ecuación característica</span>${renderLatex(charEq, false)}</div>
      ${inv ? `<div class="eg-line"><span class="eg-label">Invariantes</span>${renderLatex(inv, false)}</div>` : ''}
      <div class="sv-table-wrap"><table class="sv-table eg-table">
        <thead><tr><th></th><th>Tensión principal</th>${comps.map((c) => `<th>${renderLatex(c, false)}</th>`).join('')}<th>${renderLatex(`${comps.map((c) => `${c}^2`).join('+')}`, false)}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="eg-mats">
        <div><span class="eg-label">Tensiones principales</span>${renderLatex(`${L}_P=${diag}`, false)}</div>
        <div><span class="eg-label">Cosenos directores · una fila por dirección</span>${renderLatex(`N=${dirs}`, false)}</div>
      </div>
      <p class="sv-hint">Quedan definidos ${renderLatex(`${L}_1, ${L}_2${n > 2 ? ', \\ldots' : ''}`, false)} y ${renderLatex(`${D}_1, ${D}_2${n > 2 ? ', \\ldots' : ''}`, false)} para usar abajo (por ejemplo ${renderLatex(`${L}_1=`, false)} o ${renderLatex(`${mat}\\cdot ${D}_1=`, false)}).</p>`;
  }

  update(node) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.dom.querySelectorAll('[data-k]').forEach((el) => { if (document.activeElement !== el && el.value !== node.attrs[el.dataset.k]) el.value = node.attrs[el.dataset.k]; });
    if (this.mf && !(this.mf.hasFocus && this.mf.hasFocus()) && this.mf.value !== node.attrs.matriz) this.mf.value = node.attrs.matriz;
    return true;
  }

  selectNode() { this.dom.classList.add('selected'); }
  deselectNode() { this.dom.classList.remove('selected'); }
  stopEvent(e) { return this.dom.contains(e.target) && !e.target.closest?.('.sv-title'); }
  ignoreMutation() { return true; }
  destroy() { engine.views.delete(this); }
}

export const Eigen = Node.create({
  name: 'eigen',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    const attr = (k) => ({ default: EIGEN_DEFAULTS[k], parseHTML: (el) => parseEigenSource(el.getAttribute('data-src') || '')[k], renderHTML: () => ({}) });
    return { matriz: attr('matriz'), valores: attr('valores'), vectores: attr('vectores') };
  },
  parseHTML: () => [{ tag: 'div[data-type="eigen"]' }],
  renderHTML: ({ node }) => ['div', { 'data-type': 'eigen', 'data-src': serializeEigen(node.attrs) }],
  addNodeView() { return (props) => new EigenView(props); },
  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write(`\`\`\`autovalores\n${serializeEigen(node.attrs)}\n\`\`\``);
          state.closeBlock(node);
        },
        parse: { setup: markdownItPlot },
      },
    };
  },
  addCommands() {
    return {
      insertEigen: (matriz = '') => ({ tr, dispatch }) => {
        const node = this.type.create({ ...EIGEN_DEFAULTS, matriz });
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
