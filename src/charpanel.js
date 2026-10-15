// Panel de caracteres especiales para el texto (no fórmulas), en la columna del índice.
// Aparece solo si "Caracteres especiales" está activado en la barra; mientras se edita una
// ecuación, en su lugar está el panel de símbolos matemáticos.
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};

const chars = (s) => [...s.replace(/\s+/g, '')];
const GROUPS = [
  ['Recientes', null],
  ['Griegas', chars('αβγδεζηθικλμνξπρσςτυφχψω ΓΔΘΛΞΠΣΦΨΩ ϕϑε∂')],
  ['Sub/sup', [
    { mark: 'subscript', label: 'x₂', title: 'Subíndice: lo que escribas queda abajo (Ctrl+,)' },
    { mark: 'superscript', label: 'x²', title: 'Superíndice: lo que escribas queda arriba (Ctrl+.)' },
    ...chars('₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓᵢⱼₖₗₘₙₚₛₜᵤᵥ ⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ'),
  ]],
  ['Operadores', chars('±∓×·÷≈≠≡≤≥≪≫∝∞√∛∑∏∫∮∂∇∆°′″‰∈∉⊂∀∃⊥∥∠≅∼⊗∘')],
  ['Flechas', chars('→←↔↑↓⇒⇐⇔↗↘↦⟶')],
  ['Unidades', ['µ', '²', '³', 'm²', 'm³', 'cm²', 'cm⁴', 'kN·m', 'kN/m', 'kN/m³', 'N/mm²', '°C', 'Ω', '‰', '%']],
  ['Alemán', chars('äöüßÄÖÜẞ„“‚‘«»')],
  ['Español', chars('áéíóúñÁÉÍÓÚÑü¿¡—–…•')],
];

export const charPanel = {
  enabled: ls.get('cuaderno.chars.on', false),
  listeners: new Set(),
  set(v) {
    this.enabled = v;
    ls.set('cuaderno.chars.on', v);
    this.listeners.forEach((fn) => fn());
  },
};

export function createCharPanel(host, editor, isPageOpen) {
  const el = document.createElement('section');
  el.className = 'sym-panel char-panel';
  el.hidden = true;
  el.setAttribute('aria-label', 'Caracteres especiales');
  let tab = ls.get('cuaderno.chars.tab', 1);
  let recent = ls.get('cuaderno.chars.recent', []);
  let mathActive = false;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const items = () => (tab === 0 ? recent : GROUPS[tab][1]);

  function render() {
    const list = items();
    el.innerHTML = `
      <div class="sym-head"><span class="sym-title">Caracteres</span>
        <button type="button" class="sym-x" data-off title="Ocultar (botón Caracteres de la barra)" aria-label="Ocultar">×</button></div>
      <div class="sym-tabs" role="tablist">${GROUPS.map(([name], i) => `<button type="button" role="tab" class="sym-tab${i === tab ? ' on' : ''}" data-tab="${i}" aria-selected="${i === tab}">${name}</button>`).join('')}</div>
      <div class="char-grid">${list.length ? list.map((it, i) => {
        if (typeof it === 'object') {
          const on = editor.isActive(it.mark);
          return `<button type="button" class="char-btn mark${on ? ' on' : ''}" data-i="${i}" title="${esc(it.title)}">${esc(it.label)}</button>`;
        }
        return `<button type="button" class="char-btn${it.length > 1 ? ' wide' : ''}" data-i="${i}" title="${esc(it)}">${esc(it)}</button>`;
      }).join('') : '<p class="sym-hint">Los caracteres que uses van a aparecer acá.</p>'}</div>
      <p class="sym-hint">Se insertan donde está el cursor. Subíndice <code>Ctrl+,</code> · superíndice <code>Ctrl+.</code></p>`;
  }

  function update() {
    const show = charPanel.enabled && isPageOpen() && !mathActive;
    if (show && el.hidden) render();
    el.hidden = !show;
  }

  // Mantener el cursor en el texto mientras se usan los botones
  el.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-off]')) { charPanel.set(false); return; }
    const t = e.target.closest('[data-tab]');
    if (t) { tab = Number(t.dataset.tab); ls.set('cuaderno.chars.tab', tab); render(); return; }
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const it = items()[Number(b.dataset.i)];
    if (typeof it === 'object') {
      editor.chain().focus().toggleMark(it.mark).run();
      render();
      return;
    }
    editor.chain().focus().insertContent(it).run();
    recent = [it, ...recent.filter((x) => x !== it)].slice(0, 24);
    ls.set('cuaderno.chars.recent', recent);
    if (tab === 0) render();
  });

  // Mientras se edita una ecuación se muestra el panel de símbolos matemáticos
  document.addEventListener('focusin', (e) => { if (e.target && e.target.tagName === 'MATH-FIELD') { mathActive = true; update(); } });
  document.addEventListener('focusout', (e) => {
    if (!e.target || e.target.tagName !== 'MATH-FIELD') return;
    setTimeout(() => { const a = document.activeElement; mathActive = !!(a && a.tagName === 'MATH-FIELD'); update(); }, 220);
  });
  // Estado de los botones de subíndice/superíndice según dónde esté el cursor
  editor.on('selectionUpdate', () => { if (!el.hidden && tab === 2) render(); });

  charPanel.listeners.add(update);
  host.prepend(el);
  return { update };
}
