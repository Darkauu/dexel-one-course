// Sección 04 · Punto 04: textura vs. geometría. El mismo cofre dos veces, con la MISMA
// geometría: a la izquierda con su textura (una imagen de píxeles: madera, bandas de
// metal, la cerradura), como se ve en pantalla; a la derecha como sale de la impresora,
// del gris del filamento y con sus líneas de capa. Lo dibujado (bandas, vetas, el ojo
// de la cerradura) desaparece; lo que es forma (tapa curva, cerradura) queda.
// Las dos giran igual, a la vez, para que se comparen cara a cara.
import * as THREE from 'three';
import { PALETTE, addLights, damp, fitDistance } from './shared.js';
import { plinth } from './tech.js';

// Colores de la madera y el metal (objeto real, no de la marca).
const WOOD = ['#8A5A32', '#9C6A3C', '#7A4E2B'], METAL = '#B9B4A8', METAL_D = '#7E7A70', DARK = '#2A1A10';

// Textura de píxeles 32 × 32: tablones con vetas y bandas de metal con remaches.
function chestTexture({ bands = true, lock = false } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  for (let y = 0; y < 32; y++) {
    const plank = Math.floor(y / 8);
    g.fillStyle = WOOD[plank % 3];
    g.fillRect(0, y, 32, 1);
  }
  g.fillStyle = DARK;
  for (let p = 1; p < 4; p++) g.fillRect(0, p * 8 - 1, 32, 1);           // juntas entre tablones
  g.fillStyle = '#6A4224';
  for (let i = 0; i < 18; i++) g.fillRect((i * 13) % 30, (i * 7) % 31, 2 + (i % 3), 1); // vetas
  if (bands) {
    for (const x of [3, 25]) {
      g.fillStyle = METAL; g.fillRect(x, 0, 4, 32);
      g.fillStyle = METAL_D; g.fillRect(x + 3, 0, 1, 32);
      g.fillStyle = DARK; for (let y = 3; y < 32; y += 8) g.fillRect(x + 1, y, 2, 2); // remaches
    }
  }
  if (lock) {
    g.fillStyle = '#D9A93A'; g.fillRect(8, 6, 16, 20);
    g.fillStyle = DARK; g.fillRect(14, 11, 4, 4); g.fillRect(15, 15, 2, 6);  // ojo de la cerradura
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Gris del filamento con líneas de capa (cada 0,05 en altura, como 0,2 mm a escala).
function printedMat() {
  const m = new THREE.MeshStandardMaterial({ color: '#9C9C9A', roughness: 0.7, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWorldY;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWorldY;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        float f = fract(vWorldY / 0.05);
        float w = fwidth(vWorldY / 0.05);
        diffuseColor.rgb *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, max(w * 1.5, 0.12), min(f, 1.0 - f)));
      }`);
  };
  m.customProgramCacheKey = () => 'printed-layers';
  return m;
}

// Geometría del cofre: cuerpo, tapa curva (medio cilindro) y cerradura en relieve.
function chestGeometry() {
  const body = new THREE.BoxGeometry(1.8, 1.0, 1.15);
  body.translate(0, 0.5, 0);
  const lid = new THREE.CylinderGeometry(0.575, 0.575, 1.8, 24, 1, false, 0, Math.PI);
  lid.rotateZ(Math.PI / 2); // eje a lo largo de X; la mitad curva queda arriba
  lid.translate(0, 1.0, 0);
  const lock = new THREE.BoxGeometry(0.3, 0.36, 0.08);
  lock.translate(0, 0.92, 0.6);
  return { body, lid, lock };
}

class ChestStage {
  constructor(textured) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    addLights(this.scene, { shadow: true, shadowSize: 4 });
    plinth(this.scene, 0, 1.45);
    this.period = 1e9;
    this.orbit = { az: 0, el: 0 };
    this.chest = new THREE.Group();
    this.scene.add(this.chest);
    const geo = chestGeometry();
    let mats;
    if (textured) {
      const wood = new THREE.MeshStandardMaterial({ map: chestTexture(), roughness: 0.75 });
      const plain = new THREE.MeshStandardMaterial({ map: chestTexture({ bands: false }), roughness: 0.75 });
      const lock = new THREE.MeshStandardMaterial({ map: chestTexture({ bands: false, lock: true }), roughness: 0.5 });
      mats = { body: wood, lid: wood, lidCaps: plain, lock };
    } else {
      const p = printedMat();
      mats = { body: p, lid: p, lidCaps: p, lock: p };
    }
    const add = (g, m) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; this.chest.add(mesh); return mesh; };
    add(geo.body, mats.body);
    add(geo.lid, [mats.lid, mats.lidCaps, mats.lidCaps]);
    add(geo.lock, mats.lock);
  }

  frame(dt, tl, view, pointer) {
    const cam = this.camera;
    cam.aspect = view.w / view.h;
    this.orbit.az = damp(this.orbit.az, pointer.nx * 0.2, 0.5, dt);
    this.orbit.el = damp(this.orbit.el, -pointer.ny * 0.08, 0.5, dt);
    const d = fitDistance(cam, 1.9, cam.aspect), el = 0.36 + this.orbit.el, az = 0.35 + this.orbit.az, fy = 0.6;
    cam.position.set(d * Math.cos(el) * Math.sin(az), fy + d * Math.sin(el), d * Math.cos(el) * Math.cos(az));
    cam.lookAt(0, fy, 0);
    cam.updateProjectionMatrix();
    // Mismo vaivén en las dos escenas (mismo reloj): siempre muestran la misma cara.
    this.chest.rotation.y = Math.sin(tl * 0.45) * 0.75;
    return {};
  }
}

export class TexturedChestDemo extends ChestStage { constructor() { super(true); } }
export class PrintedChestDemo extends ChestStage { constructor() { super(false); } }
