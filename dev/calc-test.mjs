// Pruebas del motor de cálculo: node dev/calc-test.mjs
import { Ctx, runStatement, samplePlot } from '../src/calc.js';

const ctx = new Ctx();
let fails = 0;
// [latex, esperado]: 'def', 'null', 'error', o el texto del resultado en LaTeX
const cases = [
  ['P\\coloneq50\\mathrm{kN}', 'def'],
  ['A\\coloneq20cm^2', 'def'],
  ['\\sigma\\coloneq\\frac{P}{A}', 'def'],
  ['\\sigma=', '25\\,\\mathrm{MPa}'],
  ['\\sigma=kPa', '25000\\,\\mathrm{kPa}'],
  ['\\frac{P}{A}=', '25\\,\\mathrm{MPa}'],
  ['50kN', 'null'],
  ['F=ma', 'null'],
  ['\\sigma_{x}\\coloneq120\\mathrm{MPa}', 'def'],
  ['\\tau_{xy}\\coloneq40MPa', 'def'],
  ['\\sigma_{1}\\coloneq\\frac{\\sigma_{x}}{2}+\\sqrt{\\left(\\frac{\\sigma_{x}}{2}\\right)^2+\\tau_{xy}^2}=', '132.1\\,\\mathrm{MPa}'],
  ['L\\coloneq6m', 'def'],
  ['q\\coloneq12\\frac{kN}{m}', 'def'],
  ['q=', '12\\,\\mathrm{kN}/\\mathrm{m}'],
  ['M_{\\max}\\coloneq\\frac{qL^2}{8}=', '54\\,\\mathrm{kN}{\\cdot}\\mathrm{m}'],
  ['\\sigma_{f}\\coloneq\\frac{M_{max}}{W}', 'error'], // W sin definir: no tiene que tomarse como watt
  ['W\\coloneq400cm^3', 'def'],
  ['\\sigma_{f}\\coloneq\\frac{M_{max}}{W}=', '135\\,\\mathrm{MPa}'],
  ['g\\coloneq9.81m/s^2', 'def'],
  ['g=', '9.81\\,\\mathrm{m}/\\mathrm{s}^{2}'],
  ['\\gamma\\coloneq18\\frac{kN}{m^3}', 'def'],
  ['\\gamma=', '18\\,\\mathrm{kN}/\\mathrm{m}^{3}'],
  ['M\\left(x\\right)\\coloneq\\frac{qx}{2}\\left(L-x\\right)', 'def'],
  ['M\\left(3m\\right)=', '54\\,\\mathrm{kN}{\\cdot}\\mathrm{m}'],
  ['M(2m)=kN\\cdot m', '48\\,\\mathrm{kN}{\\cdot}\\mathrm{m}'],
  ['K\\coloneq\\begin{bmatrix}4 & -2\\\\ -2 & 4\\end{bmatrix}', 'def'],
  ['K^{-1}=', '\\begin{bmatrix} 0.3333 & 0.1667 \\\\ 0.1667 & 0.3333 \\end{bmatrix}'],
  ['\\det\\left(K\\right)=', '12'],
  ['F\\coloneq\\begin{bmatrix}10\\\\ 0\\end{bmatrix}', 'def'],
  ['u\\coloneq K^{-1}\\cdot F=', '\\begin{bmatrix} 3.333 \\\\ 1.667 \\end{bmatrix}'],
  ['\\sin\\left(30\\degree\\right)=', '0.5'],
  ['\\theta\\coloneq45^{\\circ}', 'def'],
  ['\\cos\\theta=', '0.7071'],
  ['\\theta=', '45^{\\circ}'],
  ['x\\coloneq P+L', 'error'],
  ['y=', 'error'],
  ['\\int_0^1x\\,dx=', 'error'],
  ['E\\coloneq200GPa', 'def'],
  ['I\\coloneq8000cm^4', 'def'],
  ['\\delta\\coloneq\\frac{5qL^4}{384EI}=mm', '12.66\\,\\mathrm{mm}'],
  ['N\\coloneq3', 'def'],
  ['2N=', '6'], // N definida como variable gana sobre newton
  ['F_{1}\\coloneq50N=', '150'], // con N definida, 50N es 50·N (como en MathCad)
  ['F_{2}\\coloneq50\\mathrm{N}=', '150'],
  ['T\\coloneq2s', 'def'],
  ['S\\coloneq\\begin{bmatrix}1 & 2\\\\ 3 & 4\\end{bmatrix}', 'def'],
  ["S'\\coloneq S^{\\top}", 'def'],
  ["\\operatorname{tr}\\left(S'\\right)=", '5'],
  ['S^{\\prime}=', '\\begin{bmatrix} 1 & 3 \\\\ 2 & 4 \\end{bmatrix}'],
  ["\\sigma'_{x}\\coloneq3MPa", 'def'],
  ["2\\sigma'_{x}=", '6\\,\\mathrm{MPa}'],
  ["z'=", 'error'],
  // trigonometría
  ['\\tan45^{\\circ}=', '1'],
  ['\\tan45\\degree=', '1'],
  ['\\phi\\coloneq30\\degree', 'def'],
  ['\\sin^2\\phi+\\cos^2\\phi=', '1'],
  ['\\sin^{2}\\left(\\phi\\right)=', '0.25'],
  ['\\sin^{-1}\\left(0.5\\right)=deg', '30^{\\circ}'],
  ['\\arcsin\\left(0.5\\right)=deg', '30^{\\circ}'],
  ['\\arctan\\left(\\frac{3}{4}\\right)=deg', '36.87^{\\circ}'],
  ['\\operatorname{atan2}\\left(3,4\\right)=deg', '36.87^{\\circ}'],
  ['\\cos\\left(\\frac{\\pi}{3}\\right)=', '0.5'],
  ['\\sin\\left(\\frac{\\pi}{2}\\right)\\cdot\\cos0=', '1'],
  // autovalores / autovectores (tensiones y direcciones principales)
  ['T_{s}\\coloneq\\begin{bmatrix}18 & 0 & 24\\\\ 0 & -50 & 0\\\\ 24 & 0 & 32\\end{bmatrix}', 'def'],
  ['\\operatorname{autovalores}\\left(T_{s}\\right)=', '\\begin{bmatrix} 50 \\\\ 0 \\\\ -50 \\end{bmatrix}'],
  ['autovalores\\left(T_{s}\\right)=', '\\begin{bmatrix} 50 \\\\ 0 \\\\ -50 \\end{bmatrix}'],
  ['\\operatorname{autovectores}\\left(T_{s}\\right)=', '\\begin{bmatrix} 0.6 & 0.8 & 0 \\\\ 0 & 0 & 1 \\\\ 0.8 & -0.6 & 0 \\end{bmatrix}'],
  ['\\operatorname{principales}\\left(T_{s}\\right)=', '\\begin{bmatrix} 50 & 0 & 0 \\\\ 0 & 0 & 0 \\\\ 0 & 0 & -50 \\end{bmatrix}'],
  ['T_{u}\\coloneq\\begin{bmatrix}18 & 0 & 24\\\\ 0 & -50 & 0\\\\ 24 & 0 & 32\\end{bmatrix}MPa', 'def'],
  ['\\operatorname{autovalores}\\left(T_{u}\\right)=', '\\begin{bmatrix} 50 \\\\ 0 \\\\ -50 \\end{bmatrix}\\,\\mathrm{MPa}'],
  ['\\operatorname{autovalores}\\left(\\begin{bmatrix}18 & 0 & 24\\\\ 0 & -50 & 0\\\\ 0 & 0 & 32\\end{bmatrix}\\right)=', '\\begin{bmatrix} 32 \\\\ 18 \\\\ -50 \\end{bmatrix}'],
  // vectores: producto escalar (·), vectorial (×) y módulo
  ['a\\coloneq\\begin{bmatrix}1\\\\ 2\\\\ 3\\end{bmatrix}', 'def'],
  ['b\\coloneq\\begin{bmatrix}4\\\\ 5\\\\ 6\\end{bmatrix}', 'def'],
  ['a\\cdot b=', '32'],
  ['a\\times b=', '\\begin{bmatrix} -3 \\\\ 6 \\\\ -3 \\end{bmatrix}'],
  ['\\left|a\\right|=', '3.742'],
  ['\\left\\Vert b\\right\\Vert=', '8.775'],
  ['c\\coloneq a\\times b', 'def'],
  ['a\\cdot c=', '0'],
  ['2\\times3+\\left|-4\\right|=', '10'],
  ['r\\coloneq\\begin{bmatrix}2m\\\\ 0m\\\\ 0m\\end{bmatrix}', 'def'],
  ['F_{v}\\coloneq\\begin{bmatrix}0kN\\\\ 5kN\\\\ 0kN\\end{bmatrix}', 'def'],
  ['M_{v}\\coloneq r\\times F_{v}=', '\\begin{bmatrix} 0 \\\\ 0 \\\\ 10 \\end{bmatrix}\\,\\mathrm{kN}{\\cdot}\\mathrm{m}'],
  ['W_{F}\\coloneq F_{v}\\cdot r=', '0\\,\\mathrm{kN}{\\cdot}\\mathrm{m}'],
  ['\\begin{bmatrix}1 & 2\\end{bmatrix}\\times\\begin{bmatrix}1 & 2\\end{bmatrix}=', 'error'],
  ['u_{2}\\coloneq K^{-1}\\cdot F=', '\\begin{bmatrix} 3.333 \\\\ 1.667 \\end{bmatrix}'],
  ['F_{3}\\coloneq50kN\\cdot2m=', '100\\,\\mathrm{kN}{\\cdot}\\mathrm{m}'],
];
for (const [latex, expect] of cases) {
  const r = runStatement(latex, ctx);
  const got = r === null ? 'null' : r.error ? 'error' : (r.latex ?? r.kind);
  const ok = got === expect;
  if (!ok) fails++;
  console.log(`${ok ? 'ok ' : 'MAL'} ${latex.padEnd(64)} → ${r && r.error ? `error: ${r.error}` : got}${ok ? '' : `   (esperado ${expect})`}`);
}
const p = samplePlot({ tipo: '2d', exprs: ['M\\left(x\\right)'], xmin: '0', xmax: 'L' }, ctx);
const pOk = p.xUnit === 'm' && Math.abs(Math.max(...p.traces[0].y) - 54) < 1e-6;
if (!pOk) fails++;
console.log(`${pOk ? 'ok ' : 'MAL'} gráfico M(x) de 0 a L: unidades ${p.xUnit} / ${p.yUnit}, máximo ${Math.max(...p.traces[0].y)}`);
console.log(fails ? `\n${fails} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fails ? 1 : 0);
