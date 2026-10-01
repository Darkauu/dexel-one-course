// Simulación del motor paso a paso: un eje visto de frente con su cabezal, la
// polea dentada, la correa y una regla en milímetros. «Mover 1 mm» da 80
// micropasos; la velocidad va de «paso a paso visible» a «velocidad real».
// Con la correa floja, el contador llega igual a 80 pero el cabezal avanza menos,
// y el error se acumula movimiento tras movimiento.
// La mueve el reloj único del deck (update(dt)); no tiene bucle propio.

const STEPS_PER_MM = 80;
const PX_PER_MM = 200;         // escala exagerada: un micropaso son 2,5 px, se ve saltar
const SLIP = 0.72;             // con correa floja, avanza el 72 % de lo que cuenta
const X0 = 150, X1 = 690;      // tramo útil del eje (px)
const VIEW_MM = (X1 - X0) / PX_PER_MM;
const PULLEY = { x: 72, y: 156, r: 28 };
const IDLER = { x: 718, y: 156, r: 22 };
const SVG_NS = 'http://www.w3.org/2000/svg';

const fmt = (mm) => mm.toFixed(2).replace('.', ',');

export class StepSim {
  constructor(root) {
    this.root = root;
    this.svg = root.querySelector('svg.sim-art');
    this.counter = root.querySelector('[data-sim-count]');
    this.moves = root.querySelector('[data-sim-moves]');
    this.believed = root.querySelector('[data-sim-believed]');
    this.actual = root.querySelector('[data-sim-actual]');
    this.note = root.querySelector('[data-sim-note]');
    this.slackBtn = root.querySelector('[data-sim-action="slack"]');
    this.build();
    this.setSpeed(100);
    this.reset();
  }

  // --- estado ---------------------------------------------------------------
  reset() {
    this.queue = 0;          // micropasos pendientes
    this.inMove = 0;         // micropasos del movimiento en curso (0..80)
    this.moveCount = 0;
    this.cmd = 0;            // micropasos contados por la placa
    this.real = 0;           // micropasos que de verdad avanzó el cabezal
    this.slipAcc = 0;
    this.acc = 0;            // tiempo acumulado para el próximo micropaso
    this.view = 0;           // inicio (mm) del tramo visible de la regla
    this.viewTarget = 0;
    this.draw(true);
  }

  move() {
    this.queue += STEPS_PER_MM;
  }

  toggleSlack() {
    this.slack = !this.slack;
    this.slackBtn.setAttribute('aria-pressed', this.slack ? 'true' : 'false');
    this.slackBtn.classList.toggle('is-on', this.slack);
    this.root.classList.toggle('is-slack', this.slack);
    this.draw(true);
  }

  // 0 → 2 micropasos por segundo (se ven los saltos); 100 → ~800 por segundo (suave).
  setSpeed(v) {
    this.speed = 2 * Math.pow(400, v / 100);
  }

  step() {
    if (this.inMove >= STEPS_PER_MM) { this.inMove = 0; }
    if (this.inMove === 0) this.moveCount++;
    this.inMove++;
    this.queue--;
    this.cmd++;
    // Correa floja: el motor gira pero la correa patina; algunos pasos no mueven nada.
    if (this.slack) {
      this.slipAcc += SLIP;
      if (this.slipAcc >= 1) { this.slipAcc -= 1; this.real++; }
    } else {
      this.real++;
    }
  }

  update(dt) {
    if (this.queue > 0) {
      this.acc += dt * this.speed;
      let n = Math.min(this.queue, Math.floor(this.acc));
      this.acc -= n;
      while (n-- > 0) this.step();
    } else {
      this.acc = 0;
    }
    // La regla avanza de a 1 mm cuando la posición que cree la placa se acerca al
    // borde derecho, así el cabezal y la marca «cree» siempre quedan a la vista.
    const believedMm = this.cmd / STEPS_PER_MM;
    while (believedMm > this.viewTarget + VIEW_MM - 0.35) this.viewTarget += 1;
    this.view += (this.viewTarget - this.view) * (1 - Math.exp(-dt / 0.25));
    this.draw(false);
  }

  // --- dibujo -----------------------------------------------------------------
  el(tag, attrs, parent = this.svg) {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    parent.appendChild(e);
    return e;
  }

  build() {
    const s = this.svg;
    s.innerHTML = '';
    // Perfil del eje (fondo) y soportes.
    this.el('rect', { x: 40, y: 84, width: 700, height: 26, fill: 'var(--peach-shade)' });
    this.el('rect', { x: 40, y: 94, width: 700, height: 6, fill: 'var(--ink-deep)', opacity: 1 });
    // Motor, detrás de la polea motriz.
    this.el('rect', { x: 34, y: 118, width: 76, height: 76, fill: 'var(--peach)' });
    this.el('text', { x: 72, y: 212, 'text-anchor': 'middle', class: 'sim-label' }).textContent = 'MOTOR';
    // Correa: tramo superior (arrastra el cabezal) e inferior (vuelve).
    this.beltTop = this.el('line', { x1: PULLEY.x, y1: PULLEY.y - PULLEY.r, x2: IDLER.x, y2: IDLER.y - IDLER.r, class: 'sim-belt' });
    this.beltBottom = this.el('path', { d: '', class: 'sim-belt', fill: 'none' });
    // Polea motriz con dientes y polea loca.
    this.pulley = this.el('g', {});
    this.el('circle', { cx: 0, cy: 0, r: PULLEY.r, fill: 'var(--paper-shade)' }, this.pulley);
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * 360;
      this.el('rect', { x: -3, y: -PULLEY.r - 5, width: 6, height: 7, fill: 'var(--paper-shade)', transform: `rotate(${a})` }, this.pulley);
    }
    this.el('circle', { cx: 0, cy: 0, r: 7, fill: 'var(--ink-deep)' }, this.pulley);
    this.el('rect', { x: -2, y: -PULLEY.r + 4, width: 4, height: 12, fill: 'var(--ink-deep)' }, this.pulley); // marca de giro
    this.el('circle', { cx: IDLER.x, cy: IDLER.y, r: IDLER.r, fill: 'var(--paper-shade)' });
    this.el('circle', { cx: IDLER.x, cy: IDLER.y, r: 6, fill: 'var(--ink-deep)' });
    // Regla.
    this.ruler = this.el('g', {});
    // Marcadores: dónde cree estar la placa (discontinuo) y dónde está de verdad.
    this.ghost = this.el('g', { class: 'sim-ghost' });
    this.el('line', { x1: 0, y1: 118, x2: 0, y2: 236, 'stroke-dasharray': '6 5' }, this.ghost);
    this.el('text', { x: 6, y: 228, class: 'sim-label sim-label--ghost' }, this.ghost).textContent = 'CREE';
    // Cabezal: carro sujeto a la correa, bloque calefactor y boquilla.
    this.head = this.el('g', {});
    this.el('rect', { x: -38, y: 104, width: 76, height: 50, fill: 'var(--paper)' }, this.head);
    this.el('rect', { x: -26, y: 154, width: 52, height: 30, fill: 'var(--peach)' }, this.head);
    this.el('path', { d: 'M -9 184 L 9 184 L 0 198 Z', fill: 'var(--paper)' }, this.head);
    this.el('line', { x1: 0, y1: 198, x2: 0, y2: 262, class: 'sim-real' }, this.head);
  }

  drawRuler() {
    const g = this.ruler;
    g.innerHTML = '';
    this.el('line', { x1: 40, y1: 236, x2: 740, y2: 236, class: 'sim-tick' }, g);
    const first = Math.floor(this.view * 10) / 10 - 0.5;
    for (let t = Math.max(0, first); t <= this.view + VIEW_MM + 0.5; t = Math.round((t + 0.1) * 10) / 10) {
      const x = X0 + (t - this.view) * PX_PER_MM;
      if (x < 40 || x > 740) continue;
      const whole = Math.abs(t - Math.round(t)) < 1e-6;
      const half = !whole && Math.abs(t * 2 - Math.round(t * 2)) < 1e-6;
      this.el('line', { x1: x, y1: 236, x2: x, y2: 236 + (whole ? 22 : half ? 14 : 8), class: 'sim-tick' }, g);
      if (whole) this.el('text', { x: x + 4, y: 272, class: 'sim-label' }, g).textContent = `${Math.round(t)} mm`;
    }
  }

  draw(force) {
    const realMm = this.real / STEPS_PER_MM;
    const believedMm = this.cmd / STEPS_PER_MM;
    const viewKey = Math.round(this.view * 1000);
    if (force || viewKey !== this.lastView) { this.drawRuler(); this.lastView = viewKey; }

    const hx = X0 + (realMm - this.view) * PX_PER_MM;
    const gx = X0 + (believedMm - this.view) * PX_PER_MM;
    this.head.setAttribute('transform', `translate(${hx.toFixed(1)} 0)`);
    this.ghost.setAttribute('transform', `translate(${gx.toFixed(1)} 0)`);
    this.ghost.style.display = Math.abs(gx - hx) > 1 ? '' : 'none';

    // La polea gira con lo que CUENTA la placa; la correa avanza con lo REAL.
    const pulleyDeg = (believedMm * PX_PER_MM / PULLEY.r) * (180 / Math.PI);
    this.pulley.setAttribute('transform', `translate(${PULLEY.x} ${PULLEY.y}) rotate(${pulleyDeg.toFixed(2)})`);
    const beltPx = realMm * PX_PER_MM;
    this.beltTop.style.strokeDashoffset = (-beltPx).toFixed(1);
    const sag = this.slack ? 26 : 0;
    const yb = PULLEY.y + PULLEY.r;
    this.beltBottom.setAttribute('d', `M ${PULLEY.x} ${yb} Q ${(PULLEY.x + IDLER.x) / 2} ${yb + sag * 2} ${IDLER.x} ${IDLER.y + IDLER.r}`);
    this.beltBottom.style.strokeDashoffset = beltPx.toFixed(1);

    const n = this.inMove;
    this.counter.textContent = String(n);
    this.moves.textContent = String(this.moveCount);
    this.believed.textContent = `${fmt(believedMm)} mm`;
    this.actual.textContent = `${fmt(realMm)} mm`;
    const diff = believedMm - realMm;
    const moving = this.queue > 0;
    this.note.textContent = diff > 0.004
      ? `Diferencia: ${fmt(diff)} mm. La placa no lo sabe: lo próximo que imprima saldrá corrido.`
      : moving ? 'Contando pulsos: cada uno es un micropaso, todos del mismo tamaño.'
        : this.moveCount ? 'La placa contó 80 y dio por hecho que el cabezal llegó. Esta vez, llegó.'
          : 'Pulsa «Mover 1 mm» y mira el contador. Luego baja la velocidad.';
    this.root.classList.toggle('has-error', diff > 0.004);
  }
}
