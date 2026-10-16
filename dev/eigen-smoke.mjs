// Prueba del bloque "Tensiones principales": node dev/eigen-smoke.mjs <url> <capturas>
import puppeteer from 'puppeteer-core';
const [url = 'http://localhost:5179/', shots = '.'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', userDataDir: process.env.PROFILE, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1100 });
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md = () => page.evaluate(() => window.cuaderno.editor.getMarkdown());

const doc = String.raw`# Tensiones principales

$$
\sigma\coloneq\begin{bmatrix}18 & 0 & 24\\ 0 & -50 & 0\\ 24 & 0 & 32\end{bmatrix}MPa
$$

` + '```autovalores\nmatriz: \\sigma\nvalores: λ\nvectores: n\n```' + String.raw`

$$
\lambda_{1}=
$$

$$
\sigma\cdot n_{1}=
$$

$$
\operatorname{autovalores}\left(\sigma\right)=
$$
`;
await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(async (text) => {
  const root = await navigator.storage.getDirectory();
  for await (const [name] of root.entries()) await root.removeEntry(name, { recursive: true });
  const top = await root.getDirectoryHandle('Notas', { create: true });
  const fh = await (await top.getDirectoryHandle('Posgrado', { create: true })).getFileHandle('Principales.md', { create: true });
  const w = await fh.createWritable(); await w.write(text); await w.close();
  const db = await new Promise((res) => { const r = indexedDB.open('cuaderno', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); });
  await new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(top, 'root'); tx.oncomplete = res; });
  localStorage.clear();
  localStorage.setItem('cuaderno.last', JSON.stringify(['Posgrado', 'Principales.md']));
}, doc);
await page.reload({ waitUntil: 'networkidle0' });
await wait(3000);
console.log('ABRIÓ:', await page.$eval('#crumbs', (e) => e.innerText.replace(/\s+/g, ' ')));
console.log('ECUACIÓN CARACTERÍSTICA:', await page.$eval('.eg-line', (e) => e.textContent.replace(/\s+/g, ' ').slice(0, 90)).catch(() => 'no'));
console.log('TABLA:', await page.$$eval('.eg-table tbody tr', (rows) => rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim().slice(0, 70))));
console.log('RESULTADOS ABAJO:', await page.$$eval('.math-result', (els) => els.map((e) => e.textContent.trim().slice(0, 50)).filter(Boolean)));
await page.screenshot({ path: `${shots}/eigen.png` });
const saved = await md();
await page.reload({ waitUntil: 'networkidle0' });
await wait(2500);
console.log('IDA Y VUELTA IDÉNTICA:', (await md()) === saved);
console.log('PROBLEMAS:', problems.length ? problems : 'ninguno');
await browser.close();
