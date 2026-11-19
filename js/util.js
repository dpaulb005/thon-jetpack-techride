/* Techride — shared helpers: math, collision, random, save data. */
(function () {
  'use strict';
  const TR = (window.TR = window.TR || {});

  // Logical resolution. Everything in the game is laid out in these units and
  // scaled to the window, so it looks the same on any screen.
  TR.W = 1280;
  TR.H = 720;
  TR.CEIL = 64; // bottom edge of the ceiling slab
  TR.FLOOR = 636; // top edge of the floor slab
  TR.PLAYER_X = 300; // the runner's fixed screen x
  TR.PX_PER_M = 30;

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;
  // frame-rate independent smoothing toward a target
  const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
  const smooth = (t) => t * t * (3 - 2 * t);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeOutBack = (t) => {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  };

  function weighted(items) {
    // items: [[weight, value], ...]
    let total = 0;
    for (const it of items) total += it[0];
    let r = Math.random() * total;
    for (const it of items) {
      r -= it[0];
      if (r <= 0) return it[1];
    }
    return items[items.length - 1][1];
  }

  // Small seeded generator so generated scenery is identical every time.
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- collision ----------
   * Every collider in the game is a capsule: a line segment with a radius.
   * (A circle is a capsule whose two ends are the same point.) Two capsules
   * touch when the closest distance between their segments is less than the
   * sum of their radii — exact, cheap, and it matches the rounded shapes
   * that are actually drawn.
   */
  function segSegDist2(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1x = bx - ax, d1y = by - ay;
    const d2x = dx - cx, d2y = dy - cy;
    const rx = ax - cx, ry = ay - cy;
    const a = d1x * d1x + d1y * d1y;
    const e = d2x * d2x + d2y * d2y;
    const f = d2x * rx + d2y * ry;
    const EPS = 1e-9;
    let s, t;
    if (a <= EPS && e <= EPS) return rx * rx + ry * ry;
    if (a <= EPS) {
      s = 0;
      t = clamp(f / e, 0, 1);
    } else {
      const c = d1x * rx + d1y * ry;
      if (e <= EPS) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else {
        const b = d1x * d2x + d1y * d2y;
        const den = a * e - b * b;
        s = den > EPS ? clamp((b * f - c * e) / den, 0, 1) : 0;
        t = (b * s + f) / e;
        if (t < 0) {
          t = 0;
          s = clamp(-c / a, 0, 1);
        } else if (t > 1) {
          t = 1;
          s = clamp((b - c) / a, 0, 1);
        }
      }
    }
    const px = ax + d1x * s - (cx + d2x * t);
    const py = ay + d1y * s - (cy + d2y * t);
    return px * px + py * py;
  }

  // Gap between two capsules' surfaces (negative = overlapping).
  function capsuleGap(a, b) {
    return Math.sqrt(segSegDist2(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2)) - a.r - b.r;
  }

  TR.util = {
    TAU, clamp, lerp, rand, randInt, pick, chance, damp, smooth, easeOut, easeOutBack,
    weighted, seeded, segSegDist2, capsuleGap,
  };

  /* ---------- save data ---------- */
  const KEY = 'techride.save.v1';
  const defaults = () => ({
    best: 0,
    bank: 0,
    skin: 'bolt',
    owned: ['bolt'],
    difficulty: 1,
    sfx: 0.8,
    music: 0.45,
    shake: true,
    effects: true,
    hitboxes: false,
    name: '',
    board: [],
    stats: { runs: 0, dist: 0, coins: 0 },
    seenHelp: false,
  });

  const save = {
    data: defaults(),
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const d = JSON.parse(raw);
          if (d && typeof d === 'object') {
            const base = defaults();
            this.data = Object.assign(base, d);
            this.data.stats = Object.assign(defaults().stats, d.stats || {});
            if (!Array.isArray(this.data.board)) this.data.board = [];
            if (!Array.isArray(this.data.owned) || !this.data.owned.length) this.data.owned = ['bolt'];
          }
        }
      } catch (e) {
        this.data = defaults();
      }
    },
    write() {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch (e) {
        /* private mode or storage blocked: the game still works, it just won't remember */
      }
    },
    reset() {
      const keep = { sfx: this.data.sfx, music: this.data.music, shake: this.data.shake, effects: this.data.effects };
      this.data = Object.assign(defaults(), keep);
      this.write();
    },
    // Would this distance make the top 10?
    qualifies(dist) {
      if (dist < 50) return false;
      const b = this.data.board;
      return b.length < 10 || dist > b[b.length - 1].dist;
    },
    addScore(entry) {
      const b = this.data.board;
      b.push(entry);
      b.sort((x, y) => y.dist - x.dist);
      if (b.length > 10) b.length = 10;
      this.write();
      return b.indexOf(entry);
    },
  };
  TR.save = save;
})();
