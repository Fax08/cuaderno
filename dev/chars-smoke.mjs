// Prueba del panel de caracteres especiales: node dev/chars-smoke.mjs <url> <capturas>
import puppeteer from 'puppeteer-core';

const [url = 'http://localhost:5179/', shots = '.'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', userDataDir: process.env.PROFILE, headless: true, args: ['--no-first-run'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md = () => page.evaluate(() => window.cuaderno.editor.getMarkdown());
const visible = (sel) => page.$eval(sel, (el) => !el.hidden).catch(() => false);

await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  for await (const [name] of root.entries()) await root.removeEntry(name, { recursive: true });
  const top = await root.getDirectoryHandle('Notas', { create: true });
  const fh = await (await top.getDirectoryHandle('Posgrado', { create: true })).getFileHandle('Apunte.md', { create: true });
  const w = await fh.createWritable();
  await w.write('# Apunte\n\nLa tensión \n\n$$\nL\\coloneq6m\n$$\n');
  await w.close();
  const db = await new Promise((res) => { const r = indexedDB.open('cuaderno', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); });
  await new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(top, 'root'); tx.oncomplete = res; });
  localStorage.clear();
  localStorage.setItem('cuaderno.last', JSON.stringify(['Posgrado', 'Apunte.md']));
});
await page.reload({ waitUntil: 'networkidle0' });
await wait(2000);
console.log('OCULTO POR DEFECTO:', !(await visible('.char-panel')));
await page.click('[data-id="chars"]');
await wait(200);
console.log('AL ACTIVAR "Caracteres" APARECE:', await visible('.char-panel'), '| botón:', await page.$eval('[data-id="chars"]', (b) => b.getAttribute('aria-pressed')));

// Cursor al final de "La tensión " y escribir σ con subíndice xx
await page.evaluate(() => {
  const ed = window.cuaderno.editor;
  let end = null;
  ed.state.doc.descendants((n, pos) => { if (end === null && n.isTextblock && n.textContent.startsWith('La tensión')) end = pos + n.nodeSize - 1; return end === null; });
  ed.chain().focus().setTextSelection(end).run();
});
await page.click('.char-panel [data-tab="1"]');
await page.evaluate(() => [...document.querySelectorAll('.char-panel .char-btn')].find((b) => b.textContent === 'σ').click());
await page.click('.char-panel [data-tab="2"]');
await page.evaluate(() => [...document.querySelectorAll('.char-panel .char-btn')].find((b) => b.textContent === 'x₂').click());
await page.keyboard.type('xx');
await page.evaluate(() => [...document.querySelectorAll('.char-panel .char-btn')].find((b) => b.textContent === 'x₂').click());
await page.keyboard.type(' = 25 MPa, área en m');
await page.evaluate(() => [...document.querySelectorAll('.char-panel .char-btn')].find((b) => b.textContent === 'x²').click());
await page.keyboard.type('2');
await page.evaluate(() => [...document.querySelectorAll('.char-panel .char-btn')].find((b) => b.textContent === 'x²').click());
await page.click('.char-panel [data-tab="6"]');
await page.keyboard.type(' y ');
await page.evaluate(() => [...document.querySelectorAll('.char-panel .char-btn')].find((b) => b.textContent === 'ü').click());
await wait(1200);
console.log('TEXTO:', (await md()).split('\n').find((l) => l.startsWith('La tensión')));
await page.click('.char-panel [data-tab="0"]');
console.log('RECIENTES:', await page.$$eval('.char-panel .char-btn', (els) => els.map((e) => e.textContent)));
await page.screenshot({ path: `${shots}/chars.png` });

// Al editar una ecuación se cambia al panel matemático
await page.evaluate(() => { localStorage.setItem('cuaderno.mathLocked', 'false'); });
const eq = await page.$('.math-block');
await eq.click({ count: 2 });
await wait(600);
console.log('EN ECUACIÓN → panel matemático:', await visible('.sym-panel:not(.char-panel)'), '| panel de caracteres oculto:', !(await visible('.char-panel')));
await page.keyboard.press('Escape');
await wait(500);
console.log('AL SALIR VUELVE EL DE CARACTERES:', await visible('.char-panel'));

// Desactivar desde la barra
await page.click('[data-id="chars"]');
await wait(200);
console.log('AL DESACTIVAR SE OCULTA:', !(await visible('.char-panel')));

// El subíndice se conserva al volver a abrir
await page.reload({ waitUntil: 'networkidle0' });
await wait(2000);
console.log('SUB/SUP AL REABRIR:', await page.$$eval('.ProseMirror sub, .ProseMirror sup', (els) => els.map((e) => `${e.tagName}:${e.textContent}`)));
console.log('PROBLEMAS:', problems.length ? problems : 'ninguno');
await browser.close();
