// Editor de páginas: TipTap + Markdown, menú "/" y barra de herramientas.
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Image } from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import { Youtube } from '@tiptap/extension-youtube';
import { Markdown } from 'tiptap-markdown';
import { resolveAsset } from './fs.js';

// Imagen con ruta relativa a la página: se muestra leyendo el archivo de _assets/.
function localImage(getPageDir) {
  return Image.extend({
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

export function createEditor({ element, getPageDir, onChange, actions }) {
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
      Youtube.configure({ nocookie: true, width: 640, height: 360 }),
      Placeholder.configure({ placeholder: 'Escribí, o tocá / para insertar un título, tabla, imagen…' }),
      Markdown.configure({ html: true, tightLists: true, bulletListMarker: '-', linkify: true, transformPastedText: true }),
    ],
    editorProps: {
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

  const slash = createSlashMenu(editor, actions);
  const toolbar = createToolbar(editor, actions);

  editor.getMarkdown = () => editor.storage.markdown.getMarkdown();
  editor.toolbarElement = toolbar.element;
  return editor;
}

// ---------- comandos compartidos por el menú "/" y la barra ----------
function blockCommands(actions) {
  return [
    { id: 'h1', label: 'Título 1', hint: '#', keys: 'titulo 1 h1 heading', run: (c) => c.setHeading({ level: 1 }) },
    { id: 'h2', label: 'Título 2', hint: '##', keys: 'titulo 2 h2 subtitulo', run: (c) => c.setHeading({ level: 2 }) },
    { id: 'h3', label: 'Título 3', hint: '###', keys: 'titulo 3 h3', run: (c) => c.setHeading({ level: 3 }) },
    { id: 'p', label: 'Texto', hint: '', keys: 'texto parrafo normal', run: (c) => c.setParagraph() },
    { id: 'ul', label: 'Lista', hint: '-', keys: 'lista viñetas bullet', run: (c) => c.toggleBulletList() },
    { id: 'ol', label: 'Lista numerada', hint: '1.', keys: 'lista numerada ordenada', run: (c) => c.toggleOrderedList() },
    { id: 'todo', label: 'Lista de tareas', hint: '[ ]', keys: 'tareas checklist todo duda', run: (c) => c.toggleTaskList() },
    { id: 'quote', label: 'Cita', hint: '>', keys: 'cita quote destacado', run: (c) => c.toggleBlockquote() },
    { id: 'code', label: 'Bloque de código', hint: '```', keys: 'codigo code', run: (c) => c.toggleCodeBlock() },
    { id: 'table', label: 'Tabla', hint: '3×3', keys: 'tabla table', run: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
    { id: 'img', label: 'Imagen', hint: 'archivo', keys: 'imagen foto figura', run: (c) => { c.run(); actions.pickImage(); return null; } },
    { id: 'video', label: 'Video de YouTube', hint: 'link', keys: 'video youtube', run: (c) => { c.run(); actions.askVideo(); return null; } },
    { id: 'link', label: 'Link', hint: 'Ctrl+K', keys: 'link enlace url', run: (c) => { c.run(); actions.askLink(); return null; } },
    { id: 'hr', label: 'Separador', hint: '---', keys: 'separador linea divisor', run: (c) => c.setHorizontalRule() },
  ];
}

// ---------- menú "/" ----------
function createSlashMenu(editor, actions) {
  const items = blockCommands(actions);
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
    filtered = items.filter((it) => !q || norm(`${it.label} ${it.keys}`).includes(q));
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
function createToolbar(editor, actions) {
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
      B('undo', '↶', 'Deshacer (Ctrl+Z)', () => editor.chain().focus().undo().run()),
      B('redo', '↷', 'Rehacer (Ctrl+Y)', () => editor.chain().focus().redo().run()),
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
  const tableGroup = el.querySelector('.tb-table');
  function refresh() {
    for (const b of all) {
      if (!b.isActive) continue;
      el.querySelector(`[data-id="${b.id}"]`)?.setAttribute('aria-pressed', String(!!b.isActive()));
    }
    tableGroup.hidden = !editor.isActive('table');
  }
  return { element: el, refresh };
}
