// Sección 02 / Anatomía de la Ender 3 Pro. El modelo real (src/assets/*.glb)
// pintado como maqueta en la paleta; cada fase resalta un grupo de piezas y
// marca sus puntos con etiquetas. Se gira 360° arrastrando con el puntero.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three-addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/three-addons/libs/meshopt_decoder.module.js';
import glbBytes from './assets/creality-ender-3-pro.glb';
import { PALETTE, damp, fitDistance } from './shared.js';
import { addLights } from './shared.js';

// Color de la sección: el azul claro de «Ender 3 Pro».
export const ENDER_BLUE = '#7FC8F8';

const SCALE = 20;              // el modelo viene en metros: 0,44 m → 8,8 unidades
const BASE = {                 // maqueta: materiales del modelo → tonos de la paleta
  black: PALETTE.peachShade,
  silver: PALETTE.paperShade,
  yellow: PALETTE.peach,
  green: PALETTE.peach,
  blue: PALETTE.peach,
  '': PALETTE.paperShade,
};
const DIM = '#6A4550';         // lo que no se explica en esta fase se apaga

// Grupos por nombre de nodo (los nombres que deja GLTFLoader). `under` acota la
// búsqueda a un ancestro, porque «Frame» aparece dos veces.
const PARTS = {
  frameTop: { name: 'Frame', under: 'Upper_Assembly' },
  frameBase: { name: 'Frame_1', under: 'Base' },
  xRail: { name: '2020_Extrusion', under: 'Gantry' },
  xCarriageR: { name: 'Right_X_Axis_Gantry_Assembly' },
  yRail: { name: '1_72', under: 'Frame_1' },
  bed: { name: 'Bed', under: 'Base' },
  zScrew: { name: 'Z_Axis_Lead_Screw' },
  zCoupler: { name: 'Coupler' },
  motorX: { names: ['1_37', '1_38', '1_40'], under: 'Extruder_&_X_Axis_Assembly' },
  motorE: { names: ['1_23', '1_24'], under: 'Extruder_&_X_Axis_Assembly' },
  motorY: { name: '1_86', under: 'Base' },
  motorZ: { name: 'Z_Axis_Motor' },
};

// Fases: qué se resalta y qué etiquetas aparecen (clave → ancla en el modelo).
const PHASES = [
  { lit: null, pins: {} },
  { lit: ['frameTop', 'frameBase'], pins: { 'frame-top': 'frameTop', 'frame-base': 'frameBase' } },
  { lit: ['xRail', 'xCarriageR', 'yRail', 'bed', 'zScrew', 'zCoupler'], pins: { x: 'xRail', y: 'yRail', z: 'zScrew' } },
  { lit: ['motorX', 'motorY', 'motorZ', 'motorE'], pins: { 'm-x': 'motorX', 'm-y': 'motorY', 'm-z': 'motorZ', 'm-e': 'motorE' } },
];

export class EnderDemo {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);
    this.period = 1e9; // no hay bucle: todo depende de la fase y del giro
    addLights(this.scene, { shadow: true, shadowSize: 9 });

    const disc = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 0.5, 72), new THREE.MeshStandardMaterial({ color: PALETTE.peachShade, roughness: 0.85 }));
    disc.position.y = -0.26;
    disc.receiveShadow = true;
    this.scene.add(disc);

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.meshes = [];
    this.groups = {};
    this.anchors = {};
    this.ready = false;
    this.failed = false;
    this.phase = -1;

    // Giro: azimut libre (360°), elevación acotada; amortiguado.
    this.orbit = { az: 0.6, el: 0.32, taz: 0.6, tel: 0.32 };
    // Foco bajo el centro del modelo: con la cámara elevada, el modelo queda más arriba
    // en el encuadre y la base no se corta.
    this.focus = new THREE.Vector3(0, 5.2, 0);
    this.zoom = { k: 1, tk: 1 };
    this.proj = new THREE.Vector3();
    this.tmp = new THREE.Vector3();

    this.load();
  }

  async load() {
    try {
      await MeshoptDecoder.ready;
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const bytes = glbBytes;
      const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
      const model = gltf.scene;

      // Centrado y escalado: base en y=0, centro en el origen.
      model.scale.setScalar(SCALE);
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const c = box.getCenter(new THREE.Vector3());
      model.position.set(-c.x, -box.min.y + 0.002, -c.z);
      this.root.add(model);
      model.updateMatrixWorld(true);

      model.traverse((o) => {
        if (!o.isMesh) return;
        const base = new THREE.Color(BASE[o.material.name] ?? PALETTE.paperShade);
        o.material = new THREE.MeshStandardMaterial({ color: base, roughness: 0.55, metalness: 0 });
        o.castShadow = true;
        o.receiveShadow = true;
        o.userData.base = base;
        o.userData.lit = false;
        this.meshes.push(o);
      });

      // Resolver los grupos y su ancla (centro de su caja).
      for (const [key, def] of Object.entries(PARTS)) {
        const scope = def.under ? findNode(model, def.under) : model;
        const names = def.names || [def.name];
        const nodes = names.map((n) => findNode(scope || model, n)).filter(Boolean);
        const meshes = [];
        nodes.forEach((n) => n.traverse((o) => { if (o.isMesh) meshes.push(o); }));
        this.groups[key] = meshes;
        if (meshes.length) {
          const b = new THREE.Box3();
          meshes.forEach((m) => b.expandByObject(m));
          this.anchors[key] = b.getCenter(new THREE.Vector3());
        }
      }
      const missing = Object.keys(PARTS).filter((k) => !this.groups[k].length);
      if (missing.length) console.warn('[ender] piezas no encontradas:', missing.join(', '));
      this.ready = true;
      this.phase = -1;
    } catch (err) {
      console.warn('[ender] no se pudo cargar el modelo:', err.message);
      this.failed = true;
    }
  }

  // Arrastre: lo acumula main.js y lo consume aquí, una vez por fotograma.
  drag(dx, dy) {
    this.orbit.taz -= dx * 0.008;
    this.orbit.tel = Math.max(-0.15, Math.min(1.25, this.orbit.tel + dy * 0.006));
  }

  // Zoom: factor multiplicativo (<1 acerca). Acotado para no atravesar el modelo.
  zoomBy(f) {
    this.zoom.tk = Math.max(0.5, Math.min(1.6, this.zoom.tk * f));
  }

  applyPhase(step) {
    if (step === this.phase || !this.ready) return;
    this.phase = step;
    const lit = new Set();
    (PHASES[step]?.lit || []).forEach((k) => (this.groups[k] || []).forEach((m) => lit.add(m)));
    const any = lit.size > 0;
    const blue = new THREE.Color(ENDER_BLUE);
    const dim = new THREE.Color(DIM);
    for (const m of this.meshes) {
      const on = lit.has(m);
      m.material.color.copy(!any ? m.userData.base : on ? blue : dim);
      m.material.emissive.set(on ? ENDER_BLUE : '#000000');
      m.material.emissiveIntensity = on ? 0.18 : 0;
    }
  }

  frame(dt, tl, view, pointer, step = 0) {
    this.applyPhase(step);
    const o = this.orbit;
    o.az = damp(o.az, o.taz, 0.18, dt);
    o.el = damp(o.el, o.tel, 0.18, dt);
    const cam = this.camera;
    cam.aspect = view.w / view.h;
    this.zoom.k = damp(this.zoom.k, this.zoom.tk, 0.15, dt);
    const d = fitDistance(cam, 7.7, cam.aspect) * this.zoom.k;
    cam.position.set(
      this.focus.x + d * Math.cos(o.el) * Math.sin(o.az),
      this.focus.y + d * Math.sin(o.el),
      this.focus.z + d * Math.cos(o.el) * Math.cos(o.az),
    );
    cam.lookAt(this.focus);
    cam.updateProjectionMatrix();

    // Etiquetas de la fase: proyectadas sobre su pieza; ocultas si quedan detrás.
    const pins = {};
    if (this.ready) {
      for (const [id, key] of Object.entries(PHASES[step]?.pins || {})) {
        const a = this.anchors[key];
        if (!a) continue;
        this.proj.copy(a).project(cam);
        if (this.proj.z > 1) continue;
        const x = (this.proj.x * 0.5 + 0.5) * view.w, y = (-this.proj.y * 0.5 + 0.5) * view.h;
        // Con zoom, una pieza puede quedar fuera del cuadro: su etiqueta no se sale del escenario.
        if (x < 0 || y < 12 || x > view.w - 40 || y > view.h - 12) continue;
        pins[id] = { x: x + 16, y };
      }
    }
    return { pins, loading: !this.ready && !this.failed };
  }
}

function findNode(root, name) {
  let hit = null;
  root.traverse((o) => { if (!hit && o.name === name) hit = o; });
  return hit;
}
