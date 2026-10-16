// Prueba de "$$" para crear ecuaciones en distintos lugares + cuadro de estructuras
import puppeteer from 'puppeteer-core';
const [url = 'http://localhost:5179/', shots = '.'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', userDataDir: process.env.PROFILE, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950 });
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  for await (const [name] of root.entries()) await root.removeEntry(name, { recursive: true });
  const top = await root.getDirectoryHandle('Notas', { create: true });
  const fh = await (await top.getDirectoryHandle('Posgrado', { create: true })).getFileHandle('A.md', { create: true });
  const w = await fh.createWritable(); await w.write('# A\n\nTexto.\n'); await w.close();
  const db = await new Promise((res) => { const r = indexedDB.open('cuaderno', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); });
  await new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(top, 'root'); tx.oncomplete = res; });
  localStorage.clear();
  localStorage.setItem('cuaderno.last', JSON.stringify(['Posgrado', 'A.md']));
});
await page.reload({ waitUntil: 'networkidle0' });
await wait(2000);
const lastTypes = () => page.evaluate(() => { const out = []; window.cuaderno.editor.state.doc.descendants((n) => { if (n.type.name === 'mathBlock' || n.type.name === 'listItem') out.push(n.type.name); }); return out; });
async function attempt(label, keys) {
  await page.evaluate(() => { const ed = window.cuaderno.editor; ed.commands.setContent('Texto.', { emitUpdate: false }); ed.commands.focus('end'); });
  for (const k of keys) { if (k === 'Enter') await page.keyboard.press('Enter'); else await page.keyboard.type(k, { delay: 40 }); }
  await wait(400);
  const focused = await page.evaluate(() => document.activeElement.tagName === 'MATH-FIELD');
  console.log(`${label.padEnd(34)} ecuación creada: ${(await lastTypes()).includes('mathBlock')} · cursor adentro: ${focused}`);
  await page.keyboard.press('Escape');
  await wait(200);
}
await attempt('"$$ " en renglón nuevo', ['Enter', '$$ ']);
await attempt('"$$ " después de texto', [' $$ ']);
await attempt('"$$ " dentro de una lista', ['Enter', '- item ', '$$ ']);
await attempt('"$$" + Enter', ['Enter', '$$', 'Enter']);

// Cuadro de estructuras: insertar una matriz 2×2 con el botón
await page.evaluate(() => { const ed = window.cuaderno.editor; ed.commands.setContent('', { emitUpdate: false }); ed.commands.focus('end'); });
await page.keyboard.type('$$ ', { delay: 40 });
await wait(400);
console.log('CUADROS:', await page.$$eval('.sym-panel:not(.char-panel) .sym-box-title', (els) => els.map((e) => e.textContent)));
await page.click('.sym-panel:not(.char-panel) [data-tab="bottom:0"]');
await page.click('.sym-panel:not(.char-panel) .sym-btn[data-g="4"][data-i="0"]');
await wait(300);
console.log('MATRIZ DESDE EL BOTÓN:', await page.evaluate(() => document.querySelector('math-field')?.value));
await page.screenshot({ path: `${shots}/estructuras.png` });
console.log('PROBLEMAS:', problems.length ? problems : 'ninguno');
await browser.close();
