// Punto 02 / Tecnologías: FDM y resina, cada una como un pequeño diorama.
// Cada escena muestra el mecanismo en marcha (boquilla que dibuja la capa,
// placa que sale de la resina) y, alrededor, lo que la rodea en un taller real.
// Todo el estado visual es función pura del tiempo del bucle.
import * as THREE from 'three';
import { PALETTE, smooth, easeInOut, clamp01 } from './shared.js';
import { Stage, box, std, makeHotend } from './demos.js';

const PERIOD = 13;
const cPeach = new THREE.Color(PALETTE.peach);
const cPaper = new THREE.Color(PALETTE.paper);
const cAccent = new THREE.Color(PALETTE.accent);
const cDeep = new THREE.Color(PALETTE.inkDeep);

export function cyl(rTop, rBottom, h, mat, x = 0, y = 0, z = 0, seg = 40) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Peana redonda: une los objetos de la escena como un diorama.
export function plinth(scene, x, r) {
  const p = cyl(r, r, 0.6, std(PALETTE.peachShade, 0.85), x, -0.3, 0, 72);
  p.castShadow = false;
  scene.add(p);
}

// Bobina de filamento, eje vertical. Origen en la base.
export function spool(color) {
  const g = new THREE.Group();
  const flange = std(PALETTE.paperShade, 0.5);
  g.add(cyl(2.1, 2.1, 0.16, flange, 0, 0.08, 0, 56));
  g.add(cyl(1.85, 1.85, 1.02, std(color, 0.45), 0, 0.67, 0, 56));
  g.add(cyl(2.1, 2.1, 0.16, flange, 0, 1.26, 0, 56));
  g.add(cyl(0.75, 0.75, 1.36, std(PALETTE.peachShade, 0.6), 0, 0.68, 0, 32));
  g.add(cyl(0.46, 0.46, 0.02, std(PALETTE.inkDeep, 0.9), 0, 1.37, 0, 32));
  return g;
}

// Dado con sus puntos: 5 arriba, 3 al frente, 1 a la derecha (caras visibles).
function die(size, mat) {
  const g = new THREE.Group();
  const body = box(size, size, size, mat);
  body.position.y = size / 2;
  g.add(body);
  const pipMat = std(PALETTE.inkDeep, 0.8);
  const r = size * 0.09, o = size * 0.26, s = size / 2;
  const pip = () => cyl(r, r, 0.05, pipMat, 0, 0, 0, 20);
  for (const [x, z] of [[-o, -o], [o, -o], [0, 0], [-o, o], [o, o]]) {
    const p = pip(); p.position.set(x, size + 0.01, z); g.add(p);
  }
  for (const [x, y] of [[-o, s + o], [0, s], [o, s - o]]) {
    const p = pip(); p.rotation.x = Math.PI / 2; p.position.set(x, y, s + 0.01); g.add(p);
  }
  const p = pip(); p.rotation.z = Math.PI / 2; p.position.set(s + 0.01, s, 0); g.add(p);
  return g;
}

// Estatuilla: una reina de ajedrez torneada con corona. Más detalle que el dado,
// que es justo lo que la resina hace bien. Origen en la base; alto ~4.
const QUEEN = [
  [0, 0], [1.15, 0], [1.15, 0.22], [0.98, 0.32], [1.05, 0.46], [0.82, 0.58], [0.58, 0.76],
  [0.46, 1.3], [0.38, 2.0], [0.34, 2.35], [0.46, 2.55], [0.64, 2.7], [0.42, 2.84],
  [0.5, 3.0], [0.74, 3.5], [0.6, 3.56], [0.3, 3.58], [0, 3.58],
];
export function queen(mat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.LatheGeometry(QUEEN.map(([r, y]) => new THREE.Vector2(r, y)), 48), mat);
  g.add(body);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 10), mat);
    c.position.set(Math.cos(a) * 0.64, 3.66, Math.sin(a) * 0.64);
    g.add(c);
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), mat);
  ball.position.y = 3.82;
  g.add(ball);
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  return g;
}

// Bote de resina: cuerpo, hombro, tapa y etiqueta.
function bottle(scale = 1) {
  const g = new THREE.Group();
  const body = std(PALETTE.peachShade, 0.35);
  g.add(cyl(0.8, 0.8, 2.6, body, 0, 1.3, 0));
  g.add(cyl(0.38, 0.8, 0.5, body, 0, 2.85, 0));
  g.add(cyl(0.42, 0.42, 0.5, std(PALETTE.paperShade, 0.5), 0, 3.35, 0, 28));
  g.add(cyl(0.815, 0.815, 1.2, std(PALETTE.paper, 0.6), 0, 1.35, 0));
  g.add(box(0.5, 0.34, 0.05, std(PALETTE.inkDeep, 0.8), 0, 1.5, 0.81));
  g.scale.setScalar(scale);
  return g;
}

// ============================================================================
// A / FDM — la boquilla dibuja el contorno de cada capa; la cama se desliza (Y)
// y el carro recorre X, como en una impresora de cama móvil.
export class FdmDemo extends Stage {
  constructor() {
    super({ bed: false, radius: 9.8, focus: [1.7, 3.9, 0.6], shadowSize: 14, azimuth: 0.6 });
    this.period = PERIOD;
    plinth(this.scene, 1.6, 9.2);

    const frame = std(PALETTE.paperShade, 0.6);
    const X0 = -1.4;
    this.X0 = X0;
    // Base, montantes y travesaño.
    for (const x of [-3.6, 3.6]) this.scene.add(box(0.5, 0.6, 10, frame, X0 + x, 0.3, 0));
    for (const z of [-4.8, 4.8]) this.scene.add(box(7.7, 0.6, 0.5, frame, X0, 0.3, z));
    for (const x of [-4.3, 4.3]) this.scene.add(box(0.5, 11.2, 0.6, frame, X0 + x, 5.9, 0));
    this.scene.add(box(9.1, 0.5, 0.6, frame, X0, 11.5, 0));
    this.scene.add(box(1.2, 1.2, 1.2, std(PALETTE.peachShade, 0.5), X0 - 4.3, 1.2, 0.9));
    const lcd = box(2.6, 1.3, 0.7, frame, X0 - 1.6, 0.95, 5.3);
    lcd.add(box(1.7, 0.75, 0.05, std(PALETTE.inkDeep, 0.9), 0, 0.05, 0.36));
    this.scene.add(lcd);

    // Cama móvil y la pieza en curso (un dado) encima.
    this.bedTop = 1.05;
    this.bed = new THREE.Group();
    this.bed.position.x = X0;
    this.bed.add(box(7, 0.3, 7, std(PALETTE.peach, 0.7), 0, 0.9, 0));
    this.scene.add(this.bed);

    this.S = 2.4;
    this.layers = 12;
    this.clipTop = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);   // corta lo aún no impreso
    this.clipBed = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.bedTop + 0.001); // lo que baja atraviesa la cama
    const partMat = new THREE.MeshStandardMaterial({ color: PALETTE.paper, roughness: 0.55, clippingPlanes: [this.clipTop, this.clipBed] });
    this.part = box(this.S, this.S, this.S, partMat);
    this.capMat = new THREE.MeshStandardMaterial({ color: PALETTE.paper, roughness: 0.55, clippingPlanes: [this.clipBed] });
    this.cap = box(this.S, 0.02, this.S, this.capMat);
    this.bed.add(this.part, this.cap);

    // Pórtico X y cabezal.
    this.bar = box(9.1, 0.4, 0.45, frame, X0, 0, -0.75);
    this.scene.add(this.bar);
    this.head = makeHotend(std(PALETTE.peachShade, 0.6));
    this.scene.add(this.head);
    this.park = new THREE.Vector3(X0 - 2.4, this.bedTop + 6, 0);

    // Dos bobinas apiladas; la de arriba alimenta a la impresora.
    this.spoolLow = spool(PALETTE.peach);
    this.spoolLow.position.set(7.4, 0, -1.6);
    this.spoolTop = spool(PALETTE.paper);
    this.spoolTop.position.set(7.4, 1.36, -1.6);
    this.scene.add(this.spoolLow, this.spoolTop);
    this.filMat = std(PALETTE.paper, 0.45);
    this.fil = new THREE.Mesh(new THREE.BufferGeometry(), this.filMat);
    this.fil.castShadow = true;
    this.scene.add(this.fil);

    // Un dado ya impreso, sobre la peana.
    const done = die(1.6, std(PALETTE.paper, 0.5));
    done.position.set(5.6, 0, 4.2);
    done.rotation.y = -0.35;
    this.scene.add(done);

    this.tip = new THREE.Vector3();
    this.tagAt = new THREE.Vector3();
    this.curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
  }

  // Contorno cuadrado de la capa, recorrido con u ∈ [0,1).
  perimeter(u) {
    const L = this.S - 0.35, h = L / 2;
    const d = ((u % 1) + 1) % 1 * 4;
    const side = Math.floor(d), f = d - side;
    return [[-h + L * f, -h], [h, -h + L * f], [h - L * f, h], [-h, h - L * f]][side];
  }

  frame(dt, tl, view, pointer) {
    this.aim(dt, view, pointer);
    const W0 = 0.7, W1 = 9.1, S = this.S, n = this.layers;
    const dh = S / n;
    let h = 0, px = 0, pz = 0, tipY, layer = 0, printing = false;

    if (tl < W0) {
      [px, pz] = this.perimeter(0);
      const e = easeInOut(tl / W0);
      tipY = this.park.y + (this.bedTop + 0.05 - this.park.y) * e;
      px = (this.park.x - this.X0) + (px - (this.park.x - this.X0)) * e;
      pz *= e;
    } else if (tl < W1) {
      printing = true;
      const p = (tl - W0) / (W1 - W0) * n;
      layer = Math.min(n - 1, Math.floor(p));
      const u = p - layer;
      [px, pz] = this.perimeter(u);
      h = dh * (layer + smooth(u));
      tipY = this.bedTop + h + 0.05;
      layer += 1;
    } else {
      h = S; layer = n;
      const e = easeInOut((tl - W1) / 1.1);
      const [sx, sz] = this.perimeter(0);
      tipY = this.bedTop + S + 0.05 + (this.park.y - this.bedTop - S) * e;
      px = sx + ((this.park.x - this.X0) - sx) * e;
      pz = sz * (1 - e);
    }

    // Al final, la pieza baja y atraviesa la cama: el ciclo vuelve a empezar vacío.
    const sink = tl > 11.6 ? easeInOut((tl - 11.6) / 1.3) * (S + 0.2) : 0;
    this.bed.position.z = -pz;
    this.part.position.set(0, this.bedTop + S / 2 - sink, 0);
    this.clipTop.constant = this.bedTop + h - sink + 0.0005;
    this.cap.visible = h > 0.001;
    this.cap.position.set(0, this.bedTop + h - sink - 0.01, 0);
    // Capa recién depositada: melocotón; se enfría a papel al terminar.
    this.capMat.color.copy(cPeach).lerp(cPaper, printing ? 0 : smooth((tl - W1) / 1.2));

    this.tip.set(this.X0 + px, tipY, 0);
    this.head.position.copy(this.tip);
    this.bar.position.y = tipY + 3.1;

    // La bobina de arriba gira mientras alimenta; el filamento sigue al cabezal.
    const fed = clamp01((tl - W0) / (W1 - W0));
    this.spoolTop.rotation.y = -fed * Math.PI * 5;
    const c = this.curve.points;
    c[0].set(7.4 - 1.8, 2.3, -1.6);
    c[1].set(5.4, 8.5, -1.2);
    c[2].set(this.tip.x + 1.2, this.tip.y + 8.2, -0.3);
    c[3].set(this.tip.x, this.tip.y + 6.0, 0);
    this.fil.geometry.dispose();
    this.fil.geometry = new THREE.TubeGeometry(this.curve, 28, 0.08, 6, false);

    return {
      tag: printing ? this.project(this.tagAt.set(this.tip.x + 1.3, this.tip.y + 1.4, 0), view) : null,
      live: `Capa <b>${String(layer).padStart(2, '0')} / ${n}</b> · Altura de capa <b>0,2 mm</b> · Filamento <b>PLA</b>`,
    };
  }
}

// ============================================================================
// B / RESINA — la placa baja a la cubeta, la luz UV endurece una capa, la placa
// sube y la pieza (colgando al revés) va saliendo de la resina.
export class ResinDemo extends Stage {
  constructor() {
    super({ bed: false, radius: 10.0, focus: [2.0, 4.4, 0.4], shadowSize: 14, azimuth: 0.6 });
    this.period = PERIOD;
    plinth(this.scene, 1.9, 9.2);

    const shell = std(PALETTE.paperShade, 0.5);
    const X0 = -1.0;
    this.X0 = X0;
    this.scene.add(box(6, 3, 6, shell, X0, 1.5, 0));
    this.scene.add(box(2.2, 0.5, 0.06, std(PALETTE.inkDeep, 0.9), X0, 1.6, 3.02));

    // Pantalla UV bajo la cubeta: el único acento de la vista.
    this.uvMat = new THREE.MeshBasicMaterial({ color: PALETTE.inkDeep });
    this.scene.add(box(5.5, 0.14, 5.5, this.uvMat, X0, 3.07, 0));

    // Cubeta con resina.
    const vat = std(PALETTE.peach, 0.45);
    this.scene.add(box(5, 0.2, 5, vat, X0, 3.24, 0));
    for (const [w, d, x, z] of [[5, 0.25, 0, 2.375], [5, 0.25, 0, -2.375], [0.25, 4.5, 2.375, 0], [0.25, 4.5, -2.375, 0]]) {
      this.scene.add(box(w, 1.3, d, vat, X0 + x, 3.79, z));
    }
    this.resinY = 4.1;
    this.scene.add(box(4.5, 0.05, 4.5, std(PALETTE.peachShade, 0.2), X0, this.resinY, 0));

    // Columna Z, brazo y placa de impresión.
    this.scene.add(box(0.9, 9.6, 1.0, std(PALETTE.peachShade, 0.5), X0, 3 + 4.8, -2.7));
    this.clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this.resinY + 0.03));
    const clipped = (color, rough) => new THREE.MeshStandardMaterial({ color, roughness: rough, clippingPlanes: [this.clip] });
    this.carriage = new THREE.Group();
    this.carriage.position.x = X0;
    this.carriage.add(box(3.4, 0.3, 3.4, clipped(PALETTE.peach, 0.4), 0, 0.15, 0));
    this.carriage.add(box(0.9, 0.9, 0.9, clipped(PALETTE.paperShade, 0.5), 0, 0.75, 0));
    this.carriage.add(box(0.7, 0.5, 2.3, clipped(PALETTE.paperShade, 0.5), 0, 1.0, -1.55));
    // La pieza cuelga al revés de la placa: se ve solo lo que ya salió de la resina.
    this.H = 3.95;
    const part = queen(clipped(PALETTE.paper, 0.5));
    part.rotation.x = Math.PI;
    this.part = part;
    this.carriage.add(part);
    this.scene.add(this.carriage);

    // Botes de resina y una estatuilla ya impresa.
    const b1 = bottle(1); b1.position.set(7.2, 0, -2.4);
    const b2 = bottle(0.85); b2.position.set(8.6, 0, -0.6); b2.rotation.y = -0.6;
    const b3 = bottle(0.72); b3.position.set(6.6, 0, -4.4); b3.rotation.y = 0.4;
    this.scene.add(b1, b2, b3);
    const statue = queen(std(PALETTE.paper, 0.45));
    statue.position.set(5.4, 0, 3.8);
    statue.scale.setScalar(0.72);
    this.scene.add(statue);

    this.layers = 10;
    this.tagAt = new THREE.Vector3();
  }

  frame(dt, tl, view, pointer) {
    this.aim(dt, view, pointer);
    const W0 = 0.3, W1 = 8.5, n = this.layers, dh = this.H / n;
    let lift = 0, uv = 0, layer = 0;

    if (tl >= W0 && tl < W1) {
      const p = (tl - W0) / (W1 - W0) * n;
      const k = Math.floor(p), u = p - k;
      layer = k + 1;
      if (u < 0.5) {
        // Exposición: la placa quieta, la pantalla ilumina la capa.
        lift = k * dh;
        uv = smooth(u / 0.08) * (1 - smooth((u - 0.42) / 0.08));
      } else {
        // Despegue: sube, se separa del fondo y vuelve una capa más arriba.
        const v = (u - 0.5) / 0.5;
        lift = (k + smooth(v)) * dh + Math.sin(Math.PI * v) * 1.3;
      }
    } else if (tl >= W1 && tl < 11.8) {
      layer = n;
      lift = this.H + easeInOut((tl - W1) / 1.3) * 2.0;
    } else if (tl >= 11.8) {
      layer = n;
      lift = (this.H + 2.0) * (1 - easeInOut((tl - 11.8) / 1.2));
    }

    this.carriage.position.y = this.resinY + lift;
    this.part.position.y = 0;
    this.uvMat.color.copy(cDeep).lerp(cAccent, uv);

    return {
      tag: uv > 0.5 ? this.project(this.tagAt.set(this.X0 + 2.9, 3.1, 2.9), view) : null,
      live: `Capa <b>${String(layer).padStart(2, '0')} / ${n}</b> · Altura de capa <b>0,05 mm</b> · Luz UV <b>405 nm</b>`,
    };
  }
}
