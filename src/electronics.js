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
    const pos = center.clone().addScaledVector(n, size.getComponent(axes[2]) * 0.5 + size.getComponent(axes[2]) * 0.08 + 1e-4);

    const canvas = document.createElement('canvas');
    canvas.width = OUT_W; canvas.height = OUT_H;
    this.lcdCtx = canvas.getContext('2d');
    this.lcdImg = document.createElement('canvas');
    this.lcdImg.width = OUT_W; this.lcdImg.height = OUT_H;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.lcdTex = tex;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    face.matrixAutoUpdate = false;
    face.matrix.makeBasis(u.multiplyScalar(W), v.multiplyScalar(H), n).setPosition(pos);
    m.add(face);
    this.lcdFace = face;
    m.updateMatrixWorld(true);
    this.anchors.lcdFace = new THREE.Vector3().setFromMatrixPosition(face.matrixWorld);
    this.lcdLast = -1;
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

    const o = this.lcdImg.getContext('2d');
    o.fillStyle = LCD.bg; o.fillRect(0, 0, OUT_W, OUT_H);
    const c = LCD.cell, g = c - 1;
    for (const [v, color] of [[0, LCD.off], [1, LCD.on]]) {
      o.fillStyle = color;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[y * W + x] === v) o.fillRect(x * c, y * c, g, g);
    }
  }

  drawLcdOff() {
    const ctx = this.lcdCtx;
    ctx.fillStyle = '#05060C'; ctx.fillRect(0, 0, OUT_W, OUT_H);
    this.lcdTex.needsUpdate = true;
  }

  // Estrella de 4 puntas (lados cóncavos), centrada.
  starPath(ctx, R) {
    const cx = OUT_W / 2, cy = OUT_H / 2, r = R * 0.12;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2, b = a + Math.PI / 4, c = a + Math.PI / 2;
      if (k === 0) ctx.moveTo(cx + Math.cos(a) * R, cy - Math.sin(a) * R);
      ctx.quadraticCurveTo(cx + Math.cos(b) * r, cy - Math.sin(b) * r, cx + Math.cos(c) * R, cy - Math.sin(c) * R);
    }
    ctx.closePath();
  }

  animateLcd(dt) {
    if (!this.lcdTex) return;
    const on = this.phases[this.phase]?.fx === 'lcd';
    if (!on) {
      if (this.lcdState !== 'off') { this.drawLcdOff(); this.lcdState = 'off'; }
      return;
    }
    const s = this.clock.lcd;
    const ctx = this.lcdCtx, W = OUT_W, H = OUT_H;
    const heat = smooth(2.2, 14, s);
    const hot = 26 + 174 * heat, bed = 26 + 34 * smooth(2.2, 10, s);
    const booting = s < 2.3;
    // Tras el encendido, la imagen se rehace unas 6 veces por segundo (temperaturas).
    if (!booting && s - this.lcdLast < 0.16 && this.lcdState === 'run') return;
    this.lcdLast = s;
    if (!booting || s > 0.55) this.composeLcdImage(hot, bed);

    ctx.save();
    ctx.fillStyle = '#05060C'; ctx.fillRect(0, 0, W, H);
    if (s < 0.15) {
      // negro
    } else if (s < 0.55) {
      // 1) Línea blanca: nace en el centro y se estira a lo ancho; luego se recoge.
      const grow = smooth(0.15, 0.4, s), shrink = smooth(0.42, 0.55, s);
      const lw = W * grow * (1 - shrink) + 6;
      ctx.shadowColor = '#fff'; ctx.shadowBlur = 18;
      ctx.fillStyle = '#fff';
      ctx.fillRect(W / 2 - lw / 2, H / 2 - 2, lw, 4);
    } else if (s < 1.8) {
      // 2) Estrella de 4 puntas: se abre desde el centro con borde blanco y revela la imagen.
      const t = (s - 0.55) / 1.25;
      const R = 10 + 760 * t * t * t;
      ctx.save(); this.starPath(ctx, R); ctx.clip(); ctx.drawImage(this.lcdImg, 0, 0); ctx.restore();
      this.starPath(ctx, R);
      ctx.shadowColor = '#fff'; ctx.shadowBlur = 16;
      ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round';
      ctx.stroke();
    } else {
      // 3) Imagen completa, con un destello que se apaga.
      ctx.drawImage(this.lcdImg, 0, 0);
      const flash = 1 - smooth(1.8, 2.3, s);
      if (flash > 0) { ctx.globalAlpha = flash * 0.55; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    }
    ctx.restore();
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
    const slotPos = new V(box.max.x - 1.5, box.min.y + (box.max.y - box.min.y) * 0.82, box.max.z);
    const card = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.3), new THREE.MeshStandardMaterial({ color: '#1C1C22', roughness: 0.5 }));
    const label = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.004, 0.17), new THREE.MeshStandardMaterial({ color: PALETTE.accent, roughness: 0.5 }));
    label.position.set(0, 0.012, 0.05);
    body.castShadow = true;
    card.add(body, label);
    card.visible = false;
    this.scene.add(card);
    this.sd = { card, slotPos, zIn: slotPos.z - 0.15 + 0.07, zOut: slotPos.z + 0.55 };
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
    this.animateLcd(dt);
    this.animateKnob();
    this.animateSd();
  }
}
