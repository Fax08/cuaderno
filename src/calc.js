// Motor de cálculo tipo MathCad.
// Traduce el LaTeX de las ecuaciones a expresiones de math.js y las evalúa en orden:
//   P := 50 kN          define
//   σ := P/A            define a partir de otras
//   σ =                 muestra el resultado
//   σ = MPa             muestra el resultado en esa unidad
//   f(x) := q x/2 (L-x) define una función
import { create, all } from 'mathjs';

export const math = create(all);
for (const [name, def] of [['tf', '9.80665 kN'], ['kgf', '9.80665 N']]) {
  try { math.createUnit(name, def); } catch { /* ya existe */ }
}

export class CalcError extends Error {}

// ---------- productos de vectores ----------
// "·" entre dos vectores es el producto escalar; "×" entre dos vectores de 3 componentes es el
// producto vectorial. Entre matrices o números se comportan como el producto de siempre.
const vecShape = (v) => {
  if (!math.isMatrix(v) && !Array.isArray(v)) return null;
  const size = math.size(v).valueOf();
  if (size.length === 1) return { n: size[0], kind: 'row1d' };
  if (size.length === 2 && size[1] === 1) return { n: size[0], kind: 'col' };
  if (size.length === 2 && size[0] === 1) return { n: size[1], kind: 'row' };
  return null;
};
const flat = (v) => math.flatten(math.isMatrix(v) ? v.toArray() : v);
const sumAll = (arr) => arr.reduce((acc, x) => (acc === null ? x : math.add(acc, x)), null);
const vdot = (a, b) => {
  const sa = vecShape(a), sb = vecShape(b);
  if (sa && sb) {
    if (sa.n !== sb.n) throw new CalcError(`Producto escalar: los vectores tienen ${sa.n} y ${sb.n} componentes`);
    const x = flat(a), y = flat(b);
    return sumAll(x.map((xi, i) => math.multiply(xi, y[i])));
  }
  return math.multiply(a, b);
};
const vcross = (a, b) => {
  const sa = vecShape(a), sb = vecShape(b);
  if (sa && sb) {
    if (sa.n !== 3 || sb.n !== 3) throw new CalcError('El producto vectorial (×) necesita dos vectores de 3 componentes');
    const [a1, a2, a3] = flat(a), [b1, b2, b3] = flat(b);
    const c = [
      math.subtract(math.multiply(a2, b3), math.multiply(a3, b2)),
      math.subtract(math.multiply(a3, b1), math.multiply(a1, b3)),
      math.subtract(math.multiply(a1, b2), math.multiply(a2, b1)),
    ];
    return math.matrix(sa.kind === 'col' ? c.map((x) => [x]) : sa.kind === 'row' ? [c] : c);
  }
  if (sa || sb) throw new CalcError('El producto vectorial (×) es entre dos vectores; para multiplicar por un número usá ·');
  return math.multiply(a, b);
};
// |v| de un vector es su módulo; de un número, el valor absoluto
const vabs = (v) => {
  if (vecShape(v)) { const x = flat(v); return math.sqrt(sumAll(x.map((xi) => math.multiply(xi, xi)))); }
  return math.abs(v);
};
math.import({ vdot, vcross, vabs }, { override: true });

// ---------- contexto: variables y funciones definidas hasta un punto de la página ----------
export class Ctx {
  constructor(scope = {}, funcs = new Set()) { this.scope = scope; this.funcs = funcs; }
  has(name) { return Object.prototype.hasOwnProperty.call(this.scope, `v_${name}`); }
  get(name) { return this.scope[`v_${name}`]; }
  set(name, value) { this.scope[`v_${name}`] = value; }
  isFunc(name) { return this.funcs.has(name); }
  isMatrix(name) { return math.isMatrix(this.get(name)); }
  snapshot() { return new Ctx({ ...this.scope }, new Set(this.funcs)); }
}

// ---------- vocabulario ----------
const GREEK = new Set(('alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi omicron pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega ' +
  'Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega ell').split(' '));

const FUNCS = {
  sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc',
  sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
  arcsin: 'asin', arccos: 'acos', arctan: 'atan', asin: 'asin', acos: 'acos', atan: 'atan', arctg: 'atan', tg: 'tan',
  ln: 'log', log: 'log10', exp: 'exp', sqrt: 'sqrt', abs: 'abs',
  det: 'det', tr: 'trace', traza: 'trace', trace: 'trace', inv: 'inv', transpose: 'transpose', diag: 'diag', norm: 'norm',
  max: 'max', min: 'min', round: 'round', floor: 'floor', ceil: 'ceil', sgn: 'sign', sign: 'sign',
  cross: 'cross', dot: 'dot', mod: 'mod',
};

const DECORATORS = new Set(['mathbf', 'boldsymbol', 'bm', 'vec', 'hat', 'bar', 'tilde', 'mathbfit', 'mathit', 'overline', 'underline', 'mathcal', 'mathbb']);
const UPRIGHT = new Set(['operatorname', 'mathrm', 'text', 'textrm', 'mathsf', 'textit', 'textbf', 'mbox']);

// Letras sueltas que se aceptan como unidad si no hay una variable con ese nombre.
export const SINGLE_UNITS = new Set(['m', 's', 'N', 'J', 'W']);

// Unidades que se aceptan después de "=" para pedir una conversión (σ = MPa).
export const TARGET_UNITS = new Set(('m cm mm km um dm N kN MN daN Pa kPa MPa GPa hPa bar kg g t ton tonne tf kgf ' +
  's ms min h hr day deg rad J kJ MJ W kW MW L l kip lbf psi ksi in ft yd mi Hz rpm').split(' '));

const isUnit = (word) => { try { return math.Unit.isValuelessUnit(word); } catch { return false; } };

const cleanSub = (raw) => raw
  .replace(/\\(text|mathrm|operatorname|mathit|mathbf|rm)\s*/g, '')
  .replace(/\\([A-Za-z]+)/g, '$1')
  .replace(/[^A-Za-z0-9]/g, '');

// ---------- traductor LaTeX → math.js ----------
function pushTok(toks, tok) {
  const prev = toks[toks.length - 1];
  if (tok.k === 'val' && prev && prev.k === 'fn') {
    toks.pop();
    return pushTok(toks, { k: 'val', s: `${prev.s}${tok.paren ? tok.s : `(${tok.s})`}`, paren: true });
  }
  if ((tok.k === 'val' || tok.k === 'fn') && prev && prev.k === 'val') toks.push({ k: 'op', s: '*' });
  toks.push(tok);
}
const emit = (toks) => {
  if (toks.length && toks[toks.length - 1].k === 'fn') throw new CalcError('Falta el argumento de una función');
  if (!toks.some((t) => t.k === 'op' && t.kind)) return toks.map((t) => t.s).join(' ');
  // Hay "·" o "×": se arma cada término a mano para convertirlos en vdot()/vcross()
  let i = 0;
  const factor = () => {
    let s = '';
    while (i < toks.length && toks[i].k === 'op' && (toks[i].s === '-' || toks[i].s === '+')) s += toks[i++].s;
    if (i >= toks.length || toks[i].k !== 'val') throw new CalcError('Falta un término en la operación');
    s += toks[i++].s;
    while (i < toks.length && toks[i].k === 'op' && toks[i].s === '^') { s += ` ^ ${toks[i + 1].s}`; i += 2; }
    return s;
  };
  const term = () => {
    let acc = factor();
    while (i < toks.length && toks[i].k === 'op' && (toks[i].s === '*' || toks[i].s === '/')) {
      const op = toks[i++];
      const f = factor();
      acc = op.kind === 'dot' ? `vdot(${acc}, ${f})` : op.kind === 'cross' ? `vcross(${acc}, ${f})` : `(${acc}) ${op.s} (${f})`;
    }
    return acc;
  };
  let out = term();
  while (i < toks.length) { const op = toks[i++]; out += ` ${op.s} ${term()}`; }
  return out;
};

class Conv {
  constructor(src, ctx, unitHint = false) { this.s = src; this.i = 0; this.ctx = ctx; this.unitHint = unitHint; this.sawUnit = false; }
  unitTok(s) { this.sawUnit = true; return { k: 'val', s, unit: true }; }

  // Una letra suelta (m, s, N…) es unidad solo pegada a un número o a otra unidad: 6m, 9.81m/s^2.
  unitPos(toks) {
    const n = toks.length;
    const last = toks[n - 1];
    if (!last) return this.unitHint;
    if (last.k === 'val') return !!(last.num || last.unit);
    if (last.k === 'op' && (last.s === '*' || last.s === '/')) return !!(toks[n - 2] && toks[n - 2].unit);
    return false;
  }
  err(msg) { throw new CalcError(msg); }
  eof() { return this.i >= this.s.length; }
  peek() { return this.s[this.i]; }
  rest() { return this.s.slice(this.i); }

  skipSpace() {
    for (;;) {
      const c = this.s[this.i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '~') { this.i++; continue; }
      if (c === '\\') {
        const m = /^\\(?:[,;:!> ]|(?:quad|qquad|thinspace|medspace|thickspace|enspace|enskip|negthinspace|displaystyle|textstyle|scriptstyle)(?![A-Za-z]))/.exec(this.rest());
        if (m) { this.i += m[0].length; continue; }
      }
      return;
    }
  }

  readBraced() {
    let depth = 0;
    const start = this.i;
    for (; this.i < this.s.length; this.i++) {
      const c = this.s[this.i];
      if (c === '\\') { this.i++; continue; }
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) { this.i++; return this.s.slice(start + 1, this.i - 1); }
    }
    return this.err('Falta cerrar una llave');
  }

  readArg() {
    this.skipSpace();
    const c = this.peek();
    if (c === undefined) this.err('Falta un argumento');
    if (c === '{') return this.readBraced();
    if (c === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(this.rest()); this.i += m[0].length; return m[0]; }
    this.i++;
    return c;
  }

  readOptional() {
    this.skipSpace();
    if (this.peek() !== '[') return null;
    let depth = 0;
    const start = this.i;
    for (; this.i < this.s.length; this.i++) {
      const c = this.s[this.i];
      if (c === '[') depth++;
      else if (c === ']' && --depth === 0) { this.i++; return this.s.slice(start + 1, this.i - 1); }
    }
    return this.err('Falta cerrar un corchete');
  }

  readCmd() {
    const m = /^\\([A-Za-z]+|.)/.exec(this.rest());
    if (!m) this.err('Barra invertida suelta');
    this.i += m[0].length;
    return m[1];
  }

  readSub() {
    const save = this.i;
    this.skipSpace();
    if (this.peek() === '_') { this.i++; return cleanSub(this.readArg()); }
    this.i = save;
    return null;
  }

  // S' o S^{\prime}: forma parte del nombre (componentes en ejes rotados)
  readPrime() {
    const save = this.i;
    this.skipSpace();
    if (this.peek() === "'") { this.i++; return true; }
    const m = /^\^\s*(?:\{\s*\\prime\s*\}|\\prime(?![A-Za-z]))/.exec(this.rest());
    if (m) { this.i += m[0].length; return true; }
    this.i = save;
    return false;
  }

  readDelim() {
    this.skipSpace();
    if (this.peek() === '\\') return `\\${this.readCmd()}`;
    const c = this.peek();
    this.i++;
    return c;
  }

  sub(src) { return convert(src, this.ctx); }

  varTok(name) {
    if (this.ctx.isFunc(name)) return { k: 'fn', s: `v_${name}` };
    return { k: 'val', s: `v_${name}`, matrix: this.ctx.isMatrix(name), name };
  }

  // Corrida de letras: variable, producto de variables o unidad.
  resolveRun(run, sub, toks = []) {
    const ctx = this.ctx;
    if (sub) {
      const full = `${run}_${sub}`;
      if (run.length === 1 || ctx.has(full)) return [this.varTok(full)];
      return [...this.resolveRun(run.slice(0, -1), null, toks), this.varTok(`${run.slice(-1)}_${sub}`)];
    }
    if (ctx.has(run)) return [this.varTok(run)];
    if (run.length > 1 && [...run].every((ch) => ctx.has(ch))) return [...run].map((ch) => this.varTok(ch));
    if (run.length > 1 && FUNCS[run]) return [{ k: 'fn', s: FUNCS[run] }];
    if (run.length > 1 && isUnit(run)) return [this.unitTok(run)];
    if (run.length === 1) {
      if (run === 'e') return [{ k: 'val', s: 'e' }];
      if (SINGLE_UNITS.has(run) && this.unitPos(toks)) return [this.unitTok(run)];
      return [this.varTok(run)];
    }
    return [...run].flatMap((ch) => this.resolveRun(ch, null, toks));
  }

  matrix(env) {
    if (env === 'array') this.readArg();
    const endTag = `\\end{${env}}`;
    const end = this.s.indexOf(endTag, this.i);
    if (end < 0) this.err('Falta cerrar la matriz');
    const body = this.s.slice(this.i, end);
    this.i = end + endTag.length;
    const rows = body.split(/\\\\/).map((r) => r.trim()).filter(Boolean);
    if (!rows.length) this.err('La matriz está vacía');
    const arr = `[${rows.map((r) => `[${r.split('&').map((c) => {
      if (!c.trim()) this.err('Hay una celda vacía en la matriz');
      return this.sub(c);
    }).join(', ')}]`).join(', ')}]`;
    if (env === 'vmatrix') return { k: 'val', s: `det(${arr})`, paren: true };
    return { k: 'val', s: arr, matrix: true, paren: true };
  }

  closeFrame(frames) {
    if (frames.length === 1) this.err('Sobra un paréntesis de cierre');
    const f = frames.pop();
    const inner = emit(f.toks);
    if (!inner.trim()) this.err('Hay un paréntesis vacío');
    const tok = f.type === 'abs' ? { k: 'val', s: `vabs(${inner})`, paren: true } : { k: 'val', s: `(${inner})`, paren: true, matrix: f.toks.length === 1 && f.toks[0].matrix };
    pushTok(frames[frames.length - 1].toks, tok);
  }

  power(toks) {
    const arg = this.readArg().trim();
    const last = toks[toks.length - 1];
    if (!last || last.k !== 'val') this.err('Hay un exponente sin base');
    if (['T', '\\top', '\\intercal', '\\mathsf{T}', '\\mathrm{T}', 't'].includes(arg) && (last.matrix || arg !== 't')) {
      last.s = `transpose(${last.s})`; last.paren = true; return;
    }
    if (arg === '\\circ') { pushTok(toks, this.unitTok('deg')); return; }
    if (arg === '-1' && last.matrix) { last.s = `inv(${last.s})`; last.paren = true; return; }
    if (arg === '\\prime' || arg === '\\doubleprime' || arg === "'") this.err('No calculo derivadas con prima');
    toks.push({ k: 'op', s: '^' });
    toks.push({ k: 'val', s: `(${this.sub(arg)})`, paren: true });
  }

  command(frames) {
    const top = () => frames[frames.length - 1].toks;
    const push = (t) => pushTok(top(), t);
    const name = this.readCmd();
    const ctx = this.ctx;

    if (GREEK.has(name)) {
      const p1 = this.readPrime();
      const sub = this.readSub();
      const prime = p1 || this.readPrime();
      if (name === 'pi' && !sub && !prime && !ctx.has('pi')) return push({ k: 'val', s: 'pi' });
      return push(this.varTok(`${sub ? `${name}_${sub}` : name}${prime ? '_prime' : ''}`));
    }
    if (DECORATORS.has(name)) {
      const inner = cleanSub(this.readArg());
      const p1 = this.readPrime();
      const sub = this.readSub();
      const prime = p1 || this.readPrime();
      if (!inner) this.err(`\\${name} vacío`);
      return push(this.varTok(`${sub ? `${inner}_${sub}` : inner}${prime ? '_prime' : ''}`));
    }
    if (UPRIGHT.has(name)) {
      const word = this.readArg().replace(/\\[,;: ]/g, '').trim();
      const sub = this.readSub();
      if (!sub && FUNCS[word]) return push({ k: 'fn', s: FUNCS[word] });
      if (!sub && !ctx.has(word) && isUnit(word.replace(/\s+/g, ''))) return push(this.unitTok(word.replace(/\s+/g, '')));
      const id = cleanSub(word);
      if (!id) return undefined;
      return push(this.varTok(sub ? `${id}_${sub}` : id));
    }
    switch (name) {
      case 'frac': case 'dfrac': case 'tfrac': case 'cfrac': {
        const a = this.readArg(), b = this.readArg();
        // 12\frac{kN}{m}: si hay un número antes o la otra parte tiene unidades, las letras sueltas también lo son
        let hint = this.unitHint || this.unitPos(top());
        let ca = new Conv(a, ctx, hint), cb = new Conv(b, ctx, hint);
        let sa = ca.parse(), sb = cb.parse();
        if (!hint && (ca.sawUnit || cb.sawUnit)) {
          ca = new Conv(a, ctx, true); cb = new Conv(b, ctx, true);
          sa = ca.parse(); sb = cb.parse();
        }
        const unit = ca.sawUnit || cb.sawUnit;
        if (unit) this.sawUnit = true;
        return push({ k: 'val', s: `((${sa}) / (${sb}))`, paren: true, unit });
      }
      case 'sqrt': {
        const n = this.readOptional();
        const a = this.readArg();
        return push({ k: 'val', s: n ? `nthRoot(${this.sub(a)}, ${this.sub(n)})` : `sqrt(${this.sub(a)})`, paren: true });
      }
      case 'cdot': case 'bullet': return top().push({ k: 'op', s: '*', kind: 'dot' });
      case 'times': return top().push({ k: 'op', s: '*', kind: 'cross' });
      case 'ast': return top().push({ k: 'op', s: '*' });
      case 'div': return top().push({ k: 'op', s: '/' });
      case 'pm': case 'mp': return this.err('No calculo “±”: separalo en dos ecuaciones');
      case 'left': {
        const d = this.readDelim();
        if (d === '.') return undefined;
        frames.push({ type: (d === '|' || d === '\\vert' || d === '\\lvert' || d === '\\Vert' || d === '\\|' || d === '\\lVert') ? 'abs' : 'paren', toks: [] });
        return undefined;
      }
      case 'right': {
        const d = this.readDelim();
        if (d === '.') return undefined;
        return this.closeFrame(frames);
      }
      case 'lvert': case 'lVert': frames.push({ type: 'abs', toks: [] }); return undefined;
      case 'rvert': case 'rVert': return this.closeFrame(frames);
      case 'lbrack': case 'lbrace': case 'langle': case 'lparen': case '{': frames.push({ type: 'paren', toks: [] }); return undefined;
      case 'rbrack': case 'rbrace': case 'rangle': case 'rparen': case '}': return this.closeFrame(frames);
      case 'degree': return push(this.unitTok('deg'));
      case '%': return push({ k: 'val', s: '0.01' });
      case 'infty': return push({ k: 'val', s: 'Infinity' });
      case 'exponentialE': return push({ k: 'val', s: 'e' });
      case 'begin': return push(this.matrix(this.readArg().trim()));
      case 'placeholder': return this.err('Completá los espacios vacíos de la ecuación');
      case 'differentialD': case 'int': case 'iint': case 'oint': case 'sum': case 'prod': case 'lim': case 'partial': case 'nabla':
        return this.err('Todavía no calculo integrales, sumatorias ni derivadas. Escribila sin “=” al final y queda como fórmula.');
      case 'ne': case 'neq': case 'le': case 'ge': case 'leq': case 'geq': case 'lt': case 'gt': case 'approx': case 'equiv': case 'to': case 'rightarrow':
        return this.err('Esta ecuación tiene un símbolo de relación que no se calcula');
      default:
        if (FUNCS[name]) return push({ k: 'fn', s: FUNCS[name] });
        return this.err(`No sé calcular \\${name}`);
    }
  }

  parse() {
    const frames = [{ type: 'root', toks: [] }];
    const top = () => frames[frames.length - 1].toks;
    while (true) {
      this.skipSpace();
      if (this.eof()) break;
      const c = this.peek();
      if (/[0-9.]/.test(c)) {
        const m = /^(?:\d+\.?\d*|\.\d+)/.exec(this.rest());
        if (!m) this.err('Número mal escrito');
        this.i += m[0].length;
        pushTok(top(), { k: 'val', s: m[0], num: true });
      } else if (/[A-Za-z]/.test(c)) {
        const run = /^[A-Za-z]+/.exec(this.rest())[0];
        this.i += run.length;
        const p1 = this.readPrime();
        const sub = this.readSub();
        const prime = p1 || this.readPrime();
        const toks = this.resolveRun(run, sub, top());
        if (prime) {
          const last = toks.pop();
          toks.push(this.varTok(`${last.name ?? (sub ? `${run}_${sub}` : run)}_prime`));
        }
        for (const t of toks) pushTok(top(), t);
      } else if (c === '\\') {
        this.command(frames);
      } else if (c === '(' || c === '[' || c === '{') {
        this.i++;
        frames.push({ type: 'paren', toks: [] });
      } else if (c === ')' || c === ']' || c === '}') {
        this.i++;
        this.closeFrame(frames);
      } else if (c === '|') {
        this.i++;
        const f = frames[frames.length - 1];
        const last = f.toks[f.toks.length - 1];
        if (f.type === 'abs' && last && last.k === 'val') this.closeFrame(frames);
        else frames.push({ type: 'abs', toks: [] });
      } else if ('+-*/,'.includes(c)) {
        this.i++;
        top().push({ k: 'op', s: c });
      } else if (c === '^') {
        this.i++;
        this.power(top());
      } else if (c === '!') {
        this.i++;
        const last = top()[top().length - 1];
        if (!last || last.k !== 'val') this.err('Factorial sin número');
        last.s = `factorial(${last.s})`;
      } else if (c === '_') {
        this.err('Hay un subíndice fuera de lugar');
      } else if (c === "'") {
        this.err('No calculo derivadas con prima');
      } else if (c === '=') {
        this.err('Hay un “=” de más');
      } else if (c === '&') {
        this.err('Hay un “&” fuera de una matriz');
      } else {
        this.err(`No reconozco “${c}”`);
      }
    }
    if (frames.length > 1) this.err('Falta cerrar un paréntesis');
    const out = emit(frames[0].toks);
    if (!out.trim()) this.err('La expresión está vacía');
    return out;
  }

  // Nombre de variable a la izquierda de :=
  identifier() {
    this.skipSpace();
    let name = null;
    const c = this.peek();
    if (c && /[A-Za-z]/.test(c)) {
      name = /^[A-Za-z]+/.exec(this.rest())[0];
      this.i += name.length;
    } else if (c === '\\') {
      const cmd = this.readCmd();
      if (GREEK.has(cmd)) name = cmd;
      else if (DECORATORS.has(cmd) || UPRIGHT.has(cmd)) name = cleanSub(this.readArg());
    }
    if (!name) this.err('A la izquierda de “:=” tiene que ir un nombre, por ejemplo P o σ_x');
    const p1 = this.readPrime();
    const sub = this.readSub();
    const prime = p1 || this.readPrime();
    this.skipSpace();
    if (!this.eof()) this.err('A la izquierda de “:=” tiene que ir un solo nombre');
    return `${sub ? `${name}_${sub}` : name}${prime ? '_prime' : ''}`;
  }
}

export function convert(src, ctx) { return new Conv(src, ctx).parse(); }
const identName = (src) => new Conv(src, new Ctx()).identifier();

// ---------- formato de resultados ----------
export const settings = { digits: 4 };

const PREFERRED = ['MPa', 'kN', 'kN m', 'kN / m', 'kN / m^3', 'kN m^2', 'm', 'm^2', 'm^3', 'm^4', 'm / s', 'm / s^2', 's', 'kg', 'kg / m^3', 'rad', 'J', 'W'].map((u) => [u, math.unit(u)]);

export function autoUnit(u) {
  const units = u.formatUnits();
  if (/\bdeg\b/.test(units) && u.equalBase(math.unit('rad'))) return u.to('deg');
  for (const [name, ref] of PREFERRED) if (u.equalBase(ref)) return u.to(name);
  return u;
}

export function fmtNum(x) {
  if (typeof x !== 'number') return String(x);
  if (Number.isNaN(x)) return '\\text{NaN}';
  if (!Number.isFinite(x)) return x > 0 ? '\\infty' : '-\\infty';
  const a = Math.abs(x);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) {
    const [mant, exp] = x.toExponential(settings.digits - 1).split('e');
    return `${parseFloat(mant)}\\times10^{${parseInt(exp, 10)}}`;
  }
  return String(parseFloat(x.toPrecision(settings.digits)));
}

function unitLatex(str) {
  if (!str) return '';
  return str.split(/\s+/).filter(Boolean).map((t) => {
    if (t === '/') return '/';
    if (t === '(' || t === ')') return t;
    const m = /^([A-Za-z]+)(?:\^(-?[\d.]+))?$/.exec(t.replace(/[()]/g, ''));
    if (!m) return `\\mathrm{${t}}`;
    const base = m[1] === 'deg' ? '^{\\circ}' : `\\mathrm{${m[1]}}`;
    return m[2] ? `${base}^{${m[2]}}` : base;
  }).join('{\\cdot}').replace(/\{\\cdot\}\/\{\\cdot\}/g, '/');
}

function unitValueLatex(u) {
  const units = u.formatUnits();
  const num = fmtNum(u.toNumber(units));
  return units === 'deg' ? `${num}^{\\circ}` : `${num}\\,${unitLatex(units)}`;
}

export function valueToLatex(v, target) {
  if (typeof v === 'number') return fmtNum(v);
  if (typeof v === 'boolean') return v ? '\\text{verdadero}' : '\\text{falso}';
  if (typeof v === 'function') return '\\text{función}';
  if (math.isUnit(v)) {
    if (target) return unitValueLatex(v.to(target));
    return unitValueLatex(autoUnit(v));
  }
  if (math.isComplex(v)) return `${fmtNum(v.re)} ${v.im < 0 ? '-' : '+'} ${fmtNum(Math.abs(v.im))}\\,\\mathrm{i}`;
  if (math.isMatrix(v) || Array.isArray(v)) {
    let arr = math.isMatrix(v) ? v.toArray() : v;
    if (!Array.isArray(arr[0])) arr = arr.map((x) => [x]);
    const flat = arr.flat();
    let factor = '';
    if (flat.length && flat.every((x) => math.isUnit(x))) {
      const ref = target ? math.unit(target) : autoUnit(flat.find((x) => x.value !== 0) || flat[0]);
      const name = target || ref.formatUnits();
      arr = arr.map((row) => row.map((x) => x.toNumber(name)));
      factor = `\\,${unitLatex(name)}`;
    }
    const body = arr.map((row) => row.map((x) => (math.isUnit(x) ? unitValueLatex(autoUnit(x)) : fmtNum(x))).join(' & ')).join(' \\\\ ');
    return `\\begin{bmatrix} ${body} \\end{bmatrix}${factor}`;
  }
  return `\\text{${String(v).replace(/[{}\\]/g, '')}}`;
}

export function errText(e) {
  const msg = e && e.message ? e.message : String(e);
  let m = /Undefined symbol v_(\w+)/.exec(msg);
  if (m) return `“${prettyName(m[1])}” no está definida más arriba (definila con :=)`;
  m = /Undefined (?:symbol|function) (\w+)/.exec(msg);
  if (m) return `No reconozco “${m[1]}”`;
  if (/Units do not match|do not match/.test(msg)) return 'Las unidades no son compatibles';
  if (/Unit .* not found/.test(msg)) return 'No reconozco esa unidad';
  if (/Dimension mismatch|dimension/i.test(msg)) return 'Las dimensiones de las matrices no coinciden';
  if (/Cannot convert/.test(msg)) return 'No se puede convertir a esa unidad';
  if (e instanceof CalcError) return msg;
  return `No pude calcularlo: ${msg}`;
}

const GREEK_CHARS = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω' };
export function prettyName(name) {
  const prime = name.endsWith('_prime');
  const [base, ...sub] = (prime ? name.slice(0, -6) : name).split('_');
  return (GREEK_CHARS[base] || base) + (prime ? '′' : '') + (sub.length ? `_${sub.join('_')}` : '');
}

// ---------- sentencias ----------
const DEF_RE = /^([\s\S]*?)(?::=|\\coloneqq(?![A-Za-z])|\\coloneq(?![A-Za-z])|\\mathrel\{:=\})([\s\S]*)$/;

function lastTopEq(s) {
  let depth = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s[i];
    if (c === '}' || c === ')' || c === ']') depth++;
    else if (c === '{' || c === '(' || c === '[') depth--;
    else if (c === '=' && depth === 0 && s[i - 1] !== ':' && s[i - 1] !== '\\') return i;
  }
  return -1;
}

// "MPa", "\mathrm{kN}/\mathrm{m}^{2}", "kN\cdot m" → texto de unidad para math.js, o null
function unitTarget(src) {
  const plain = src
    .replace(/\\(?:mathrm|text|operatorname|textrm)\{([^}]*)\}/g, '$1')
    .replace(/\\(?:cdot|times|,|;|:|!)/g, ' ')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
    .replace(/\^\{([^}]*)\}/g, '^$1')
    .replace(/\\degree|\^\\circ/g, 'deg')
    .trim();
  if (!plain || /[\\={}]/.test(plain)) return null;
  const words = plain.match(/[A-Za-z]+/g);
  if (!words || !words.every((w) => TARGET_UNITS.has(w))) return null;
  try { math.unit(plain.replace(/\s+/g, ' ')); return plain; } catch { return null; }
}

function splitTail(rest) {
  const idx = lastTopEq(rest);
  if (idx < 0) return { rhs: rest, show: false, target: null };
  const after = rest.slice(idx + 1).trim();
  if (!after) return { rhs: rest.slice(0, idx), show: true, target: null };
  const target = unitTarget(after);
  if (target) return { rhs: rest.slice(0, idx), show: true, target };
  return { rhs: rest, show: false, target: null };
}

function evaluate(latex, ctx) {
  return math.evaluate(convert(latex, ctx), ctx.scope);
}

// Ejecuta una ecuación sobre el contexto. Devuelve null si no es un cálculo,
// o { kind: 'def' | 'eval', latex?, error? }.
export function runStatement(latex, ctx) {
  const s = (latex || '').replace(/\\(?:displaystyle|textstyle)(?![A-Za-z])/g, '').trim();
  if (!s) return null;
  const d = DEF_RE.exec(s);
  try {
    if (d) {
      const lhs = d[1].replace(/\\left|\\right/g, '').trim();
      const { rhs, show, target } = splitTail(d[2].trim());
      if (!rhs.trim()) throw new CalcError('Falta el valor a la derecha de “:=”');
      const fm = /^([\s\S]*?)\s*\(([\s\S]*)\)$/.exec(lhs);
      if (fm && fm[1].trim()) {
        const name = identName(fm[1]);
        const params = fm[2].split(',').map((p) => identName(p));
        const local = ctx.snapshot();
        local.funcs.delete(name);
        params.forEach((p) => { local.set(p, 1); local.funcs.delete(p); });
        const code = math.compile(convert(rhs, local));
        const base = { ...ctx.scope };
        const fn = (...args) => {
          if (args.length !== params.length) throw new CalcError(`${prettyName(name)} lleva ${params.length} argumento(s)`);
          const sc = { ...base };
          params.forEach((p, i) => { sc[`v_${p}`] = args[i]; });
          return code.evaluate(sc);
        };
        ctx.set(name, fn);
        ctx.funcs.add(name);
        return { kind: 'def', name };
      }
      const name = identName(lhs);
      const val = evaluate(rhs, ctx);
      ctx.set(name, val);
      ctx.funcs.delete(name);
      return show ? { kind: 'eval', name, latex: valueToLatex(val, target) } : { kind: 'def', name };
    }
    const idx = lastTopEq(s);
    if (idx < 0) return null;
    const left = s.slice(0, idx).trim();
    const right = s.slice(idx + 1).trim();
    if (!left) return null;
    let target = null;
    if (right) {
      target = unitTarget(right);
      if (!target) return null; // ecuación común, no es un cálculo
    }
    const prev = lastTopEq(left);
    const expr = prev >= 0 ? left.slice(prev + 1) : left;
    const val = evaluate(expr, ctx);
    return { kind: 'eval', latex: valueToLatex(val, target) };
  } catch (e) {
    return { kind: d ? 'def' : 'eval', error: errText(e) };
  }
}

// ---------- gráficos ----------
export function evalText(text, ctx) {
  return math.evaluate(convert(String(text), ctx), ctx.scope);
}

export function makeFn(latex, ctx, vars) {
  const local = ctx.snapshot();
  vars.forEach((v) => { local.set(v, 1); local.funcs.delete(v); });
  const code = math.compile(convert(latex, local));
  return (...vals) => {
    const sc = { ...local.scope };
    vars.forEach((v, i) => { sc[`v_${v}`] = vals[i]; });
    return code.evaluate(sc);
  };
}

const displayUnit = (u) => {
  const a = autoUnit(u);
  return math.isUnit(a) ? a.formatUnits() : null;
};

function toNum(v, unitName) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (math.isUnit(v)) {
    try { return unitName ? v.toNumber(unitName) : v.toNumber(); } catch { return null; }
  }
  return null;
}

// "de 0 a L": si un extremo tiene unidades y el otro es un número, le da la misma unidad
function matchUnits(a, b) {
  if (math.isUnit(b) && typeof a === 'number') a = math.unit(a, b.formatUnits());
  if (math.isUnit(a) && typeof b === 'number') b = math.unit(b, a.formatUnits());
  return [a, b];
}

function range(a, b, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(math.add(a, math.multiply(math.subtract(b, a), i / (n - 1))));
  return out;
}

export function samplePlot(spec, ctx) {
  const [a, b] = matchUnits(evalText(spec.xmin || '0', ctx), evalText(spec.xmax || '10', ctx));
  const xUnit = math.isUnit(b) ? displayUnit(b) : (math.isUnit(a) ? displayUnit(a) : null);
  if (spec.tipo === '3d') {
    const [c, d] = matchUnits(evalText(spec.ymin || '0', ctx), evalText(spec.ymax || '10', ctx));
    const yUnit = math.isUnit(d) ? displayUnit(d) : null;
    const N = Math.min(150, Math.max(10, parseInt(spec.puntos, 10) || 46));
    const xs = range(a, b, N), ys = range(c, d, N);
    const f = makeFn(spec.exprs[0] || '0', ctx, ['x', 'y']);
    let zUnit = null, firstErr = null, ok = 0;
    const z = ys.map((y) => xs.map((x) => {
      try {
        const v = f(x, y);
        if (math.isUnit(v) && !zUnit) zUnit = displayUnit(v);
        const n = toNum(v, zUnit);
        if (n !== null) ok++;
        return n;
      } catch (e) { firstErr = firstErr || e; return null; }
    }));
    if (!ok) throw firstErr || new CalcError('La función no da valores en ese rango');
    return { tipo: '3d', x: xs.map((x) => toNum(x, xUnit)), y: ys.map((y) => toNum(y, yUnit)), z, xUnit, yUnit, zUnit };
  }
  const N = Math.min(3000, Math.max(20, parseInt(spec.puntos, 10) || 241));
  const xs = range(a, b, N);
  let yUnit = null;
  const traces = (spec.exprs.length ? spec.exprs : ['0']).map((latex) => {
    const f = makeFn(latex, ctx, ['x']);
    let firstErr = null, ok = 0;
    const y = xs.map((x) => {
      try {
        const v = f(x);
        if (math.isUnit(v) && !yUnit) yUnit = displayUnit(v);
        const n = toNum(v, yUnit);
        if (n !== null) ok++;
        return n;
      } catch (e) { firstErr = firstErr || e; return null; }
    });
    if (!ok) throw firstErr || new CalcError('La función no da valores en ese rango');
    return { latex, y };
  });
  return { tipo: '2d', x: xs.map((x) => toNum(x, xUnit)), traces, xUnit, yUnit };
}

// ---------- motor de la página ----------
// Recorre las ecuaciones en orden y guarda los resultados por posición.
export const engine = {
  results: new Map(),
  snaps: new Map(),
  views: new Set(),
  run(doc) {
    const ctx = new Ctx();
    const results = new Map();
    const snaps = new Map();
    doc.descendants((node, pos) => {
      const t = node.type.name;
      if (t === 'mathInline' || t === 'mathBlock') {
        results.set(pos, runStatement(node.attrs.latex, ctx));
        return false;
      }
      if (t === 'plot') { snaps.set(pos, ctx.snapshot()); return false; }
      return true;
    });
    this.results = results;
    this.snaps = snaps;
    this.views.forEach((v) => v.refresh());
  },
};
