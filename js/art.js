/* Techride — every visual is drawn in code (vector shapes on canvas), so the
 * art is original, razor sharp at any screen size, and each hitbox can match
 * the shape that is actually on screen. */
(function () {
  'use strict';
  const TR = window.TR;
  const { TAU, clamp, lerp, seeded } = TR.util;
  const W = TR.W, H = TR.H, CEIL = TR.CEIL, FLOOR = TR.FLOOR;

  const OUTLINE = '#080d1f';
  const FONT = '"Chakra Petch", "Segoe UI", system-ui, sans-serif';
  const HAZARD = '#ff4757'; // everything dangerous glows this red
  const LASER = '#ff2e88';

  const art = (TR.art = { OUTLINE, FONT, HAZARD, LASER });

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w);
    c.height = Math.ceil(h);
    return c;
  }

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  art.rgba = rgba;

  // rounded rectangle path
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
  art.rr = rr;

  function vgrad(ctx, y0, y1, c0, c1) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    return g;
  }

  /* ---------- soft glow sprites (cached per colour) ---------- */
  const glowCache = {};
  function glowSprite(color) {
    let c = glowCache[color];
    if (c) return c;
    c = glowCache[color] = makeCanvas(96, 96);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(48, 48, 0, 48, 48, 48);
    grad.addColorStop(0, rgba(color, 0.9));
    grad.addColorStop(0.25, rgba(color, 0.45));
    grad.addColorStop(0.6, rgba(color, 0.12));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 96, 96);
    return c;
  }
  // additive glow blob
  function glow(ctx, x, y, r, color, alpha) {
    const prev = ctx.globalCompositeOperation;
    const pa = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = pa * (alpha == null ? 1 : alpha);
    ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = pa;
    ctx.globalCompositeOperation = prev;
  }
  art.glow = glow;

  /* =====================================================================
   *  THE RUNNER
   * ===================================================================== */
  art.SKINS = [
    { id: 'bolt', name: 'TECHBOT', blurb: 'The original. Held together by duct tape and good intentions.', cost: 0,
      body: '#a6e22e', bodyLo: '#5f9a12', limb: '#dfe6f2', limbLo: '#8e99b3', pack: '#4a556f', packLo: '#262e45',
      eye: '#4aa8ff', accent: '#4aa8ff', flame: '#38d6ff', flameCore: '#eaffff' },
    // `kit` picks the bot's gear and face (see the kit* functions below);
    // `head` recolours the helmet; `sparks` are the exhaust colours.
    { id: 'ember', name: 'COLD BREW', blurb: 'Hour 30 energy. Runs on caffeine and spite.', cost: 150, kit: 'brew',
      body: '#ff8a3d', bodyLo: '#c2501a', head: '#7a4a28', headLo: '#2e1a0e',
      limb: '#f3e3d3', limbLo: '#a58a78', pack: '#4f4450', packLo: '#2a2230',
      eye: '#ffe066', accent: '#ffe066', flame: '#ffb020', flameCore: '#fff6d6' },
    { id: 'frost', name: 'ICE BATH', blurb: 'What every pair of feet dreams about at 4 AM. Duck included.', cost: 300, kit: 'ice',
      body: '#7fd8ff', bodyLo: '#2f86c9', limb: '#f1f7ff', limbLo: '#97a9c7', pack: '#3d5578', packLo: '#1e2c47',
      eye: '#ffffff', accent: '#c9f2ff', flame: '#9fe8ff', flameCore: '#ffffff', sparks: ['#9fe8ff', '#ffffff'] },
    { id: 'violet', name: 'GLOW STICK', blurb: 'Cracked, shaken, and ready for the line dance.', cost: 500, kit: 'glow',
      body: '#2a2050', bodyLo: '#0f0a22', limb: '#3df5ff', limbLo: '#b32fc4', pack: '#2b2350', packLo: '#120e26',
      eye: '#ffe93d', accent: '#ff3df2', flame: '#ff3df2', flameCore: '#ffffff',
      sparks: ['#ff3df2', '#3df5ff', '#b6ff3c', '#ffe93d'] },
    { id: 'stealth', name: 'STAGE CREW', blurb: 'All black. If you can see it, something went wrong.', cost: 800, kit: 'crew',
      body: '#3a4258', bodyLo: '#1b2031', limb: '#59627a', limbLo: '#2c3347', pack: '#22283a', packLo: '#10141f',
      eye: '#ff4757', accent: '#ff4757', flame: '#ff6a5c', flameCore: '#ffe9e0' },
    { id: 'gold', name: 'TOTAL REVEAL', blurb: 'Solid gold. Funded entirely by spare change.', cost: 1500, kit: 'gold',
      body: '#ffd23f', bodyLo: '#c98a10', limb: '#fff3c4', limbLo: '#b99a4a', pack: '#6b5524', packLo: '#3a2d10',
      eye: '#ffffff', accent: '#fff3a0', flame: '#ffe066', flameCore: '#ffffff',
      sparks: ['#ffd23f', '#fff3a0', '#ffffff', '#ff8fb1'] },
  ];
  art.skin = (id) => art.SKINS.find((s) => s.id === id) || art.SKINS[0];

  // Party-light colours for the Glow Stick bot; they step round in time.
  const NEON = ['#ff3df2', '#3df5ff', '#b6ff3c', '#ffe93d'];
  const neon = (t, k) => NEON[(((Math.floor(t * 2.2) + k) % 4) + 4) % 4];

  function limb(ctx, x0, y0, x1, y1, bend, width, color) {
    // a bent tube: dark outline first, colour on top
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const kx = mx + (dy / len) * bend, ky = my - (dx / len) * bend;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(kx, ky, x1, y1);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = width + 4.5;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function fillStroke(ctx, fill, lw) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = lw || 2.5;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }

  function flame(ctx, x, y, len, width, outer, core, t) {
    const flick = 0.82 + 0.1 * Math.sin(t * 61) + 0.08 * Math.sin(t * 37 + 1.3);
    const L = len * flick;
    const sway = Math.sin(t * 23) * 2;
    glow(ctx, x, y + L * 0.45, L * 1.25, outer, 0.75);
    ctx.beginPath();
    ctx.moveTo(x - width, y);
    ctx.quadraticCurveTo(x - width * 1.25, y + L * 0.55, x + sway, y + L);
    ctx.quadraticCurveTo(x + width * 1.25, y + L * 0.55, x + width, y);
    ctx.closePath();
    ctx.fillStyle = rgba(outer, 0.92);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - width * 0.55, y);
    ctx.quadraticCurveTo(x - width * 0.7, y + L * 0.35, x + sway * 0.5, y + L * 0.62);
    ctx.quadraticCurveTo(x + width * 0.7, y + L * 0.35, x + width * 0.55, y);
    ctx.closePath();
    ctx.fillStyle = core;
    ctx.fill();
  }

  /* ---------- skin kits ----------
   * Each skin is more than a colour swap: its `kit` adds gear and a face of
   * its own. All of it is decoration; the hitbox is the same for every skin.
   * Coordinates are the bot's own (origin at the centre of the torso). */
  function star4(ctx, x, y, r, r2) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU - Math.PI / 2, rad = i % 2 ? r2 : r;
      ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath();
  }
  function dot(ctx, x, y, r, fill) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  // a line with the dark outline under it, like the limbs
  function tube(ctx, w, color) {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = w + 3.2;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke();
  }

  // drawn over the standard jetpack
  function kitPack(ctx, skin, t) {
    const kit = skin.kit;
    if (kit === 'brew') {
      // a steel thermos with a screw cap and a label
      rr(ctx, -29, -24, 14, 9, 3);
      fillStroke(ctx, skin.packLo, 2.2);
      rr(ctx, -31, -18, 18, 32, 7);
      const mg = ctx.createLinearGradient(-31, 0, -13, 0);
      mg.addColorStop(0, '#7f8a9c');
      mg.addColorStop(0.4, '#f1f4f9');
      mg.addColorStop(1, '#6a7587');
      fillStroke(ctx, mg);
      ctx.fillStyle = skin.body;
      ctx.fillRect(-29.7, -9, 15.4, 9);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(-29.7, -9, 15.4, 1.2);
      ctx.fillRect(-29.7, -1.2, 15.4, 1.2);
    } else if (kit === 'ice') {
      // snow settled on top
      ctx.beginPath();
      ctx.moveTo(-32, -13);
      ctx.quadraticCurveTo(-32, -21, -24, -21);
      ctx.lineTo(-19, -21);
      ctx.quadraticCurveTo(-12, -21, -12, -13);
      ctx.quadraticCurveTo(-15, -10, -18, -14);
      ctx.quadraticCurveTo(-22, -9.5, -26, -14);
      ctx.quadraticCurveTo(-29, -9, -32, -13);
      ctx.closePath();
      fillStroke(ctx, '#f4fbff', 2);
    } else if (kit === 'glow') {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = neon(t, i);
        ctx.fillRect(-28, -12 + i * 7, 10, 2.6);
      }
      glow(ctx, -22, -4, 20, neon(t, 1), 0.4);
    } else if (kit === 'crew') {
      // road case: metal bands and a latch
      ctx.fillStyle = '#59627a';
      ctx.fillRect(-29.7, -15.5, 15.4, 2.2);
      ctx.fillRect(-29.7, 9.3, 15.4, 2.2);
      rr(ctx, -25.5, 0, 7, 7, 1.6);
      fillStroke(ctx, '#9aa4b8', 1.5);
    } else if (kit === 'gold') {
      star4(ctx, -22, 4, 5.2, 2);
      fillStroke(ctx, skin.accent, 1.4);
    }
  }

  // chest decoration, drawn on the plain torso
  function kitTorso(ctx, skin, t, vyN) {
    const kit = skin.kit;
    const panel = (col) => {
      rr(ctx, -2, -6, 13, 13, 4);
      ctx.fillStyle = col || '#0c1430';
      ctx.fill();
    };
    if (kit === 'brew') {
      // cardboard sleeve with a coffee bean on it
      ctx.fillStyle = '#d9a066';
      ctx.fillRect(-13.7, -5, 27.4, 15);
      ctx.fillStyle = 'rgba(70,35,10,0.2)';
      for (let x = -11; x <= 11; x += 3.6) ctx.fillRect(x, -5, 1, 15);
      ctx.fillStyle = 'rgba(40,20,5,0.55)';
      ctx.fillRect(-13.7, -5.6, 27.4, 1.3);
      ctx.fillRect(-13.7, 9.4, 27.4, 1.3);
      ctx.save();
      ctx.translate(4, 2.3);
      ctx.rotate(0.45);
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 5.6, 0, 0, TAU);
      fillStroke(ctx, '#4a2a14', 1.6);
      ctx.beginPath();
      ctx.moveTo(0.6, -4.4);
      ctx.bezierCurveTo(-2.4, -1.5, 2.4, 1.5, -0.6, 4.4);
      ctx.strokeStyle = '#d9a066';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    } else if (kit === 'ice') {
      // a slowly turning snowflake
      panel();
      ctx.strokeStyle = skin.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI + t * 0.6;
        const cx = Math.cos(a) * 4.8, cy = Math.sin(a) * 4.8;
        ctx.moveTo(4.5 - cx, 0.5 - cy);
        ctx.lineTo(4.5 + cx, 0.5 + cy);
      }
      ctx.stroke();
      dot(ctx, 4.5, 0.5, 1.4, '#ffffff');
    } else if (kit === 'glow') {
      // neon piping, an equaliser that bounces to the music, a glow necklace
      rr(ctx, -10.5, -9, 21, 23.5, 6);
      ctx.strokeStyle = neon(t, 0);
      ctx.lineWidth = 1.7;
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const h = 3 + 8 * Math.abs(Math.sin(t * 6.5 + i * 1.3));
        ctx.fillStyle = neon(t, i + 1);
        ctx.fillRect(-6.6 + i * 3.6, 11 - h, 2.4, h);
      }
      glow(ctx, 0, 3, 26, neon(t, 0), 0.4);
      ctx.beginPath();
      ctx.ellipse(1, -14, 10, 5.5, 0, 0.2, Math.PI - 0.2);
      tube(ctx, 2.2, neon(t, 2));
    } else if (kit === 'crew') {
      // a roll of gaffer tape on the hip, a backstage pass on a lanyard
      ctx.beginPath();
      ctx.arc(-8.5, 12.5, 4.4, 0, TAU);
      fillStroke(ctx, '#8e99b3', 1.8);
      dot(ctx, -8.5, 12.5, 1.7, OUTLINE);
      const sw = -vyN * 2.5 + Math.sin(t * 5) * 0.6;
      ctx.beginPath();
      ctx.moveTo(-6, -14);
      ctx.lineTo(3.5 + sw, -1);
      ctx.lineTo(10, -14);
      ctx.strokeStyle = skin.accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      rr(ctx, -1 + sw, -2, 9, 11.5, 1.8);
      fillStroke(ctx, '#f4f6fb', 1.6);
      ctx.fillStyle = skin.accent;
      ctx.fillRect(sw, -1, 7, 3.2);
      ctx.fillStyle = '#59627a';
      ctx.fillRect(0.6 + sw, 4, 5.8, 1.1);
      ctx.fillRect(0.6 + sw, 6.3, 4, 1.1);
    } else if (kit === 'gold') {
      // a donation slot, with a coin forever dropping in
      const k = (t * 1.2) % 1;
      panel('#2a1c05');
      ctx.globalAlpha = Math.min(1, k * 5);
      ctx.beginPath();
      ctx.arc(4.5, -3.4 + k * 6, 3, 0, TAU);
      fillStroke(ctx, skin.accent, 1.3);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#2a1c05';
      ctx.fillRect(0.5, 3.4, 8.5, 2.8);
      ctx.fillStyle = '#000000';
      ctx.fillRect(-0.4, 2.2, 10, 1.7);
    } else {
      // the original: a power light, and the duct tape it was promised
      panel();
      ctx.beginPath(); // bolt glyph
      ctx.moveTo(6, -4);
      ctx.lineTo(1.5, 1.5);
      ctx.lineTo(4.5, 1.5);
      ctx.lineTo(3, 5.5);
      ctx.lineTo(8, -0.5);
      ctx.lineTo(5, -0.5);
      ctx.closePath();
      ctx.fillStyle = skin.accent;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-13.4, 7);
      ctx.lineTo(-4, 10);
      ctx.lineTo(-4, 15.4);
      ctx.lineTo(-13.4, 12.4);
      ctx.closePath();
      fillStroke(ctx, '#b9c0cc', 1.4);
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-10.4, 8.4);
      ctx.lineTo(-10.4, 13);
      ctx.moveTo(-7.2, 9.4);
      ctx.lineTo(-7.2, 14);
      ctx.stroke();
    }
  }

  // drawn behind the helmet; returns true when it stands in for the antenna
  function kitHeadBack(ctx, skin, t, ant) {
    const kit = skin.kit;
    if (kit === 'brew') {
      // bendy straw
      ctx.beginPath();
      ctx.moveTo(-5, -44);
      ctx.lineTo(-8 - ant * 0.7, -59);
      ctx.lineTo(1 - ant, -64.5);
      tube(ctx, 4, '#fff7ea');
      ctx.setLineDash([3, 3.6]);
      ctx.lineCap = 'butt';
      ctx.strokeStyle = skin.body;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineCap = 'round';
      return true;
    }
    if (kit === 'glow') {
      // a pair of glow sticks
      for (const g of [[-9, -15, -62, 0], [7, 13, -60, 2]]) {
        const c = neon(t, g[3]);
        ctx.beginPath();
        ctx.moveTo(g[0], -45);
        ctx.lineTo(g[1] - ant, g[2]);
        tube(ctx, 3.8, c);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        glow(ctx, (g[0] + g[1] - ant) / 2, (g[2] - 45) / 2, 15, c, 0.6);
      }
      return true;
    }
    return kit === 'ice' || kit === 'crew' || kit === 'gold';
  }

  // drawn on the helmet, under the visor
  function kitHeadFront(ctx, skin, ant) {
    const kit = skin.kit;
    if (kit === 'brew') {
      // the head is a cup of cold brew: ice cubes and a lid
      for (const c of [[-17, -41.5, 7.5], [-16.6, -30, 6.4]]) {
        rr(ctx, c[0], c[1], c[2], c[2], 1.8);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      rr(ctx, -21, -50.5, 44, 7, 3.2);
      fillStroke(ctx, skin.limb, 2.2);
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fillRect(-19, -46.4, 40, 1.3);
    } else if (kit === 'gold') {
      // crown, worn at an angle
      ctx.save();
      ctx.translate(1, -45);
      ctx.rotate(-0.1 - ant * 0.015);
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-14, -13);
      ctx.lineTo(-6.5, -6.5);
      ctx.lineTo(0, -16);
      ctx.lineTo(6.5, -6.5);
      ctx.lineTo(14, -13);
      ctx.lineTo(12, 0);
      ctx.closePath();
      fillStroke(ctx, vgrad(ctx, -16, 0, '#fff7c2', '#e2a015'), 2.2);
      ctx.fillStyle = 'rgba(120,70,0,0.45)';
      ctx.fillRect(-11, -2.6, 22, 1.2);
      for (const p of [[-14, -13, 1.9], [0, -16, 2.2], [14, -13, 1.9]]) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], p[2], 0, TAU);
        fillStroke(ctx, '#fff3a0', 1.4);
      }
      dot(ctx, 0, -6, 2.3, '#ff4d6d');
      dot(ctx, -7.6, -4.6, 1.5, '#38d6ff');
      dot(ctx, 7.6, -4.6, 1.5, '#38d6ff');
      ctx.restore();
    } else if (!kit) {
      // more duct tape
      ctx.beginPath();
      ctx.moveTo(-17.4, -39.5);
      ctx.lineTo(-9.5, -43);
      ctx.lineTo(-8.4, -39.2);
      ctx.lineTo(-16.4, -35.6);
      ctx.closePath();
      fillStroke(ctx, '#b9c0cc', 1.4);
    }
  }

  // the face; returns false to fall back to the standard eyes
  function kitEyes(ctx, skin, s, t) {
    const kit = skin.kit;
    if (!kit) return false;
    const shut = (c) => {
      ctx.fillStyle = c;
      ctx.fillRect(-1.5, -32.8, 6, 1.6);
      ctx.fillRect(8.5, -32.8, 6, 1.6);
    };
    if (kit === 'brew') {
      // wide awake, one eye more than the other, pupils buzzing
      glow(ctx, 6.5, -32, 17, skin.eye, 0.5);
      if (s.blink) return shut(skin.eye), true;
      const jx = Math.sin(t * 47) * 0.7, jy = Math.cos(t * 53) * 0.6;
      for (const e of [[1, -32, 4.1], [12, -32.4, 5]]) {
        dot(ctx, e[0], e[1], e[2], skin.eye);
        dot(ctx, e[0] + 0.8 + jx, e[1] + jy, 1.5, '#0a1230');
        ctx.beginPath();
        ctx.arc(e[0], e[1], e[2] + 1.9, 0.7, 2.44);
        ctx.strokeStyle = rgba(skin.eye, 0.4);
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
    } else if (kit === 'ice') {
      // half-lidded and completely relaxed
      glow(ctx, 6.5, -32, 16, skin.eye, 0.5);
      if (s.blink) return shut(skin.eye), true;
      ctx.fillStyle = skin.eye;
      rr(ctx, -1.5, -36.5, 6, 9, 2.6);
      ctx.fill();
      rr(ctx, 8.5, -36.5, 6, 9, 2.6);
      ctx.fill();
      ctx.fillStyle = '#0a1230';
      ctx.fillRect(-2.5, -37, 18, 4.6);
      ctx.fillStyle = skin.accent;
      ctx.fillRect(-2.2, -32.8, 7.4, 1.1);
      ctx.fillRect(7.8, -32.8, 7.4, 1.1);
    } else if (kit === 'glow') {
      // neon rings
      const c = neon(t, 3);
      glow(ctx, 6.5, -32, 18, c, 0.6);
      if (s.blink) return shut(c), true;
      ctx.strokeStyle = c;
      ctx.lineWidth = 2.2;
      for (const ex of [1.5, 11.5]) {
        ctx.beginPath();
        ctx.arc(ex, -32, 3.5, 0, TAU);
        ctx.stroke();
      }
    } else if (kit === 'crew') {
      // one red light, sweeping
      rr(ctx, -4, -34.5, 19, 5, 2.4);
      ctx.fillStyle = rgba(skin.eye, 0.28);
      ctx.fill();
      if (!s.blink) {
        const x = 5.5 + Math.sin(t * 4.2) * 6.3;
        glow(ctx, x, -32, 13, skin.eye, 0.8);
        rr(ctx, x - 3.2, -34.5, 6.4, 5, 2.4);
        ctx.fillStyle = skin.eye;
        ctx.fill();
      }
    } else if (kit === 'gold') {
      // stars in its eyes
      glow(ctx, 6.5, -32, 17, skin.eye, 0.5);
      if (s.blink) return shut(skin.eye), true;
      const k = 1 + 0.14 * Math.sin(t * 8);
      ctx.fillStyle = skin.eye;
      star4(ctx, 1.5, -32, 5 * k, 1.9);
      ctx.fill();
      star4(ctx, 11.5, -32, 5 * k, 1.9);
      ctx.fill();
    } else return false;
    return true;
  }

  // drawn over the finished head
  function kitHeadOver(ctx, skin, t, ant) {
    const kit = skin.kit;
    if (kit === 'ice') {
      // a cap of snow, and the bath's rubber duck
      ctx.save();
      ctx.translate(-5 - ant * 0.5, -53.4 + Math.sin(t * 5) * 0.5);
      ctx.rotate(-ant * 0.03);
      ctx.beginPath();
      ctx.moveTo(-5.5, -1);
      ctx.lineTo(-10, -5);
      ctx.lineTo(-3.5, -3.4);
      ctx.closePath();
      fillStroke(ctx, '#ffd23f', 1.8);
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 4.6, 0, 0, TAU);
      fillStroke(ctx, '#ffd23f', 1.8);
      ctx.beginPath();
      ctx.moveTo(7.6, -6);
      ctx.lineTo(11.8, -4.5);
      ctx.lineTo(7.6, -3.2);
      ctx.closePath();
      fillStroke(ctx, '#ff8a3d', 1.3);
      ctx.beginPath();
      ctx.arc(4.5, -5, 3.7, 0, TAU);
      fillStroke(ctx, '#ffd23f', 1.8);
      dot(ctx, 5.5, -5.8, 0.9, OUTLINE);
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(-20, -36);
      ctx.quadraticCurveTo(-20, -49.5, -8, -49.5);
      ctx.lineTo(10, -49.5);
      ctx.quadraticCurveTo(22, -49.5, 22, -37);
      ctx.quadraticCurveTo(19, -33.5, 16, -38.5);
      ctx.quadraticCurveTo(12, -43, 8, -39.5);
      ctx.quadraticCurveTo(4, -36.5, 0, -40);
      ctx.quadraticCurveTo(-4, -43, -8, -39);
      ctx.quadraticCurveTo(-11, -33, -14, -36.5);
      ctx.quadraticCurveTo(-17, -31, -20, -36);
      ctx.closePath();
      fillStroke(ctx, '#f4fbff', 2.2);
      ctx.strokeStyle = 'rgba(47,134,201,0.3)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-14, -44);
      ctx.quadraticCurveTo(-4, -47, 8, -45.5);
      ctx.stroke();
    } else if (kit === 'glow') {
      // glowing visor rim
      rr(ctx, -8, -41, 27, 18, 7);
      ctx.strokeStyle = neon(t, 1);
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else if (kit === 'crew') {
      // headset: band, radio stub, ear cup and a boom mic
      ctx.beginPath();
      ctx.moveTo(-19, -36);
      ctx.quadraticCurveTo(-19, -49.5, -5, -49.5);
      tube(ctx, 3.4, '#59627a');
      ctx.beginPath();
      ctx.moveTo(-22, -37);
      ctx.lineTo(-24.5 - ant * 0.5, -47.5);
      tube(ctx, 1.8, '#59627a');
      dot(ctx, -24.5 - ant * 0.5, -47.5, 2, skin.accent);
      rr(ctx, -25.5, -38.5, 12.5, 15.5, 4.5);
      fillStroke(ctx, skin.pack, 2.2);
      dot(ctx, -19.2, -30.6, 1.7, skin.accent);
      glow(ctx, -19.2, -30.6, 7, skin.accent, 0.7);
      ctx.beginPath();
      ctx.moveTo(-17, -24);
      ctx.quadraticCurveTo(-8, -17, 10, -19.5);
      tube(ctx, 1.8, '#8e99b3');
      ctx.beginPath();
      ctx.arc(11.5, -19.6, 3.1, 0, TAU);
      fillStroke(ctx, skin.packLo, 1.8);
    }
  }

  // something to hold; drawn just before the near hand
  function kitHand(ctx, skin, t, hx, hy) {
    const kit = skin.kit;
    if (kit === 'brew') {
      // a cup for the road
      ctx.beginPath();
      ctx.moveTo(hx - 1, hy - 9);
      ctx.lineTo(hx + 9, hy - 9);
      ctx.lineTo(hx + 7.6, hy + 3);
      ctx.lineTo(hx + 0.4, hy + 3);
      ctx.closePath();
      fillStroke(ctx, '#fff7ea', 1.8);
      ctx.fillStyle = '#d9a066';
      ctx.fillRect(hx + 0.5, hy - 5.6, 7, 4.8);
      rr(ctx, hx - 2, hy - 11.6, 12, 3.6, 1.4);
      fillStroke(ctx, skin.pack, 1.6);
    } else if (kit === 'glow') {
      const c = neon(t, 1);
      ctx.beginPath();
      ctx.moveTo(hx - 3, hy + 5);
      ctx.lineTo(hx + 7, hy - 11);
      tube(ctx, 3.4, c);
      glow(ctx, hx + 3, hy - 4, 14, c, 0.6);
    } else if (kit === 'crew') {
      // pocket torch
      const prev = ctx.globalCompositeOperation;
      const g = ctx.createLinearGradient(hx + 11, 0, hx + 42, 0);
      g.addColorStop(0, 'rgba(255,243,196,0.3)');
      g.addColorStop(1, 'rgba(255,243,196,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.moveTo(hx + 11, hy - 2.5);
      ctx.lineTo(hx + 42, hy - 12);
      ctx.lineTo(hx + 42, hy + 12);
      ctx.lineTo(hx + 11, hy + 2.5);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.globalCompositeOperation = prev;
      rr(ctx, hx, hy - 2.6, 10, 5.2, 1.6);
      fillStroke(ctx, skin.limb, 1.8);
      ctx.fillStyle = '#fff3c4';
      ctx.fillRect(hx + 9.2, hy - 3.2, 2.2, 6.4);
    }
  }

  // drawn last, over the whole bot
  function kitFront(ctx, skin, t) {
    const kit = skin.kit;
    if (kit === 'gold') {
      // it twinkles
      const pts = [[-22, -40], [25, -22], [16, 12], [-13, 5], [13, -56]];
      for (let i = 0; i < pts.length; i++) {
        const k = Math.sin(t * 3.2 + i * 1.9);
        if (k <= 0.05) continue;
        glow(ctx, pts[i][0], pts[i][1], 10 * k, skin.accent, 0.7);
        star4(ctx, pts[i][0], pts[i][1], 5.5 * k, 1.3 * k);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    } else if (kit === 'ice') {
      // you can see its breath
      const k = (t * 0.8) % 1;
      const a = 0.42 * (1 - k);
      dot(ctx, 25 + k * 12, -24 - k * 5, 2 + k * 3.5, 'rgba(255,255,255,' + a + ')');
      dot(ctx, 28 + k * 15, -21 - k * 2, 1.5 + k * 2.6, 'rgba(255,255,255,' + a * 0.8 + ')');
    }
  }

  // Tech Ultra Bot: the same bot in heavy dark armour. Gunmetal plating,
  // acid-green lights, a deep purple cape and purple thrusters.
  art.TUB = {
    id: 'tub', name: 'TECH ULTRA BOT',
    body: '#3d485c', bodyLo: '#141a26', limb: '#566178', limbLo: '#272e3e', pack: '#1c2231', packLo: '#0a0e17',
    eye: '#b6ff3c', accent: '#b6ff3c', flame: '#a855f7', flameCore: '#f5e9ff',
    trim: '#7c3aed', trimLo: '#3b1a80', cape: '#5b21b6', capeLo: '#22093f',
  };

  /* s: { x, y, rot, sx, sy, scale, phase, ground(0..1), thrust(0..1), vy, t,
   *      blink, ant, dead, ultra }  — origin is the centre of the torso;
   *      at scale 1 the feet sit 40px below it and the head top 47px above.
   *      With s.ultra the bot is drawn as the armoured Tech Ultra Bot. */
  art.drawRobot = function (ctx, s, skin) {
    const U = !!s.ultra;
    if (U) skin = art.TUB;
    const t = s.t || 0;
    const g = s.ground == null ? 0 : s.ground;
    const vyN = clamp((s.vy || 0) / 700, -1, 1);
    const sc = s.scale || 1;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot || 0);
    ctx.scale(sc * (s.sx || 1), sc * (s.sy || 1));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // --- cape: long, heavy and a little battle-worn ---
    if (U) {
      const w1 = Math.sin(t * 9) * 4, w2 = Math.sin(t * 9 + 1.7) * 5, w3 = Math.sin(t * 7 + 0.6) * 4;
      ctx.beginPath();
      ctx.moveTo(-3, -19);
      ctx.lineTo(-18, -17);
      ctx.quadraticCurveTo(-48, -22 + w1, -82, -12 + w2);
      ctx.lineTo(-72, 0 + w3);
      ctx.lineTo(-84, 12 + w2);
      ctx.lineTo(-68, 18 + w1);
      ctx.lineTo(-78, 32 + w3);
      ctx.lineTo(-56, 28 + w2);
      ctx.quadraticCurveTo(-36, 22 + w1, -14, 17);
      ctx.closePath();
      const cg = ctx.createLinearGradient(-10, -10, -80, 20);
      cg.addColorStop(0, skin.cape);
      cg.addColorStop(1, skin.capeLo);
      fillStroke(ctx, cg, 2.5);
      // folds
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-22, -12);
      ctx.quadraticCurveTo(-44, -8 + w1, -66, 2 + w2);
      ctx.moveTo(-20, 2);
      ctx.quadraticCurveTo(-40, 8 + w2, -58, 18 + w3);
      ctx.stroke();
    }

    // --- jet flame(s) ---
    const th = s.thrust || 0;
    if (th > 0.03) {
      if (U) {
        flame(ctx, -30, 21, 22 + 28 * th, 5.4, skin.flame, skin.flameCore, t);
        flame(ctx, -19, 21, 22 + 28 * th, 5.4, skin.flame, skin.flameCore, t + 0.37);
      } else flame(ctx, -22, 20, 20 + 26 * th, 6.5, skin.kit === 'glow' ? neon(t, 0) : skin.flame, skin.flameCore, t);
    }

    // --- leg + arm on the far side ---
    const ph = s.phase || 0;
    const legPos = (p, i) => {
      const gx = Math.sin(p) * 11, gy = 20 - Math.max(0, Math.cos(p)) * 8;
      const ax = -5 - vyN * 4 + Math.sin(t * 7 + i * 2) * 1.2 + i * 3, ay = 18 - i * 3 + vyN * 1.5;
      return [lerp(ax, gx, g), lerp(ay, gy, g)];
    };
    const drawLeg = (hx, p, i, col) => {
      const f = legPos(p, i);
      const fx = hx + f[0], fy = 17 + f[1];
      limb(ctx, hx, 17, fx, fy, 4, U ? 9.5 : 7.5, col);
      if (U) {
        // knee guard
        ctx.beginPath();
        ctx.arc((hx + fx) / 2 + 2.5, (17 + fy) / 2, 4.6, 0, TAU);
        fillStroke(ctx, skin.trim, 2);
        // heavy boot with a lit toe cap
        rr(ctx, fx - 8, fy - 6.5, 21, 11, 4);
        fillStroke(ctx, skin.pack, 2.2);
        ctx.fillStyle = skin.accent;
        ctx.fillRect(fx + 6.5, fy - 3, 4, 4);
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(fx - 6, fy - 5, 13, 2);
      } else {
        rr(ctx, fx - 6, fy - 3.5, 15, 8, 4);
        fillStroke(ctx, skin.pack, 2.2);
      }
    };
    const armPos = (p, front) => {
      const gx = Math.sin(p) * 9, gy = 15 - Math.abs(Math.sin(p)) * 2;
      const ax = front ? 13 + th * 2 : 9, ay = front ? 7 - vyN * 3 : 10 - vyN * 2;
      return [lerp(ax, gx, g), lerp(ay, gy, g)];
    };
    drawLeg(-5, ph + Math.PI, 0, skin.limbLo);
    {
      const a = armPos(ph, false);
      limb(ctx, -1, -7, -1 + a[0], -7 + a[1], -3, U ? 8 : 6, skin.limbLo);
      if (U) {
        ctx.beginPath();
        ctx.arc(-1 + a[0], -7 + a[1], 6, 0, TAU);
        fillStroke(ctx, skin.trimLo, 2.2);
      }
    }

    // --- jetpack ---
    if (U) {
      // stabiliser fin
      ctx.beginPath();
      ctx.moveTo(-33, -14);
      ctx.lineTo(-52, -27);
      ctx.lineTo(-47, -8);
      ctx.lineTo(-34, 0);
      ctx.closePath();
      fillStroke(ctx, skin.trim, 2.4);
      // twin-booster pack
      rr(ctx, -37, -20, 24, 35, 6);
      fillStroke(ctx, vgrad(ctx, -20, 15, skin.pack, skin.packLo));
      ctx.fillStyle = skin.accent;
      ctx.fillRect(-34, -14, 12, 3);
      ctx.fillStyle = rgba(skin.accent, 0.55);
      ctx.fillRect(-34, -8, 12, 2);
      ctx.fillRect(-34, -3, 7, 2);
      for (const nx of [-30, -19]) {
        ctx.beginPath();
        ctx.moveTo(nx - 4.5, 14);
        ctx.lineTo(nx + 4.5, 14);
        ctx.lineTo(nx + 6, 22);
        ctx.lineTo(nx - 6, 22);
        ctx.closePath();
        fillStroke(ctx, skin.packLo, 2.2);
      }
    } else {
      rr(ctx, -31, -18, 18, 32, 6);
      fillStroke(ctx, vgrad(ctx, -18, 14, skin.pack, skin.packLo));
      ctx.fillStyle = skin.accent;
      ctx.fillRect(-28, -11, 9, 3);
      ctx.fillStyle = rgba(skin.accent, 0.5);
      ctx.fillRect(-28, -5, 9, 2);
      ctx.beginPath();
      ctx.moveTo(-28, 14);
      ctx.lineTo(-16, 14);
      ctx.lineTo(-14.5, 21);
      ctx.lineTo(-29.5, 21);
      ctx.closePath();
      fillStroke(ctx, skin.packLo, 2.2);
      kitPack(ctx, skin, t);
    }

    // --- torso ---
    if (U) {
      rr(ctx, -17, -17, 35, 37, 9);
      fillStroke(ctx, vgrad(ctx, -17, 20, skin.body, skin.bodyLo));
      // chest plate
      ctx.beginPath();
      ctx.moveTo(-9, -13);
      ctx.lineTo(15, -13);
      ctx.lineTo(15, 0);
      ctx.lineTo(5, 9);
      ctx.lineTo(-9, 3);
      ctx.closePath();
      fillStroke(ctx, vgrad(ctx, -13, 9, '#566178', '#262d3d'), 2);
      ctx.strokeStyle = rgba(skin.accent, 0.9);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-6, -10);
      ctx.lineTo(12, -10);
      ctx.stroke();
      // power core
      const pulse = 0.5 + 0.5 * Math.sin(t * 10);
      ctx.beginPath();
      ctx.arc(5, -2, 6, 0, TAU);
      fillStroke(ctx, '#080c16', 1.8);
      ctx.beginPath();
      ctx.arc(5, -2, 3.2 + pulse * 0.8, 0, TAU);
      ctx.fillStyle = skin.accent;
      ctx.fill();
      glow(ctx, 5, -2, 13 + pulse * 5, skin.accent, 0.8);
      // utility belt
      rr(ctx, -17, 10, 35, 7, 3);
      fillStroke(ctx, skin.pack, 2);
      rr(ctx, 1, 9.5, 8, 8, 2);
      fillStroke(ctx, skin.accent, 1.6);
      ctx.fillStyle = skin.trim;
      ctx.fillRect(-12, 12, 6, 3.5);
      ctx.fillRect(12, 12, 4, 3.5);
      // cape clasp
      ctx.beginPath();
      ctx.arc(-13, -15, 3.2, 0, TAU);
      fillStroke(ctx, skin.accent, 1.8);
    } else {
      rr(ctx, -15, -15, 30, 34, 9);
      fillStroke(ctx, vgrad(ctx, -15, 19, skin.body, skin.bodyLo));
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      rr(ctx, -11, -12, 8, 12, 4);
      ctx.fill();
      kitTorso(ctx, skin, t, vyN);
    }

    // --- head ---
    const hb = g * Math.abs(Math.sin(ph)) * 1.4; // little head bob while running
    ctx.save();
    ctx.translate(0, -hb - (U ? 3 : 0));
    // antenna (leans with momentum); the big bot has a pair
    const ant = s.ant || 0;
    const topper = !U && kitHeadBack(ctx, skin, t, ant); // some kits swap the antenna for something else
    for (const ax of U ? [-10, 9] : topper ? [] : [-6]) {
      const top = ax === 9 ? -55 : -59;
      ctx.beginPath();
      ctx.moveTo(ax, -46);
      ctx.quadraticCurveTo(ax, top + 6, ax - ant, top);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = skin.limbLo;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ax - ant, top - 1, ax === 9 ? 3 : 4, 0, TAU);
      fillStroke(ctx, skin.accent, 2);
      glow(ctx, ax - ant, top - 1, 11, skin.accent, 0.8);
    }
    // ear
    ctx.beginPath();
    ctx.arc(-18, -31, U ? 6.5 : 5, 0, TAU);
    fillStroke(ctx, U ? skin.trim : skin.limbLo, 2.2);
    if (U) {
      ctx.beginPath();
      ctx.arc(-18, -31, 2.2, 0, TAU);
      ctx.fillStyle = skin.accent;
      ctx.fill();
    }
    // skull / helmet
    rr(ctx, -19, -47, 40, 31, 11);
    fillStroke(ctx, vgrad(ctx, -47, -16, skin.head || skin.body, skin.headLo || skin.bodyLo));
    if (U) {
      // helmet crest
      ctx.beginPath();
      ctx.moveTo(-9, -46);
      ctx.lineTo(-4, -56);
      ctx.lineTo(3, -50);
      ctx.lineTo(8, -54);
      ctx.lineTo(14, -46);
      ctx.closePath();
      fillStroke(ctx, skin.trim, 2.2);
      // brow plate
      ctx.beginPath();
      ctx.moveTo(-12, -44);
      ctx.lineTo(20, -44);
      ctx.lineTo(20, -39);
      ctx.lineTo(4, -36.5);
      ctx.lineTo(-12, -39);
      ctx.closePath();
      fillStroke(ctx, '#566178', 1.8);
      // jaw guard with vents
      rr(ctx, -7, -24, 25, 8, 3);
      fillStroke(ctx, skin.limbLo, 1.8);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const vx of [0, 5.5, 11]) {
        ctx.moveTo(vx, -22);
        ctx.lineTo(vx, -18.5);
      }
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-13, -37);
      ctx.quadraticCurveTo(-13, -43, -5, -43.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      kitHeadFront(ctx, skin, ant);
    }
    // visor
    if (U) rr(ctx, -8, -39, 27, 14, 5);
    else rr(ctx, -8, -41, 27, 18, 7);
    ctx.fillStyle = U ? '#05080f' : '#0a1230';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    // eyes
    if (s.dead) {
      ctx.strokeStyle = skin.eye;
      ctx.lineWidth = 2.2;
      for (const ex of [1.5, 11.5]) {
        ctx.beginPath();
        ctx.moveTo(ex - 3, -35);
        ctx.lineTo(ex + 3, -29);
        ctx.moveTo(ex + 3, -35);
        ctx.lineTo(ex - 3, -29);
        ctx.stroke();
      }
    } else if (U) {
      // narrowed, glowing, extremely serious
      glow(ctx, 6.5, -32, 20, skin.eye, 0.75);
      ctx.fillStyle = skin.eye;
      if (s.blink) {
        ctx.fillRect(-2.5, -32, 7, 1.6);
        ctx.fillRect(8, -32, 7, 1.6);
      } else {
        ctx.beginPath();
        ctx.moveTo(-3, -36);
        ctx.lineTo(4.5, -33);
        ctx.lineTo(4.5, -29);
        ctx.lineTo(-3, -29);
        ctx.closePath();
        ctx.moveTo(15.5, -36);
        ctx.lineTo(8, -33);
        ctx.lineTo(8, -29);
        ctx.lineTo(15.5, -29);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(-1.5, -31.5, 2, 1.8);
        ctx.fillRect(12.5, -31.5, 2, 1.8);
      }
    } else if (!kitEyes(ctx, skin, s, t)) {
      const eh = s.blink ? 1.6 : 9;
      const ey = -32 - eh / 2 + vyN * 1.2;
      glow(ctx, 6.5, -32, 16, skin.eye, 0.55);
      ctx.fillStyle = skin.eye;
      rr(ctx, -1.5, ey, 6, eh, 2.6);
      ctx.fill();
      rr(ctx, 8.5, ey, 6, eh, 2.6);
      ctx.fill();
      if (!s.blink) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(0, ey + 1.3, 2, 2.4);
        ctx.fillRect(10, ey + 1.3, 2, 2.4);
      }
    }
    if (!U) kitHeadOver(ctx, skin, t, ant);
    ctx.restore();

    // --- spiked shoulder guard (sits over the near arm) ---
    if (U) {
      for (const sp of [[-15, -9, -25, -19, -9, -15], [-8, -15, -13, -27, -1, -16]]) {
        ctx.beginPath();
        ctx.moveTo(sp[0], sp[1]);
        ctx.lineTo(sp[2], sp[3]);
        ctx.lineTo(sp[4], sp[5]);
        ctx.closePath();
        fillStroke(ctx, '#9b6bff', 2);
      }
      ctx.beginPath();
      ctx.ellipse(-1, -7, 15, 10, -0.12, Math.PI, TAU);
      ctx.closePath();
      const pg = ctx.createLinearGradient(0, -17, 0, -7);
      pg.addColorStop(0, '#9b6bff');
      pg.addColorStop(1, skin.trimLo);
      fillStroke(ctx, pg, 2.4);
      ctx.strokeStyle = rgba(skin.accent, 0.95);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-15, -7.5);
      ctx.lineTo(13, -9.5);
      ctx.stroke();
      ctx.fillStyle = skin.accent;
      for (const k of [-8, -1, 6]) {
        ctx.beginPath();
        ctx.arc(k, -12.5, 1.4, 0, TAU);
        ctx.fill();
      }
    }

    // --- near leg + arm ---
    drawLeg(6, ph, 1, skin.limb);
    {
      const a = armPos(ph + Math.PI, true);
      const hx = 2 + a[0], hy = -6 + a[1];
      limb(ctx, 2, -6, hx, hy, 3, U ? 8.5 : 6.5, skin.limb);
      if (U) {
        // bracer and oversized gauntlet
        ctx.beginPath();
        ctx.arc(lerp(2, hx, 0.62), lerp(-6, hy, 0.62) + 0.5, 5.6, 0, TAU);
        fillStroke(ctx, skin.trim, 2);
        ctx.beginPath();
        ctx.arc(hx, hy, 7.4, 0, TAU);
        fillStroke(ctx, vgrad(ctx, hy - 7, hy + 7, '#566178', skin.pack), 2.4);
        ctx.fillStyle = skin.accent;
        for (const k of [-3.4, 0, 3.4]) {
          ctx.beginPath();
          ctx.arc(hx + 4.2, hy + k, 1.3, 0, TAU);
          ctx.fill();
        }
      } else {
        kitHand(ctx, skin, t, hx, hy);
        ctx.beginPath();
        ctx.arc(hx, hy, 4.6, 0, TAU);
        fillStroke(ctx, skin.pack, 2.2);
      }
    }
    if (!U && !s.dead) kitFront(ctx, skin, t);
    ctx.restore();
  };

  /* =====================================================================
   *  COINS
   * ===================================================================== */
  const COIN_FRAMES = 16, COIN_PX = 80;
  let coinAtlas = null;
  function buildCoins() {
    coinAtlas = makeCanvas(COIN_FRAMES * COIN_PX, COIN_PX);
    const c = coinAtlas.getContext('2d');
    for (let i = 0; i < COIN_FRAMES; i++) {
      const a = (i / COIN_FRAMES) * Math.PI;
      const wf = Math.abs(Math.cos(a));
      const cx = i * COIN_PX + COIN_PX / 2, cy = COIN_PX / 2;
      const R = 30, rx = Math.max(4, R * wf);
      const edge = (1 - wf) * 7 * (a < Math.PI / 2 ? 1 : -1);
      c.lineWidth = 4;
      c.strokeStyle = '#5a3400';
      // rim (the coin's thickness, visible when it turns)
      c.beginPath();
      c.ellipse(cx + edge, cy, rx, R, 0, 0, TAU);
      c.fillStyle = '#b8720a';
      c.fill();
      c.stroke();
      // face
      c.beginPath();
      c.ellipse(cx - edge * 0.4, cy, rx, R, 0, 0, TAU);
      const g = c.createLinearGradient(0, cy - R, 0, cy + R);
      g.addColorStop(0, '#fff3a6');
      g.addColorStop(0.45, '#ffd23f');
      g.addColorStop(1, '#f09a12');
      c.fillStyle = g;
      c.fill();
      c.stroke();
      if (wf > 0.3) {
        c.save();
        c.translate(cx - edge * 0.4, cy);
        c.scale(wf, 1);
        c.beginPath();
        c.arc(0, 0, R - 8, 0, TAU);
        c.strokeStyle = 'rgba(160,90,0,0.55)';
        c.lineWidth = 3;
        c.stroke();
        // chip-style stamp: a small circuit node
        // every coin is a donation: stamped with a heart
        c.beginPath();
        c.moveTo(0, 11);
        c.bezierCurveTo(-17, -1, -10, -14, 0, -5);
        c.bezierCurveTo(10, -14, 17, -1, 0, 11);
        c.fillStyle = 'rgba(160,84,0,0.85)';
        c.fill();
        // shine
        c.beginPath();
        c.arc(0, 0, R - 4, Math.PI * 1.1, Math.PI * 1.55);
        c.strokeStyle = 'rgba(255,255,255,0.75)';
        c.lineWidth = 3.5;
        c.stroke();
        c.restore();
      }
    }
  }
  art.drawCoin = function (ctx, x, y, frame, size) {
    if (!coinAtlas) buildCoins();
    const f = ((Math.floor(frame) % COIN_FRAMES) + COIN_FRAMES) % COIN_FRAMES;
    const s = size || 34;
    ctx.drawImage(coinAtlas, f * COIN_PX, 0, COIN_PX, COIN_PX, x - s / 2, y - s / 2, s, s);
  };

  /* =====================================================================
   *  HAZARDS
   * ===================================================================== */
  function emitter(ctx, x, y, ang, t, pulse) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    // prong that points along the beam
    rr(ctx, 8, -7, 14, 14, 3);
    fillStroke(ctx, '#2a3250', 2.2);
    // housing
    rr(ctx, -17, -17, 34, 34, 11);
    const g = ctx.createLinearGradient(0, -17, 0, 17);
    g.addColorStop(0, '#59648a');
    g.addColorStop(1, '#232a45');
    fillStroke(ctx, g, 2.6);
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, TAU);
    ctx.fillStyle = '#12172b';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = HAZARD;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, TAU);
    ctx.fillStyle = '#fff1f0';
    ctx.fill();
    ctx.restore();
    glow(ctx, x, y, 30 + pulse * 6, HAZARD, 0.75);
  }

  // Electric gate: two emitters with a live arc between them.
  art.drawGate = function (ctx, x1, y1, x2, y2, t, id) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    const ang = Math.atan2(dy, dx);
    const pulse = 0.5 + 0.5 * Math.sin(t * 14 + id);
    const ax = x1 + ux * 16, ay = y1 + uy * 16, bx = x2 - ux * 16, by = y2 - uy * 16;

    const prev = ctx.globalCompositeOperation;
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(HAZARD, 0.16 + pulse * 0.05);
    ctx.lineWidth = 30;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.strokeStyle = rgba(HAZARD, 0.5);
    ctx.lineWidth = 15;
    ctx.stroke();
    ctx.globalCompositeOperation = prev;
    ctx.strokeStyle = '#fff4f2';
    ctx.lineWidth = 5.5;
    ctx.stroke();

    // crackling arcs, re-rolled ~24 times a second
    const rnd = seeded(id * 7919 + Math.floor(t * 24) * 104729);
    const segs = Math.max(3, Math.floor((len - 32) / 20));
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      for (let i = 1; i < segs; i++) {
        const f = i / segs;
        const off = (rnd() - 0.5) * 20;
        ctx.lineTo(lerp(ax, bx, f) + nx * off, lerp(ay, by, f) + ny * off);
      }
      ctx.lineTo(bx, by);
      ctx.strokeStyle = k ? 'rgba(255,255,255,0.9)' : rgba('#ffb3a8', 0.85);
      ctx.lineWidth = k ? 1.4 : 2.4;
      ctx.stroke();
    }
    emitter(ctx, x1, y1, ang, t, pulse);
    emitter(ctx, x2, y2, ang + Math.PI, t, pulse);
  };

  // Hover drone: spiked security orb that bobs up and down.
  art.drawDrone = function (ctx, x, y, t, id) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 6 + id);
    ctx.save();
    ctx.translate(x, y);
    // rotor arms
    const tilt = Math.sin(t * 3 + id) * 0.08;
    ctx.rotate(tilt);
    ctx.lineCap = 'round';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * 12, -12);
      ctx.lineTo(sx * 27, -22);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = '#59648a';
      ctx.lineWidth = 3.5;
      ctx.stroke();
      // spinning blade as a blurred ellipse
      ctx.beginPath();
      ctx.ellipse(sx * 27, -25, 15 * (0.6 + 0.4 * Math.abs(Math.sin(t * 40 + sx))), 2.6, 0, 0, TAU);
      ctx.fillStyle = 'rgba(200,215,255,0.55)';
      ctx.fill();
    }
    // spikes
    ctx.save();
    ctx.rotate(t * 1.4 + id);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.lineTo(Math.cos(a - 0.2) * 16, Math.sin(a - 0.2) * 16);
      ctx.lineTo(Math.cos(a) * 25, Math.sin(a) * 25);
      ctx.lineTo(Math.cos(a + 0.2) * 16, Math.sin(a + 0.2) * 16);
    }
    ctx.closePath();
    ctx.lineJoin = 'round';
    fillStroke(ctx, '#8d97b8', 2.4);
    ctx.restore();
    // shell
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, TAU);
    const g = ctx.createLinearGradient(0, -17, 0, 17);
    g.addColorStop(0, '#59648a');
    g.addColorStop(1, '#1d2440');
    fillStroke(ctx, g, 2.6);
    // angry eye
    ctx.beginPath();
    ctx.arc(0, 0, 8.5, 0, TAU);
    ctx.fillStyle = '#12172b';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 4 + pulse * 1.6, 0, TAU);
    ctx.fillStyle = HAZARD;
    ctx.fill();
    ctx.restore();
    glow(ctx, x, y, 26 + pulse * 10, HAZARD, 0.7);
  };

  // Missile, flying right-to-left; (x, y) is its centre.
  art.drawMissile = function (ctx, x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';
    // exhaust
    ctx.save();
    ctx.translate(28, 0);
    ctx.rotate(-Math.PI / 2);
    flame(ctx, 0, 0, 44, 7, '#ff9a3d', '#fff3c9', t);
    ctx.restore();
    // fins
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(10, s * 8);
      ctx.lineTo(30, s * 20);
      ctx.lineTo(27, s * 7);
      ctx.closePath();
      fillStroke(ctx, HAZARD, 2.4);
    }
    // body
    ctx.beginPath();
    ctx.moveTo(-36, 0);
    ctx.quadraticCurveTo(-26, -11, -10, -11);
    ctx.lineTo(24, -11);
    ctx.lineTo(28, -6);
    ctx.lineTo(28, 6);
    ctx.lineTo(24, 11);
    ctx.lineTo(-10, 11);
    ctx.quadraticCurveTo(-26, 11, -36, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -11, 0, 11);
    g.addColorStop(0, '#f4f7ff');
    g.addColorStop(1, '#8690ad');
    ctx.fillStyle = g;
    ctx.fill();
    // red nose cone
    ctx.save();
    ctx.clip();
    ctx.fillStyle = HAZARD;
    ctx.fillRect(-40, -14, 22, 28);
    ctx.fillStyle = 'rgba(8,13,31,0.75)';
    ctx.fillRect(4, -14, 5, 28);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-40, -9, 70, 3);
    ctx.restore();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    // a very determined face
    ctx.beginPath();
    ctx.arc(-7, -2.5, 4.6, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-8.6, -2, 2, 0, TAU);
    ctx.fillStyle = OUTLINE;
    ctx.fill();
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-13.5, -8.5);
    ctx.lineTo(-2.5, -5.5);
    ctx.stroke();
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-15, 5.5);
    ctx.lineTo(-12, 3.5);
    ctx.lineTo(-9, 6);
    ctx.lineTo(-6, 3.8);
    ctx.lineTo(-3, 6);
    ctx.stroke();
    ctx.restore();
    glow(ctx, x - 30, y, 22, HAZARD, 0.5);
  };

  // Incoming-missile marker on the right edge of the screen.
  art.drawWarning = function (ctx, y, t, locked) {
    const x = W - 62;
    const blink = locked ? (Math.sin(t * 40) > 0 ? 1 : 0.25) : 0.75 + 0.25 * Math.sin(t * 10);
    const col = locked ? HAZARD : '#ffd23f';
    ctx.save();
    ctx.globalAlpha = blink;
    glow(ctx, x, y, 60, col, 0.55);
    // sight line across the screen
    ctx.setLineDash([10, 14]);
    ctx.lineDashOffset = -t * 120;
    ctx.strokeStyle = rgba(col, locked ? 0.5 : 0.2);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(x - 40, y);
    ctx.stroke();
    ctx.setLineDash([]);
    // badge
    ctx.translate(x, y);
    const s = locked ? 1.12 : 1 + 0.05 * Math.sin(t * 10);
    ctx.scale(s, s);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.lineTo(27, 20);
    ctx.lineTo(-27, 20);
    ctx.closePath();
    ctx.lineWidth = 9;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = col;
    ctx.stroke();
    ctx.fillStyle = OUTLINE;
    rr(ctx, -3.2, -12, 6.4, 18, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 13, 3.6, 0, TAU);
    ctx.fill();
    ctx.restore();
  };

  // Wall-to-wall laser. phase: 'in' | 'charge' | 'fire' | 'out', k = 0..1 through that phase.
  art.LASER_INSET = 58;
  art.drawLaser = function (ctx, y, phase, k, t, id) {
    const slide = phase === 'in' ? TR.util.easeOut(k) : phase === 'out' ? 1 - TR.util.smooth(k) : 1;
    const xl = lerp(-70, 30, slide), xr = W - xl;
    const x0 = xl + 28, x1 = xr - 28;
    const prev = ctx.globalCompositeOperation;

    if (phase === 'charge') {
      // thin tracer so the player can see exactly where the beam will be
      const fl = 0.35 + 0.3 * Math.sin(t * 34 + id) + k * 0.35;
      ctx.setLineDash([16, 12]);
      ctx.lineDashOffset = -t * 160;
      ctx.strokeStyle = rgba(LASER, clamp(fl, 0.15, 1));
      ctx.lineWidth = 2 + k * 2;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.setLineDash([]);
      glow(ctx, x0, y, 14 + k * 30, LASER, 0.9);
      glow(ctx, x1, y, 14 + k * 30, LASER, 0.9);
    } else if (phase === 'fire') {
      const fade = k < 0.06 ? k / 0.06 : k > 0.92 ? (1 - k) / 0.08 : 1;
      const wob = Math.sin(t * 70 + id) * 1.2;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(LASER, 0.16 * fade);
      ctx.fillRect(x0, y - 30, x1 - x0, 60);
      ctx.fillStyle = rgba(LASER, 0.42 * fade);
      ctx.fillRect(x0, y - 14 - wob, x1 - x0, 28 + wob * 2);
      ctx.globalCompositeOperation = prev;
      ctx.fillStyle = rgba('#fff0f7', fade);
      ctx.fillRect(x0, y - 5.5 * fade, x1 - x0, 11 * fade);
      // energy pulses racing along the beam
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const px = x0 + (((t * 900 + i * 230 + id * 77) % (x1 - x0)) + (x1 - x0)) % (x1 - x0);
        ctx.drawImage(glowSprite('#ffffff'), px - 40, y - 12, 80, 24);
      }
      ctx.globalCompositeOperation = prev;
      glow(ctx, x0, y, 46, LASER, fade);
      glow(ctx, x1, y, 46, LASER, fade);
    }

    // emitter heads
    for (const side of [-1, 1]) {
      const x = side < 0 ? xl : xr;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(-side, 1);
      rr(ctx, -40, -22, 56, 44, 10);
      const g = ctx.createLinearGradient(0, -22, 0, 22);
      g.addColorStop(0, '#59648a');
      g.addColorStop(1, '#1f2742');
      fillStroke(ctx, g, 2.6);
      rr(ctx, 12, -13, 16, 26, 5);
      fillStroke(ctx, '#161c33', 2.4);
      ctx.fillStyle = phase === 'in' || phase === 'out' ? rgba(LASER, 0.5) : '#ffe3f1';
      rr(ctx, 20, -8, 6, 16, 3);
      ctx.fill();
      ctx.fillStyle = LASER;
      ctx.fillRect(-30, -12, 22, 4);
      ctx.fillStyle = rgba(LASER, 0.5);
      ctx.fillRect(-30, -4, 22, 3);
      ctx.restore();
    }
  };

  /* =====================================================================
   *  POWER-UPS
   * ===================================================================== */
  art.POWERUPS = {
    shield: { name: 'MORALER SHIELD', desc: 'Your moraler takes one hit for you', color: '#38d6ff' },
    magnet: { name: 'CANNING MAGNET', desc: 'Donations fly straight into your can', color: '#c79bff' },
    rush: { name: 'DONOR MATCH', desc: 'Every donation is doubled', color: '#ffd23f' },
    ultra: { name: 'TECH ULTRA BOT', desc: 'TUB time. Huge, armoured, unstoppable.', color: '#b6ff3c' },
    buggy: { name: 'WATER BUGGY', desc: 'Hold to rise on water jets, release to sink. Stay hydrated.', color: '#4be3d0', ride: true },
    van: { name: 'MOVING VAN', desc: 'Tap to flip between the floor and the ceiling. It is a rental.', color: '#ffb020', ride: true },
    truck: { name: 'THE F-150', desc: 'You spelled TECH. It is huge and it stops for nothing. Tap to hop.', color: '#eef3ff', ride: true },
  };

  // icon drawn in a box of `s` px centred on 0,0
  art.drawPowerIcon = function (ctx, type, s, color) {
    const k = s / 24;
    ctx.save();
    ctx.scale(k, k);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    if (type === 'shield') {
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(8.5, -6.5);
      ctx.lineTo(8.5, 0);
      ctx.quadraticCurveTo(8, 7, 0, 10.5);
      ctx.quadraticCurveTo(-8, 7, -8.5, 0);
      ctx.lineTo(-8.5, -6.5);
      ctx.closePath();
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.globalAlpha *= 0.45;
      ctx.fill();
    } else if (type === 'magnet') {
      ctx.lineWidth = 6;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.arc(0, 1, 6.5, 0, Math.PI);
      ctx.moveTo(-6.5, 1);
      ctx.lineTo(-6.5, -5);
      ctx.moveTo(6.5, 1);
      ctx.lineTo(6.5, -5);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-9.5, -10, 6, 4.2);
      ctx.fillRect(3.5, -10, 6, 4.2);
    } else if (type === 'rush') {
      ctx.font = '700 17px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('×2', 0, 1);
    } else if (type === 'ultra') {
      rr(ctx, -9, -6, 18, 15, 5);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(0, -10);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -10.5, 1.8, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#0a1230';
      rr(ctx, -6, -2.5, 12, 6.5, 2.5);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(-3.6, -0.6, 2.2, 3);
      ctx.fillRect(1.4, -0.6, 2.2, 3);
    } else if (type === 'truck') {
      ctx.beginPath();
      ctx.moveTo(-11, -1);
      ctx.lineTo(-3, -1);
      ctx.lineTo(-2, -6.5);
      ctx.lineTo(4, -6.5);
      ctx.lineTo(7, -1);
      ctx.lineTo(11.5, 0);
      ctx.lineTo(11.5, 4.5);
      ctx.lineTo(-11, 4.5);
      ctx.closePath();
      ctx.fill();
      for (const wx of [-6, 6.5]) {
        ctx.beginPath();
        ctx.arc(wx, 6, 3.4, 0, TAU);
        ctx.fillStyle = '#0b1026';
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
    } else if (type === 'van') {
      rr(ctx, -11.5, -8, 15, 12.5, 1.5);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(4.5, -4);
      ctx.lineTo(8.5, -4);
      ctx.lineTo(11.5, 0);
      ctx.lineTo(11.5, 4.5);
      ctx.lineTo(4.5, 4.5);
      ctx.closePath();
      ctx.fill();
      for (const wx of [-6, 7]) {
        ctx.beginPath();
        ctx.arc(wx, 6, 3, 0, TAU);
        ctx.fillStyle = '#0b1026';
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
    } else if (type === 'buggy') {
      ctx.fillRect(-10.5, 0.5, 21, 4.5);
      ctx.fillRect(-8, -10, 16, 2.4);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-5, 0.5);
      ctx.lineTo(-6, -8);
      ctx.moveTo(6, 0.5);
      ctx.lineTo(6, -8);
      ctx.stroke();
      rr(ctx, -10, -6, 5, 6.5, 1.5);
      ctx.fill();
      for (const wx of [-6, 6]) {
        ctx.beginPath();
        ctx.arc(wx, 6.5, 2.8, 0, TAU);
        ctx.fillStyle = '#0b1026';
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  /* =====================================================================
   *  RIDES — vehicles TECHBOT can drive. Each one changes the controls and
   *  takes a hit for him. They are drawn around their own centre (0, 0),
   *  facing right; the game moves, tilts and flips the canvas first.
   * ===================================================================== */
  // rides that turn up as pickups. The truck is not one of them: it is the
  // reward for collecting the letters T-E-C-H.
  art.RIDES = ['buggy', 'van'];
  art.TECH = 'TECH';
  // how much each ride is blown up on screen. The truck is huge on purpose.
  art.RIDE_SCALE = { buggy: 1, van: 1, truck: 3.2 };
  // the truck is drawn a little ahead of the bot's usual spot so its tail stays on screen
  art.RIDE_DX = { buggy: 0, van: 0, truck: 34 };
  // where the driver sits in each one, and how big he is drawn
  art.SEATS = {
    buggy: { x: 12, y: -12, s: 0.62 },
    van: { x: 47, y: 0, s: 0.5 },
    truck: { x: 9, y: -16, s: 0.36 },
  };

  function wheel(ctx, x, y, r, spin) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    fillStroke(ctx, '#151a28', 2.6);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, TAU);
    fillStroke(ctx, '#c9d2e6', 1.8);
    ctx.strokeStyle = '#6b7896';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = spin + (i * TAU) / 3;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5);
    }
    ctx.stroke();
  }

  // the truck's wheel: all-terrain tyre on a bright six-spoke alloy
  function bigWheel(ctx, x, y, r, spin) {
    ctx.fillStyle = '#0d111c';
    for (let i = 0; i < 20; i++) {
      const a = spin + (i * TAU) / 20;
      ctx.save();
      ctx.translate(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.rotate(a);
      ctx.fillRect(-1.2, -1.6, 2.4, 3.2);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    fillStroke(ctx, '#161b29', 1.3);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.82, 0, TAU);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    // the alloy
    ctx.beginPath();
    ctx.arc(x, y, r * 0.66, 0, TAU);
    const g = ctx.createLinearGradient(x, y - r * 0.66, x, y + r * 0.66);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#9aa6c2');
    fillStroke(ctx, g, 1);
    // dark openings between the six spokes
    ctx.fillStyle = '#1b2233';
    for (let i = 0; i < 6; i++) {
      const a = spin + (i * TAU) / 6, h = 0.3;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.56, a - h, a + h);
      ctx.arc(x, y, r * 0.25, a + h * 0.7, a - h * 0.7, true);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, r * 0.15, 0, TAU);
    fillStroke(ctx, '#e8edf8', 0.8);
  }

  // the crew cab's two side windows, as one path (or just the rear one)
  function truckWindows(ctx, rearOnly) {
    ctx.moveTo(-17, -39);
    ctx.lineTo(-3, -39);
    ctx.lineTo(-3, -15);
    ctx.lineTo(-17, -15);
    ctx.closePath();
    if (rearOnly) return;
    // the front glass dips towards the mirror
    ctx.moveTo(1, -39);
    ctx.lineTo(18, -39);
    ctx.lineTo(33.5, -12.5);
    ctx.lineTo(16, -12.5);
    ctx.lineTo(13.5, -15);
    ctx.lineTo(1, -15);
    ctx.closePath();
  }

  // everything that sits behind the driver
  art.drawRideBack = function (ctx, ride, t) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (ride.type === 'buggy') {
      // water jets that hold it up
      const j = ride.jet || 0;
      if (j > 0.05) {
        flame(ctx, -32, 18, 12 + 34 * j, 6, '#38b6ff', '#eafaff', t);
        flame(ctx, 34, 18, 12 + 34 * j, 6, '#38b6ff', '#eafaff', t + 0.4);
      }
      // seat back
      rr(ctx, -8, -30, 11, 32, 4);
      fillStroke(ctx, '#1b2130', 2.2);
      // the big water tank on the back
      rr(ctx, -52, -38, 40, 42, 9);
      ctx.fillStyle = 'rgba(150,220,255,0.35)';
      ctx.fill();
      ctx.save();
      ctx.clip();
      const lvl = -24 + Math.sin(t * 5) * 2.5;
      ctx.beginPath();
      ctx.moveTo(-54, lvl + Math.sin(t * 7) * 2);
      ctx.quadraticCurveTo(-32, lvl - 5 * Math.sin(t * 6), -10, lvl - Math.sin(t * 7) * 2);
      ctx.lineTo(-10, 10);
      ctx.lineTo(-54, 10);
      ctx.closePath();
      ctx.fillStyle = 'rgba(56,182,255,0.85)';
      ctx.fill();
      ctx.restore();
      rr(ctx, -52, -38, 40, 42, 9);
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      rr(ctx, -39, -45, 14, 8, 2.5);
      fillStroke(ctx, '#f4f7ff', 2);
      ctx.fillStyle = '#0b2540';
      ctx.font = '700 12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('H2O', -32, -8);
      // canopy
      for (const post of [[-9, -4, -13, -54], [38, -12, 36, -54]]) {
        ctx.beginPath();
        ctx.moveTo(post[0], post[1]);
        ctx.lineTo(post[2], post[3]);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 6.5;
        ctx.stroke();
        ctx.strokeStyle = '#c9d2e6';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      rr(ctx, -22, -61, 70, 9, 4.5);
      fillStroke(ctx, vgrad(ctx, -61, -52, '#7ff0e0', '#22b8a6'), 2.6);
    } else if (ride.type === 'van') {
      rr(ctx, 27, -22, 40, 24, 4); // inside the cab
      ctx.fillStyle = '#0b1020';
      ctx.fill();
    } else {
      // neon under-glow, because of course it has one
      ctx.save();
      ctx.translate(2, 36);
      ctx.scale(1, 0.15);
      glow(ctx, 0, 0, 118, '#38d6ff', 0.62 + 0.12 * Math.sin(t * 6));
      ctx.restore();
      // inside the cab
      ctx.beginPath();
      ctx.moveTo(-18.5, -40.5);
      ctx.lineTo(19, -40.5);
      ctx.lineTo(35, -11.5);
      ctx.lineTo(-18.5, -11.5);
      ctx.closePath();
      ctx.fillStyle = '#0b1020';
      ctx.fill();
      rr(ctx, 0, -34, 5, 20, 2); // seat back
      ctx.fillStyle = '#232a3c';
      ctx.fill();
    }
  };

  // bodywork that sits in front of the driver
  art.drawRideFront = function (ctx, ride, t) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const spin = ride.spin || 0;
    if (ride.type === 'buggy') {
      ctx.beginPath();
      ctx.moveTo(-56, 2);
      ctx.lineTo(22, 2);
      ctx.lineTo(30, -13);
      ctx.lineTo(46, -13);
      ctx.quadraticCurveTo(56, -13, 56, -2);
      ctx.lineTo(56, 17);
      ctx.lineTo(-56, 17);
      ctx.closePath();
      fillStroke(ctx, vgrad(ctx, -13, 17, '#f8faff', '#b3bdd6'), 2.6);
      ctx.fillStyle = '#22b8a6';
      ctx.fillRect(-54.5, 9, 109, 4.5);
      // steering wheel
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(36, -13);
      ctx.lineTo(32, -21);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(31, -22, 2.6, 6.5, -0.45, 0, TAU);
      ctx.stroke();
      rr(ctx, 51, -8, 6, 7, 2);
      fillStroke(ctx, '#fff3b0', 1.6);
      wheel(ctx, -34, 20, 12.5, spin);
      wheel(ctx, 36, 20, 12.5, spin);
    } else if (ride.type === 'van') {
      // cargo box
      rr(ctx, -84, -47, 108, 65, 5);
      fillStroke(ctx, vgrad(ctx, -47, 18, '#ffffff', '#c8d0e2'), 2.6);
      ctx.fillStyle = '#18b8a6';
      ctx.fillRect(-82.5, -9, 105, 10);
      ctx.fillStyle = '#16203a';
      ctx.font = '700 17px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TECH HAULS', -30, -27);
      ctx.font = '700 7.5px ' + FONT;
      ctx.fillText('IN-TOWN  ·  NO REFUNDS', -30, 9.5);
      ctx.strokeStyle = 'rgba(8,13,31,0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-77, -44);
      ctx.lineTo(-77, 15);
      ctx.stroke();
      // cab, with the window left open so the driver shows
      ctx.beginPath();
      ctx.moveTo(24, -26);
      ctx.lineTo(56, -26);
      ctx.quadraticCurveTo(63, -26, 67, -19);
      ctx.lineTo(75, -5);
      ctx.lineTo(84, -3);
      ctx.quadraticCurveTo(90, -2, 90, 5);
      ctx.lineTo(90, 18);
      ctx.lineTo(24, 18);
      ctx.closePath();
      ctx.moveTo(31, -21);
      ctx.lineTo(57, -21);
      ctx.lineTo(67, -4);
      ctx.lineTo(31, -4);
      ctx.closePath();
      ctx.fillStyle = vgrad(ctx, -26, 18, '#ffffff', '#c8d0e2');
      ctx.fill('evenodd');
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.beginPath(); // glass
      ctx.moveTo(31, -21);
      ctx.lineTo(57, -21);
      ctx.lineTo(67, -4);
      ctx.lineTo(31, -4);
      ctx.closePath();
      ctx.fillStyle = 'rgba(160,215,255,0.2)';
      ctx.fill();
      ctx.fillStyle = '#18b8a6';
      ctx.fillRect(25.5, 3, 63, 5);
      rr(ctx, 85, 9, 8, 9, 2);
      fillStroke(ctx, '#c9d2e6', 1.8);
      rr(ctx, 84, -1, 6, 6, 2);
      fillStroke(ctx, '#fff3b0', 1.6);
      ctx.fillStyle = '#1b2130';
      ctx.fillRect(-82, 18, 170, 4);
      wheel(ctx, -52, 22, 14.5, spin);
      wheel(ctx, 54, 22, 14.5, spin);
    } else {
      // THE F-150: a white crew cab with a colour-matched cap over the bed,
      // then everything from the accessory catalogue bolted on
      const lean = ride.whip || 0;
      const whip = lean * 8 + Math.sin(t * 9) * 1.3;
      const chrome = (y0, y1) => vgrad(ctx, y0, y1, '#f6f8ff', '#8f9bb8');
      const white = vgrad(ctx, -46, 14, '#ffffff', '#c6cfe2');
      const TINT = '#131a2c';

      // ---- under the tail: hitch, chrome ball, exhaust tip ----
      rr(ctx, -101, 13, 10, 3.4, 1);
      fillStroke(ctx, '#2a3247', 1);
      ctx.beginPath();
      ctx.arc(-99.2, 10.8, 2.2, 0, TAU);
      fillStroke(ctx, '#e8edf8', 0.9);
      rr(ctx, -93, 15.4, 9, 2.6, 1.2);
      fillStroke(ctx, chrome(15.4, 18), 0.8);

      // ---- cab and bed ----
      ctx.beginPath();
      ctx.moveTo(-91, -10);
      ctx.lineTo(-22, -10);
      ctx.lineTo(-20, -39);
      ctx.quadraticCurveTo(-19, -45, -12, -45);
      ctx.lineTo(19, -45);
      ctx.quadraticCurveTo(25, -45, 28, -40);
      ctx.lineTo(43, -14);
      ctx.lineTo(84, -11);
      ctx.quadraticCurveTo(93, -10, 93, -1);
      ctx.lineTo(93, 14);
      ctx.lineTo(-91, 14);
      ctx.closePath();
      truckWindows(ctx);
      ctx.fillStyle = white;
      ctx.fill('evenodd');
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      // fuzzy dice on the mirror
      ctx.save();
      ctx.translate(17.5, -39);
      ctx.rotate(Math.sin(t * 5) * 0.22 - lean * 0.5);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 5.5);
      ctx.stroke();
      for (const d of [[-3.4, 5], [0.3, 6.6]]) {
        rr(ctx, d[0], d[1], 3.5, 3.5, 0.8);
        fillStroke(ctx, '#ffffff', 0.6);
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(d[0] + 1.35, d[1] + 1.35, 0.8, 0.8);
      }
      ctx.restore();
      // glass: a light tint in front so the driver shows, dark privacy glass behind
      ctx.beginPath();
      truckWindows(ctx);
      ctx.fillStyle = 'rgba(160,215,255,0.2)';
      ctx.fill();
      ctx.beginPath();
      truckWindows(ctx, true);
      ctx.fillStyle = 'rgba(12,18,34,0.8)';
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      truckWindows(ctx);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.moveTo(21, -40);
      ctx.lineTo(26, -40);
      ctx.lineTo(15, -12);
      ctx.lineTo(10, -12);
      ctx.closePath();
      ctx.moveTo(-8, -40);
      ctx.lineTo(-5, -40);
      ctx.lineTo(-14, -14);
      ctx.lineTo(-17, -14);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // shading and seams
      ctx.fillStyle = 'rgba(8,13,31,0.06)';
      ctx.fillRect(-90.3, 3, 182.6, 10.4);
      ctx.strokeStyle = 'rgba(8,13,31,0.28)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-21.5, -10);
      ctx.lineTo(-21.5, 12);
      ctx.moveTo(-1, -15);
      ctx.lineTo(-1, 12);
      ctx.moveTo(35.5, -12);
      ctx.lineTo(36, 12);
      ctx.moveTo(-89, -2.5);
      ctx.lineTo(-22, -2.5);
      ctx.moveTo(37, -2.5);
      ctx.lineTo(91, -2.5);
      ctx.stroke();
      rr(ctx, -32, -8.4, 4, 4, 1); // fuel door
      ctx.stroke();
      ctx.fillStyle = '#1b2130';
      rr(ctx, -19.5, -11.6, 6, 2, 1);
      ctx.fill();
      rr(ctx, 1.5, -11.6, 6, 2, 1);
      ctx.fill();
      // door lettering
      ctx.fillStyle = '#12306b';
      ctx.font = '700 9.5px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TECH', 21.5, -3.4);
      ctx.fillStyle = '#38d6ff';
      ctx.fillRect(9, 2.8, 25, 1.3);
      // tall tail light with a pale centre, headlight, grille
      rr(ctx, -92.8, -9.6, 6.6, 16, 1.5);
      fillStroke(ctx, '#d9363e', 0.9);
      rr(ctx, -91, -7, 3, 10.8, 1);
      ctx.fillStyle = '#f8cfd0';
      ctx.fill();
      rr(ctx, 86.3, -7.6, 7, 6, 1.6);
      fillStroke(ctx, '#fff3b0', 0.9);
      ctx.fillStyle = '#232a3c';
      ctx.fillRect(88.6, 0.5, 4, 7.6);
      // chrome bumpers
      rr(ctx, 83, 8.6, 13, 6.6, 2);
      fillStroke(ctx, chrome(8.6, 15.2), 1);
      rr(ctx, -98, 7.4, 13, 7, 2);
      fillStroke(ctx, chrome(7.4, 14.4), 1);
      ctx.fillStyle = '#1b2130';
      ctx.fillRect(-96.6, 8.2, 6.5, 1.3); // step pad

      // ---- the cap over the bed: body colour, dark glass ----
      ctx.beginPath();
      ctx.moveTo(-91.6, -10.6);
      ctx.lineTo(-85.4, -42.5);
      ctx.quadraticCurveTo(-84.6, -46.2, -80.5, -46.2);
      ctx.lineTo(-26, -46.2);
      ctx.quadraticCurveTo(-22.6, -46.2, -22.6, -43);
      ctx.lineTo(-22.6, -10.6);
      ctx.closePath();
      fillStroke(ctx, white, 1.3);
      ctx.beginPath(); // the lift-up rear glass, seen edge on
      ctx.moveTo(-90.4, -13);
      ctx.lineTo(-85.3, -40.5);
      ctx.lineTo(-83.4, -40.5);
      ctx.lineTo(-88.3, -13);
      ctx.closePath();
      ctx.fillStyle = TINT;
      ctx.fill();
      rr(ctx, -79, -41, 51.5, 17.5, 3.2); // side window
      fillStroke(ctx, TINT, 1.1);
      ctx.save();
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.moveTo(-60, -42);
      ctx.lineTo(-52, -42);
      ctx.lineTo(-62, -22);
      ctx.lineTo(-70, -22);
      ctx.closePath();
      ctx.moveTo(-48, -42);
      ctx.lineTo(-45, -42);
      ctx.lineTo(-55, -22);
      ctx.lineTo(-58, -22);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; // the slider's frame
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-53.2, -40.2);
      ctx.lineTo(-53.2, -24.3);
      ctx.stroke();
      ctx.fillStyle = 'rgba(8,13,31,0.5)'; // rubber seal where the cap meets the bed
      ctx.fillRect(-91, -11.2, 68.2, 1.1);
      rr(ctx, -84.4, -47.6, 8, 1.7, 0.7); // high brake light
      ctx.fillStyle = '#d9363e';
      ctx.fill();
      // 4X4 decal
      ctx.font = '700 8px ' + FONT;
      ctx.textAlign = 'left';
      let tx = -77.5;
      for (const part of [['4', '#515c79'], ['X', '#d9363e'], ['4', '#515c79']]) {
        ctx.fillStyle = part[1];
        ctx.fillText(part[0], tx, -16.6);
        tx += ctx.measureText(part[0]).width + 0.2;
      }

      // ---- on the cap roof: whip antenna, rack, spare wheel, fuel can ----
      const tipX = -86 - whip, tipY = -73 + Math.abs(whip) * 0.4;
      ctx.beginPath();
      ctx.moveTo(-79, -46.5);
      ctx.quadraticCurveTo(-79, -62, tipX, tipY);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.7;
      ctx.stroke();
      ctx.strokeStyle = '#c9d2e6';
      ctx.lineWidth = 0.7;
      ctx.stroke();
      const flap = Math.sin(t * 15) * 1.6;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY + 1);
      ctx.lineTo(tipX - 13, tipY + 4.5 + flap);
      ctx.lineTo(tipX + 0.8, tipY + 8.5);
      ctx.closePath();
      fillStroke(ctx, '#ff9a3d', 0.9);
      ctx.beginPath();
      ctx.arc(tipX, tipY, 1.6, 0, TAU);
      fillStroke(ctx, '#ffd23f', 0.8);
      ctx.fillStyle = '#2a3247'; // rack feet and rail
      for (const fx of [-70, -52, -34]) ctx.fillRect(fx, -48.6, 1.8, 2.6);
      rr(ctx, -73, -50.4, 44, 2.2, 1);
      fillStroke(ctx, '#2a3247', 0.9);
      rr(ctx, -69, -58.2, 23, 7.8, 3.4); // spare wheel, lying flat
      fillStroke(ctx, '#161b29', 1.1);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      for (let i = 0; i < 6; i++) ctx.fillRect(-66.5 + i * 3.6, -57.4, 1.4, 6.2);
      ctx.strokeStyle = '#ffb020'; // ratchet straps
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-63, -58.6);
      ctx.lineTo(-63, -50.4);
      ctx.moveTo(-52, -58.6);
      ctx.lineTo(-52, -50.4);
      ctx.stroke();
      rr(ctx, -42.5, -60.8, 7.6, 10.4, 1.3); // fuel can
      fillStroke(ctx, '#ffb020', 0.9);
      ctx.fillStyle = '#1b2130';
      ctx.fillRect(-40.6, -62.4, 2.6, 1.8);
      ctx.strokeStyle = 'rgba(8,13,31,0.35)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(-41, -59.2);
      ctx.lineTo(-36.4, -52);
      ctx.moveTo(-36.4, -59.2);
      ctx.lineTo(-41, -52);
      ctx.stroke();

      // ---- cab roof: air horns, an amber beacon, an LED light bar ----
      for (const h of [[2.6, -1.3, '#8f9bb8'], [0, 0, '#e8edf8']]) {
        ctx.beginPath();
        ctx.moveTo(-19 + h[0], -49.3 + h[1]);
        ctx.lineTo(-12.5 + h[0], -49.6 + h[1]);
        ctx.lineTo(-9 + h[0], -51.8 + h[1]);
        ctx.lineTo(-9 + h[0], -45.6 + h[1]);
        ctx.lineTo(-12.5 + h[0], -47.5 + h[1]);
        ctx.lineTo(-19 + h[0], -47.8 + h[1]);
        ctx.closePath();
        fillStroke(ctx, h[2], 0.8);
      }
      const beat = Math.max(0, Math.sin(t * 10));
      rr(ctx, -4.6, -47, 7.4, 2.2, 0.7);
      fillStroke(ctx, '#1b2130', 0.8);
      rr(ctx, -3.5, -53, 5.2, 6.2, 2.5);
      fillStroke(ctx, '#ffb020', 0.9);
      glow(ctx, -0.9, -50, 9 + beat * 9, '#ffb020', 0.25 + beat * 0.6);
      rr(ctx, 4.5, -51.4, 22, 6, 1.6);
      fillStroke(ctx, '#1b2130', 1);
      ctx.fillStyle = '#fff3b0';
      for (let i = 0; i < 6; i++) ctx.fillRect(6 + i * 3.4, -50, 2.4, 3.2);
      glow(ctx, 22, -48.4, 15, '#fff3b0', 0.5);
      // snorkel up the windscreen pillar
      ctx.beginPath();
      ctx.moveTo(49, -12.5);
      ctx.lineTo(33.5, -39.5);
      ctx.lineTo(33.5, -50);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 4.2;
      ctx.stroke();
      ctx.strokeStyle = '#2a3247';
      ctx.lineWidth = 2.6;
      ctx.stroke();
      rr(ctx, 30.6, -55.4, 7.8, 6.2, 1.8);
      fillStroke(ctx, '#2a3247', 1);
      ctx.fillStyle = '#0b1020';
      ctx.fillRect(35.7, -53.9, 1.7, 3.2);
      // tow mirror
      rr(ctx, 35.2, -25.5, 5.8, 9.4, 1.6);
      fillStroke(ctx, '#232a3c', 1);

      // ---- front: headlight beam, bull bar, spot lamps, winch ----
      const beam = ctx.createLinearGradient(93, 0, 178, 0);
      beam.addColorStop(0, 'rgba(255,243,176,0.3)');
      beam.addColorStop(1, 'rgba(255,243,176,0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(93, -6.5);
      ctx.lineTo(178, -24);
      ctx.lineTo(178, 22);
      ctx.lineTo(93, -2);
      ctx.closePath();
      ctx.fill();
      rr(ctx, 93.5, 9.2, 8.5, 5, 1.2); // winch
      fillStroke(ctx, '#1b2130', 0.9);
      ctx.beginPath();
      ctx.moveTo(92, 17);
      ctx.lineTo(100.5, 16);
      ctx.lineTo(101.5, -11);
      ctx.quadraticCurveTo(101.5, -17, 95.5, -17);
      ctx.lineTo(89, -16);
      ctx.moveTo(94, 3);
      ctx.lineTo(101, 3);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 3.8;
      ctx.stroke();
      ctx.strokeStyle = '#46516f';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.strokeStyle = '#ff9a3d'; // winch hook
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(102, 11.6);
      ctx.lineTo(104.6, 11.6);
      ctx.arc(104.6, 14.2, 2.6, -Math.PI / 2, Math.PI * 0.8);
      ctx.stroke();
      for (const lx of [92.6, 99]) {
        ctx.beginPath();
        ctx.arc(lx, -20.6, 3.1, 0, TAU);
        fillStroke(ctx, '#fff3b0', 1);
      }
      glow(ctx, 100, -20.6, 17, '#fff3b0', 0.55);

      // ---- running board, mud flaps, painted arches, alloy wheels ----
      rr(ctx, -27.5, 13.6, 60, 3.4, 1.6);
      fillStroke(ctx, chrome(13.6, 17), 0.9);
      for (const wx of [-54, 58]) {
        ctx.save();
        ctx.translate(wx - 25.5, 17);
        ctx.rotate(0.14 + lean * 0.35 + Math.sin(t * 11 + wx) * 0.04);
        ctx.fillStyle = '#161b29';
        ctx.fillRect(-1.6, 0, 3.2, 15.5);
        ctx.fillStyle = '#8f9bb8';
        ctx.fillRect(-1.6, 13, 3.2, 1.5);
        ctx.restore();
        ctx.beginPath(); // wheel well
        ctx.arc(wx, 19, 21.5, Math.PI, 0);
        ctx.closePath();
        ctx.fillStyle = '#0b1020';
        ctx.fill();
        bigWheel(ctx, wx, 21, 18, spin * 0.26);
        ctx.beginPath(); // the wide arch, painted to match
        ctx.arc(wx, 19, 26, Math.PI, 0);
        ctx.lineTo(wx + 21.5, 19);
        ctx.arc(wx, 19, 21.5, 0, Math.PI, true);
        ctx.closePath();
        fillStroke(ctx, vgrad(ctx, -7, 19, '#ffffff', '#b9c3d9'), 1.2);
      }
    }
  };

  // a collectable letter tile. Spelling T-E-C-H calls in The F-150.
  art.drawLetter = function (ctx, x, y, ch, t) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    glow(ctx, x, y, 78 + pulse * 14, '#ffffff', 0.6);
    glow(ctx, x, y, 54, '#38d6ff', 0.7);
    ctx.save();
    ctx.translate(x, y);
    // slow rays behind the tile
    ctx.save();
    ctx.rotate(t * 0.9);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (let i = 0; i < 6; i++) {
      ctx.rotate(TAU / 6);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-8, -50);
      ctx.lineTo(8, -50);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.rotate(Math.sin(t * 2.6) * 0.13);
    const k = 1.16 + pulse * 0.06;
    ctx.scale(k, k);
    ctx.lineJoin = 'round';
    rr(ctx, -25, -25, 50, 50, 12);
    fillStroke(ctx, vgrad(ctx, -25, 25, '#ffffff', '#c9d3ec'), 3.2);
    rr(ctx, -19.5, -19.5, 39, 39, 8);
    ctx.strokeStyle = 'rgba(18,48,107,0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#12306b';
    ctx.font = '700 38px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, 0, 2);
    // a twinkle on one corner
    const tw = 4 + 5 * Math.max(0, Math.sin(t * 7));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(21, -21 - tw);
    ctx.quadraticCurveTo(21, -21, 21 + tw, -21);
    ctx.quadraticCurveTo(21, -21, 21, -21 + tw);
    ctx.quadraticCurveTo(21, -21, 21 - tw, -21);
    ctx.quadraticCurveTo(21, -21, 21, -21 - tw);
    ctx.fill();
    ctx.restore();
  };

  art.drawPowerup = function (ctx, x, y, type, t) {
    const def = art.POWERUPS[type];
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    glow(ctx, x, y, 58 + pulse * 10, def.color, 0.7);
    ctx.save();
    ctx.translate(x, y);
    // orbiting dashes
    ctx.save();
    ctx.rotate(t * 1.6);
    ctx.setLineDash([9, 9.85]);
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, TAU);
    ctx.strokeStyle = rgba(def.color, 0.8);
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, 23, 0, TAU);
    const g = ctx.createRadialGradient(-6, -8, 2, 0, 0, 23);
    g.addColorStop(0, '#2a3766');
    g.addColorStop(1, '#0b1026');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = def.color;
    ctx.stroke();
    art.drawPowerIcon(ctx, type, 27, def.color);
    ctx.beginPath();
    ctx.arc(0, 0, 19, Math.PI * 1.15, Math.PI * 1.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  };

  /* =====================================================================
   *  WORLD — four zones, each built once into wide tiles and scrolled in
   *  parallax: skyline, city, lab wall with windows, columns, floor/ceiling.
   * ===================================================================== */
  art.THEMES = [
    { id: 'lab', name: 'OPENING NIGHT', sky: ['#060a1c', '#131a4c', '#33307e'], haze: '#5a72ff',
      far: '#161d4c', mid: '#0b1030', lit: '#ffd98a', lit2: '#7fd8ff',
      wall: '#1c2544', wallHi: '#2c3a66', wallLo: '#111830', accent: '#38d6ff', deck: '#151c36', glass: '#6aa8ff' },
    { id: 'reactor', name: 'LATE NIGHT', sky: ['#10051d', '#2c0f4e', '#5d1c70'], haze: '#ff4fd8',
      far: '#2b114a', mid: '#160828', lit: '#ffb3f1', lit2: '#ffd98a',
      wall: '#271b3f', wallHi: '#3d2c5f', wallLo: '#170f28', accent: '#c77dff', deck: '#1b1330', glass: '#c08cff' },
    { id: 'hydro', name: 'SECOND WIND', sky: ['#02131a', '#06303b', '#0e5d5c'], haze: '#3dffc0',
      far: '#0b313a', mid: '#051b21', lit: '#b6ffd8', lit2: '#ffe9a3',
      wall: '#15323c', wallHi: '#214a57', wallLo: '#0b1f27', accent: '#3dffc0', deck: '#0e242b', glass: '#6affd8' },
    { id: 'dawn', name: 'SUNRISE', sky: ['#1a1238', '#6b2f6c', '#ff8f62'], haze: '#ffc27a',
      far: '#3c2152', mid: '#1d1230', lit: '#ffe3a8', lit2: '#ffab8a',
      wall: '#2b233a', wallHi: '#433651', wallLo: '#191323', accent: '#ffd08a', deck: '#1d1727', glass: '#ffc9a0' },
  ];

  const TW = 1600; // width of a scenery tile

  // The arena seen through the tunnel windows: seating tiers full of glow
  // sticks, rigging, hand-made banners and the big screen.
  const STICKS = ['#3dffc0', '#ff4fd8', '#ffd23f', '#38d6ff', '#ff8a3d', '#ffffff'];
  function buildFar(th, rnd) {
    const c = makeCanvas(TW, H);
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 600);
    sky.addColorStop(0, th.sky[0]);
    sky.addColorStop(0.55, th.sky[1]);
    sky.addColorStop(1, th.sky[2]);
    g.fillStyle = sky;
    g.fillRect(0, 0, TW, H);
    // seating tiers
    for (let tier = 0; tier < 3; tier++) {
      const y0 = 150 + tier * 96;
      g.fillStyle = 'rgba(0,0,0,0.24)';
      g.fillRect(0, y0, TW, 82);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(0, y0, TW, 2);
      for (let row = 0; row < 5; row++)
        for (let x = 6; x < TW - 8; x += 8 + rnd() * 5) {
          if (rnd() < 0.5) continue;
          g.fillStyle = rgba(STICKS[Math.floor(rnd() * STICKS.length)], 0.25 + rnd() * 0.6);
          g.fillRect(x, y0 + 9 + row * 14 + rnd() * 4, 2.5, 5);
        }
    }
    const hz = g.createLinearGradient(0, 360, 0, 640);
    hz.addColorStop(0, rgba(th.haze, 0));
    hz.addColorStop(1, rgba(th.haze, 0.4));
    g.fillStyle = hz;
    g.fillRect(0, 360, TW, 280);
    // rigging with stage lamps
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(0, 112, TW, 5);
    g.fillRect(0, 126, TW, 3);
    for (let x = 80; x < TW; x += 160) {
      const col = (x / 160) % 2 < 1 ? th.accent : th.haze;
      const lg = g.createRadialGradient(x, 136, 2, x, 136, 46);
      lg.addColorStop(0, rgba(col, 0.8));
      lg.addColorStop(1, rgba(col, 0));
      g.fillStyle = lg;
      g.fillRect(x - 46, 90, 92, 92);
      g.fillStyle = '#05070f';
      g.fillRect(x - 8, 117, 16, 14);
      g.fillStyle = '#ffffff';
      g.fillRect(x - 5, 131, 10, 3);
    }
    // hand-painted banners
    const texts = ['46', 'DANCE', 'TECH', 'STAND'];
    [170, 500, 1190, 1470].forEach((bx, i) => {
      g.beginPath();
      g.moveTo(bx - 50, 132);
      g.lineTo(bx + 50, 132);
      g.lineTo(bx + 50, 280);
      g.lineTo(bx, 256);
      g.lineTo(bx - 50, 280);
      g.closePath();
      g.fillStyle = rgba(i % 2 ? th.haze : th.accent, 0.62);
      g.fill();
      g.fillStyle = 'rgba(4,8,20,0.8)';
      g.font = '700 ' + (texts[i].length > 2 ? 25 : 46) + 'px ' + FONT;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(texts[i], bx, 190);
      g.fillRect(bx - 30, 216, 60, 4);
    });
    // the big screen
    rr(g, 700, 146, 330, 150, 10);
    g.fillStyle = 'rgba(3,5,14,0.85)';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = rgba(th.accent, 0.3);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.font = '700 74px ' + FONT;
    g.fillText('TECH', 865, 206);
    g.fillStyle = rgba(th.accent, 0.7);
    g.font = '700 19px ' + FONT;
    g.fillText('46 HOURS  ·  NO SITTING', 865, 266);
    return c;
  }

  // The dance floor: a crowd of dancers with their hands (and glow sticks) up.
  function buildMid(th, rnd) {
    const c = makeCanvas(TW, H);
    const g = c.getContext('2d');
    g.lineCap = 'round';
    const dancer = (x, y, s, col) => {
      g.fillStyle = col;
      g.strokeStyle = col;
      g.beginPath();
      g.arc(x, y, 11 * s, 0, TAU);
      g.fill();
      rr(g, x - 15 * s, y + 10 * s, 30 * s, 320, 12 * s);
      g.fill();
      for (const side of [-1, 1]) {
        const up = rnd() < 0.62;
        const hx = x + side * (up ? 17 + rnd() * 12 : 23) * s;
        const hy = up ? y - (22 + rnd() * 24) * s : y + 36 * s;
        g.lineWidth = 7 * s;
        g.strokeStyle = col;
        g.beginPath();
        g.moveTo(x + side * 12 * s, y + 19 * s);
        g.lineTo(hx, hy);
        g.stroke();
        if (up && rnd() < 0.5) {
          const sc = STICKS[Math.floor(rnd() * STICKS.length)];
          const tx = hx + side * 7 * s, ty = hy - 24 * s;
          const gl = g.createRadialGradient(tx, ty, 1, tx, ty, 22);
          gl.addColorStop(0, rgba(sc, 0.45));
          gl.addColorStop(1, rgba(sc, 0));
          g.fillStyle = gl;
          g.fillRect(tx - 22, ty - 22, 44, 44);
          g.strokeStyle = sc;
          g.lineWidth = 3.6 * s;
          g.beginPath();
          g.moveTo(hx, hy);
          g.lineTo(tx, ty);
          g.stroke();
        }
      }
    };
    for (let x = 44; x < TW - 44; x += 24 + rnd() * 12) dancer(x, 440 + rnd() * 34, 0.78, th.far);
    for (let x = 50; x < TW - 50; x += 32 + rnd() * 16) dancer(x, 486 + rnd() * 40, 1.05, th.mid);
    return c;
  }

  function buildWall(th, rnd) {
    const c = makeCanvas(TW, H);
    const g = c.getContext('2d');
    const wg = g.createLinearGradient(0, CEIL, 0, FLOOR);
    wg.addColorStop(0, th.wallHi);
    wg.addColorStop(0.35, th.wall);
    wg.addColorStop(1, th.wallLo);
    g.fillStyle = wg;
    g.fillRect(0, 0, TW, H);
    // panel seams and rivets
    for (let x = 0; x < TW; x += 100) {
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(x, 0, 2, H);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(x + 2, 0, 1, H);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 548, TW, 2);
    g.fillRect(0, 122, TW, 2);
    for (let x = 50; x < TW; x += 100)
      for (const y of [88, 108, 566, 620]) {
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.beginPath();
        g.arc(x - 40, y, 1.8, 0, TAU);
        g.arc(x + 40, y, 1.8, 0, TAU);
        g.fill();
      }

    const signs = ['NO SITTING', 'NO SLEEPING', 'TECH HQ', 'HYDRATE', 'SNACKS', 'TECH CREW', 'STAY UP', 'DANCE'];
    for (let bay = 0; bay < 2; bay++) {
      const bx = bay * 800;
      const wx = bx + 140, wy = 142, ww = 620, wh = 388;
      // window frame
      rr(g, wx - 16, wy - 16, ww + 32, wh + 32, 22);
      g.fillStyle = th.wallLo;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(255,255,255,0.10)';
      g.stroke();
      // cut the opening so the city shows through
      g.globalCompositeOperation = 'destination-out';
      rr(g, wx, wy, ww, wh, 12);
      g.fill();
      g.globalCompositeOperation = 'source-over';
      // glass: tint + reflections
      g.save();
      rr(g, wx, wy, ww, wh, 12);
      g.clip();
      const gg = g.createLinearGradient(0, wy, 0, wy + wh);
      gg.addColorStop(0, rgba(th.glass, 0.16));
      gg.addColorStop(1, rgba(th.glass, 0.04));
      g.fillStyle = gg;
      g.fillRect(wx, wy, ww, wh);
      g.fillStyle = 'rgba(255,255,255,0.045)';
      for (const rx of [70, 150, 420]) {
        g.beginPath();
        g.moveTo(wx + rx, wy);
        g.lineTo(wx + rx + (rx === 150 ? 26 : 60), wy);
        g.lineTo(wx + rx - 170 + (rx === 150 ? 26 : 60), wy + wh);
        g.lineTo(wx + rx - 170, wy + wh);
        g.closePath();
        g.fill();
      }
      g.restore();
      // mullions
      g.fillStyle = th.wallLo;
      g.fillRect(wx + ww / 3 - 5, wy, 10, wh);
      g.fillRect(wx + (ww * 2) / 3 - 5, wy, 10, wh);
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fillRect(wx + ww / 3 - 5, wy, 2, wh);
      g.fillRect(wx + (ww * 2) / 3 - 5, wy, 2, wh);
      // inner glow line around the window
      rr(g, wx - 5, wy - 5, ww + 10, wh + 10, 16);
      g.lineWidth = 2;
      g.strokeStyle = rgba(th.accent, 0.35);
      g.stroke();

      // light bar on the pier between windows
      const lx = bx + 58;
      const lg = g.createRadialGradient(lx, 330, 4, lx, 330, 150);
      lg.addColorStop(0, rgba(th.accent, 0.13));
      lg.addColorStop(1, rgba(th.accent, 0));
      g.fillStyle = lg;
      g.fillRect(lx - 150, 160, 300, 340);
      rr(g, lx - 5, 200, 10, 260, 5);
      g.fillStyle = rgba(th.accent, 0.38);
      g.fill();
      rr(g, lx - 2, 204, 4, 252, 2);
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fill();
      // sector sign
      rr(g, bx + 6, 86, 116, 28, 5);
      g.fillStyle = 'rgba(4,8,20,0.55)';
      g.fill();
      g.font = '700 15px ' + FONT;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = rgba(th.accent, 0.8);
      g.fillText(signs[Math.floor(rnd() * signs.length)], bx + 64, 101);
      // vent
      const vx = bx + 190;
      rr(g, vx, 566, 130, 46, 6);
      g.fillStyle = 'rgba(4,8,20,0.5)';
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.07)';
      for (let i = 0; i < 5; i++) g.fillRect(vx + 10, 574 + i * 8, 110, 3);
      // status console
      const sx = bx + 560;
      rr(g, sx, 562, 150, 54, 6);
      g.fillStyle = 'rgba(4,8,20,0.55)';
      g.fill();
      for (let i = 0; i < 9; i++) {
        g.fillStyle = rgba(rnd() < 0.3 ? '#ffd23f' : th.accent, 0.25 + rnd() * 0.5);
        g.fillRect(sx + 12 + i * 14, 596 - Math.floor(4 + rnd() * 22), 8, Math.floor(4 + rnd() * 22));
      }
      // pipes
      g.fillStyle = 'rgba(4,8,20,0.45)';
      g.fillRect(bx + 340, 584, 200, 7);
      g.fillRect(bx + 340, 598, 200, 7);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(bx + 340, 584, 200, 2);
      g.fillRect(bx + 340, 598, 200, 2);
    }
    // keep the wall in the background: darken a touch
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(3,6,16,0.22)';
    g.fillRect(0, 0, TW, H);
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  function buildNear(th) {
    const c = makeCanvas(TW, H);
    const g = c.getContext('2d');
    const dark = '#070b18';
    // overhead truss
    g.strokeStyle = rgba(dark, 0.9);
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(0, CEIL + 4);
    g.lineTo(TW, CEIL + 4);
    g.moveTo(0, CEIL + 34);
    g.lineTo(TW, CEIL + 34);
    g.stroke();
    g.lineWidth = 3;
    g.beginPath();
    for (let x = 0; x < TW; x += 80) {
      g.moveTo(x, CEIL + 4);
      g.lineTo(x + 40, CEIL + 34);
      g.lineTo(x + 80, CEIL + 4);
    }
    g.stroke();
    // hanging cables
    g.lineWidth = 2.5;
    g.strokeStyle = rgba(dark, 0.8);
    for (const s of [[120, 620, 22], [900, 1420, 28]]) {
      g.beginPath();
      g.moveTo(s[0], CEIL + 34);
      g.quadraticCurveTo((s[0] + s[1]) / 2, CEIL + 34 + s[2] * 2, s[1], CEIL + 34);
      g.stroke();
    }
    // columns
    for (const x of [380, 1180]) {
      const cg = g.createLinearGradient(x - 26, 0, x + 26, 0);
      cg.addColorStop(0, '#0d1226');
      cg.addColorStop(0.5, '#151c38');
      cg.addColorStop(1, '#090d1c');
      g.fillStyle = cg;
      g.beginPath();
      g.moveTo(x - 44, CEIL);
      g.lineTo(x + 44, CEIL);
      g.lineTo(x + 26, CEIL + 50);
      g.lineTo(x + 26, FLOOR - 40);
      g.lineTo(x + 46, FLOOR);
      g.lineTo(x - 46, FLOOR);
      g.lineTo(x - 26, FLOOR - 40);
      g.lineTo(x - 26, CEIL + 50);
      g.closePath();
      g.globalAlpha = 0.94;
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(x - 26, CEIL + 50, 2, FLOOR - CEIL - 90);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      for (let y = CEIL + 90; y < FLOOR - 60; y += 96) g.fillRect(x - 26, y, 52, 3);
      // beacon
      const bg = g.createRadialGradient(x, 300, 2, x, 300, 60);
      bg.addColorStop(0, rgba(th.accent, 0.5));
      bg.addColorStop(1, rgba(th.accent, 0));
      g.fillStyle = bg;
      g.fillRect(x - 60, 240, 120, 120);
      rr(g, x - 9, 290, 18, 20, 4);
      g.fillStyle = rgba(th.accent, 0.9);
      g.fill();
    }
    return c;
  }

  const DECK_W = 640;
  function buildDeck(th) {
    const c = makeCanvas(DECK_W, H);
    const g = c.getContext('2d');
    // light cones from the ceiling lamps
    for (const lx of [160, 480]) {
      const cone = g.createLinearGradient(0, CEIL, 0, FLOOR);
      cone.addColorStop(0, rgba(th.accent, 0.1));
      cone.addColorStop(1, rgba(th.accent, 0));
      g.fillStyle = cone;
      g.beginPath();
      g.moveTo(lx - 30, CEIL);
      g.lineTo(lx + 30, CEIL);
      g.lineTo(lx + 150, FLOOR);
      g.lineTo(lx - 150, FLOOR);
      g.closePath();
      g.fill();
    }
    // ---- ceiling ----
    g.fillStyle = vgrad(g, 0, CEIL, '#05070f', th.deck);
    g.fillRect(0, 0, DECK_W, CEIL);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let x = 0; x < DECK_W; x += 160) g.fillRect(x, 0, 2, CEIL - 10);
    g.fillStyle = th.wallHi;
    g.fillRect(0, CEIL - 10, DECK_W, 10);
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(0, CEIL - 10, DECK_W, 1.5);
    g.fillStyle = vgrad(g, CEIL, CEIL + 36, rgba(th.accent, 0.2), rgba(th.accent, 0));
    g.fillRect(0, CEIL, DECK_W, 36);
    g.fillStyle = rgba(th.accent, 0.95);
    g.fillRect(0, CEIL - 2.5, DECK_W, 2.5);
    for (const lx of [160, 480]) {
      rr(g, lx - 44, CEIL - 9, 88, 12, 5);
      g.fillStyle = '#eaf6ff';
      g.fill();
      rr(g, lx - 52, CEIL - 14, 104, 7, 3);
      g.fillStyle = '#0a0e1c';
      g.fill();
    }
    // ---- floor ----
    g.fillStyle = vgrad(g, FLOOR - 40, FLOOR, rgba(th.accent, 0), rgba(th.accent, 0.16));
    g.fillRect(0, FLOOR - 40, DECK_W, 40);
    g.fillStyle = vgrad(g, FLOOR, H, th.wallHi, '#04060d');
    g.fillRect(0, FLOOR, DECK_W, H - FLOOR);
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x <= DECK_W; x += 80) {
      g.moveTo(x, FLOOR + 12);
      g.lineTo(x - 26, H);
    }
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, FLOOR + 40, DECK_W, 2);
    // direction chevrons on the track
    g.strokeStyle = rgba(th.accent, 0.3);
    g.lineWidth = 4;
    g.lineJoin = 'miter';
    for (const cx of [300, 326, 352]) {
      g.beginPath();
      g.moveTo(cx - 8, FLOOR + 17);
      g.lineTo(cx, FLOOR + 26);
      g.lineTo(cx - 12, FLOOR + 35);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(0, FLOOR + 3, DECK_W, 7);
    g.fillStyle = rgba(th.accent, 1);
    g.fillRect(0, FLOOR, DECK_W, 3.5);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillRect(0, FLOOR + 0.5, DECK_W, 1.2);
    return c;
  }

  const themeCache = {};
  const BUILDERS = ['far', 'mid', 'wall', 'near', 'deck'];
  function buildLayer(set, key) {
    const th = set.theme;
    const rnd = seeded(set.index * 1000 + BUILDERS.indexOf(key) * 37 + 11);
    if (key === 'far') set.far = buildFar(th, rnd);
    else if (key === 'mid') set.mid = buildMid(th, rnd);
    else if (key === 'wall') set.wall = buildWall(th, rnd);
    else if (key === 'near') set.near = buildNear(th);
    else set.deck = buildDeck(th);
  }
  // Fully built scenery for zone i (builds whatever is still missing).
  art.getTheme = function (i) {
    i = ((i % art.THEMES.length) + art.THEMES.length) % art.THEMES.length;
    let set = themeCache[i];
    if (!set) set = themeCache[i] = { index: i, theme: art.THEMES[i] };
    for (const k of BUILDERS) if (!set[k]) buildLayer(set, k);
    return set;
  };
  // Build the next zone one layer at a time between frames, so there's no hitch.
  art.prewarm = function (i) {
    i = ((i % art.THEMES.length) + art.THEMES.length) % art.THEMES.length;
    let set = themeCache[i];
    if (!set) set = themeCache[i] = { index: i, theme: art.THEMES[i] };
    const step = () => {
      const k = BUILDERS.find((b) => !set[b]);
      if (!k) return;
      buildLayer(set, k);
      setTimeout(step, 60);
    };
    setTimeout(step, 60);
  };

  function tile(ctx, img, scroll, tw, snap, y) {
    let off = -(((scroll % tw) + tw) % tw);
    off = Math.round(off * snap) / snap; // land on whole device pixels: no shimmer
    for (let x = off; x < W; x += tw) ctx.drawImage(img, x, y || 0);
  }

  art.BEAT_HZ = 1.8; // the crowd bounces in time with the music (108 bpm)
  art.drawBackground = function (ctx, camX, set, snap, t) {
    t = t || 0;
    const th = set.theme;
    tile(ctx, set.far, camX * 0.04, TW, snap);
    // sweeping stage lights
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const ox = ((((i * 300 - camX * 0.04) % 1500) + 1500) % 1500) - 110;
      const a = Math.sin(t * 0.8 + i * 1.9) * 0.55;
      const col = i % 2 ? th.haze : th.accent;
      const dx = Math.sin(a), dy = Math.cos(a);
      const ex = ox + dx * 560, ey = 130 + dy * 560;
      const grad = ctx.createLinearGradient(ox, 130, ex, ey);
      grad.addColorStop(0, rgba(col, 0.36));
      grad.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(ox - dy * 6, 130 + dx * 6);
      ctx.lineTo(ox + dy * 6, 130 - dx * 6);
      ctx.lineTo(ex + dy * 80, ey - dx * 80);
      ctx.lineTo(ex - dy * 80, ey + dx * 80);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = prev;
    tile(ctx, set.mid, camX * 0.16, TW, snap, -Math.abs(Math.sin(t * Math.PI * art.BEAT_HZ)) * 6);
    tile(ctx, set.wall, camX * 0.42, TW, snap);
    tile(ctx, set.near, camX * 0.72, TW, snap);
    tile(ctx, set.deck, camX, DECK_W, snap);
  };

  let vignette = null;
  art.drawVignette = function (ctx) {
    if (!vignette) {
      vignette = makeCanvas(W / 2, H / 2);
      const g = vignette.getContext('2d');
      const v = g.createRadialGradient(W / 4, H / 4, H * 0.22, W / 4, H / 4, H * 0.62);
      v.addColorStop(0, 'rgba(2,4,12,0)');
      v.addColorStop(1, 'rgba(2,4,12,0.55)');
      g.fillStyle = v;
      g.fillRect(0, 0, W / 2, H / 2);
    }
    ctx.drawImage(vignette, 0, 0, W, H);
  };
})();
