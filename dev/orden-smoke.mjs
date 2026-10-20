// Prueba de reordenar la barra lateral arrastrando: node dev/orden-smoke.mjs <url> <capturas>
import puppeteer from 'puppeteer-core';
const [url = 'http://localhost:5179/', shots = '.'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', userDataDir: process.env.PROFILE, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  for await (const [name] of root.entries()) await root.removeEntry(name, { recursive: true });
  const top = await root.getDirectoryHandle('Notas', { create: true });
  const temario = await (await top.getDirectoryHandle('Geotecnia', { create: true })).getDirectoryHandle('Temario', { create: true });
  const put = async (dir, name) => { const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(`# ${name}\n`); await w.close(); };
  for (const n of ['Hidráulica.md', 'Propiedades.md', 'Consolidación.md']) await put(temario, n);
  for (const n of ['01 Tensiones', '02 Corte', '03 Asentamientos']) await put(await temario.getDirectoryHandle(n, { create: true }), 'Teoría.md');
  const db = await new Promise((res) => { const r = indexedDB.open('cuaderno', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); });
  await new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(top, 'root'); tx.oncomplete = res; });
  localStorage.clear();
  localStorage.setItem('cuaderno.open', JSON.stringify(['Geotecnia']));
});
await page.reload({ waitUntil: 'networkidle0' });
await wait(2000);

const order = () => page.evaluate(() => ({
  files: [...document.querySelectorAll('#tree .page-link')].filter((b) => b.dataset.drag.startsWith('Geotecnia/Temario/') && b.dataset.drag.split('/').length === 3).map((b) => b.textContent),
  dirs: [...document.querySelectorAll('#tree summary[data-drag]')].filter((s) => s.dataset.drag.split('/').length === 3).map((s) => s.querySelector('.sum-name').textContent),
}));
// Arrastre con eventos de arrastre reales del DOM (dragstart → dragover → drop → dragend)
const dragTo = (from, to, after) => page.evaluate((from, to, after) => {
  const q = (k) => [...document.querySelectorAll('#tree [data-drag]')].find((x) => x.dataset.drag === k);
  const src = q(from), dst = q(to);
  const dt = new DataTransfer();
  const r = dst.getBoundingClientRect();
  const y = after ? r.bottom - 2 : r.top + 2;
  src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
  const marked = dst.classList.contains(after ? 'drop-after' : 'drop-before');
  dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
  src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  return marked;
}, from, to, after);

console.log('INICIAL:', JSON.stringify(await order()));
console.log('MARCA:', await dragTo('Geotecnia/Temario/Propiedades.md', 'Geotecnia/Temario/Consolidación.md', false));
await wait(800);
console.log('PÁGINA ARRIBA:', JSON.stringify((await order()).files));
await dragTo('Geotecnia/Temario/01 Tensiones', 'Geotecnia/Temario/03 Asentamientos', true);
await wait(800);
console.log('CARPETA AL FINAL:', JSON.stringify((await order()).dirs));
// Página sobre carpeta: no se tiene que poder
console.log('MEZCLA PERMITIDA:', await dragTo('Geotecnia/Temario/Hidráulica.md', 'Geotecnia/Temario/02 Corte', false));
// Teclado
await page.evaluate(() => [...document.querySelectorAll('#tree [data-drag]')].find((x) => x.dataset.drag === 'Geotecnia/Temario/Hidráulica.md').focus());
await page.keyboard.down('Alt'); await page.keyboard.press('ArrowUp'); await page.keyboard.up('Alt');
await wait(800);
console.log('ALT+ARRIBA:', JSON.stringify((await order()).files), 'foco:', await page.evaluate(() => document.activeElement?.dataset?.drag));
await page.reload({ waitUntil: 'networkidle0' });
await wait(2000);
console.log('TRAS RECARGAR:', JSON.stringify(await order()));
console.log('ARCHIVO:', await page.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  const t = await (await (await root.getDirectoryHandle('Notas')).getDirectoryHandle('Geotecnia')).getDirectoryHandle('Temario');
  return (await (await t.getFileHandle('.orden.json')).getFile()).text();
}));
await page.screenshot({ path: `${shots}/orden.png`, clip: { x: 0, y: 0, width: 300, height: 450 } });
console.log('PROBLEMAS:', problems.length ? problems : 'ninguno');
await browser.close();
