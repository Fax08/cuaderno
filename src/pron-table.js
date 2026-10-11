// Tabla de pronombres para conjugaciones en alemán.
//   /tabla_pron  (+ espacio o Enter)  → Pronombre | Conjugación, con los pronombres cargados
//   /tabla_pron_2 … _5                → más columnas (otra conjugación, notas…)
// Solo en páginas de alemán. Se ve centrada y del ancho justo; en el .md es una tabla común.
import { Extension, InputRule } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const PRONOUNS = ['ich', 'du', 'er / sie / es', 'wir', 'ihr', 'sie / Sie'];
const CMD = /^\/tabla_pron(?:_([1-5]))?$/;
const isPronTable = (table) => /^pronombre/i.test(table.firstChild?.firstChild?.textContent.trim() || '');

function buildTable(schema, extra) {
  const cell = (type, text) => schema.nodes[type].create(null, schema.nodes.paragraph.create(null, text ? schema.text(text) : null));
  const heads = ['Pronombre', 'Conjugación', ...Array.from({ length: extra - 1 }, (_, i) => `Conjugación ${i + 2}`)];
  const header = schema.nodes.tableRow.create(null, heads.map((h) => cell('tableHeader', h)));
  const rows = PRONOUNS.map((p) => schema.nodes.tableRow.create(null, heads.map((_, i) => cell('tableCell', i === 0 ? p : ''))));
  return schema.nodes.table.create(null, [header, ...rows]);
}

// Reemplaza el párrafo del comando por la tabla y deja el cursor en la conjugación de "ich"
function replaceWithTable(state, tr, $from, extra) {
  const start = $from.before();
  tr.replaceWith(start, $from.after(), buildTable(state.schema, extra));
  // tabla(1) > fila encabezado > fila "ich" > celda 1 > celda 2 > párrafo
  const table = tr.doc.nodeAt(start);
  let pos = start + 1 + table.child(0).nodeSize + 1; // inicio de la fila "ich" (adentro)
  pos += table.child(1).child(0).nodeSize; // saltar la celda "ich"
  tr.setSelection(TextSelection.create(tr.doc, pos + 2));
  return tr;
}

export function createPronTable({ getPair, notify }) {
  const german = () => { const p = getPair(); return !!(p && p.includes('de')); };
  const key = new PluginKey('pronTable');
  return Extension.create({
    name: 'pronounTable',
    addInputRules() {
      return [new InputRule({
        find: /^\/tabla_pron(?:_([1-5]))?\s$/,
        handler: ({ state, range, match }) => {
          const $from = state.doc.resolve(range.from);
          if ($from.parent.type.name !== 'paragraph') return null;
          if (!german()) { notify('La tabla de pronombres está disponible en páginas de alemán.', 'bad'); return null; }
          replaceWithTable(state, state.tr, $from, Number(match[1] || 1));
          return undefined;
        },
      })];
    },
    addKeyboardShortcuts() {
      return {
        Enter: () => {
          const { state, view } = this.editor;
          const { $from, empty } = state.selection;
          if (!empty || $from.parent.type.name !== 'paragraph') return false;
          const m = CMD.exec($from.parent.textContent.trim());
          if (!m) return false;
          if (!german()) { notify('La tabla de pronombres está disponible en páginas de alemán.', 'bad'); return false; }
          view.dispatch(replaceWithTable(state, state.tr, $from, Number(m[1] || 1)).scrollIntoView());
          return true;
        },
      };
    },
    addCommands() {
      return {
        insertPronounTable: (extra = 1) => ({ state, tr, dispatch }) => {
          if (!german()) { notify('La tabla de pronombres está disponible en páginas de alemán.', 'bad'); return false; }
          const { $from } = tr.selection;
          if ($from.parent.type.name === 'paragraph' && $from.parent.content.size === 0) {
            if (dispatch) replaceWithTable(state, tr, $from, extra);
            return true;
          }
          const at = $from.after(1);
          tr.insert(at, state.schema.nodes.paragraph.create());
          if (dispatch) replaceWithTable(state, tr, tr.doc.resolve(at + 1), extra);
          return true;
        },
      };
    },
    // Las tablas que empiezan con "Pronombre" se ven centradas y del ancho justo
    addProseMirrorPlugins() {
      return [new Plugin({
        key,
        props: {
          decorations(state) {
            const decos = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name === 'table') {
                if (isPronTable(node)) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'tabla-pron' }));
                return false;
              }
              return true;
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      })];
    },
  });
}
