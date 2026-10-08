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
export const DIM_COLOR = '#6A4550';

const SCALE = 20;              // el modelo viene en metros: 0,44 m → 8,8 unidades
const BASE = {                 // maqueta: materiales del modelo → tonos de la paleta
  black: PALETTE.peachShade,
  silver: PALETTE.paperShade,
  yellow: PALETTE.peach,
  green: PALETTE.peach,
  blue: PALETTE.peach,
  '': PALETTE.paperShade,
};
const DIM = DIM_COLOR;         // lo que no se explica en esta fase se apaga

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
  // Cabezal (punto 02). Extrusor Bowden sobre el carro izquierdo; hotend en el carro X.
  extruder: { names: ['1_23', '1_24', '1_25', '1_26', '1_27', '1_28', '1_29', '1_30', '1_31', '1_32', '1_33', '2_8', '5_1', '6_1', '7_1', '8_2'], under: 'Extruder_&_X_Axis_Assembly' },
  extGear: { name: '1_28', under: 'Extruder_&_X_Axis_Assembly' },
  extArm: { name: '1_29', under: 'Extruder_&_X_Axis_Assembly' },
  heatsink: { names: ['1_7', '1_8', '2_2', '1_16'], under: 'Extruder_Assembly' },
  heaterBlock: { names: ['1_10', '1_9', '1_12', '2_3', '1_13', '2_4', '1_14'], under: 'Extruder_Assembly' },
  block: { name: '1_10', under: 'Extruder_Assembly' },
  nozzle: { name: '1_11', under: 'Extruder_Assembly' },
  hotendInlet: { name: '1_16', under: 'Extruder_Assembly' },   // racor de entrada del hotend
  extIdler: { name: '1_31', under: 'Extruder_&_X_Axis_Assembly' },   // rodamiento del brazo
  extCoupler: { name: '1_27', under: 'Extruder_&_X_Axis_Assembly' }, // racor del tubo bowden
  // Tapa del hotend con lo que va atornillado a ella: el ventilador frontal (enfría
  // el disipador, 1_19) y el de capa a la derecha (turbina, 1_17). Sale entera.
  shroud: { names: ['1_15', '1_19', '1_20', '2_7', '3_5', '4_2', '1_17', '1_18', '2_6', '3_4', '4_1'], under: 'Extruder_Assembly' },
  // Punto 04 / Electrónica y control.
  layerFan: { names: ['1_17', '1_18', '2_6', '3_4', '4_1'], under: 'Extruder_Assembly' },
  layerFanBody: { name: '1_17', under: 'Extruder_Assembly' },
  psu: { names: ['Power_Supply_1', 'Power_Switch_Assembly'], under: 'Power_Supply' },
  psuSwitch: { name: 'Power_Switch_Assembly', under: 'Power_Supply' },
  display: { name: 'Display', under: 'Lower_Assembly' },
  lcdKnob: { name: 'Knob', under: 'Display' },
  lcdScreen: { name: 'Screen', under: 'Display' },
  controlBox: { name: 'Control_Box', under: 'Lower_Assembly' },
  // Cama (punto 03). El resorte de cada esquina no viene en el modelo: lo agrega bed.js.
  bedMount: { name: 'Mounting_Plate', under: 'Bed' },
  buildPlate: { name: 'Build_Plate', under: 'Bed' },
  mat: { name: 'Mat', under: 'Bed' },
  bedWheels: { name: 'Wheels', under: 'Bed' },
  knobs: { names: ['Knob_1', 'Knob_2', 'Knob_3', 'Knob_4'], under: 'Bed' },
  knobFront: { name: 'Knob_3', under: 'Bed' },        // esquina frontal derecha
  bedScrews: { names: ['Screw_4', 'Screw_5', 'Screw_6', 'Screw_7'], under: 'Bed' },
};

// Puntos de la sección: cada fase dice qué se resalta, qué etiquetas aparecen
// (id → pieza), qué se oculta y, si hace falta, hacia dónde va la cámara
// (pieza a enfocar, zoom y ángulo). Sin `view`, vuelve a la vista general.
const POINTS = {
  frame: [
    { lit: null, pins: {} },
    { lit: ['frameTop', 'frameBase'], pins: { 'frame-top': 'frameTop', 'frame-base': 'frameBase' } },
    { lit: ['xRail', 'xCarriageR', 'yRail', 'bed', 'zScrew', 'zCoupler'], pins: { x: 'xRail', y: 'yRail', z: 'zScrew' } },
    { lit: ['motorX', 'motorY', 'motorZ', 'motorE'], pins: { 'm-x': 'motorX', 'm-y': 'motorY', 'm-z': 'motorZ', 'm-e': 'motorE' } },
  ],
  head: [
    { lit: null, pins: {} },
    { lit: ['extruder'], flows: ['feed'], pins: { 'e-motor': 'motorE', 'e-gear': 'extGear', 'e-arm': 'extArm' },
      view: { focus: 'extruder', zoom: 0.3, az: -2.45, el: 0.5 } },
    { lit: ['heatsink', 'heaterBlock'], hide: ['shroud'], flows: ['feed', 'melt'], pins: { 'h-sink': 'heatsink', 'h-block': 'block' },
      view: { focus: 'heaterBlock', zoom: 0.24, az: 0.4, el: 0.16 } },
    { lit: ['nozzle'], hide: ['shroud'], flows: ['melt'], pins: { 'n-nozzle': 'nozzle' },
      view: { focus: 'nozzle', zoom: 0.12, az: 0.35, el: 0.1 } },
  ],
  bed: [
    { lit: null, pins: {} },
    { lit: ['buildPlate', 'mat'], fx: 'heat', pins: { 'b-plate': 'buildPlate', 'b-wheels': 'bedWheels' },
      view: { focus: 'buildPlate', zoom: 0.5, az: 0.55, el: 0.55 } },
    { lit: ['mat'], fx: 'peel', pins: { 'b-mat': 'matEdge', 'b-piece': 'piece' },
      view: { focus: 'matLift', zoom: 0.46, az: 0.45, el: 0.32 } },
    { lit: ['knobs', 'springs', 'bedScrews'], fx: 'level', pins: { 'b-knob': 'knobFront', 'b-spring': 'springFront' },
      view: { focus: 'knobFront', zoom: 0.26, az: 0.55, el: 0.22 } },
  ],
  elec: [
    { lit: null, pins: {} },
    { lit: ['layerFan'], fx: 'air', flows: ['melt'], pins: { 'c-fan': 'layerFanBody', 'c-air': 'airOut' },
      view: { focus: 'layerFanBody', zoom: 0.17, az: 1.05, el: 0.18 } },
    { lit: ['psu'], fx: 'power', pins: { 'c-psu': 'psu', 'c-switch': 'psuSwitch' },
      view: { focus: 'psu', zoom: 0.42, az: 1.75, el: 0.28 } },
    { lit: ['display'], fx: 'lcd', pins: { 'c-screen': 'lcdFace', 'c-knob': 'lcdKnob' },
      view: { focus: 'lcdFace', zoom: 0.2, az: 0.3, el: 0.42 } },
    { lit: ['controlBox'], fx: 'sd', pins: { 'c-sd': 'sdSlot', 'c-board': 'controlBox' },
      view: { focus: 'sdSlot', zoom: 0.18, az: 0.35, el: 0.22 } },
  ],
};
const HOME = { zoom: 1, az: 0.6, el: 0.32 };

// El modelo se decodifica una sola vez; cada punto usa una copia (geometría compartida).
let modelPromise = null;
function loadModel() {
  modelPromise ??= (async () => {
    await MeshoptDecoder.ready;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const bytes = glbBytes;
    return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  })();
  return modelPromise;
}

export class EnderDemo {
  // Se dibuja en toda la ventana (detrás del título): el zoom nunca lo recorta.
  static fullFrame = true;

  constructor(point = 'frame') {
    this.point = point;
    this.phases = POINTS[point];
    this.hideT = 0;        // 0 = carcasa en su sitio, 1 = fuera
    this.hideTarget = 0;
    this.flows = {};
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
    this.home = new THREE.Vector3(0, 6.0, 0);
    this.focus = this.home.clone();
    this.focusTarget = this.home.clone();
    this.zoom = { k: 1, tk: 1 };
    this.proj = new THREE.Vector3();
    this.tmp = new THREE.Vector3();

    this.load();
  }

  async load() {
    try {
      const gltf = await loadModel();
      const model = gltf.scene.clone(true);

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
      this.prepareRemovable();
      this.buildExtras();
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
    this.zoom.tk = Math.max(0.3, Math.min(1.6, this.zoom.tk * f));
  }

  // Piezas y animaciones propias de cada punto (las subclases las reemplazan).
  buildExtras() { if (this.point === 'head') this.buildFlows(); }
  animateExtras(dt, tl) { this.animateFlows(dt, tl); }

  applyPhase(step) {
    if (step === this.phase || !this.ready) return;
    this.phase = step;
    const ph = this.phases[step] || this.phases[0];
    const lit = new Set();
    (ph.lit || []).forEach((k) => (this.groups[k] || []).forEach((m) => lit.add(m)));
    this.hideTarget = (ph.hide || []).length ? 1 : 0;
    for (const [name, f] of Object.entries(this.flows)) f.on = (ph.flows || []).includes(name);
    const any = lit.size > 0;
    const blue = new THREE.Color(ENDER_BLUE);
    const dim = new THREE.Color(DIM);
    for (const m of this.meshes) {
      const on = lit.has(m);
      m.material.color.copy(!any ? m.userData.base : on ? blue : dim);
      m.material.emissive.set(on ? ENDER_BLUE : '#000000');
      m.material.emissiveIntensity = on ? 0.18 : 0;
    }
    // Cámara: acercamiento medio hacia la zona de la fase (o de vuelta a la general).
    const v = ph.view;
    const anchor = v && this.anchors[v.focus];
    this.focusTarget.copy(anchor || this.home);
    this.zoom.tk = v ? v.zoom : HOME.zoom;
    this.orbit.taz = v ? v.az : HOME.az;
    this.orbit.tel = v ? v.el : HOME.el;
  }

  // view: zona del encuadre base (px CSS). full: lo que realmente se dibuja (la
  // ventana). stage: el contenedor DOM, al que se refieren las etiquetas.
  frame(dt, tl, view, pointer, step = 0, full = view, stage = view) {
    this.applyPhase(step);
    const o = this.orbit;
    // El foco viaja con un paso lento: se ve el recorrido hacia la pieza.
    this.focus.x = damp(this.focus.x, this.focusTarget.x, 0.35, dt);
    this.focus.y = damp(this.focus.y, this.focusTarget.y, 0.35, dt);
    this.focus.z = damp(this.focus.z, this.focusTarget.z, 0.35, dt);
    o.az = damp(o.az, o.taz, 0.18, dt);
    o.el = damp(o.el, o.tel, 0.18, dt);
    const cam = this.camera;
    cam.aspect = view.w / view.h;
    this.zoom.k = damp(this.zoom.k, this.zoom.tk, 0.15, dt);
    const d = fitDistance(cam, 7.4, cam.aspect) * this.zoom.k;
    cam.position.set(
      this.focus.x + d * Math.cos(o.el) * Math.sin(o.az),
      this.focus.y + d * Math.sin(o.el),
      this.focus.z + d * Math.cos(o.el) * Math.cos(o.az),
    );
    cam.lookAt(this.focus);
    // El frustum base encuadra `view`; se extiende a toda la ventana desplazándolo,
    // así el modelo queda donde está la zona y lo que sobresale sigue visible.
    cam.setViewOffset(view.w, view.h, full.x - view.x, full.y - view.y, full.w, full.h);
    cam.updateProjectionMatrix();
    // La matriz de la cámara se actualiza ya (no al renderizar): las etiquetas se
    // proyectan con la cámara de ESTE fotograma y no quedan atrasadas mientras viaja.
    cam.updateMatrixWorld();

    // Etiquetas de la fase: proyectadas sobre su pieza; ocultas si quedan detrás.
    const pins = {};
    if (this.ready) {
      for (const [id, key] of Object.entries(this.phases[step]?.pins || {})) {
        const a = this.anchors[key];
        if (!a) continue;
        this.proj.copy(a).project(cam);
        if (this.proj.z > 1) continue;
        // NDC → px de la ventana → px relativos al contenedor de las etiquetas.
        const gx = full.x + (this.proj.x * 0.5 + 0.5) * full.w, gy = full.y + (-this.proj.y * 0.5 + 0.5) * full.h;
        if (gx < 0 || gy < 12 || gx > full.w - 60 || gy > full.h - 12) continue; // fuera de la ventana
        pins[id] = { x: gx - stage.x + 16, y: gy - stage.y };
      }
    }
    if (this.ready) {
      this.animateRemovable(dt);
      this.animateExtras(dt, tl);
    }
    return { pins, loading: !this.ready && !this.failed };
  }
}

// --- Carcasa que se quita: se desliza hacia arriba y afuera, y luego se oculta ---
EnderDemo.prototype.prepareRemovable = function prepareRemovable() {
  const names = new Set();
  this.phases.forEach((ph) => (ph.hide || []).forEach((k) => names.add(k)));
  this.removable = [];
  const world = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  const delta = new THREE.Vector3(0, 1.6, 1.0); // hacia arriba y hacia el frente (unidades de escena)
  for (const k of names) {
    for (const m of this.groups[k] || []) {
      m.getWorldPosition(world);
      // El desplazamiento en el espacio del padre (que viene escalado y rotado).
      a.copy(world); b.copy(world).add(delta);
      m.parent.worldToLocal(a); m.parent.worldToLocal(b);
      this.removable.push({ m, base: m.position.clone(), off: b.sub(a).clone() });
    }
  }
};

EnderDemo.prototype.animateRemovable = function animateRemovable(dt) {
  this.hideT = damp(this.hideT, this.hideTarget, 0.16, dt);
  const t = this.hideT;
  const e = t * t * (3 - 2 * t);
  for (const r of this.removable) {
    r.m.position.copy(r.base).addScaledVector(r.off, e);
    r.m.visible = t < 0.96;
  }
};

// --- Filamento: entra al extrusor, viaja por el tubo y sale derretido ---
// El engranaje y el rodamiento giran sobre ejes verticales, uno al lado del otro:
// el filamento pasa horizontal entre ambos (entra por el lado del brazo, a la
// izquierda), sale por el racor y el tubo bowden lo lleva en arco hasta entrar
// desde arriba al hotend.
const FEED_N = 90, MELT_N = 48, MELT_LEN = 1.4;
EnderDemo.prototype.buildFlows = function buildFlows() {
  const A = this.anchors;
  if (!A.extGear || !A.hotendInlet || !A.nozzle) return;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const G = A.extGear, H = A.hotendInlet;
  const I = A.extIdler || G;
  const C = A.extCoupler || G.clone().add(V(0.5, 0, 0));
  // Línea de agarre: entre los dientes del engranaje y el rodamiento.
  const y = G.y, z = (G.z + I.z) / 2;
  const top = (this.groups.hotendInlet || []).reduce((b, m) => b.expandByObject(m), new THREE.Box3()).max.y;
  this.feedCurve = new THREE.CatmullRomCurve3([
    V(G.x - 0.8, y + 1.5, z - 0.45),    // baja del carrete (arriba del marco),
    V(G.x - 0.72, y + 0.5, z - 0.24),    // por detrás del tornillo del eje Z
    V(G.x - 0.52, y + 0.05, z),
    V(G.x - 0.38, y, z),                 // entrada por el brazo
    V(G.x, y, z),                        // entre engranaje y rodamiento
    V(C.x, y, z),                        // racor de salida
    V(C.x + 0.45, y + 0.05, z + 0.08),   // tubo bowden
    V((C.x + H.x) / 2 + 0.2, y + 0.45, (z + H.z) / 2),
    V(H.x, top + 0.55, H.z),
    V(H.x, top + 0.15, H.z),
    V(H.x, H.y, H.z),                    // entra al hotend desde arriba
  ], false, 'centripetal');
  const seg = new THREE.CylinderGeometry(0.03, 0.03, 0.1, 10);
  const feed = new THREE.InstancedMesh(seg, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }), FEED_N);
  const paper = new THREE.Color(PALETTE.paper), mark = new THREE.Color(PALETTE.peach);
  for (let i = 0; i < FEED_N; i++) feed.setColorAt(i, i % 5 === 0 ? mark : paper); // marcas: se ve que avanza
  feed.frustumCulled = false;
  feed.visible = false;
  this.scene.add(feed);
  this.flows.feed = { mesh: feed, on: false };

  // Derretido: un hilo fino continuo (boquilla de 0,4 mm) que sale de la punta,
  // caliente arriba y enfriándose abajo.
  const nb = new THREE.Box3();
  (this.groups.nozzle || []).forEach((m) => nb.expandByObject(m));
  this.tip = new THREE.Vector3((nb.min.x + nb.max.x) / 2, nb.min.y, (nb.min.z + nb.max.z) / 2);
  const strand = new THREE.CylinderGeometry(0.011, 0.011, (MELT_LEN / MELT_N) * 1.08, 8);
  strand.translate(0, -(MELT_LEN / MELT_N) * 0.5, 0); // cuelga desde su extremo superior
  const melt = new THREE.InstancedMesh(strand, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }), MELT_N);
  melt.frustumCulled = false;
  melt.visible = false;
  this.scene.add(melt);
  this.flows.melt = { mesh: melt, on: false };
  this.hot = new THREE.Color(PALETTE.accent);
  this.cool = new THREE.Color(PALETTE.peach);
  this.tmpM = new THREE.Matrix4(); this.tmpQ = new THREE.Quaternion(); this.tmpP = new THREE.Vector3();
  this.tmpT = new THREE.Vector3(); this.tmpS = new THREE.Vector3(); this.yAxis = new THREE.Vector3(0, 1, 0);
  this.tmpC = new THREE.Color();
};

EnderDemo.prototype.animateFlows = function animateFlows(dt, time) {
  const feed = this.flows.feed, melt = this.flows.melt;
  if (feed) {
    feed.mesh.visible = feed.on;
    if (feed.on) {
      // Avanza despacio por el recorrido (como el filamento real).
      for (let i = 0; i < FEED_N; i++) {
        const u = ((i / FEED_N) + time * 0.03) % 1;
        this.feedCurve.getPointAt(u, this.tmpP);
        this.feedCurve.getTangentAt(u, this.tmpT);
        this.tmpQ.setFromUnitVectors(this.yAxis, this.tmpT);
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS.set(1, 1, 1));
        feed.mesh.setMatrixAt(i, this.tmpM);
      }
      feed.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  if (melt) {
    melt.mesh.visible = melt.on;
    if (melt.on) {
      // Hilo continuo: tramos fijos uno bajo otro; lo que baja es el color (caliente
      // en la punta, frío abajo) con un pulso que delata el avance, y un leve vaivén.
      const step = MELT_LEN / MELT_N;
      for (let i = 0; i < MELT_N; i++) {
        const u = i / MELT_N;
        const sway = Math.sin(time * 1.3 - u * 4) * 0.035 * u * u;
        this.tmpP.copy(this.tip).add(this.tmpT.set(sway, -i * step - 0.01, 0));
        this.tmpM.compose(this.tmpP, this.tmpQ.identity(), this.tmpS.set(1, 1, 1));
        melt.mesh.setMatrixAt(i, this.tmpM);
        const pulse = 0.12 * Math.max(0, Math.sin((u - time * 0.5) * Math.PI * 8));
        melt.mesh.setColorAt(i, this.tmpC.copy(this.hot).lerp(this.cool, Math.min(1, u * 1.5 + pulse)));
      }
      melt.mesh.instanceMatrix.needsUpdate = true;
      melt.mesh.instanceColor.needsUpdate = true;
    }
  }
};

export function findNode(root, name) {
  let hit = null;
  root.traverse((o) => { if (!hit && o.name === name) hit = o; });
  return hit;
}

// Punto 02: extrusor, hotend y boquilla (misma escena, otras fases).
export class EnderHeadDemo extends EnderDemo {
  constructor() { super('head'); }
}
