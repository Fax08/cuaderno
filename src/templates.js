// Plantillas de página y manejo del frontmatter (las propiedades al inicio del .md).

export const SECTIONS = ['Clases', 'Dudas', 'Temario', 'Trabajos'];

// Nombres de carpeta que se muestran como secciones (en mayúsculas, sin desplegable) y en este orden
export const SECTION_ORDER = ['Clases', 'Dudas', 'Temario', 'Trabajos', 'Vocabulario', 'Gramática', 'Módulos', 'Apuntes', 'Proyectos'];

// Carpetas que se pueden crear ya armadas. Son solo un atajo: después se agregan o borran carpetas libremente.
export const PRESETS = [
  { id: 'vacia', label: 'Carpeta vacía', sections: [] },
  { id: 'materia', label: 'Materia · Clases, Dudas, Temario, Trabajos', sections: ['Clases', 'Dudas', 'Temario', 'Trabajos'] },
  { id: 'idioma', label: 'Idioma · Clases, Vocabulario, Gramática, Dudas', sections: ['Clases', 'Vocabulario', 'Gramática', 'Dudas'] },
  { id: 'curso', label: 'Curso · Módulos, Apuntes, Proyectos, Dudas', sections: ['Módulos', 'Apuntes', 'Proyectos', 'Dudas'] },
];

// Plantillas de página, en el orden del menú "+"
export const KINDS = [
  { id: 'pagina', label: 'Página en blanco' },
  { id: 'apunte', label: 'Apunte con fecha' },
  { id: 'clase', label: 'Clase' },
  { id: 'vocabulario', label: 'Lista de vocabulario' },
  { id: 'gramatica', label: 'Tema de gramática' },
  { id: 'trabajo', label: 'Trabajo con entrega' },
  { id: 'capitulo', label: 'Capítulo (sub-carpeta con teoría)' },
];

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Plantilla sugerida según el nombre de la carpeta
export function suggestKind(folderName) {
  const n = norm(folderName || '');
  if (n.startsWith('clase')) return 'clase';
  if (n.startsWith('temario') || n.startsWith('modulo') || n.startsWith('unidad')) return 'capitulo';
  if (n.startsWith('trabajo') || n.startsWith('tp') || n.startsWith('proyecto') || n.startsWith('entrega')) return 'trabajo';
  if (n.startsWith('vocab')) return 'vocabulario';
  if (n.startsWith('gramatica')) return 'gramatica';
  if (n.startsWith('apunte')) return 'apunte';
  return 'pagina';
}

export const ESTADOS = {
  trabajo: ['pendiente', 'en curso', 'entregado'],
};

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { meta: [], body: text };
  const meta = m[1].split(/\r?\n/).filter(Boolean).map((line) => {
    const i = line.indexOf(':');
    return i < 0 ? [line.trim(), ''] : [line.slice(0, i).trim(), line.slice(i + 1).trim()];
  });
  return { meta, body: text.slice(m[0].length) };
}

export function joinFrontmatter(meta, body) {
  if (!meta.length) return body;
  return `---\n${meta.map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n${body.replace(/^\n+/, '')}`;
}

export const tpl = {
  clase: ({ materia, numero, fecha, tema }) => `---
tipo: clase
materia: ${materia}
fecha: ${fecha}
---

# Clase ${numero}${tema ? ` · ${tema}` : ''}

## Temas vistos

-

## Apuntes

## Dudas que surgieron

- [ ]

## Para la próxima clase

- [ ]
`,

  dudas: ({ materia }) => `---
tipo: dudas
materia: ${materia}
---

# Dudas · ${materia}

Marcá cada duda como resuelta cuando tengas la respuesta.

- [ ]
`,

  capitulo: ({ numero, nombre }) => `---
tipo: capitulo
---

# ${numero} ${nombre}

## Objetivos

-

## Desarrollo

## Resumen
`,

  pagina: ({ nombre }) => `# ${nombre}

`,

  apunte: ({ nombre, fecha }) => `---
tipo: apunte
fecha: ${fecha}
---

# ${nombre}

## Ideas principales

-

## Desarrollo

## Dudas

- [ ]
`,

  vocabulario: ({ nombre }) => `---
tipo: vocabulario
---

# ${nombre}

Cada fila es una tarjeta de repaso: la primera columna es el frente y la segunda, la respuesta. Tocá **Repasar** arriba para practicar.

| Palabra | Traducción | Ejemplo | Notas |
| --- | --- | --- | --- |
| to achieve | lograr, alcanzar | She achieved all her goals. | regular |
| to rely on | depender de, confiar en | You can rely on me. | phrasal verb |
| although | aunque | Although it was late, we kept working. | conector |
`,

  gramatica: ({ nombre }) => `---
tipo: gramatica
---

# ${nombre}

## Regla

## Conjugación

| Persona | Afirmativo | Negativo | Pregunta |
| --- | --- | --- | --- |
| I | I have worked | I have not worked | Have I worked? |
| you | you have worked | you have not worked | Have you worked? |
| he / she / it | he has worked | he has not worked | Has he worked? |
| we | we have worked | we have not worked | Have we worked? |
| they | they have worked | they have not worked | Have they worked? |

## Ejemplos

- I <span style="color: var(--tc-azul);">have lived</span> here since 2020.
- She <span style="color: var(--tc-azul);">has</span> never <span style="color: var(--tc-azul);">been</span> to Italy.

## Errores frecuentes

- <span style="color: var(--tc-rojo);">I have seen him yesterday.</span> → <span style="color: var(--tc-verde);">I saw him yesterday.</span>
`,

  trabajo: ({ nombre, entrega }) => `---
tipo: trabajo
entrega: ${entrega}
estado: pendiente
---

# ${nombre}

## Consigna

## Desarrollo

## Conclusiones
`,
};
