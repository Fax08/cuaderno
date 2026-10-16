// Prueba del bloque Resolver en la app: node dev/solver-smoke.mjs <url> <capturas>
import puppeteer from 'puppeteer-core';
const [url = 'http://localhost:5179/', shots = '.'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', userDataDir: process.env.PROFILE, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000 });
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md = () => page.evaluate(() => window.cuaderno.editor.getMarkdown());

const doc = String.raw`# Núcleo de J

$$
J\coloneq\begin{bmatrix}t & 2 & 1\\ 2 & 0 & 2\\ 1 & 2 & 0\end{bmatrix}
$$

$$
d\coloneq\begin{bmatrix}a\\ b\\ c\end{bmatrix}
$$

` + '```resolver\nincognitas: t = 1, a = 1, b = 1, c = 1\nec: \\det\\left(J\\right)=0\nec: J\\cdot d=0\nec: a^2+b^2+c^2=1\n```' + String.raw`

$$
m\coloneq J\cdot d=
$$

$$
t=
$$
`;
await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(async (text) => {
  const root = await navigator.storage.getDirectory();
  for await (const [name] of root.entries()) await root.removeEntry(name, { recursive: true });
  const top = await root.getDirectoryHandle('Notas', { create: true });
  const fh = await (await top.getDirectoryHandle('Posgrado', { create: true })).getFileHandle('Nucleo.md', { create: true });
  const w = await fh.createWritable(); await w.write(text); await w.close();
  const db = await new Promise((res) => { const r = indexedDB.open('cuaderno', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); });
  await new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(top, 'root'); tx.oncomplete = res; });
  localStorage.clear();
  localStorage.setItem('cuaderno.last', JSON.stringify(['Posgrado', 'Nucleo.md']));
}, doc);
await page.reload({ waitUntil: 'networkidle0' });
await wait(3000);
console.log('DEPURAR:', await page.evaluate(() => ({ crumbs: document.getElementById('crumbs').innerText, tipos: (() => { const o = []; window.cuaderno?.editor.state.doc.forEach((n) => o.push(n.type.name)); return o; })(), gate: document.getElementById('gate').hidden })), problems);
console.log('TOAST:', await page.$eval('.toast', (t) => t.textContent).catch(() => ''));
console.log('MOTOR:', await page.evaluate(async () => {
  try { const m = await import('/src/calc.js'); m.engine.run(window.cuaderno.editor.state.doc); return `ok ${m.engine.results.size}`; } catch (e) { return `ERROR ${e.message} | ${String(e.stack).split(String.fromCharCode(10)).slice(0, 4).join(' / ')}`; }
}));
console.log('RESUMEN:', await page.$eval('.sv-summary', (e) => e.textContent).catch(() => 'sin resumen'));
console.log('TABLA:', await page.$$eval('.sv-table tbody tr', (rows) => rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim())));
console.log('RESULTADOS DE LA PÁGINA:', await page.$$eval('.math-result', (els) => els.map((e) => e.textContent.trim().slice(0, 60)).filter(Boolean)));
await page.screenshot({ path: `${shots}/solver.png`, fullPage: false });

// Elegir la otra solución
await page.click('.sv-table input[value="1"]');
await wait(1500);
console.log('AL ELEGIR LA 2.ª:', await page.$$eval('.sv-table tbody tr.on', (rows) => rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim())), '| guardado:', (await md()).includes('usar: 2'));
const saved = await md();
await page.reload({ waitUntil: 'networkidle0' });
await wait(2500);
console.log('IDA Y VUELTA IDÉNTICA:', (await md()) === saved);
console.log('PROBLEMAS:', problems.length ? problems : 'ninguno');
await browser.close();
