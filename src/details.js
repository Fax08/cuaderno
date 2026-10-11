// Bloques desplegables (toggles): un título que abre y cierra contenido (texto, tablas, fórmulas…).
// En el .md se guardan como <details><summary>Título</summary> … </details>, que también se ven
// desplegables en GitHub, Obsidian y otros visores. Se recuerda si quedó abierto o cerrado.
import { InputRule } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { Details, DetailsSummary, DetailsContent } from '@tiptap/extension-details';

const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const Toggle = Details.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          const summary = node.child(0);
          const content = node.child(1);
          state.write(`<details${node.attrs.open ? ' open' : ''}>\n<summary>${escHtml(summary.textContent)}</summary>\n\n`);
          state.renderContent(content);
          state.ensureNewLine();
          state.write('</details>');
          state.closeBlock(node);
        },
        parse: {
          // El HTML que genera el Markdown trae el contenido suelto después de <summary>:
          // se envuelve en el contenedor que espera el editor
          updateDOM(element) {
            element.querySelectorAll('details').forEach((d) => {
              if (d.querySelector(':scope > div[data-type="detailsContent"]')) return;
              const box = document.createElement('div');
              box.setAttribute('data-type', 'detailsContent');
              [...d.childNodes].forEach((n) => { if (!(n.nodeType === 1 && n.tagName === 'SUMMARY')) box.appendChild(n); });
              if (!box.children.length) box.appendChild(document.createElement('p'));
              d.appendChild(box);
            });
          },
        },
      },
    };
  },
  // "/t" + espacio al comienzo de una línea vacía crea el desplegable y deja el cursor en el título
  addInputRules() {
    return [new InputRule({
      find: /^\/t\s$/,
      handler: ({ state, range }) => {
        const $from = state.doc.resolve(range.from);
        if ($from.parent.type.name !== 'paragraph') return null;
        const start = $from.before();
        const { schema, tr } = state;
        const node = schema.nodes.details.create({ open: true }, [
          schema.nodes.detailsSummary.create(),
          schema.nodes.detailsContent.create(null, schema.nodes.paragraph.create()),
        ]);
        tr.replaceWith(start, $from.after(), node);
        tr.setSelection(TextSelection.create(tr.doc, start + 2));
        return undefined;
      },
    })];
  },
  // Enter en el título pasa al contenido (sin crear un renglón vacío extra)
  addKeyboardShortcuts() {
    const parent = this.parent?.() || {};
    return {
      ...parent,
      Enter: (props) => {
        const { state, view } = props.editor;
        const { $head, empty } = state.selection;
        if (empty && $head.parent.type.name === 'detailsSummary') {
          const details = $head.node(-1);
          const content = details.child(1);
          const first = content.firstChild;
          if (first && first.type.name === 'paragraph' && first.content.size === 0) {
            const pos = $head.after() + 2; // dentro del primer párrafo del contenido
            view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)).scrollIntoView());
            return true;
          }
        }
        return parent.Enter ? parent.Enter(props) : false;
      },
    };
  },
  addCommands() {
    return {
      ...this.parent?.(),
      insertToggle: (title = '') => ({ chain }) => chain().insertContent({
        type: 'details',
        attrs: { open: true },
        content: [
          { type: 'detailsSummary', content: title ? [{ type: 'text', text: title }] : [] },
          { type: 'detailsContent', content: [{ type: 'paragraph' }] },
        ],
      }).run(),
    };
  },
}).configure({
  persist: true,
  HTMLAttributes: { class: 'toggle' },
  renderToggleButton: ({ element, isOpen }) => {
    element.setAttribute('aria-label', isOpen ? 'Cerrar' : 'Abrir');
    element.title = isOpen ? 'Cerrar' : 'Abrir';
  },
});

export const ToggleSummary = DetailsSummary;
export const ToggleContent = DetailsContent;
