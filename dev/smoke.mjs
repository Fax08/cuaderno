// Prueba de humo con Edge headless: node dev/smoke.mjs <url> <carpeta-capturas>
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://localhost:5179/dev/harness.html';
const shots = process.argv[3] || '.';
const browser = await puppeteer.launch({
  executablePath: process.env.BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  userDataDir: process.env.PROFILE,
  headless: true,
  args: ['--window-size=1280,900', '--no-first-run', '--no-default-browser-check'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 900 });
const problems = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`${m.type()}: ${m.text()}`); });
page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.goto(url, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.ready === true');

const doc = `# Viga simplemente apoyada

Datos con unidades, como en MathCad:

$$
L\\coloneq6m
$$

$$
q\\coloneq12\\frac{kN}{m}
$$

$$
M_{max}\\coloneq\\frac{qL^2}{8}=
$$

La tensión $\\sigma\\coloneq\\frac{M_{max}}{W}$ necesita $W\\coloneq400cm^3$ definida antes.

$$
M\\left(x\\right)\\coloneq\\frac{qx}{2}\\left(L-x\\right)
$$

$$
M\\left(2m\\right)=kN\\cdot m
$$

$$
K\\coloneq\\begin{bmatrix}4 & -2\\\\ -2 & 4\\end{bmatrix}
$$

$$
K^{-1}=
$$

$$
\\int_0^L M\\left(x\\right)dx
$$

\`\`\`plot
tipo: 2d
titulo: Momento flector
f: M\\left(x\\right)
xmin: 0
xmax: L
\`\`\`

## Dudas

- [ ] ¿Por qué $\\tau_{xy}=\\tau_{yx}$?
`;
await page.evaluate((d) => window.load(d), doc);
await new Promise((r) => setTimeout(r, 2500));

const results = await page.$$eval('.math-node', (els) => els.map((el) => ({
  block: el.classList.contains('math-block'),
  render: el.querySelector('.math-render')?.textContent.slice(0, 40),
  result: el.querySelector('.math-result')?.textContent.trim().slice(0, 60),
})));
console.log('ECUACIONES');
results.forEach((r) => console.log(`  ${r.block ? 'bloque ' : 'línea  '} | ${(r.render || '').padEnd(40)} | ${r.result || ''}`));
const plot = await page.$eval('.plot-node', (el) => ({ svg: !!el.querySelector('.main-svg'), msg: el.querySelector('.plot-msg')?.textContent, legend: el.querySelector('.plot-legend')?.textContent.slice(0, 60) }));
console.log('GRÁFICO', plot);
await page.screenshot({ path: `${shots}/smoke-1.png`, fullPage: true });

// Ida y vuelta del Markdown
const md = await page.evaluate(() => window.editor.getMarkdown());
console.log('MARKDOWN (inicio)\n' + md.slice(0, 700));
await page.evaluate((d) => window.load(d), md);
await new Promise((r) => setTimeout(r, 800));
const md2 = await page.evaluate(() => window.editor.getMarkdown());
console.log('IDA Y VUELTA ESTABLE:', md === md2);

// Editar una ecuación con MathLive
await page.evaluate(() => { window.editor.commands.setContent('Texto inicial', { emitUpdate: false }); window.editor.commands.focus('end'); });
await page.evaluate(() => window.editor.commands.insertMathBlock());
await new Promise((r) => setTimeout(r, 600));
const hasField = await page.$('math-field');
console.log('EDITOR VISUAL ABIERTO:', !!hasField);
if (hasField) {
  await page.keyboard.type('a:=3m', { delay: 40 });
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => window.editor.commands.insertMathBlock());
  await new Promise((r) => setTimeout(r, 500));
  await page.keyboard.type('sigma_x', { delay: 40 });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type(':=a^2', { delay: 40 });
  await page.keyboard.type('=', { delay: 40 });
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 600));
  const after = await page.evaluate(() => window.editor.getMarkdown());
  console.log('TRAS TIPEAR:', JSON.stringify(after));
  const res2 = await page.$$eval('.math-result', (els) => els.map((e) => e.textContent.trim()));
  console.log('RESULTADOS:', res2);
}

// Regla $…$ al escribir
await page.evaluate(() => { window.editor.commands.setContent('', { emitUpdate: false }); window.editor.commands.focus('end'); });
await page.keyboard.type('Energía $E=mc^2$ listo', { delay: 20 });
await new Promise((r) => setTimeout(r, 300));
console.log('REGLA $…$:', JSON.stringify(await page.evaluate(() => window.editor.getMarkdown())));

// Menú /
await page.evaluate(() => { window.editor.commands.setContent('', { emitUpdate: false }); window.editor.commands.focus('end'); });
await page.keyboard.type('/ecua', { delay: 30 });
await new Promise((r) => setTimeout(r, 200));
const menu = await page.$$eval('.slash-item', (els) => els.map((e) => e.textContent));
console.log('MENÚ / con "ecua":', menu);
await page.screenshot({ path: `${shots}/smoke-2.png` });

console.log('PROBLEMAS EN CONSOLA:', problems.length ? problems : 'ninguno');
await browser.close();
