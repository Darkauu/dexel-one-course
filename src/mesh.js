// Sección 04 · Punto 01: vértices, aristas, caras y mallas. Un prisma hexagonal en el
// centro que se construye por fases (la fase la da el paso de la diapositiva):
//   0 · vértices: los 12 puntos aparecen uno a uno y brillan.
//   1 · aristas: las 18 líneas crecen de vértice a vértice y pasan a brillar ellas.
//   2 · caras: las 8 caras se abren desde su centro y brillan.
//   3 · malla: la triangulación (20 triángulos, como en un STL) se dibuja encima,
//       al estilo de la vista de malla de Fusion 360, y la pieza empieza a girar.
// Lo que pertenece a una fase anterior ya está construido; lo que brilla es siempre
// lo de la fase actual. Todo es opaco.
import * as THREE from 'three';
import { PALETTE, addLights, damp, fitDistance, easeElastic, smooth } from './shared.js';

const MINT = '#7EE0B5';          // color de la sección 04 (no es de la marca)
const R = 1.35, H = 1.5;         // radio y alto del prisma
const N = 6;

export class MeshDemo {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    addLights(this.scene, { shadow: false });
    this.period = 1e9;
    this.phase = -1;
    this.pt = 0;
    this.orbit = { az: 0, el: 0 };
    this.yaw = 0.35; this.spin = 0;
    this.glow = [0, 0, 0, 0];
    this.obj = new THREE.Group();
    this.scene.add(this.obj);
    this.mint = new THREE.Color(MINT);

    // Vértices: abajo 0–5, arriba 6–11.
    const V = [];
    for (const y of [-H / 2, H / 2]) for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      V.push(new THREE.Vector3(Math.cos(a) * R, y, Math.sin(a) * R));
    }
    this.V = V;
    const E = [];
    for (let i = 0; i < N; i++) { E.push([i, (i + 1) % N]); E.push([N + i, N + (i + 1) % N]); E.push([i, N + i]); }
    this.E = E;
    const F = [[0, 1, 2, 3, 4, 5].reverse(), [6, 7, 8, 9, 10, 11]];
    for (let i = 0; i < N; i++) { const j = (i + 1) % N; F.push([i, j, N + j, N + i].reverse()); }
    this.F = F;

    // --- vértices: cubos de píxel
    this.mats = [0, 1, 2].map((k) => new THREE.MeshStandardMaterial({
      color: k === 2 ? PALETTE.peach : PALETTE.paper, roughness: 0.5, emissive: '#000000',
      polygonOffset: k === 2, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: k === 2 ? THREE.DoubleSide : THREE.FrontSide,
    }));
    this.base = [new THREE.Color(PALETTE.paper), new THREE.Color(PALETTE.paperShade), new THREE.Color(PALETTE.peach)];
    this.verts = V.map((p) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), this.mats[0]); m.position.copy(p); this.obj.add(m); return m; });

    // --- aristas: barras que crecen desde el primer vértice
    this.edges = E.map(([a, b]) => {
      const g = new THREE.BoxGeometry(0.055, 0.055, 1); g.translate(0, 0, 0.5);
      const m = new THREE.Mesh(g, this.mats[1]);
      m.position.copy(V[a]); m.lookAt(V[b]); m.userData.len = V[a].distanceTo(V[b]);
      m.scale.set(1, 1, 0.0001); m.visible = false;
      this.obj.add(m);
      return m;
    });

    // --- caras: polígonos que se abren desde su centro
    this.faces = F.map((f) => {
      const c = f.reduce((s, i) => s.add(V[i]), new THREE.Vector3()).multiplyScalar(1 / f.length);
      const pos = [];
      for (let k = 1; k < f.length - 1; k++) for (const i of [f[0], f[k], f[k + 1]]) pos.push(V[i].x - c.x, V[i].y - c.y, V[i].z - c.z);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.mats[2]); m.position.copy(c); m.scale.setScalar(0.0001); m.visible = false;
      this.obj.add(m);
      return m;
    });

    // --- malla: triangulación del STL (lados en 2, tapas en abanico: 20 triángulos),
    //     un pelo afuera de las caras para que no peleen por la profundidad.
    const seg = [];
    const addTri = (a, b, c) => { for (const [p, q] of [[a, b], [b, c], [c, a]]) seg.push([p, q]); };
    for (const f of F) for (let k = 1; k < f.length - 1; k++) addTri(V[f[0]], V[f[k]], V[f[k + 1]]);
    this.triangles = seg.length / 3;
    // Barras finas (no líneas de 1 px: deben leerse en el proyector), un pelo afuera.
    const out = (p) => p.clone().multiplyScalar(1.015);
    // Orden de abajo hacia arriba: la malla se dibuja como un barrido.
    seg.sort((s1, s2) => (s1[0].y + s1[1].y) - (s2[0].y + s2[1].y));
    this.lineMat = new THREE.MeshStandardMaterial({ color: PALETTE.inkDeep, roughness: 0.6, emissive: '#000000' });
    const bar = new THREE.BoxGeometry(0.026, 0.026, 1); bar.translate(0, 0, 0.5);
    this.lines = new THREE.InstancedMesh(bar, this.lineMat, seg.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1);
    seg.forEach(([p0, p1], i) => {
      const a = out(p0), b2 = out(p1), dir = b2.clone().sub(a);
      q.setFromUnitVectors(z, dir.clone().normalize());
      m4.compose(a, q, new THREE.Vector3(1, 1, dir.length()));
      this.lines.setMatrixAt(i, m4);
    });
    this.lines.count = 0;
    this.lines.visible = false;
    this.obj.add(this.lines);
    this.lineCount = seg.length;
  }

  applyPhase(step) {
    if (step === this.phase) return;
    this.phase = step;
    this.pt = 0;
  }

  // Progreso (0–1) del elemento i de la fase `owner`: entra `each` s después del
  // anterior y tarda `dur` s. De una fase anterior ya está completo; de una posterior,
  // todavía no existe.
  built(owner, i, dur, each) {
    if (this.phase > owner) return 1;
    if (this.phase < owner) return 0;
    return Math.min(1, Math.max(0, (this.pt - i * each) / dur));
  }

  frame(dt, tl, view, pointer, step = 0) {
    this.applyPhase(step);
    this.pt += dt;
    const p = this.phase, t = this.pt;
    const cam = this.camera;
    cam.aspect = view.w / view.h;
    this.orbit.az = damp(this.orbit.az, pointer.nx * 0.18, 0.5, dt);
    this.orbit.el = damp(this.orbit.el, -pointer.ny * 0.08, 0.5, dt);
    const d = fitDistance(cam, 2.25, cam.aspect);
    const el = 0.42 + this.orbit.el, az = 0.0 + this.orbit.az;
    cam.position.set(d * Math.cos(el) * Math.sin(az), d * Math.sin(el), d * Math.cos(el) * Math.cos(az));
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();

    // Vértices: pop elástico uno a uno.
    this.verts.forEach((m, i) => { const u = this.built(0, i, 0.45, 0.06); m.scale.setScalar(Math.max(0.0001, easeElastic(u))); m.visible = u > 0; });
    // Aristas: crecen de a una (orden: base, tope, verticales intercaladas).
    this.edges.forEach((m, i) => { const u = smooth(this.built(1, i, 0.28, 0.045)); m.visible = u > 0; m.scale.z = Math.max(0.0001, u * m.userData.len); });
    // Caras: se abren desde su centro.
    this.faces.forEach((m, i) => { const u = this.built(2, i, 0.5, 0.09); m.visible = u > 0; m.scale.setScalar(Math.max(0.0001, easeElastic(u))); });
    // Malla: barrido de abajo hacia arriba.
    const mu = this.built(3, 0, 0.7, 0);
    this.lines.visible = mu > 0;
    this.lines.count = Math.round(mu * this.lineCount);

    // Brillo: lo de la fase actual pulsa rápido; lo anterior vuelve a su color.
    const pulse = 0.5 + 0.5 * Math.sin(tl * 9);
    for (let k = 0; k < 4; k++) {
      this.glow[k] = damp(this.glow[k], k === p ? 1 : 0, 0.18, dt);
      const g = this.glow[k] * smooth(t / 0.25);
      if (k < 3) {
        const m = this.mats[k];
        m.color.copy(this.base[k]).lerp(this.mint, g * 0.75);
        m.emissive.copy(this.mint).multiplyScalar(g * (0.25 + 0.55 * pulse));
      } else {
        this.lineMat.color.set(PALETTE.inkDeep).lerp(this.mint, g * 0.85);
        this.lineMat.emissive.copy(this.mint).multiplyScalar(g * (0.25 + 0.55 * pulse));
      }
    }

    // Giro: solo en la fase de malla; al salir, vuelve a la pose (múltiplo de 60°).
    this.spin = damp(this.spin, p === 3 ? 0.7 : 0, 0.4, dt);
    if (p === 3) this.yaw += this.spin * dt;
    else {
      const step60 = Math.PI / 3, rest = 0.35 + Math.round((this.yaw - 0.35) / step60) * step60;
      this.yaw = damp(this.yaw, rest, 0.35, dt);
    }
    this.obj.rotation.y = this.yaw;
    this.obj.rotation.x = 0;
    return {};
  }
}
