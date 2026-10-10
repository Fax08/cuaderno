// Corre todas las ecuaciones de un .md en orden y muestra resultados: node dev/page-check.mjs <archivo.md>
import { readFileSync } from 'node:fs';
import MarkdownIt from 'markdown-it';
import { markdownItMath } from '../src/md-rules.js';
import { Ctx, runStatement } from '../src/calc.js';

const md = new MarkdownIt({ html: true });
md.use(markdownItMath);
const text = readFileSync(process.argv[2], 'utf8').replace(/^---[\s\S]*?---\n/, '');
const html = md.render(text);
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const ctx = new Ctx();
for (const m of html.matchAll(/data-type="math-(inline|block)" data-latex="([^"]*)"/g)) {
  const latex = decode(m[2]);
  const r = runStatement(latex, ctx);
  const out = r === null ? '' : r.error ? `ERROR: ${r.error}` : (r.latex || '(define)');
  console.log(`${latex.replace(/\s+/g, ' ').slice(0, 60).padEnd(60)} ${out}`);
}
