// Punto 03 / Cama caliente y ruedas de nivelación. Misma escena que los otros
// puntos de la Ender, con tres efectos propios, uno por fase:
//   heat  — la placa se calienta: líneas de calor suben y se enfrían.
//   peel  — la lámina magnética se levanta, se dobla y la pieza se suelta.
//   level — la rueda frontal derecha gira: esa esquina sube y baja sobre su
//           resorte (los resortes no vienen en el modelo; se agregan aquí).
// Todo es opaco: lo que aparece o desaparece lo hace escalando, no con transparencia.
import * as THREE from 'three';
import { EnderDemo } from './ender.js';
import { PALETTE, damp } from './shared.js';

const HEAT_N = 120;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const boxOf = (meshes) => meshes.reduce((b, m) => b.expandByObject(m), new THREE.Box3());

// Resorte de compresión: hélice de altura 1 (se estira con scale.y).
class Helix extends THREE.Curve {
  constructor(r, turns) { super(); this.r = r; this.turns = turns; }
  getPoint(t, out = new THREE.Vector3()) {
    const a = t * this.turns * Math.PI * 2;
    return out.set(Math.cos(a) * this.r, t, Math.sin(a) * this.r);
  }
}

export class EnderBedDemo extends EnderDemo {
  constructor() {
    super('bed');
    this.w = { heat: 0, peel: 0, level: 0 };   // peso de cada efecto (entra y sale suave)
    this.clock = { heat: 0, peel: 0, level: 0 };
  }

  buildExtras() {
    const G = this.groups;
    const plateBox = boxOf(G.buildPlate || []);
    const mountBox = boxOf(G.bedMount || []);
    const matBox = boxOf(G.mat || []);
    if (plateBox.isEmpty() || mountBox.isEmpty() || matBox.isEmpty()) return;
    this.plateBox = plateBox;
    const V = THREE.Vector3;

    // --- Lámina: se reemplaza por una propia con subdivisiones para poder doblarla.
    const matSize = matBox.getSize(new V());
    this.matSize = matSize;
    this.matCenter = matBox.getCenter(new V());
    this.matCenter.y = matBox.max.y - 0.012;
    const matGeo = new THREE.BoxGeometry(matSize.x, 0.024, matSize.z, 64, 1, 1);
    this.matRest = matGeo.attributes.position.array.slice();
    const orig = G.mat[0];
    const mat = new THREE.Mesh(matGeo, new THREE.MeshStandardMaterial({ color: orig.userData.base.clone(), roughness: 0.55 }));
    mat.userData.base = orig.userData.base;
    mat.castShadow = mat.receiveShadow = true;
    mat.matrixAutoUpdate = false;
    G.mat.forEach((m) => { m.visible = false; });
    this.meshes = this.meshes.filter((m) => !G.mat.includes(m));
    this.meshes.push(mat);
    G.mat = [mat];
    this.scene.add(mat);
    this.matMesh = mat;
    this.matK = -1; // curvatura dibujada (para no recalcular si no cambia)

    // Pieza impresa sobre la lámina: una pirámide escalonada (la del punto 01).
    const piece = new THREE.Group();
    const pm = new THREE.MeshStandardMaterial({ color: PALETTE.paper, roughness: 0.5 });
    [[0.62, 0.0], [0.42, 0.12], [0.22, 0.24]].forEach(([s, y]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(s, 0.12, s), pm);
      b.position.y = y + 0.06;
      b.castShadow = true;
      piece.add(b);
    });
    piece.matrixAutoUpdate = false;
    piece.visible = false;
    this.scene.add(piece);
    this.piece = piece;
    this.pieceLocal = new V(matSize.x * 0.18, 0.012, matSize.z * 0.08);

    // --- Resortes: uno por tornillo, entre el carro y la placa.
    const h0 = plateBox.min.y - mountBox.max.y;
    const springGeo = new THREE.TubeGeometry(new Helix(0.11, 6), 140, 0.014, 6, false);
    const springBase = new THREE.Color(PALETTE.paperShade);
    this.springs = [];
    G.springs = [];
    for (const screw of G.bedScrews || []) {
      const c = new THREE.Box3().setFromObject(screw).getCenter(new V());
      const s = new THREE.Mesh(springGeo, new THREE.MeshStandardMaterial({ color: springBase.clone(), roughness: 0.4 }));
      s.userData.base = springBase;
      s.position.set(c.x, mountBox.max.y, c.z);
      s.scale.y = h0;
      s.castShadow = true;
      this.scene.add(s);
      this.meshes.push(s);
      G.springs.push(s);
      this.springs.push({ mesh: s, top: new V(c.x, plateBox.min.y, c.z), h0 });
    }

    // --- Nivelación: la esquina de la rueda frontal derecha gira sobre la diagonal.
    const knob = (G.knobFront || [])[0];
    if (knob && this.springs.length) {
      const kc = new THREE.Box3().setFromObject(knob).getCenter(new V());
      this.knob = { mesh: knob, center: kc, base: knob.matrixWorld.clone(), parentInv: knob.parent.matrixWorld.clone().invert() };
      const corner = new V(kc.x, plateBox.min.y, kc.z);
      const far = this.springs.reduce((a, s) => (s.top.distanceTo(corner) > a.distanceTo(corner) ? s.top : a), corner);
      const oc = corner.clone().sub(far).setY(0);
      this.tilt = { pivot: far.clone(), axis: new V(0, 1, 0).cross(oc).normalize(), span: oc.length() };
      // Signo: un giro positivo debe subir la esquina.
      const test = corner.clone().sub(far).applyAxisAngle(this.tilt.axis, 0.01);
      if (test.y < corner.y - far.y) this.tilt.axis.negate();
      const front = this.springs.reduce((a, s) => (s.top.distanceTo(corner) < a.top.distanceTo(corner) ? s : a));
      this.anchors.springFront = new V(front.top.x, mountBox.max.y + h0 * 0.55, front.top.z);
    }
    // Lo que se inclina con la placa: placa, tornillos y lámina.
    this.tilted = [...(G.buildPlate || []), ...(G.bedScrews || [])].map((m) => ({
      m, base: m.matrixWorld.clone(), parentInv: m.parent.matrixWorld.clone().invert(),
    }));

    // --- Calor: barras que suben desde la placa, calientes abajo, frías arriba.
    const heat = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), HEAT_N);
    heat.frustumCulled = false;
    heat.visible = false;
    this.scene.add(heat);
    this.heat = heat;
    this.heatSeed = Array.from({ length: HEAT_N }, (_, i) => ({
      x: plateBox.min.x + 0.2 + ((i * 0.618034) % 1) * (plateBox.max.x - plateBox.min.x - 0.4),
      z: plateBox.min.z + 0.2 + ((i * 0.414214 + 0.3) % 1) * (plateBox.max.z - plateBox.min.z - 0.4),
      o: (i * 0.7548777) % 1,
      v: 0.75 + ((i * 0.5698403) % 1) * 0.5,
    }));
    this.hot = new THREE.Color(PALETTE.accent);
    this.cool = new THREE.Color(PALETTE.peach);

    // Anclas que se mueven (las etiquetas las siguen) y foco de la fase de la lámina.
    this.anchors.piece = new V();
    this.anchors.matEdge = new V();
    this.anchors.matLift = this.matCenter.clone().add(new V(0, 0.55, 0.5));

    this.M = new THREE.Matrix4();
    this.tmpM = new THREE.Matrix4();
    this.tmpM2 = new THREE.Matrix4();
    this.tmpV = new V();
    this.tmpQ = new THREE.Quaternion();
    this.tmpS = new V(1, 1, 1);
    this.tmpC = new THREE.Color();
    this.animateExtras(0, 0);
  }

  animateExtras(dt) {
    if (!this.matMesh) return;
    const fx = this.phases[this.phase]?.fx;
    for (const k of Object.keys(this.w)) {
      this.w[k] = damp(this.w[k], fx === k ? 1 : 0, 0.35, dt);
      // Cada efecto empieza desde cero al entrar en su fase.
      if (fx === k) this.clock[k] += dt; else if (this.w[k] < 0.01) this.clock[k] = 0;
    }
    this.animateLevel();
    this.animatePeel();
    this.animateHeat();
  }

  // Esquina que sube y baja: la placa gira sobre la esquina opuesta.
  animateLevel() {
    const M = this.M.identity();
    let dy = 0;
    if (this.tilt) {
      dy = Math.sin(this.clock.level * 1.1) * 0.13 * this.w.level;
      const a = dy / this.tilt.span;
      const p = this.tilt.pivot;
      M.makeTranslation(p.x, p.y, p.z)
        .multiply(this.tmpM.makeRotationAxis(this.tilt.axis, a))
        .multiply(this.tmpM2.makeTranslation(-p.x, -p.y, -p.z));
    }
    for (const t of this.tilted) {
      this.tmpM.multiplyMatrices(M, t.base).premultiply(t.parentInv);
      this.tmpM.decompose(t.m.position, t.m.quaternion, t.m.scale);
    }
    for (const s of this.springs) {
      this.tmpV.copy(s.top).applyMatrix4(M);
      s.mesh.scale.y = s.h0 + (this.tmpV.y - s.top.y);
    }
    if (this.knob) {
      // Rueda: gira en su sitio (el tornillo sube o baja dentro de ella).
      const k = this.knob, c = k.center;
      this.tmpM.makeTranslation(c.x, c.y, c.z)
        .multiply(this.tmpM2.makeRotationY(-dy * 28))
        .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z))
        .multiply(k.base)
        .premultiply(k.parentInv);
      this.tmpM.decompose(k.mesh.position, k.mesh.quaternion, k.mesh.scale);
    }
  }

  // Lámina: se levanta, se arquea y la pieza salta; luego vuelve. Ciclo de 7 s.
  animatePeel() {
    const w = this.w.peel;
    const u = this.clock.peel % 7;
    const lift = (smooth(0.2, 1.4, u) - smooth(5.6, 6.8, u)) * w;
    const bend = (smooth(1.5, 2.5, u) - smooth(4.3, 5.3, u)) * w;
    const pop = (smooth(2.3, 2.8, u) - smooth(4.0, 4.6, u)) * w;
    const k = 0.3 * bend;

    // Curvatura: cada vértice gira alrededor de un centro bajo la lámina (arco convexo).
    if (Math.abs(k - this.matK) > 1e-4) {
      const pos = this.matMesh.geometry.attributes.position;
      const rest = this.matRest;
      for (let i = 0; i < pos.count; i++) {
        const x = rest[i * 3], y = rest[i * 3 + 1];
        if (k < 1e-4) { pos.array[i * 3] = x; pos.array[i * 3 + 1] = y; continue; }
        const R = 1 / k, th = x * k, r = R + y;
        pos.array[i * 3] = Math.sin(th) * r;
        pos.array[i * 3 + 1] = Math.cos(th) * r - R;
      }
      pos.needsUpdate = true;
      this.matMesh.geometry.computeVertexNormals();
      this.matMesh.geometry.computeBoundingSphere();
      this.matK = k;
    }
    // Pose de la lámina: arriba y al frente, inclinada hacia la cámara; sigue la
    // inclinación de la placa (fase de nivelación).
    const c = this.matCenter;
    this.tmpQ.setFromAxisAngle(this.tmpV.set(1, 0, 0), 0.32 * lift);
    this.tmpM.compose(this.tmpV.set(c.x, c.y + 1.1 * lift, c.z + 0.8 * lift), this.tmpQ, this.tmpS.set(1, 1, 1));
    this.matMesh.matrix.multiplyMatrices(this.M, this.tmpM);
    this.matMesh.matrixWorldNeedsUpdate = true;

    // Pieza: va con la superficie pero casi no rota (es rígida) → el arco se separa
    // por debajo; en el punto más curvo salta un poco.
    const pl = this.pieceLocal;
    const R = k > 1e-4 ? 1 / k : 0, th = pl.x * k, r = R + pl.y;
    const sx = k > 1e-4 ? Math.sin(th) * r : pl.x;
    const sy = k > 1e-4 ? Math.cos(th) * r - R : pl.y;
    this.tmpQ.setFromAxisAngle(this.tmpV.set(0, 0, 1), -th * 0.3 + pop * 0.12);
    this.tmpM2.compose(this.tmpV.set(sx + pop * 0.12, sy + pop * 0.32, pl.z), this.tmpQ, this.tmpS.setScalar(Math.max(0.001, w)));
    this.piece.matrix.multiplyMatrices(this.matMesh.matrix, this.tmpM2);
    this.piece.matrixWorldNeedsUpdate = true;
    this.piece.visible = w > 0.01;
    this.anchors.piece.set(0, 0.42, 0).applyMatrix4(this.piece.matrix);
    this.anchors.matEdge.set(-this.matSize.x * 0.36, 0.02, this.matSize.z * 0.36).applyMatrix4(this.matMesh.matrix);
  }

  animateHeat() {
    const w = this.w.heat;
    this.heat.visible = w > 0.01;
    if (!this.heat.visible) return;
    const top = this.plateBox.max.y + 0.02, H = 1.5, t = this.clock.heat;
    for (let i = 0; i < HEAT_N; i++) {
      const s = this.heatSeed[i];
      const f = (s.o + t * 0.32 * s.v) % 1;
      const sway = Math.sin(t * 2.2 + i) * 0.06 * f;
      const sc = (1 - f) * Math.min(1, f * 6) * w; // nace, sube y se apaga encogiéndose
      this.tmpM.compose(this.tmpV.set(s.x + sway, top + 0.11 + f * H, s.z), this.tmpQ.identity(), this.tmpS.set(sc, sc, sc));
      this.heat.setMatrixAt(i, this.tmpM);
      this.heat.setColorAt(i, this.tmpC.copy(this.hot).lerp(this.cool, f));
    }
    this.heat.instanceMatrix.needsUpdate = true;
    this.heat.instanceColor.needsUpdate = true;
  }
}
