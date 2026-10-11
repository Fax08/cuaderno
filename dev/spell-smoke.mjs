// Prueba del corrector ortográfico en la app: node dev/spell-smoke.mjs <url> <capturas>
import puppeteer from 'puppeteer-core';

const [url = 'http://localhost:5179/', shots = '.'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', userDataDir: process.env.PROFILE, headless: true, args: ['--no-first-run'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) problems.push(`HTTP ${r.status()} ${r.url()}`); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  for await (const [name] of root.entries()) await root.removeEntry(name, { recursive: true });
  const top = await root.getDirectoryHandle('Notas', { create: true });
  const d = await top.getDirectoryHandle('Idiomas', { create: true });
  const fh = await d.getFileHandle('Prueba.md', { create: true });
  const w = await fh.createWritable();
  await w.write(`# Prueba de ortografía

La ecuasion de equilibrio da una tensión de 25MPa en la estructurra, según Timoshenko.

The beam strength is hihg and the deflection is small.

Die Spannungsverteilung im Brückenbau ist wichtig, aber die Spanung ist zu groß.

El módulo $E\\coloneq200GPa$ y el TP1 no se revisan. Ver https://ejemplo.com/pagina.
`);
  await w.close();
  const db = await new Promise((res) => { const r = indexedDB.open('cuaderno', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); });
  await new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(top, 'root'); tx.oncomplete = res; });
  localStorage.clear();
  localStorage.setItem('cuaderno.last', JSON.stringify(['Idiomas', 'Prueba.md']));
});
await page.reload({ waitUntil: 'networkidle0' });
await wait(3500);
const marked = async () => page.$$eval('.spell-err', (els) => els.map((e) => e.textContent));
console.log('SOLO ESPAÑOL, MARCADAS:', await marked());
console.log('DEPURAR:', await page.evaluate(() => ({ gate: document.getElementById('gate').hidden, crumbs: document.getElementById('crumbs').innerText, tb: !!document.querySelector('.toolbar') })), problems);

// Activar inglés y alemán desde la barra
await page.click('[data-id="spell"]');
await wait(200);
await page.click('[data-lang="en"]');
await wait(2500);
await page.click('[data-lang="de"]');
await wait(3500);
console.log('ES + EN + DE, MARCADAS:', await marked());
await page.mouse.click(700, 600);

// Clic derecho → sugerencia
const target = await page.evaluateHandle(() => [...document.querySelectorAll('.spell-err')].find((e) => e.textContent === 'ecuasion'));
const box = await target.boundingBox();
await page.mouse.click(box.x + 5, box.y + 5, { button: 'right' });
await page.waitForSelector('.spell-menu .sug', { timeout: 15000 });
console.log('SUGERENCIAS PARA ecuasion:', await page.$$eval('.spell-menu .sug', (els) => els.map((e) => e.textContent)));
await page.screenshot({ path: `${shots}/spell-menu.png` });
await page.click('.spell-menu .sug');
await wait(1500);
const md = await page.evaluate(() => window.cuaderno.editor.getMarkdown());
console.log('CORREGIDA EN EL TEXTO:', md.includes('La ecuación de equilibrio'));

// Agregar al diccionario
const t2 = await page.evaluateHandle(() => [...document.querySelectorAll('.spell-err')].find((e) => e.textContent === 'estructurra'));
const b2 = await t2.boundingBox();
await page.mouse.click(b2.x + 5, b2.y + 5, { button: 'right' });
await page.waitForSelector('.spell-menu [data-add]', { timeout: 15000 });
await page.click('.spell-menu [data-add]');
await wait(1500);
const dic = await page.evaluate(async () => { const r = await navigator.storage.getDirectory(); const t = await r.getDirectoryHandle('Notas'); return (await (await t.getFileHandle('.diccionario.txt')).getFile()).text(); });
console.log('DICCIONARIO PERSONAL:', JSON.stringify(dic), '| ya no marcada:', !(await marked()).includes('estructurra'));
console.log('MARCADAS AL FINAL:', await marked());
console.log('PROBLEMAS:', problems.length ? problems : 'ninguno');
await browser.close();
