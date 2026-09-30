// Punto 04 / Usos reales: prototipos y herramientas, repuestos, decoración y
// utilidades del día a día. Cada escena cuenta un caso con una sola acción.
// Todo el estado visual es función pura del tiempo del bucle.
import * as THREE from 'three';
import { PALETTE, smooth, easeInOut, clamp01 } from './shared.js';
import { Stage, box, std } from './demos.js';
import { cyl, plinth, queen } from './tech.js';
import { MATERIAL, CORNER } from './materials.js';

class UseStage extends Stage {
  constructor(period) {
    super({ bed: false, radius: 4.5, focus: [0, 1.5, 0.3], shadowSize: 8, azimuth: 0.55 });
    this.period = period;
    plinth(this.scene, 0, 4.3);
  }
}

// Material con planos de recorte propios (crecer capa a capa, hundirse en la peana).
function clippedMat(color, planes, rough = 0.5, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, clippingPlanes: planes, ...extra });
}

// Engranaje de eje vertical, base en y=0. `missing`: dientes rotos.
function gear(r, teeth, h, mat, missing = []) {
  const g = new THREE.Group();
  g.add(cyl(r, r, h, mat, 0, h / 2, 0, 48));
  for (let k = 0; k < teeth; k++) {
    if (missing.includes(k)) continue;
    const a = (k / teeth) * Math.PI * 2;
    const t = box(0.34, h, 0.3, mat, Math.cos(a) * (r + 0.13), h / 2, Math.sin(a) * (r + 0.13));
    t.rotation.y = -a;
    g.add(t);
  }
  g.add(cyl(0.22, 0.22, 0.02, std(PALETTE.inkDeep, 0.9), 0, h + 0.005, 0, 20));
  return g;
}

// ============================================================================
// A / PROTOTIPOS — la misma carcasa en tres versiones, cada una impresa capa a
// capa y más refinada que la anterior; al frente, una llave impresa.
export class PrototypeDemo extends UseStage {
  constructor() {
    super(9);
    this.floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.001);
    this.versions = [];
    const colors = [PALETTE.peach, PALETTE.paperShade, PALETTE.paper];
    const xs = [-2.3, 0, 2.3];
    for (let v = 0; v < 3; v++) {
      const grow = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
      const mat = clippedMat(colors[v], [grow, this.floor], 0.5);
      const g = new THREE.Group();
      g.add(box(1.6, 1.0, 1.2, mat, 0, 0.5, 0));
      if (v >= 1) g.add(box(1.7, 0.18, 1.3, mat, 0, 1.09, 0));                        // tapa
      if (v === 2) {
        const dark = clippedMat(PALETTE.inkDeep, [grow, this.floor], 0.8);
        g.add(box(0.9, 0.5, 0.04, dark, -0.15, 0.55, 0.61));                          // pantalla
        g.add(cyl(0.1, 0.1, 0.1, mat, 0.55, 0.7, 0.62, 16).rotateX(Math.PI / 2));      // botones
        g.add(cyl(0.1, 0.1, 0.1, mat, 0.55, 0.4, 0.62, 16).rotateX(Math.PI / 2));
      }
      g.position.set(xs[v], 0, -0.6 + v * 0.1);
      this.scene.add(g);
      // Tapa de la capa en curso: sin ella la carcasa recortada se ve hueca por arriba.
      const cap = box(v >= 1 ? 1.7 : 1.6, 0.02, v >= 1 ? 1.3 : 1.2, clippedMat(colors[v], [this.floor], 0.5));
      g.add(cap);
      this.versions.push({ g, grow, cap, h: v >= 1 ? 1.18 : 1.0 });
    }

    // Llave de boca hexagonal, impresa y acostada.
    const s = new THREE.Shape();
    const a = Math.asin(0.22 / 0.6);
    s.moveTo(-1.7, -0.22);
    s.lineTo(1.1 - 0.6 * Math.cos(a), -0.22);
    s.absarc(1.1, 0, 0.6, Math.PI + a, Math.PI - a, false);
    s.lineTo(-1.7, 0.22);
    s.lineTo(-1.7, -0.22);
    const hex = new THREE.Path();
    for (let k = 0; k <= 6; k++) {
      const t = (k / 6) * Math.PI * 2;
      if (k === 0) hex.moveTo(1.1 + 0.3 * Math.cos(t), 0.3 * Math.sin(t));
      else hex.lineTo(1.1 + 0.3 * Math.cos(t), 0.3 * Math.sin(t));
    }
    s.holes.push(hex);
    const wrench = new THREE.Mesh(
      new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 }),
      std(MATERIAL.petg, 0.35),
    );
    wrench.rotation.x = -Math.PI / 2;
    wrench.rotation.z = 0.35;
    wrench.position.set(-0.2, 0.05, 2.4);
    wrench.castShadow = true;
    this.scene.add(wrench);
  }

  frame(dt, tl, view, pointer) {
    this.aim(dt, view, pointer);
    const sink = tl > 8.1 ? easeInOut((tl - 8.1) / 0.9) * 1.5 : 0;
    let shown = 0;
    this.versions.forEach(({ g, grow, cap, h }, v) => {
      const start = 0.4 + v * 2.2;
      const p = clamp01((tl - start) / 1.5);
      if (p > 0) shown = v + 1;
      g.position.y = -sink;
      grow.constant = p * (h + 0.02) - sink;
      g.visible = p > 0;
      cap.visible = p > 0 && p < 1;
      cap.position.y = p * (h + 0.02) - 0.011;
      // Por debajo de la tapa, la capa tiene el ancho del cuerpo (1,6 × 1,2).
      const inLid = h > 1.0 && cap.position.y > 1.0;
      cap.scale.set(h > 1.0 && !inLid ? 1.6 / 1.7 : 1, 1, h > 1.0 && !inLid ? 1.2 / 1.3 : 1);
    });
    return {
      tag: CORNER,
      live: `Versión <b>${String(shown).padStart(2, '0')} / 03</b> · <b>En horas</b>`,
    };
  }
}

// ============================================================================
// B / REPUESTOS — un engranaje roto sale, entra uno impreso y el mecanismo
// vuelve a girar.
export class SparePartDemo extends UseStage {
  constructor() {
    super(9);
    const base = std(PALETTE.paperShade, 0.6);
    this.scene.add(box(5.4, 0.5, 2.8, base, 0, 0.25, 0));
    this.baseTop = 0.5;
    for (const x of [-1.25, 1.25]) this.scene.add(cyl(0.12, 0.12, 1.3, std(PALETTE.peachShade, 0.4), x, 1.05, 0, 12));

    this.drive = gear(1.0, 12, 0.5, std(PALETTE.peach, 0.5));
    this.drive.position.set(-1.25, this.baseTop, 0);
    this.scene.add(this.drive);

    this.floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.baseTop + 0.001);
    this.broken = gear(1.0, 12, 0.5, clippedMat(PALETTE.peachShade, [this.floor], 0.7), [2, 3, 4]);
    this.fresh = gear(1.0, 12, 0.5, std(MATERIAL.petg, 0.35));
    this.scene.add(this.broken, this.fresh);
  }

  frame(dt, tl, view, pointer) {
    this.aim(dt, view, pointer);
    const X = 1.25, Y = this.baseTop;
    // El roto: tiembla (atascado), sube y se va; al final del ciclo vuelve desde abajo.
    if (tl < 1.0) {
      this.broken.position.set(X, Y, 0);
      this.broken.rotation.y = Math.sin(tl * 40) * 0.04;
    } else if (tl < 2.2) {
      const p = easeInOut((tl - 1.0) / 1.2);
      this.broken.position.set(X + p * 2.6, Y + Math.sin(p * Math.PI) * 2.2 - p * 3, -p * 1.6);
    } else if (tl < 8.2) {
      this.broken.position.set(X + 2.6, Y - 3, -1.6);
    } else {
      const p = easeInOut((tl - 8.2) / 0.8);
      this.broken.position.set(X, Y - 0.6 * (1 - p), 0);
      this.broken.rotation.y = 0;
    }
    // El nuevo: baja al eje, gira engranado y al final se retira hacia arriba.
    const drop = easeInOut((tl - 2.2) / 1.2);
    const leave = easeInOut((tl - 8.0) / 0.8);
    this.fresh.visible = tl > 2.2 && tl < 8.8;
    this.fresh.position.set(X, Y + (1 - drop) * 4 + leave * 5, 0);

    const spin = tl > 3.4 && tl < 8.0 ? (tl - 3.4) * 1.4 : tl >= 8.0 ? (8.0 - 3.4) * 1.4 : 0;
    this.drive.rotation.y = spin;
    this.fresh.rotation.y = -spin + Math.PI / 12;

    return { tag: CORNER, live: 'Material <b>6 g</b> · Tiempo <b>40 min</b>' };
  }
}

// ============================================================================
// C / DECORACIÓN — un jarrón de forma libre (torcido y facetado) gira en su
// base; al lado, una figura y una maceta.
export class DecorDemo extends UseStage {
  constructor() {
    super(12);
    const geo = new THREE.CylinderGeometry(1, 1, 3.6, 9, 36, false);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const t = (y + 1.8) / 3.6;
      const r = 0.72 + 0.42 * Math.sin(Math.PI * (0.15 + t * 0.95));
      const a = t * 1.4;
      const c = Math.cos(a), sn = Math.sin(a);
      pos.setXYZ(i, (x * c - z * sn) * r, y, (x * sn + z * c) * r);
    }
    geo.computeVertexNormals();
    this.vase = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: PALETTE.paper, roughness: 0.4, flatShading: true }));
    this.vase.position.set(0.4, 1.8 + 0.3, -0.4);
    this.vase.castShadow = true;
    this.scene.add(this.vase);
    this.turntable = cyl(1.35, 1.35, 0.3, std(PALETTE.peachShade, 0.4), 0.4, 0.15, -0.4, 48);
    this.scene.add(this.turntable);

    const fig = queen(std(MATERIAL.tpu, 0.45));
    fig.scale.setScalar(0.55);
    fig.position.set(-2.4, 0, 1.2);
    this.scene.add(fig);

    const pot = cyl(0.75, 0.55, 1.0, new THREE.MeshStandardMaterial({ color: MATERIAL.petg, roughness: 0.4, flatShading: true }), 2.4, 0.5, 1.6, 6);
    this.scene.add(pot);
  }

  frame(dt, tl, view, pointer) {
    this.aim(dt, view, pointer);
    this.vase.rotation.y = (tl / this.period) * Math.PI * 2;
    return { tag: CORNER, live: 'Material <b>60 g</b> · Tiempo <b>4 h</b>' };
  }
}

// ============================================================================
// D / DÍA A DÍA — un soporte a medida recibe el teléfono; al lado, un
// organizador con lápices.
export class DailyDemo extends UseStage {
  constructor() {
    super(8);
    const pla = std(MATERIAL.pla, 0.45);
    const stand = new THREE.Group();
    stand.add(box(2.2, 0.3, 1.6, pla, 0, 0.15, 0));
    const back = box(2.2, 2.6, 0.3, pla, 0, 1.3, -0.35);
    back.rotation.x = -0.35;
    stand.add(back);
    stand.add(box(2.2, 0.35, 0.2, pla, 0, 0.47, 0.7));
    stand.position.set(0.6, 0, -0.4);
    this.scene.add(stand);

    this.phone = new THREE.Group();
    this.phone.add(box(1.7, 3.2, 0.18, std(PALETTE.peachShade, 0.3), 0, 1.6, 0));
    this.phone.add(box(1.5, 2.9, 0.02, std(PALETTE.inkDeep, 0.2), 0, 1.62, 0.1));
    this.scene.add(this.phone);
    this.rest = { x: 0.6, y: 0.32, z: 0.1, tilt: -0.35 };

    // Organizador hexagonal con lápices.
    const cup = cyl(0.75, 0.75, 1.6, new THREE.MeshStandardMaterial({ color: MATERIAL.tpu, roughness: 0.5, flatShading: true }), -2.3, 0.8, 1.0, 6);
    this.scene.add(cup);
    const pens = [[-2.45, 0.9, PALETTE.paper, 0.1], [-2.15, 1.1, PALETTE.peach, -0.12], [-2.3, 1.0, MATERIAL.petg, 0.05]];
    for (const [x, z, c, lean] of pens) {
      const p = cyl(0.07, 0.07, 2.4, std(c, 0.4), x, 1.9, z, 10);
      p.rotation.z = lean;
      this.scene.add(p);
    }
  }

  frame(dt, tl, view, pointer) {
    this.aim(dt, view, pointer);
    // Entra al soporte, se queda y vuelve a salir.
    const inP = easeInOut((tl - 0.6) / 1.3);
    const outP = easeInOut((tl - 6.2) / 1.2);
    const p = inP * (1 - outP);
    const r = this.rest;
    this.phone.position.set(r.x, r.y + (1 - p) * 3.2, r.z + (1 - p) * 0.4);
    this.phone.rotation.x = r.tilt * p;
    return { tag: CORNER, live: 'Material <b>25 g</b> · Tiempo <b>1,5 h</b>' };
  }
}
