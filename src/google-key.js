// Ventana para conectar Google Translate con una clave de API propia.
// La clave queda guardada solo en este navegador (localStorage); nunca en las notas ni en GitHub.
import { googleKey, testGoogleKey } from './translate.js';
import { esc } from './ui.js';

const STEPS = [
  'Entrá a <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">console.cloud.google.com</a> con tu cuenta de Google.',
  'Arriba, en el selector de proyectos: <b>Proyecto nuevo</b> → nombre “Cuaderno” → Crear.',
  '<b>Facturación</b>: vinculá una tarjeta. Los primeros 500.000 caracteres por mes son gratis (para notas, es mucho).',
  '<b>APIs y servicios → Biblioteca</b> → buscá “Cloud Translation API” → <b>Habilitar</b>.',
  '<b>APIs y servicios → Credenciales → Crear credenciales → Clave de API</b>.',
  'Editá la clave: en <b>Restricciones de aplicaciones</b> elegí “Sitios web” y agregá <code>https://fax08.github.io/*</code>; en <b>Restricciones de API</b> elegí “Cloud Translation API”. Así la clave solo sirve para esta app.',
  'Opcional, para no pagar nunca: en <b>APIs y servicios → Cloud Translation API → Cuotas</b> limitá los caracteres por día (por ejemplo 15.000).',
  'Copiá la clave y pegala acá abajo.',
];

export function showGoogleKeyDialog() {
  const dlg = document.createElement('dialog');
  dlg.className = 'dialog google-key';
  const current = googleKey.get();
  dlg.innerHTML = `<form class="dialog-body-pad" method="dialog">
    <div class="help-top"><h2>Conectar Google Translate</h2><button type="button" class="icon-btn" data-close aria-label="Cerrar">×</button></div>
    <p class="dialog-text">Con Google, las oraciones se traducen con mucha mejor calidad. Se configura una sola vez.</p>
    <ol class="gk-steps">${STEPS.map((s) => `<li>${s}</li>`).join('')}</ol>
    <label class="dialog-field"><span>Clave de API</span><input id="gkInput" type="password" autocomplete="off" spellcheck="false" placeholder="AIza…" value="${esc(current)}"></label>
    <p class="gk-status" id="gkStatus">${current ? 'Hay una clave guardada en este navegador.' : ''}</p>
    <p class="dialog-text small">La clave queda guardada solo en este navegador: no se escribe en tus notas ni se sube a GitHub. Lo que traducís (la palabra u oración) se envía a Google.</p>
    <div class="dialog-actions">
      ${current ? '<button type="button" class="btn" data-remove>Quitar clave</button>' : ''}
      <button type="button" class="btn" data-test>Probar</button>
      <button type="submit" class="btn primary" data-save>Guardar</button>
    </div>
  </form>`;
  document.body.appendChild(dlg);
  const input = dlg.querySelector('#gkInput');
  const status = dlg.querySelector('#gkStatus');
  const setStatus = (msg, kind = '') => { status.textContent = msg; status.dataset.kind = kind; };
  const close = () => { dlg.close(); dlg.remove(); };
  async function test() {
    const key = input.value.trim();
    if (!key) { setStatus('Pegá la clave primero.', 'bad'); return false; }
    setStatus('Probando…');
    try {
      const t = await testGoogleKey(key);
      setStatus(`✓ Funciona: “Guten Morgen” → “${t}”.`, 'ok');
      return true;
    } catch (e) {
      setStatus(e.message, 'bad');
      return false;
    }
  }
  dlg.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) close();
    else if (e.target.closest('[data-test]')) test();
    else if (e.target.closest('[data-remove]')) { googleKey.set(''); close(); }
  });
  dlg.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!input.value.trim()) { googleKey.set(''); close(); return; }
    if (await test()) { googleKey.set(input.value.trim()); setTimeout(close, 900); }
  });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.showModal();
  input.focus();
}
