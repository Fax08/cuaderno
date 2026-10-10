// Ecuaciones en línea ($…$) y en bloque ($$…$$).
// Se muestran con KaTeX y se editan con MathLive (editor visual con atajos).
import { Node, InputRule } from '@tiptap/core';
import { NodeSelection, Selection, TextSelection } from '@tiptap/pm/state';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { MathfieldElement } from 'mathlive';
import { engine, TARGET_UNITS, SINGLE_UNITS } from './calc.js';
import { markdownItMath } from './md-rules.js';

MathfieldElement.fontsDirectory = new URL('mathlive-fonts/', document.baseURI).href;
MathfieldElement.soundsDirectory = null;

export const KATEX_MACROS = {
  '\\differentialD': '\\mathrm{d}',
  '\\exponentialE': '\\mathrm{e}',
  '\\imaginaryI': '\\mathrm{i}',
  '\\imaginaryJ': '\\mathrm{j}',
  '\\placeholder': '\\square',
  '\\questeq': '\\overset{?}{=}',
  '\\doubleprime': '\\prime\\prime',
  '\\coloneq': '\\mathrel{:=}',
};

export function renderLatex(latex, displayMode) {
  return katex.renderToString(latex, { displayMode, throwOnError: false, macros: { ...KATEX_MACROS }, strict: false });
}

// Solo para mostrar: las unidades van rectas (kN, MPa, m) como en MathCad; el archivo no cambia.
export function uprightUnits(latex) {
  let out = latex.replace(/(?<![\\A-Za-z])([A-Za-z]{2,})(?![A-Za-z])/g, (w, run, idx, s) => {
    if (!TARGET_UNITS.has(run)) return w;
    if (/_\{?$/.test(s.slice(0, idx)) || /\\(?:mathrm|text|operatorname)\{$/.test(s.slice(0, idx))) return w;
    return `\\mathrm{${run}}`;
  });
  // letra suelta pegada a un número o a otra unidad: 6m, 9.81m/s^2, kN\cdot m, \frac{kN}{m}
  const single = /(\d|\\mathrm\{[A-Za-z]+\}(?:\^\{?-?\d+\}?)?\s*(?:\\cdot\s*|\/|\}\{)?)([msNJW])(?![A-Za-z_])/g;
  for (let prev = ''; prev !== out;) {
    prev = out;
    out = out.replace(single, (w, pre, ch) => (SINGLE_UNITS.has(ch) ? `${pre}\\mathrm{${ch}}` : w));
  }
  return out;
}

// Atajos propios dentro de una ecuación (además de los de MathLive: alpha, sigma, sqrt, sum…)
export const SHORTCUTS = {
  mat2: '\\begin{bmatrix}#0 & #? \\\\ #? & #?\\end{bmatrix}',
  mat3: '\\begin{bmatrix}#0 & #? & #? \\\\ #? & #? & #? \\\\ #? & #? & #?\\end{bmatrix}',
  vec2: '\\begin{bmatrix}#0 \\\\ #?\\end{bmatrix}',
  vec3: '\\begin{bmatrix}#0 \\\\ #? \\\\ #?\\end{bmatrix}',
  sig: '\\sigma',
  eps: '\\varepsilon',
  lam: '\\lambda',
  gam: '\\gamma',
  ome: '\\omega',
  alf: '\\alpha',
  bet: '\\beta',
  the: '\\theta',
  TT: '^{\\top}',
  inv: '^{-1}',
  traza: '\\operatorname{tr}',
  pd: '\\partial',
};

export function configureMathfield(mf) {
  mf.inlineShortcuts = { ...mf.inlineShortcuts, ...SHORTCUTS };
  mf.keybindings = [
    ...mf.keybindings,
    { key: 'ctrl+alt+[Enter]', ifMode: 'math', command: 'addColumnAfter' },
  ];
  mf.mathVirtualKeyboardPolicy = 'manual';
  mf.smartFence = true;
  mf.defaultMode = 'math';
}

// ---------- vista de una ecuación ----------
class MathView {
  constructor({ node, view, getPos, block }) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.block = block;
    this.mf = null;
    this.dom = document.createElement(block ? 'div' : 'span');
    this.dom.className = `math-node ${block ? 'math-block' : 'math-inline'}`;
    this.dom.contentEditable = 'false';
    this.out = document.createElement('span');
    this.out.className = 'math-render';
    this.res = document.createElement('span');
    this.res.className = 'math-result';
    this.dom.append(this.out, this.res);
    this.dom.addEventListener('mousedown', (e) => {
      if (this.mf) return;
      e.preventDefault();
      this.selectSelf();
    });
    this.draw();
    engine.views.add(this);
    this.refresh();
  }

  selectSelf() {
    const pos = this.getPos();
    if (typeof pos !== 'number') return;
    this.view.focus();
    this.view.dispatch(this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, pos)));
  }

  draw() {
    const latex = this.node.attrs.latex;
    this.out.innerHTML = latex.trim() ? renderLatex(uprightUnits(latex), this.block) : '<span class="math-empty">ecuación</span>';
  }

  refresh() {
    const pos = this.getPos();
    const r = typeof pos === 'number' ? engine.results.get(pos) : null;
    this.dom.classList.toggle('has-error', !!(r && r.error));
    this.dom.classList.toggle('is-def', !!(r && r.kind === 'def' && !r.error));
    if (!r || (!r.latex && !r.error)) { this.res.innerHTML = ''; this.res.title = ''; return; }
    if (r.error) {
      this.res.innerHTML = `<span class="math-error">⚠ ${r.error.replace(/[<>&]/g, '')}</span>`;
      return;
    }
    this.res.innerHTML = renderLatex(r.latex, false);
  }

  selectNode() {
    this.dom.classList.add('selected');
    this.open();
  }

  deselectNode() {
    this.dom.classList.remove('selected');
    if (this.mf && this.mf.hasFocus && this.mf.hasFocus()) return;
    this.close();
  }

  open() {
    if (this.mf) return;
    const mf = new MathfieldElement();
    mf.className = 'math-editor';
    this.out.hidden = true;
    this.dom.insertBefore(mf, this.res);
    configureMathfield(mf);
    mf.value = this.node.attrs.latex;
    this.mf = mf;
    mf.addEventListener('input', () => this.commit(mf.value));
    mf.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.altKey && !e.ctrlKey) {
        e.preventDefault(); e.stopPropagation();
        this.exit('after', e.shiftKey && this.block);
      } else if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        this.exit('after');
      } else if (e.key === 'Tab') {
        e.preventDefault(); e.stopPropagation();
        this.exit(e.shiftKey ? 'before' : 'after');
      }
    }, { capture: true });
    mf.addEventListener('move-out', (e) => {
      e.preventDefault();
      const dir = e.detail && e.detail.direction;
      this.exit(dir === 'backward' || dir === 'upward' ? 'before' : 'after');
    });
    mf.addEventListener('focusout', () => {
      setTimeout(() => {
        if (!this.mf || (this.mf.hasFocus && this.mf.hasFocus())) return;
        if (document.activeElement === this.mf) return;
        this.close();
        if (!this.node.attrs.latex.trim()) this.remove();
      }, 160);
    });
    requestAnimationFrame(() => { mf.focus(); mf.executeCommand('moveToMathfieldEnd'); });
  }

  close() {
    if (!this.mf) return;
    const mf = this.mf;
    this.mf = null;
    mf.remove();
    this.out.hidden = false;
    this.draw();
  }

  commit(latex) {
    const pos = this.getPos();
    if (typeof pos !== 'number' || latex === this.node.attrs.latex) return;
    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, { latex });
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    this.view.dispatch(tr);
  }

  remove() {
    const pos = this.getPos();
    if (typeof pos !== 'number') return;
    const node = this.view.state.doc.nodeAt(pos);
    if (!node || node.attrs.latex.trim()) return;
    this.view.dispatch(this.view.state.tr.delete(pos, pos + node.nodeSize));
  }

  exit(dir, newBelow = false) {
    if (this.mf) this.commit(this.mf.value);
    const pos = this.getPos();
    this.close();
    if (typeof pos !== 'number') return;
    const { state } = this.view;
    const node = state.doc.nodeAt(pos);
    let tr = state.tr;
    if (node && !node.attrs.latex.trim()) {
      tr = tr.delete(pos, pos + node.nodeSize);
      tr.setSelection(Selection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size)), -1));
    } else if (newBelow) {
      const after = pos + node.nodeSize;
      tr = tr.insert(after, node.type.create({ latex: '' }));
      tr.setSelection(NodeSelection.create(tr.doc, after));
    } else if (dir === 'before') {
      tr.setSelection(Selection.near(tr.doc.resolve(pos), -1));
    } else {
      const after = pos + node.nodeSize;
      const $after = tr.doc.resolve(after);
      if (this.block && !($after.nodeAfter && $after.nodeAfter.isTextblock)) {
        tr = tr.insert(after, state.schema.nodes.paragraph.create());
        tr.setSelection(TextSelection.create(tr.doc, after + 1));
      } else {
        tr.setSelection(Selection.near(tr.doc.resolve(after), 1));
      }
    }
    this.view.dispatch(tr.scrollIntoView());
    this.view.focus();
  }

  update(node) {
    if (node.type !== this.node.type) return false;
    const changed = node.attrs.latex !== this.node.attrs.latex;
    this.node = node;
    if (changed && !this.mf) this.draw();
    if (this.mf && this.mf.value !== node.attrs.latex && !(this.mf.hasFocus && this.mf.hasFocus())) this.mf.value = node.attrs.latex;
    return true;
  }

  stopEvent(e) { return !!this.mf && (e.target === this.mf || this.mf.contains(e.target)); }
  ignoreMutation() { return true; }
  destroy() { engine.views.delete(this); }
}

// ---------- nodos ----------
const latexAttr = {
  latex: {
    default: '',
    parseHTML: (el) => el.getAttribute('data-latex') || '',
    renderHTML: (attrs) => ({ 'data-latex': attrs.latex }),
  },
};

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => latexAttr,
  parseHTML: () => [{ tag: 'span[data-type="math-inline"]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', { 'data-type': 'math-inline', ...HTMLAttributes }],
  addNodeView() { return (props) => new MathView({ ...props, block: false }); },
  addStorage() {
    return {
      markdown: {
        serialize(state, node) { state.write(`$${node.attrs.latex}$`); },
        parse: { setup: markdownItMath },
      },
    };
  },
  addCommands() {
    return {
      insertMathInline: (latex = '') => ({ tr, dispatch }) => {
        const pos = tr.selection.from;
        tr.replaceSelectionWith(this.type.create({ latex }), false);
        if (dispatch) tr.setSelection(NodeSelection.create(tr.doc, pos));
        return true;
      },
    };
  },
  addKeyboardShortcuts() {
    return { 'Mod-m': () => this.editor.commands.insertMathInline() };
  },
  addInputRules() {
    return [new InputRule({
      find: /(?<![$\\])\$([^$\s](?:[^$]*[^$\s])?)\$$/,
      handler: ({ state, range, match }) => {
        state.tr.replaceWith(range.from, range.to, this.type.create({ latex: match[1] }));
      },
    })];
  },
});

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => latexAttr,
  parseHTML: () => [{ tag: 'div[data-type="math-block"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', { 'data-type': 'math-block', ...HTMLAttributes }],
  addNodeView() { return (props) => new MathView({ ...props, block: true }); },
  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write(`$$\n${node.attrs.latex}\n$$`);
          state.closeBlock(node);
        },
        parse: { setup: markdownItMath },
      },
    };
  },
  addCommands() {
    return {
      insertMathBlock: (latex = '') => ({ tr, dispatch }) => {
        const node = this.type.create({ latex });
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
  addKeyboardShortcuts() {
    return { 'Mod-Shift-m': () => this.editor.commands.insertMathBlock() };
  },
  addInputRules() {
    return [new InputRule({
      find: /^\$\$\s$/,
      handler: ({ state, range }) => {
        const $from = state.doc.resolve(range.from);
        const start = $from.before();
        const { tr } = state;
        tr.replaceWith(start, $from.after(), this.type.create({ latex: '' }));
        tr.setSelection(NodeSelection.create(tr.doc, start));
      },
    })];
  },
});
