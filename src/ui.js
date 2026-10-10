// Diálogos y avisos pequeños.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export { esc };

// ask({ title, fields: [{ name, label, value, type, placeholder, options }], ok }) → objeto con valores o null
export function ask({ title, text, fields = [], ok = 'Aceptar', danger = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog';
    dlg.innerHTML = `<form method="dialog">
      <h2>${esc(title)}</h2>
      ${text ? `<p class="dialog-text">${esc(text)}</p>` : ''}
      ${fields.map((f, i) => `<label class="dialog-field"><span>${esc(f.label)}</span>${
        f.options
          ? `<select name="${f.name}" id="dlg-${f.name}">${f.options.map((o) => `<option${o === f.value ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`
          : `<input name="${f.name}" id="dlg-${f.name}" type="${f.type || 'text'}" value="${esc(f.value)}" placeholder="${esc(f.placeholder)}"${i === 0 ? ' autofocus' : ''}${f.required ? ' required' : ''}>`
      }</label>`).join('')}
      <div class="dialog-actions">
        <button type="button" class="btn" value="cancel">Cancelar</button>
        <button type="submit" class="btn ${danger ? 'danger' : 'primary'}" value="ok">${esc(ok)}</button>
      </div>
    </form>`;
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    const done = (val) => { dlg.close(); dlg.remove(); resolve(val); };
    dlg.querySelector('[value="cancel"]').addEventListener('click', () => done(null));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const out = {};
      fields.forEach((f) => { out[f.name] = form.elements[f.name].value.trim(); });
      done(out);
    });
    dlg.showModal();
  });
}

let toastTimer;
export function toast(msg, kind = '') {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
