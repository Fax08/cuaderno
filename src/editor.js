// Editor de páginas: TipTap + Markdown, menú "/" y barra de herramientas.
import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Image } from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import { Youtube } from '@tiptap/extension-youtube';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import { Markdown } from 'tiptap-markdown';
import { resolveAsset } from './fs.js';
import { MathInline, MathBlock, mathLock } from './math-nodes.js';
import { Plot } from './plot-node.js';
import { Solver } from './solver-node.js';
import { Spellcheck, spell, spellPanelHTML, showPersonalDictionary } from './spell.js';
import { createTranslate, translateSelection } from './translate-ext.js';
import { showGoogleKeyDialog } from './google-key.js';
import { Toggle, ToggleSummary, ToggleContent } from './details.js';
import { createPronTable } from './pron-table.js';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { charPanel } from './charpanel.js';
import { PAIRS, pairLabel, googleKey } from './translate.js';
import { engine } from './calc.js';

// Imagen con ruta relativa a la página: se muestra leyendo el archivo de _assets/.
function localImage(getPageDir) {
  return Image.extend({
    // La imagen es un bloque: hay que cerrar la línea para no pegarla al párrafo siguiente
    addStorage() {
      return {
        markdown: {
          serialize(state, node) {
            const src = String(node.attrs.src || '').replace(/[()\s]/g, (c) => encodeURIComponent(c));
            const title = node.attrs.title ? ` "${node.attrs.title.replace(/"/g, '\\"')}"` : '';
            state.write(`![${state.esc(node.attrs.alt || '')}](${src}${title})`);
            state.closeBlock(node);
          },
          parse: {},
        },
      };
    },
    addNodeView() {
      return ({ node }) => {
        const img = document.createElement('img');
        const load = (n) => {
          img.alt = n.attrs.alt || '';
          if (n.attrs.title) img.title = n.attrs.title;
          const dir = getPageDir();
          if (!dir) { img.src = n.attrs.src; return; }
          resolveAsset(dir, n.attrs.src)
            .then((url) => { img.src = url; })
            .catch(() => { img.alt = `No se encontró la imagen ${n.attrs.src}`; img.classList.add('missing'); });
        };
        load(node);
        return {
          dom: img,
          update(n) {
            if (n.type !== node.type) return false;
            if (n.attrs.src !== node.attrs.src) load(n);
            node = n;
            return true;
          },
        };
      };
    },
  }).configure({ inline: false, allowBase64: true });
}

// Listas de tareas compactas (sin línea en blanco entre ítems), igual que las otras listas
const TightTaskLists = Extension.create({
  name: 'tightTaskLists',
  addGlobalAttributes() {
    return [{
      types: ['taskList'],
      attributes: {
        tight: {
          default: true,
          parseHTML: (el) => el.getAttribute('data-tight') === 'true' || !el.querySelector('p'),
          renderHTML: (a) => ({ 'data-tight': a.tight ? 'true' : null }),
        },
      },
    }];
  },
});

export function createEditor({ element, getPageDir, onChange, actions, getPair = () => null }) {
  const editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      localImage(getPageDir),
      TableKit.configure({ table: { resizable: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TightTaskLists,
      Toggle,
      Subscript,
      Superscript,
      createPronTable({ getPair, notify: (m, k) => actions.notify(m, k) }),
      ToggleSummary,
      ToggleContent,
      Spellcheck,
      createTranslate({ getPair, notify: (m, k) => actions.notify(m, k) }),
      Youtube.configure({ nocookie: true, width: 640, height: 360 }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      MathInline,
      MathBlock,
      Plot,
      Solver,
      Placeholder.configure({
        includeChildren: true,
        placeholder: ({ node }) => (node.type.name === 'detailsSummary' ? 'Título del desplegable (Enter para escribir adentro)' : 'Escribí, o tocá / para insertar un título, tabla, imagen…'),
      }),
      Markdown.configure({ html: true, tightLists: true, bulletListMarker: '-', linkify: true, transformPastedText: true }),
    ],
    editorProps: {
      attributes: { spellcheck: 'false' }, // usamos el corrector propio, no el del navegador
      handleKeyDown: (_view, event) => slash.handleKey(event),
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        files.forEach((f) => actions.insertImageFile(f));
        return true;
      },
      handleDrop: (view, event) => {
        const files = [...(event.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (pos) editor.commands.setTextSelection(pos.pos);
        files.forEach((f) => actions.insertImageFile(f));
        return true;
      },
    },
    onUpdate: () => onChange(),
    onSelectionUpdate: () => { slash.check(); toolbar.refresh(); },
    onTransaction: () => { slash.check(); toolbar.refresh(); },
  });

  const slash = createSlashMenu(editor, actions, getPair);
  const toolbar = createToolbar(editor, actions, getPair);

  // Recalcula las ecuaciones (variables, resultados y gráficos) cuando cambia la página.
  let calcTimer;
  editor.runCalc = () => { clearTimeout(calcTimer); engine.run(editor.state.doc); };
  editor.on('update', () => { clearTimeout(calcTimer); calcTimer = setTimeout(() => engine.run(editor.state.doc), 120); });

  editor.getMarkdown = () => editor.storage.markdown.getMarkdown();
  editor.toolbarElement = toolbar.element;
  return editor;
}

// ---------- comandos compartidos por el menú "/" y la barra ----------
function blockCommands(actions, getPair = () => null) {
  const german = () => { const p = getPair(); return !!(p && p.includes('de')); };
  return [
    { id: 'h1', label: 'Título 1', hint: '#', keys: 'titulo 1 h1 heading', run: (c) => c.setHeading({ level: 1 }) },
    { id: 'h2', label: 'Título 2', hint: '##', keys: 'titulo 2 h2 subtitulo', run: (c) => c.setHeading({ level: 2 }) },
    { id: 'h3', label: 'Título 3', hint: '###', keys: 'titulo 3 h3', run: (c) => c.setHeading({ level: 3 }) },
    { id: 'p', label: 'Texto', hint: '', keys: 'texto parrafo normal', run: (c) => c.setParagraph() },
    { id: 'eq', label: 'Ecuación', hint: '$$', keys: 'ecuacion formula math calculo latex variable', run: (c) => c.insertMathBlock() },
    { id: 'eqi', label: 'Ecuación en el texto', hint: 'Ctrl+M', keys: 'ecuacion en linea inline formula math', run: (c) => c.insertMathInline() },
    { id: 'solver', label: 'Resolver ecuaciones', hint: 'solver', keys: 'resolver solver sistema ecuaciones incognitas despejar find given', run: (c) => c.insertSolver() },
    { id: 'plot2', label: 'Gráfico 2D', hint: 'y(x)', keys: 'grafico plot funcion curva 2d', run: (c) => c.insertPlot({ tipo: '2d' }) },
    { id: 'plot3', label: 'Gráfico 3D', hint: 'z(x,y)', keys: 'grafico plot superficie 3d', run: (c) => c.insertPlot({ tipo: '3d', xmin: '-3', xmax: '3', ymin: '-3', ymax: '3' }) },
    { id: 'ul', label: 'Lista', hint: '-', keys: 'lista viñetas bullet', run: (c) => c.toggleBulletList() },
    { id: 'ol', label: 'Lista numerada', hint: '1.', keys: 'lista numerada ordenada', run: (c) => c.toggleOrderedList() },
    { id: 'todo', label: 'Lista de tareas', hint: '[ ]', keys: 'tareas checklist todo duda', run: (c) => c.toggleTaskList() },
    { id: 'toggle', label: 'Desplegable (toggle)', hint: '/t', keys: 't toggle desplegable plegable acordeon seccion', run: (c) => c.insertToggle() },
    { id: 'quote', label: 'Cita', hint: '>', keys: 'cita quote destacado', run: (c) => c.toggleBlockquote() },
    { id: 'code', label: 'Bloque de código', hint: '```', keys: 'codigo code', run: (c) => c.toggleCodeBlock() },
    { id: 'pron', label: 'Tabla de pronombres (alemán)', hint: '/tabla_pron', keys: 'tabla pronombres conjugacion verbo aleman ich du', when: german, run: (c) => c.insertPronounTable(1) },
    { id: 'table', label: 'Tabla', hint: '3×3', keys: 'tabla table', run: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
    { id: 'img', label: 'Imagen', hint: 'archivo', keys: 'imagen foto figura', run: (c) => { c.run(); actions.pickImage(); return null; } },
    { id: 'video', label: 'Video de YouTube', hint: 'link', keys: 'video youtube', run: (c) => { c.run(); actions.askVideo(); return null; } },
    { id: 'link', label: 'Link', hint: 'Ctrl+K', keys: 'link enlace url', run: (c) => { c.run(); actions.askLink(); return null; } },
    { id: 'hr', label: 'Separador', hint: '---', keys: 'separador linea divisor', run: (c) => c.setHorizontalRule() },
  ];
}

// ---------- menú "/" ----------
function createSlashMenu(editor, actions, getPair) {
  const items = blockCommands(actions, getPair);
  const el = document.createElement('div');
  el.className = 'slash-menu';
  el.hidden = true;
  el.setAttribute('role', 'listbox');
  document.body.appendChild(el);

  let open = false, range = null, filtered = [], index = 0;
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function close() { open = false; el.hidden = true; }

  function render() {
    el.innerHTML = filtered.length
      ? filtered.map((it, i) => `<button type="button" class="slash-item${i === index ? ' active' : ''}" data-i="${i}" role="option"><span>${it.label}</span><kbd>${it.hint}</kbd></button>`).join('')
      : '<div class="slash-empty">Sin resultados</div>';
    el.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }

  function choose(i) {
    const it = filtered[i];
    if (!it || !range) return;
    const chain = editor.chain().focus().deleteRange(range);
    close();
    const res = it.run(chain);
    if (res) res.run();
  }

  el.addEventListener('mousedown', (e) => {
    const b = e.target.closest('.slash-item');
    if (!b) return;
    e.preventDefault();
    choose(Number(b.dataset.i));
  });

  function check() {
    const { state } = editor;
    const { $from, empty } = state.selection;
    if (!empty || !editor.isFocused || $from.parent.type.name === 'codeBlock') return close();
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
    const m = /(?:^|\s)\/([\p{L}\d ]{0,20})$/u.exec(before);
    if (!m || m[1].endsWith('  ')) return close();
    const q = norm(m[1].trim());
    filtered = items.filter((it) => (!it.when || it.when()) && (!q || norm(`${it.label} ${it.keys}`).includes(q)));
    if (!open) index = 0;
    index = Math.min(index, Math.max(filtered.length - 1, 0));
    range = { from: $from.pos - m[1].length - 1, to: $from.pos };
    open = true;
    const coords = editor.view.coordsAtPos($from.pos);
    el.hidden = false;
    render();
    const h = el.offsetHeight;
    const below = coords.bottom + 6 + h < window.innerHeight;
    el.style.left = `${Math.min(coords.left, window.innerWidth - el.offsetWidth - 12)}px`;
    el.style.top = `${below ? coords.bottom + 6 : coords.top - h - 6}px`;
  }

  function handleKey(e) {
    if (!open) return false;
    if (e.key === 'ArrowDown') { index = (index + 1) % Math.max(filtered.length, 1); render(); return true; }
    if (e.key === 'ArrowUp') { index = (index - 1 + filtered.length) % Math.max(filtered.length, 1); render(); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { if (filtered.length) { choose(index); return true; } close(); return false; }
    if (e.key === 'Escape') { close(); return true; }
    return false;
  }

  editor.on('blur', () => setTimeout(close, 120));
  return { check, handleKey };
}

// ---------- barra de herramientas ----------
const LOCK_ICON = (closed) => `<svg class="tb-lock-ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="${closed ? 'M5 7V5a3 3 0 0 1 6 0v2' : 'M5 7V5a3 3 0 0 1 5.8-1'}" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
const lockLabel = () => (mathLock.locked ? `${LOCK_ICON(true)} Fórmulas bloqueadas` : `${LOCK_ICON(false)} Fórmulas editables`);

function createToolbar(editor, actions, getPair) {
  const el = document.createElement('div');
  el.className = 'toolbar';
  el.setAttribute('role', 'toolbar');
  const B = (id, label, title, run, isActive) => ({ id, label, title, run, isActive });
  const groups = [
    [
      B('h1', 'H1', 'Título 1 (Ctrl+Alt+1)', () => editor.chain().focus().toggleHeading({ level: 1 }).run(), () => editor.isActive('heading', { level: 1 })),
      B('h2', 'H2', 'Título 2 (Ctrl+Alt+2)', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), () => editor.isActive('heading', { level: 2 })),
      B('h3', 'H3', 'Título 3 (Ctrl+Alt+3)', () => editor.chain().focus().toggleHeading({ level: 3 }).run(), () => editor.isActive('heading', { level: 3 })),
      B('p', 'Texto', 'Texto normal (Ctrl+Alt+0)', () => editor.chain().focus().setParagraph().run(), () => editor.isActive('paragraph')),
    ],
    [
      B('b', '<b>B</b>', 'Negrita (Ctrl+B)', () => editor.chain().focus().toggleBold().run(), () => editor.isActive('bold')),
      B('i', '<i>I</i>', 'Cursiva (Ctrl+I)', () => editor.chain().focus().toggleItalic().run(), () => editor.isActive('italic')),
      B('s', '<s>S</s>', 'Tachado', () => editor.chain().focus().toggleStrike().run(), () => editor.isActive('strike')),
      B('code', '&lt;/&gt;', 'Código en línea', () => editor.chain().focus().toggleCode().run(), () => editor.isActive('code')),
      B('color', '<span class="tb-color">A</span><span class="tb-caret">▾</span>', 'Color de letra y resaltado', () => togglePalette(), () => editor.isActive('textStyle', {}) && !!editor.getAttributes('textStyle').color),
      B('spell', '<span class="tb-spell">abc</span><span class="tb-caret">▾</span>', 'Ortografía, traducción e idiomas', () => toggleSpell(), () => spell.enabled),
      B('trad', 'Traducir', 'Traducir el texto seleccionado (Alt+T). La traducción aparece debajo, en cursiva.', () => translateSelection(editor, getPair(), (m, k) => actions.notify(m, k))),
    ],
    [
      B('ul', '• Lista', 'Lista con viñetas', () => editor.chain().focus().toggleBulletList().run(), () => editor.isActive('bulletList')),
      B('ol', '1. Lista', 'Lista numerada', () => editor.chain().focus().toggleOrderedList().run(), () => editor.isActive('orderedList')),
      B('todo', '☐ Tareas', 'Lista de tareas', () => editor.chain().focus().toggleTaskList().run(), () => editor.isActive('taskList')),
      B('quote', '❝ Cita', 'Cita', () => editor.chain().focus().toggleBlockquote().run(), () => editor.isActive('blockquote')),
    ],
    [
      B('link', 'Link', 'Insertar link (Ctrl+K)', () => actions.askLink(), () => editor.isActive('link')),
      B('img', 'Imagen', 'Insertar imagen (también podés pegarla con Ctrl+V)', () => actions.pickImage()),
      B('video', 'Video', 'Insertar video de YouTube', () => actions.askVideo()),
      B('table', 'Tabla', 'Insertar tabla', () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), () => editor.isActive('table')),
    ],
    [
      B('eq', '∑ Ecuación', 'Ecuación aparte (Ctrl+Shift+M o $$ + espacio)', () => editor.chain().focus().insertMathBlock().run()),
      B('eqi', 'x² En texto', 'Ecuación dentro del texto (Ctrl+M)', () => editor.chain().focus().insertMathInline().run()),
      B('plot', 'Gráfico', 'Gráfico 2D o 3D', () => editor.chain().focus().insertPlot({ tipo: '2d' }).run()),
      B('lock', lockLabel(), '', () => { mathLock.set(!mathLock.locked); refresh(); }, () => mathLock.locked),
      B('chars', 'Ω Caracteres', 'Caracteres especiales para el texto (griegas, subíndices, símbolos, ä ö ü…) en la columna de la derecha', () => { charPanel.set(!charPanel.enabled); refresh(); }, () => charPanel.enabled),
    ],
    [
      B('undo', '↶', 'Deshacer (Ctrl+Z)', () => editor.chain().focus().undo().run()),
      B('redo', '↷', 'Rehacer (Ctrl+Y)', () => editor.chain().focus().redo().run()),
      B('help', '?', 'Atajos y cómo calcular', () => actions.showHelp()),
    ],
  ];
  const tableOps = [
    B('rowA', '+ fila', 'Agregar fila abajo', () => editor.chain().focus().addRowAfter().run()),
    B('colA', '+ columna', 'Agregar columna a la derecha', () => editor.chain().focus().addColumnAfter().run()),
    B('rowD', '− fila', 'Borrar fila', () => editor.chain().focus().deleteRow().run()),
    B('colD', '− columna', 'Borrar columna', () => editor.chain().focus().deleteColumn().run()),
    B('hdr', 'Encabezado', 'Fila de encabezado sí/no', () => editor.chain().focus().toggleHeaderRow().run()),
    B('tDel', 'Borrar tabla', 'Borrar la tabla', () => editor.chain().focus().deleteTable().run()),
  ];
  const all = [...groups.flat(), ...tableOps];
  el.innerHTML = groups.map((g) => `<div class="tb-group">${g.map((b) => `<button type="button" class="tb" data-id="${b.id}" title="${b.title}">${b.label}</button>`).join('')}</div>`).join('')
    + `<div class="tb-group tb-table" hidden>${tableOps.map((b) => `<button type="button" class="tb" data-id="${b.id}" title="${b.title}">${b.label}</button>`).join('')}</div>`;
  el.addEventListener('mousedown', (e) => { if (e.target.closest('.tb')) e.preventDefault(); });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('.tb');
    if (b) all.find((x) => x.id === b.dataset.id)?.run();
  });
  // Paleta de colores: usa variables CSS para que se vean bien en tema claro y oscuro
  const palette = document.createElement('div');
  palette.className = 'tb-palette';
  palette.hidden = true;
  const TEXT = [['', 'Automático'], ['var(--tc-rojo)', 'Rojo'], ['var(--tc-naranja)', 'Naranja'], ['var(--tc-verde)', 'Verde'], ['var(--tc-azul)', 'Azul'], ['var(--tc-violeta)', 'Violeta'], ['var(--tc-gris)', 'Gris']];
  const MARK = [['', 'Sin resaltado'], ['var(--hl-amarillo)', 'Amarillo'], ['var(--hl-verde)', 'Verde'], ['var(--hl-celeste)', 'Celeste'], ['var(--hl-rosa)', 'Rosa']];
  palette.innerHTML = `<div class="pal-row"><span class="pal-label">Letra</span>${TEXT.map(([c, n]) => `<button type="button" class="pal-sw${c ? '' : ' none'}" data-text="${c}" title="${n}" style="${c ? `color:${c}` : ''}">A</button>`).join('')}</div>
    <div class="pal-row"><span class="pal-label">Resaltado</span>${MARK.map(([c, n]) => `<button type="button" class="pal-sw mark${c ? '' : ' none'}" data-mark="${c}" title="${n}" style="${c ? `background:${c}` : ''}">${c ? '' : '∅'}</button>`).join('')}</div>`;
  el.appendChild(palette);
  function togglePalette(force) {
    const open = force ?? palette.hidden;
    palette.hidden = !open;
    if (open) {
      const b = el.querySelector('[data-id="color"]');
      palette.style.left = `${b.offsetLeft}px`;
      palette.style.top = `${b.offsetTop + b.offsetHeight + 4}px`;
    }
  }
  palette.addEventListener('mousedown', (e) => e.preventDefault());
  palette.addEventListener('click', (e) => {
    const t = e.target.closest('[data-text]');
    const m = e.target.closest('[data-mark]');
    if (t) {
      const c = t.dataset.text;
      if (c) editor.chain().focus().setColor(c).run(); else editor.chain().focus().unsetColor().run();
    } else if (m) {
      const c = m.dataset.mark;
      if (c) editor.chain().focus().setHighlight({ color: c }).run(); else editor.chain().focus().unsetHighlight().run();
    } else return;
    togglePalette(false);
  });
  document.addEventListener('mousedown', (e) => { if (!palette.hidden && !palette.contains(e.target) && !e.target.closest('[data-id="color"]')) togglePalette(false); });

  // Panel de ortografía
  const spellPanel = document.createElement('div');
  spellPanel.className = 'tb-palette spell-panel';
  spellPanel.hidden = true;
  el.appendChild(spellPanel);
  function toggleSpell(force) {
    const open = force ?? spellPanel.hidden;
    spellPanel.hidden = !open;
    if (open) {
      const cur = getPair();
      const curV = cur ? cur.join('-') : '';
      spellPanel.innerHTML = spellPanelHTML() + `<div class="pal-row col trad-row"><span class="pal-label">Traducción en esta página</span>
        <select data-trad><option value="">Desactivada</option>${PAIRS.map((p) => `<option value="${p.join('-')}"${p.join('-') === curV ? ' selected' : ''}>${pairLabel(p)}</option>`).join('')}</select>
        <p class="sp-note">Escribí <b>hallo:</b> y aparece la traducción al lado. En las tablas de vocabulario completa la columna Traducción. Para oraciones: seleccioná y <b>Alt+T</b>.</p></div>
        <div class="pal-row col"><span class="pal-label">Google Translate</span>
        <p class="sp-note">${googleKey.get() ? '✓ Conectado: las oraciones y palabras se traducen con Google.' : 'Sin conectar: se usa MyMemory (calidad irregular en oraciones).'}</p>
        <button type="button" class="tb" data-google>${googleKey.get() ? 'Cambiar o quitar la clave' : 'Conectar Google Translate'}</button></div>`;
      const b = el.querySelector('[data-id="spell"]');
      spellPanel.style.left = `${b.offsetLeft}px`;
      spellPanel.style.top = `${b.offsetTop + b.offsetHeight + 4}px`;
    }
  }
  spellPanel.addEventListener('change', async (e) => {
    if (e.target.matches('[data-spell-on]')) { spell.setEnabled(e.target.checked); refresh(); }
    if (e.target.matches('[data-trad]')) actions.setTranslationPair(e.target.value);
    const lang = e.target.dataset.lang;
    if (lang) {
      e.target.disabled = true;
      await spell.setLang(lang, e.target.checked);
      e.target.disabled = false;
    }
  });
  spellPanel.addEventListener('click', (e) => {
    if (e.target.closest('[data-personal]')) { toggleSpell(false); showPersonalDictionary(); }
    if (e.target.closest('[data-google]')) { toggleSpell(false); showGoogleKeyDialog(); }
  });
  document.addEventListener('mousedown', (e) => { if (!spellPanel.hidden && !spellPanel.contains(e.target) && !e.target.closest('[data-id="spell"]')) toggleSpell(false); });

  const tableGroup = el.querySelector('.tb-table');
  const lockBtn = el.querySelector('[data-id="lock"]');
  charPanel.listeners.add(() => refresh());
  function refresh() {
    lockBtn.innerHTML = lockLabel();
    lockBtn.title = mathLock.locked
      ? 'Fórmulas bloqueadas: un clic solo selecciona, doble clic (o Enter) edita. Tocá para desbloquear.'
      : 'Fórmulas editables: un clic abre la fórmula. Tocá para bloquear.';
    for (const b of all) {
      if (!b.isActive) continue;
      el.querySelector(`[data-id="${b.id}"]`)?.setAttribute('aria-pressed', String(!!b.isActive()));
    }
    tableGroup.hidden = !editor.isActive('table');
  }
  return { element: el, refresh };
}
