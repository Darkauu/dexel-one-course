// Sección 04 · Punto 03: triángulos vs. cuadriláteros. Dos escenas con la malla a la
// vista (las líneas se pintan en el sombreador sobre cada cara: todo es opaco):
//   topo-tri  — un puesto de frutas, asset quieto del fondo de un juego, triangulado.
//   topo-quad — un NPC con malla de cuadriláteros que camina en el lugar en loop; sus
//               codos y rodillas se doblan deformando la malla, no como piezas rígidas.
import * as THREE from 'three';
import { PALETTE, addLights, fitDistance } from './shared.js';
import { plinth } from './tech.js';

const LINE = new THREE.Color(PALETTE.inkDeep);

// Material con la retícula de la malla. Las UV se escalan para que cada celda de la
// geometría mida 1 (ver gridUv): las líneas caen justo en sus aristas. tri añade la
// diagonal de cada celda (los dos triángulos del cuadrilátero); diag dice hacia dónde
// va según cómo triangula three.js la geometría (0: cajas, 1: esferas). bary: en vez
// de UV, coordenadas baricéntricas por triángulo (piezas chicas y redondas).
function wireMat(color, { tri = false, diag = 0, bary = false } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLineColor = { value: LINE };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vGridUv;${bary ? '\nattribute vec3 aBary;\nvarying vec3 vBary;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvGridUv = uv;${bary ? '\nvBary = aBary;' : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vGridUv;\nuniform vec3 uLineColor;${bary ? '\nvarying vec3 vBary;' : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 gw = max(fwidth(vGridUv), vec2(1e-5));
        vec2 g = fract(vGridUv);
        vec2 dd = min(g, 1.0 - g) / gw;
        float q = min(dd.x, dd.y);
        ${tri ? `float dg = ${diag ? 'abs(g.x + g.y - 1.0)' : 'abs(g.x - g.y)'};
        q = min(q, dg / (gw.x + gw.y) * 1.414);` : ''}
        ${bary ? 'vec3 bw = max(fwidth(vBary), vec3(1e-5)); vec3 bd = vBary / bw; q = min(bd.x, min(bd.y, bd.z)) + 0.5;' : ''}
        diffuseColor.rgb = mix(diffuseColor.rgb, uLineColor, 1.0 - smoothstep(0.7, 1.7, q));
      }`);
  };
  m.customProgramCacheKey = () => `wire-${tri ? 1 : 0}-${diag}-${bary ? 1 : 0}`;
  return m;
}

// Caja con segmentos según su tamaño y UV en «celdas» (cada segmento mide 1 en UV).
const SEG = 0.32;
function gridBox(w, h, d, segs) {
  const [sx, sy, sz] = segs || [w, h, d].map((v) => Math.max(1, Math.round(v / SEG)));
  const g = new THREE.BoxGeometry(w, h, d, sx, sy, sz);
  // Orden de las caras en BoxGeometry: +x, −x, +y, −y, +z, −z.
  const scale = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  const uv = g.attributes.uv, idx = g.index.array;
  g.groups.forEach((gr, k) => {
    const seen = new Set();
    for (let i = gr.start; i < gr.start + gr.count; i++) seen.add(idx[i]);
    for (const v of seen) uv.setXY(v, uv.getX(v) * scale[k][0], uv.getY(v) * scale[k][1]);
  });
  return g;
}
// Fruta: icosaedro (20 triángulos: en pantalla es chica), con baricéntricas por triángulo.
function lowFruit(r) {
  const g = new THREE.IcosahedronGeometry(r, 0); // ya viene sin índice
  const b = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < b.length / 3; i++) b[i * 3 + (i % 3)] = 1;
  g.setAttribute('aBary', new THREE.BufferAttribute(b, 3));
  return g;
}

class TopoStage {
  constructor({ az, radius, fy }) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    addLights(this.scene, { shadow: true, shadowSize: 5 });
    plinth(this.scene, 0, 2.3);
    this.period = 1e9;
    this.az = az; this.radius = radius; this.fy = fy;
  }

  // Cámara fija: lo único que se mueve en estas escenas es lo que debe moverse.
  aim(view) {
    const cam = this.camera;
    cam.aspect = view.w / view.h;
    const d = fitDistance(cam, this.radius, cam.aspect), el = 0.3;
    cam.position.set(d * Math.cos(el) * Math.sin(this.az), this.fy + d * Math.sin(el), d * Math.cos(el) * Math.cos(this.az));
    cam.lookAt(0, this.fy, 0);
    cam.updateProjectionMatrix();
  }
}

// --- A · puesto de frutas (triángulos, quieto) -------------------------------
export class TopoTriDemo extends TopoStage {
  constructor() {
    super({ az: 0.55, radius: 2.15, fy: 1.15 });
    const tri = (c) => wireMat(c, { tri: true });
    const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; this.scene.add(m); return m; };
    const wood = tri(PALETTE.peachShade), wood2 = tri(PALETTE.peach);
    // Mesa: tablero y patas.
    add(gridBox(2.6, 0.14, 1.3), wood2, 0, 1.0, 0);
    for (const [x, z] of [[-1.2, -0.55], [1.2, -0.55], [-1.2, 0.55], [1.2, 0.55]]) add(gridBox(0.12, 0.95, 0.12), wood, x, 0.47, z);
    // Toldo a rayas sobre dos postes.
    for (const x of [-1.25, 1.25]) add(gridBox(0.1, 1.7, 0.1), wood, x, 1.85, -0.6);
    const stripes = new THREE.Group();
    for (let k = 0; k < 7; k++) {
      const s = new THREE.Mesh(gridBox(2.8 / 7, 0.06, 1.2), tri(k % 2 ? PALETTE.paper : PALETTE.accent));
      s.position.set(-1.4 + (k + 0.5) * (2.8 / 7), 0, 0); s.castShadow = true;
      stripes.add(s);
    }
    stripes.position.set(0, 2.62, -0.1); stripes.rotation.x = 0.32;
    this.scene.add(stripes);
    // Cajones con fruta (colores de la fruta real, no de la marca).
    const FRUIT = [['#FF9A3C', 0.15], ['#E8433A', 0.14], ['#8BD450', 0.12]];
    [-0.8, 0, 0.8].forEach((x, k) => {
      add(gridBox(0.72, 0.28, 0.62), wood, x, 1.21, 0.05);
      const [c, r] = FRUIT[k], mat = wireMat(c, { bary: true });
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        add(lowFruit(r), mat, x - 0.22 + i * 0.22, 1.37 + r * 0.5, -0.1 + j * 0.3);
      }
      add(lowFruit(r), mat, x, 1.37 + r * 1.6, 0.05);
    });
    // Letrero al frente.
    add(gridBox(0.9, 0.36, 0.05), tri(PALETTE.paperShade), 0, 0.7, 0.67);
  }

  frame(dt, tl, view) {
    this.aim(view);
    return {};
  }
}

// --- B · NPC (cuadriláteros, animado) ----------------------------------------
// Extremidad que cuelga desde su articulación superior (y = 0 hacia abajo) y se dobla
// en la del medio: los vértices bajo la articulación giran; los cercanos giran solo
// una parte, así los bucles de cuadriláteros se estiran sin pliegues.
class Limb {
  constructor(len, thick, mat) {
    const g = gridBox(thick, len, thick, [2, 12, 2]);
    g.translate(0, -len / 2, 0);
    this.rest = Float32Array.from(g.attributes.position.array);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.castShadow = true;
    this.joint = -len / 2;
    this.blend = len * 0.12;
  }

  bend(a) {
    const p = this.mesh.geometry.attributes.position, r = this.rest, J = this.joint, B = this.blend;
    for (let i = 0; i < p.count; i++) {
      const y = r[i * 3 + 1], z = r[i * 3 + 2];
      const t = Math.min(1, Math.max(0, (J + B - y) / (2 * B)));
      const k = a * t * t * (3 - 2 * t);
      const c = Math.cos(k), s = Math.sin(k), dy = y - J;
      p.setY(i, J + dy * c - z * s);
      p.setZ(i, dy * s + z * c);
    }
    p.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}

export class TopoQuadDemo extends TopoStage {
  constructor() {
    super({ az: -0.5, radius: 2.0, fy: 1.45 });
    const quad = (c) => wireMat(c);
    const shirt = quad(PALETTE.peach), pants = quad(PALETTE.peachShade), skin = quad(PALETTE.paperShade);
    this.body = new THREE.Group();
    this.scene.add(this.body);
    const part = (geo, mat, x, y, z, parent = this.body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    part(gridBox(0.86, 1.0, 0.46, [4, 5, 2]), shirt, 0, 1.75, 0);           // torso
    this.head = part(gridBox(0.56, 0.56, 0.52, [3, 3, 3]), skin, 0, 2.58, 0);
    part(gridBox(0.62, 0.12, 0.58, [3, 1, 3]), quad(PALETTE.accent), 0, 2.9, 0, this.body); // gorra
    part(gridBox(0.14, 0.1, 0.12, [1, 1, 1]), skin, 0, 2.6, 0.31);           // nariz
    // Brazos y piernas: grupo en la articulación (hombro, cadera) + extremidad que se dobla.
    const limb = (len, th, mat, x, y) => { const g = new THREE.Group(); g.position.set(x, y, 0); this.body.add(g); const l = new Limb(len, th, mat); g.add(l.mesh); return { g, l }; };
    this.arms = [limb(1.0, 0.22, shirt, -0.56, 2.18), limb(1.0, 0.22, shirt, 0.56, 2.18)];
    this.legs = [limb(1.22, 0.28, pants, -0.22, 1.24), limb(1.22, 0.28, pants, 0.22, 1.24)];
  }

  frame(dt, tl, view) {
    this.aim(view);
    // Caminata en el lugar: ciclo de 1,1 s.
    const w = (tl / 1.1) * Math.PI * 2;
    const s = Math.sin(w);
    this.legs.forEach(({ g, l }, k) => {
      const ph = k ? -s : s;
      g.rotation.x = ph * 0.45;
      l.bend(-Math.max(0, -Math.sin(w + (k ? Math.PI : 0) - 0.6)) * 0.9);   // rodilla hacia atrás
    });
    this.arms.forEach(({ g, l }, k) => {
      const ph = k ? s : -s;
      g.rotation.x = ph * 0.5;
      l.bend(0.35 + Math.max(0, ph) * 0.55);                                  // codo hacia adelante
    });
    this.body.position.y = Math.abs(Math.cos(w)) * 0.06;
    this.head.rotation.y = Math.sin(w * 0.5) * 0.12;
    return {};
  }
}
