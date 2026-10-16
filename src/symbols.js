// Panel de símbolos para las ecuaciones. Vive en la columna derecha (arriba del índice)
// y aparece mientras escribís una ecuación. Sin números ni letras: eso ya está en el teclado.
import { renderLatex } from './math-nodes.js';

const G = (cmd) => [`\\${cmd}`, `\\${cmd}`];
const GROUPS = [
  ['Griegas', [
    ...'alpha beta gamma delta epsilon varepsilon zeta eta theta kappa lambda mu nu xi pi rho sigma tau phi varphi chi psi omega'.split(' ').map(G),
    ...'Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega'.split(' ').map(G),
  ]],
  ['Estructuras', [
    ['\\frac{#0}{#?}', '\\frac{a}{b}', 'Fracción ( / )'],
    ['#0^{#?}', 'x^{n}', 'Potencia ( ^ )'],
    ['#0_{#?}', 'x_{i}', 'Subíndice ( _ )'],
    ['#0_{#?}^{#?}', 'x_{i}^{n}', 'Subíndice y potencia'],
    ['\\sqrt{#0}', '\\sqrt{x}', 'Raíz (sqrt)'],
    ['\\sqrt[#?]{#0}', '\\sqrt[n]{x}', 'Raíz n-ésima'],
    ['\\left(#0\\right)', '(\\,)', 'Paréntesis'],
    ['\\left[#0\\right]', '[\\,]', 'Corchetes'],
    ['\\left\\{#0\\right\\}', '\\{\\,\\}', 'Llaves'],
    ['\\left|#0\\right|', '|x|', 'Valor absoluto'],
    ['\\left\\Vert#0\\right\\Vert', '\\|x\\|', 'Norma'],
    ['\\vec{#0}', '\\vec{v}', 'Vector'],
    ['\\mathbf{#0}', '\\mathbf{T}', 'Negrita (tensor)'],
    ['\\hat{#0}', '\\hat{n}', 'Versor'],
    ['\\bar{#0}', '\\bar{x}', 'Barra'],
    ['\\dot{#0}', '\\dot{x}', 'Derivada temporal'],
    ['\\ddot{#0}', '\\ddot{x}', 'Segunda derivada temporal'],
    ['#0^{\\prime}', "x'", 'Prima'],
    ['\\overline{#0}', '\\overline{AB}', 'Segmento'],
    ['\\text{#0}', '\\text{abc}', 'Texto dentro de la ecuación'],
  ]],
  ['Cálculo', [
    ['\\int_{#?}^{#?}#0\\,\\mathrm{d}#?', '\\int_a^b', 'Integral definida'],
    ['\\int #0\\,\\mathrm{d}#?', '\\int', 'Integral'],
    ['\\iint_{#?}#0\\,\\mathrm{d}A', '\\iint', 'Integral doble'],
    ['\\iiint_{#?}#0\\,\\mathrm{d}V', '\\iiint', 'Integral triple'],
    ['\\oint_{#?}#0\\,\\mathrm{d}#?', '\\oint', 'Integral de línea cerrada'],
    ['\\sum_{#?}^{#?}#0', '\\sum', 'Sumatoria'],
    ['\\prod_{#?}^{#?}#0', '\\prod', 'Productoria'],
    ['\\lim_{#?\\to#?}#0', '\\lim', 'Límite'],
    ['\\frac{\\mathrm{d}#0}{\\mathrm{d}#?}', '\\frac{dy}{dx}', 'Derivada'],
    ['\\frac{\\mathrm{d}^2#0}{\\mathrm{d}#?^2}', '\\frac{d^2y}{dx^2}', 'Derivada segunda'],
    ['\\frac{\\partial #0}{\\partial #?}', '\\frac{\\partial f}{\\partial x}', 'Derivada parcial'],
    ['\\frac{\\partial^2 #0}{\\partial #?^2}', '\\frac{\\partial^2 f}{\\partial x^2}', 'Parcial segunda'],
    ['\\partial', '\\partial', 'Parcial'],
    ['\\nabla', '\\nabla', 'Nabla / gradiente'],
    ['\\nabla\\cdot', '\\nabla\\cdot', 'Divergencia'],
    ['\\nabla\\times', '\\nabla\\times', 'Rotor'],
    ['\\nabla^2', '\\nabla^2', 'Laplaciano'],
    ['\\infty', '\\infty', 'Infinito'],
    ['\\Delta', '\\Delta', 'Incremento'],
    ['\\delta_{#?}', '\\delta_{ij}', 'Delta de Kronecker'],
    ['\\varepsilon_{#?}', '\\varepsilon_{ijk}', 'Permutación'],
  ]],
  ['Operadores', [
    ['\\coloneq', ':=', 'Definir (:=)'],
    ['=', '=', 'Igual / calcular'],
    ['\\cdot', '\\cdot', 'Producto ( * )'],
    ['\\times', '\\times', 'Por / producto vectorial (xx)'],
    ['\\otimes', '\\otimes', 'Producto tensorial'],
    ['\\div', '\\div', 'Dividido'],
    ['\\pm', '\\pm', 'Más / menos'],
    ['\\approx', '\\approx', 'Aproximado'],
    ['\\ne', '\\ne', 'Distinto'],
    ['\\le', '\\le', 'Menor o igual'],
    ['\\ge', '\\ge', 'Mayor o igual'],
    ['\\ll', '\\ll', 'Mucho menor'],
    ['\\gg', '\\gg', 'Mucho mayor'],
    ['\\propto', '\\propto', 'Proporcional'],
    ['\\equiv', '\\equiv', 'Idéntico'],
    ['\\to', '\\to', 'Tiende a'],
    ['\\Rightarrow', '\\Rightarrow', 'Implica'],
    ['\\Leftrightarrow', '\\Leftrightarrow', 'Si y solo si'],
    ['\\in', '\\in', 'Pertenece'],
    ['\\forall', '\\forall', 'Para todo'],
    ['\\exists', '\\exists', 'Existe'],
    ['\\perp', '\\perp', 'Perpendicular'],
    ['\\parallel', '\\parallel', 'Paralelo'],
    ['\\circ', '\\circ', 'Composición'],
    ['\\degree', '^{\\circ}', 'Grados'],
  ]],
  ['Matrices', [
    ['\\begin{bmatrix}#0 & #? \\\\ #? & #?\\end{bmatrix}', '\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}', 'Matriz 2×2 (mat2)'],
    ['\\begin{bmatrix}#0 & #? & #? \\\\ #? & #? & #? \\\\ #? & #? & #?\\end{bmatrix}', '\\begin{bmatrix}\\cdot&\\cdot&\\cdot\\\\\\cdot&\\cdot&\\cdot\\\\\\cdot&\\cdot&\\cdot\\end{bmatrix}', 'Matriz 3×3 (mat3)'],
    ['\\begin{bmatrix}#0 \\\\ #?\\end{bmatrix}', '\\begin{bmatrix}a\\\\b\\end{bmatrix}', 'Vector 2 (vec2)'],
    ['\\begin{bmatrix}#0 \\\\ #? \\\\ #?\\end{bmatrix}', '\\begin{bmatrix}a\\\\b\\\\c\\end{bmatrix}', 'Vector 3 (vec3)'],
    ['\\begin{vmatrix}#0 & #? \\\\ #? & #?\\end{vmatrix}', '\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}', 'Determinante 2×2'],
    ['\\begin{cases}#0 \\\\ #?\\end{cases}', '\\begin{cases}a\\\\b\\end{cases}', 'Sistema / casos'],
    ['@addRowAfter', '+\\,\\text{fila}', 'Agregar fila (Alt+Enter)'],
    ['@addColumnAfter', '+\\,\\text{col}', 'Agregar columna (Ctrl+Alt+Enter)'],
    ['@removeRow', '-\\,\\text{fila}', 'Quitar fila'],
    ['@removeColumn', '-\\,\\text{col}', 'Quitar columna'],
    ['^{\\top}', 'A^{\\top}', 'Traspuesta (TT)'],
    ['^{-1}', 'A^{-1}', 'Inversa (inv)'],
    ['\\cdot', '\\vec a\\cdot\\vec b', 'Producto escalar (punto): a · b. Entre matrices, producto común'],
    ['\\times', '\\vec a\\times\\vec b', 'Producto vectorial (cruz): a × b, vectores de 3 componentes'],
    ['\\left|#0\\right|', '|\\vec v|', 'Módulo de un vector'],
    ['\\det\\left(#0\\right)', '\\det', 'Determinante'],
    ['\\operatorname{tr}\\left(#0\\right)', '\\operatorname{tr}', 'Traza'],
  ]],
  ['Unidades', [
    ['\\mathrm{kN}', '\\mathrm{kN}', 'kilonewton'],
    ['\\mathrm{N}', '\\mathrm{N}', 'newton'],
    ['\\mathrm{kgf}', '\\mathrm{kgf}', 'kilogramo fuerza'],
    ['\\mathrm{tf}', '\\mathrm{tf}', 'tonelada fuerza'],
    ['\\mathrm{MPa}', '\\mathrm{MPa}', 'megapascal'],
    ['\\mathrm{kPa}', '\\mathrm{kPa}', 'kilopascal'],
    ['\\mathrm{GPa}', '\\mathrm{GPa}', 'gigapascal'],
    ['\\mathrm{m}', '\\mathrm{m}', 'metro'],
    ['\\mathrm{cm}', '\\mathrm{cm}', 'centímetro'],
    ['\\mathrm{mm}', '\\mathrm{mm}', 'milímetro'],
    ['\\mathrm{cm}^2', '\\mathrm{cm}^2', 'cm²'],
    ['\\mathrm{m}^2', '\\mathrm{m}^2', 'm²'],
    ['\\mathrm{m}^3', '\\mathrm{m}^3', 'm³'],
    ['\\mathrm{cm}^4', '\\mathrm{cm}^4', 'cm⁴ (inercia)'],
    ['\\frac{\\mathrm{kN}}{\\mathrm{m}}', '\\frac{\\mathrm{kN}}{\\mathrm{m}}', 'kN/m'],
    ['\\frac{\\mathrm{kN}}{\\mathrm{m}^3}', '\\frac{\\mathrm{kN}}{\\mathrm{m}^3}', 'kN/m³'],
    ['\\mathrm{kN}\\cdot\\mathrm{m}', '\\mathrm{kN{\\cdot}m}', 'kN·m'],
    ['\\mathrm{kg}', '\\mathrm{kg}', 'kilogramo'],
    ['\\mathrm{s}', '\\mathrm{s}', 'segundo'],
    ['\\degree', '^{\\circ}', 'grados'],
    ['\\mathrm{rad}', '\\mathrm{rad}', 'radianes'],
  ]],
];

const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};

export function createSymbolPanel(host) {
  const el = document.createElement('section');
  el.className = 'sym-panel';
  el.hidden = true;
  el.setAttribute('aria-label', 'Símbolos para ecuaciones');
  // Dos cuadros a la vez: símbolos arriba y estructuras (matrices, fracciones, integrales…) abajo
  const TOP = [[0, 'Griegas'], [3, 'Operadores'], [5, 'Unidades']];
  const BOTTOM = [[4, 'Matrices'], [1, 'Básicas'], [2, 'Cálculo']];
  let tabTop = Math.min(ls.get('cuaderno.sym.top', 0), TOP.length - 1);
  let tabBot = Math.min(ls.get('cuaderno.sym.bottom', 0), BOTTOM.length - 1);
  let collapsed = ls.get('cuaderno.sym.collapsed', false);
  let active = null;

  const esc = (s) => s.replace(/"/g, '&quot;');
  const box = (title, list, cur, which, small) => {
    const g = list[cur][0];
    return `<div class="sym-box">
      <div class="sym-box-title">${title}</div>
      <div class="sym-tabs" role="tablist">${list.map(([, name], i) => `<button type="button" role="tab" class="sym-tab${i === cur ? ' on' : ''}" data-tab="${which}:${i}" aria-selected="${i === cur}">${name}</button>`).join('')}</div>
      <div class="sym-grid${small ? ' small' : ''}">${GROUPS[g][1].map(([ins, show, t], i) => `<button type="button" class="sym-btn" data-g="${g}" data-i="${i}" title="${esc(t || show.replace(/\\/g, ''))}">${renderLatex(show, false)}</button>`).join('')}</div>
    </div>`;
  };
  function render() {
    el.classList.toggle('collapsed', collapsed);
    el.innerHTML = `
      <div class="sym-head">
        <span class="sym-title">Ecuación</span>
        <button type="button" class="sym-x" data-toggle title="${collapsed ? 'Mostrar símbolos y estructuras' : 'Cerrar (las ecuaciones se siguen escribiendo con el teclado)'}" aria-label="${collapsed ? 'Mostrar' : 'Cerrar'}">${collapsed ? '▸' : '×'}</button>
      </div>
      ${collapsed ? '' : `
      ${box('Símbolos', TOP, tabTop, 'top', TOP[tabTop][0] !== 5)}
      ${box('Estructuras', BOTTOM, tabBot, 'bottom', false)}
      <p class="sym-hint">Los botones insertan en la ecuación activa. Con el teclado: <code>mat2</code>, <code>sigma</code>, <code>/</code>, <code>^</code>, <code>_</code>. Entre celdas de una matriz: flechas.</p>`}`;
  }

  // Mantener el foco en la ecuación mientras se usan los botones
  el.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-toggle]')) {
      collapsed = !collapsed;
      ls.set('cuaderno.sym.collapsed', collapsed);
      render();
      return;
    }
    const t = e.target.closest('[data-tab]');
    if (t) {
      const [which, i] = t.dataset.tab.split(':');
      if (which === 'top') { tabTop = Number(i); ls.set('cuaderno.sym.top', tabTop); } else { tabBot = Number(i); ls.set('cuaderno.sym.bottom', tabBot); }
      render();
      return;
    }
    const b = e.target.closest('[data-i]');
    if (b && active) {
      const ins = GROUPS[Number(b.dataset.g)][1][Number(b.dataset.i)][0];
      if (ins.startsWith('@')) active.executeCommand(ins.slice(1));
      else active.insert(ins, { focus: true, selectionMode: 'placeholder' });
      active.focus();
    }
  });

  document.addEventListener('focusin', (e) => {
    if (e.target && e.target.tagName === 'MATH-FIELD') {
      active = e.target;
      if (el.hidden) { render(); el.hidden = false; }
    }
  });
  document.addEventListener('focusout', (e) => {
    if (e.target !== active) return;
    setTimeout(() => {
      const a = document.activeElement;
      if (a && a.tagName === 'MATH-FIELD') return;
      active = null;
      el.hidden = true;
    }, 200);
  });

  host.prepend(el);
  return el;
}
