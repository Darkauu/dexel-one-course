// Punto 03 / Materiales: PLA, PETG y TPU. Cada escena: su carrete y un objeto
// que muestra para qué sirve. PLA y TPU reciben la MISMA carga en el mismo
// instante: uno no cede, el otro se aplasta y vuelve. Así la diferencia se ve.
// Todo el estado visual es función pura del tiempo del bucle.
import * as THREE from 'three';
import { PALETTE, smooth, easeInOut, easeElastic, clamp01 } from './shared.js';
import { Stage, box, std } from './demos.js';
import { cyl, plinth, spool } from './tech.js';

// Colores de material: representan el filamento real, no son colores de marca.
export const MATERIAL = {
  pla: PALETTE.paper,
  petg: '#9ACBEA',
  tpu: '#EE4F43',
};

// Ficha de cada material: los cuatro datos, siempre en el mismo orden.
const specs = (def, ext, bed, hard) =>
  `<span>Deformación <b>${def}</b></span><span>Extrusión <b>${ext}</b></span>`
  + `<span>Cama <b>${bed}</b></span><span>Dureza <b>${hard}</b></span>`;

// Etiqueta fija en la esquina superior izquierda del escenario: siempre visible,
// en una zona que ningún objeto ocupa.
export const CORNER = { x: 6, y: 18 };

const PERIOD = 6.5;
// Guion de la carga, compartido por PLA y TPU.
const T = { down: 1.0, contact: 1.7, squash: 2.05, release: 3.4, up: 4.3 };
const LIFT = 3.2; // cuánto sube la pesa sobre el punto de contacto

// Carrete de pie (eje horizontal), girando despacio.
function standingSpool(color) {
  const outer = new THREE.Group();
  const inner = spool(color);
  inner.position.y = -0.68;
  const axle = new THREE.Group();
  axle.add(inner);
  axle.rotation.x = Math.PI / 2;
  outer.add(axle);
  outer.userData.spin = axle;
  return outer;
}

// Pesa de ensayo: bloque con asa. Origen en la base.
function weight() {
  const g = new THREE.Group();
  const metal = std(PALETTE.peachShade, 0.3);
  g.add(box(1.6, 0.9, 1.6, metal, 0, 0.45, 0));
  g.add(box(0.2, 0.55, 0.2, metal, -0.45, 1.15, 0));
  g.add(box(0.2, 0.55, 0.2, metal, 0.45, 1.15, 0));
  g.add(box(1.1, 0.2, 0.2, metal, 0, 1.42, 0));
  return g;
}

class MaterialStage extends Stage {
  constructor(color) {
    super({ bed: false, radius: 5.6, focus: [0.1, 1.9, 0.3], shadowSize: 8, azimuth: 0.55 });
    this.period = PERIOD;
    plinth(this.scene, 0, 5.4);
    this.spool = standingSpool(color);
    this.spool.position.set(-2.2, 2.12, -2.2);
    // A tres cuartos: se ve el filamento enrollado, no solo el disco lateral.
    this.spool.rotation.y = 1.85;
    this.scene.add(this.spool);
    this.tagAt = new THREE.Vector3();
  }

  spin(tl) {
    this.spool.userData.spin.rotation.y = (tl / PERIOD) * Math.PI * 0.5;
  }
}

// Altura de la pesa (su base) sobre un objeto rígido cuyo tope está en `top`.
function rigidWeightY(tl, top) {
  if (tl < T.down) return top + LIFT;
  if (tl < T.contact) return top + LIFT * (1 - easeInOut((tl - T.down) / (T.contact - T.down)));
  if (tl < T.release) {
    // Un rebote mínimo al tocar: la pieza no cede, la pesa sí rebota.
    const e = tl - T.contact;
    return top + Math.abs(Math.sin(e * 18)) * 0.12 * Math.exp(-e * 9);
  }
  return top + LIFT * easeInOut((tl - T.release) / (T.up - T.release));
}

// ============================================================================
// PLA — engranaje rígido: la carga no lo deforma.
export class PlaDemo extends MaterialStage {
  constructor() {
    super(MATERIAL.pla);
    const mat = std(MATERIAL.pla, 0.45);
    const gear = new THREE.Group();
    gear.add(cyl(1.55, 1.55, 0.7, mat, 0, 0.35, 0, 56));
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const t = box(0.42, 0.7, 0.4, mat, Math.cos(a) * 1.68, 0.35, Math.sin(a) * 1.68);
      t.rotation.y = -a;
      gear.add(t);
    }
    gear.add(cyl(0.3, 0.3, 0.02, std(PALETTE.inkDeep, 0.9), 0, 0.71, 0, 24));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      gear.add(cyl(0.2, 0.2, 0.02, std(PALETTE.inkDeep, 0.9), Math.cos(a) * 1.15, 0.71, Math.sin(a) * 1.15, 16));
    }
    gear.position.set(1.3, 0, 1.0);
    this.scene.add(gear);
    this.gearTop = 0.7;
    this.w = weight();
    this.w.position.set(1.3, 0, 1.0);
    this.scene.add(this.w);
  }

  frame(dt, tl, view, pointer) {
    this.aim(dt, view, pointer);
    this.spin(tl);
    this.w.position.y = rigidWeightY(tl, this.gearTop);
    return {
      tag: CORNER,
      live: specs('0 %', '200 °C', '60 °C', '80D'),
    };
  }
}

// ============================================================================
// TPU — rueda elástica bajo la misma carga, y una chancleta que se flexiona.
export class TpuDemo extends MaterialStage {
  constructor() {
    super(MATERIAL.tpu);
    const rubber = std(MATERIAL.tpu, 0.7);

    // Rueda: el grupo tiene el origen en el suelo, así se aplasta contra él.
    this.wheel = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.5, 24, 48), rubber);
    tire.position.y = 1.5;
    tire.castShadow = true;
    const hub = cyl(0.62, 0.62, 0.7, std(PALETTE.paperShade, 0.4), 0, 1.5, 0, 32);
    hub.rotation.x = Math.PI / 2;
    this.wheel.add(tire, hub);
    this.wheel.position.set(1.4, 0, 0.9);
    this.wheel.rotation.y = 0.35;
    this.scene.add(this.wheel);
    this.tireTop = 3.0;

    this.w = weight();
    this.w.position.set(1.4, 0, 0.9);
    this.scene.add(this.w);

    // Chancleta: suela segmentada que se dobla en la punta, y tira.
    const soleGeo = new THREE.BoxGeometry(1.3, 0.26, 3.2, 1, 1, 28);
    this.soleBase = Float32Array.from(soleGeo.attributes.position.array);
    this.sole = new THREE.Mesh(soleGeo, rubber);
    this.sole.castShadow = true;
    this.sole.receiveShadow = true;
    this.flip = new THREE.Group();
    this.flip.add(this.sole);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.09, 10, 24, Math.PI), std(PALETTE.paper, 0.5));
    strap.position.set(0, 0.13, -0.3);
    strap.castShadow = true;
    this.flip.add(strap);
    this.flip.add(cyl(0.07, 0.07, 0.5, std(PALETTE.paper, 0.5), 0, 0.3, 0.55, 12));
    this.flip.position.set(-2.3, 0.13, 2.4);
    this.flip.rotation.y = 0.9;
    this.scene.add(this.flip);
  }

  frame(dt, tl, view, pointer) {
    this.aim(dt, view, pointer);
    this.spin(tl);

    // Aplastamiento: sy = 1 sin carga, 0.65 bajo carga; vuelve con rebote elástico.
    let sy = 1;
    if (tl >= T.contact && tl < T.squash) sy = 1 - 0.35 * smooth((tl - T.contact) / (T.squash - T.contact));
    else if (tl >= T.squash && tl < T.release) sy = 0.65;
    else if (tl >= T.release) sy = 0.65 + 0.35 * easeElastic((tl - T.release) / 1.3);
    const bulge = 1 + (1 - sy) * 0.55;
    this.wheel.scale.set(bulge, sy, bulge);

    // La rueda es más alta que el engranaje: la pesa sube menos para no invadir la etiqueta.
    const lift = LIFT * 0.7;
    let wy;
    if (tl < T.down) wy = this.tireTop + lift;
    else if (tl < T.contact) wy = this.tireTop + lift * (1 - easeInOut((tl - T.down) / (T.contact - T.down)));
    else if (tl < T.release) wy = this.tireTop * sy;
    else wy = Math.max(this.tireTop * sy, this.tireTop + lift * easeInOut((tl - T.release) / (T.up - T.release)));
    this.w.position.y = wy;

    // La chancleta se dobla en la punta y vuelve, dos veces por ciclo.
    const k = 0.2 * (0.5 - 0.5 * Math.cos((tl / PERIOD) * Math.PI * 4));
    const pos = this.sole.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const z = this.soleBase[i * 3 + 2];
      const d = Math.max(0, z + 0.1);
      pos.array[i * 3 + 1] = this.soleBase[i * 3 + 1] + k * d * d;
    }
    pos.needsUpdate = true;
    this.sole.geometry.computeVertexNormals();

    const pct = Math.round((1 - Math.min(1, sy)) * 100);
    return {
      tag: CORNER,
      live: specs(`${String(Math.max(0, pct)).padStart(2, '0')} %`, '225 °C', '50 °C', '95A'),
    };
  }
}

// ============================================================================
// PETG — botella de agua con tapa de rosca, jeringa y envase médico.
const BOTTLE = [
  [0, 0], [0.8, 0], [0.88, 0.08], [0.9, 0.3], [0.9, 2.5], [0.82, 2.8], [0.58, 3.1],
  [0.44, 3.22], [0.44, 3.5], [0, 3.5],
];
export class PetgDemo extends MaterialStage {
  constructor() {
    super(MATERIAL.petg);
    const petg = std(MATERIAL.petg, 0.18);
    const white = std(PALETTE.paper, 0.45);

    const bottle = new THREE.Group();
    const body = new THREE.Mesh(new THREE.LatheGeometry(BOTTLE.map(([r, y]) => new THREE.Vector2(r, y)), 48), petg);
    body.castShadow = true;
    bottle.add(body);
    for (const y of [0.9, 1.5, 2.1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.035, 8, 48), std(PALETTE.paperShade, 0.3));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      bottle.add(ring);
    }
    this.cap = new THREE.Group();
    this.cap.add(cyl(0.52, 0.52, 0.5, white, 0, 0.25, 0, 32));
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      this.cap.add(box(0.08, 0.44, 0.06, white, Math.cos(a) * 0.53, 0.25, Math.sin(a) * 0.53));
    }
    this.cap.add(cyl(0.18, 0.22, 0.3, white, 0, 0.62, 0, 20));
    this.capY = 3.3;
    bottle.add(this.cap);
    bottle.position.set(1.0, 0, -0.2);
    this.scene.add(bottle);

    // Jeringa acostada: cilindro, aletas, aguja y émbolo que entra y sale.
    const syr = new THREE.Group();
    const barrel = cyl(0.3, 0.3, 2.4, petg, 0, 0, 0, 24);
    barrel.rotation.z = Math.PI / 2;
    syr.add(barrel);
    syr.add(box(0.12, 0.9, 0.5, petg, -1.2, 0, 0));
    const tip = cyl(0.08, 0.16, 0.3, white, 1.35, 0, 0, 16); tip.rotation.z = -Math.PI / 2; syr.add(tip);
    const needle = cyl(0.025, 0.025, 1.0, std(PALETTE.paperShade, 0.2), 2.0, 0, 0, 8); needle.rotation.z = Math.PI / 2; syr.add(needle);
    this.plunger = new THREE.Group();
    const rod = cyl(0.11, 0.11, 2.2, white, 0, 0, 0, 12); rod.rotation.z = Math.PI / 2;
    const thumb = cyl(0.36, 0.36, 0.1, white, -1.1, 0, 0, 24); thumb.rotation.z = Math.PI / 2;
    this.plunger.add(rod, thumb);
    syr.add(this.plunger);
    syr.position.set(0.4, 0.33, 2.5);
    syr.rotation.y = -0.25;
    this.scene.add(syr);

    // Envase médico con cruz.
    const jar = new THREE.Group();
    jar.add(cyl(0.6, 0.6, 1.3, petg, 0, 0.65, 0, 32));
    jar.add(cyl(0.64, 0.64, 0.35, white, 0, 1.47, 0, 32));
    jar.add(box(0.5, 0.14, 0.05, white, 0, 0.7, 0.6));
    jar.add(box(0.14, 0.5, 0.05, white, 0, 0.7, 0.6));
    jar.position.set(2.9, 0, 1.2);
    jar.rotation.y = 0.3;
    this.scene.add(jar);
  }

  frame(dt, tl, view, pointer) {
    this.aim(dt, view, pointer);
    this.spin(tl);
    // Tapa: se desenrosca (gira y sube), espera y se vuelve a cerrar.
    const open = smooth((tl - 0.8) / 1.2) * (1 - smooth((tl - 3.6) / 1.2));
    this.cap.position.y = this.capY + open * 0.55;
    this.cap.rotation.y = -open * Math.PI * 3;
    // Émbolo: entra y sale una vez por ciclo.
    const push = 0.5 - 0.5 * Math.cos((tl / PERIOD) * Math.PI * 2);
    this.plunger.position.x = -1.0 + push * 0.85;

    return {
      tag: CORNER,
      live: specs('3 %', '240 °C', '80 °C', '75D'),
    };
  }
}
