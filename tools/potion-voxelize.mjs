// Uso: node tools/potion-voxelize.mjs original.glb src/assets/potion.glb [0.5]
// Reconstruye la poción como bloques exactos: planos de caras grandes → celdas no
// uniformes → dentro/fuera por rayos en los 3 ejes → solo caras exteriores, fusionadas.
import fs from 'node:fs';
const [src, dst] = process.argv.slice(2);
const b = fs.readFileSync(src);
const jl = b.readUInt32LE(12); const j = JSON.parse(b.slice(20, 20 + jl).toString()); const bin = 20 + jl + 8;
const read = (i) => { const a = j.accessors[i], bv = j.bufferViews[a.bufferView]; const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType]; const n = { SCALAR: 1, VEC3: 3 }[a.type];
  const off = bin + (bv.byteOffset || 0) + (a.byteOffset || 0); return new T(b.buffer.slice(b.byteOffset + off, b.byteOffset + off + a.count * n * T.BYTES_PER_ELEMENT)); };
const P = read(j.meshes[0].primitives[0].attributes.POSITION);
const tris = []; // [ax,ay,az,bx,...,part]
j.meshes[0].primitives.forEach((prim, part) => {
  const I = read(prim.indices);
  for (let t = 0; t < I.length; t += 3) {
    const v = [I[t], I[t + 1], I[t + 2]];
    if (v.some((k) => P[k * 3 + 1] < 50)) continue; // la línea suelta
    tris.push([...v.flatMap((k) => [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]]), part]);
  }
});
console.log('triángulos de la poción', tris.length);
// 1) Retícula uniforme de 0,5 sobre la caja de la poción (el relieve de las rayas,
//    ~0,2, queda por debajo de la celda y desaparece; los bordes de bloque siguen rectos).
const U = Number(process.argv[4] || 0.5);
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (const t of tris) for (let k = 0; k < 9; k++) { lo[k % 3] = Math.min(lo[k % 3], t[k]); hi[k % 3] = Math.max(hi[k % 3], t[k]); }
const planes = [0, 1, 2].map((ax) => { const n = Math.ceil((hi[ax] - lo[ax]) / U); return Array.from({ length: n + 1 }, (_, i) => lo[ax] + i * U); });
console.log('retícula', planes.map((p) => p.length - 1).join(' × '));
// 2) Celdas y prueba dentro/fuera: un rayo por eje que pasa por el centro de la celda
//    debe tener superficie a ambos lados en los 3 ejes.
const mids = planes.map((p) => p.slice(0, -1).map((c, i) => (c + p[i + 1]) / 2));
const buckets = [0, 1, 2].map((ax) => {
  const a1 = (ax + 1) % 3, a2 = (ax + 2) % 3, n1 = planes[a1].length, n2 = planes[a2].length, m = new Map();
  tris.forEach((t, ti) => {
    const us = [t[a1], t[a1 + 3], t[a1 + 6]], vs = [t[a2], t[a2 + 3], t[a2 + 6]];
    const i0 = Math.max(0, Math.floor((Math.min(...us) - lo[a1]) / U)), i1 = Math.min(n1, Math.ceil((Math.max(...us) - lo[a1]) / U));
    const k0 = Math.max(0, Math.floor((Math.min(...vs) - lo[a2]) / U)), k1 = Math.min(n2, Math.ceil((Math.max(...vs) - lo[a2]) / U));
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) { const key = i * 4096 + k; let l = m.get(key); if (!l) m.set(key, (l = [])); l.push(ti); }
  });
  return m;
});
const hitsAlong = (ax, u, v, i, k) => {
  const a1 = (ax + 1) % 3, a2 = (ax + 2) % 3, out = [];
  for (const ti of buckets[ax].get(i * 4096 + k) || []) {
    const t = tris[ti];
    const x0 = t[a1], y0 = t[a2], x1 = t[a1 + 3], y1 = t[a2 + 3], x2 = t[a1 + 6], y2 = t[a2 + 6];
    const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2); if (Math.abs(d) < 1e-12) continue;
    const l0 = ((y1 - y2) * (u - x2) + (x2 - x1) * (v - y2)) / d, l1 = ((y2 - y0) * (u - x2) + (x0 - x2) * (v - y2)) / d, l2 = 1 - l0 - l1;
    if (l0 < 0 || l1 < 0 || l2 < 0) continue;
    out.push(l0 * t[ax] + l1 * t[ax + 3] + l2 * t[ax + 6]);
  }
  return out.sort((a, b) => a - b);
};
const [NX, NY, NZ] = mids.map((m) => m.length);
const inside = new Uint8Array(NX * NY * NZ).fill(1);
const id = (x, y, z) => (z * NY + y) * NX + x;
for (let ax = 0; ax < 3; ax++) {
  const a1 = (ax + 1) % 3, a2 = (ax + 2) % 3;
  for (let i = 0; i < mids[a1].length; i++) for (let k = 0; k < mids[a2].length; k++) {
    const h = hitsAlong(ax, mids[a1][i], mids[a2][k], i, k);
    for (let m = 0; m < mids[ax].length; m++) {
      const c = mids[ax][m];
      const ok = h.length && h[0] < c && h[h.length - 1] > c;
      const idx = [0, 0, 0]; idx[ax] = m; idx[a1] = i; idx[a2] = k;
      if (!ok) inside[id(idx[0], idx[1], idx[2])] = 0;
    }
  }
}
console.log('celdas', NX, NY, NZ, 'llenas', inside.reduce((s, v) => s + v, 0));
// Parte (cuerpo / tapón) de cada celda: la del triángulo más cercano a su centro, aproximada
// por la caja del tapón en el original.
const capBox = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
for (const t of tris) if (t[9] === 1) for (let k = 0; k < 9; k++) { capBox[k % 3] = Math.min(capBox[k % 3], t[k]); capBox[3 + (k % 3)] = Math.max(capBox[3 + (k % 3)], t[k]); }
// 3) Caras exteriores, fusionadas por fila (rectángulos en cada plano).
const pos = [[], []], idxs = [[], []];
const quad = (part, a, b, c, d) => { const p = pos[part], n = p.length / 3; p.push(...a, ...b, ...c, ...d); idxs[part].push(n, n + 1, n + 2, n, n + 2, n + 3); };
const filled = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < NX && y < NY && z < NZ && inside[id(x, y, z)];
const partOf = (x, y, z) => { const c = [mids[0][x], mids[1][y], mids[2][z]]; return c.every((v, k) => v >= capBox[k] - 0.01 && v <= capBox[3 + k] + 0.01) ? 1 : 0; };
const D = [NX, NY, NZ];
for (let ax = 0; ax < 3; ax++) for (const s of [-1, 1]) {
  const a1 = (ax + 1) % 3, a2 = (ax + 2) % 3;
  for (let m = 0; m < D[ax]; m++) {
    // máscara 2D de caras visibles en esta capa, con la parte como valor (+1)
    const mask = new Int8Array(D[a1] * D[a2]).fill(-1);
    for (let i = 0; i < D[a1]; i++) for (let k = 0; k < D[a2]; k++) {
      const c = [0, 0, 0]; c[ax] = m; c[a1] = i; c[a2] = k;
      if (!filled(...c)) continue;
      const nb = [...c]; nb[ax] += s;
      if (filled(...nb)) continue;
      mask[k * D[a1] + i] = partOf(...c);
    }
    // fusión voraz de rectángulos del mismo valor
    for (let k = 0; k < D[a2]; k++) for (let i = 0; i < D[a1];) {
      const v = mask[k * D[a1] + i]; if (v < 0) { i++; continue; }
      let w = 1; while (i + w < D[a1] && mask[k * D[a1] + i + w] === v) w++;
      let h = 1; grow: while (k + h < D[a2]) { for (let q = 0; q < w; q++) if (mask[(k + h) * D[a1] + i + q] !== v) break grow; h++; }
      for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) mask[(k + r) * D[a1] + i + q] = -1;
      const plane = planes[ax][s > 0 ? m + 1 : m];
      const u0 = planes[a1][i], u1 = planes[a1][i + w], v0 = planes[a2][k], v1 = planes[a2][k + h];
      const P3 = (u, v) => { const p = [0, 0, 0]; p[ax] = plane; p[a1] = u; p[a2] = v; return p; };
      if (s > 0) quad(v, P3(u0, v0), P3(u1, v0), P3(u1, v1), P3(u0, v1)); else quad(v, P3(u0, v0), P3(u0, v1), P3(u1, v1), P3(u1, v0));
      i += w;
    }
  }
}
console.log('triángulos finales', idxs[0].length / 3, '+', idxs[1].length / 3);
// 4) GLB
const chunks = [], views = [], accs = []; let off = 0;
const push = (arr, target) => { const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); const pad = (4 - (buf.length % 4)) % 4; chunks.push(buf, Buffer.alloc(pad)); views.push({ buffer: 0, byteOffset: off, byteLength: buf.length, target }); off += buf.length + pad; return views.length - 1; };
const meshes = [0, 1].map((k) => {
  const pf = new Float32Array(pos[k]); const mn = [0, 1, 2].map((c) => Math.min(...pf.filter((_, i) => i % 3 === c))); const mx = [0, 1, 2].map((c) => Math.max(...pf.filter((_, i) => i % 3 === c)));
  const vp = push(pf, 34962); accs.push({ bufferView: vp, componentType: 5126, count: pf.length / 3, type: 'VEC3', min: mn, max: mx });
  const vi = push(new Uint16Array(idxs[k]), 34963); accs.push({ bufferView: vi, componentType: 5123, count: idxs[k].length, type: 'SCALAR' });
  return { name: k === 0 ? 'cuerpo' : 'tapon', primitives: [{ attributes: { POSITION: accs.length - 2 }, indices: accs.length - 1 }] };
});
const gltf = { asset: { version: '2.0', generator: 'dexel potion voxelize' }, scene: 0, scenes: [{ nodes: [0, 1] }], nodes: meshes.map((m, k) => ({ name: m.name, mesh: k })), meshes, accessors: accs, bufferViews: views, buffers: [{ byteLength: off }] };
let js = Buffer.from(JSON.stringify(gltf)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const body = Buffer.concat(chunks);
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + body.length, 8);
const c1 = Buffer.alloc(8); c1.writeUInt32LE(js.length, 0); c1.writeUInt32LE(0x4e4f534a, 4);
const c2 = Buffer.alloc(8); c2.writeUInt32LE(body.length, 0); c2.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(dst, Buffer.concat([head, c1, js, c2, body]));
console.log('escrito', dst, fs.statSync(dst).size, 'bytes');
