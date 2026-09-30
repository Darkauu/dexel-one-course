// Punto 05 / Límites: tiempo, líneas de capa, un color sin AMS y el material.
// Cada escena muestra el límite ocurriendo, no solo nombrado.
// Todo el estado visual es función pura del tiempo del bucle.
import * as THREE from 'three';
import { PALETTE, smooth, easeInOut, clamp01 } from './shared.js';
import { Stage, box, std } from './demos.js';
import { cyl, plinth, spool } from './tech.js';
import { MATERIAL, CORNER } from './materials.js';

class LimitStage extends Stage {
  constructor(period, opts = {}) {
    super({ bed: false, radius: 4.5, focus: [0, 1.6, 0.3], shadowSize: 8, azimuth: 0.55, ...opts });
    this.period = period;
    plinth(this.scene, 0, 4.3);
  }
}

// ============================================================================
// A / TIEMPO — un jarrón crece muy despacio mientras el reloj de arena se vacía.
// El contador traduce el ciclo a las 8 h reales de la impresión.
const HOURS = 8;
export class TimeDemo extends LimitStage {
  constructor() {
    super(12);
    this.floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.001);
    this.grow = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    const vaseGeo = new THREE.LatheGeometry(
      [[0, 0], [0.9, 0], [1.0, 0.4], [1.1, 1.4], [0.85, 2.4], [0.6, 3.0], [0.7, 3.4], [0, 3.4]].map(([r, y]) => new THREE.Vector2(r, y)),
      40,
    );
    const mat = new THREE.MeshStandardMaterial({ color: PALETTE.paper, roughness: 0.5, side: THREE.DoubleSide, clippingPlanes: [this.grow, this.floor] });
    this.vase = new THREE.Mesh(vaseGeo, mat);
    this.vase.position.set(0.9, 0, -0.3);
    this.vase.castShadow = true;
    this.scene.add(this.vase);
    this.vaseH = 3.4;

    // Reloj de arena: dos conos de vidrio opaco, arena arriba y abajo, marco.
    const g = new THREE.Group();
    const frame = std(PALETTE.peachShade, 0.5);
    g.add(cyl(0.9, 0.9, 0.18, frame, 0, 0.09, 0, 32));
    g.add(cyl(0.9, 0.9, 0.18, frame, 0, 2.71, 0, 32));
    for (const [x, z] of [[0.75, 0], [-0.75, 0], [0, 0.75], [0, -0.75]]) g.add(box(0.1, 2.5, 0.1, frame, x, 1.4, z));
    const glass = std(PALETTE.paperShade, 0.2);
    g.add(cyl(0.05, 0.62, 1.2, glass, 0, 0.78, 0, 32));
    g.add(cyl(0.62, 0.05, 1.2, glass, 0, 2.02, 0, 32));
    const sand = std(PALETTE.peach, 0.9);
    this.sandTop = cyl(0.01, 0.6, 1, sand, 0, 0, 0, 32);
    this.sandBottom = cyl(0.01, 0.6, 1, sand, 0, 0, 0, 32);
    g.add(this.sandTop, this.sandBottom);
    g.position.set(-2.2, 0, 1.2);
    this.glass = g;
    this.scene.add(g);
  }

  frame(dt, tl, view, pointer) {
    this.aim(dt, view, pointer);
    const p = clamp01((tl - 0.3) / 10.5);           // avance de la impresión
    const sink = tl > 11.2 ? easeInOut((tl - 11.2) / 0.8) * 3.6 : 0;
    this.vase.position.y = -sink;
    this.grow.constant = p * this.vaseH - sink + 0.001;

    // Arena: arriba se vacía, abajo se llena (conos que cambian de altura).
    const top = Math.max(0.02, 1 - p) * 1.05, bot = Math.max(0.02, p) * 1.05;
    this.sandTop.scale.set(1 - p * 0.6, top, 1 - p * 0.6);
    this.sandTop.position.y = 1.44 + top / 2;
    this.sandTop.rotation.x = Math.PI;
    this.sandBottom.scale.set(0.5 + p * 0.5, bot, 0.5 + p * 0.5);
    this.sandBottom.position.y = 0.18 + bot / 2;

    const left = Math.round((1 - p) * HOURS * 60);
    const h = Math.floor(left / 60), m = left % 60;
    return {
      tag: CORNER,
      live: `<b>${String(Math.round(p * 100)).padStart(2, '0')} %</b> · Restan <b>${h} h ${String(m).padStart(2, '0')} min</b>`,
    };
  }
}

// ============================================================================
// B / CAPAS VISIBLES — una esfera impresa en capas y una lupa que recorre su
// superficie: en el lente se ven los escalones de cada capa.
export class LayersDemo extends LimitStage {
  constructor() {
    super(8);
    const mat = std(PALETTE.paper, 0.55);
    const groove = std(PALETTE.peachShade, 0.8);
    const R = 1.6, layers = 20, lh = (2 * R) / layers;
    this.ball = new THREE.Group();
    for (let k = 0; k < layers; k++) {
      const yc = -R + (k + 0.5) * lh;
      const r = Math.sqrt(Math.max(0.04, R * R - yc * yc));
      // Cada capa: un disco y una ranura más fina en el borde inferior (la línea).
      this.ball.add(cyl(r, r, lh * 0.8, mat, 0, yc + lh * 0.1, 0, 48));
      this.ball.add(cyl(r - 0.05, r - 0.05, lh * 0.2, groove, 0, yc - lh * 0.4, 0, 48));
    }
    this.ball.position.set(-0.6, R + 0.1, -0.4);
    this.scene.add(this.ball);
    this.R = R;

    // Lupa: aro, mango y un lente que muestra la vista de cerca.
    this.rt = new THREE.WebGLRenderTarget(512, 512, { samples: 4 });
    this.zoomCam = new THREE.PerspectiveCamera(16, 1, 0.1, 50);
    this.lens = new THREE.Group();
    const face = new THREE.Mesh(new THREE.CircleGeometry(1.3, 56), new THREE.MeshBasicMaterial({ map: this.rt.texture }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.12, 12, 56), std(PALETTE.peachShade, 0.35));
    const handle = cyl(0.11, 0.13, 1.5, std(PALETTE.peachShade, 0.35), 1.3, -1.3, 0, 16);
    handle.rotation.z = Math.PI / 4;
    this.lens.add(face, rim, handle);
    this.scene.add(this.lens);
    this.target = new THREE.Vector3();
  }

  frame(dt, tl, view, pointer) {
    this.aim(dt, view, pointer);
    // La lupa sube y baja despacio por el costado de la esfera.
    const s = Math.sin((tl / this.period) * Math.PI * 2);
    const yRel = s * 0.9;
    const b = this.ball.position;
    const rAt = Math.sqrt(this.R * this.R - yRel * yRel);
    // Punto de la superficie mirando hacia la cámara.
    const dir = new THREE.Vector3().subVectors(this.camera.position, b).setY(0).normalize();
    this.target.set(b.x + dir.x * rAt, b.y + yRel, b.z + dir.z * rAt);
    this.zoomCam.position.copy(this.target).addScaledVector(dir, 2.2).add(new THREE.Vector3(0, 0.3, 0));
    this.zoomCam.lookAt(this.target);
    this.zoomCam.updateProjectionMatrix();

    // El lente flota entre la esfera y la cámara, un poco a la derecha, de frente.
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize().negate();
    this.lens.position.copy(this.target).addScaledVector(dir, 2.0).addScaledVector(right, 0.8).add(new THREE.Vector3(0, 0.1, 0));
    this.lens.quaternion.copy(this.camera.quaternion);

    return { tag: CORNER, live: 'Altura de capa <b>0,2 mm</b> · Zoom <b>×8</b>' };
  }

  prepass(renderer) {
    this.lens.visible = false;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(PALETTE.inkDeep, 1);
    renderer.clear();
    renderer.render(this.scene, this.zoomCam);
    renderer.setRenderTarget(prev);
    this.lens.visible = true;
  }
}

// ============================================================================
// C / UN COLOR — dos torres crecen a la vez: la de una sola bobina sale de un
// color; la del AMS cambia de color por tramos y su ranura activa se levanta.
const AMS_COLORS = [PALETTE.paper, MATERIAL.petg, MATERIAL.tpu, PALETTE.peach];
export class ColorDemo extends LimitStage {
  constructor() {
    super(10, { focus: [0, 1.5, 0.4] });
    this.floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.001);
    this.grow = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    const planes = [this.grow, this.floor];
    this.H = 2.4;

    // Torre de un solo color, con su bobina.
    const mono = new THREE.MeshStandardMaterial({ color: PALETTE.paper, roughness: 0.5, clippingPlanes: planes });
    this.monoTower = box(1.1, this.H, 1.1, mono, 0, this.H / 2, 0);
    this.monoTower.position.set(-1.9, this.H / 2, 1.4);
    this.scene.add(this.monoTower);
    const one = spool(PALETTE.paper);
    one.scale.setScalar(0.45);
    one.position.set(-3.1, 0, 0.2);
    this.scene.add(one);

    // Torre multicolor: cuatro tramos, uno por bobina.
    this.multi = new THREE.Group();
    const seg = this.H / 4;
    AMS_COLORS.forEach((c, k) => {
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, clippingPlanes: planes });
      this.multi.add(box(1.1, seg, 1.1, m, 0, seg * (k + 0.5), 0));
    });
    this.multi.position.set(1.4, 0, 1.2);
    this.scene.add(this.multi);

    // Unidad AMS: caja con cuatro bobinas asomando; la activa se levanta.
    const ams = new THREE.Group();
    ams.add(box(3.4, 1.0, 1.3, std(PALETTE.paperShade, 0.5), 0, 0.5, 0));
    this.slots = AMS_COLORS.map((c, k) => {
      const sp = new THREE.Group();
      const disc = cyl(0.36, 0.36, 0.55, std(c, 0.45), 0, 0, 0, 32);
      disc.rotation.z = Math.PI / 2;
      disc.rotation.y = Math.PI / 2;
      sp.add(disc);
      sp.position.set(-1.2 + k * 0.8, 1.05, 0);
      ams.add(sp);
      return sp;
    });
    ams.position.set(1.0, 0, -1.9);
    this.scene.add(ams);
  }

  frame(dt, tl, view, pointer) {
    this.aim(dt, view, pointer);
    const p = clamp01((tl - 0.4) / 7.6);
    const sink = tl > 9.1 ? easeInOut((tl - 9.1) / 0.9) * (this.H + 0.2) : 0;
    this.grow.constant = p * this.H - sink + 0.001;
    this.monoTower.position.y = this.H / 2 - sink;
    this.multi.position.y = -sink;
    const active = p < 1 && p > 0 ? Math.min(3, Math.floor(p * 4)) : -1;
    this.slots.forEach((s, k) => { s.position.y = 1.05 + (k === active ? 0.25 : 0); });
    return { tag: CORNER, live: 'Sin AMS <b>1</b> · Con AMS <b>4</b> colores' };
  }
}

// ============================================================================
// D / MATERIAL — una lámpara calienta una pieza de PLA en voladizo: al pasar
// los ~60 °C se ablanda y se dobla. El termómetro sube con la temperatura.
export class MaterialLimitDemo extends LimitStage {
  constructor() {
    super(9);
    // Soporte y barra de PLA en voladizo (segmentada para poder doblarse).
    this.scene.add(box(0.9, 1.8, 1.0, std(PALETTE.peachShade, 0.5), -1.8, 0.9, 0.3));
    const geo = new THREE.BoxGeometry(3.2, 0.28, 0.8, 32, 1, 1);
    geo.translate(1.6, 0, 0);
    this.barBase = Float32Array.from(geo.attributes.position.array);
    this.bar = new THREE.Mesh(geo, std(MATERIAL.pla, 0.45));
    this.bar.castShadow = true;
    this.bar.position.set(-1.6, 1.6, 0.3);
    this.scene.add(this.bar);

    // Lámpara de calor sobre la punta: brazo, cono y bombilla (el acento).
    this.bulbMat = new THREE.MeshBasicMaterial({ color: PALETTE.inkDeep });
    const lamp = new THREE.Group();
    lamp.add(cyl(0.1, 0.1, 4.2, std(PALETTE.paperShade, 0.4), 0, 2.1, 0, 12));
    lamp.add(box(1.4, 0.12, 0.12, std(PALETTE.paperShade, 0.4), 0.7, 4.2, 0));
    const shade = cyl(0.2, 0.7, 0.6, std(PALETTE.paperShade, 0.4), 1.4, 3.95, 0, 32);
    lamp.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14), this.bulbMat);
    bulb.position.set(1.4, 3.6, 0);
    lamp.add(bulb);
    lamp.position.set(0.3, 0, -1.4);
    this.scene.add(lamp);

    // Termómetro: tubo, bulbo y columna que sube.
    const th = new THREE.Group();
    th.add(cyl(0.16, 0.16, 2.6, std(PALETTE.paper, 0.3), 0, 1.55, 0, 16));
    th.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), std(PALETTE.accent, 0.4)).translateY(0.25));
    this.fluid = cyl(0.09, 0.09, 1, std(PALETTE.accent, 0.4), 0, 0, 0.1, 12);
    th.add(this.fluid);
    th.add(box(0.5, 0.04, 0.05, std(PALETTE.inkDeep, 0.8), 0.25, 2.1, 0.12)); // marca 60 °C
    th.position.set(2.7, 0, 1.2);
    this.scene.add(th);
  }

  temp(tl) {
    if (tl < 0.5) return 25;
    if (tl < 5.0) return 25 + 45 * smooth((tl - 0.5) / 4.5);
    if (tl < 6.5) return 70;
    return 70 - 45 * smooth((tl - 6.5) / 2.3);
  }

  frame(dt, tl, view, pointer) {
    this.aim(dt, view, pointer);
    const T = this.temp(tl);
    // Se ablanda por encima de ~55 °C y se queda doblada: la deformación no vuelve.
    const soft = smooth((Math.min(T, 70) - 55) / 15);
    const bent = tl < 6.5 ? soft : 1;
    const reset = tl > 8.3 ? smooth((tl - 8.3) / 0.7) : 0; // pieza nueva al cerrar el ciclo
    const k = 0.16 * bent * (1 - reset);
    const pos = this.bar.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = this.barBase[i * 3];
      pos.array[i * 3 + 1] = this.barBase[i * 3 + 1] - k * x * x;
    }
    pos.needsUpdate = true;
    this.bar.geometry.computeVertexNormals();

    const f = (T - 20) / 60;
    this.fluid.scale.y = 0.2 + f * 2.2;
    this.fluid.position.y = 0.3 + this.fluid.scale.y / 2;
    this.bulbMat.color.set(PALETTE.inkDeep).lerp(new THREE.Color(PALETTE.accent), smooth((T - 25) / 20) * (tl < 6.5 ? 1 : 1 - smooth((tl - 6.5) / 0.8)));

    return { tag: CORNER, live: `<b>${Math.round(T)} °C</b> · Límite PLA <b>60 °C</b>` };
  }
}
