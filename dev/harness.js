// Banco de pruebas: monta el editor sin carpeta para probarlo con un navegador automático.
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/source-serif-4/400.css';
import '../src/style.css';
import { createEditor } from '../src/editor.js';

const editor = createEditor({
  element: document.getElementById('editor'),
  getPageDir: () => null,
  onChange: () => {},
  actions: { pickImage() {}, insertImageFile() {}, askVideo() {}, askLink() {}, showHelp() {} },
});
document.getElementById('tb').appendChild(editor.toolbarElement);
window.editor = editor;
window.load = (md) => { editor.commands.setContent(md, { emitUpdate: false }); editor.runCalc(); };
window.ready = true;
