// Muestra errores de consola al cargar la app: node dev/console-check.mjs <url>
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', userDataDir: process.env.PROFILE, headless: true });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() !== 'debug') console.log(m.type(), m.text()); });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('requestfailed', (r) => console.log('requestfailed', r.url()));
page.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
await page.goto(process.argv[2] || 'http://localhost:5179/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 2000));
await browser.close();
