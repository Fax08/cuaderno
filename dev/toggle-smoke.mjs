// Prueba de los desplegables (toggles): node dev/toggle-smoke.mjs <url> <capturas>
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
  const fh = await d.getFileHandle('Temas.md', { create: true });
  const w = await fh.createWritable();
  await w.write('---\ntipo: vocabulario\n---\n\n# Vocabulario por temas\n\nIntro.\n');
  await w.close();
  const db = await new Promise((res) => { const r = indexedDB.open('cuaderno', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); });
  await new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(top, 'root'); tx.oncomplete = res; });
  localStorage.clear();
  localStorage.setItem('cuaderno.last', JSON.stringify(['Alemán', 'Vocabulario', 'Temas.md']));
});
await page.reload({ waitUntil: 'networkidle0' });
await wait(2500);

// Escribir como lo haría el usuario: /t + espacio, título, Enter, contenido
await page.evaluate(() => window.cuaderno.editor.commands.focus('end'));
await page.keyboard.press('Enter');
await page.keyboard.type('/t ', { delay: 40 });
await wait(200);
await page.keyboard.type('Familia', { delay: 20 });
await page.keyboard.press('Enter');
await page.keyboard.type('die Mutter: la madre', { delay: 10 });
await page.keyboard.press('Enter');
await page.keyboard.type('der Vater: el padre', { delay: 10 });
await wait(300);
console.log('TOGGLES EN LA PÁGINA:', await page.$$eval('div[data-type="details"]', (els) => els.map((e) => e.querySelector('summary').textContent)));

// Dos Enter salen del desplegable; /t crea el siguiente al mismo nivel
await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
await page.keyboard.type('/t ', { delay: 40 });
await page.keyboard.type('Colores', { delay: 20 });
await page.keyboard.press('Enter');
await page.keyboard.type('rot: rojo', { delay: 10 });
await wait(400);
console.log('ESTRUCTURA:', await page.evaluate(() => { const out = []; window.cuaderno.editor.state.doc.forEach((n) => out.push(n.type.name === 'details' ? 'details(' + n.child(0).textContent + ')' : n.type.name)); return out; }));
const buttons = await page.$$('div[data-type="details"] > button');
await buttons[1].click();
await wait(1500);
const saved = await md();
console.log('MARKDOWN GUARDADO:\n' + saved.split('# Vocabulario por temas')[1]);

// Volver a abrir la página: ¿se reconstruyen igual?
await page.reload({ waitUntil: 'networkidle0' });
await wait(2500);
const after = await page.$$eval('div[data-type="details"]', (els) => els.map((e) => ({ titulo: e.querySelector('summary').textContent, abierto: e.classList.contains('is-open'), tabla: !!e.querySelector('table'), texto: e.querySelector('[data-type="detailsContent"]').textContent.slice(0, 40) })));
console.log('AL VOLVER A ABRIR:', after);
console.log('IDA Y VUELTA IDÉNTICA:', (await md()) === saved);
await page.screenshot({ path: `${shots}/toggles.png` });
console.log('PROBLEMAS:', problems.length ? problems : 'ninguno');
await browser.close();
