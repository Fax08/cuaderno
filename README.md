# Cuaderno

Entorno de notas para el posgrado: materias organizadas en **Clases**, **Dudas**, **Temario** y **Trabajos**, con ecuaciones visuales, cálculo con unidades al estilo MathCad y gráficos 2D/3D.

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

## Ecuaciones

| Acción | Atajo |
|---|---|
| Ecuación en el texto | `Ctrl+M`, o escribir `$x^2$` |
| Ecuación aparte | `$$` + espacio, o `Ctrl+Shift+M` |
| Letras griegas | `sigma`, `tau`, `alpha`… (cortos: `sig`, `eps`, `lam`, `gam`, `the`) |
| Subíndice / superíndice | `_` / `^` |
| Fracción | `/` |
| Matrices | `mat2`, `mat3`, `vec2`, `vec3`; `Alt+Enter` fila, `Ctrl+Alt+Enter` columna |
| Traspuesta / inversa | `TT` / `inv` |
| Terminar | `Enter` o `Esc`; `Shift+Enter` crea otra ecuación debajo |

## Cálculo (como MathCad)

```
P := 50kN                 define
A := 20cm^2
σ := P/A                  define a partir de otras
σ =                       → 25 MPa
σ = kPa                   → 25000 kPa
M(x) := q x/2 (L − x)     función
M(2m) =                   → 48 kN·m
K^{-1} =   det(K) =       matrices
```

- Se calcula de arriba hacia abajo.
- Una ecuación sin `:=` ni `=` al final es solo una fórmula escrita.
- Las letras sueltas `m`, `s`, `N`, `J`, `W` son unidades solo pegadas a un número o a otra unidad (`6m`, `9.81m/s^2`). En otro lugar son variables.
- Si definís una variable con el nombre de una unidad (por ejemplo `N := 3`), la variable tiene prioridad.

## Gráficos

`/gráfico` inserta un gráfico 2D (varias curvas y(x)) o 3D (superficie z(x, y)). Las curvas y los rangos pueden usar las variables y funciones definidas arriba, por ejemplo `M(x)` de `0` a `L`. En el `.md` se guarda como un bloque ` ```plot `.

## Portada e Inicio

- **Inicio** muestra las próximas entregas de todas las materias, las dudas abiertas y las últimas clases.
- El botón ⌂ de cada materia abre su portada.
- Las **dudas** se juntan de tres lugares: las tareas (`- [ ]`) de la sección Dudas, las que están bajo un título que diga "duda" en cualquier apunte, y las que empiezan con "¿". "Resuelta" las tilda en el archivo.

## Otros atajos

| Acción | Atajo |
|---|---|
| Menú para insertar | `/` |
| Títulos 1, 2, 3 | `# `, `## `, `### ` al inicio de la línea |
| Lista / numerada / tareas | `- `, `1. `, `[ ] ` |
| Link | `Ctrl+K` (abrir: `Ctrl+clic`) |
| Pegar captura de pantalla | `Ctrl+V` |
| Guardar ya (igual guarda solo) | `Ctrl+S` |

## Desarrollo

```
npm install
npm run dev
node dev/calc-test.mjs     pruebas del motor de cálculo
node dev/units-test.mjs    pruebas de la vista de unidades
```

`dev/smoke.mjs` y `dev/app-smoke.mjs` prueban el editor y la app completa en Chrome headless, con una carpeta simulada.

Publicar en GitHub Pages: `npm run deploy` (compila y sube `dist/` a la rama `gh-pages`).

## Hoja de ruta

1. ✅ Base: carpeta, árbol de materias, abrir y guardar páginas
2. ✅ Editor: títulos con índice, menú `/`, barra, tablas, links, imágenes, videos
3. ✅ Ecuaciones visuales con atajos (MathLive + KaTeX)
4. ✅ Cálculo tipo MathCad con unidades, funciones y matrices
5. ✅ Gráficos 2D y 3D con las variables de la página
6. ✅ Portada de materia e Inicio: entregas, dudas abiertas, clases

Ideas para después: renombrar y borrar páginas desde el árbol, buscar en todas las notas, exportar a PDF, integrales y derivadas numéricas, links entre páginas.
