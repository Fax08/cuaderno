// Abre la "Clase 00" de muestra en la app con una carpeta simulada y prueba
// cálculos, gráficos, panel de símbolos y colores.
//   node dev/demo-smoke.mjs <url> <carpeta-capturas> <carpeta-de-la-materia-de-muestra>
import puppeteer from 'puppeteer-core';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [url = 'http://localhost:5179/', shots = '.', demoDir] = process.argv.slice(2);
// Lee la materia de muestra del disco para copiarla a la carpeta simulada
function collect(dir, base = []) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return collect(p, [...base, name]);
    return [{ path: [...base, name], text: readFileSync(p, 'utf8') }];
  });
}
const files = collect(demoDir);

const browser = await puppeteer.launch({
  executablePath: process.env.BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  userDataDir: process.env.PROFILE,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 950 });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) problems.push(`HTTP ${r.status()} ${r.url()}`); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(async (files) => {
  const root = await navigator.storage.getDirectory();
  for await (const [name] of root.entries()) await root.removeEntry(name, { recursive: true });
  const top = await root.getDirectoryHandle('Posgrado', { create: true });
  const m = await top.getDirectoryHandle('Cuaderno de muestra', { create: true });
  for (const f of files) {
    let d = m;
    for (const part of f.path.slice(0, -1)) d = await d.getDirectoryHandle(part, { create: true });
    const fh = await d.getFileHandle(f.path[f.path.length - 1], { create: true });
    const w = await fh.createWritable();
    await w.write(new Blob([f.text], { type: f.path[f.path.length - 1].endsWith('.svg') ? 'image/svg+xml' : 'text/plain' }));
    await w.close();
  }
  const db = await new Promise((res, rej) => { const r = indexedDB.open('cuaderno', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(top, 'root'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  localStorage.clear();
  localStorage.setItem('cuaderno.last', JSON.stringify(['Cuaderno de muestra', 'Clases', '2026-10-09 Clase 00 - Recorrido completo.md']));
}, files);
await page.reload({ waitUntil: 'networkidle0' });
await wait(4000);

const original = files.find((f) => f.path[f.path.length - 1].startsWith('2026-10-09')).text.replace(/^---[\s\S]*?---\n\n?/, '');
const md = await page.evaluate(() => window.cuaderno.editor.getMarkdown());
console.log('IDA Y VUELTA IDÉNTICA AL ARCHIVO:', md.trim() === original.trim());
if (md.trim() !== original.trim()) {
  const a = original.trim().split('\n'), b = md.trim().split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { console.log('  primera diferencia, línea', i + 1, '\n  archivo:', JSON.stringify(a.slice(i - 2, i + 4)), '\n  editor: ', JSON.stringify(b.slice(i - 2, i + 4))); break; }
}
const res = await page.$$eval('.math-result', (els) => els.map((e) => e.textContent.trim()).filter(Boolean));
console.log('RESULTADOS:', res.length, res.filter((r) => r.includes('⚠')));
const plots = await page.$$eval('.plot-node', (els) => els.map((el) => ({ t: el.querySelector('.plot-title').textContent, ok: !!el.querySelector('.main-svg'), gl: !!el.querySelector('canvas'), msg: el.querySelector('.plot-msg').hidden ? '' : el.querySelector('.plot-msg').textContent })));
console.log('GRÁFICOS:', plots);
const img = await page.$eval('.ProseMirror img', (el) => ({ ok: el.naturalWidth > 0, src: el.src.slice(0, 30) }));
console.log('IMAGEN:', img);
const colors = await page.$$eval('.ProseMirror span[style], .ProseMirror mark', (els) => els.map((e) => getComputedStyle(e).color + ' / ' + getComputedStyle(e).backgroundColor));
console.log('COLORES APLICADOS:', colors);

// capturas recorriendo la página
for (let i = 0; i < 4; i++) {
  await page.evaluate((y) => { document.getElementById('scroller').scrollTop = y; }, i * 880);
  await wait(500);
  await page.screenshot({ path: `${shots}/demo-${i + 1}.png` });
}

// Panel de símbolos
await page.evaluate(() => { document.getElementById('scroller').scrollTop = 1500; });
await wait(300);
const target = await page.evaluateHandle(() => [...document.querySelectorAll('.math-block')].find((e) => e.textContent.includes('max')));
await target.click();
await wait(700);
const panelVisible = await page.$eval('.sym-panel', (el) => !el.hidden);
console.log('PANEL DE SÍMBOLOS VISIBLE AL EDITAR:', panelVisible);
await page.screenshot({ path: `${shots}/demo-simbolos.png` });
await page.click('.sym-tab[data-tab="0"]');
await page.keyboard.press('End');
await page.click('.sym-btn[data-i="0"]');
await wait(300);
const val = await page.$eval('math-field', (mf) => mf.value);
console.log('INSERTÓ α DESDE EL PANEL:', val.includes('\\alpha'), '|', val);
await page.click('.sym-x');
await wait(200);
console.log('PANEL CERRADO (colapsado):', await page.$eval('.sym-panel', (el) => el.classList.contains('collapsed')));
await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
await page.keyboard.press('Escape');
await wait(500);
console.log('PANEL OCULTO AL SALIR:', await page.$eval('.sym-panel', (el) => el.hidden));

// Color de letra desde la barra
await page.evaluate(() => {
  const ed = window.cuaderno.editor;
  let from = null;
  ed.state.doc.descendants((n, pos) => { if (from === null && n.isText && n.text.includes('Las listas')) from = pos + n.text.indexOf('Las listas'); });
  ed.chain().focus().setTextSelection({ from, to: from + 10 }).run();
});
await page.click('[data-id="color"]');
await wait(200);
await page.click('.pal-sw[data-text="var(--tc-violeta)"]');
await wait(1500);
const saved = await page.evaluate(() => window.cuaderno.editor.getMarkdown());
console.log('COLOR GUARDADO EN EL MD:', saved.includes('<span style="color: var(--tc-violeta);">Las listas</span>'));
console.log('PROBLEMAS:', problems.length ? problems : 'ninguno');
await browser.close();
