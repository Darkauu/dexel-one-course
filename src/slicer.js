// Sección 03 · Punto 02: ¿Qué es un slicer? La poción de ejemplo sobre una cama virtual
// (como la vista de Cura). Cada fase tiene su animación, que arranca al entrar a ella:
//   0 · cama vacía.
//   1 · insertar: la poción cae y rebota (elástico) sobre la cama.
//   2 · configurar: un panel 3D flota encima, con deslizadores que se mueven,
//       interruptores que cambian y botones que se presionan.
//   3 · preview: la pieza se rehace de abajo hacia arriba, una fila de vóxeles por capa.
//   4 · guardar: la pieza se achica y entra en un archivo .GCODE.
// La poción viene de src/assets/potion.glb (y sus capas, de potion-layers.json):
// reconstruida en bloques desde el modelo original, sin la línea suelta que traía
// (ver tools/potion-voxelize.mjs).
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three-addons/loaders/GLTFLoader.js';
import potionBytes from './assets/potion.glb';
import potionLayers from './assets/potion-layers.json';
import { PALETTE, STAND_GRAY, addLights, damp, fitDistance, easeElastic, easeInOut, smooth } from './shared.js';
import { voxelMesh, fromRows, stamp } from './flow.js';

const CURA_YELLOW = '#F5C518';  // color con que Cura muestra los modelos (no es de la marca)
const PLATE = 4.6;              // lado de la cama virtual
const HEIGHT = 3.2;             // alto de la poción en escena
const LAYER_DT = 0.09;          // s por capa en el preview
const DROP_FROM = 4.2;          // altura desde la que cae al insertarla

export class SlicerDemo {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    addLights(this.scene, { shadow: true, shadowSize: 6 });
    this.period = 1e9;
    this.orbit = { az: 0.6, el: 0.42, taz: 0.6, tel: 0.42 };
    this.zoom = { k: 1, tk: 1 };
    this.view = { fy: 1.2, tfy: 1.2, d: 1, td: 1 }; // foco y distancia según la fase
    this.phase = -1;
    this.pt = 0;            // s desde que se entró a la fase

    // Cama: placa gris con retícula de 10 en 10 (líneas en relieve, opacas).
    const bed = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(PLATE, 0.12, PLATE), new THREE.MeshStandardMaterial({ color: STAND_GRAY, roughness: 0.85 }));
    plate.position.y = -0.06;
    plate.receiveShadow = true;
    bed.add(plate);
    const lineMat = new THREE.MeshStandardMaterial({ color: '#AEAEAA', roughness: 0.9 });
    for (let i = 0; i <= 10; i++) {
      const p = -PLATE / 2 + (i / 10) * PLATE;
      const a = new THREE.Mesh(new THREE.BoxGeometry(PLATE, 0.01, 0.02), lineMat); a.position.set(0, 0.004, p);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, PLATE), lineMat); b.position.set(p, 0.004, 0);
      bed.add(a, b);
    }
    this.scene.add(bed);

    // pivot: posición y giro de la pieza; fit: el ajuste del modelo (enderezar, escalar,
    // apoyar). La malla final y las capas del preview comparten `fit`.
    this.pivot = new THREE.Group();
    this.fit = new THREE.Group();
    this.pivot.add(this.fit);
    this.pivot.visible = false;
    this.scene.add(this.pivot);
    this.buildPanel();
    this.buildFile();
    this.ready = false;
    this.load();
  }

  async load() {
    const bytes = potionBytes;
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const model = gltf.scene;
    this.fit.add(model);
    // El modelo viene con Z hacia arriba: se endereza, se escala y se apoya en y = 0.
    this.fit.rotation.x = -Math.PI / 2;
    this.fit.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(this.fit);
    this.fit.scale.setScalar(HEIGHT / (box.max.y - box.min.y));
    this.fit.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(this.fit);
    const c = box.getCenter(new THREE.Vector3());
    this.fit.position.set(-c.x, -box.min.y + 0.001, -c.z);
    const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, flatShading: true });
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.computeVertexNormals();
      o.material = mat(o.name === 'tapon' ? PALETTE.peach : CURA_YELLOW);
      o.castShadow = true;
    });
    this.model = model;
    this.buildLayers();
    this.ready = true;
    this.phase = -1; // reaplica la fase con el modelo ya cargado
  }

  // Preview: cada capa es una fila de vóxeles (rectángulos de la sección), en
  // coordenadas del modelo; se encienden de abajo hacia arriba.
  buildLayers() {
    const rects = [];
    potionLayers.layers.forEach((l, li) => l.rects.forEach(([x0, y0, x1, y1, part]) => rects.push({ li, x0, y0, x1, y1, z0: l.z0, z1: l.z1, part })));
    this.layerCount = potionLayers.layers.length;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), rects.length);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    rects.forEach((r, i) => {
      // Un pelo más chica en Z que la capa: se ve la línea entre capas, como en Cura.
      m.makeScale(r.x1 - r.x0, r.y1 - r.y0, (r.z1 - r.z0) * 0.92).setPosition((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, (r.z0 + r.z1) / 2);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.set(r.part ? PALETTE.peach : CURA_YELLOW));
    });
    mesh.castShadow = true;
    mesh.visible = false;
    this.fit.add(mesh);
    this.layers = { mesh, rects, shown: -1 };
  }

  showLayers(n, hot) {
    const L = this.layers;
    if (n === L.shown) return;
    L.shown = n;
    const m = new THREE.Matrix4(), col = new THREE.Color(), hotC = new THREE.Color(PALETTE.accent);
    L.rects.forEach((r, i) => {
      const on = r.li < n;
      m.makeScale(on ? r.x1 - r.x0 : 0, on ? r.y1 - r.y0 : 0, on ? (r.z1 - r.z0) * 0.92 : 0).setPosition((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, (r.z0 + r.z1) / 2);
      L.mesh.setMatrixAt(i, m);
      // La capa que se está imprimiendo, en rojo (caliente).
      L.mesh.setColorAt(i, hot && r.li === n - 1 ? hotC : col.set(r.part ? PALETTE.peach : CURA_YELLOW));
    });
    L.mesh.instanceMatrix.needsUpdate = true;
    L.mesh.instanceColor.needsUpdate = true;
  }

  // Panel de opciones: deslizadores, interruptores y botones (todo opaco).
  buildPanel() {
    const g = new THREE.Group();
    const mat = (c, r = 0.5) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const box = (w, h, d, m, x, y, z, parent = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b; };
    const W = 2.8, H = 1.9;
    box(W + 0.12, H + 0.12, 0.08, mat(PALETTE.peachShade), 0, 0, -0.03);   // marco
    box(W, H, 0.1, mat(PALETTE.inkDeep, 0.8), 0, 0, 0);                    // fondo
    box(W, 0.26, 0.12, mat(PALETTE.paper), 0, H / 2 - 0.13, 0.01);         // barra de título
    [0, 1, 2].forEach((k) => box(0.1, 0.1, 0.04, mat(k === 0 ? PALETTE.accent : PALETTE.peachShade), -W / 2 + 0.2 + k * 0.16, H / 2 - 0.13, 0.08));
    this.sliders = [];
    [0.42, 0.06].forEach((y, k) => {
      box(0.5, 0.08, 0.04, mat(PALETTE.peach), -W / 2 + 0.42, y, 0.07);            // etiqueta
      box(1.6, 0.05, 0.04, mat(PALETTE.peachShade), 0.42, y, 0.07);                // riel
      const fill = box(1, 0.06, 0.05, mat('#F7DF1E'), 0, y, 0.075);               // tramo lleno
      const knob = box(0.14, 0.24, 0.12, mat(PALETTE.paper), 0, y, 0.1);
      this.sliders.push({ fill, knob, x0: -0.38, x1: 1.22, phase: k * 1.7 });
    });
    this.toggles = [];
    [-0.36].forEach((y) => [0, 1].forEach((k) => {
      const x = -W / 2 + 0.55 + k * 1.15;
      const base = box(0.5, 0.22, 0.06, mat(PALETTE.peachShade), x, y, 0.07);
      const dot = box(0.18, 0.18, 0.1, mat(PALETTE.paper), x - 0.12, y, 0.11);
      this.toggles.push({ base, dot, x, k });
    }));
    this.buttons = [];
    [0, 1, 2].forEach((k) => {
      const b = box(0.5, 0.22, 0.12, mat(k === 0 ? '#F7DF1E' : PALETTE.peach), -W / 2 + 0.55 + k * 0.7, -0.72, 0.08);
      this.buttons.push({ b, k });
    });
    this.onColor = new THREE.Color(PALETTE.accent);
    this.offColor = new THREE.Color(PALETTE.peachShade);
    g.position.set(0, HEIGHT + 1.45, 0);
    g.scale.setScalar(0.001);
    g.visible = false;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(g);
    this.panel = g;
  }

  animatePanel(t, show) {
    const g = this.panel;
    const s = show ? easeElastic(Math.min(1, t / 0.9)) : 0;
    g.visible = s > 0.002;
    if (!g.visible) return;
    g.scale.setScalar(s);
    g.rotation.y = this.orbit.az;           // de frente a la cámara
    g.position.y = HEIGHT + 1.45 + Math.sin(t * 1.6) * 0.05;
    for (const sl of this.sliders) {
      const u = 0.5 + 0.42 * Math.sin(t * 1.3 + sl.phase);
      const x = sl.x0 + (sl.x1 - sl.x0) * u;
      sl.knob.position.x = x;
      sl.fill.scale.x = Math.max(0.01, x - sl.x0);
      sl.fill.position.x = (sl.x0 + x) / 2;
    }
    for (const tg of this.toggles) {
      const on = Math.floor(t / 1.1 + tg.k * 0.5) % 2 === 0;
      tg.dot.position.x = damp(tg.dot.position.x, tg.x + (on ? 0.12 : -0.12), 0.06, this.dt);
      tg.base.material.color.lerp(on ? this.onColor : this.offColor, 1 - Math.exp(-this.dt / 0.08));
    }
    const pressed = Math.floor(t / 0.8) % 3;
    for (const bt of this.buttons) bt.b.position.z = damp(bt.b.position.z, bt.k === pressed ? 0.03 : 0.08, 0.05, this.dt);
  }

  // Archivo .GCODE de píxeles (como el del diagrama de acción).
  buildFile() {
    const W = 25, H = 30, fold = 6;
    const rows = Array.from({ length: H }, (_, r) => [...Array(W)].map((_, c) => {
      if (r < fold && c >= W - fold) return c - (W - fold) <= r ? 'K' : ' ';
      return 'P';
    }).join(''));
    const cells = fromRows(rows, { P: PALETTE.paper, K: PALETTE.paperShade }, 2, { K: [1, 3] });
    stamp(cells, '.GCODE', 2, 17, 2, PALETTE.accent, H);
    const g = new THREE.Group();
    g.add(voxelMesh(cells, 0.07));
    g.position.set(0, 1.25, 0);
    g.scale.setScalar(0.001);
    g.visible = false;
    this.scene.add(g);
    this.file = g;
  }

  drag(dx, dy) {
    this.orbit.taz -= dx * 0.008;
    this.orbit.tel = Math.max(0.05, Math.min(1.25, this.orbit.tel + dy * 0.006));
  }

  zoomBy(f) { this.zoom.tk = Math.max(0.55, Math.min(1.6, this.zoom.tk * f)); }

  applyPhase(step) {
    if (step === this.phase || !this.ready) return;
    this.phase = step;
    this.pt = 0;
    // Con el panel encima, la cámara sube y se aleja un poco para verlo entero.
    this.view.tfy = step === 2 ? 2.3 : step === 4 ? 1.4 : 1.2;
    this.view.td = step === 2 ? 1.35 : 1;
  }

  frame(dt, tl, view, pointer, step = 0) {
    this.dt = dt;
    this.applyPhase(step);
    this.pt += dt;
    const cam = this.camera;
    cam.aspect = view.w / view.h;
    const o = this.orbit;
    o.az = damp(o.az, o.taz + pointer.nx * 0.15, 0.25, dt);
    o.el = damp(o.el, o.tel - pointer.ny * 0.06, 0.25, dt);
    this.zoom.k = damp(this.zoom.k, this.zoom.tk, 0.15, dt);
    this.view.fy = damp(this.view.fy, this.view.tfy, 0.3, dt);
    this.view.d = damp(this.view.d, this.view.td, 0.3, dt);
    const d = fitDistance(cam, 3.2, cam.aspect) * this.zoom.k * this.view.d;
    const fy = this.view.fy;
    cam.position.set(d * Math.cos(o.el) * Math.sin(o.az), fy + d * Math.sin(o.el), d * Math.cos(o.el) * Math.cos(o.az));
    cam.lookAt(0, fy, 0);
    cam.updateProjectionMatrix();
    if (!this.ready) return { loading: true };

    const p = this.phase, t = this.pt;
    const piv = this.pivot;
    piv.visible = p >= 1;
    piv.rotation.y = tl * 0.25;
    piv.scale.set(1, 1, 1);
    piv.position.set(0, 0, 0);
    this.model.visible = p !== 3;
    this.layers.mesh.visible = p === 3;

    if (p === 1) {
      // Cae desde arriba y rebota con elástico; al tocar, se aplasta un instante.
      const e = easeElastic(Math.min(1, t / 1.6));
      piv.position.y = DROP_FROM * (1 - e);
      const squash = Math.max(0, -(1 - e)) * 0.9; // rebote por debajo de la cama → aplastar
      piv.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
      piv.position.y = Math.max(0, piv.position.y);
    } else if (p === 3) {
      // Una capa cada LAYER_DT; al terminar, pausa y vuelve a empezar.
      const total = this.layerCount * LAYER_DT + 1.4;
      const u = t % total;
      const n = Math.min(this.layerCount, Math.floor(u / LAYER_DT) + 1);
      this.showLayers(n, n < this.layerCount);
    } else if (p === 4) {
      // Se achica y vuela al archivo, que traga y se queda; ciclo de 4,5 s.
      const u = t % 4.5;
      const appear = easeElastic(Math.min(1, u / 0.8));
      const fly = easeInOut(smooth((u - 0.6) / 1.2));
      const gulp = Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 1.75) / 0.35))));
      const leave = smooth((u - 3.9) / 0.5);
      const fs = Math.max(0.001, appear * (1 - leave)) * (1 + gulp * 0.12);
      this.file.visible = fs > 0.002;
      this.file.scale.setScalar(fs);
      // Flota sobre la cama, un poco detrás (vista desde la cámara): la pieza entra
      // por su cara de adelante.
      this.file.position.set(-Math.sin(this.orbit.az) * 0.45, 2.2, -Math.cos(this.orbit.az) * 0.45);
      this.file.rotation.y = this.orbit.az;
      const s = Math.max(0.001, 1 - fly);
      piv.scale.setScalar(s);
      piv.position.set(this.file.position.x * fly, (this.file.position.y - 0.4) * fly, this.file.position.z * fly); // vuela al archivo
      piv.visible = fly < 0.995;
      if (u > 4.2) { piv.visible = true; piv.scale.setScalar(smooth((u - 4.2) / 0.3)); piv.position.set(0, 0, 0); }
    }
    if (p !== 4) this.file.visible = false;
    if (p !== 3 && this.layers.shown !== -1) this.layers.shown = -1;
    this.animatePanel(p === 2 ? t : 0, p === 2);
    return { loading: false };
  }
}
