// Prueba de la vista de unidades rectas: node dev/units-test.mjs
import { readFileSync } from 'node:fs';
import { TARGET_UNITS, SINGLE_UNITS } from '../src/calc.js';

const src = readFileSync(new URL('../src/math-nodes.js', import.meta.url), 'utf8');
const body = /export function uprightUnits[\s\S]*?\n}\n/.exec(src)[0].replace('export ', '');
const uprightUnits = new Function('TARGET_UNITS', 'SINGLE_UNITS', `${body}; return uprightUnits;`)(TARGET_UNITS, SINGLE_UNITS);

const cases = [
  ['L\\coloneq6m', 'L\\coloneq6\\mathrm{m}'],
  ['q\\coloneq12\\frac{kN}{m}', 'q\\coloneq12\\frac{\\mathrm{kN}}{\\mathrm{m}}'],
  ['M_{max}\\coloneq\\frac{qL^2}{8}=', 'M_{max}\\coloneq\\frac{qL^2}{8}='],
  ['M(2m)=kN\\cdot m', 'M(2\\mathrm{m})=\\mathrm{kN}\\cdot \\mathrm{m}'],
  ['g\\coloneq9.81m/s^2', 'g\\coloneq9.81\\mathrm{m}/\\mathrm{s}^2'],
  ['A\\coloneq20cm^2', 'A\\coloneq20\\mathrm{cm}^2'],
  ['\\sigma_{min}\\coloneq3MPa', '\\sigma_{min}\\coloneq3\\mathrm{MPa}'],
  ['\\sin\\theta', '\\sin\\theta'],
  ['\\gamma\\coloneq18\\frac{kN}{m^3}', '\\gamma\\coloneq18\\frac{\\mathrm{kN}}{\\mathrm{m}^3}'],
  ['\\sigma\\coloneq\\frac{M}{W}', '\\sigma\\coloneq\\frac{M}{W}'],
  ['P\\coloneq50\\mathrm{kN}', 'P\\coloneq50\\mathrm{kN}'],
];
let fails = 0;
for (const [input, expect] of cases) {
  const got = uprightUnits(input);
  const ok = got === expect;
  if (!ok) fails++;
  console.log(`${ok ? 'ok ' : 'MAL'} ${input.padEnd(36)} → ${got}${ok ? '' : `   (esperado ${expect})`}`);
}
process.exit(fails ? 1 : 0);
