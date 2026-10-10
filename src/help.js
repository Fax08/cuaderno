// Ayuda: atajos del editor, de las ecuaciones y del cálculo.
import { renderLatex } from './math-nodes.js';

const ex = (latex) => `<span class="help-math">${renderLatex(latex, false)}</span>`;

const SECTIONS = [
  ['General', [
    ['<kbd>Ctrl</kbd>+<kbd>P</kbd>', 'Buscar en todas las notas. Al abrir un resultado queda marcado el texto encontrado.'],
    ['<b>+</b> en el árbol', 'Agrega una página con plantilla (clase, apunte, vocabulario, gramática, trabajo…) o una carpeta.'],
    ['⌂ en el árbol', 'Portada de la carpeta: entregas, dudas abiertas, clases y repaso de vocabulario.'],
    ['Guardado', 'Automático. <kbd>Ctrl</kbd>+<kbd>S</kbd> guarda al instante.'],
  ]],
  ['Insertar', [
    ['<kbd>/</kbd>', 'Menú para insertar: títulos, ecuación, gráfico, tabla, imagen, video…'],
    ['<b>A▾</b> en la barra', 'Color de letra y resaltado del texto seleccionado.'],
    ['<kbd>Ctrl</kbd>+<kbd>M</kbd>', 'Ecuación dentro del texto. También escribiendo <code>$x^2$</code>.'],
    ['<kbd>$$</kbd> + espacio', 'Ecuación aparte, en su propia línea (o <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd>).'],
    ['<kbd>#</kbd> <kbd>##</kbd> <kbd>###</kbd> + espacio', 'Títulos 1, 2 y 3. Arman el índice de la derecha.'],
    ['<kbd>Ctrl</kbd>+<kbd>V</kbd>', 'Pega una captura de pantalla como imagen.'],
    ['<kbd>Ctrl</kbd>+<kbd>K</kbd>', 'Link. <kbd>Ctrl</kbd>+clic lo abre.'],
  ]],
  ['Dentro de una ecuación', [
    ['<code>sigma</code> <code>tau</code> <code>alpha</code>…', `Letras griegas por su nombre: ${ex('\\sigma\\ \\tau\\ \\alpha\\ \\Delta')}. Cortos: <code>sig</code> <code>eps</code> <code>lam</code> <code>gam</code> <code>the</code>.`],
    ['<kbd>_</kbd> y <kbd>^</kbd>', `Subíndice y superíndice: ${ex('\\sigma_{xy}\\quad L^{2}')}. Flecha → para salir.`],
    ['<kbd>/</kbd>', `Fracción: ${ex('\\frac{P}{A}')}`],
    ['<code>sqrt</code> <code>xx</code> <code>*</code>', `Raíz ${ex('\\sqrt{x}')}, por ${ex('\\times')}, producto ${ex('\\cdot')}`],
    ['<code>mat2</code> <code>mat3</code>', `Matriz 2×2 o 3×3 ${ex('\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}')}. <code>vec2</code> <code>vec3</code> para vectores.`],
    ['<kbd>Alt</kbd>+<kbd>Enter</kbd>', 'Agrega una fila a la matriz. <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Enter</kbd> agrega una columna. Clic derecho para más opciones.'],
    ['<code>TT</code> <code>inv</code>', `Traspuesta ${ex('K^{\\top}')} e inversa ${ex('K^{-1}')}`],
    ['<kbd>Enter</kbd> <kbd>Esc</kbd>', 'Terminar la ecuación. <kbd>Shift</kbd>+<kbd>Enter</kbd> crea otra ecuación debajo.'],
    ['Fórmulas bloqueadas', 'Con el botón 🔒 de la barra activado, un clic solo selecciona la fórmula; para editarla, doble clic o <kbd>Enter</kbd>. Desactivado, un clic la abre.'],
  ]],
  ['Calcular como en MathCad', [
    ['<code>:=</code>', `Define una variable: ${ex('P \\coloneq 50\\,\\mathrm{kN}')} o a partir de otras ${ex('\\sigma \\coloneq \\frac{P}{A}')}`],
    ['<code>=</code> al final', `Muestra el resultado: ${ex('\\sigma = 25\\,\\mathrm{MPa}')}`],
    ['<code>= MPa</code>', `Convierte a esa unidad: ${ex('\\sigma = \\mathrm{kPa}')} muestra 25000 kPa.`],
    ['<code>:= … =</code>', `Define y muestra a la vez: ${ex('M_{max} \\coloneq \\frac{qL^2}{8} =')}`],
    ['Funciones', `${ex('M(x) \\coloneq \\frac{qx}{2}(L-x)')} y después ${ex('M(2\\,\\mathrm{m}) =')}`],
    ['Unidades', 'kN, MPa, kPa, GPa, cm, mm, m, kg, kgf, tf, s, deg (o <code>30deg</code> → 30°). Se escriben pegadas al número: <code>20cm^2</code>.'],
    ['Matrices', `${ex('K^{-1}=')} ${ex('\\det(K)=')} ${ex('K^{\\top}=')} ${ex('u \\coloneq K^{-1}\\cdot F =')}`],
    ['Orden', 'Se calcula de arriba hacia abajo: usá una variable después de definirla.'],
    ['Sin “=”', 'Una ecuación sin “:=” ni “=” al final es solo una fórmula escrita; no se calcula.'],
  ]],
  ['Repaso de vocabulario', [
    ['Tablas', 'Cada fila de una tabla en una página de vocabulario es una tarjeta: 1.ª columna frente, 2.ª respuesta, 3.ª ejemplo, 4.ª notas.'],
    ['<kbd>Espacio</kbd>', 'Muestra la respuesta. Después <kbd>1</kbd> otra vez, <kbd>2</kbd> difícil, <kbd>3</kbd> bien, <kbd>4</kbd> fácil.'],
    ['Repetición espaciada', 'Las tarjetas que sabés aparecen cada vez más espaciadas; las que fallás vuelven pronto. Hasta 20 nuevas por día.'],
  ]],
  ['Gráficos', [
    ['<code>/gráfico</code>', 'Gráfico 2D con varias curvas y(x), o 3D con una superficie z(x, y).'],
    ['Variables', 'Las curvas pueden usar lo definido arriba: si definiste M(x), graficá M(x) de 0 a L.'],
  ]],
];

export function showHelp() {
  const dlg = document.createElement('dialog');
  dlg.className = 'dialog help';
  dlg.innerHTML = `<div class="help-body">
    <div class="help-top"><h2>Atajos y cálculo</h2><button type="button" class="icon-btn" data-close aria-label="Cerrar">×</button></div>
    ${SECTIONS.map(([title, rows]) => `<section><h3>${title}</h3><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></section>`).join('')}
  </div>`;
  document.body.appendChild(dlg);
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.querySelector('[data-close]').addEventListener('click', close);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}
