/* Techride — every visual is drawn in code (vector shapes on canvas), so the
 * art is original, razor sharp at any screen size, and each hitbox can match
 * the shape that is actually on screen. */
(function () {
  'use strict';
  const TR = window.TR;
  const { TAU, clamp, lerp, seeded } = TR.util;
  const W = TR.W, H = TR.H, CEIL = TR.CEIL, FLOOR = TR.FLOOR;

  const OUTLINE = '#080d1f';
  const FONT = '"Fredoka", "Segoe UI", system-ui, sans-serif';
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
    { id: 'bolt', name: 'TECHBOT', blurb: 'The original. Once cardboard, foil and green tape. Still mostly tape.', cost: 0,
      body: '#a6e22e', bodyLo: '#5f9a12', limb: '#dfe6f2', limbLo: '#8e99b3', pack: '#4a556f', packLo: '#262e45',
      eye: '#4aa8ff', accent: '#4aa8ff', flame: '#38d6ff', flameCore: '#eaffff' },
    // `kit` picks the gear and face (see the kit* functions below). `head`,
    // `hand`, `leg` and `shoe` recolour those parts, `noVisor` leaves the face
    // bare (the committee members), `sparks` are the exhaust colours and
    // `tag` is the label on the Hangar card. `armsOut` holds both hands out in front. `tall` adds leg length and `armsBack` keeps the arms behind the body.
    { id: 'average', name: 'AVERAGE TECH CAPTAIN', tag: 'STARTER PACK', cost: 100, kit: 'avg',
      blurb: 'Hoodie, vest, 46 unread messages. Deeply cooked.',
      body: '#2b2e3a', bodyLo: '#15171e', head: '#e8bd98', headLo: '#cf9c74', hand: '#e8bd98', noVisor: true,
      limb: '#e3f0a0', limbLo: '#b7cc68', leg: '#262933', legLo: '#14161c', shoe: '#f1c4cc',
      pack: '#3a4258', packLo: '#1b2031', eye: '#1c1a22', accent: '#e3f0a0', flame: '#cfe86a', flameCore: '#ffffff' },
    { id: 'brandon', name: 'FINAL BOSS', blurb: 'Tech captain. Dressed for the boardroom, built for the dance floor.', cost: 150, kit: 'brandon',
      body: '#24448f', bodyLo: '#142a5e', head: '#f2cba6', headLo: '#dba77d', hand: '#f2cba6', noVisor: true,
      limb: '#2a4c9c', limbLo: '#182f66', pack: '#343c52', packLo: '#181d2c',
      eye: '#141a33', accent: '#38a3ff', flame: '#5b8cff', flameCore: '#ffffff',
      sparks: ['#5b8cff', '#bcd6f5', '#ffffff'] },
    { id: 'dribbler', name: 'THE DRIBBLER', blurb: 'Shirt status: soaked. Cause: his own chin. Smile: undefeated.', cost: 300, kit: 'dribbler',
      body: '#dde3ee', bodyLo: '#b3bdd0', head: '#f1c9a8', headLo: '#d9a57f', hand: '#f1c9a8', noVisor: true,
      limb: '#dde3ee', limbLo: '#a9b3c8', leg: '#cbbf9f', legLo: '#9d9276', shoe: '#f4f6fb', tall: 11, armsBack: true,
      pack: '#3d5578', packLo: '#1e2c47', eye: '#1c1a22', accent: '#9fe8ff', flame: '#9fe8ff', flameCore: '#ffffff',
      sparks: ['#9fe8ff', '#ffffff'] },
    { id: 'warrior', name: 'THE WARRIOR', blurb: 'Unbothered. Unblinking. A can in each hand.', cost: 400, kit: 'warrior',
      body: '#f3f5f9', bodyLo: '#c3c9d8', head: '#b9855a', headLo: '#9a6940', hand: '#b9855a', noVisor: true,
      limb: '#f3f5f9', limbLo: '#b9bfce', leg: '#23252d', legLo: '#131419', shoe: '#2a2d38', armsOut: true,
      pack: '#26365f', packLo: '#131c36', eye: '#17130f', accent: '#7fa2ff', flame: '#7fa2ff', flameCore: '#ffffff' },
    { id: 'violet', name: 'GLOW STICK', blurb: 'Cracked, shaken, and ready for the line dance.', cost: 500, kit: 'glow',
      body: '#2a2050', bodyLo: '#0f0a22', limb: '#3df5ff', limbLo: '#b32fc4', pack: '#2b2350', packLo: '#120e26',
      eye: '#ffe93d', accent: '#ff3df2', flame: '#ff3df2', flameCore: '#ffffff',
      sparks: ['#ff3df2', '#3df5ff', '#b6ff3c', '#ffe93d'] },
    { id: 'darsh', name: 'MR ACTIVE', tag: 'BEST DRESSED', cost: 800, kit: 'darsh',
      blurb: 'Knit sweater, pleated trousers, tinted shades. To a dance marathon.',
      body: '#26272f', bodyLo: '#101116', head: '#b8824f', headLo: '#996538', hand: '#b8824f', noVisor: true,
      limb: '#2c2d36', limbLo: '#17181e', leg: '#4d505c', legLo: '#2e3038', shoe: '#0d0d11',
      pack: '#3a3d48', packLo: '#1a1b21', eye: '#17130f', accent: '#e8c36a', flame: '#ffcf6b', flameCore: '#ffffff',
      sparks: ['#e8c36a', '#ffffff'] },
    { id: 'gold', name: 'TOTAL REVEAL', blurb: 'Solid gold. Funded entirely by spare change.', cost: 1500, kit: 'gold',
      body: '#ffd23f', bodyLo: '#c98a10', limb: '#fff3c4', limbLo: '#b99a4a', pack: '#6b5524', packLo: '#3a2d10',
      eye: '#ffffff', accent: '#fff3a0', flame: '#ffe066', flameCore: '#ffffff',
      sparks: ['#ffd23f', '#fff3a0', '#ffffff', '#ff8fb1'] },
    { id: 'director', name: 'THE DIRECTOR', tag: 'LEGENDARY', cost: 2500, kit: 'director',
      blurb: 'The full comfort set, hood up. You are still running the starter pack.',
      body: '#e3f0a0', bodyLo: '#b7cc68', head: '#f3d0b5', headLo: '#dcaa88', hand: '#f3d0b5', noVisor: true,
      limb: '#e3f0a0', limbLo: '#b7cc68', shoe: '#1b2440', pack: '#6b5524', packLo: '#3a2d10',
      eye: '#1c1a22', accent: '#ffd23f', flame: '#ffe066', flameCore: '#ffffff',
      sparks: ['#e3f0a0', '#ffd23f', '#ffffff'] },
    // `secret`: not in the Hangar until it has been unlocked (js/eggs.js)
    { id: 'cardboard', name: 'TECHBOT MK I', tag: 'SECRET', secret: true, cost: 0, kit: 'cardboard',
      blurb: 'The original original: cardboard, foil, green tape and one very warm volunteer.',
      body: '#dfe4ec', bodyLo: '#9aa3b3', head: '#dfe4ec', headLo: '#9aa3b3', hand: '#e8bd98', noVisor: true,
      limb: '#d9dee7', limbLo: '#9aa3b3', leg: '#e8bd98', legLo: '#cf9c74', shoe: '#f4f6fb',
      pack: '#b98d5c', packLo: '#8a6238', eye: '#2f6fe0', accent: '#39e03a', flame: '#ffb020', flameCore: '#fff6d6' },
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

  /* ---------- people ----------
   * Some skins are committee members instead of bots. They share one head;
   * PERSON[kit] says what goes on it. */
  const COMFORT = ['#e3f0a0', '#b7cc68']; // the comfort set
  const PERSON = {
    avg: { hood: COMFORT, fringe: '#4a3526', brow: '#3a2a1e', eyes: 'tired', mouth: 'flat' },
    director: { hood: COMFORT, fringe: '#7a5636', brow: '#5d4129', eyes: 'happy', mouth: 'grin', halo: true },
    dribbler: { hair: '#2a1f1a', messy: true, brow: '#2a1f1a', mouth: 'grin' },
    darsh: { hair: '#17130f', brow: '#17130f', beard: '#17130f', glasses: 'tint', mouth: 'grin' },
    // not in the Hangar: they turn up in the world (see the cameos in game.js)
    marilyn: { hair: '#1a1512', long: true, brow: '#1a1512', glasses: 'rect', mouth: 'grin' },
    olivia: { hair: '#1a1512', pony: true, brow: '#1a1512', eyes: 'happy', mouth: 'grin' },
    warrior: { cap: ['#d5d9e1', '#26365f'], hair: '#17130f', brow: '#17130f', beard: '#17130f', glasses: 'rect',
      mouth: 'smirk', hoodDown: '#f3f5f9', noBlink: true },
  };

  function personHeadBack(ctx, P, t) {
    if (P.long) {
      // long hair, down past the shoulders
      ctx.beginPath();
      ctx.moveTo(-18, -44);
      ctx.quadraticCurveTo(-29, -24, -24, 2);
      ctx.quadraticCurveTo(-17, 8, -9, 3);
      ctx.quadraticCurveTo(-6, -14, -8, -30);
      ctx.closePath();
      fillStroke(ctx, P.hair, 2.2);
    }
    if (P.pony) {
      // a ponytail, streaming out behind
      const sw = Math.sin(t * 14) * 3;
      ctx.beginPath();
      ctx.moveTo(-17, -43);
      ctx.quadraticCurveTo(-37, -45 + sw, -38, -28 + sw);
      ctx.quadraticCurveTo(-30, -27 + sw, -19, -34);
      ctx.closePath();
      fillStroke(ctx, P.hair, 2.2);
    }
    if (P.hoodDown) {
      // the hood, bunched up behind the neck
      ctx.beginPath();
      ctx.ellipse(-13, -16.5, 10, 6.5, -0.25, 0, TAU);
      fillStroke(ctx, P.hoodDown, 2.2);
    }
    return true; // people have no antenna
  }

  // hair, hood or cap; drawn on the bare head before the face
  function personHeadFront(ctx, skin, P, t) {
    if (P.hair) {
      ctx.beginPath();
      if (P.cap) {
        // only what shows below the cap
        ctx.moveTo(-9.5, -27);
        ctx.quadraticCurveTo(-15, -25, -19.5, -28);
        ctx.lineTo(-20.5, -40);
        ctx.lineTo(-7, -40);
        ctx.lineTo(-7.5, -33);
      } else {
        // short at the sides, styled up on top
        ctx.moveTo(-9.5, -27);
        ctx.quadraticCurveTo(-15, -25.5, -20, -28.5);
        ctx.quadraticCurveTo(-23, -36, -21.5, -43);
        ctx.quadraticCurveTo(-19, -53, -7, -55.5);
        ctx.quadraticCurveTo(6, -59, 17, -53);
        ctx.quadraticCurveTo(23.5, -48.5, 21, -42.5);
        ctx.quadraticCurveTo(15, -46, 7, -45.2);
        ctx.quadraticCurveTo(0, -44.5, -4, -40.5);
        ctx.quadraticCurveTo(-7, -37.5, -7.5, -33);
      }
      ctx.closePath();
      fillStroke(ctx, P.hair, 2.2);
      if (P.messy) {
        // curls breaking up the top edge
        for (const c of [[-13.5, -51.5, 5], [-4.5, -55.6, 5.2], [5.5, -56.2, 5], [14, -52.6, 4.6]]) {
          ctx.beginPath();
          ctx.arc(c[0], c[1], c[2], 0, TAU);
          fillStroke(ctx, P.hair, 2.2);
        }
        ctx.beginPath();
        ctx.ellipse(-1, -50.3, 19, 4.3, 0, 0, TAU);
        ctx.fillStyle = P.hair;
        ctx.fill();
      }
      if (!P.cap) {
        ctx.strokeStyle = 'rgba(150,140,130,0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-12, -49);
        ctx.quadraticCurveTo(-2, -54, 8, -51.5);
        ctx.stroke();
      }
      ctx.beginPath(); // ear
      ctx.ellipse(-10.5, -30, 2.8, 3.8, 0, 0, TAU);
      fillStroke(ctx, skin.head, 1.6);
    }
    if (P.cap) {
      ctx.beginPath(); // crown
      ctx.moveTo(-21, -39.5);
      ctx.quadraticCurveTo(-22, -55.5, -2, -56);
      ctx.quadraticCurveTo(18, -56.5, 21.5, -42.5);
      ctx.closePath();
      fillStroke(ctx, P.cap[1], 2.2);
      ctx.beginPath(); // front panel
      ctx.moveTo(1, -55.9);
      ctx.quadraticCurveTo(18, -56.5, 21.5, -42.5);
      ctx.lineTo(1, -41.2);
      ctx.closePath();
      fillStroke(ctx, P.cap[0], 1.6);
      ctx.beginPath(); // brim
      ctx.moveTo(13, -44.8);
      ctx.quadraticCurveTo(26, -47, 35, -40.6);
      ctx.quadraticCurveTo(26, -39.2, 13, -40.6);
      ctx.closePath();
      fillStroke(ctx, P.cap[1], 2);
      dot(ctx, -2, -56, 1.7, P.cap[0]);
    }
    if (P.hood) {
      if (P.fringe) {
        // a little hair showing at the front
        ctx.beginPath();
        ctx.moveTo(-5, -36);
        ctx.quadraticCurveTo(2, -45.5, 20.5, -43);
        ctx.quadraticCurveTo(12, -39.5, 5, -39);
        ctx.quadraticCurveTo(-1, -38.5, -5, -36);
        ctx.closePath();
        fillStroke(ctx, P.fringe, 1.6);
      }
      ctx.beginPath();
      ctx.moveTo(2, -15.4);
      ctx.lineTo(-18, -15);
      ctx.quadraticCurveTo(-28, -27, -23.5, -42);
      ctx.quadraticCurveTo(-19, -55, -4, -56);
      ctx.quadraticCurveTo(11, -57.5, 19.5, -51.5);
      ctx.quadraticCurveTo(24, -47.5, 21, -43.5);
      ctx.quadraticCurveTo(12, -46.5, 4, -43.5);
      ctx.quadraticCurveTo(-4.5, -40, -6.5, -32);
      ctx.quadraticCurveTo(-7, -21.5, 2, -15.4);
      ctx.closePath();
      fillStroke(ctx, vgrad(ctx, -56, -15, P.hood[0], P.hood[1]), 2.2);
      ctx.strokeStyle = 'rgba(70,90,20,0.35)'; // fold
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-17, -47);
      ctx.quadraticCurveTo(-22, -34, -15, -19);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; // rim
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(2, -41.5);
      ctx.quadraticCurveTo(-3.5, -38, -4.6, -31.5);
      ctx.stroke();
    }
    if (P.halo) {
      // legendary
      const hy = -63 + Math.sin(t * 3) * 0.8;
      glow(ctx, 0, hy, 22, '#ffd23f', 0.5);
      ctx.beginPath();
      ctx.ellipse(0, hy, 12.5, 3.4, -0.06, 0, TAU);
      tube(ctx, 2, '#ffd23f');
    }
  }

  function personEyes(ctx, skin, s, P) {
    const ink = skin.eye;
    for (const ex of [1.5, 12]) {
      if (s.blink && !P.noBlink) {
        ctx.fillStyle = ink;
        ctx.fillRect(ex - 2, -32.6, 4, 1.3);
      } else if (P.eyes === 'happy') {
        ctx.beginPath();
        ctx.arc(ex, -30.6, 2.6, Math.PI * 1.1, Math.PI * 1.9);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.7;
        ctx.stroke();
      } else if (P.eyes === 'tired') {
        dot(ctx, ex, -31.6, 1.8, ink);
        ctx.fillStyle = skin.head; // heavy lids
        ctx.fillRect(ex - 2.4, -34, 4.8, 2);
        ctx.fillStyle = ink;
        ctx.fillRect(ex - 2.4, -32.4, 4.8, 1.1);
        ctx.beginPath(); // and the bags to match
        ctx.arc(ex, -31, 3.4, 0.2 * Math.PI, 0.8 * Math.PI);
        ctx.strokeStyle = 'rgba(110,60,80,0.5)';
        ctx.lineWidth = 1.1;
        ctx.stroke();
      } else {
        dot(ctx, ex, -32, 1.7, ink);
        dot(ctx, ex + 0.6, -32.6, 0.6, '#ffffff');
      }
    }
  }

  // beard, brows, nose, mouth and glasses; drawn over the eyes
  function personFace(ctx, skin, P) {
    if (P.beard) {
      ctx.save();
      rr(ctx, -17.7, -45.7, 37.4, 28.4, 9.7);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(-8.5, -31);
      ctx.quadraticCurveTo(-6, -23.5, 1, -22.5);
      ctx.quadraticCurveTo(3.5, -23, 3.8, -27.4);
      ctx.lineTo(13.6, -27.4);
      ctx.quadraticCurveTo(14, -23, 16.5, -22.8);
      ctx.lineTo(22, -24);
      ctx.lineTo(22, -14);
      ctx.lineTo(-12, -14);
      ctx.closePath();
      ctx.fillStyle = rgba(P.beard, 0.86);
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = P.brow;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-1.6, -37.4);
    ctx.lineTo(4, -37.8);
    ctx.moveTo(9.4, -37.8);
    ctx.lineTo(15, -37.2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(60,30,15,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(7.6, -29.4);
    ctx.quadraticCurveTo(9.6, -27.2, 7.4, -26.6);
    ctx.stroke();
    if (P.mouth === 'grin') {
      ctx.beginPath();
      ctx.moveTo(4.6, -26);
      ctx.lineTo(12.8, -26);
      ctx.quadraticCurveTo(12.4, -21, 8.7, -21);
      ctx.quadraticCurveTo(5, -21, 4.6, -26);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#4a221c';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else {
      ctx.beginPath();
      if (P.mouth === 'flat') {
        ctx.moveTo(5.6, -23.4);
        ctx.lineTo(11.6, -23.4);
      } else if (P.mouth === 'smirk') {
        ctx.moveTo(5.4, -23.4);
        ctx.quadraticCurveTo(9.6, -22.6, 12.6, -24.8);
      } else ctx.arc(8.5, -24.8, 3.2, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.strokeStyle = P.beard ? '#dba391' : '#9c4f42';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (P.glasses) {
      const tint = P.glasses === 'tint';
      for (const lx of [-3, 7.5]) {
        if (tint) rr(ctx, lx - 0.4, -36.4, 9.8, 8.4, 3.6);
        else rr(ctx, lx, -35.6, 9, 7.2, 2);
        ctx.fillStyle = tint ? 'rgba(96,52,24,0.62)' : 'rgba(190,225,255,0.2)';
        ctx.fill();
        ctx.strokeStyle = tint ? '#1a1410' : '#2c3040';
        ctx.lineWidth = tint ? 1.5 : 1.25;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(6, -32.6);
      ctx.lineTo(7.5, -32.6);
      ctx.moveTo(-3, -33.2);
      ctx.lineTo(-9.6, -32);
      ctx.stroke();
      if (tint) {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(13.6, -34.8);
        ctx.lineTo(11.6, -31.4);
        ctx.stroke();
      }
    }
  }

  // a plain drinks can, held at (x, y)
  function drinkCan(ctx, x, y, col) {
    rr(ctx, x - 3.6, y - 12.5, 7.2, 14, 1.8);
    fillStroke(ctx, col, 1.8);
    ctx.fillStyle = '#d9dde6';
    ctx.fillRect(x - 2.9, y - 12, 5.8, 1.9);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(x - 2.3, y - 9, 1.4, 9);
  }

  // one drop of dribble
  function bead(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - 3.6 * r);
    ctx.quadraticCurveTo(x + 2.8 * r, y + 0.6 * r, x, y + 2 * r);
    ctx.quadraticCurveTo(x - 2.8 * r, y + 0.6 * r, x, y - 3.6 * r);
    ctx.fillStyle = '#9fe8ff';
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    dot(ctx, x - 0.6 * r, y - 0.1 * r, 0.5 * r, '#ffffff');
  }
  // The Dribbler's shirt: the wet tracks the dribble runs down. Each is
  // [x, how far down it reaches, wobble phase].
  const DRIBBLE = [[11.4, 19, 0], [7.4, 14, 1.7], [3.8, 7, 3.1]];
  const dribbleX = (tr, y) => tr[0] + Math.sin(y * 0.32 + tr[2]) * 1.3;

  function hoodStrings(ctx) {
    for (const x of [3.6, 8.6]) {
      ctx.beginPath();
      ctx.moveTo(x, -13.4);
      ctx.lineTo(x, -5.4);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  // kitchen foil, for the cardboard original
  function foil(ctx, x, y, w, h) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#f1f4f8');
    g.addColorStop(0.45, '#a3adbd');
    g.addColorStop(0.7, '#e3e8ef');
    g.addColorStop(1, '#8e98aa');
    return g;
  }
  // a foil-covered box edged with green tape
  function tapedBox(ctx, x, y, w, h, tape) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    fillStroke(ctx, foil(ctx, x, y, w, h), 2.5);
    ctx.strokeStyle = tape;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 2.7, y + 2.7, w - 5.4, h - 5.4);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; // creases in the foil
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, y + h * 0.25);
    ctx.lineTo(x + w * 0.55, y + h * 0.42);
    ctx.moveTo(x + w * 0.62, y + h * 0.6);
    ctx.lineTo(x + w * 0.36, y + h * 0.78);
    ctx.stroke();
  }

  // The Overlord's hat: a trucker cap airbrushed lime, with TECH on the front.
  // Whoever is playing wears it in Overlord mode, over whatever is already there.
  function techHat(ctx) {
    ctx.beginPath(); // mesh back
    ctx.moveTo(-21.5, -40);
    ctx.quadraticCurveTo(-23, -58, -2, -59);
    ctx.quadraticCurveTo(18, -59.5, 22, -43);
    ctx.closePath();
    fillStroke(ctx, '#15161f', 2.2);
    ctx.beginPath(); // foam front
    ctx.moveTo(-6, -58.8);
    ctx.quadraticCurveTo(18, -59.5, 22, -43);
    ctx.lineTo(-6, -41.2);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -59, 0, -42);
    g.addColorStop(0, '#6dff3a');
    g.addColorStop(0.55, '#b9ff8f');
    g.addColorStop(1, '#ffffff');
    fillStroke(ctx, g, 1.8);
    ctx.beginPath(); // brim
    ctx.moveTo(11, -45.4);
    ctx.quadraticCurveTo(26, -48, 37, -41);
    ctx.quadraticCurveTo(26, -39.2, 11, -40.8);
    ctx.closePath();
    fillStroke(ctx, '#15161f', 2);
    ctx.save();
    ctx.translate(8, -48.6);
    ctx.rotate(0.07);
    ctx.fillStyle = '#15161f';
    ctx.font = '700 9.5px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TECH', 0, 0);
    ctx.restore();
  }

  // drawn over the standard jetpack
  function kitPack(ctx, skin, t) {
    const kit = skin.kit;
    if (kit === 'cardboard') {
      // a cardboard box, taped shut
      ctx.beginPath();
      ctx.rect(-32, -19, 19, 34);
      fillStroke(ctx, vgrad(ctx, -19, 15, skin.pack, skin.packLo), 2.4);
      ctx.fillStyle = '#e2cf9e';
      ctx.fillRect(-24.5, -17.8, 4, 31.6);
      ctx.strokeStyle = 'rgba(60,35,10,0.55)'; // this way up
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-28.5, 6);
      ctx.lineTo(-28.5, -2);
      ctx.moveTo(-30.3, 0.4);
      ctx.lineTo(-28.5, -2.4);
      ctx.lineTo(-26.7, 0.4);
      ctx.stroke();
    } else if (kit === 'brandon') {
      // a pocket mainframe: blue rack stripes and status lights
      rr(ctx, -29.5, -16.5, 15, 29, 4);
      ctx.fillStyle = skin.packLo;
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        const y = -13.5 + i * 6.6;
        ctx.fillStyle = skin.accent;
        ctx.fillRect(-28, y, 8.5, 1.3);
        ctx.fillRect(-28, y + 2.3, 8.5, 1.3);
        dot(ctx, -17.2, y + 1.8, 1.1, Math.sin(t * 7 + i * 2.3) > 0 ? '#b6ff3c' : '#2c3347');
      }
    } else if (kit === 'glow') {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = neon(t, i);
        ctx.fillRect(-28, -12 + i * 7, 10, 2.6);
      }
      glow(ctx, -22, -4, 20, neon(t, 1), 0.4);
    } else if (kit === 'gold' || kit === 'director') {
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
    if (kit === 'cardboard') {
      tapedBox(ctx, -16, -16, 32, 36, skin.accent);
    } else if (kit === 'brandon') {
      // navy suit: shirt, collar and a red tie
      ctx.beginPath();
      ctx.moveTo(-3, -13.6);
      ctx.lineTo(12.5, -13.6);
      ctx.lineTo(5, 4);
      ctx.closePath();
      fillStroke(ctx, '#bcd6f5', 1.6);
      for (const c of [[-3, 3.2, 0.6], [12.5, 6.8, 9.4]]) {
        ctx.beginPath();
        ctx.moveTo(c[0], -13.6);
        ctx.lineTo(c[1], -13.6);
        ctx.lineTo(c[2], -8.8);
        ctx.closePath();
        fillStroke(ctx, '#f4f8ff', 1.2);
      }
      ctx.beginPath();
      ctx.moveTo(3, -13.6);
      ctx.lineTo(7, -13.6);
      ctx.lineTo(6.2, -10.4);
      ctx.lineTo(7.6, -1.5);
      ctx.lineTo(5, 2.2);
      ctx.lineTo(2.4, -1.5);
      ctx.lineTo(3.8, -10.4);
      ctx.closePath();
      fillStroke(ctx, '#d7263d', 1.2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(3.8, -10.9, 2.4, 1);
      // captain's pin
      star4(ctx, -8.6, -6.4, 3.4, 1.3);
      fillStroke(ctx, '#ffd23f', 1.2);
      // work badge with blue stripes
      ctx.fillStyle = '#59627a';
      ctx.fillRect(-9.2, 1.4, 2.4, 2.2);
      rr(ctx, -12.2, 3, 8.4, 10.5, 1.6);
      fillStroke(ctx, '#f4f8ff', 1.5);
      ctx.fillStyle = '#1f70c1';
      for (let i = 0; i < 4; i++) ctx.fillRect(-10.8, 5 + i * 2, 5.6, 1.1);
    } else if (kit === 'dribbler') {
      // a pale crewneck with dribble running down it (kitFront draws where it comes from)
      const wet = 'rgba(58,84,140,0.8)';
      ctx.save();
      rr(ctx, -15, -15, 30, 34, 9);
      ctx.clip();
      ctx.beginPath(); // the damp patch under the chin
      ctx.ellipse(8, -12.6, 8.5, 4.4, 0, 0, TAU);
      ctx.fillStyle = wet;
      ctx.fill();
      for (const tr of DRIBBLE) {
        // the track each trickle has left
        ctx.beginPath();
        for (let y = -13; y <= tr[1]; y += 2) ctx.lineTo(dribbleX(tr, y), y);
        ctx.strokeStyle = wet;
        ctx.lineWidth = 3.4;
        ctx.stroke();
      }
      DRIBBLE.forEach((tr, i) => {
        // and the drops sliding down it
        for (let b = 0; b < 2; b++) {
          const k = (t * (0.5 + i * 0.13) + b * 0.5 + i * 0.3) % 1;
          const y = -12 + k * (tr[1] + 12);
          bead(ctx, dribbleX(tr, y), y, 1);
        }
      });
      ctx.restore();
      rr(ctx, -15, -15, 30, 34, 9);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(4, -13.6, 6.5, 3.6, 0, 0.2, Math.PI - 0.2);
      ctx.strokeStyle = '#d9dde6';
      ctx.lineWidth = 1.1;
      ctx.stroke();
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
    } else if (kit === 'avg') {
      // the starter pack: a black puffer vest, unzipped over the hoodie
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let y = -8; y <= 11; y += 6.2) {
        ctx.moveTo(-13.6, y);
        ctx.lineTo(13.6, y);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -13.7);
      ctx.lineTo(12, -13.7);
      ctx.lineTo(10.2, 17.7);
      ctx.lineTo(2, 17.7);
      ctx.closePath();
      fillStroke(ctx, skin.limb, 1.6);
      hoodStrings(ctx);
    } else if (kit === 'marilyn') {
      // a plain grey sweatshirt
    } else if (kit === 'olivia') {
      // striped tee with a navy collar
      ctx.save();
      rr(ctx, -15, -15, 30, 34, 9);
      ctx.clip();
      ctx.fillStyle = '#3d4a7a';
      for (let y = -9; y < 19; y += 4.4) ctx.fillRect(-15, y, 30, 1.1);
      ctx.fillRect(-4, -15, 18, 3.4);
      ctx.restore();
      rr(ctx, -15, -15, 30, 34, 9);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else if (kit === 'director' || kit === 'warrior') {
      // hoodie: front pocket and drawstrings
      ctx.beginPath();
      ctx.moveTo(-8, 6.5);
      ctx.lineTo(10, 6.5);
      ctx.lineTo(12.8, 17.4);
      ctx.lineTo(-10.8, 17.4);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      hoodStrings(ctx);
    } else if (kit === 'darsh') {
      // ribbed knit, a thin chain and a good belt
      ctx.save();
      rr(ctx, -15, -15, 30, 34, 9);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -11; x <= 11.5; x += 3.2) {
        ctx.moveTo(x, -13);
        ctx.lineTo(x, 12.6);
      }
      ctx.stroke();
      ctx.fillStyle = '#6b4226';
      ctx.fillRect(-15, 12.6, 30, 4.2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-15, 12.6, 30, 0.9);
      ctx.fillStyle = skin.leg;
      ctx.fillRect(-15, 16.8, 30, 3);
      ctx.restore();
      rr(ctx, -15, -15, 30, 34, 9);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      rr(ctx, 1.5, 12.1, 6, 5.2, 1.2);
      ctx.strokeStyle = '#d9dde6';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(4, -13.4, 6.5, 4.4, 0, 0.2, Math.PI - 0.2);
      ctx.lineWidth = 1.1;
      ctx.stroke();
    } else if (kit === 'gold') {
      // a donation slot, with a coin forever dropping in
      const k = (t * 1.2) % 1;
      panel('#2a1c05');
      const ga = ctx.globalAlpha;
      ctx.globalAlpha = ga * Math.min(1, k * 5);
      ctx.beginPath();
      ctx.arc(4.5, -3.4 + k * 6, 3, 0, TAU);
      fillStroke(ctx, skin.accent, 1.3);
      ctx.globalAlpha = ga;
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
    if (PERSON[kit]) return personHeadBack(ctx, PERSON[kit], t);
    if (kit === 'cardboard') {
      // a strip of green tape for an antenna
      ctx.beginPath();
      ctx.moveTo(11, -46);
      ctx.lineTo(15 - ant, -60);
      tube(ctx, 2.4, skin.accent);
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
    return kit === 'brandon' || kit === 'gold';
  }

  // drawn on the helmet, under the visor
  function kitHeadFront(ctx, skin, t, ant) {
    const kit = skin.kit;
    if (PERSON[kit]) return personHeadFront(ctx, skin, PERSON[kit], t);
    if (kit === 'cardboard') return tapedBox(ctx, -20, -48, 42, 33, skin.accent);
    if (kit === 'brandon') {
      // dark hair with some height, swept across the forehead
      ctx.beginPath();
      ctx.moveTo(-21, -23);
      ctx.quadraticCurveTo(-25, -32, -22.5, -42);
      ctx.quadraticCurveTo(-21, -53, -9, -55);
      ctx.quadraticCurveTo(-3, -57.5, 3, -54.5);
      ctx.quadraticCurveTo(12, -57, 19, -51);
      ctx.quadraticCurveTo(24.5, -46, 21.5, -39.5);
      ctx.quadraticCurveTo(18, -44, 10, -43.5);
      ctx.quadraticCurveTo(3, -43.5, -2, -40);
      ctx.quadraticCurveTo(-6, -38.5, -7.5, -33);
      ctx.lineTo(-9.5, -27);
      ctx.quadraticCurveTo(-13, -29, -14, -23.5);
      ctx.closePath();
      fillStroke(ctx, '#15161f', 2.2);
      ctx.strokeStyle = 'rgba(125,135,175,0.5)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-14, -48);
      ctx.quadraticCurveTo(-4, -52.5, 4, -49.5);
      ctx.moveTo(8, -50);
      ctx.quadraticCurveTo(14, -50.5, 18, -46.5);
      ctx.stroke();
      ctx.beginPath(); // ear
      ctx.ellipse(-10.5, -30, 2.8, 3.8, 0, 0, TAU);
      fillStroke(ctx, skin.head, 1.6);
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
    if (PERSON[kit]) return personEyes(ctx, skin, s, PERSON[kit]), true;
    if (kit === 'cardboard') {
      // two blue bottle caps. They do not blink.
      for (const ex of [2, 12.6]) {
        ctx.beginPath();
        ctx.arc(ex, -35.4, 4.3, 0, TAU);
        fillStroke(ctx, skin.eye, 1.5);
        dot(ctx, ex, -35.4, 1.7, '#ffffff');
      }
      return true;
    }
    const shut = (c) => {
      ctx.fillStyle = c;
      ctx.fillRect(-1.5, -32.8, 6, 1.6);
      ctx.fillRect(8.5, -32.8, 6, 1.6);
    };
    if (kit === 'brandon') {
      // one ordinary eye, one upgrade (the glasses go on in kitHeadOver)
      if (s.blink) return shut(skin.eye), true;
      dot(ctx, 1.5, -32, 1.7, skin.eye);
      glow(ctx, 12, -32, 9, skin.accent, 0.8);
      dot(ctx, 12, -32, 2.1, skin.accent);
      dot(ctx, 12, -32, 0.9, '#ffffff');
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
    if (kit === 'cardboard') {
      // the mouth hole (someone is looking out of it)
      ctx.beginPath();
      ctx.moveTo(-1, -28);
      ctx.lineTo(15.4, -28);
      ctx.lineTo(12.6, -21.6);
      ctx.lineTo(1.8, -21.6);
      ctx.closePath();
      ctx.fillStyle = '#141018';
      ctx.fill();
      ctx.strokeStyle = skin.accent;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (kit === 'brandon') {
      // eyebrows, nose and a small smile
      ctx.strokeStyle = '#15161f';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-1.6, -37.6);
      ctx.lineTo(4, -38);
      ctx.moveTo(9.4, -38);
      ctx.lineTo(15, -37.4);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(120,70,40,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(7.6, -29.4);
      ctx.quadraticCurveTo(9.6, -27.2, 7.4, -26.6);
      ctx.stroke();
      ctx.strokeStyle = '#9c4f42';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(8.5, -24.8, 3.2, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
      // circuit traces down the cheek, under the upgraded eye
      ctx.strokeStyle = rgba(skin.accent, 0.9);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(16.4, -28);
      ctx.lineTo(18, -26.2);
      ctx.lineTo(18, -23.2);
      ctx.lineTo(15, -20.6);
      ctx.moveTo(18, -24.8);
      ctx.lineTo(15.4, -24.8);
      ctx.stroke();
      dot(ctx, 15, -20.6, 1.1, skin.accent);
      dot(ctx, 15.4, -24.8, 1, skin.accent);
      glow(ctx, 17, -24, 8, skin.accent, 0.35 + 0.2 * Math.sin(t * 4));
      // thin rectangular glasses
      for (const lx of [-3, 7.5]) {
        rr(ctx, lx, -35.6, 9, 7.2, 2);
        ctx.fillStyle = 'rgba(190,225,255,0.2)';
        ctx.fill();
        ctx.strokeStyle = '#2c3040';
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(6, -32.6);
      ctx.lineTo(7.5, -32.6);
      ctx.moveTo(-3, -33.2);
      ctx.lineTo(-9.6, -32);
      ctx.stroke();
    } else if (kit === 'glow') {
      // glowing visor rim
      rr(ctx, -8, -41, 27, 18, 7);
      ctx.strokeStyle = neon(t, 1);
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else if (PERSON[kit]) {
      personFace(ctx, skin, PERSON[kit]);
    }
  }

  // something to hold; drawn just before the near hand
  function kitHand(ctx, skin, t, hx, hy) {
    const kit = skin.kit;
    if (kit === 'brandon') {
      // never without the laptop
      rr(ctx, hx - 2, hy - 8.5, 13, 10, 1.8);
      fillStroke(ctx, '#aeb7c8', 1.8);
      dot(ctx, hx + 4.5, hy - 3.6, 1.5, skin.accent);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(hx - 0.8, hy - 0.4, 10.6, 1);
    } else if (kit === 'glow') {
      const c = neon(t, 1);
      ctx.beginPath();
      ctx.moveTo(hx - 3, hy + 5);
      ctx.lineTo(hx + 7, hy - 11);
      tube(ctx, 3.4, c);
      glow(ctx, hx + 3, hy - 4, 14, c, 0.6);
    } else if (kit === 'warrior') {
      // one of the two cans
      drinkCan(ctx, hx, hy, '#ffd23f');
    } else if (kit === 'avg') {
      // the group chat never sleeps
      rr(ctx, hx + 1, hy - 10, 7.5, 13, 1.8);
      fillStroke(ctx, '#15161f', 1.6);
      ctx.fillStyle = '#9fe8ff';
      ctx.fillRect(hx + 2.2, hy - 8.6, 5.1, 9.4);
      glow(ctx, hx + 4.8, hy - 4, 11, '#9fe8ff', 0.45);
      dot(ctx, hx + 8.3, hy - 9.8, 1.9, '#ffb020');
    }
  }

  // drawn last, over the whole bot
  function kitFront(ctx, skin, t) {
    const kit = skin.kit;
    if (kit === 'gold' || kit === 'director') {
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
    } else if (kit === 'darsh') {
      // the fit catches the light
      const k = Math.sin(t * 2.4);
      if (k > 0.05) {
        star4(ctx, 18.5, -38.5, 5.2 * k, 1.2 * k);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    } else if (kit === 'dribbler') {
      // where it comes from: a stream out of the corner of the mouth and over the chin
      const ga = ctx.globalAlpha;
      ctx.beginPath();
      for (let y = -23.4; y <= -13.4; y += 1.25) {
        const d = y + 23.4;
        ctx.lineTo(12.8 + d * 0.06 + Math.sin(y * 0.8 - t * 9) * d * 0.07, y);
      }
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 3.8;
      ctx.stroke();
      ctx.strokeStyle = '#9fe8ff';
      ctx.lineWidth = 2 + Math.sin(t * 7) * 0.35;
      ctx.stroke();
      for (let b = 0; b < 2; b++) {
        // drops running down the stream
        const k = (t * 1.5 + b * 0.5) % 1;
        bead(ctx, 12.9 + k * 0.6, -22.6 + k * 9, 0.85);
      }
      // a drop swells at the chin, lets go, and lands on the shirt
      const c = (t * 0.75) % 1;
      if (c < 0.55) bead(ctx, 13.5, -13 + c * 2.4, 0.6 + c * 2.2);
      else {
        const f = (c - 0.55) / 0.45;
        ctx.globalAlpha = ga * (1 - f * f);
        bead(ctx, 13.5, -11.6 + f * f * 26, 1.8);
        ctx.globalAlpha = ga;
      }
      for (let i = 0; i < 2; i++) {
        // and it keeps going, off the hem
        const k = (t * 1.1 + i * 0.5) % 1;
        ctx.globalAlpha = ga * (1 - k * 0.6);
        bead(ctx, [11.4, 7.4][i], 21 + k * k * 24, 1.15);
      }
      ctx.globalAlpha = ga;
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
    // a tall skin has longer legs: the feet stay where they are and
    // everything above the hips moves up
    const tall = U ? 0 : skin.tall || 0;
    if (tall) ctx.translate(0, -tall);
    // sitting down (the menu bot does it when nobody is looking): the hips
    // drop to the floor and the legs go out in front
    const sit = U ? 0 : s.sit || 0;
    if (sit) ctx.translate(0, sit * (16 + tall));
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
      const fx = lerp(hx + f[0], hx + 21 + tall * 0.8 - i * 2, sit), fy = lerp(17 + f[1] + tall, 20 + i * 1.5, sit);
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
        fillStroke(ctx, skin.shoe || skin.pack, 2.2);
      }
    };
    const armPos = (p, front) => {
      // some skins hold both hands out in front instead of swinging them
      if (!U && skin.armsOut) return front ? [11, 8 - vyN * 2 + Math.sin(t * 5) * 0.5] : [21, 3 - vyN * 2 + Math.sin(t * 5 + 1) * 0.5];
      // ...and some hold them back, which keeps the shirt front in view
      if (!U && skin.armsBack) {
        const sw = Math.sin(p) * 3 * g;
        return front ? [-9 + sw, 12 - vyN * 2] : [-5 - sw, 11 - vyN * 2];
      }
      const gx = Math.sin(p) * 9, gy = 15 - Math.abs(Math.sin(p)) * 2;
      const ax = front ? 13 + th * 2 : 9, ay = front ? 7 - vyN * 3 : 10 - vyN * 2;
      return [lerp(ax, gx, g), lerp(ay, gy, g)];
    };
    drawLeg(-5, ph + Math.PI, 0, skin.legLo || skin.limbLo);
    {
      const a = armPos(ph, false);
      limb(ctx, -1, -7, -1 + a[0], -7 + a[1], -3, U ? 8 : 6, skin.limbLo);
      if (U) {
        ctx.beginPath();
        ctx.arc(-1 + a[0], -7 + a[1], 6, 0, TAU);
        fillStroke(ctx, skin.trimLo, 2.2);
      } else if (skin.kit === 'warrior') {
        // the other can, in the far hand
        drinkCan(ctx, -1 + a[0], -7 + a[1], '#3f6fe0');
        ctx.beginPath();
        ctx.arc(-1 + a[0], -7 + a[1], 4.4, 0, TAU);
        fillStroke(ctx, skin.headLo, 2.2);
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
    } else if (!skin.noPack) {
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
    if (U || !skin.noVisor) {
      ctx.beginPath();
      ctx.arc(-18, -31, U ? 6.5 : 5, 0, TAU);
      fillStroke(ctx, U ? skin.trim : skin.limbLo, 2.2);
    }
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
      kitHeadFront(ctx, skin, t, ant);
    }
    // visor
    if (U || !skin.noVisor) {
      if (U) rr(ctx, -8, -39, 27, 14, 5);
      else rr(ctx, -8, -41, 27, 18, 7);
      ctx.fillStyle = U ? '#05080f' : '#0a1230';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }
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
    if (!U && s.hat) techHat(ctx);
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
    drawLeg(6, ph, 1, skin.leg || skin.limb);
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
        fillStroke(ctx, skin.hand || skin.pack, 2.2);
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

  // Half apps: a boneless wing, a pretzel stick or a wonton taco, drawn where a
  // donation would be.
  art.drawSnack = function (ctx, x, y, kind, size, t) {
    const k = (size || 40) / 34;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin((t || 0) * 3) * 0.16);
    ctx.scale(k, k);
    ctx.lineJoin = 'round';
    if (kind === 0) {
      ctx.beginPath(); // glazed wing
      ctx.moveTo(-11, 2);
      ctx.bezierCurveTo(-13, -8, -3, -11, 3, -8);
      ctx.bezierCurveTo(11, -9, 14, -1, 10, 5);
      ctx.bezierCurveTo(6, 11, -7, 10, -11, 2);
      ctx.closePath();
      fillStroke(ctx, vgrad(ctx, -10, 9, '#c9682a', '#8a3a12'), 2);
      ctx.strokeStyle = 'rgba(255,220,170,0.7)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-6, -4);
      ctx.quadraticCurveTo(0, -8, 6, -4.5);
      ctx.stroke();
      for (const d of [[-3, 2], [3, 4], [5, -1]]) dot(ctx, d[0], d[1], 0.9, '#fff3c9');
    } else if (kind === 1) {
      ctx.rotate(-0.5); // pretzel stick
      rr(ctx, -14, -4.6, 28, 9.2, 4.6);
      fillStroke(ctx, vgrad(ctx, -5, 5, '#c98232', '#8a4f18'), 2);
      ctx.strokeStyle = 'rgba(255,225,170,0.6)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const sx of [-8, -1, 6]) {
        ctx.moveTo(sx, -2.6);
        ctx.lineTo(sx + 3, 2.6);
      }
      ctx.stroke();
      for (const d of [[-10, -1], [-4, 1.6], [2, -1.6], [9, 0.6], [12, -1.4]]) dot(ctx, d[0], d[1], 0.9, '#ffffff');
    } else {
      for (const lx of [-8, -2.6, 2.8, 8]) {
        ctx.beginPath(); // slaw
        ctx.arc(lx, -3.4, 4, 0, TAU);
        fillStroke(ctx, lx === -2.6 ? '#ff9a3d' : '#8fdc5a', 1.6);
      }
      ctx.beginPath(); // wonton shell
      ctx.arc(0, -3, 13, 0, Math.PI);
      ctx.closePath();
      fillStroke(ctx, vgrad(ctx, -3, 10, '#f6d268', '#d79a2a'), 2);
      for (const d of [[-5, 2], [3, 4.6], [6, 0.6]]) dot(ctx, d[0], d[1], 0.9, '#b9781e');
    }
    ctx.restore();
  };

  // Anna has the aux: a music note where a donation would be
  const NOTES = ['#b388ff', '#9fe8ff', '#ffd23f'];
  art.drawNote = function (ctx, x, y, kind, size, t) {
    const k = (size || 40) / 34, col = NOTES[kind % 3];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin((t || 0) * 3) * 0.14);
    ctx.scale(k, k);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const heads = kind === 1 ? [[-8, 8], [7, 5]] : [[-3, 8]]; // a pair, or one on its own
    ctx.beginPath(); // stems, and the beam or flag
    for (const h of heads) {
      ctx.moveTo(h[0] + 4.6, h[1] - 1);
      ctx.lineTo(h[0] + 4.6, h[1] - 19);
    }
    if (kind === 1) {
      ctx.moveTo(-3.4, -11);
      ctx.lineTo(11.6, -14);
    } else {
      ctx.moveTo(1.6, -11);
      ctx.quadraticCurveTo(9, -9, 8.5, -2);
    }
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.stroke();
    for (const h of heads) {
      ctx.beginPath();
      ctx.ellipse(h[0], h[1], 5.6, 4.2, -0.4, 0, TAU);
      fillStroke(ctx, col, 2);
    }
    ctx.restore();
  };

  /* ---------- cameos: people who turn up during a run ---------- */
  const MARILYN = { kit: 'marilyn', noVisor: true, noPack: true, body: '#e3e6ec', bodyLo: '#b4bac8', head: '#f1c9a8', headLo: '#dba77d',
    hand: '#f1c9a8', limb: '#e3e6ec', limbLo: '#b4bac8', pack: '#3a4258', packLo: '#1b2031', eye: '#1c1a22', accent: '#6dff3a',
    flame: '#6dff3a', flameCore: '#ffffff' };
  const OLIVIA = { kit: 'olivia', noVisor: true, noPack: true, body: '#f3ecd8', bodyLo: '#d8cfb6', head: '#eab98f', headLo: '#cf9a70',
    hand: '#eab98f', limb: '#eab98f', limbLo: '#cf9a70', leg: '#22305e', legLo: '#141d3c', shoe: '#ff8a3d', pack: '#3a4258',
    packLo: '#1b2031', eye: '#1c1a22', accent: '#9fe8ff', flame: '#9fe8ff', flameCore: '#ffffff' };

  // The Overlord's saucer. She sits under the dome in her TECH hat and keeps a
  // spotlight on whoever she has come to watch (px, py); `line` is what she says.
  art.drawOverlordShip = function (ctx, x, y, t, line, px, py) {
    y += Math.sin(t * 3) * 4;
    if (px != null) {
      const prev = ctx.globalCompositeOperation;
      const beam = ctx.createLinearGradient(x, y + 20, px, py);
      beam.addColorStop(0, 'rgba(125,255,74,0.3)');
      beam.addColorStop(1, 'rgba(125,255,74,0.03)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(x - 16, y + 18);
      ctx.lineTo(x + 16, y + 18);
      ctx.lineTo(px + 76, py + 46);
      ctx.lineTo(px - 76, py + 46);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = prev;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath(); // the glass, behind her
    ctx.ellipse(0, -8, 34, 37, 0, Math.PI, TAU);
    ctx.closePath();
    ctx.fillStyle = 'rgba(159,232,255,0.2)';
    ctx.fill();
    art.drawRobot(ctx, { x: -3, y: 1, scale: 0.62, phase: 0, ground: 1, thrust: 0, vy: 0, t, ant: 0, blink: t % 3.4 < 0.12, hat: true }, MARILYN);
    glow(ctx, 0, 28, 34, '#6dff3a', 0.6);
    ctx.beginPath(); // belly
    ctx.ellipse(0, 17, 42, 13, 0, 0, Math.PI);
    ctx.closePath();
    fillStroke(ctx, '#3a4258', 2.4);
    ctx.beginPath(); // hull
    ctx.ellipse(0, 8, 78, 18, 0, 0, TAU);
    fillStroke(ctx, vgrad(ctx, -10, 26, '#d5dceb', '#5d6880'), 2.6);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 6, 64, 11, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
      // running lights round the rim
      const lx = -60 + i * 20, on = (Math.floor(t * 7) + i) % 3 === 0;
      dot(ctx, lx, 11 + (1 - (lx / 62) * (lx / 62)) * 4, 3.3, on ? '#8dff5a' : '#2f6a2a');
    }
    ctx.beginPath(); // the glass, in front
    ctx.ellipse(0, -8, 34, 37, 0, Math.PI, TAU);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, -8, 27, 30, 0, Math.PI * 1.12, Math.PI * 1.42);
    ctx.stroke();
    if (line) {
      ctx.font = '700 16px ' + FONT;
      const tw = ctx.measureText(line).width + 26, bx = -48 - tw, by = -74;
      ctx.beginPath(); // tail
      ctx.moveTo(bx + tw - 22, by + 26);
      ctx.lineTo(-34, -34);
      ctx.lineTo(bx + tw - 6, by + 16);
      ctx.closePath();
      fillStroke(ctx, '#ffffff', 2.4);
      rr(ctx, bx, by, tw, 32, 11);
      fillStroke(ctx, '#ffffff', 2.4);
      ctx.fillStyle = OUTLINE;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(line, bx + tw / 2, by + 17);
    }
    ctx.restore();
  };

  // Olivia, running flat out along the floor
  art.drawOlivia = function (ctx, x, t) {
    art.drawRobot(ctx, { x, y: FLOOR - 40, scale: 1, rot: 0.14, phase: t * 22, ground: 1, thrust: 0, vy: 0, t, ant: 0 }, OLIVIA);
  };

  // One of Sasha's payment requests: a paper plane towing a banner. It flies
  // right to left, and glows gold because catching it is a good thing.
  art.drawPayPlane = function (ctx, x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 2.4 + 1.2) * 0.1);
    ctx.lineJoin = 'round';
    glow(ctx, 0, 0, 52, '#ffd23f', 0.5);
    ctx.strokeStyle = OUTLINE; // tow line
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(14, 2);
    ctx.lineTo(36, 2);
    ctx.stroke();
    rr(ctx, 36, -12, 142, 28, 5);
    fillStroke(ctx, '#fff7c9', 2.2);
    ctx.fillStyle = OUTLINE;
    ctx.font = '700 13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VENMO SASHA BACK', 107, 2.5);
    ctx.beginPath(); // the plane, nose to the left
    ctx.moveTo(-32, 2);
    ctx.lineTo(18, -15);
    ctx.lineTo(8, 2);
    ctx.lineTo(18, 13);
    ctx.closePath();
    fillStroke(ctx, '#ffffff', 2.2);
    ctx.beginPath();
    ctx.moveTo(-32, 2);
    ctx.lineTo(8, 2);
    ctx.lineTo(3, 10);
    ctx.closePath();
    fillStroke(ctx, '#cfd6e6', 1.8);
    ctx.restore();
  };

  // Michelle mode: the floor is on fire
  art.drawCooked = function (ctx, camX, t) {
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, FLOOR - 300, 0, FLOOR);
    g.addColorStop(0, 'rgba(255,120,20,0)');
    g.addColorStop(1, 'rgba(255,120,20,' + (0.26 + 0.05 * Math.sin(t * 6)).toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, FLOOR - 300, W, 300);
    ctx.globalCompositeOperation = prev;
    const sc = camX * 0.9, first = Math.floor(sc / 90);
    for (let i = first; i * 90 - sc < W + 60; i++) {
      ctx.save();
      ctx.translate(i * 90 - sc, FLOOR + 3);
      ctx.scale(1, -1);
      flame(ctx, 0, 0, 34 + 22 * Math.abs(Math.sin(i * 12.9898)), 9, '#ff9a3d', '#fff3c9', t + i * 0.37);
      ctx.restore();
    }
  };

  // Scenery extras, drawn in among the crowd: The Warrior, who turns up now
  // and then and does not dance, and the neon sign for half apps hour.
  let warriorSprite = null, appsSign = null, storeSprite = null;
  function sceneryExtras(ctx, camX, t, halfApps) {
    const sc = camX * 0.16; // the crowd's layer
    if (halfApps) {
      if (!appsSign) {
        appsSign = makeCanvas(300, 120);
        const g = appsSign.getContext('2d');
        g.strokeStyle = 'rgba(180,190,220,0.5)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(60, 0);
        g.lineTo(60, 24);
        g.moveTo(240, 0);
        g.lineTo(240, 24);
        g.stroke();
        rr(g, 12, 22, 276, 86, 12);
        g.fillStyle = 'rgba(6,10,26,0.88)';
        g.fill();
        g.strokeStyle = 'rgba(125,255,122,0.55)';
        g.stroke();
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.shadowColor = '#7dff7a';
        g.shadowBlur = 16;
        g.fillStyle = '#c9ffc4';
        g.font = '700 40px ' + FONT;
        g.fillText('HALF APPS', 150, 56);
        g.shadowColor = '#ffd23f';
        g.shadowBlur = 10;
        g.fillStyle = '#ffe9a3';
        g.font = '600 15px ' + FONT;
        g.fillText('9 PM  ·  DONATIONS ×2', 150, 90);
      }
      const x = ((((560 - sc) % 1700) + 1700) % 1700) - 300;
      if (x < W) {
        ctx.globalAlpha *= Math.sin(t * 31) > 0.96 ? 0.5 : 1; // the neon flickers
        ctx.drawImage(appsSign, x, 296);
        ctx.globalAlpha = 1;
      }
    }
    // Charlotte's store: shutter down, opening soon, as it has been for six months
    const sx = ((((3900 - sc) % 5200) + 5200) % 5200) - 210;
    if (sx < W) {
      if (!storeSprite) {
        storeSprite = makeCanvas(200, 176);
        const g = storeSprite.getContext('2d');
        g.lineJoin = 'round';
        g.fillStyle = '#26305a'; // the booth
        g.fillRect(18, 52, 164, 122);
        g.strokeStyle = OUTLINE;
        g.lineWidth = 3;
        g.strokeRect(18, 52, 164, 122);
        const sh = g.createLinearGradient(0, 64, 0, 160); // roller shutter, down
        sh.addColorStop(0, '#aab3c6');
        sh.addColorStop(1, '#6f7a92');
        g.fillStyle = sh;
        g.fillRect(32, 64, 136, 100);
        g.strokeRect(32, 64, 136, 100);
        g.strokeStyle = 'rgba(8,13,31,0.35)';
        g.lineWidth = 1.4;
        g.beginPath();
        for (let y = 74; y < 162; y += 9) {
          g.moveTo(33, y);
          g.lineTo(167, y);
        }
        g.stroke();
        for (let i = 0; i < 8; i++) {
          // striped awning
          g.fillStyle = i % 2 ? '#ffffff' : '#39e03a';
          g.beginPath();
          g.moveTo(10 + i * 22.5, 30);
          g.lineTo(32.5 + i * 22.5, 30);
          g.lineTo(32.5 + i * 22.5, 52);
          g.arc(21.25 + i * 22.5, 52, 11.25, 0, Math.PI);
          g.closePath();
          g.fill();
        }
        g.strokeStyle = OUTLINE;
        g.lineWidth = 3;
        g.strokeRect(10, 30, 180, 22);
        rr(g, 36, 2, 128, 26, 6);
        g.fillStyle = '#0c1430';
        g.fill();
        g.stroke();
        g.fillStyle = '#ffffff';
        g.font = '700 17px ' + FONT;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('THE STORE', 100, 16);
        g.save(); // the notice taped to the shutter
        g.translate(100, 112);
        g.rotate(-0.06);
        g.fillStyle = '#fff7c9';
        g.fillRect(-46, -24, 92, 48);
        g.strokeRect(-46, -24, 92, 48);
        g.fillStyle = OUTLINE;
        g.font = '700 15px ' + FONT;
        g.fillText('OPENING', 0, -9);
        g.fillText('SOON', 0, 8);
        g.restore();
        g.globalCompositeOperation = 'source-atop'; // at the back of the room
        g.fillStyle = 'rgba(8,12,34,0.34)';
        g.fillRect(0, 0, 200, 176);
      }
      ctx.drawImage(storeSprite, sx, 396);
    }
    const wx = ((((2300 - sc) % 4200) + 4200) % 4200) - 160;
    if (wx < W) {
      if (!warriorSprite) {
        warriorSprite = makeCanvas(150, 190);
        const g = warriorSprite.getContext('2d');
        art.drawRobot(g, { x: 62, y: 120, scale: 1.3, phase: 0, ground: 1, thrust: 0, vy: 0, t: 0, ant: 0 }, art.skin('warrior'));
        g.globalCompositeOperation = 'source-atop'; // he is at the back of the room
        g.fillStyle = 'rgba(8,12,34,0.4)';
        g.fillRect(0, 0, 150, 190);
      }
      ctx.drawImage(warriorSprite, wx, 424, 114, 144);
    }
  }

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
      const comfort = ride.paint === 'comfort'; // The Director's truck matches the set
      const white = comfort ? vgrad(ctx, -46, 14, '#f0f8bd', '#b3c964') : vgrad(ctx, -46, 14, '#ffffff', '#c6cfe2');
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
        fillStroke(ctx, ride.paint === 'comfort' ? vgrad(ctx, -7, 19, '#f0f8bd', '#a9c05c') : vgrad(ctx, -7, 19, '#ffffff', '#b9c3d9'), 1.2);
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

    const signs = ['NO SITTING', 'NO SLEEPING', 'TECH HQ', 'HYDRATE', 'SNACKS', 'TECH CREW', 'STAY UP', 'DANCE',
      'HALF APPS', 'ASK SASHA', 'ASK CLAUDE', 'FIT CHECK', 'SO COOKED', 'COMFORT SET', 'STORE: SOON', 'OVERLORD HQ', 'AUX: ANNA', 'SYSTEMS: OK'];
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
  // Each finished layer is drawn once into a scrap canvas straight away: that
  // makes the browser do the real painting now instead of on its first frame
  // on screen.
  let scrap = null;
  art.prewarm = function (i) {
    i = ((i % art.THEMES.length) + art.THEMES.length) % art.THEMES.length;
    let set = themeCache[i];
    if (!set) set = themeCache[i] = { index: i, theme: art.THEMES[i] };
    const step = () => {
      const k = BUILDERS.find((b) => !set[b]);
      if (!k) return;
      buildLayer(set, k);
      if (!scrap) scrap = makeCanvas(8, 8).getContext('2d');
      scrap.drawImage(set[k], 0, 0, 8, 8);
      setTimeout(step, 140);
    };
    setTimeout(step, 140);
  };

  function tile(ctx, img, scroll, tw, snap, y) {
    let off = -(((scroll % tw) + tw) % tw);
    off = Math.round(off * snap) / snap; // land on whole device pixels: no shimmer
    for (let x = off; x < W; x += tw) ctx.drawImage(img, x, y || 0);
  }

  art.BEAT_HZ = 1.8; // the crowd bounces in time with the music (108 bpm)
  art.drawBackground = function (ctx, camX, set, snap, t, halfApps) {
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
    sceneryExtras(ctx, camX, t, halfApps);
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
