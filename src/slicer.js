// Sección 03 · Punto 02: ¿Qué es un slicer? La poción de ejemplo sobre una cama virtual
// (como la vista de Cura). Las fases (insertar, configurar, preview, guardar) se irán
// animando de a una; por ahora: al insertar, la pieza cae a la cama.
// La poción viene de src/assets/potion.glb: reconstruida en bloques desde el modelo
// original, sin la línea suelta que traía (ver tools/potion-voxelize.mjs).
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three-addons/loaders/GLTFLoader.js';
import potionBytes from './assets/potion.glb';
import { PALETTE, STAND_GRAY, addLights, damp, fitDistance } from './shared.js';

const CURA_YELLOW = '#F5C518';  // color con que Cura muestra los modelos (no es de la marca)
const PLATE = 4.6;              // lado de la cama virtual
const HEIGHT = 3.2;             // alto de la poción en escena

export class SlicerDemo {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    addLights(this.scene, { shadow: true, shadowSize: 5 });
    this.period = 1e9;
    this.orbit = { az: 0.6, el: 0.42, taz: 0.6, tel: 0.42 };
    this.zoom = { k: 1, tk: 1 };
    this.phase = -1;
    this.drop = 1;          // 1 = apoyada; 0 = arriba, por caer
    this.dropV = 0;

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

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.ready = false;
    this.load();
  }

  async load() {
    const bytes = potionBytes;
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const model = gltf.scene;
    // El modelo viene con Z hacia arriba: se endereza, se escala y se apoya en y = 0.
    model.rotation.x = -Math.PI / 2;
    model.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(model);
    const s = HEIGHT / (box.max.y - box.min.y);
    model.scale.setScalar(s);
    model.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.set(-c.x, -box.min.y + 0.001, -c.z);
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.computeVertexNormals();
      o.material = new THREE.MeshStandardMaterial({ color: o.name === 'tapon' ? PALETTE.peach : CURA_YELLOW, roughness: 0.55, flatShading: true });
      o.castShadow = true;
    });
    this.pivot.add(model);
    this.ready = true;
  }

  drag(dx, dy) {
    this.orbit.taz -= dx * 0.008;
    this.orbit.tel = Math.max(0.05, Math.min(1.25, this.orbit.tel + dy * 0.006));
  }

  zoomBy(f) { this.zoom.tk = Math.max(0.55, Math.min(1.6, this.zoom.tk * f)); }

  applyPhase(step) {
    if (step === this.phase) return;
    // Fase 1 · insertar: la pieza aparece arriba y cae a la cama.
    if (step === 1) { this.drop = 0; this.dropV = 0; }
    this.phase = step;
  }

  frame(dt, tl, view, pointer, step = 0) {
    this.applyPhase(step);
    const cam = this.camera;
    cam.aspect = view.w / view.h;
    const o = this.orbit;
    o.az = damp(o.az, o.taz + pointer.nx * 0.15, 0.25, dt);
    o.el = damp(o.el, o.tel - pointer.ny * 0.06, 0.25, dt);
    this.zoom.k = damp(this.zoom.k, this.zoom.tk, 0.15, dt);
    const d = fitDistance(cam, 3.2, cam.aspect) * this.zoom.k;
    const fy = 1.2;
    cam.position.set(d * Math.cos(o.el) * Math.sin(o.az), fy + d * Math.sin(o.el), d * Math.cos(o.el) * Math.cos(o.az));
    cam.lookAt(0, fy, 0);
    cam.updateProjectionMatrix();

    // Caída con gravedad y un rebote corto.
    if (this.drop < 1) {
      this.dropV += dt * 9;
      this.drop = Math.min(1, this.drop + this.dropV * dt);
    }
    const y = (1 - this.drop) * 3.5;
    this.pivot.position.y = y;
    this.pivot.rotation.y = tl * 0.25;
    return { loading: !this.ready };
  }
}
