// Deck: un reloj, un manejador de entrada, un contexto WebGL.
// Todo el estado visual es función pura de (diapositiva, paso) + tiempo desde que se entró.
import { damp } from './shared.js';
import { StepSim } from './stepsim.js';
import { FLOW_PERIOD, FLOW_STEP } from './flow.js';

const html = document.documentElement;
const params = new URLSearchParams(location.search);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- deck
const slides = [...document.querySelectorAll('.slide')];
const state = { slide: 0, step: 0, enteredAt: 0 };
const pad = (n) => String(n).padStart(2, '0');
const stepsOf = (el) => Math.max(1, parseInt(el.dataset.steps || '1', 10));

function readHash() {
  const m = location.hash.match(/(\d+)/);
  if (!m) return;
  state.slide = Math.min(slides.length - 1, Math.max(0, parseInt(m[1], 10) - 1));
  state.step = 0;
}

function render() {
  slides.forEach((el, i) => {
    const current = i === state.slide;
    el.classList.toggle('is-current', current);
    el.setAttribute('aria-hidden', current ? 'false' : 'true');
    if (!current) return;
    el.querySelectorAll('[data-build]').forEach((b) => { b.hidden = parseInt(b.dataset.build, 10) > state.step; });
    // Fases: cada bloque declara en qué pasos se ve; los botones marcan el activo.
    el.dataset.step = String(state.step);
    el.querySelectorAll('[data-phase]').forEach((b) => { b.hidden = !b.dataset.phase.split(' ').includes(String(state.step)); });
    el.querySelectorAll('[data-step-go]').forEach((b) => {
      const on = b.dataset.stepGo === String(state.step);
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    // Contador por sección: «01 / 02» dentro de la sección actual, no del deck entero.
    const counter = el.querySelector('[data-counter]');
    if (counter) {
      const same = slides.filter((x) => x.dataset.section === el.dataset.section);
      counter.textContent = `${pad(same.indexOf(el) + 1)} / ${pad(same.length)}`;
    }
  });
  const first = state.slide === 0 && state.step === 0;
  const last = state.slide === slides.length - 1 && state.step === stepsOf(slides[state.slide]) - 1;
  document.querySelector('[data-nav="prev"]').disabled = first;
  document.querySelector('[data-nav="next"]').disabled = last;
  const hash = `#${state.slide + 1}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

function go(slide, step) {
  const changed = slide !== state.slide;
  state.slide = slide;
  state.step = step;
  // Un paso nuevo interrumpe y se asienta de inmediato: nada queda en cola.
  if (changed) state.enteredAt = clock.time;
  render();
}
function next() {
  const steps = stepsOf(slides[state.slide]);
  if (state.step < steps - 1) go(state.slide, state.step + 1);
  else if (state.slide < slides.length - 1) go(state.slide + 1, 0);
}
function prev() {
  if (state.step > 0) go(state.slide, state.step - 1);
  else if (state.slide > 0) go(state.slide - 1, stepsOf(slides[state.slide - 1]) - 1);
}

// ---------------------------------------------------------------- entrada (un solo manejador)
const pointer = { x: 0, y: 0, active: false, tx: 0, ty: 0, nx: 0, ny: 0 };
let lastMove = -10;

function onInput(e) {
  switch (e.type) {
    case 'keydown': {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      // Con una ventana emergente abierta, el teclado es suyo (Esc la cierra de forma nativa).
      if (popupOpen()) return;
      // Un botón con foco ya convierte Espacio/Enter en click: no avanzar dos veces.
      if ((e.key === ' ' || e.key === 'Enter') && e.target.closest?.('button')) return;
      const k = e.key;
      if (k === 'ArrowRight' || k === ' ' || k === 'PageDown' || k === 'ArrowDown') next();
      else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'ArrowUp' || k === 'Backspace') prev();
      else if (k === 'Home') go(0, 0);
      else if (k === 'End') go(slides.length - 1, stepsOf(slides[slides.length - 1]) - 1);
      else if (k === '.' || k === 'b' || k === 'B') html.classList.toggle('is-blank');
      else if (k === 'f' || k === 'F') {
        if (document.fullscreenElement) document.exitFullscreen(); else html.requestFullscreen?.();
      } else return;
      e.preventDefault();
      lastMove = -10; // el teclado esconde los controles
      return;
    }
    case 'wheel': {
      // Rueda sobre un escenario giratorio: zoom (y no desplaza la página).
      const stage = !popupOpen() && e.target.closest?.('[data-orbit]');
      if (!stage) return;
      e.preventDefault();
      zoom = { name: stage.dataset['3d'], f: (zoom?.f || 1) * Math.exp(e.deltaY * 0.0015) };
      return;
    }
    case 'pointermove':
      if (touches.has(e.pointerId)) {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY, name: touches.get(e.pointerId).name });
        if (touches.size === 2) {
          // Pellizco: la razón entre distancias es el factor de zoom.
          const [a, b] = [...touches.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch) zoom = { name: a.name, f: (zoom?.f || 1) * (pinch / Math.max(1, dist)) };
          pinch = dist;
          return;
        }
      }
      if (orbit && e.pointerId === orbit.id) {
        orbit.dx += e.clientX - orbit.x; orbit.dy += e.clientY - orbit.y;
        orbit.x = e.clientX; orbit.y = e.clientY;
      }
      pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
      pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
      if (e.pointerType === 'mouse') lastMove = clock.time;
      return;
    case 'pointerleave':
    case 'blur':
      pointer.active = false; pointer.tx = 0; pointer.ty = 0;
      return;
    case 'pointerdown': {
      // Arrastrar sobre un escenario giratorio lo rota (y no cuenta como deslizar).
      const stage = !popupOpen() && e.target.closest?.('[data-orbit]');
      if (stage) {
        if (e.pointerType === 'touch') {
          touches.set(e.pointerId, { x: e.clientX, y: e.clientY, name: stage.dataset['3d'] });
          if (touches.size === 2) { orbit = null; pinch = 0; stage.classList.remove('is-grabbing'); return; }
        }
        orbit = { name: stage.dataset['3d'], id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
        stage.classList.add('is-grabbing');
        return;
      }
      if (e.pointerType !== 'mouse' && !popupOpen()) swipe = { x: e.clientX, y: e.clientY };
      return;
    }
    case 'pointercancel':
    case 'pointerup': {
      if (touches.delete(e.pointerId) && touches.size < 2) pinch = 0;
      if (orbit && e.pointerId === orbit.id) {
        document.querySelectorAll('.is-grabbing').forEach((g) => g.classList.remove('is-grabbing'));
        pending = orbit; orbit = null; // el último tramo se entrega en el próximo fotograma
        return;
      }
      if (swipe && e.pointerType !== 'mouse') {
        const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? next : prev)();
        pointer.active = false; pointer.tx = 0; pointer.ty = 0;
      }
      swipe = null;
      return;
    }
    case 'click': {
      // Controles de una simulación (dentro de su ventana).
      const act = e.target.closest('[data-sim-action]');
      if (act) {
        const sim = simFor(act);
        if (sim) ({ move: () => sim.move(), reset: () => sim.reset(), slack: () => sim.toggleSlack() })[act.dataset.simAction]?.();
        return;
      }
      // Alerta «!» → abre su ventana. X o clic fuera (en el fondo) → la cierra.
      const opener = e.target.closest('[data-popup]');
      if (opener) {
        const d = document.getElementById(`popup-${opener.dataset.popup}`);
        if (d && !d.open) d.showModal();
        return;
      }
      const dlg = e.target.closest('dialog.popup');
      if (dlg) {
        if (e.target === dlg || e.target.closest('[data-popup-close]')) dlg.close();
        return;
      }
      const phase = e.target.closest('[data-step-go]');
      if (phase) { go(state.slide, parseInt(phase.dataset.stepGo, 10)); return; }
      const b = e.target.closest('[data-nav]');
      if (b) (b.dataset.nav === 'next' ? next : prev)();
      return;
    }
    case 'input': {
      const speed = e.target.closest?.('[data-sim-speed]');
      if (speed) simFor(speed)?.setSpeed(+speed.value);
      return;
    }
    case 'hashchange':
      readHash(); state.enteredAt = clock.time; render();
  }
}
// Simulaciones (p. ej. el motor paso a paso): las mueve este mismo reloj.
const sims = [...document.querySelectorAll('[data-stepsim]')].map((el) => ({ el, dialog: el.closest('dialog'), sim: new StepSim(el) }));
const simFor = (node) => sims.find((x) => x.el.contains(node))?.sim;

let swipe = null;
let orbit = null;    // arrastre en curso sobre un escenario giratorio
let pending = null;  // arrastre que terminó y aún no se entregó
let zoom = null;     // zoom acumulado del fotograma (rueda o pellizco)
let pinch = 0;       // distancia previa entre los dos dedos
const touches = new Map(); // dedos apoyados sobre un escenario giratorio
const popupOpen = () => !!document.querySelector('dialog.popup[open]');
['keydown', 'pointermove', 'pointerdown', 'pointerup', 'pointercancel', 'click', 'input', 'blur', 'hashchange'].forEach((t) => window.addEventListener(t, onInput));
window.addEventListener('wheel', onInput, { passive: false });
document.documentElement.addEventListener('pointerleave', onInput);

// ---------------------------------------------------------------- reloj único
const clock = { time: 0, last: 0, ema: 1 / 60, slow: 0 };
let gl = null;
let glBorn = 0;
const controls = document.querySelector('.controls');
const liveCache = new Map();

function rectOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function titleLinesFor(slide, rect) {
  const [wide, tall] = (slide.dataset.titleLines || '').split('||');
  const useTall = tall && rect.w / rect.h < 3.1;
  return (useTall ? tall : wide).split('|');
}

function setText(el, value) {
  if (liveCache.get(el) === value) return;
  liveCache.set(el, value);
  el.innerHTML = value;
}

// Los contadores en vivo vuelven a su texto final (el del HTML) cuando no hay animación.
const liveEls = [...document.querySelectorAll('[data-live]')];
liveEls.forEach((el) => { el.dataset.final = el.innerHTML; });
function restoreFinal() {
  liveEls.forEach((el) => { el.innerHTML = el.dataset.final; liveCache.delete(el); });
}

function teardownGL(reason) {
  if (!gl) return;
  restoreFinal();
  console.warn(`[deck] capa 3D desactivada: ${reason}`);
  try { gl.dispose(); } catch (_) { /* sin contexto */ }
  gl = null;
  html.classList.remove('has-3d');
  document.querySelectorAll('.tag').forEach((t) => t.classList.remove('is-on'));
}

// Diagrama de acción: el paso activo (y la flecha que sale de él) con el mismo reloj
// que usan sus escenas 3D, para que el salto y el resaltado coincidan.
function syncFlow() {
  const flow = slides[state.slide].querySelector('.flow');
  if (!flow) return;
  const a = reduceMotion ? -1 : Math.floor(((clock.time - state.enteredAt) % FLOW_PERIOD) / FLOW_STEP);
  if (flow.dataset.active === String(a)) return;
  flow.dataset.active = String(a);
  flow.querySelectorAll('.flow-step').forEach((el, i) => el.classList.toggle('is-active', i === a));
  flow.querySelectorAll('.flow-arrow').forEach((el, i) => el.classList.toggle('is-active', i === a));
}

function tick(now) {
  requestAnimationFrame(tick);
  let raw = clock.last ? (now - clock.last) / 1000 : 1 / 60;
  if (clock.warp) { raw += clock.warp; clock.warp = 0; }
  clock.last = now;
  const dt = Math.min(raw, 0.05); // un tab que vuelve no hace saltar nada
  clock.time += dt + (clock.skip || 0);
  clock.skip = 0;

  // Puntero amortiguado: lo comparten el subtítulo 2.5D, el campo y las cámaras.
  pointer.nx = damp(pointer.nx, pointer.tx, 0.35, dt);
  pointer.ny = damp(pointer.ny, pointer.ty, 0.35, dt);
  if (!reduceMotion) {
    html.style.setProperty('--px', pointer.nx.toFixed(4));
    html.style.setProperty('--py', pointer.ny.toFixed(4));
  }
  controls.classList.toggle('is-idle', clock.time - lastMove > 2.5);

  for (const x of sims) if (!x.dialog || x.dialog.open) x.sim.update(dt);
  syncFlow();

  if (!gl || printing) return;

  // Presupuesto de salud: si no da abasto, se apaga para siempre y el CSS toma el relevo.
  clock.ema += (Math.min(raw, 0.5) - clock.ema) * 0.05;
  if (!params.has('force3d') && clock.time - glBorn > 2.5) {
    clock.slow = clock.ema > 0.045 ? clock.slow + dt : 0;
    if (clock.slow > 2) { teardownGL('frame-health'); return; }
  }

  // Sincronía por fotograma con chequeo de identidad (no en el evento).
  const slide = slides[state.slide];
  const titleZone = slide.querySelector('[data-3d="title"]');
  const zones = { sinceEnter: clock.time - state.enteredAt, stages: [], step: state.step };
  // Arrastre del fotograma (en curso o recién terminado) para el escenario giratorio.
  const d = orbit || pending;
  if (d) { zones.drag = { name: d.name, dx: d.dx, dy: d.dy }; d.dx = 0; d.dy = 0; pending = null; }
  if (zoom) { zones.zoom = zoom; zoom = null; }
  if (titleZone) {
    const r = rectOf(titleZone);
    const eyebrow = titleZone.querySelector('.eyebrow');
    const inset = eyebrow ? eyebrow.offsetHeight + 6 : 0;
    zones.title = { x: r.x, y: r.y + inset, w: r.w, h: r.h - inset };
    zones.titleBottom = r.y + r.h;
    gl.title.setLines(titleLinesFor(slide, zones.title), clock.time, {
      section: slide.dataset.section || null,
      accent: slide.dataset.titleAccent || null,
      impact: slide.dataset.titleImpact || null,
    });
  }
  const stageEls = [...slide.querySelectorAll('[data-3d]:not([data-3d="title"])')];
  for (const el of stageEls) zones.stages.push({ name: el.dataset['3d'], rect: rectOf(el) });

  let out;
  try {
    out = gl.frame(dt, clock.time, zones, pointer);
  } catch (err) {
    teardownGL(err.message);
    return;
  }

  for (const el of stageEls) {
    const name = el.dataset['3d'];
    const o = out[name];
    if (!o) continue;
    el.classList.toggle('is-loading', !!o.loading);
    // Etiquetas múltiples (data-pin) proyectadas sobre piezas del modelo.
    if (o.pins) {
      // Piezas vecinas: si dos etiquetas se pisan, la de abajo baja lo justo.
      const placed = [];
      [...el.querySelectorAll('[data-pin]')]
        .map((pin) => ({ pin, at: o.pins[pin.dataset.pin] }))
        .sort((a, b) => (a.at?.y ?? 0) - (b.at?.y ?? 0))
        .forEach(({ pin, at }) => {
          pin.classList.toggle('is-on', !!at);
          if (!at) return;
          const w = pin.offsetWidth, h = pin.offsetHeight;
          let y = at.y - h / 2;
          for (const p of placed) {
            const overlapX = at.x < p.x + p.w && p.x < at.x + w;
            if (overlapX && y < p.y + p.h + 4 && y + h > p.y) y = p.y + p.h + 4;
          }
          placed.push({ x: at.x, y, w, h });
          pin.style.transform = `translate(${at.x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        });
    }
    const live = slide.querySelector(`[data-live="${name}"]`);
    if (live) setText(live, o.live);
    const tag = el.querySelector(`[data-tag="${name}"]`);
    if (tag) {
      tag.classList.toggle('is-on', !!o.tag);
      if (o.tag) {
        // Si no cabe a la derecha del punto, la etiqueta se da vuelta hacia la izquierda.
        const flip = o.tag.x + tag.offsetWidth > el.clientWidth;
        tag.classList.toggle('is-flipped', flip);
        const x = flip ? Math.max(0, o.tag.x - tag.offsetWidth) : o.tag.x;
        tag.style.transform = `translate(${x.toFixed(1)}px, ${(o.tag.y - tag.offsetHeight / 2).toFixed(1)}px)`;
      }
    }
  }
}

// ---------------------------------------------------------------- arranque
async function boot() {
  const status = document.querySelector('[data-boot-status]');
  readHash();
  render();

  // Sostenido en la carga real de las fuentes: el título voxel se rasteriza con ellas.
  try {
    await Promise.all([
      document.fonts.load('900 64px "Archivo"', '¿QUÉ ES LA IMPRESIÓN 3D?'),
      document.fonts.load('800 32px "Archivo"'),
      document.fonts.load('600 16px "Archivo"'),
      document.fonts.load('500 14px "JetBrains Mono"'),
    ]);
  } catch (_) { /* sigue con la pila del sistema */ }

  const wantGL = !reduceMotion && !params.has('no3d') && !window.matchMedia('print').matches;
  if (wantGL) {
    if (status) status.textContent = 'Cargando / Geometría';
    try {
      const { GLLayer } = await import('./gl.js');
      gl = new GLLayer(document.getElementById('gl'));
      gl.canvas.addEventListener('webglcontextlost', () => teardownGL('context-lost'));
      html.classList.add('has-3d');
      glBorn = clock.time;
    } catch (err) {
      gl = null;
      console.warn('[deck] sin WebGL, se presenta con CSS:', err.message);
    }
  }
  if (params.has('debug')) window.__deck = { state, clock, pointer, get gl() { return gl; } };
  if (status) status.textContent = 'Listo / Presentar';
  html.classList.add('is-ready');
  state.enteredAt = clock.time;

  // El reloj corre siempre: con movimiento reducido no hay 3D ni parallax (el CSS los
  // anula), pero las simulaciones que el usuario pone en marcha siguen funcionando.
  requestAnimationFrame(tick);
}

// Imprimir = estado final de cada diapositiva, sin capa 3D.
let printing = false;
window.addEventListener('beforeprint', () => { printing = true; html.classList.remove('has-3d'); restoreFinal(); });
window.addEventListener('afterprint', () => { printing = false; if (gl) html.classList.add('has-3d'); });

boot();
