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
- Escenas nuevas: una clase que extiende `Stage` con `frame(dt, t, view, pointer)`,
  registrada en `SCENES` (`src/gl.js`) y usada en el HTML con
  `<div class="stage" data-3d="nombre">`.
- `src/gl.js` — un contexto WebGL: campo de ruido de fondo + un pase por zona.
- `src/main.js` — navegación, reloj único, entrada, arranque y salud de fotogramas.
