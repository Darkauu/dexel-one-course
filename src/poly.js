// Sección 04 · Punto 02: polígonos o caras. Una barra (data-ui="polyDetail", 0–100)
// decide cuántas caras tiene el modelo de referencia (un peón, por revolución). A la
// izquierda se ve la pieza más o menos facetada; a la derecha, el peso del STL binario
// como un número sólido de píxeles que cambia de color según lo grande que es.
// STL binario: 80 bytes de cabecera + 4 de cantidad + 50 bytes por triángulo.
import * as THREE from 'three';
import { PALETTE, addLights, damp, fitDistance } from './shared.js';
import { FONT } from './electronics.js';
import { voxelMesh } from './flow.js';

// Valores de la interfaz (los escribe main.js al mover la barra).
export const ui = { polyDetail: 35 };

const MIN_FACES = 24, MAX_FACES = 300000;
// Barra → caras: escala logarítmica (cada tramo igual de la barra multiplica las caras).
// El peón se arma por revolución: n lados × m tramos del perfil, 2 triángulos cada uno.
export function polyDetail(v) {
  const target = MIN_FACES * Math.pow(MAX_FACES / MIN_FACES, Math.min(100, Math.max(0, v)) / 100);
  const n = Math.max(3, Math.round(Math.sqrt(target)));
  const m = Math.max(2, Math.round(n / 2));
  const faces = 2 * n * m;
  return { n, m, faces, bytes: 84 + 50 * faces };
}

export function formatBytes(b) {
  const f = (x, d) => x.toFixed(d).replace('.', ',');
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${f(b / 1024, b < 10240 ? 1 : 0)} KB`;
  return `${f(b / 1048576, 1)} MB`;
}

// Verde, amarillo, naranja, rojo (colores de semáforo, no de la marca; sobre ink:
// 8,9 · 12,9 · 7,4 · 4,4 : 1, este último solo en texto grande). El rojo es el acento.
export const LEVELS = [
  { max: 100 * 1024, color: '#5FD068', name: 'bajo' },
  { max: 1024 * 1024, color: '#F7DF1E', name: 'medio' },
  { max: 6 * 1024 * 1024, color: '#FF8A1F', name: 'alto' },
  { max: Infinity, color: PALETTE.accent, name: 'muy alto' },
];
export const levelOf = (b) => LEVELS.findIndex((l) => b < l.max);

const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const formatFaces = fmt;

// --- Modelo de referencia ---------------------------------------------------
// Perfil del peón (radio, alto), suavizado con una curva; se muestrea en m tramos.
const PAWN = [[0, 0], [1.05, 0], [1.1, 0.12], [1.0, 0.24], [0.78, 0.34], [0.62, 0.5], [0.5, 0.95], [0.44, 1.5],
  [0.7, 1.62], [0.72, 1.72], [0.42, 1.82], [0.5, 2.05], [0.56, 2.32], [0.46, 2.6], [0.24, 2.78], [0, 2.82]];
const pawnCurve = new THREE.SplineCurve(PAWN.map(([r, y]) => new THREE.Vector2(r, y)));

export class PolyModelDemo {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    addLights(this.scene, { shadow: false });
    this.period = 1e9;
    this.orbit = { az: 0, el: 0 };
    this.mat = new THREE.MeshStandardMaterial({ color: PALETTE.paper, roughness: 0.55, flatShading: true });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.scene.add(this.mesh);
    this.key = '';
    this.pop = 1;
  }

  rebuild(n, m) {
    const pts = pawnCurve.getSpacedPoints(m).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
    this.mesh.geometry.dispose();
    const g = new THREE.LatheGeometry(pts, n);
    g.translate(0, -1.41, 0);
    this.mesh.geometry = g;
  }

  frame(dt, tl, view, pointer) {
    const { n, m } = polyDetail(ui.polyDetail);
    const key = `${n}x${m}`;
    if (key !== this.key) { this.rebuild(n, m); this.key = key; this.pop = 0.94; }
    this.pop = damp(this.pop, 1, 0.08, dt);
    const cam = this.camera;
    cam.aspect = view.w / view.h;
    this.orbit.az = damp(this.orbit.az, pointer.nx * 0.3, 0.5, dt);
    this.orbit.el = damp(this.orbit.el, -pointer.ny * 0.1, 0.5, dt);
    const d = fitDistance(cam, 1.75, cam.aspect), el = 0.28 + this.orbit.el;
    cam.position.set(d * Math.cos(el) * Math.sin(this.orbit.az), d * Math.sin(el), d * Math.cos(el) * Math.cos(this.orbit.az));
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    this.mesh.rotation.y = tl * 0.35;
    this.mesh.scale.setScalar(this.pop);
    return {};
  }
}

// --- Peso en bytes: número sólido de píxeles ---------------------------------
const EXTRA = {
  K: '#   #|#  # |# #  |##   |# #  |#  # |#   #', B: '#### |#   #|#   #|#### |#   #|#   #|#### ',
  ',': '     |     |     |     |##   | #   |#    ', ' ': '     |     |     |     |     |     |     ',
};
const GLYPH = { ...FONT, ...Object.fromEntries(Object.entries(EXTRA).map(([k, v]) => [k, v.split('|')])) };

export class PolyBytesDemo {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
    addLights(this.scene, { shadow: false });
    this.period = 1e9;
    this.orbit = { az: 0, el: 0 };
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.color = new THREE.Color(LEVELS[0].color);
    this.target = new THREE.Color(LEVELS[0].color);
    this.text = '';
    this.width = 10;
    this.pop = 1;
  }

  rebuild(text) {
    const cells = new Map(), H = 7, D = 3;
    let x = 0;
    for (const ch of text) {
      const g = GLYPH[ch] || GLYPH[' '];
      g.forEach((row, r) => [...row].forEach((p, c) => { if (p === '#') for (let z = 0; z < D; z++) cells.set(`${x + c},${H - 1 - r},${z}`, '#ffffff'); }));
      x += ch === ',' ? 3 : ch === ' ' ? 4 : 6;
    }
    this.width = x;
    this.group.clear();
    if (this.mesh) { this.mesh.geometry.dispose(); }
    this.mesh = voxelMesh(cells, 0.2);
    this.mesh.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, color: this.color, emissive: '#000000' });
    this.group.add(this.mesh);
  }

  frame(dt, tl, view, pointer) {
    const { bytes } = polyDetail(ui.polyDetail);
    const text = formatBytes(bytes);
    if (text !== this.text) {
      this.rebuild(text);
      // Salto corto solo cuando cambia de unidad o de nivel; si no, un pop chico.
      this.pop = this.text && levelOf(bytes) !== this.level ? 1.18 : 1.05;
      this.text = text;
    }
    this.level = levelOf(bytes);
    this.target.set(LEVELS[this.level].color);
    this.color.lerp(this.target, 1 - Math.exp(-dt / 0.12));
    this.mesh.material.color.copy(this.color);
    // Rojo: late para avisar que el archivo ya es pesado.
    const warn = this.level === 3 ? 0.5 + 0.5 * Math.sin(tl * 6) : 0;
    this.mesh.material.emissive.copy(this.color).multiplyScalar(0.12 + 0.2 * warn);
    this.pop = damp(this.pop, 1, 0.1, dt);

    const cam = this.camera;
    cam.aspect = view.w / view.h;
    // Vista de tres cuartos que se mece: se ven los costados del número (es un sólido).
    this.orbit.az = damp(this.orbit.az, pointer.nx * 0.25 - 0.22 + Math.sin(tl * 0.6) * 0.07, 0.5, dt);
    this.orbit.el = damp(this.orbit.el, -pointer.ny * 0.1 + 0.16, 0.5, dt);
    // Encuadre fijo para el número más ancho («999 KB»): el tamaño no salta al cambiar.
    const d = fitDistance(cam, 3.6, cam.aspect);
    cam.position.set(d * Math.cos(this.orbit.el) * Math.sin(this.orbit.az), d * Math.sin(this.orbit.el), d * Math.cos(this.orbit.el) * Math.cos(this.orbit.az));
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    this.group.scale.setScalar(this.pop);
    return {};
  }
}
