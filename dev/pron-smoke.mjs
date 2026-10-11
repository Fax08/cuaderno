// Prueba de la tabla de pronombres: node dev/pron-smoke.mjs <url> <capturas>
import puppeteer from 'puppeteer-core';

const [url = 'http://localhost:5179/', shots = '.'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', userDataDir: process.env.PROFILE, headless: true, args: ['--no-first-run'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950 });
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
  const write = async (dir, name, text) => { const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(text); await w.close(); };
  await write(await (await top.getDirectoryHandle('Alemán', { create: true })).getDirectoryHandle('Gramática', { create: true }), 'Verbos.md', '---\ntipo: gramatica\n---\n\n# Verbos modales\n\n## mögen\n');
  await write(await top.getDirectoryHandle('Posgrado', { create: true }), 'Otra.md', '# Otra\n');
  const db = await new Promise((res) => { const r = indexedDB.open('cuaderno', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); });
  await new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(top, 'root'); tx.oncomplete = res; });
  localStorage.clear();
  localStorage.setItem('cuaderno.last', JSON.stringify(['Alemán', 'Gramática', 'Verbos.md']));
});
await page.reload({ waitUntil: 'networkidle0' });
await wait(2500);

await page.evaluate(() => window.cuaderno.editor.commands.focus('end'));
await page.keyboard.press('Enter');
await page.keyboard.type('/tabla_pron ', { delay: 30 });
await wait(300);
// El cursor tiene que quedar en la conjugación de "ich": escribir directo y bajar con flechas
for (const w of ['mag', 'magst', 'mag', 'mögen', 'mögt', 'mögen']) {
  await page.keyboard.type(w, { delay: 10 });
  await page.keyboard.press('ArrowDown');
}
await wait(1500);
let m = await md();
console.log('TABLA _1:\n' + m.split('## mögen')[1].trim().split('\n').slice(0, 9).join('\n'));
console.log('CENTRADA:', await page.$eval('.tabla-pron', (el) => { const t = el.tagName === 'TABLE' ? el : el.querySelector('table'); const r = t.getBoundingClientRect(); const p = document.querySelector('.ProseMirror').getBoundingClientRect(); return Math.abs((r.left + r.right) / 2 - (p.left + p.right) / 2) < 4 && r.width < p.width - 100; }));
await page.screenshot({ path: `${shots}/pron.png` });

// _2 agrega una columna; con Enter también funciona
await page.evaluate(() => { window.cuaderno.editor.chain().focus('end').run(); });
await page.keyboard.press('Enter');
await page.keyboard.type('/tabla_pron_2', { delay: 30 });
await page.keyboard.press('Enter');
await wait(400);
m = await md();
console.log('ENCABEZADOS _2:', m.split('\n').filter((l) => /^\| Pronombre/.test(l)));

// En una página que no es de alemán no se crea
await page.evaluate(() => [...document.querySelectorAll('.page-link')].find((e) => e.textContent === 'Otra')?.click());
await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
await page.evaluate(() => [...document.querySelectorAll('.page-link')].find((e) => e.textContent === 'Otra').click());
await wait(1200);
await page.evaluate(() => window.cuaderno.editor.commands.focus('end'));
await page.keyboard.press('Enter');
await page.keyboard.type('/tabla_pron ', { delay: 30 });
await wait(300);
console.log('EN PÁGINA SIN ALEMÁN:', JSON.stringify((await md()).trim().split('\n').pop()), '| aviso:', await page.$eval('.toast', (t) => t.textContent).catch(() => ''));
console.log('PROBLEMAS:', problems.length ? problems : 'ninguno');
await browser.close();
