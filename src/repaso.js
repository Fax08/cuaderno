// Tarjetas de repaso con repetición espaciada (estilo Anki, simplificado).
// Las tarjetas salen de las tablas de las páginas de vocabulario: 1.ª columna = frente, 2.ª = respuesta,
// 3.ª = ejemplo, 4.ª = notas. El progreso se guarda en ".repaso.json" en la carpeta de notas.
import { esc } from './ui.js';
import { today } from './templates.js';

const STORE = '.repaso.json';
const NEW_PER_DAY = 20;

const clean = (s) => s.replace(/\\([[\]|*_`])/g, '$1').replace(/\*\*(.*?)\*\*/g, '$1').replace(/<[^>]+>/g, '').trim();
export const cardId = (front) => front.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

// Tablas Markdown → tarjetas
export function parseCards(text, page) {
  const lines = text.split(/\r?\n/);
  const cards = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/^\s*\|.*\|\s*$/.test(lines[i]) || !/^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(lines[i + 1])) continue;
    if (/^\s*\|\s*pronombre/i.test(lines[i])) { i += 1; continue; } // tabla de conjugación, no tarjetas
    let j = i + 2;
    for (; j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j]); j++) {
      const cells = lines[j].trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(clean);
      if (cells[0] && cells[1]) cards.push({ front: cells[0], back: cells[1], ejemplo: cells[2] || '', notas: cells[3] || '', page });
    }
    i = j;
  }
  return cards;
}

export async function loadStore(root) {
  try {
    const fh = await root.getFileHandle(STORE);
    return JSON.parse(await (await fh.getFile()).text());
  } catch { return {}; }
}

async function saveStore(root, store) {
  const fh = await root.getFileHandle(STORE, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(store, null, 1));
  await w.close();
}

const addDays = (n) => {
  const [y, m, d] = today().split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

// Tarjetas para hoy: las vencidas primero, después hasta NEW_PER_DAY nuevas
export function dueCards(cards, store) {
  const seen = new Set();
  const unique = cards.filter((c) => { const id = cardId(c.front); if (seen.has(id)) return false; seen.add(id); return true; });
  const t = today();
  const due = unique.filter((c) => store[cardId(c.front)] && store[cardId(c.front)].due <= t);
  const fresh = unique.filter((c) => !store[cardId(c.front)]).slice(0, NEW_PER_DAY);
  return { due, fresh, total: unique.length, queue: [...due, ...fresh] };
}

// Próximo intervalo (días) según la respuesta: 1 otra vez, 2 difícil, 3 bien, 4 fácil
function schedule(s, grade) {
  const st = { ivl: 0, ease: 2.5, reps: 0, lapses: 0, ...(s || {}) };
  if (grade === 1) return { ...st, reps: 0, ivl: 0, ease: Math.max(1.3, st.ease - 0.2), lapses: st.lapses + 1 };
  let ivl;
  if (st.reps === 0) ivl = grade === 2 ? 1 : grade === 3 ? 1 : 4;
  else if (st.reps === 1) ivl = grade === 2 ? 2 : grade === 3 ? 3 : 6;
  else ivl = Math.round(st.ivl * (grade === 2 ? 1.2 : grade === 3 ? st.ease : st.ease * 1.3));
  const ease = Math.max(1.3, st.ease + (grade === 2 ? -0.15 : grade === 4 ? 0.15 : 0));
  return { ...st, reps: st.reps + 1, ivl: Math.max(1, ivl), ease };
}
const ivlLabel = (d) => (d <= 0 ? 'ahora' : d === 1 ? '1 día' : d < 30 ? `${d} días` : d < 365 ? `${Math.round(d / 30)} mes${Math.round(d / 30) > 1 ? 'es' : ''}` : `${(d / 365).toFixed(1)} años`);

export async function startReview({ root, cards, title, onClose }) {
  const store = await loadStore(root);
  const { queue } = dueCards(cards, store);
  let reverse = false;
  let idx = 0;
  let shown = false;
  let done = 0;
  const work = [...queue];

  const el = document.createElement('div');
  el.className = 'review';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Repaso de tarjetas');
  document.body.appendChild(el);

  function render() {
    const card = work[idx];
    if (!card) {
      el.innerHTML = `<div class="rv-box">
        <div class="rv-head"><span>${esc(title)}</span><button type="button" class="icon-btn" data-close aria-label="Cerrar">×</button></div>
        <div class="rv-card rv-end"><p class="rv-big">${done ? '¡Listo por hoy!' : 'No hay tarjetas para repasar hoy.'}</p>
        <p class="rv-muted">${done ? `Repasaste ${done} tarjeta${done === 1 ? '' : 's'}. ` : ''}Las próximas aparecen solas el día que les toca.</p>
        <button type="button" class="btn primary" data-close>Cerrar</button></div></div>`;
      return;
    }
    const st = store[cardId(card.front)];
    const front = reverse ? card.back : card.front;
    const back = reverse ? card.front : card.back;
    const opts = [1, 2, 3, 4].map((g) => (g === 1 ? 'ahora' : ivlLabel(schedule(st, g).ivl)));
    el.innerHTML = `<div class="rv-box">
      <div class="rv-head">
        <span>${esc(title)}</span>
        <span class="rv-count">${idx + 1} / ${work.length}</span>
        <label class="rv-dir"><input type="checkbox" ${reverse ? 'checked' : ''} data-reverse> Al revés</label>
        <button type="button" class="icon-btn" data-close aria-label="Cerrar">×</button>
      </div>
      <div class="rv-card">
        ${st ? '' : '<span class="rv-new">nueva</span>'}
        <p class="rv-big">${esc(front)}</p>
        ${shown ? `<hr><p class="rv-answer">${esc(back)}</p>
          ${card.ejemplo ? `<p class="rv-ex">${esc(card.ejemplo)}</p>` : ''}
          ${card.notas ? `<p class="rv-muted">${esc(card.notas)}</p>` : ''}
          <p class="rv-from">${esc(card.page)}</p>` : ''}
      </div>
      <div class="rv-actions">
        ${shown
          ? `<button type="button" class="rv-grade g1" data-g="1">Otra vez<small>${opts[0]} · 1</small></button>
             <button type="button" class="rv-grade g2" data-g="2">Difícil<small>${opts[1]} · 2</small></button>
             <button type="button" class="rv-grade g3" data-g="3">Bien<small>${opts[2]} · 3</small></button>
             <button type="button" class="rv-grade g4" data-g="4">Fácil<small>${opts[3]} · 4</small></button>`
          : '<button type="button" class="btn primary big" data-show>Mostrar respuesta <small>(espacio)</small></button>'}
      </div>
    </div>`;
  }

  async function grade(g) {
    const card = work[idx];
    const id = cardId(card.front);
    const next = schedule(store[id], g);
    store[id] = { ...next, due: addDays(next.ivl) };
    if (g === 1) work.splice(Math.min(idx + 4, work.length), 0, card); // vuelve a aparecer en esta sesión
    else done++;
    idx++;
    shown = false;
    render();
    try { await saveStore(root, store); } catch { /* se reintenta en la próxima respuesta */ }
  }

  function close() {
    document.removeEventListener('keydown', onKey, true);
    el.remove();
    onClose?.();
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (!work[idx]) return;
    if (!shown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); shown = true; render(); return; }
    if (shown && ['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); grade(Number(e.key)); }
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    if (e.target.closest('[data-show]')) { shown = true; render(); return; }
    const g = e.target.closest('[data-g]');
    if (g) grade(Number(g.dataset.g));
  });
  el.addEventListener('change', (e) => {
    if (e.target.matches('[data-reverse]')) { reverse = e.target.checked; shown = false; render(); }
  });
  document.addEventListener('keydown', onKey, true);
  render();
}
