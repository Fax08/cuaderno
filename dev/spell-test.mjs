// Prueba del corrector (worker) en Node: node dev/spell-test.mjs
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const replies = [];
globalThis.self = { postMessage: (m) => replies.push(m) };
// fetch de archivos locales para el worker
globalThis.fetch = async (p) => ({ text: async () => readFileSync(p, 'utf8') });
await import(pathToFileURL('src/spell-worker.js').href);
const send = async (m) => { replies.length = 0; await self.onmessage({ data: m }); return replies[0]; };
const dict = (c) => ({ aff: `node_modules/dictionary-${c}/index.aff`, dic: `node_modules/dictionary-${c}/index.dic` });

const t0 = performance.now();
await send({ type: 'init', id: 1, langs: { es: dict('es'), en: dict('en'), de: dict('de') }, personal: ['Timoshenko'] });
console.log(`carga de es+en+de: ${(performance.now() - t0).toFixed(0)} ms`);

const words = ['ecuación', 'deformación', 'Ecuación', 'tensiones', 'strength', 'deflection', 'Spannung', 'Brückenbau', 'Festigkeitslehre', 'Spannungsverteilung', 'Timoshenko',
  'ecuasion', 'estructurra', 'deformasion', 'resistensia', 'stregth', 'Spanung', 'Brükenbau'];
const r = await send({ type: 'check', id: 2, words });
const bad = new Set(r.bad);
for (const w of words) {
  let line = `${bad.has(w) ? 'MAL' : 'ok '} ${w}`;
  if (bad.has(w)) line += `  → ${(await send({ type: 'suggest', id: 3, word: w })).list.join(', ')}`;
  console.log(line);
}
