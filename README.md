# Cuaderno

Entorno de notas para el posgrado: materias organizadas en **Clases**, **Dudas**, **Temario** y **Trabajos**, con un editor pensado para ingeniería.

**Usar:** abrí https://fax08.github.io/cuaderno en Chrome o Edge y elegí tu carpeta de notas.

Las notas se guardan como archivos Markdown (`.md`) en una carpeta de tu computadora. No se suben a ningún lado: esta página solo lee y escribe en la carpeta que elijas.

## Estructura de la carpeta

```
Posgrado/
└─ Mecánica del Continuo/
   ├─ Clases/      2026-03-12 Clase 01 - Tensores.md
   ├─ Dudas/       Dudas.md
   ├─ Temario/
   │  └─ 02 Tensores/   Teoría.md, Ejercicios.md, _assets/ (imágenes)
   └─ Trabajos/    TP1 Círculos de Mohr.md
```

## Atajos

| Acción | Atajo |
|---|---|
| Menú para insertar | `/` |
| Títulos 1, 2, 3 | `# `, `## `, `### ` al inicio de la línea |
| Lista / numerada / tareas | `- `, `1. `, `[ ] ` |
| Link | `Ctrl+K` |
| Abrir un link | `Ctrl+clic` |
| Pegar captura de pantalla | `Ctrl+V` |
| Guardar ya (igual guarda solo) | `Ctrl+S` |

## Desarrollo

```
npm install
npm run dev
```

Publicar en GitHub Pages: `npm run deploy` (compila y sube `dist/` a la rama `gh-pages`).

## Hoja de ruta

1. ✅ Base: carpeta, árbol de materias, abrir y guardar páginas
2. ✅ Editor: títulos con índice, menú `/`, barra, tablas, links, imágenes, videos
3. Ecuaciones visuales con atajos (MathLive)
4. Cálculo tipo MathCad con unidades y matrices
5. Gráficos 2D y 3D
6. Dudas con estado y vencimientos de trabajos en la portada de cada materia
