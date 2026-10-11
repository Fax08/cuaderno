// Prueba de la traducción en la app (consulta internet): node dev/trad-smoke.mjs <url> <capturas>
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

await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  for await (const [name] of root.entries()) await root.removeEntry(name, { recursive: true });
  const top = await root.getDirectoryHandle('Notas', { create: true });
  const d = await (await top.getDirectoryHandle('Alemán', { create: true })).getDirectoryHandle('Vocabulario', { create: true });
  const fh = await d.getFileHandle('Clase 1.md', { create: true });
  const w = await fh.createWritable();
  await w.write(`---
tipo: vocabulario
---

# Vocabulario · Clase 1

hallo:.

tensión:

Die erste Stunde im Kurs:.

| Palabra | Traducción | Ejemplo | Notas |
| --- | --- | --- | --- |
| Verformung |  |  |  |
| x |  |  |  |
| hallo |  |  |  |
`);
  await w.close();
  const db = await new Promise((res) => { const r = indexedDB.open('cuaderno', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); });
  await new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(top, 'root'); tx.oncomplete = res; });
  localStorage.clear();
  localStorage.setItem('cuaderno.last', JSON.stringify(['Alemán', 'Vocabulario', 'Clase 1.md']));
});
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => document.querySelectorAll('.trad-ghost[data-ready]').length >= 3, { timeout: 30000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 2500));
console.log('SUBRAYADAS EN PÁGINA ALEMANA:', await page.$$eval('.spell-err', (els) => els.map((e) => e.textContent)));
console.log('PROPIEDAD AUTOMÁTICA:', await page.$eval('[data-trad-auto]', (s) => s.options[s.selectedIndex].text).catch(() => 'no aparece'));
console.log('RESULTADOS AL LADO:', await page.$$eval('.trad-ghost', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim())));
await page.screenshot({ path: `${shots}/trad-1.png` });

// Tab al final de "hallo:" la deja escrita
await page.evaluate(() => {
  const ed = window.cuaderno.editor;
  let end = null;
  ed.state.doc.descendants((n, pos) => { if (end === null && n.isTextblock && n.textContent.startsWith('hallo')) end = pos + n.nodeSize - 1; return end === null; });
  ed.chain().focus().setTextSelection(end).run();
});
await page.keyboard.press('Tab');
await wait(400);
console.log('TAB ESCRIBIÓ:', (await md()).split('\n').find((l) => /^\**hallo/.test(l)));
await page.keyboard.type(' sigue');
await wait(300);
console.log('LO QUE SIGUE VA SIN FORMATO:', (await md()).split('\n').find((l) => /^\**hallo/.test(l)));

// Tabla: escribir una palabra en la primera columna y pasar a la siguiente
await page.evaluate(() => {
  const ed = window.cuaderno.editor;
  let at = null;
  ed.state.doc.descendants((n, pos) => { if (at === null && n.type.name === 'tableCell' && n.textContent === 'x') at = pos + 2; return at === null; });
  ed.chain().focus().setTextSelection({ from: at, to: at + 1 }).run();
});
await page.keyboard.type('Träger');
await page.keyboard.press('Tab');
await page.waitForFunction(() => /\| Träger \| [^|\s]/.test(window.cuaderno.editor.getMarkdown()), { timeout: 30000 }).catch(() => {});
console.log('FILA COMPLETADA SOLA:', (await md()).split('\n').find((l) => l.includes('Träger')));

// Botón "Traducir vacías"
await page.click('[data-fill-trad]');
await page.waitForFunction(() => /\| Verformung \| [^|\s]/.test(window.cuaderno.editor.getMarkdown()) && /\| hallo \| [^|\s]/.test(window.cuaderno.editor.getMarkdown()), { timeout: 30000 }).catch(() => {});
console.log('TRADUCIR VACÍAS:', (await md()).split('\n').filter((l) => /Verformung|\| hallo/.test(l)));
await page.screenshot({ path: `${shots}/trad-2.png` });
await wait(1500);
const cache = await page.evaluate(async () => { const r = await navigator.storage.getDirectory(); const t = await r.getDirectoryHandle('Notas'); try { return Object.keys(JSON.parse(await (await (await t.getFileHandle('.traducciones.json')).getFile()).text())); } catch { return 'no existe'; } });
console.log('GUARDADAS EN .traducciones.json:', cache);
// Oración: seleccionar + Alt+T
await page.evaluate(() => {
  const ed = window.cuaderno.editor;
  ed.chain().focus('end').insertContent('<p>Ich verstehe die Spannung im Träger nicht.</p>').run();
  let range = null;
  ed.state.doc.descendants((n, pos) => { if (!range && n.isTextblock && n.textContent.startsWith('Ich verstehe')) range = { from: pos + 1, to: pos + 1 + n.textContent.length }; return !range; });
  ed.chain().focus().setTextSelection(range).run();
});
await page.keyboard.down('Alt'); await page.keyboard.press('t'); await page.keyboard.up('Alt');
await page.waitForFunction(() => /Ich verstehe[^\n]*\n\n\*[^*]+\*/.test(window.cuaderno.editor.getMarkdown()), { timeout: 30000 }).catch(() => {});
const lines = (await md()).split('\n');
const i = lines.findIndex((l) => l.startsWith('Ich verstehe'));
console.log('ORACIÓN TRADUCIDA (Alt+T):', lines.slice(i, i + 3).filter(Boolean));

// Conectar Google con una clave falsa: el error tiene que ser claro
await page.click('[data-id="spell"]');
await wait(200);
await page.click('[data-google]');
await wait(300);
await page.type('#gkInput', 'AIzaClaveDePruebaQueNoExiste123');
await page.click('.google-key [data-test]');
await page.waitForFunction(() => { const s = document.querySelector('#gkStatus'); return s && s.textContent && s.textContent !== 'Probando…'; }, { timeout: 20000 }).catch(() => {});
console.log('CLAVE FALSA →', await page.$eval('#gkStatus', (s) => s.textContent));
await page.screenshot({ path: `${shots}/google-key.png` });
console.log('PROBLEMAS:', problems.length ? problems : 'ninguno');
await browser.close();
