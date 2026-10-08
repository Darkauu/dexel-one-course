// Punto 04 / Electrónica y control. La misma escena de la Ender con un efecto por
// fase (`fx` en POINTS.elec):
//   air   — el ventilador de capa sopla bajo la boquilla (y el hilo que sale se enfría).
//   power — pulsos de energía salen de la fuente por el cable hacia la placa.
//   lcd   — la pantalla se enciende como una consola antigua: línea blanca, luego una
//           estrella de 4 puntas que se abre desde el centro y revela la imagen.
//   sd    — una tarjeta microSD entra en su ranura, hace clic y vuelve a salir.
// La ranura y el cable no vienen en el modelo: se agregan aquí. Todo es opaco.
import * as THREE from 'three';
import { EnderDemo } from './ender.js';
import { PALETTE, damp } from './shared.js';

const AIR_N = 90, PULSE_N = 9;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const boxOf = (meshes) => meshes.reduce((b, m) => b.expandByObject(m), new THREE.Box3());

// Pantalla real: LCD monocromo de 128 × 64 puntos, puntos blancos sobre azul.
// (Colores del objeto real, como los de los materiales; no son de la marca.)
const LCD = { w: 128, h: 64, cell: 4, bg: '#2C5BE0', off: '#3463E6', on: '#EEF3FF' };
const OUT_W = LCD.w * LCD.cell, OUT_H = LCD.h * LCD.cell;

// Fuente de 5 × 7 puntos (solo los caracteres que usa la pantalla).
const FONT = Object.fromEntries(Object.entries({
  '0': ' ### |#   #|#  ##|# # #|##  #|#   #| ### ', '1': '  #  | ##  |  #  |  #  |  #  |  #  | ### ',
  '2': ' ### |#   #|    #|   # |  #  | #   |#####', '3': '#####|   # |  #  |   # |    #|#   #| ### ',
  '4': '   # |  ## | # # |#  # |#####|   # |   # ', '5': '#####|#    |#### |    #|    #|#   #| ### ',
  '6': '  ## | #   |#    |#### |#   #|#   #| ### ', '7': '#####|    #|   # |  #  | #   | #   | #   ',
  '8': ' ### |#   #|#   #| ### |#   #|#   #| ### ', '9': ' ### |#   #|#   #| ####|    #|   # | ##  ',
  A: ' ### |#   #|#   #|#####|#   #|#   #|#   #', C: ' ### |#   #|#    |#    |#    |#   #| ### ',
  D: '#### |#   #|#   #|#   #|#   #|#   #|#### ', E: '#####|#    |#    |#### |#    |#    |#####',
  F: '#####|#    |#    |#### |#    |#    |#    ', I: ' ### |  #  |  #  |  #  |  #  |  #  | ### ',
  L: '#    |#    |#    |#    |#    |#    |#####', M: '#   #|## ##|# # #|# # #|#   #|#   #|#   #',
  N: '#   #|##  #|# # #|#  ##|#   #|#   #|#   #', O: ' ### |#   #|#   #|#   #|#   #|#   #| ### ',
  P: '#### |#   #|#   #|#### |#    |#    |#    ', R: '#### |#   #|#   #|#### |# #  |#  # |#   #',
  S: ' ####|#    |#    | ### |    #|    #|#### ', T: '#####|  #  |  #  |  #  |  #  |  #  |  #  ',
  X: '#   #|#   #| # # |  #  | # # |#   #|#   #', Y: '#   #|#   #| # # |  #  |  #  |  #  |  #  ',
  Z: '#####|    #|   # |  #  | #   |#    |#####', '%': '##   |##  #|   # |  #  | #   |#  ##|   ##',
  ':': '     | ##  | ##  |     | ##  | ##  |     ', '.': '     |     |     |     |     | ##  | ##  ',
  '°': ' ##  |#  # |#  # | ##  |     |     |     ', '-': '     |     |     |#####|     |     |     ',
}).map(([k, v]) => [k, v.split('|')]));

export class EnderElecDemo extends EnderDemo {
  constructor() {
    super('elec');
    this.w = { air: 0, power: 0, lcd: 0, sd: 0 };
    this.clock = { air: 0, power: 0, lcd: 0, sd: 0 };
  }

  buildExtras() {
    this.buildFlows(); // el hilo derretido de la boquilla (se ve enfriarse con el aire)
    const V = THREE.Vector3;
    this.tmpM = this.tmpM || new THREE.Matrix4();
    this.tmpM2 = new THREE.Matrix4();
    this.tmpV = new V(); this.tmpV2 = new V();
    this.tmpQ = new THREE.Quaternion(); this.tmpS = new V(1, 1, 1);
    this.yAxis = new V(0, 1, 0);
    this.buildAir();
    this.buildPower();
    this.buildLcd();
    this.buildKnob();
    this.buildSd();
  }

  // --- Ventilador de capa: corrientes de aire del conducto a la punta ----------
  buildAir() {
    const fan = boxOf(this.groups.layerFanBody || []);
    if (fan.isEmpty() || !this.tip) return;
    const V = THREE.Vector3, tip = this.tip;
    const out = new V((fan.min.x + fan.max.x) / 2, fan.min.y - 0.02, (fan.min.z + fan.max.z) / 2 + 0.15);
    this.airCurve = new THREE.CatmullRomCurve3([
      out.clone().add(new V(0, 0.12, 0)), out,
      new V(out.x - 0.05, tip.y - 0.08, (out.z + tip.z) / 2 + 0.05),
      new V(tip.x, tip.y - 0.12, tip.z),
      new V(tip.x - 0.45, tip.y - 0.16, tip.z - 0.1),
    ]);
    const air = new THREE.InstancedMesh(new THREE.BoxGeometry(0.016, 0.14, 0.016), new THREE.MeshBasicMaterial({ color: PALETTE.paper }), AIR_N);
    air.frustumCulled = false;
    air.visible = false;
    this.scene.add(air);
    this.air = air;
    this.airSeed = Array.from({ length: AIR_N }, (_, i) => ({
      o: (i * 0.618034) % 1,
      a: ((i * 0.7548777) % 1) * Math.PI * 2,
      r: 0.015 + ((i * 0.5698403) % 1) * 0.06,
    }));
    this.anchors.airOut = this.airCurve.getPointAt(0.55);
  }

  animateAir() {
    if (!this.air) return;
    const w = this.w.air;
    this.air.visible = w > 0.01;
    if (!this.air.visible) return;
    const t = this.clock.air;
    for (let i = 0; i < AIR_N; i++) {
      const s = this.airSeed[i];
      const u = (s.o + t * 0.9) % 1;
      this.airCurve.getPointAt(u, this.tmpV);
      this.airCurve.getTangentAt(u, this.tmpV2);
      // Desplazamiento lateral: el chorro se abre al salir del conducto.
      const spread = s.r * (0.4 + u);
      this.tmpV.x += Math.cos(s.a) * spread * 0.6;
      this.tmpV.z += Math.sin(s.a) * spread;
      this.tmpV.y += Math.sin(s.a * 2) * spread * 0.3;
      this.tmpQ.setFromUnitVectors(this.yAxis, this.tmpV2);
      const sc = Math.sin(u * Math.PI) * w; // nace y se apaga encogiéndose
      this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS.set(sc, sc, sc));
      this.air.setMatrixAt(i, this.tmpM);
    }
    this.air.instanceMatrix.needsUpdate = true;
  }

  // --- Fuente: cable de 24 V hacia la placa, con pulsos que lo recorren --------
  buildPower() {
    const psu = boxOf(this.groups.psu || []);
    const box = boxOf(this.groups.controlBox || []);
    if (psu.isEmpty() || box.isEmpty()) return;
    const V = THREE.Vector3;
    // Sale por el costado de la fuente (el que mira a la cámara en esta fase), baja
    // por fuera del marco y entra en la base, camino a la placa.
    const zf = psu.max.z - 0.15;
    this.powerCurve = new THREE.CatmullRomCurve3([
      new V(psu.max.x - 0.05, psu.min.y + 0.35, zf),
      new V(psu.max.x + 0.25, psu.min.y + 0.2, zf + 0.1),
      new V(psu.max.x + 0.4, psu.min.y - 0.5, zf + 0.35),
      new V(psu.max.x + 0.35, box.max.y - 0.2, zf + 0.75),
      new V(psu.max.x - 0.1, box.max.y - 0.35, zf + 0.8),
    ]);
    const cable = new THREE.Mesh(
      new THREE.TubeGeometry(this.powerCurve, 120, 0.035, 8, false),
      new THREE.MeshStandardMaterial({ color: PALETTE.inkDeep, roughness: 0.7 }),
    );
    cable.castShadow = true;
    cable.visible = false;
    this.scene.add(cable);
    this.cable = cable;
    const pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(0.065, 12, 8), new THREE.MeshBasicMaterial({ color: PALETTE.accent }), PULSE_N);
    pulses.frustumCulled = false;
    pulses.visible = false;
    this.scene.add(pulses);
    this.pulses = pulses;
  }

  animatePower() {
    if (!this.cable) return;
    const w = this.w.power;
    this.cable.visible = this.pulses.visible = w > 0.01;
    if (!this.cable.visible) return;
    this.cable.scale.setScalar(1); // el cable aparece entero; los pulsos crecen con w
    const t = this.clock.power;
    for (let i = 0; i < PULSE_N; i++) {
      const u = ((i / PULSE_N) + t * 0.22) % 1;
      this.powerCurve.getPointAt(u, this.tmpV);
      const sc = w * (0.7 + 0.3 * Math.sin(t * 9 + i));
      this.tmpM.compose(this.tmpV, this.tmpQ.identity(), this.tmpS.set(sc, sc, sc));
      this.pulses.setMatrixAt(i, this.tmpM);
    }
    this.pulses.instanceMatrix.needsUpdate = true;
  }

  // --- Pantalla: una textura de lienzo sobre el vidrio del LCD -----------------
  buildLcd() {
    // El vidrio es la pieza más delgada y pequeña de «Screen» (sin contar tornillos).
    const glass = (this.groups.lcdScreen || [])
      .filter((m) => m.parent && m.parent.name === 'PCB')
      .map((m) => { m.geometry.computeBoundingBox(); return { m, v: m.geometry.boundingBox.getSize(new THREE.Vector3()) }; })
      .sort((a, b) => a.v.x * a.v.y * a.v.z - b.v.x * b.v.y * b.v.z)[0];
    if (!glass) return;
    const m = glass.m, bb = m.geometry.boundingBox, size = glass.v;
    const axes = [0, 1, 2].sort((a, b) => size.getComponent(b) - size.getComponent(a)); // grande, media, delgada
    const unit = (k) => new THREE.Vector3().setComponent(k, 1);
    let u = unit(axes[0]), n = unit(axes[2]);
    const center = bb.getCenter(new THREE.Vector3());
    // La cara visible: la que mira hacia el frente y arriba.
    const toWorld = (d) => d.clone().transformDirection(m.matrixWorld);
    if (toWorld(n).dot(new THREE.Vector3(0, 0.6, 1).normalize()) < 0) n.negate();
    let v = new THREE.Vector3().crossVectors(n, u);
    if (toWorld(v).y < 0) { u.negate(); v.negate(); }
    const W = size.getComponent(axes[0]) * 0.86, H = size.getComponent(axes[1]) * 0.8;
    // Separación fija en unidades de escena (0,02 ≈ 1 mm real) sobre el vidrio: con la
    // cámara en la vista general, una separación relativa al grosor del vidrio quedaba
    // bajo la precisión del z-buffer y ambas capas parpadeaban en triángulos.
    const worldPerLocal = n.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(m.matrixWorld)).length() || 1;
    const lift = 0.02 / worldPerLocal;
    const pos = center.clone().addScaledVector(n, size.getComponent(axes[2]) * 0.5 + lift);

    const canvas = document.createElement('canvas');
    canvas.width = OUT_W; canvas.height = OUT_H;
    this.lcdCtx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.lcdTex = tex;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    face.matrixAutoUpdate = false;
    face.matrix.makeBasis(u.multiplyScalar(W), v.multiplyScalar(H), n).setPosition(pos);
    m.add(face);
    this.lcdFace = face;
    m.updateMatrixWorld(true);
    this.anchors.lcdFace = new THREE.Vector3().setFromMatrixPosition(face.matrixWorld);
    this.lcdState = '';
    this.drawLcdOff();
  }

  // Imagen de estado (como la de Marlin): temperaturas, posición, avance y mensaje,
  // escrita punto por punto con una fuente de 5 × 7 como la del LCD real.
  composeLcdImage(hot, bed) {
    const W = LCD.w, H = LCD.h;
    const px = this.lcdPx || (this.lcdPx = new Uint8Array(W * H));
    px.fill(0);
    const set = (x, y, v = 1) => { if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = v; };
    const rect = (x0, y0, x1, y1, v = 1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, v); };
    const frame = (x0, y0, x1, y1) => { rect(x0, y0, x1, y0); rect(x0, y1, x1, y1); rect(x0, y0, x0, y1); rect(x1, y0, x1, y1); };
    const text = (str, x, y, v = 1) => {
      for (const ch of str) {
        const g = FONT[ch];
        if (g) for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r][c] === '#') set(x + c, y + r, v);
        x += 6;
      }
    };
    const deg = (n, w) => String(Math.round(n)).padStart(w, ' ') + '°';
    // Objetivos arriba, íconos al medio, temperatura actual abajo.
    text(deg(200, 3), 4, 1); text(deg(60, 2), 52, 1);
    rect(10, 10, 17, 14); rect(11, 15, 16, 15); rect(12, 16, 15, 16); rect(13, 17, 14, 17); // boquilla
    rect(48, 17, 66, 18); [51, 56, 61].forEach((x, i) => { for (let y = 10; y < 15; y++) set(x + ((y + i) % 2), y); }); // cama con calor
    frame(106, 9, 117, 20); for (let k = 0; k < 10; k++) { set(107 + k, 10 + k); set(116 - k, 10 + k); } // ventilador
    text(deg(hot, 3), 4, 21); text(deg(bed, 2), 52, 21); text('0%', 104, 21);
    rect(0, 31, W - 1, 41); text('X  0  Y  0  Z 0.0', 3, 33, 0);
    text('FR100%', 2, 45); frame(42, 45, 92, 51); text('00:00', 97, 45);
    text(hot < 199 ? 'CALENTANDO...' : 'LISTA PARA IMPRIMIR', 2, 56);
  }

  drawLcdOff() {
    const ctx = this.lcdCtx;
    ctx.fillStyle = '#05060C'; ctx.fillRect(0, 0, OUT_W, OUT_H);
    this.lcdTex.needsUpdate = true;
  }

  // Dibuja la pantalla celda por celda. state(x, y): 0 apagado (negro), 1 blanco,
  // 2 la imagen real (punto prendido o apagado del LCD).
  renderCells(state) {
    const ctx = this.lcdCtx, c = LCD.cell, g = c - 1, W = LCD.w, H = LCD.h, px = this.lcdPx;
    ctx.fillStyle = '#05060C'; ctx.fillRect(0, 0, OUT_W, OUT_H);
    const st = this.lcdState8 || (this.lcdState8 = new Uint8Array(W * H));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) st[y * W + x] = state(x, y);
    ctx.fillStyle = LCD.bg;
    for (let i = 0; i < W * H; i++) if (st[i] === 2) ctx.fillRect((i % W) * c, ((i / W) | 0) * c, c, c);
    for (const [want, color] of [[0, LCD.off], [1, LCD.on]]) {
      ctx.fillStyle = color;
      for (let i = 0; i < W * H; i++) if (st[i] === 2 && px[i] === want) ctx.fillRect((i % W) * c, ((i / W) | 0) * c, g, g);
    }
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < W * H; i++) if (st[i] === 1) ctx.fillRect((i % W) * c, ((i / W) | 0) * c, g, g);
  }

  animateLcd() {
    if (!this.lcdTex) return;
    const on = this.phases[this.phase]?.fx === 'lcd';
    if (!on) {
      if (this.lcdState !== 'off') { this.drawLcdOff(); this.lcdState = 'off'; }
      return;
    }
    // Reloj a saltos de 1/15 s: el encendido avanza por cuadros, como en una consola.
    const s = Math.floor(this.clock.lcd * 15) / 15;
    const frame = Math.round(s * 15);
    if (frame === this.lcdFrame && this.lcdState !== 'off') return;
    this.lcdFrame = frame;
    const booting = s < 2.0;
    // Tras el encendido, las temperaturas se rehacen 5 veces por segundo.
    if (!booting && frame % 3 !== 0 && this.lcdState === 'run') return;
    const hot = 26 + 174 * smooth(2.0, 14, s), bed = 26 + 34 * smooth(2.0, 10, s);
    this.composeLcdImage(hot, bed);
    const cx = LCD.w / 2, cy = LCD.h / 2;

    if (s < 0.15) {
      this.renderCells(() => 0);                               // negro
    } else if (s < 0.6) {
      // 1) Línea blanca de 2 puntos de alto: nace en el centro, se estira y se recoge.
      const half = Math.round(cx * smooth(0.15, 0.4, s) * (1 - smooth(0.45, 0.6, s))) + 1;
      this.renderCells((x, y) => ((y === cy - 1 || y === cy) && Math.abs(x + 0.5 - cx) <= half ? 1 : 0));
    } else if (s < 1.75) {
      // 2) Estrella de 4 puntas (|x|^½ + |y|^½ ≤ R^½) que se abre con borde blanco.
      const t = (s - 0.6) / 1.15;
      const R = 2 + 200 * t * t * t, Rb = R * 1.35 + 3;
      const sR = Math.sqrt(R), sRb = Math.sqrt(Rb);
      this.renderCells((x, y) => {
        const d = Math.sqrt(Math.abs(x + 0.5 - cx)) + Math.sqrt(Math.abs(y + 0.5 - cy));
        return d <= sR ? 2 : d <= sRb ? 1 : 0;
      });
    } else if (s < 1.88) {
      this.renderCells(() => 1);                               // destello: dos cuadros en blanco
    } else {
      this.renderCells(() => 2);                               // la imagen
    }
    this.lcdTex.needsUpdate = true;
    this.lcdState = booting ? 'boot' : 'run';
  }

  // --- Perilla: gira de a «clics» sobre su eje --------------------------------
  buildKnob() {
    const meshes = this.groups.lcdKnob || [];
    if (!meshes.length) return;
    const ref = meshes[0];
    ref.geometry.computeBoundingBox();
    const size = ref.geometry.boundingBox.getSize(new THREE.Vector3());
    // El eje es la medida distinta de las otras dos (es un cilindro).
    const d = [Math.abs(size.x - size.y) + Math.abs(size.x - size.z), Math.abs(size.y - size.x) + Math.abs(size.y - size.z), Math.abs(size.z - size.x) + Math.abs(size.z - size.y)];
    const k = d.indexOf(Math.max(...d));
    const axis = new THREE.Vector3().setComponent(k, 1).transformDirection(ref.matrixWorld);
    const center = boxOf([ref]).getCenter(new THREE.Vector3());
    this.knob = {
      axis, center,
      parts: meshes.map((m) => ({ m, base: m.matrixWorld.clone(), parentInv: m.parent.matrixWorld.clone().invert() })),
    };
  }

  animateKnob() {
    if (!this.knob) return;
    const w = this.w.lcd, t = this.clock.lcd;
    // Después del encendido: tres clics a un lado, pausa, tres de vuelta.
    const u = Math.max(0, t - 2.4) % 4;
    const steps = Math.min(3, Math.floor(u / 0.3)) - Math.min(3, Math.floor(Math.max(0, u - 2) / 0.3));
    const target = steps * (Math.PI / 10) * w;
    this.knob.a = damp(this.knob.a || 0, target, 0.05, this.lastDt || 0.016);
    const c = this.knob.center;
    const R = this.tmpM.makeTranslation(c.x, c.y, c.z)
      .multiply(this.tmpM2.makeRotationAxis(this.knob.axis, this.knob.a))
      .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
    for (const p of this.knob.parts) {
      const L = new THREE.Matrix4().multiplyMatrices(R, p.base).premultiply(p.parentInv);
      L.decompose(p.m.position, p.m.quaternion, p.m.scale);
    }
  }

  // --- microSD: la caja de control ya trae la ranura (y el USB) en su frente; aquí
  // solo se agrega la tarjeta, alineada con esa ranura.
  buildSd() {
    const box = boxOf(this.groups.controlBox || []);
    if (box.isEmpty()) return;
    const V = THREE.Vector3;
    // Ranura medida en la malla de la caja (cara frontal z = 2,495): x −2,29…−1,98,
    // y 0,79…0,83. Al lado está el USB (x −1,89…−1,73).
    const slotPos = new V(-2.135, 0.81, 2.495);
    const card = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.3), new THREE.MeshStandardMaterial({ color: '#1C1C22', roughness: 0.5 }));
    const label = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.004, 0.17), new THREE.MeshStandardMaterial({ color: PALETTE.accent, roughness: 0.5 }));
    label.position.set(0, 0.012, 0.05);
    body.castShadow = true;
    card.add(body, label);
    card.visible = false;
    this.scene.add(card);
    this.sd = { card, slotPos, zIn: slotPos.z - 0.15 + 0.035, zOut: slotPos.z + 0.55 };
    this.anchors.sdSlot = slotPos.clone();
  }

  animateSd() {
    if (!this.sd) return;
    const w = this.w.sd, sd = this.sd, card = sd.card;
    card.visible = w > 0.01;
    if (!card.visible) return;
    // Ciclo de 6 s: entra, clic (se hunde un poco), queda, clic, sale.
    const u = this.clock.sd % 6;
    const enter = smooth(0.3, 1.4, u) - smooth(4.0, 5.1, u);
    const push = (smooth(1.4, 1.55, u) - smooth(1.55, 1.75, u)) + (smooth(3.6, 3.75, u) - smooth(3.75, 3.95, u));
    const pop = smooth(3.8, 4.0, u) * (1 - smooth(4.0, 5.1, u)) * 0.12;
    const z = sd.zOut + (sd.zIn - sd.zOut) * enter - push * 0.04 + pop;
    card.position.set(sd.slotPos.x, sd.slotPos.y, z);
    card.scale.setScalar(Math.max(0.001, w));
  }

  animateExtras(dt, tl) {
    this.lastDt = dt;
    const fx = this.phases[this.phase]?.fx;
    for (const k of Object.keys(this.w)) {
      this.w[k] = damp(this.w[k], fx === k ? 1 : 0, 0.3, dt);
      if (fx === k) this.clock[k] += dt; else if (this.w[k] < 0.01) this.clock[k] = 0;
    }
    if (fx !== 'lcd') this.clock.lcd = 0; // la pantalla se vuelve a encender cada vez
    this.animateFlows(dt, tl);
    this.animateAir();
    this.animatePower();
    this.animateLcd();
    this.animateKnob();
    this.animateSd();
  }
}
