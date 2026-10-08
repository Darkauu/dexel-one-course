// Sección 03 / Flujo de software · Punto 01: diagrama de acción.
// foto → IA (Tripo / Meshy) → STL → Cura → G-code → microSD → impresora.
// Un escenario pequeño por paso. Las piezas «de píxeles» se arman con vóxeles en una
// sola malla con solo las caras exteriores (se ven sólidas, sin retícula); los logos
// son formas extruidas. Un turno recorre los pasos en orden: el activo da un salto.
import * as THREE from 'three';
import { PALETTE, addLights, damp, fitDistance } from './shared.js';

const STEP = 1.2;                 // s por paso del recorrido
const STEPS = 7;
export const FLOW_PERIOD = STEP * STEPS;
export const FLOW_STEP = STEP;

// Colores de objetos reales (no de la marca), como los de los materiales.
const C = {
  paper: PALETTE.paper, shade: PALETTE.paperShade, peach: PALETTE.peach, peachShade: PALETTE.peachShade,
  ink: PALETTE.inkDeep, accent: PALETTE.accent,
  sky: '#9ACBEA', sun: '#F7DF1E', tripoYellow: '#F5C21B', curaBlue: '#2C6BED', sdBody: '#34343E',
};

// --- Vóxeles → una malla con caras exteriores y color por vértice ------------
// cells: Map "x,y,z" → color. y hacia arriba, z hacia la cámara.
const FACES = [
  { n: [1, 0, 0], v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], v: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
function voxelMesh(cells, unit) {
  const pos = [], nor = [], col = [];
  const c = new THREE.Color();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const k of cells.keys()) {
    const [x, y, z] = k.split(',').map(Number);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1); z0 = Math.min(z0, z); z1 = Math.max(z1, z + 1);
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  for (const [k, hex] of cells) {
    const [x, y, z] = k.split(',').map(Number);
    c.set(hex);
    for (const f of FACES) {
      if (cells.has(`${x + f.n[0]},${y + f.n[1]},${z + f.n[2]}`)) continue; // cara interior
      const q = f.v.map(([a, b, d]) => [(x + a - cx) * unit, (y + b - cy) * unit, (z + d - cz) * unit]);
      for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...q[i]); nor.push(...f.n); col.push(c.r, c.g, c.b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 }));
  m.castShadow = true;
  return m;
}

// Dibujo de filas (arriba → abajo) a celdas. map: carácter → color; depth: carácter →
// [desde, hasta) en z (por defecto [0, d)).
function fromRows(rows, map, d = 2, depth = {}) {
  const cells = new Map();
  const H = rows.length;
  rows.forEach((row, r) => [...row].forEach((ch, x) => {
    if (!map[ch]) return;
    const [za, zb] = depth[ch] || [0, d];
    for (let z = za; z < zb; z++) cells.set(`${x},${H - 1 - r},${z}`, map[ch]);
  }));
  return cells;
}
// Escribe texto de píxeles (fuente 3 × 5) sobre la cara frontal, sobresaliendo `lift`.
const FONT3 = {
  '.': ['   ', '   ', '   ', '   ', ' # '], S: [' ##', '#  ', ' # ', '  #', '## '], T: ['###', ' # ', ' # ', ' # ', ' # '],
  L: ['#  ', '#  ', '#  ', '#  ', '###'], D: ['## ', '# #', '# #', '# #', '## '], G: ['###', '#  ', '# #', '# #', '###'],
};
function stamp(cells, text, x, yTop, z, color, H) {
  for (const ch of text) {
    const g = FONT3[ch];
    const w = ch === '.' ? 1 : 3;
    g.forEach((row, r) => [...row].forEach((p, c) => {
      if (p !== '#') return;
      const cx = ch === '.' ? x : x + c;
      cells.set(`${cx},${H - 1 - (yTop + r)},${z}`, color);
    }));
    x += w + 1;
  }
}

// --- Escenario base ---------------------------------------------------------
class FlowItem {
  constructor(index, radius = 1.6) {
    this.index = index;
    this.radius = radius;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    addLights(this.scene);
    this.obj = new THREE.Group();
    this.scene.add(this.obj);
    this.period = 1e9;
    this.orbit = { az: 0, el: 0 };
    this.hop = 0;
    this.baseYaw = -0.35;
  }

  // Turno del recorrido: el paso activo salta y gira un poco; los demás respiran.
  frame(dt, tl, view, pointer) {
    const cam = this.camera;
    cam.aspect = view.w / view.h;
    this.orbit.az = damp(this.orbit.az, pointer.nx * 0.35, 0.5, dt);
    this.orbit.el = damp(this.orbit.el, -pointer.ny * 0.15, 0.5, dt);
    const d = fitDistance(cam, this.radius, cam.aspect);
    const el = 0.18 + this.orbit.el;
    cam.position.set(d * Math.cos(el) * Math.sin(this.orbit.az), d * Math.sin(el), d * Math.cos(el) * Math.cos(this.orbit.az));
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();

    const u = (tl % FLOW_PERIOD) / STEP;
    const active = Math.floor(u) === this.index;
    const k = active ? Math.sin(Math.PI * (u - this.index)) : 0;
    this.hop = damp(this.hop, k, 0.08, dt);
    this.obj.position.y = Math.sin(tl * 1.4 + this.index) * 0.04 + this.hop * 0.22;
    this.obj.rotation.y = this.baseYaw + Math.sin(tl * 0.5 + this.index * 0.7) * 0.25 + this.hop * 0.5;
    this.obj.scale.setScalar(1 + this.hop * 0.06);
    this.animate?.(dt, tl);
    return {};
  }
}

// 01 · Foto: polaroid de píxeles.
export class FlowPhoto extends FlowItem {
  constructor() {
    super(0, 1.25);
    const P = [
      'BBBBBBBBBBYYBB', 'BBBBBBBBBYYYYB', 'BBBBBBBBBYYYYB', 'BBBBBBBBBBYYBB', 'BBBBBBWBBBBBBB',
      'BBBBBWWWBBBBBB', 'BBBBWWWWWBBBBB', 'BBBWWWWWWWBBBB', 'BBWWWWWWWWWSBB', 'GGGGGGGGGGGSSG',
      'GGGGGGGGGGGGGG', 'GGGGGGGGGGGGGG', 'GGGGGGGGGGGGGG',
    ];
    const rows = ['F'.repeat(16), ...P.map((r) => `F${r}F`), ...Array(4).fill('F'.repeat(16))];
    // El marco sobresale un vóxel sobre la foto.
    const cells = fromRows(rows, { F: C.paper, B: C.sky, Y: C.sun, W: C.paper, S: C.shade, G: C.peachShade }, 2, {
      B: [0, 1], Y: [0, 1], W: [0, 1], S: [0, 1], G: [0, 1],
    });
    this.obj.add(voxelMesh(cells, 0.13));
  }
}

// 02 · IA: logo de Tripo3D (la V blanca y la T amarilla), extruido.
export class FlowAI extends FlowItem {
  constructor() {
    super(1, 1.3);
    const s = 0.0115, X = (x) => (x - 108) * s, Y = (y) => (110 - y) * s;
    const shape = (pts) => { const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(X(x), Y(y)) : sh.moveTo(X(x), Y(y)))); sh.closePath(); return sh; };
    const ext = { depth: 0.32, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 2 };
    const v = new THREE.Mesh(new THREE.ExtrudeGeometry(shape([[18, 46], [46, 30], [110, 152], [140, 98], [170, 112], [116, 198], [100, 198]]), ext),
      new THREE.MeshStandardMaterial({ color: C.paper, roughness: 0.5 }));
    const t = new THREE.Mesh(new THREE.ExtrudeGeometry(shape([[62, 27], [198, 27], [186, 61], [162, 61], [138, 108], [106, 108], [128, 61], [76, 61]]), { ...ext, depth: 0.36 }),
      new THREE.MeshStandardMaterial({ color: C.tripoYellow, roughness: 0.45 }));
    for (const m of [v, t]) { m.geometry.translate(0, 0, -0.18); m.castShadow = true; this.obj.add(m); }
  }
}

// 03 · Archivo STL: ícono de archivo de píxeles con «.STL».
export class FlowStl extends FlowItem {
  constructor() {
    super(2, 1.3);
    const W = 16, H = 19, fold = 5;
    const rows = Array.from({ length: H }, (_, r) => [...Array(W)].map((_, c) => {
      if (r < fold && c >= W - fold) return c - (W - fold) <= r ? (c - (W - fold) === r ? 'E' : 'K') : ' ';
      return 'P';
    }).join(''));
    const cells = fromRows(rows, { P: C.paper, K: C.shade, E: C.shade }, 2, { K: [1, 3] });
    stamp(cells, '.STL', 2, 9, 2, C.accent, H);
    this.obj.add(voxelMesh(cells, 0.12));
  }
}

// 04 · Cura: logo de Ultimaker Cura (cuadro azul de esquinas cortadas, borde blanco y la C).
export class FlowCura extends FlowItem {
  constructor() {
    super(3, 1.3);
    const chamfer = (half, cut) => {
      const sh = new THREE.Shape();
      sh.moveTo(-half + cut, half); sh.lineTo(half, half); sh.lineTo(half, -half + cut);
      sh.lineTo(half - cut, -half); sh.lineTo(-half, -half); sh.lineTo(-half, half - cut);
      sh.closePath();
      return sh;
    };
    const outer = chamfer(1.0, 0.42), inner = chamfer(0.86, 0.36);
    const border = outer.clone(); border.holes.push(new THREE.Path(inner.getPoints().reverse()));
    const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45 });
    const blue = new THREE.Mesh(new THREE.ExtrudeGeometry(inner, { depth: 0.26, bevelEnabled: false }), mat(C.curaBlue));
    const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(border, { depth: 0.34, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 1 }), mat(C.paper));
    // La C: anillo abierto a la derecha.
    const R = 0.5, r = 0.3, a0 = Math.PI / 4.2;
    const cs = new THREE.Shape();
    cs.absarc(0, 0, R, a0, Math.PI * 2 - a0, false);
    cs.lineTo(Math.cos(-a0) * r, Math.sin(-a0) * r);
    cs.absarc(0, 0, r, Math.PI * 2 - a0, a0, true);
    cs.closePath();
    const c = new THREE.Mesh(new THREE.ExtrudeGeometry(cs, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 1, curveSegments: 32 }), mat(C.paper));
    for (const m of [blue, rim, c]) { m.geometry.translate(0, 0, -0.17); m.castShadow = true; this.obj.add(m); }
  }
}

// 05 · G-code: una pantalla de píxeles con líneas de código que suben.
export class FlowGcode extends FlowItem {
  constructor() {
    super(4, 1.3);
    const W = 16, H = 14;
    const rows = Array.from({ length: H }, (_, r) => [...Array(W)].map((_, c) => (r === 0 || r === H - 1 || c === 0 || c === W - 1 ? 'F' : 'S')).join(''));
    // Marco durazno que sobresale; la pantalla (ink) queda un vóxel más adentro.
    const cells = fromRows(rows, { F: C.peachShade, S: C.ink }, 2, { S: [0, 1] });
    this.unit = 0.12;
    this.obj.add(voxelMesh(cells, this.unit));
    // Líneas: cubos que se encienden por fila; el texto «sube» de a una fila.
    this.cols = W - 4; this.lines = 5;
    this.bars = new THREE.InstancedMesh(new THREE.BoxGeometry(this.unit, this.unit, this.unit), new THREE.MeshBasicMaterial({ color: '#ffffff' }), this.cols * this.lines);
    this.obj.add(this.bars);
    this.seq = Array.from({ length: 24 }, (_, i) => ({ g: 2, len: 3 + ((i * 7) % 7), color: i % 6 === 0 ? C.accent : i % 2 ? C.paper : C.peach }));
    this.row = -1; this.W = W; this.H = H;
  }

  animate(dt, tl) {
    const row = Math.floor(tl / 0.4);
    if (row === this.row) return;
    this.row = row;
    const m = new THREE.Matrix4(), col = new THREE.Color(), u = this.unit;
    let n = 0;
    for (let l = 0; l < this.lines; l++) {
      const line = this.seq[(row + l) % this.seq.length];
      for (let c = 0; c < this.cols; c++) {
        const on = c < 2 || (c >= 3 && c < 3 + line.len);
        const x = (2 + c - this.W / 2 + 0.5) * u, y = (this.H / 2 - 2.5 - l * 2.2) * u;
        m.makeScale(on ? 1 : 0, on ? 1 : 0, on ? 1 : 0).setPosition(x, y, 0.5 * u);
        this.bars.setMatrixAt(n, m);
        this.bars.setColorAt(n, col.set(c < 2 ? C.sun : line.color));
        n++;
      }
    }
    this.bars.instanceMatrix.needsUpdate = true;
    this.bars.instanceColor.needsUpdate = true;
  }
}

// 06 · microSD de píxeles.
export class FlowSd extends FlowItem {
  constructor() {
    super(5, 1.2);
    const rows = [
      'BBBBBBBBB  ', 'BBBBBBBBB  ', 'BBBBBBBBB  ', 'BBBBBBBBB  ', 'BBBBBBBBBB ',
      'BBBBBBBBBBB', 'BLLLLLLLLB ', 'BLLLLLLLLB ', 'BLLLLLLLLLB', 'BLLLLLLLLLB',
      'BLLLLLLLLLB', 'BLLLLLLLLLB', 'BLLLLLLLLLB', 'BBBBBBBBBBB', 'BBBBBBBBBBB',
    ];
    const cells = fromRows(rows, { B: C.sdBody, L: C.accent }, 2);
    stamp(cells, 'SD', 2, 8, 2, C.paper, rows.length);
    for (let x = 1; x < 8; x += 2) for (let y = 0; y < 3; y++) cells.set(`${x},${rows.length - 1 - y},2`, C.peach); // contactos
    this.obj.add(voxelMesh(cells, 0.14));
    this.baseYaw = -0.25;
  }
}

// 07 · Impresora: una Ender 3 simplificada (marco, gantry con carro y cama).
export class FlowPrinter extends FlowItem {
  constructor() {
    super(6, 1.55);
    const mat = (c, r = 0.55) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; this.obj.add(b); return b; };
    const frame = mat(C.peachShade), dark = mat('#6A4550');
    const g = new THREE.Group(); this.obj.add(g);
    // Base: dos largueros y dos travesaños.
    box(0.16, 0.16, 2.0, frame, -0.9, -1.1, 0); box(0.16, 0.16, 2.0, frame, 0.9, -1.1, 0);
    box(1.96, 0.16, 0.16, frame, 0, -1.1, 0.92); box(1.96, 0.16, 0.16, frame, 0, -1.1, -0.92);
    // Montantes y travesaño superior.
    box(0.16, 2.2, 0.16, frame, -0.9, 0.08, -0.1); box(0.16, 2.2, 0.16, frame, 0.9, 0.08, -0.1);
    box(1.96, 0.16, 0.16, frame, 0, 1.24, -0.1);
    // Cama.
    this.bed = box(1.3, 0.06, 1.3, mat(C.shade), 0, -0.92, 0.1);
    // Gantry X con carro y boquilla.
    this.gantry = new THREE.Group(); this.obj.add(this.gantry);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.12), frame); bar.castShadow = true; this.gantry.add(bar);
    this.carriage = new THREE.Group(); this.gantry.add(this.carriage);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.22), mat(C.paper)); head.position.set(0, -0.08, 0.14); head.castShadow = true;
    const noz = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 10), mat(C.accent, 0.4)); noz.rotation.x = Math.PI; noz.position.set(0, -0.29, 0.14);
    this.carriage.add(head, noz);
    this.gantry.position.set(0, -0.48, -0.1);
    // Motor, fuente y pantalla.
    box(0.26, 0.26, 0.26, dark, -0.9, -0.85, 0.16);
    box(0.22, 0.9, 0.5, dark, 1.12, -0.5, -0.45);
    box(0.36, 0.26, 0.08, mat(C.curaBlue, 0.4), 1.08, -0.86, 0.9).rotation.x = -0.5;
    // Pieza que crece en la cama mientras imprime.
    this.part = box(0.36, 0.01, 0.36, mat(C.accent, 0.5), 0, -0.88, 0.12);
    this.baseYaw = -0.55;
  }

  animate(dt, tl) {
    const t = tl * 2.2;
    this.carriage.position.x = Math.sin(t) * 0.18;
    this.bed.position.z = 0.1 + Math.sin(t * 0.73) * 0.12;
    this.part.position.z = this.bed.position.z;
    const h = 0.02 + ((tl % FLOW_PERIOD) / FLOW_PERIOD) * 0.32;
    this.part.scale.y = h / 0.01;
    this.part.position.y = -0.89 + h / 2;
    this.gantry.position.y = h - 0.5; // la boquilla queda justo sobre la pieza
  }
}
