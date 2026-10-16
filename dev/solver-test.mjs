// Pruebas del bloque Resolver: node dev/solver-test.mjs
import { solveBlock, defTarget } from '../src/calc.js';

const stmt = (latex) => ({ latex, target: defTarget(latex) });
let fails = 0;
function check(label, res, test) {
  const ok = test(res);
  if (!ok) fails++;
  const sols = res.solutions ? res.solutions.map((x) => `(${x.map((v) => +v.toFixed(4)).join(', ')})`).join('  ') : '';
  console.log(`${ok ? 'ok ' : 'MAL'} ${label}\n     ${res.error ? `error: ${res.error}` : `soluciones: ${sols}${res.warning ? `\n     aviso: ${res.warning}` : ''}`}`);
}
const near = (x, y) => x.every((v, i) => Math.abs(v - y[i]) < 1e-6);

// El problema del usuario: J(t)·d = 0 con d unitario
const page = [
  String.raw`J\coloneq\begin{bmatrix}t & 2 & 1\\ 2 & 0 & 2\\ 1 & 2 & 0\end{bmatrix}`,
  String.raw`d\coloneq\begin{bmatrix}a\\ b\\ c\end{bmatrix}`,
].map(stmt);
const r1 = solveBlock({ vars: 't = 1, a = 1, b = 1, c = 1', eqs: [String.raw`\det\left(J\right)=0`, String.raw`J\cdot d=0`, String.raw`a^2+b^2+c^2=1`] }, page, new Map());
check('J·d = 0, det(J) = 0, |d| = 1  →  t = 2, d = ±(2, −1, −2)/3', r1, (r) => r.ok && r.solutions.length === 2
  && r.solutions.some((x) => near(x, [2, 2 / 3, -1 / 3, -2 / 3])) && r.solutions.some((x) => near(x, [2, -2 / 3, 1 / 3, 2 / 3])));

// Elegir la segunda solución
const r1b = solveBlock({ vars: 't = 1, a = 1, b = 1, c = 1', eqs: [String.raw`J\cdot d=0`, String.raw`a^2+b^2+c^2=1`, String.raw`\det\left(J\right)=0`], usar: '2' }, page, new Map());
check('elegir la solución 2', r1b, (r) => r.ok && r.chosen === 1 && near(r.values.map((v) => v.value), r.solutions[1]));

// Con =0 (el planteo equivocado) la única solución es la trivial
const r2 = solveBlock({ vars: 't = 1, a = 1, b = 1, c = 1', eqs: [String.raw`J\cdot d=0`, String.raw`a^2+b^2+c^2=0`] }, page, new Map());
check('a²+b²+c² = 0 → solo a = b = c = 0 (t libre)', r2, (r) => r.ok && r.solutions.every((x) => near(x.slice(1), [0, 0, 0])));

// Sistema no lineal clásico: círculo y recta
const r3 = solveBlock({ vars: 'x = 1, y = 0', eqs: ['x^2+y^2=25', 'y=x+1'] }, [], new Map());
check('x² + y² = 25, y = x + 1 → (3, 4) y (−4, −3)', r3, (r) => r.ok && r.solutions.length === 2
  && r.solutions.some((x) => near(x, [3, 4])) && r.solutions.some((x) => near(x, [-4, -3])));

// Con unidades: equilibrio de una viga
const beam = [String.raw`L\coloneq6m`, String.raw`P\coloneq30kN`].map(stmt);
const r4 = solveBlock({ vars: 'R_A = 1 kN, R_B = 1 kN', eqs: ['R_A+R_B=P', String.raw`R_B\cdot L=P\cdot2m`] }, beam, new Map());
check('reacciones con unidades: R_A = 20 kN, R_B = 10 kN', r4, (r) => r.ok && near(r.values.map((v) => v.value.toNumber('kN')), [20, 10]));
let r4b;
try { r4b = solveBlock({ vars: 'R_A = 1, R_B = 1', eqs: ['R_A+R_B=P'] }, beam, new Map()); } catch (e) { r4b = { error: e.message }; }
check('sin unidad en el valor inicial → aviso claro', r4b, (r) => /ponéselas en el valor inicial/.test(r.error || ''));

// Letras griegas en las incógnitas
const r5 = solveBlock({ vars: 'θ = 0.5', eqs: [String.raw`\sin\theta=0.5`] }, [], new Map());
check('sin θ = 0.5 cerca de 0.5 rad → 0.5236 primero', r5, (r) => r.ok && Math.abs(r.values[0].value - Math.PI / 6) < 1e-6);

// Sin solución
const r6 = solveBlock({ vars: 'x = 1', eqs: ['x^2=-1'] }, [], new Map());
check('x² = −1 → sin solución real', r6, (r) => !r.ok && /No encontré/.test(r.error));

console.log(fails ? `\n${fails} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fails ? 1 : 0);
