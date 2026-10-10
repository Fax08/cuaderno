# Cuaderno

Entorno de notas propio: carpetas libres (posgrado, idiomas, cursos), ecuaciones visuales, cálculo con unidades al estilo MathCad, gráficos 2D/3D, tarjetas de repaso para vocabulario y búsqueda en todas las notas.

> **Si algo se pierde o deja de abrir:** en la carpeta de notas está `LEÉME - Cómo funciona este cuaderno.md`, con dónde está cada cosa y cómo recuperarla.

**Usar:** abrí https://fax08.github.io/cuaderno en Chrome o Edge y elegí tu carpeta de notas.

Las notas se guardan como archivos Markdown (`.md`) en una carpeta de tu computadora. No se suben a ningún lado: esta página solo lee y escribe en la carpeta que elijas.

## Organización

Las carpetas son libres. El botón **+** de cada carpeta agrega una página con plantilla (página en blanco, apunte, clase, vocabulario, gramática, trabajo, capítulo) o una sub-carpeta. **+ Nueva carpeta** puede crearla vacía o armada como *materia*, *idioma* o *curso*. Las carpetas llamadas Clases, Dudas, Temario, Trabajos, Vocabulario, Gramática, Módulos, Apuntes y Proyectos se muestran como secciones.

### Ejemplo

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

## Repaso de vocabulario

Cada fila de una tabla en una página de vocabulario es una tarjeta (1.ª columna frente, 2.ª respuesta, 3.ª ejemplo, 4.ª notas). **Repasar** abre las tarjetas del día con repetición espaciada: espacio muestra la respuesta, 1–4 la califica. El progreso se guarda en `.repaso.json` en la carpeta de notas.

## Búsqueda

`Ctrl+P` busca en nombres y texto de todas las notas; al abrir un resultado queda marcado el texto encontrado.

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

7. ✅ Panel de símbolos, colores de letra y resaltado
8. ✅ Carpetas libres con plantillas, vocabulario con tarjetas de repaso, gramática
9. ✅ Búsqueda en todas las notas

10. ✅ Gráficos con altura ajustable y vista detallada (doble clic)

Pendiente (anotado, sin empezar):
- **Cubos elementales**: estado tensional en un cubo 3D / elemento plano, principales y Mohr.
- **Leyes constitutivas**: Hooke generalizada (C y S 6×6), curvas σ–ε de materiales, viscoelasticidad, criterios de falla.

Otras ideas: renombrar y borrar desde el árbol, exportar a PDF, integrales y derivadas numéricas, links entre páginas.
