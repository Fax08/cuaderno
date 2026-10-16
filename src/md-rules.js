// Reglas de markdown-it para ecuaciones ($…$, $$…$$) y gráficos (```plot).
// Convierten el Markdown en HTML que los nodos del editor saben leer.

const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function mathInlineRule(state, silent) {
  const src = state.src;
  const start = state.pos;
  if (src[start] !== '$' || src[start + 1] === '$') return false;
  if (start > 0 && src[start - 1] === '\\') return false;
  if (/\s/.test(src[start + 1] || ' ')) return false;
  let end = start + 1;
  for (;;) {
    end = src.indexOf('$', end);
    if (end < 0) return false;
    if (src[end - 1] !== '\\') break;
    end++;
  }
  const content = src.slice(start + 1, end);
  if (!content.trim() || /\s$/.test(content) || content.includes('\n')) return false;
  if (!silent) {
    const tok = state.push('math_inline', 'span', 0);
    tok.content = content;
  }
  state.pos = end + 1;
  return true;
}

function mathBlockRule(state, startLine, endLine, silent) {
  const lineText = (n) => state.src.slice(state.bMarks[n] + state.tShift[n], state.eMarks[n]);
  const first = lineText(startLine);
  if (!first.startsWith('$$')) return false;
  let content;
  let next = startLine;
  const rest = first.slice(2).trim();
  if (rest.endsWith('$$') && rest.length >= 2) {
    content = rest.slice(0, -2);
  } else {
    const lines = rest ? [rest] : [];
    let found = false;
    for (next = startLine + 1; next < endLine; next++) {
      const line = lineText(next);
      if (line.trim().endsWith('$$')) { lines.push(line.trim().slice(0, -2)); found = true; break; }
      lines.push(line);
    }
    if (!found) return false;
    content = lines.join('\n');
  }
  if (silent) return true;
  state.line = next + 1;
  const tok = state.push('math_block', 'div', 0);
  tok.content = content.trim();
  tok.map = [startLine, state.line];
  tok.block = true;
  return true;
}

export function markdownItMath(md) {
  if (md.__cuadernoMath) return;
  md.__cuadernoMath = true;
  md.inline.ruler.before('escape', 'math_inline', mathInlineRule);
  md.block.ruler.before('fence', 'math_block', mathBlockRule, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.renderer.rules.math_inline = (t, i) => `<span data-type="math-inline" data-latex="${escAttr(t[i].content)}"></span>`;
  md.renderer.rules.math_block = (t, i) => `<div data-type="math-block" data-latex="${escAttr(t[i].content)}"></div>\n`;
}

export const PLOT_DEFAULTS = {
  tipo: '2d', titulo: '', exprs: [''], xmin: '0', xmax: '10', ymin: '0', ymax: '10',
  // opciones de la vista detallada (solo se guardan si cambian)
  alto: '340', xlabel: '', ylabel: '', zlabel: '', ylo: '', yhi: '', zlo: '', zhi: '',
  puntos: '', grilla: 'si', leyenda: 'si', escala: 'Viridis', camara: '',
};
const OPTIONAL = ['alto', 'xlabel', 'ylabel', 'zlabel', 'ylo', 'yhi', 'zlo', 'zhi', 'puntos', 'grilla', 'leyenda', 'escala', 'camara'];

export function parsePlotSource(src) {
  const a = { ...PLOT_DEFAULTS, exprs: [] };
  for (const line of src.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k === 'f') a.exprs.push(v);
    else if (k in a) a[k] = v;
  }
  if (!a.exprs.length) a.exprs = [''];
  return a;
}

export function serializePlot(a) {
  const lines = [`tipo: ${a.tipo}`];
  if (a.titulo) lines.push(`titulo: ${a.titulo}`);
  a.exprs.filter((e) => e.trim()).forEach((e) => lines.push(`f: ${e}`));
  lines.push(`xmin: ${a.xmin}`, `xmax: ${a.xmax}`);
  if (a.tipo === '3d') lines.push(`ymin: ${a.ymin}`, `ymax: ${a.ymax}`);
  for (const k of OPTIONAL) if (a[k] !== undefined && String(a[k]) !== PLOT_DEFAULTS[k]) lines.push(`${k}: ${a[k]}`);
  return lines.join('\n');
}

// ---------- bloque Resolver (```resolver) ----------
export const SOLVER_DEFAULTS = { vars: '', eqs: [''], usar: '1' };

export function parseSolverSource(src) {
  const a = { ...SOLVER_DEFAULTS, eqs: [] };
  for (const line of src.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k === 'ec') a.eqs.push(v);
    else if (k === 'incognitas' || k === 'incógnitas') a.vars = v;
    else if (k === 'usar') a.usar = v;
  }
  if (!a.eqs.length) a.eqs = [''];
  return a;
}

export function serializeSolver(a) {
  const lines = [`incognitas: ${a.vars || ''}`];
  (a.eqs || []).filter((e) => e && e.trim()).forEach((e) => lines.push(`ec: ${e}`));
  if (a.usar && a.usar !== '1') lines.push(`usar: ${a.usar}`);
  return lines.join('\n');
}

// ---------- bloque Tensiones principales (```autovalores) ----------
export const EIGEN_DEFAULTS = { matriz: '', valores: 'λ', vectores: 'n' };

export function parseEigenSource(src) {
  const a = { ...EIGEN_DEFAULTS };
  for (const line of src.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    if (k in a) a[k] = line.slice(i + 1).trim();
  }
  return a;
}

export function serializeEigen(a) {
  return [`matriz: ${a.matriz || ''}`, `valores: ${a.valores || 'λ'}`, `vectores: ${a.vectores || 'n'}`].join('\n');
}

export function markdownItPlot(md) {
  if (md.__cuadernoPlot) return;
  md.__cuadernoPlot = true;
  const orig = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const t = tokens[idx];
    if (t.info.trim() === 'plot') return `<div data-type="plot" data-src="${escAttr(t.content)}"></div>\n`;
    if (t.info.trim() === 'autovalores') return `<div data-type="eigen" data-src="${escAttr(t.content)}"></div>\n`;
    if (t.info.trim() === 'resolver') return `<div data-type="solver" data-src="${escAttr(t.content)}"></div>\n`;
    return orig ? orig(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
  };
}
