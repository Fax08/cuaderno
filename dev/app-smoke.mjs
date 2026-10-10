// Prueba de la app completa con una carpeta simulada (OPFS de Chrome):
//   node dev/app-smoke.mjs <url> <carpeta-capturas>
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://localhost:5179/';
const shots = process.argv[3] || '.';
const browser = await puppeteer.launch({
  executablePath: process.env.BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  userDataDir: process.env.PROFILE,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) problems.push(`HTTP ${r.status()} ${r.url()}`); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(url, { waitUntil: 'networkidle0' });

// Carpeta simulada con una materia de ejemplo
const inTwoDays = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
await page.evaluate(async (entrega) => {
  const root = await navigator.storage.getDirectory();
  for await (const [name] of root.entries()) await root.removeEntry(name, { recursive: true });
  const posgrado = await root.getDirectoryHandle('Posgrado', { create: true });
  const write = async (dir, name, text) => { const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(text); await w.close(); };
  const m = await posgrado.getDirectoryHandle('Mecánica del Continuo', { create: true });
  const clases = await m.getDirectoryHandle('Clases', { create: true });
  const dudas = await m.getDirectoryHandle('Dudas', { create: true });
  const temario = await m.getDirectoryHandle('Temario', { create: true });
  const trabajos = await m.getDirectoryHandle('Trabajos', { create: true });
  await write(clases, '2026-10-01 Clase 01 - Tensores.md', `---
tipo: clase
materia: Mecánica del Continuo
fecha: 2026-10-01
---

# Clase 01 · Tensores

## Apuntes

$$
\\sigma_{x}\\coloneq120MPa
$$

$$
\\tau_{xy}\\coloneq40MPa
$$

$$
\\sigma_{1}\\coloneq\\frac{\\sigma_{x}}{2}+\\sqrt{\\left(\\frac{\\sigma_{x}}{2}\\right)^2+\\tau_{xy}^2}=
$$

## Dudas que surgieron

- [ ] ¿El tensor de Cauchy siempre es simétrico?
- [x] Convención de signos
`);
  await write(dudas, 'Dudas.md', '---\ntipo: dudas\n---\n\n# Dudas\n\n- [ ] Repasar invariantes\n');
  const cap = await temario.getDirectoryHandle('02 Tensores', { create: true });
  await write(cap, 'Teoría.md', '# 02 Tensores\n\n## Desarrollo\n');
  await write(trabajos, 'TP1 Círculos de Mohr.md', `---\ntipo: trabajo\nentrega: ${entrega}\nestado: pendiente\n---\n\n# TP1\n`);
  const db = await new Promise((res, rej) => { const r = indexedDB.open('cuaderno', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(posgrado, 'root'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  localStorage.clear();
}, inTwoDays);

await page.reload({ waitUntil: 'networkidle0' });
await wait(1200);
const gate = await page.$eval('#gate', (el) => (el.hidden ? 'oculto' : el.textContent.trim().slice(0, 80)));
console.log('ACCESO:', gate);
console.log('INICIO:', (await page.$eval('#dash', (el) => el.innerText)).replace(/\s+/g, ' ').slice(0, 400));
await page.screenshot({ path: `${shots}/app-inicio.png` });

// Portada de la materia
await page.click('[data-home]');
await wait(800);
console.log('PORTADA:', (await page.$eval('#dash', (el) => el.innerText)).replace(/\s+/g, ' ').slice(0, 400));
await page.screenshot({ path: `${shots}/app-portada.png` });

// Marcar una duda como resuelta desde la portada
await page.click('[data-resolve="0"]');
await wait(900);
const dudaFile = await page.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  const p = await root.getDirectoryHandle('Posgrado');
  const m = await p.getDirectoryHandle('Mecánica del Continuo');
  const c = await m.getDirectoryHandle('Clases');
  return (await (await c.getFileHandle('2026-10-01 Clase 01 - Tensores.md')).getFile()).text();
});
console.log('DUDA RESUELTA EN ARCHIVO:', /\[x\] ¿El tensor/.test(dudaFile));

// Abrir la clase: ecuaciones calculadas
await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
await wait(200);
const links = await page.$$eval('.page-link', (els) => els.map((e) => e.textContent));
console.log('PÁGINAS EN EL ÁRBOL:', links);
await page.evaluate(() => [...document.querySelectorAll('.page-link')].find((e) => e.textContent.includes('Clase 01')).click());
await wait(1500);
const res = await page.$$eval('.math-result', (els) => els.map((e) => e.textContent.trim().slice(0, 30)).filter(Boolean));
console.log('RESULTADOS EN LA CLASE:', res);
console.log('ÍNDICE:', await page.$$eval('#outline button', (els) => els.map((e) => e.textContent)));

// Editar y comprobar el guardado automático
await page.evaluate(() => window.document.querySelector('.ProseMirror h1').scrollIntoView());
await page.click('.ProseMirror h1');
await page.keyboard.press('End');
await page.keyboard.type(' (editado)');
await wait(1600);
const saved = await page.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  const p = await root.getDirectoryHandle('Posgrado');
  const m = await p.getDirectoryHandle('Mecánica del Continuo');
  const c = await m.getDirectoryHandle('Clases');
  return (await (await c.getFileHandle('2026-10-01 Clase 01 - Tensores.md')).getFile()).text();
});
console.log('GUARDADO:', /Tensores \(editado\)/.test(saved), '| frontmatter intacto:', saved.startsWith('---\ntipo: clase'));
console.log('ESTADO:', await page.$eval('#status', (el) => el.textContent));
await page.screenshot({ path: `${shots}/app-clase.png` });

// Crear una clase nueva con el diálogo
await page.evaluate(() => [...document.querySelectorAll('.sec-head')].find((h) => h.textContent.includes('Clases')).querySelector('[data-menu]').click());
await wait(200);
console.log('MENÚ +:', await page.$$eval('.cm-item', (els) => els.map((e) => e.textContent).slice(0, 3)));
await page.click('.cm-item[data-kind="clase"]');
await wait(300);
await page.type('#dlg-tema', 'Cinemática');
await page.click('.dialog [value="ok"]');
await wait(1200);
console.log('NUEVA CLASE ABIERTA:', await page.$eval('#crumbs', (el) => el.innerText.replace(/\s+/g, ' ')));
// Búsqueda
await page.keyboard.down('Control'); await page.keyboard.press('p'); await page.keyboard.up('Control');
await wait(400);
await page.type('#searchInput', 'cauchy');
await wait(500);
console.log('BÚSQUEDA cauchy:', await page.$$eval('.search-item .si-name', (els) => els.map((e) => e.textContent)));
await page.keyboard.press('Enter');
await wait(1200);
console.log('ABRIÓ Y MARCÓ:', await page.$eval('#crumbs', (el) => el.innerText.replace(/s+/g, ' ')), '|', await page.evaluate(() => { const ed = window.cuaderno.editor; const { from, to } = ed.state.selection; return ed.state.doc.textBetween(from, to); }));
// Nueva carpeta tipo idioma en la raíz
await page.click('#newMateria');
await wait(300);
await page.type('#dlg-nombre', 'Italiano');
await page.select('#dlg-tipo', 'Idioma · Clases, Vocabulario, Gramática, Dudas');
await page.click('.dialog [value="ok"]');
await wait(1500);
console.log('PORTADA IDIOMA:', (await page.$eval('#dash', (el) => el.innerText)).replace(/s+/g, ' ').slice(0, 160));
await page.click('[data-review="0"]');
await wait(400);
console.log('TARJETA:', await page.$eval('.rv-big', (el) => el.textContent));
await page.keyboard.press(' ');
await wait(200);
console.log('RESPUESTA:', await page.$eval('.rv-answer', (el) => el.textContent));
await page.keyboard.press('3');
await wait(600);
const store = await page.evaluate(async () => { const r = await navigator.storage.getDirectory(); const p = await r.getDirectoryHandle('Posgrado'); return JSON.parse(await (await (await p.getFileHandle('.repaso.json')).getFile()).text()); });
console.log('PROGRESO GUARDADO:', JSON.stringify(store));
await page.keyboard.press('Escape');
await page.screenshot({ path: `${shots}/app-final.png` });
console.log('PROBLEMAS:', problems.length ? problems : 'ninguno');
await browser.close();
