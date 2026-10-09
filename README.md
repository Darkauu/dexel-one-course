# Dexel Studio — Curso 01 / Impresión 3D

Deck de clase como página web. Todo es local: fuentes, three.js y el bundle viajan
con la carpeta, así que se puede abrir `index.html` directamente, sin red.

## Ejecutar

```sh
npm install  
npm start     
```

`npm start` sirve la carpeta y recompila `src/` en cada recarga del navegador.
Sin Node también funciona: abrir `index.html` directamente.

## Presentar

| Tecla | Acción |
|---|---|
| → · Espacio · PageDown | siguiente paso / diapositiva |
| ← · PageUp | anterior |
| Inicio / Fin | primera / última |
| `.` o `B` | pantalla en negro (y volver) |
| `F` | pantalla completa |

La URL guarda la diapositiva (`index.html#3`). En táctil: deslizar en horizontal.
Imprimir a PDF da una diapositiva por página, en su estado final.

## Editar

- Contenido: `index.html`. Cada `<section class="slide">` es un **punto** de una
  **sección**; `data-title-lines` fija los cortes del título voxel
  (`|` = línea, `||` separa la versión apaisada de la vertical). El título solo se
  re-arma cuando cambia la sección.
- Código: `src/`. Después de editar, `npm install && npm run build` regenera
  `dist/deck.js` (esbuild, un solo script clásico: funciona desde `file://`).

## Secciones, acentos y fases

- `data-section` agrupa los puntos de una sección; el contador de arriba a la
  derecha numera dentro de la sección («01 / 02»). Al cambiar de sección, el título
  voxel vuelve al muro y el nuevo se arma desde él, como en la entrada inicial.
- Cambio de sección (en ambos sentidos): la diapositiva que sale se queda 0,45 s; su
  texto se aleja hacia atrás y se apaga, y sus escenas 3D se encogen hacia el centro de
  su escenario mientras el título vuelve al muro y se arma el nuevo.
- `data-title-accent="ENDER 3 PRO"`: esa línea del título recibe una sola onda
  arcoíris desde su centro hacia afuera y queda en el color de la sección.
- `data-title-impact="SOFTWARE"`: esa línea no se arma cubo a cubo; entra completa
  desde la cámara en amarillo JavaScript, golpea su lugar, sacude el bloque y suelta
  chispas de soldadura en píxeles.
- `data-steps="4"` + bloques `data-phase="1"` + botones `data-step-go="1"`: fases
  dentro de un punto. Los botones y las flechas del teclado recorren las fases; la
  diapositiva expone la fase en `data-step` (el esquema de respaldo la usa).
- `data-orbit` en un escenario: se gira 360° arrastrando y se acerca con la rueda o
  pellizcando con dos dedos (la escena implementa `drag` y `zoomBy`).

## Componentes

**Alerta «!» con ventana emergente.** Una casilla con un signo de exclamación que
oscila entre amarillo y naranja; al tocarla abre una ventana centrada. Se cierra
con la X, con Esc o tocando fuera. Mientras está abierta, las flechas no cambian
de diapositiva. Para agregar una nueva:

```html
<button type="button" class="alert-btn" data-popup="tema" aria-label="¿Qué es …?">!</button>

<dialog class="popup" id="popup-tema" aria-labelledby="popup-tema-title">
  <div class="popup-bar">
    <p class="micro">Info / …</p>
    <button type="button" class="popup-close" data-popup-close aria-label="Cerrar">✕</button>
  </div>
  <div class="popup-body">
    <h2 id="popup-tema-title">…</h2>
    <!-- ilustración (svg.popup-art) y texto -->
  </div>
</dialog>
```

**Botón «Simulación»** (`.sim-btn`, rojo ↔ rojo claro): abre una ventana igual que
la alerta (`data-popup="id"` → `#popup-id`). La simulación del motor paso a paso
vive en `src/stepsim.js`; se monta en cualquier contenedor con `data-stepsim` y la
mueve el reloj único del deck mientras su ventana está abierta.

## Parámetros de prueba

- `?no3d` — ver el deck sin la capa WebGL (lo que ve un equipo sin GPU).
- `?force3d` — no apagar el 3D aunque el presupuesto de fotogramas no alcance.
- `?debug` — expone `window.__deck`.

## Estructura

- `src/voxelTitle.js` — palabra voxel: rasterizado → recorte a la tinta → ajuste al
  presupuesto de cubos → extrusión con relieve; cada glifo avanza como bloque rígido
  según la distancia del puntero; las caras interiores se colapsan en el shader.
- `src/demos.js` — punto 01: aditiva (boquilla) y sustractiva (láser), la misma
  pirámide de 329 cubos con un guion temporal común. También la base `Stage`.
- `src/tech.js` — punto 02: dioramas de FDM y resina.
- `src/materials.js` — punto 03: PLA, PETG y TPU (carrete + aplicación); PLA y TPU
  reciben la misma carga al mismo tiempo para comparar rigidez y elasticidad.
- `src/uses.js` — punto 04: usos reales (prototipos, repuestos, decoración, día a día).
- `src/limits.js` — punto 05: límites (tiempo, capas visibles con lupa, un color sin
  AMS, material bajo calor). La lupa usa `prepass(renderer)`: la escena vista de
  cerca se dibuja a una textura que se muestra en el lente.
- `src/ender.js` — sección 02: el modelo `src/assets/creality-ender-3-pro.glb`
  (embebido en el bundle, así funciona desde `file://`; se decodifica una vez y cada
  punto usa una copia), pintado como maqueta. `POINTS` define las fases de cada punto:
  qué piezas resalta (`PARTS`), qué etiquetas muestra (`data-pin`), qué retira (`hide`:
  la carcasa del ventilador se desliza hacia afuera en vez de desaparecer), qué flujos
  de filamento anima (`flows`: `feed` por el extrusor, `melt` saliendo de la boquilla)
  y hacia dónde se acerca la cámara (`view`).
- `src/bed.js` — punto 03: cama caliente y ruedas de nivelación. Extiende la escena
  de la Ender con un efecto por fase (`fx` en `POINTS`): `heat` (calor que sube de la
  placa), `peel` (la lámina magnética se levanta, se dobla y suelta la pieza) y
  `level` (una rueda gira y su esquina sube y baja sobre el resorte). Los resortes y
  la lámina doblable se generan en código; el resto viene del modelo.
- `src/electronics.js` — punto 04: electrónica y control. Efectos por fase: `air`
  (corrientes del ventilador de capa bajo la boquilla), `power` (pulsos por el cable
  de la fuente), `lcd` (la pantalla se enciende como una consola antigua, sobre su propia grilla
  de 128 × 64 puntos y a 15 cuadros por segundo: línea blanca y estrella de 4 puntas
  que revela la imagen, escrita con una fuente de 5 × 7) y `sd` (la tarjeta entra en la ranura).
- `src/flow.js` — sección 03, punto 01: diagrama de acción (foto → IA → STL → Cura →
  G-code → microSD → impresora). Un escenario por paso; las piezas de píxeles se
  arman con vóxeles en una sola malla con solo las caras exteriores (`voxelMesh`), los
  logos son formas extruidas. Un turno recorre los pasos: `main.js` resalta el paso
  activo con el mismo reloj con que su objeto da el salto.
- `src/slicer.js` — sección 03, punto 02: ¿qué es un slicer? La poción de ejemplo
  (`src/assets/potion.glb`) sobre una cama virtual; las 4 fases van a la derecha. La
  poción original (16 MB, con una línea suelta) se reconstruyó en bloques con
  `tools/potion-voxelize.mjs`: 428 triángulos, 14 KB, sin la línea.
- Escenas nuevas: una clase que extiende `Stage` con `frame(dt, t, view, pointer)`,
  registrada en `SCENES` (`src/gl.js`) y usada en el HTML con
  `<div class="stage" data-3d="nombre">`.
- `src/gl.js` — un contexto WebGL: campo de ruido de fondo + un pase por zona.
- `src/main.js` — navegación, reloj único, entrada, arranque y salud de fotogramas.
