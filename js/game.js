/* Techride — the run itself: physics, level generation, hazards, collisions,
 * power-ups, effects and drawing. */
(function () {
  'use strict';
  const TR = window.TR;
  const U = TR.util, art = TR.art, A = TR.audio;
  const { TAU, clamp, lerp, rand, randInt, pick, chance, damp, smooth, easeOut, weighted, capsuleGap } = U;
  const W = TR.W, H = TR.H, CEIL = TR.CEIL, FLOOR = TR.FLOOR, PX = TR.PLAYER_X, PPM = TR.PX_PER_M;

  /* ---------- tuning ---------- */
  const GRAVITY = 2100; // px/s² when falling
  const LIFT = 1900; // px/s² upward while the jetpack fires
  const VY_UP = -620, VY_DOWN = 780;
  const SPEED_START = 430, SPEED_MAX = 800; // world scroll, px/s
  const RAMP_M = 2400; // distance over which a run reaches full difficulty
  const ZONE_M = 400; // the look of the arena changes every 8 hours
  const HOUR_M = 50; // metres flown per hour of the 46-hour marathon
  const QUIP = {
    close: ['CLOSE CALL', 'NICE DODGE', 'TOO CLOSE', 'SMOOTH', 'DANCE MOVES', 'RULES & REGS SAW THAT'],
    smash: ['SMASH', 'UNPLUGGED', 'TUB SMASH', 'RECYCLED'],
    ride: ["RIDE'S OVER", 'THERE GOES THE DEPOSIT', 'THAT WAS A RENTAL', 'WALK IT OFF', 'WE NEEDED THAT'],
    truck: ['ROAD CLOSED', 'RIGHT OF WAY', 'HONK HONK', 'NO BRAKES', 'OVERSIZE LOAD', 'THAT WILL BUFF OUT'],
    hours: [null, "Line dance o'clock", 'The 3 AM slump. Stay standing.', 'Halfway! Nobody sit down.', 'Pep rally energy', 'The final stretch'],
  };
  const FOOT = 40, HEAD = 64; // runner's reach below / above its centre at scale 1
  const ULTRA_SCALE = 1.95;
  const DUR = { magnet: 10, rush: 10, ultra: 7 };
  const RIDE_T = 14; // seconds a ride lasts if nothing breaks it first
  const TRUCK_T = 10; // seconds of F-150 for spelling T-E-C-H
  const DIFF = [
    { name: 'CHILL', speed: 0.88, gap: 1.22, ramp: 0.7 },
    { name: 'STANDARD', speed: 1, gap: 1, ramp: 1 },
    { name: 'INTENSE', speed: 1.12, gap: 0.9, ramp: 1.3 },
  ];
  // Collision radii. They follow the drawn shapes, a few pixels on the
  // forgiving side: glow never hurts, only the solid core does.
  const HB = { body: 15, beam: 7, node: 15, drone: 19, missile: 10, laser: 8, coin: 46, power: 52, letter: 62 };
  const LANES = [0, 1, 2, 3, 4].map((i) => CEIL + 60 + i * 113);
  const LASER_SETS = [[0, 1], [3, 4], [0, 4], [0, 1, 2], [2, 3, 4], [0, 1, 2, 3], [1, 2, 3, 4], [0, 3, 4], [0, 1, 4]];

  const G = (TR.game = {
    state: 'boot', // menu | playing | paused | dying | over
    w: null,
    input: { thrust: false },
    debug: { autopilot: false, god: false },
    DIFF, DUR, HB, HOUR_M, RIDE_T, TRUCK_T,
  });

  let nextId = 1;

  function newWorld(attract) {
    const save = TR.save.data;
    return {
      attract,
      diff: DIFF[attract ? 0 : save.difficulty] || DIFF[1],
      t: 0, camX: 0, speed: attract ? 330 : SPEED_START, dist: 0, d: 0,
      coins: 0, closeCalls: 0, smashed: 0,
      p: {
        y: FLOOR - FOOT, vy: 0, onGround: true, ground: 1, thrust: 0, phase: 0, rot: 0, sx: 1, sy: 1,
        ant: 0, antV: 0, blinkT: 1.5, blink: false, dead: false, inv: 0, scale: 1, spinV: 0, stepN: 0,
      },
      gates: [], drones: [], missiles: [], lasers: [], warnings: [], coinList: [], powerups: [],
      parts: [], texts: [],
      spawnX: W + (attract ? 100 : 620), hold: false,
      nextEvent: 7.5, nextPower: rand(5, 6.5), ride: null,
      // T-E-C-H: which letters are held (and how many), the ones in play, when
      // the next may appear, and how many trucks this run has earned so far
      have: [false, false, false, false], tech: 0, letterList: [], nextLetter: 0.8, truckPending: false, trucks: 0,
      // everyone gets one free mistake: most people only play a single run
      shield: !attract, magnet: 0, rush: 0, ultra: 0,
      shake: 0, flash: 0, flashColor: '#ffffff', hitstop: 0,
      zone: 0, prevZone: 0, zoneMix: 1,
      usedThrust: false, overT: 0,
      bestM: attract ? 0 : save.best, bestPassed: false,
      trail: [],
    };
  }

  /* =====================================================================
   *  PARTICLES
   * ===================================================================== */
  function emit(w, o) {
    const max = TR.save.data.effects ? 420 : 140;
    if (w.parts.length >= max) return;
    o.age = 0;
    w.parts.push(o);
  }
  function burst(w, x, y, n, color, speed, opts) {
    opts = opts || {};
    if (!TR.save.data.effects) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), v = rand(speed * 0.25, speed);
      emit(w, {
        type: opts.type || 'spark', x, y, vx: Math.cos(a) * v + (opts.vx || 0), vy: Math.sin(a) * v + (opts.vy || 0),
        life: rand(0.25, 0.6) * (opts.life || 1), size: rand(2, 4) * (opts.size || 1), color,
        grav: opts.grav == null ? 900 : opts.grav, drag: opts.drag == null ? 2 : opts.drag,
        rot: rand(0, TAU), vr: rand(-10, 10),
      });
    }
  }
  function ring(w, x, y, color, size, life) {
    emit(w, { type: 'ring', x, y, vx: 0, vy: 0, life: life || 0.4, size: size || 80, color, grav: 0, drag: 0 });
  }
  function smoke(w, x, y, n, vx, vy, size) {
    if (!TR.save.data.effects) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++)
      emit(w, {
        type: 'smoke', x: x + rand(-6, 6), y: y + rand(-6, 6), vx: (vx || 0) + rand(-40, 40), vy: (vy || 0) + rand(-40, 20),
        life: rand(0.4, 0.8), size: rand(8, 14) * (size || 1), color: '#aab3cf', grav: -60, drag: 2.5,
      });
  }
  function explode(w, x, y, color, big) {
    burst(w, x, y, big ? 26 : 14, color, big ? 620 : 420);
    burst(w, x, y, big ? 10 : 6, '#ffffff', 300, { size: 0.8 });
    burst(w, x, y, big ? 8 : 5, '#59648a', 380, { type: 'shard', size: 1.8, life: 1.4 });
    smoke(w, x, y, big ? 6 : 3, 0, 0, 1.4);
    ring(w, x, y, color, big ? 150 : 90, 0.35);
  }
  function floatText(w, x, y, text, color, size) {
    w.texts.push({ x, y, text, color: color || '#ffffff', size: size || 24, age: 0, life: 1.1 });
  }
  function addShake(w, v) {
    if (TR.save.data.shake) w.shake = Math.max(w.shake, v);
  }

  /* =====================================================================
   *  LEVEL GENERATION
   * ===================================================================== */
  function addGate(w, cx, cy, hl, a, o) {
    o = o || {};
    const g = {
      id: nextId++, cx, cy, hl, a, spin: o.spin || 0, ba: o.ba || 0, bs: o.bs || 0, bp: rand(0, TAU),
      x1: 0, y1: 0, x2: 0, y2: 0, dead: false, minGap: 1e9, passed: false,
    };
    poseGate(g, w.t);
    w.gates.push(g);
    return g;
  }
  function poseGate(g, t) {
    const a = g.a + g.spin * t;
    const cy = g.cy + (g.ba ? Math.sin(g.bp + g.bs * t) * g.ba : 0);
    const c = Math.cos(a) * g.hl, s = Math.sin(a) * g.hl;
    g.x1 = g.cx - c; g.y1 = cy - s; g.x2 = g.cx + c; g.y2 = cy + s;
  }
  function vGate(w, x, yTop, yBot) {
    return addGate(w, x, (yTop + yBot) / 2, (yBot - yTop) / 2, Math.PI / 2);
  }

  const TOP = CEIL + 26, BOT = FLOOR - 26; // closest an emitter sits to a wall

  const PATTERNS = {
    single(w, x, d) {
      const len = rand(150, 220 + 70 * d), hl = len / 2;
      const kind = weighted([[3, 'v'], [3, 'h'], [2, 'd']]);
      if (kind === 'v') {
        const where = pick(['top', 'bot', 'free', 'free']);
        const cy = where === 'top' ? TOP + hl : where === 'bot' ? BOT - hl : rand(TOP + hl, BOT - hl);
        addGate(w, x + 20, cy, hl, Math.PI / 2);
        return 40;
      }
      if (kind === 'h') {
        addGate(w, x + hl, rand(CEIL + 80, FLOOR - 80), hl, 0);
        return len;
      }
      const a = (chance(0.5) ? 1 : -1) * Math.PI / 4;
      addGate(w, x + hl * 0.71, rand(TOP + hl * 0.71, BOT - hl * 0.71), hl, a);
      return len * 0.71;
    },
    doorway(w, x, d) {
      const gap = rand(215, 255) - d * 35;
      const gy = rand(CEIL + gap / 2 + 70, FLOOR - gap / 2 - 70);
      if (gy - gap / 2 - TOP >= 60) vGate(w, x + 20, TOP, gy - gap / 2);
      if (BOT - (gy + gap / 2) >= 60) vGate(w, x + 20, gy + gap / 2, BOT);
      return 40;
    },
    stagger(w, x, d) {
      const n = 2 + (d > 0.5 && chance(0.5) ? 1 : 0);
      const dx = w.speed * rand(0.64, 0.76);
      let top = chance(0.5);
      for (let i = 0; i < n; i++) {
        const len = rand(230, 300);
        if (top) vGate(w, x + 20 + i * dx, TOP, TOP + len);
        else vGate(w, x + 20 + i * dx, BOT - len, BOT);
        top = !top;
      }
      return (n - 1) * dx + 40;
    },
    spinner(w, x, d) {
      const len = rand(170, 230), hl = len / 2;
      addGate(w, x + hl, rand(TOP + hl + 6, BOT - hl - 6), hl, rand(0, TAU), {
        spin: (chance(0.5) ? 1 : -1) * rand(1.3, 1.8 + d * 0.7),
      });
      return len;
    },
    mover(w, x, d) {
      const len = rand(150, 210), hl = len / 2;
      const ba = rand(90, 150);
      addGate(w, x + hl, (CEIL + FLOOR) / 2 + rand(-40, 40), hl, 0, { ba, bs: rand(1.4, 1.9 + d * 0.4) });
      return len;
    },
    drones(w, x, d) {
      const n = randInt(1, d > 0.4 ? 3 : 2);
      let cx = x + 26;
      for (let i = 0; i < n; i++) {
        const amp = rand(50, 110);
        w.drones.push({
          id: nextId++, x: cx, baseY: rand(CEIL + 46 + amp, FLOOR - 46 - amp), amp, sp: rand(1.6, 2.4 + d * 0.5),
          ph: rand(0, TAU), y: 0, dead: false, minGap: 1e9, passed: false,
        });
        cx += rand(170, 230);
      }
      return cx - x - 150;
    },
  };

  function hazardNear(w, x, y, clear) {
    for (const g of w.gates) {
      if (Math.abs(g.cx - x) > g.hl + clear + 20) continue;
      if (g.spin) {
        if (Math.hypot(x - g.cx, y - g.cy) < g.hl + clear) return true;
      } else if (g.ba) {
        if (Math.abs(y - g.cy) < g.ba + clear + 16) return true;
      } else {
        const c = Math.cos(g.a) * g.hl, s = Math.sin(g.a) * g.hl;
        if (Math.sqrt(U.segSegDist2(x, y, x, y, g.cx - c, g.cy - s, g.cx + c, g.cy + s)) < clear + 16) return true;
      }
    }
    for (const d of w.drones)
      if (Math.abs(d.x - x) < clear + 22 && Math.abs(d.baseY - y) < d.amp + 22 + clear) return true;
    return false;
  }

  function addCoin(w, x, y) {
    if (y < CEIL + 34 || y > FLOOR - 28) return;
    if (hazardNear(w, x, y, 54)) return;
    w.coinList.push({ x, y, ph: x * 0.012, pull: 0, dead: false });
  }

  function coinFormation(w, x, width) {
    const n = clamp(Math.floor(width / 42), 3, 14);
    const kind = weighted([[3, 'line'], [3, 'wave'], [2, 'arc'], [2, 'block'], [2, 'zig'], [1.5, 'stairs']]);
    const y0 = rand(CEIL + 110, FLOOR - 110);
    for (let i = 0; i < n; i++) {
      const cx = x + i * 42, f = n > 1 ? i / (n - 1) : 0;
      if (kind === 'line') addCoin(w, cx, y0);
      else if (kind === 'wave') addCoin(w, cx, y0 + Math.sin(f * TAU) * 70);
      else if (kind === 'arc') addCoin(w, cx, y0 + 60 - Math.sin(f * Math.PI) * 140);
      else if (kind === 'zig') addCoin(w, cx, y0 + (Math.abs(((i % 6) - 3)) - 1.5) * 44);
      else if (kind === 'stairs') addCoin(w, cx, clamp(y0 + (f - 0.5) * 260 * (y0 > 350 ? -1 : 1), CEIL + 60, FLOOR - 50));
      else {
        addCoin(w, cx, y0 - 21);
        addCoin(w, cx, y0 + 21);
        if (n > 6) addCoin(w, cx, y0 + 63);
      }
    }
  }

  // the first letter that is neither held nor already on its way; -1 if none
  function nextLetterIndex(w) {
    if (w.tech >= 4) return -1;
    for (let i = 0; i < 4; i++)
      if (!w.have[i] && !w.letterList.some((l) => l.i === i && !l.dead)) return i;
    return -1;
  }

  function spawnAhead(w) {
    const d = w.d;
    while (w.spawnX < w.camX + W + 240) {
      const x = w.spawnX;
      let span;
      if (w.attract) {
        span = PATTERNS.single(w, x, 0);
      } else {
        const opts = [[5, 'single'], [2 + 2 * d, 'doorway'], [1.5 + 2 * d, 'stagger']];
        if (d > 0.06) opts.push([2 + d, 'drones']);
        if (d > 0.12) opts.push([1.5 + 2 * d, 'spinner']);
        if (d > 0.25) opts.push([1 + 2 * d, 'mover']);
        span = PATTERNS[weighted(opts)](w, x, d);
      }
      // the breathing room is measured in time, so it stays fair as speed rises
      const gap = Math.max(330, w.speed * lerp(1.08, 0.72, d) * w.diff.gap);
      const room = gap - 150;
      if (!w.attract && w.t > w.nextPower) {
        const py = rand(CEIL + 130, FLOOR - 130);
        const px = x + span + gap * 0.5;
        const busy = w.ride || w.ultra > 0;
        const types = [[2.4, 'magnet'], [2.4, 'rush']];
        if (!w.shield) types.push([2.6, 'shield']);
        if (!busy) types.push([2, 'ultra']);
        // the other rides wait until the first F-150 has been earned: the
        // opening of a run belongs to the letter hunt
        if (!busy && w.trucks > 0) for (const r of art.RIDES) types.push([2.4, r]);
        const type = weighted(types);
        w.powerups.push({ x: px, y: py, type, ph: rand(0, TAU), dead: false });
        w.nextPower = w.t + rand(11, 16);
      } else if (!w.attract && w.t > w.nextLetter && nextLetterIndex(w) >= 0) {
        // the next missing letter of T-E-C-H. A missed one comes round again.
        const i = nextLetterIndex(w);
        const van = w.ride && w.ride.type === 'van';
        const ly = van ? pick([CEIL + 100, FLOOR - 100]) : rand(CEIL + 140, FLOOR - 140);
        w.letterList.push({ x: x + span + gap * 0.5, y: ly, i, ch: art.TECH[i], ph: rand(0, TAU), dead: false });
        // quick the first time, so a single run gets its truck; slower after each one
        w.nextLetter = w.t + rand(2.1, 2.9) + Math.min(w.trucks, 3) * 1.6;
      } else if (room > 120 && chance(0.82)) {
        coinFormation(w, x + span + 85, room);
      }
      w.spawnX = x + span + gap;
    }
  }

  /* ---------- timed events: missiles and laser walls ---------- */
  function startEvent(w) {
    const d = w.d;
    // no laser walls early on, or while on a ride that could not dodge them
    const kind = weighted(d < 0.12 || w.ride ? [[5, 'missile'], [2.4, 'dance']] : [[5, 'missile'], [3 + 3 * d, 'laser'], [2.2, 'dance']]);
    if (kind === 'dance') {
      // LINE DANCE: a hazard-free stretch with one long wave of donations
      const x0 = w.spawnX, len = w.speed * 4;
      for (let x = x0; x < x0 + len; x += 44)
        w.coinList.push({ x, y: 350 + Math.sin(((x - x0) / len) * TAU * 2) * 130, ph: x * 0.012, pull: 0, dead: false });
      w.spawnX = x0 + len + 220;
      w.nextEvent = w.t + rand(8, 11);
      TR.ui.banner('LINE DANCE!', 'Follow the wave', '#ffd23f');
      A.play('zone');
    } else if (kind === 'missile') {
      const n = 1 + (d > 0.3 && chance(0.55) ? 1 : 0) + (d > 0.65 && chance(0.45) ? 1 : 0);
      for (let i = 0; i < n; i++) w.warnings.push({ delay: i * 0.8, t: 0, y: w.p.y, locked: false, beep: 0 });
      w.nextEvent = w.t + rand(7, 10.5) - d * 2;
    } else {
      // stop new gates and let the ones on screen pass before the beams fire
      w.hold = true;
      let last = w.camX + PX;
      for (const g of w.gates) last = Math.max(last, g.cx + g.hl);
      for (const dr of w.drones) last = Math.max(last, dr.x);
      const charge = Math.max(1.25, (last - (w.camX + PX)) / w.speed + 0.75);
      const set = pick(d < 0.4 ? LASER_SETS.slice(0, 5) : LASER_SETS);
      const fire = 1.5;
      addLasers(w, set, 0, charge, fire);
      let total = 0.45 + charge + fire;
      const safeLanes = LANES.map((_, i) => i).filter((i) => !set.includes(i));
      if (d > 0.45 && chance(0.55)) {
        // a second volley that closes at least one lane the first left open,
        // so the player has to move; its tracer shows while the first fires
        const options = LASER_SETS.filter((s) => s !== set && safeLanes.some((i) => s.includes(i)));
        addLasers(w, pick(options), charge + 0.25, fire + 0.1, fire);
        total += fire + 0.35;
      }
      // reward for reading the pattern: coins along a safe lane
      const sy = (LANES[safeLanes[0]] + LANES[safeLanes[safeLanes.length - 1]]) / 2;
      const cy = clamp(sy, CEIL + 80, FLOOR - 48);
      const start = Math.max(w.camX + W + 30, w.camX + PX + w.speed * charge);
      const end = w.camX + PX + w.speed * (0.45 + charge + fire);
      for (let cx = start; cx < end; cx += 46) w.coinList.push({ x: cx, y: cy, ph: cx * 0.012, pull: 0, dead: false });
      w.spawnX = Math.max(w.spawnX, w.camX + PX + w.speed * (total + 0.9));
      w.nextEvent = w.t + total + rand(6.5, 10) - d * 2;
    }
  }
  function addLasers(w, set, delay, charge, fire) {
    for (const i of set)
      w.lasers.push({ id: nextId++, y: LANES[i], phase: 'wait', t: 0, delay, charge, fire, snd: false });
  }

  /* =====================================================================
   *  THE RUNNER
   * ===================================================================== */
  function playerCapsule(w) {
    const p = w.p, s = p.scale;
    if (w.ride && !p.dead) {
      // on a ride the collider is the vehicle's body (a sideways capsule)
      // the truck smashes whatever it touches, so its collider is the whole body
      if (w.ride.type === 'truck') return { x1: PX - 141, y1: p.y - 12, x2: PX + 229, y2: p.y - 12, r: 112 };
      if (w.ride.type === 'van') return { x1: PX - 52, y1: p.y - 5 * w.ride.dir, x2: PX + 50, y2: p.y - 5 * w.ride.dir, r: 31 };
      return { x1: PX - 24, y1: p.y - 14, x2: PX + 26, y2: p.y - 14, r: 30 };
    }
    const c = Math.cos(p.rot), sn = Math.sin(p.rot);
    // spine from the middle of the head to the hips
    const ax = 1 * s, ay = -28 * s, bx = 0, by = 10 * s;
    return {
      x1: PX + ax * c - ay * sn, y1: p.y + ax * sn + ay * c,
      x2: PX + bx * c - by * sn, y2: p.y + bx * sn + by * c,
      r: HB.body * s,
    };
  }

  /* ---------- autopilot ----------
   * Flies the title-screen demo and is used to test that every generated
   * stretch can be survived. It looks ~1.1 s ahead: it tries holding or
   * releasing the jetpack in 0.18 s slices, predicts where every hazard will
   * be, and keeps the choice whose future survives longest. */
  function laneScore(w, cy) {
    let s = -Math.abs(cy - 370) * 0.002;
    for (const c of w.coinList) {
      const dx = c.x - w.camX - PX;
      if (dx > 0 && dx < 420 && Math.abs(c.y - cy) < 30) s += 0.2;
    }
    for (const u of w.powerups) {
      const dx = u.x - w.camX - PX;
      if (dx > 0 && dx < 500 && Math.abs(u.y - cy) < 40) s += 3;
    }
    return s;
  }
  function laserWindow(l) {
    const fs = l.phase === 'wait' ? l.delay + 0.45 + l.charge : l.phase === 'in' ? 0.45 - l.t + l.charge
      : l.phase === 'charge' ? l.charge - l.t : l.phase === 'fire' ? -l.t : 1e9;
    return [fs + 0.03 * l.fire, fs + 0.95 * l.fire];
  }
  const SLICE = 0.18, DEPTH = 6, PAD = 5;
  function unsafeAt(w, y, tt, lasers) {
    const camT = w.camX + w.speed * tt;
    const pc = { x1: PX + 1, y1: y - 28, x2: PX, y2: y + 10, r: HB.body + PAD };
    const tmp = { x1: 0, y1: 0, x2: 0, y2: 0, r: 0 };
    const g2 = { cx: 0, cy: 0, hl: 0, a: 0, spin: 0, ba: 0, bs: 0, bp: 0, x1: 0, y1: 0, x2: 0, y2: 0 };
    for (const g of w.gates) {
      const sx = g.cx - camT;
      if (sx < PX - g.hl - 60 || sx > PX + g.hl + 60) continue;
      Object.assign(g2, g);
      poseGate(g2, w.t + tt);
      tmp.x1 = g2.x1 - camT; tmp.y1 = g2.y1; tmp.x2 = g2.x2 - camT; tmp.y2 = g2.y2; tmp.r = HB.node;
      if (capsuleGap(pc, tmp) < 0) return true;
    }
    for (const d of w.drones) {
      const sx = d.x - camT;
      if (sx < PX - 70 || sx > PX + 70) continue;
      tmp.x1 = tmp.x2 = sx; tmp.y1 = tmp.y2 = d.baseY + Math.sin(d.ph + d.sp * (w.t + tt)) * d.amp; tmp.r = HB.drone;
      if (capsuleGap(pc, tmp) < 0) return true;
    }
    for (const m of w.missiles) {
      const sx = m.sx + m.vx * tt;
      if (sx < PX - 80 || sx > PX + 90) continue;
      if (Math.abs(m.y - y + 9) < 50) return true;
    }
    for (const wn of w.warnings) {
      if (wn.delay > 0) continue;
      const launch = 1.55 - wn.t;
      if (tt < launch) continue;
      const sx = W + 90 - (940 + w.d * 260) * (tt - launch);
      if (sx > PX - 80 && sx < PX + 90 && Math.abs(wn.y - y + 9) < 50) return true;
    }
    for (const l of lasers) if (tt > l[0] && tt < l[1] && Math.abs(l[2] - y + 9) < 19 + HB.body + HB.laser + PAD) return true;
    return false;
  }
  function rollout(w, y, vy, tt, depth, thrust, lasers, out) {
    const dt = 1 / 60, gy = FLOOR - FOOT, cy = CEIL + HEAD;
    for (let i = 0; i < Math.round(SLICE / dt); i++) {
      if (thrust) vy -= LIFT * (vy > 0 ? 1.55 : 1) * dt;
      else vy += GRAVITY * dt;
      vy = clamp(vy, VY_UP, VY_DOWN);
      y += vy * dt;
      if (y >= gy) { y = gy; vy = Math.min(vy, 0); }
      if (y <= cy) { y = cy; vy = Math.max(vy, 0); }
      tt += dt;
      if (unsafeAt(w, y, tt, lasers)) { out.t = tt; out.score = -1e9; return; }
    }
    if (depth <= 1) { out.t = tt; out.score = laneScore(w, y); return; }
    const a = { t: 0, score: 0 }, b = { t: 0, score: 0 };
    rollout(w, y, vy, tt, depth - 1, thrust, lasers, a); // staying the course first: smoother flying
    if (a.score > -1e8) { // good enough? still compare the alternative for a better lane
      rollout(w, y, vy, tt, depth - 1, !thrust, lasers, b);
    } else rollout(w, y, vy, tt, depth - 1, !thrust, lasers, b);
    const best = a.t > b.t + 1e-6 || (Math.abs(a.t - b.t) <= 1e-6 && a.score >= b.score) ? a : b;
    out.t = best.t;
    out.score = best.score;
  }
  function autopilot(w) {
    const p = w.p;
    const lasers = w.lasers.map((l) => { const lw = laserWindow(l); return [lw[0], lw[1], l.y]; });
    const on = { t: 0, score: 0 }, off = { t: 0, score: 0 };
    rollout(w, p.y, p.vy, 0, DEPTH, true, lasers, on);
    rollout(w, p.y, p.vy, 0, DEPTH, false, lasers, off);
    if (Math.abs(on.t - off.t) > 1e-6) return on.t > off.t;
    if (Math.abs(on.score - off.score) > 0.05) return on.score > off.score;
    return p.thrust > 0.5; // no reason to change
  }

  /* ---------- rides ----------
   * A ride swaps the jetpack for different controls and takes a hit:
   *   buggy - hold to rise on water jets, release to sink, at a steady speed
   *   van   - tap to flip between driving on the floor and on the ceiling
   *   truck - the reward for spelling T-E-C-H. Tap to hop, tap again in the
   *           air to double-jump. Nothing hurts it: it smashes what it touches.
   */
  function updateRide(w, dt, held, pressed) {
    const p = w.p, r = w.ride, cam = w.camX;
    let hum = 0;
    p.scale = damp(p.scale, 1, 9, dt);
    p.onGround = false;
    if (r.type === 'buggy') {
      const gy = FLOOR - 46, cy = CEIL + 64;
      p.vy = damp(p.vy, held ? -540 : 540, 12, dt);
      p.y = clamp(p.y + p.vy * dt, cy, gy);
      if (p.y <= cy || p.y >= gy) p.vy = 0;
      p.rot = damp(p.rot, clamp(p.vy / 3200, -0.15, 0.15), 10, dt);
      r.jet = damp(r.jet, held ? 1 : 0.35, 14, dt);
      hum = 0.25 + r.jet * 0.45;
      if (chance(dt * 55 * r.jet))
        emit(w, {
          type: 'dot', x: cam + PX + pick([-32, 34]) + rand(-4, 4), y: p.y + 34, vx: w.speed * 0.3 + rand(-40, 40), vy: rand(300, 480),
          life: rand(0.25, 0.45), size: rand(4, 7), color: '#7fd8ff', grav: 600, drag: 1,
        });
    } else if (r.type === 'truck') {
      const S = art.RIDE_SCALE.truck;
      const gy = FLOOR - 39 * S, cy = CEIL + 60 * S;
      if (p.y >= gy - 0.5) r.jumps = 0;
      if (pressed && r.jumps < 2) {
        p.vy = r.jumps === 0 ? -900 : -820;
        r.jumps++;
        p.sy = 1.12;
        p.sx = 0.92;
        A.play('hop');
        smoke(w, cam + PX - 50 * S, p.y + 36 * S, 4, -40, 40, 1.2);
        smoke(w, cam + PX + art.RIDE_DX.truck - 95 * S, p.y + 16 * S, 5, w.speed * 0.3, -70, 1.6); // the exhaust coughs
      }
      // holding the button makes each hop float a little higher
      p.vy = Math.min(p.vy + (p.vy < 0 && held ? 1500 : 3000) * dt, 1050);
      p.y += p.vy * dt;
      if (p.y >= gy) {
        if (p.vy > 350) {
          p.sy = 0.84;
          p.sx = 1.1;
          A.play('land');
          addShake(w, 11); // it is a lot of truck
          A.play('thud');
          smoke(w, cam + PX - 54 * S, FLOOR - 4, 5, -60, -30, 1.2);
          smoke(w, cam + PX + 56 * S, FLOOR - 4, 5, -60, -30, 1.2);
        }
        p.y = gy;
        p.vy = 0;
      }
      if (p.y < cy) {
        p.y = cy;
        p.vy = Math.max(p.vy, 0);
      }
      p.rot = damp(p.rot, p.y < gy ? clamp(p.vy / 3400, -0.14, 0.14) : 0, 12, dt);
      hum = 0.3;
      r.whip = damp(r.whip, clamp(p.vy / 700, -1, 1), 7, dt); // the antenna, dice and mud flaps swing
      if (chance(dt * 20)) smoke(w, cam + PX + art.RIDE_DX.truck - 95 * S, p.y + 16 * S, 1, w.speed * 0.3, -50, 1.3);
    } else {
      const gy = FLOOR - 37, top = CEIL + 37;
      if (pressed) {
        r.dir = -r.dir;
        A.play('hop');
      }
      p.vy = clamp(p.vy + r.dir * 3400 * dt, -980, 980);
      p.y += p.vy * dt;
      if (p.y >= gy || p.y <= top) {
        if (Math.abs(p.vy) > 350) {
          A.play('land');
          addShake(w, 4);
          p.sy = 0.86;
          p.sx = 1.08;
        }
        p.y = clamp(p.y, top, gy);
        p.vy = 0;
      }
      r.flip = damp(r.flip, r.dir, 18, dt); // the van turns wheels-up for the ceiling
      p.rot = damp(p.rot, 0, 12, dt);
      hum = 0.3;
    }
    r.spin += (dt * w.speed) / 15;
    p.ground = damp(p.ground, 0, 16, dt);
    p.thrust = damp(p.thrust, 0, 20, dt);
    p.sx = damp(p.sx, 1, 11, dt);
    p.sy = damp(p.sy, 1, 11, dt);
    const target = clamp(p.vy / 110, -6, 7) + 2;
    p.antV += ((target - p.ant) * 220 - p.antV * 13) * dt;
    p.ant += p.antV * dt;
    p.blinkT -= dt;
    if (p.blinkT < 0) {
      p.blink = !p.blink;
      p.blinkT = p.blink ? 0.11 : rand(1.6, 4);
    }
    if (p.inv > 0) p.inv -= dt;
    A.setThrust(hum);
    r.t -= dt;
    if (r.t <= 0) endRide(w, false);
  }

  function endRide(w, broken) {
    const p = w.p, r = w.ride;
    if (!r) return;
    const def = art.POWERUPS[r.type];
    const truck = r.type === 'truck';
    w.ride = null;
    if (truck) {
      // the letters start over
      w.tech = 0;
      w.have = [false, false, false, false];
      w.nextLetter = w.t + 4;
    }
    p.vy = -360;
    A.setThrust(0);
    if (broken) {
      const S = art.RIDE_SCALE[r.type];
      explode(w, w.camX + PX - 40 * S, p.y, def.color, true);
      explode(w, w.camX + PX + 40 * S, p.y, def.color, true);
      if (S > 1) explode(w, w.camX + PX, p.y - 30, '#ffffff', true);
      p.inv = 1.6;
      w.hitstop = 0.07;
      w.flash = 0.3;
      w.flashColor = def.color;
      addShake(w, 13);
      A.play('smash');
      floatText(w, PX + 60, p.y - 100, pick(QUIP.ride), def.color, 24);
    } else {
      p.inv = truck ? 2 : 1.1; // a moment to find your feet again
      smoke(w, w.camX + PX, p.y, truck ? 16 : 8, 0, 0, truck ? 2.4 : 1.4);
      ring(w, w.camX + PX, p.y, def.color, truck ? 260 : 120, 0.4);
      A.play('powerdown');
    }
  }

  function updatePlayer(w, dt) {
    const p = w.p;
    const thrusting = w.attract || G.debug.autopilot ? autopilot(w) : G.input.thrust;
    if (thrusting && !w.usedThrust && !w.attract) {
      w.usedThrust = true;
      TR.ui.hint(false);
    }
    const pressed = thrusting && !p.wasHeld;
    p.wasHeld = thrusting;
    if (w.ride) {
      updateRide(w, dt, thrusting, pressed);
      return;
    }
    // a little extra push when reversing a fall keeps the controls snappy
    if (thrusting) p.vy -= LIFT * (p.vy > 0 ? 1.55 : 1) * dt;
    else p.vy += GRAVITY * dt;
    p.vy = clamp(p.vy, VY_UP, VY_DOWN);
    p.y += p.vy * dt;

    p.scale = damp(p.scale, w.ultra > 0 ? ULTRA_SCALE : 1, 9, dt);
    const gy = FLOOR - FOOT * p.scale, cy = CEIL + HEAD * p.scale;
    if (p.y >= gy) {
      if (!p.onGround) {
        if (p.vy > 300) {
          p.sy = 0.8;
          p.sx = 1.16;
          smoke(w, w.camX + PX, FLOOR - 4, 4, -60, -30, 0.8);
          A.play('land');
          if (w.ultra > 0) addShake(w, 7);
        }
      }
      p.y = gy;
      p.vy = Math.min(p.vy, 0);
      p.onGround = true;
    } else {
      if (p.onGround && thrusting) {
        p.sy = 1.14;
        p.sx = 0.9;
      }
      p.onGround = false;
    }
    if (p.y <= cy) {
      if (p.vy < -260) A.play('bump');
      p.y = cy;
      p.vy = Math.max(p.vy, 0);
    }

    p.ground = damp(p.ground, p.onGround ? 1 : 0, 16, dt);
    const prevPhase = p.phase;
    p.phase += dt * (w.speed / 430) * 11 * (p.onGround ? 1 : 0.25);
    if (p.onGround && Math.floor(p.phase / Math.PI) !== Math.floor(prevPhase / Math.PI) && TR.save.data.effects) {
      emit(w, { type: 'smoke', x: w.camX + PX - 8, y: FLOOR - 3, vx: -50, vy: -24, life: 0.3, size: 5, color: '#aab3cf', grav: -40, drag: 2 });
    }
    p.thrust = damp(p.thrust, thrusting ? 1 : 0, 20, dt);
    const lean = (1 - p.ground) * (clamp(p.vy / 1100, -0.3, 0.36) + 0.07);
    p.rot = damp(p.rot, lean, 13, dt);
    p.sx = damp(p.sx, 1, 11, dt);
    p.sy = damp(p.sy, 1, 11, dt);
    // springy antenna
    const target = clamp(p.vy / 110, -6, 7) + 2;
    p.antV += ((target - p.ant) * 220 - p.antV * 13) * dt;
    p.ant += p.antV * dt;
    p.blinkT -= dt;
    if (p.blinkT < 0) {
      p.blink = !p.blink;
      p.blinkT = p.blink ? 0.11 : rand(1.6, 4);
    }
    if (p.inv > 0) p.inv -= dt;

    if (!w.attract) A.setThrust(p.thrust * (w.ultra > 0 ? 1.5 : 1));
    // exhaust
    if (p.thrust > 0.3) {
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      const nx = (-22 * c - 34 * s) * p.scale, ny = (-22 * s + 34 * c) * p.scale;
      const skin = w.ultra > 0 ? art.TUB : art.skin(TR.save.data.skin);
      if (chance(dt * 70))
        emit(w, {
          type: 'dot', x: w.camX + PX + nx, y: p.y + ny, vx: rand(-60, 30) + w.speed * 0.25, vy: rand(260, 440),
          life: rand(0.18, 0.34), size: rand(5, 9) * p.scale, color: skin.sparks ? pick(skin.sparks) : skin.flame, grav: 0, drag: 1.5,
        });
      if (chance(dt * 16)) smoke(w, w.camX + PX + nx, p.y + ny + 20, 1, 0, 120, 0.6);
    }
    if (w.ultra > 0) {
      w.trail.push({ y: p.y, rot: p.rot, phase: p.phase, age: 0 });
      if (w.trail.length > 6) w.trail.shift();
    } else if (w.trail.length) w.trail.length = 0;
  }

  function updateDying(w, dt) {
    const p = w.p;
    p.vy = Math.min(p.vy + GRAVITY * dt, 900);
    p.y += p.vy * dt;
    p.rot += p.spinV * dt;
    p.thrust = 0;
    const gy = FLOOR - 26, cy = CEIL + 40;
    if (p.y < cy) {
      p.y = cy;
      p.vy = Math.abs(p.vy) * 0.4;
    }
    if (p.y >= gy) {
      p.y = gy;
      if (p.vy > 170) {
        p.vy *= -0.44;
        w.speed *= 0.74;
        p.spinV *= 0.6;
        addShake(w, 7);
        A.play('thud');
        smoke(w, w.camX + PX, FLOOR - 4, 5, 60, -40, 1);
        burst(w, w.camX + PX, FLOOR - 4, 6, '#ffd23f', 260, { vy: -160 });
      } else {
        // sliding to a stop, flat on its back
        p.vy = 0;
        p.spinV = 0;
        const flat = Math.round((p.rot + Math.PI / 2) / TAU) * TAU - Math.PI / 2;
        p.rot = damp(p.rot, flat, 12, dt);
        w.speed = Math.max(0, w.speed - 760 * dt);
        if (w.speed > 40 && chance(dt * 40))
          burst(w, w.camX + PX - 10, FLOOR - 3, 1, '#ffd23f', 200, { vy: -120, vx: -100, life: 0.6 });
      }
    } else {
      w.speed *= Math.exp(-0.45 * dt);
    }
    if (chance(dt * 14)) smoke(w, w.camX + PX, p.y - 10, 1, 0, -40, 0.9);
    if (w.speed <= 0.5 && p.y >= gy) {
      w.speed = 0;
      w.overT += dt;
      if (w.overT > 0.75 && G.state === 'dying') finish(w);
    }
  }

  function die(w, x, y) {
    const p = w.p;
    p.dead = true;
    G.state = 'dying';
    w.hitstop = 0.11;
    addShake(w, 24);
    w.flash = 0.75;
    w.flashColor = '#ffffff';
    p.vy = -430;
    p.spinV = -rand(7, 10);
    p.scale = 1;
    w.magnet = w.rush = w.ultra = 0;
    A.play('crash');
    A.setThrust(0);
    A.setMusicIntensity(0.25);
    const skin = art.skin(TR.save.data.skin);
    explode(w, w.camX + x, y, art.HAZARD, true);
    burst(w, w.camX + PX, p.y, 14, skin.body, 480, { type: 'shard', size: 1.4, life: 1.6 });
    TR.ui.hint(false);
  }

  function finish(w) {
    G.state = 'over';
    const save = TR.save;
    const dist = Math.floor(w.dist);
    const newBest = dist > save.data.best;
    const prevBest = save.data.best;
    if (newBest) save.data.best = dist;
    save.data.bank += w.coins;
    save.data.stats.runs++;
    save.data.stats.dist += dist;
    save.data.stats.coins += w.coins;
    save.write();
    TR.ui.showResults({
      dist, coins: w.coins, newBest, prevBest, closeCalls: w.closeCalls, smashed: w.smashed,
      qualifies: save.qualifies(dist), diff: w.diff.name, cause: w.cause, hours: Math.floor(w.dist / HOUR_M),
    });
  }

  /* =====================================================================
   *  HITS
   * ===================================================================== */
  function smashObject(w, kind, o) {
    o.dead = true;
    w.smashed++;
    if (kind === 'gate') {
      explode(w, o.x1, o.y1, art.HAZARD, false);
      explode(w, o.x2, o.y2, art.HAZARD, false);
    } else if (kind === 'drone') explode(w, o.x, o.y, art.HAZARD, true);
    else if (kind === 'missile') explode(w, w.camX + o.sx, o.y, '#ff9a3d', true);
    addShake(w, 9);
    A.play('smash');
  }

  function onHit(w, kind, o, hx, hy) {
    if (w.attract || G.debug.god) return;
    const p = w.p;
    if (w.ultra > 0) {
      if (kind !== 'laser') {
        smashObject(w, kind, o);
        w.coins += 3;
        floatText(w, PX + 110, p.y - 150, pick(QUIP.smash) + ' +3', art.POWERUPS.ultra.color, 26);
      }
      return;
    }
    if (w.ride && w.ride.type === 'truck') {
      // nothing stops the F-150
      if (kind !== 'laser') {
        smashObject(w, kind, o);
        w.coins += 3;
        floatText(w, clamp(hx, 200, W - 160), Math.max(CEIL + 44, hy - 70), pick(QUIP.truck) + ' +3', art.POWERUPS.truck.color, 26);
      }
      return;
    }
    if (p.inv > 0) return;
    if (w.ride) {
      // the ride takes the hit
      if (kind !== 'laser') smashObject(w, kind, o);
      endRide(w, true);
      return;
    }
    if (w.shield) {
      w.shield = false;
      p.inv = 1.5;
      if (kind !== 'laser') smashObject(w, kind, o);
      ring(w, w.camX + PX, p.y, art.POWERUPS.shield.color, 190, 0.5);
      burst(w, w.camX + PX, p.y, 22, art.POWERUPS.shield.color, 520);
      w.flash = 0.35;
      w.flashColor = art.POWERUPS.shield.color;
      w.hitstop = 0.06;
      addShake(w, 12);
      A.play('shieldPop');
      floatText(w, PX + 50, p.y - 100, 'YOUR MORALER TOOK THE HIT', art.POWERUPS.shield.color, 24);
      return;
    }
    w.cause = kind;
    die(w, hx, hy);
  }

  function nearMiss(w, o, gap) {
    // only counts when it was a real risk: no bonus while shielded by the big bot
    if (o.dead || gap > 20 || w.p.dead || w.attract || w.ultra > 0 || w.p.inv > 0) return;
    if (w.ride && w.ride.type === 'truck') return;
    w.closeCalls++;
    w.coins += 2;
    // pop up above the bot, or above whatever it is driving
    const lift = w.ride ? 52 * art.RIDE_SCALE[w.ride.type] + 34 : 96;
    floatText(w, PX + 30, Math.max(CEIL + 40, w.p.y - lift), pick(QUIP.close) + ' +2', '#ffffff', 22);
    A.play('close');
  }

  function collide(w) {
    const pc = playerCapsule(w);
    const cam = w.camX;
    const tmp = { x1: 0, y1: 0, x2: 0, y2: 0, r: 0 };
    // how far ahead and behind to test: further when driving something big
    const front = Math.max(PX + 140, pc.x2 + pc.r + 30), back = Math.min(PX - 120, pc.x1 - pc.r - 30);

    for (const g of w.gates) {
      if (g.dead) continue;
      const sx1 = g.x1 - cam, sx2 = g.x2 - cam;
      if (Math.min(sx1, sx2) > front || Math.max(sx1, sx2) < back - 20) {
        if (!g.passed && Math.max(sx1, sx2) < PX - 60) {
          g.passed = true;
          nearMiss(w, g, g.minGap);
        }
        continue;
      }
      tmp.x1 = sx1; tmp.y1 = g.y1; tmp.x2 = sx2; tmp.y2 = g.y2; tmp.r = HB.beam;
      let gap = capsuleGap(pc, tmp);
      tmp.x2 = sx1; tmp.y2 = g.y1; tmp.r = HB.node;
      gap = Math.min(gap, capsuleGap(pc, tmp));
      tmp.x1 = sx2; tmp.y1 = g.y2; tmp.x2 = sx2; tmp.y2 = g.y2;
      gap = Math.min(gap, capsuleGap(pc, tmp));
      if (gap < g.minGap) g.minGap = gap;
      if (gap < 0) {
        onHit(w, 'gate', g, (sx1 + sx2) / 2, (g.y1 + g.y2) / 2);
        if (w.p.dead) return;
      }
    }
    for (const d of w.drones) {
      if (d.dead) continue;
      const sx = d.x - cam;
      if (sx < back) {
        if (!d.passed) {
          d.passed = true;
          nearMiss(w, d, d.minGap);
        }
        continue;
      }
      if (sx > front) continue;
      tmp.x1 = tmp.x2 = sx; tmp.y1 = tmp.y2 = d.y; tmp.r = HB.drone;
      const gap = capsuleGap(pc, tmp);
      if (gap < d.minGap) d.minGap = gap;
      if (gap < 0) {
        onHit(w, 'drone', d, sx, d.y);
        if (w.p.dead) return;
      }
    }
    for (const m of w.missiles) {
      if (m.dead) continue;
      if (m.sx < back) {
        if (!m.passed) {
          m.passed = true;
          nearMiss(w, m, m.minGap);
        }
        continue;
      }
      if (m.sx > front + 20) continue;
      tmp.x1 = m.sx - 24; tmp.x2 = m.sx + 20; tmp.y1 = tmp.y2 = m.y; tmp.r = HB.missile;
      const gap = capsuleGap(pc, tmp);
      if (gap < m.minGap) m.minGap = gap;
      if (gap < 0) {
        onHit(w, 'missile', m, m.sx, m.y);
        if (w.p.dead) return;
      }
    }
    for (const l of w.lasers) {
      if (l.phase !== 'fire') continue;
      const k = l.t / l.fire;
      if (k < 0.06 || k > 0.92) continue; // harmless while fading in and out
      tmp.x1 = art.LASER_INSET; tmp.x2 = W - art.LASER_INSET; tmp.y1 = tmp.y2 = l.y; tmp.r = HB.laser;
      if (capsuleGap(pc, tmp) < 0) {
        onHit(w, 'laser', l, PX, l.y);
        if (w.p.dead) return;
      }
    }
  }

  function collect(w, dt) {
    const p = w.p, cam = w.camX;
    const px = cam + PX, py = p.y - 8 * p.scale;
    const reach = w.ride ? 84 * art.RIDE_SCALE[w.ride.type] : HB.coin * p.scale; // a vehicle scoops up a wider path
    const pullR = w.ultra > 0 ? 330 : w.magnet > 0 ? 270 : 0;
    for (const c of w.coinList) {
      if (c.dead) continue;
      const dx = px - c.x, dy = py - c.y;
      if (dx > 400 || dx < -900) continue;
      const dist = Math.hypot(dx, dy);
      if (pullR && dist < pullR) c.pull = Math.max(c.pull, 0.01);
      if (c.pull > 0) {
        c.pull += dt;
        const v = 500 + c.pull * 2600;
        c.x += (dx / (dist || 1)) * v * dt + w.speed * dt;
        c.y += (dy / (dist || 1)) * v * dt;
      }
      if (dist < reach) {
        c.dead = true;
        w.coins += w.rush > 0 ? 2 : 1;
        A.play('coin');
        if (TR.save.data.effects) {
          burst(w, c.x, c.y, 4, '#ffe680', 200, { type: 'dot', grav: 0, life: 0.7, size: 1.2, vx: w.speed });
          ring(w, c.x, c.y, '#ffd23f', 34, 0.22);
        }
        TR.ui.coinPulse();
      }
    }
    const truckOn = w.ride && w.ride.type === 'truck';
    for (const u of w.powerups) {
      if (u.dead) continue;
      // the truck drives straight past other rides and the big bot: it is already the best thing
      if (truckOn && (u.type === 'ultra' || art.POWERUPS[u.type].ride)) continue;
      const y = u.y + Math.sin(u.ph + w.t * 3) * 8;
      if (Math.hypot(px - u.x, p.y - 10 - y) < (w.ride ? 92 * art.RIDE_SCALE[w.ride.type] : HB.power * p.scale)) {
        u.dead = true;
        grant(w, u.type, u.x, y);
      }
    }
    for (const l of w.letterList) {
      if (l.dead) continue;
      const y = l.y + Math.sin(l.ph + w.t * 3) * 8;
      if (Math.hypot(px - l.x, p.y - 10 - y) < (w.ride ? 92 * art.RIDE_SCALE[w.ride.type] : HB.letter * p.scale)) {
        l.dead = true;
        collectLetter(w, l, y);
      }
    }
  }

  // one more letter of T-E-C-H. The fourth calls in The F-150.
  function collectLetter(w, l, y) {
    const p = w.p, n = w.tech++, x = l.x;
    const col = art.POWERUPS.truck.color;
    w.have[l.i] = true;
    ring(w, x, y, col, 150, 0.45);
    burst(w, x, y, 16, col, 460, { grav: 200 });
    w.flash = Math.max(w.flash, 0.22);
    w.flashColor = col;
    A.play('letter', n);
    if (w.tech < 4) {
      const lift = w.ride ? 52 * art.RIDE_SCALE[w.ride.type] + 40 : 104 * p.scale;
      const word = w.have.map((h, i) => (h ? art.TECH[i] : '_')).join(' ');
      floatText(w, PX + 40, Math.max(CEIL + 44, p.y - lift), word, col, 32);
      if (n === 0) TR.ui.banner('SPELL T-E-C-H', 'Grab all four letters. Something huge is coming.', col);
    } else if (w.ultra > 0) {
      // the big bot finishes its turn first
      w.truckPending = true;
      floatText(w, PX + 40, Math.max(CEIL + 44, p.y - 200), 'T E C H!  F-150 INBOUND', col, 30);
    } else grant(w, 'truck', w.camX + PX, p.y);
  }

  function grant(w, type, x, y) {
    const def = art.POWERUPS[type];
    if (def.ride) {
      const truck = type === 'truck', dur = truck ? TRUCK_T : RIDE_T;
      w.ultra = 0;
      w.ride = { type, t: dur, dur, jumps: 0, dir: 1, flip: 1, spin: 0, jet: 0, whip: 0 };
      addShake(w, truck ? 16 : 8);
      if (truck) {
        w.tech = 4;
        w.have = [true, true, true, true];
        w.letterList.length = 0;
        w.trucks++;
        w.truckPending = false;
        w.hitstop = 0.1;
        A.play('horn');
      }
    } else if (type === 'shield') w.shield = true;
    else w[type] = DUR[type];
    if (type === 'ultra') w.ride = null;
    if (type === 'ultra') {
      addShake(w, 14);
      w.hitstop = 0.08;
    }
    w.flash = 0.4;
    w.flashColor = def.color;
    ring(w, x, y, def.color, 220, 0.5);
    burst(w, x, y, 20, def.color, 520, { grav: 200 });
    A.play('powerup');
    TR.ui.banner(def.name, def.desc, def.color);
  }
  G.grant = (type) => G.w && grant(G.w, type, G.w.camX + PX, G.w.p.y);

  /* =====================================================================
   *  UPDATE
   * ===================================================================== */
  function step(w, dt) {
    w.t += dt;
    const p = w.p;
    const alive = !p.dead;

    if (alive) {
      const dm = w.dist / RAMP_M * w.diff.ramp;
      w.d = w.attract ? 0 : clamp(dm, 0, 1);
      let target = w.attract ? 330 : lerp(SPEED_START, SPEED_MAX, smooth(w.d)) * w.diff.speed;
      if (w.ultra > 0) target *= 1.5;
      w.speed = damp(w.speed, target, 2.2, dt);
      updatePlayer(w, dt);
    } else if (G.state === 'dying') {
      updateDying(w, dt);
    }
    w.camX += w.speed * dt;
    w.dist = w.camX / PPM;
    const cam = w.camX;

    if (alive) {
      if (w.hold) {
        if (!w.lasers.length) w.hold = false;
        else w.spawnX = Math.max(w.spawnX, cam + W + 240);
      }
      spawnAhead(w);
      if (!w.attract && w.ultra <= 0 && w.t > w.nextEvent && !w.lasers.length && !w.warnings.length) startEvent(w);
      for (const k of ['magnet', 'rush', 'ultra']) {
        if (w[k] > 0) {
          w[k] -= dt;
          if (w[k] <= 0) {
            w[k] = 0;
            A.play('powerdown');
            if (k === 'ultra') {
              p.inv = 1.6; // a moment to get your bearings after shrinking back
              ring(w, cam + PX, p.y, art.POWERUPS.ultra.color, 200, 0.45);
              if (w.truckPending) grant(w, 'truck', cam + PX, p.y); // T-E-C-H was finished as the big bot
            }
          }
        }
      }
    }

    // --- hazards ---
    for (const g of w.gates) poseGate(g, w.t);
    for (const d of w.drones) d.y = d.baseY + Math.sin(d.ph + d.sp * w.t) * d.amp;

    for (const wn of w.warnings) {
      if (wn.delay > 0) {
        wn.delay -= dt;
        if (wn.delay <= 0) wn.y = p.y;
        continue;
      }
      wn.t += dt;
      if (wn.t < 1.1) {
        wn.y = damp(wn.y, clamp(p.y - 6, CEIL + 34, FLOOR - 34), 5.5, dt);
        wn.beep -= dt;
        if (wn.beep <= 0 && alive) {
          A.play('warn');
          wn.beep = 0.28;
        }
      } else if (!wn.locked) {
        wn.locked = true;
        if (alive) A.play('lock');
      } else if (wn.t > 1.55) {
        wn.done = true;
        w.missiles.push({
          id: nextId++, sx: W + 90, y: wn.y, vx: -(940 + w.d * 260), dead: false, minGap: 1e9, passed: false,
        });
        if (alive) A.play('missile');
      }
    }
    for (const m of w.missiles) {
      m.sx += m.vx * dt;
      if (chance(dt * 50)) smoke(w, cam + m.sx + 46, m.y, 1, w.speed + 120, 0, 0.7);
      if (m.sx < -140) m.dead = true;
    }
    for (const l of w.lasers) {
      if (l.phase === 'wait') {
        l.delay -= dt;
        if (l.delay <= 0) {
          l.phase = 'in';
          l.t = 0;
        }
        continue;
      }
      l.t += dt;
      if (l.phase === 'in' && l.t >= 0.45) {
        l.phase = 'charge';
        l.t = 0;
      } else if (l.phase === 'charge') {
        if (!l.snd && l.t >= l.charge - 1.2) {
          l.snd = true;
          if (alive) A.play('charge');
        }
        if (l.t >= l.charge) {
          l.phase = 'fire';
          l.t = 0;
          if (alive) {
            A.play('laser');
            addShake(w, 5);
          }
        }
      } else if (l.phase === 'fire' && l.t >= l.fire) {
        l.phase = 'out';
        l.t = 0;
      } else if (l.phase === 'out' && l.t >= 0.4) l.dead = true;
    }

    if (alive) {
      collide(w);
      if (!p.dead) collect(w, dt);
    }

    // --- tidy up things that have left the screen ---
    const gone = cam - 260;
    w.gates = w.gates.filter((g) => !g.dead && g.cx + g.hl > gone);
    w.drones = w.drones.filter((d) => !d.dead && d.x > gone);
    w.coinList = w.coinList.filter((c) => !c.dead && c.x > gone);
    w.powerups = w.powerups.filter((u) => !u.dead && u.x > gone);
    w.letterList = w.letterList.filter((l) => !l.dead && l.x > gone);
    w.missiles = w.missiles.filter((m) => !m.dead);
    w.lasers = w.lasers.filter((l) => !l.dead);
    w.warnings = w.warnings.filter((x) => !x.done);

    // --- particles / text / screen effects ---
    for (const q of w.parts) {
      q.age += dt;
      q.vy += q.grav * dt;
      const dr = Math.exp(-q.drag * dt);
      q.vx *= dr;
      q.vy *= dr;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.type === 'shard' && q.y > FLOOR - 4 && q.vy > 0) {
        q.y = FLOOR - 4;
        q.vy *= -0.4;
        q.vx *= 0.6;
      }
      if (q.rot != null) q.rot += q.vr * dt;
    }
    w.parts = w.parts.filter((q) => q.age < q.life && q.x > cam - 200);
    for (const t of w.texts) t.age += dt;
    w.texts = w.texts.filter((t) => t.age < t.life);
    for (const tr of w.trail) tr.age += dt;
    w.shake = Math.max(0, w.shake - dt * 60 - w.shake * dt * 4);
    w.flash = Math.max(0, w.flash - dt * 2.4);

    // --- zones ---
    if (!w.attract && alive) {
      const z = Math.floor(w.dist / ZONE_M);
      if (z !== w.zone) {
        w.prevZone = w.zone;
        w.zone = z;
        w.zoneMix = 0;
        art.getTheme(z);
        art.prewarm(z + 1);
        const th = art.THEMES[z % art.THEMES.length];
        TR.ui.banner('HOUR ' + z * 8, QUIP.hours[z] || 'Overtime. Nobody told the robot to stop.', th.accent);
        A.play('zone');
      }
      if (!w.made46 && w.dist >= 46 * HOUR_M) {
        w.made46 = true;
        w.coins += 46;
        TR.ui.banner('46 HOURS!', "You may now sit down. (You won't.)", '#ffd23f');
        floatText(w, PX + 60, p.y - 100, '46-HOUR BONUS +46', '#ffd23f', 34);
        for (const col of ['#ffd23f', '#38d6ff', '#ff7ad9', '#a6e22e']) burst(w, cam + PX + rand(0, 500), rand(200, 500), 22, col, 620, { grav: 300 });
        w.flash = 0.5;
        w.flashColor = '#ffd23f';
        A.play('best');
      }
      // racing past your own record
      if (!w.bestPassed && w.bestM >= 100 && w.dist > w.bestM) {
        w.bestPassed = true;
        floatText(w, PX + 40, p.y - 90, 'NEW BEST!', '#ffd23f', 34);
        burst(w, cam + PX, p.y, 26, '#ffd23f', 600, { grav: 300 });
        A.play('best');
      }
    }
    if (w.zoneMix < 1) w.zoneMix = Math.min(1, w.zoneMix + dt / 1.5);
  }

  G.update = function (dt) {
    const w = G.w;
    if (!w || G.state === 'paused' || G.state === 'boot') return;
    if (w.hitstop > 0) {
      w.hitstop -= dt;
      return;
    }
    // split long frames so fast objects can't skip through each other
    const n = dt > 1 / 80 ? 2 : 1;
    for (let i = 0; i < n; i++) step(w, dt / n);
  };

  /* =====================================================================
   *  DRAW
   * ===================================================================== */
  function drawParticles(ctx, w, additive) {
    const cam = w.camX;
    for (const q of w.parts) {
      const add = q.type === 'spark' || q.type === 'dot' || q.type === 'ring';
      if (add !== additive) continue;
      const k = q.age / q.life, x = q.x - cam;
      if (x < -60 || x > W + 60) continue;
      if (q.type === 'spark') {
        ctx.strokeStyle = q.color;
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = q.size * (1 - k * 0.6);
        ctx.beginPath();
        ctx.moveTo(x, q.y);
        ctx.lineTo(x - q.vx * 0.035, q.y - q.vy * 0.035);
        ctx.stroke();
      } else if (q.type === 'dot') {
        art.glow(ctx, x, q.y, q.size * (1.6 - k), q.color, 1 - k);
      } else if (q.type === 'ring') {
        ctx.strokeStyle = q.color;
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.lineWidth = 5 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(x, q.y, q.size * easeOut(k), 0, TAU);
        ctx.stroke();
      } else if (q.type === 'smoke') {
        ctx.fillStyle = q.color;
        ctx.globalAlpha = 0.22 * (1 - k);
        ctx.beginPath();
        ctx.arc(x, q.y, q.size * (0.6 + k * 1.3), 0, TAU);
        ctx.fill();
      } else if (q.type === 'shard' || q.type === 'confetti') {
        ctx.save();
        ctx.translate(x, q.y);
        ctx.rotate(q.rot);
        ctx.globalAlpha = k > 0.75 ? (1 - k) * 4 : 1;
        ctx.fillStyle = q.color;
        if (q.type === 'confetti') ctx.fillRect(-q.size, -q.size * 0.45 * Math.cos(q.age * 9 + q.rot), q.size * 2, q.size * 0.9 * Math.cos(q.age * 9 + q.rot));
        else ctx.fillRect(-q.size, -q.size * 0.6, q.size * 2, q.size * 1.2);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawHitboxes(ctx, w) {
    const cam = w.camX;
    ctx.save();
    ctx.lineWidth = 2;
    const cap = (c, col) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = c.r * 2;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(c.x1, c.y1);
      ctx.lineTo(c.x2 + 0.01, c.y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    for (const g of w.gates) {
      cap({ x1: g.x1 - cam, y1: g.y1, x2: g.x2 - cam, y2: g.y2, r: HB.beam }, '#ff3030');
      cap({ x1: g.x1 - cam, y1: g.y1, x2: g.x1 - cam, y2: g.y1, r: HB.node }, '#ff3030');
      cap({ x1: g.x2 - cam, y1: g.y2, x2: g.x2 - cam, y2: g.y2, r: HB.node }, '#ff3030');
    }
    for (const d of w.drones) cap({ x1: d.x - cam, y1: d.y, x2: d.x - cam, y2: d.y, r: HB.drone }, '#ff3030');
    for (const m of w.missiles) cap({ x1: m.sx - 24, y1: m.y, x2: m.sx + 20, y2: m.y, r: HB.missile }, '#ff3030');
    for (const l of w.lasers)
      if (l.phase === 'fire') cap({ x1: art.LASER_INSET, y1: l.y, x2: W - art.LASER_INSET, y2: l.y, r: HB.laser }, '#ff3030');
    cap(playerCapsule(w), '#30ff60');
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffe030';
    ctx.beginPath();
    ctx.arc(PX, w.p.y - 8 * w.p.scale, HB.coin * w.p.scale, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  G.render = function (ctx, snap) {
    const w = G.w;
    if (!w) return;
    const cam = w.camX, p = w.p, t = w.t;
    const big = w.ultra > 0 || p.scale > 1.08;
    const skin = big ? art.TUB : art.skin(TR.save.data.skin);

    ctx.save();
    if (w.shake > 0.3) ctx.translate(rand(-1, 1) * w.shake * 0.5, rand(-1, 1) * w.shake * 0.5);

    // --- scenery ---
    if (w.zoneMix < 1) {
      art.drawBackground(ctx, cam, art.getTheme(w.prevZone), snap, t);
      ctx.globalAlpha = smooth(w.zoneMix);
      art.drawBackground(ctx, cam, art.getTheme(w.zone), snap, t);
      ctx.globalAlpha = 1;
    } else art.drawBackground(ctx, cam, art.getTheme(w.zone), snap, t);

    // --- record marker ---
    if (w.bestM >= 100) {
      const bx = w.bestM * PPM - cam + PX;
      if (bx > -80 && bx < W + 80) {
        ctx.setLineDash([10, 10]);
        ctx.strokeStyle = 'rgba(255,210,63,0.7)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bx, CEIL + 4);
        ctx.lineTo(bx, FLOOR - 2);
        ctx.stroke();
        ctx.setLineDash([]);
        art.rr(ctx, bx - 46, CEIL + 14, 92, 30, 6);
        ctx.fillStyle = '#ffd23f';
        ctx.fill();
        ctx.fillStyle = '#231a00';
        ctx.font = '700 17px ' + art.FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('BEST ' + w.bestM + ' m', bx, CEIL + 30);
      }
    }

    // --- pickups ---
    for (const c of w.coinList) {
      const x = c.x - cam;
      if (x < -30 || x > W + 30) continue;
      art.drawCoin(ctx, x, c.y + Math.sin(c.ph * 3 + t * 4) * 2.5, t * 15 + c.ph * 8, w.rush > 0 ? 38 : 34);
    }
    if (w.rush > 0) {
      for (const c of w.coinList) {
        const x = c.x - cam;
        if (x > -30 && x < W + 30) art.glow(ctx, x, c.y, 26, '#ffd23f', 0.35);
      }
    }
    for (const u of w.powerups) {
      const x = u.x - cam;
      if (x > -80 && x < W + 80) art.drawPowerup(ctx, x, u.y + Math.sin(u.ph + t * 3) * 8, u.type, t);
    }
    for (const l of w.letterList) {
      const x = l.x - cam;
      if (x > -90 && x < W + 90) art.drawLetter(ctx, x, l.y + Math.sin(l.ph + t * 3) * 8, l.ch, t);
    }

    // --- hazards ---
    for (const l of w.lasers) {
      if (l.phase === 'wait') continue;
      const dur = l.phase === 'in' ? 0.45 : l.phase === 'charge' ? l.charge : l.phase === 'fire' ? l.fire : 0.4;
      art.drawLaser(ctx, l.y, l.phase, clamp(l.t / dur, 0, 1), t, l.id);
    }
    for (const g of w.gates) {
      const a = Math.min(g.x1, g.x2) - cam, b = Math.max(g.x1, g.x2) - cam;
      if (b < -60 || a > W + 60) continue;
      art.drawGate(ctx, g.x1 - cam, g.y1, g.x2 - cam, g.y2, t, g.id);
    }
    for (const d of w.drones) {
      const x = d.x - cam;
      if (x > -60 && x < W + 60) art.drawDrone(ctx, x, d.y, t, d.id);
    }
    for (const m of w.missiles) art.drawMissile(ctx, m.sx, m.y, t);

    drawParticles(ctx, w, false);

    // --- the runner ---
    const intro = w.attract ? 0 : (1 - easeOut(Math.min(1, t / 0.75))) * 400;
    const rx = PX - intro;
    // soft shadow on the floor
    const hgt = clamp((FLOOR - FOOT * p.scale - p.y) / 480, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,' + (0.42 - hgt * 0.3) + ')';
    ctx.beginPath();
    ctx.ellipse(rx - 2 + (w.ride && !p.dead ? art.RIDE_DX[w.ride.type] : 0), FLOOR + 5, (30 - hgt * 12) * p.scale * (w.ride && !p.dead ? 2.6 * art.RIDE_SCALE[w.ride.type] : 1), (6 - hgt * 2.5) * p.scale, 0, 0, TAU);
    ctx.fill();
    if (p.thrust > 0.1 && !p.dead) {
      // the flame lights the floor beneath it
      art.glow(ctx, rx - 22, FLOOR + 2, 90 * (1 - hgt * 0.7) * p.scale, skin.flame, 0.55 * p.thrust * (1 - hgt * 0.8));
    }
    const st = {
      x: rx, y: p.y, rot: p.rot, sx: p.sx, sy: p.sy, scale: p.scale, phase: p.phase, ground: p.dead ? 0 : p.ground,
      thrust: p.thrust, vy: p.vy, t, blink: p.blink, ant: p.ant, dead: p.dead, ultra: big,
    };
    if (w.ultra > 0) {
      art.glow(ctx, rx, p.y - 10, 230, art.TUB.trim, 0.3 + 0.08 * Math.sin(t * 12));
      art.glow(ctx, rx, p.y - 10, 130, art.TUB.accent, 0.12);
      for (let i = 0; i < w.trail.length - 1; i += 2) {
        const tr = w.trail[i];
        ctx.globalAlpha = 0.08 + 0.04 * i;
        art.drawRobot(ctx, Object.assign({}, st, { x: rx - (w.trail.length - i) * 22, y: tr.y, rot: tr.rot, thrust: 0 }), skin);
      }
      ctx.globalAlpha = 1;
    }
    const ride = p.dead ? null : w.ride;
    const blinkOut = p.inv > 0 && !p.dead && Math.sin(t * 38) > 0.2;
    // warn when the big bot is about to run out
    const ultraEnding = w.ultra > 0 && w.ultra < 1.6 && Math.sin(t * 30) > 0.3;
    ctx.globalAlpha = blinkOut || ultraEnding ? 0.4 : 1;
    // a ride that is about to run out flickers
    const rideEnding = ride && ride.t < 1.6 && Math.sin(t * 30) > 0.3;
    if (ride) {
      // the vehicle is drawn around its own centre; the bot sits inside it
      const seat = art.SEATS[ride.type];
      const flip = Math.abs(ride.flip) < 0.06 ? 0.06 : ride.flip;
      const S = art.RIDE_SCALE[ride.type];
      if (rideEnding) ctx.globalAlpha = 0.45;
      ctx.save();
      ctx.translate(rx + art.RIDE_DX[ride.type], p.y);
      ctx.rotate(p.rot);
      ctx.scale(p.sx * S, p.sy * flip * S);
      art.drawRideBack(ctx, ride, t);
      art.drawRobot(ctx, Object.assign({}, st, { x: seat.x, y: seat.y, rot: 0, sx: 1, sy: 1, scale: seat.s, ground: 0, vy: 0, thrust: 0 }), skin);
      art.drawRideFront(ctx, ride, t);
      ctx.restore();
    } else art.drawRobot(ctx, st, skin);
    ctx.globalAlpha = 1;

    // (no bubble round the truck: it would not fit, and the truck does not need one)
    if (w.shield && !p.dead && !(ride && ride.type === 'truck')) {
      const col = art.POWERUPS.shield.color;
      // the bubble wraps whatever the bot is riding too
      const r = ride ? 100 * art.RIDE_SCALE[ride.type] : 62 * p.scale, cy = ride ? p.y - 6 : p.y - 10 * p.scale;
      const grd = ctx.createRadialGradient(rx, cy, r * 0.55, rx, cy, r);
      grd.addColorStop(0, art.rgba(col, 0));
      grd.addColorStop(0.85, art.rgba(col, 0.2));
      grd.addColorStop(1, art.rgba(col, 0.6));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(rx, cy, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = art.rgba(col, 0.9);
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(rx, cy, r - 7, t * 2, t * 2 + 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rx, cy, r - 7, t * 2 + Math.PI, t * 2 + Math.PI + 0.5);
      ctx.stroke();
    }
    if (w.magnet > 0 && !p.dead) {
      const col = art.POWERUPS.magnet.color;
      for (let i = 0; i < 3; i++) {
        const k = 1 - ((t * 0.9 + i / 3) % 1);
        ctx.strokeStyle = art.rgba(col, (1 - k) * 0.5);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(rx, p.y - 8, 30 + k * 150, 0, TAU);
        ctx.stroke();
      }
    }

    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    drawParticles(ctx, w, true);
    ctx.globalCompositeOperation = prev;

    if (TR.save.data.hitboxes) drawHitboxes(ctx, w);
    ctx.restore();

    // --- overlays that don't shake ---
    for (const wn of w.warnings) if (wn.delay <= 0) art.drawWarning(ctx, wn.y, t, wn.locked);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const ft of w.texts) {
      const k = ft.age / ft.life;
      const pop = k < 0.14 ? U.easeOutBack(k / 0.14) : 1;
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.font = '700 ' + Math.round(ft.size * pop) + 'px ' + art.FONT;
      const y = ft.y - easeOut(k) * 46;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(6,10,26,0.9)';
      ctx.strokeText(ft.text, ft.x, y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, y);
    }
    ctx.globalAlpha = 1;

    if (w.ultra > 0) {
      // speed streaks
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const y = CEIL + 30 + ((i * 137.5 + Math.floor(t * 9 + i) * 61) % (FLOOR - CEIL - 60));
        const x = W - ((t * 2600 + i * 311) % (W + 400));
        ctx.moveTo(x, y);
        ctx.lineTo(x + 200, y);
      }
      ctx.stroke();
    }
    art.drawVignette(ctx);
    if (w.flash > 0.01) {
      ctx.fillStyle = art.rgba(w.flashColor, Math.min(0.6, w.flash * 0.6));
      ctx.fillRect(0, 0, W, H);
    }
  };

  /* =====================================================================
   *  FLOW
   * ===================================================================== */
  G.toMenu = function () {
    G.w = newWorld(true);
    G.state = 'menu';
    art.getTheme(0);
    A.setThrust(0);
    A.setMusicIntensity(0);
  };

  G.start = function () {
    G.w = newWorld(false);
    G.state = 'playing';
    art.getTheme(0);
    art.prewarm(1);
    A.play('start');
    A.setMusicIntensity(1);
    TR.ui.hint(true);
    TR.ui.banner('HOUR 0', '46 hours. No sitting. No sleeping. Go!', '#38d6ff');
  };

  G.pause = function () {
    if (G.state !== 'playing') return;
    G.state = 'paused';
    A.setThrust(0);
    A.setMusicIntensity(0.2);
    TR.ui.showPause(true);
  };
  G.resume = function () {
    if (G.state !== 'paused') return;
    G.state = 'playing';
    A.setMusicIntensity(1);
    TR.ui.showPause(false);
  };

  // celebration on the results screen
  G.confetti = function () {
    const w = G.w;
    if (!w) return;
    const cols = ['#ffd23f', '#38d6ff', '#a6e22e', '#ff7ad9', '#ffffff'];
    for (let i = 0; i < 90; i++)
      w.parts.push({
        type: 'confetti', age: 0, x: w.camX + rand(0, W), y: rand(-200, -10), vx: rand(-80, 80), vy: rand(120, 320),
        life: rand(2.4, 4), size: rand(4, 8), color: pick(cols), grav: 160, drag: 0.6, rot: rand(0, TAU), vr: rand(-6, 6),
      });
  };
})();
