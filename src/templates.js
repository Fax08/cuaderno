// Plantillas de página y manejo del frontmatter (las propiedades al inicio del .md).

export const SECTIONS = ['Clases', 'Dudas', 'Temario', 'Trabajos'];

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
