/* ============================================================
   core.js — namespace, config, shared state, math/canvas utils
   Loaded first. Everything hangs off the global `BR` object so the
   project can be split across plain <script> files and still run
   from file:// (no ES-module CORS issues, no build step).
   ============================================================ */
window.BR = window.BR || {};
(function (BR) {
  'use strict';

  // ---------- tunable config ----------
  var cfg = {
    COLS: 18, ROWS: 18,     // grid of room-tiles (bigger = more room for dark zones)
    CELL: 5.6,              // tile size (world units)
    WALL_H: 3.0,            // ceiling height
    WALL_T: 0.28,           // wall thickness
    EYE: 1.62,              // eye height
    PLAYER_R: 0.36,         // collision radius
    WALK: 2.9, RUN: 4.7,    // m/s
    BRAID: 0.40,            // fraction of leftover walls removed -> loops/open rooms
    POOL: 20,               // fixed point-lights bound to fixtures across the floor
    EXPOSURE: 1.16,         // tone-mapping exposure (master brightness dial)
    BATTERY_DRAIN: 0.95,    // lantern battery %/sec  (100% lasts ~105s, + spare batteries)
    SANITY_BASE: 0.16,      // sanity %/sec always
    SANITY_DARK: 0.7,       // extra sanity %/sec in full darkness
    SANITY_FEAR: 2.2,       // extra sanity %/sec right next to the entity
    TABLES: 5,              // tables (each with 3 drawers) spawned per level
    JUMP_V: 4.6,            // jump launch velocity (m/s) -> ~0.75m peak
    GRAVITY: 14.0,          // m/s^2
    CROUCH_DROP: 0.62,      // how far the eye lowers when crouched (m)
    CROUCH_SPEED: 0.48,     // crouch move-speed multiplier
    BLOOM: true,            // postprocessing bloom on/off
    BLOOM_STRENGTH: 0.6,    // lamps/eyes/wound glow
    BLOOM_RADIUS: 0.5,
    BLOOM_THRESHOLD: 0.72,
    SSAO: true,             // screen-space ambient occlusion (contact shadows in corners)
    ENVMAP: true,           // procedural PMREM environment for material reflections
    HUNTER_MODEL: null,     // optional path to a rigged .glb; null = procedural monster
    HUNTER_MODEL_SCALE: 1   // scale applied to a loaded .glb
  };
  cfg.W = cfg.COLS * cfg.CELL;
  cfg.H = cfg.ROWS * cfg.CELL;
  BR.cfg = cfg;

  // ---------- runtime context (filled by game.start) ----------
  BR.ctx = {
    canvas: null, renderer: null, scene: null, camera: null, clock: null,
    composer: null, bloom: null, ssao: null, fxEl: null,
    fogCol: null,
    colliders: [], maze: null,
    vWallMesh: null, hWallMesh: null, pillarMesh: null,
    pillarPos: [], panelPos: [],
    floor: null, ceil: null,
    ambient: null, hemi: null, flash: null,
    lamps: [], pool: [], housingMesh: null, diffuserMesh: null,
    pickupHolder: null, pickups: [], tables: [], exitDoor: null,
    entity: null,
    mats: {}, geo: {}
  };

  // ---------- mutable game state ----------
  BR.S = {
    playing: false, dead: false, uiOpen: false,
    pos: { x: 0, z: 0 }, yaw: 0, pitch: 0, bob: 0, shake: 0, stepTimer: 0,
    velY: 0, posY: 0, crouch: 0, grounded: true, breathTimer: 0,
    keys: {}, sens: 0.0024, playerRunning: false,
    health: 100, sanity: 100, stamina: 100, battery: 100,
    exhausted: false, flashOn: false, hasFlashlight: false, hasKey: false,
    level: 1, almondsDrunk: 0,
    inv: {}, order: [], active: 0, journal: [],
    spawnCell: [0, 0], baseFog: 0.045,
    damageFlash: 0, animT: 0, timeAlive: 0, attackBlipT: 0,
    flickerTimer: 0, humLfo: 0,
    whiteFlash: 0, whiteWasOn: false,
    monsterUniforms: null
  };

  // ---------- utilities ----------
  var util = {};
  util.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  util.lerp = function (a, b, t) { return a + (b - a) * t; };
  util.rand = function (a, b) { return a + Math.random() * (b - a); };
  util.makeCanvas = function (s) { var c = document.createElement('canvas'); c.width = c.height = s; return c; };

  util.noiseOverlay = function (ctx, w, h, amount, alpha) {
    var img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var n = (Math.random() * 2 - 1) * amount;
      d[i] = util.clamp(d[i] + n, 0, 255);
      d[i + 1] = util.clamp(d[i + 1] + n, 0, 255);
      d[i + 2] = util.clamp(d[i + 2] + n * 0.9, 0, 255);
      if (alpha != null) d[i + 3] = alpha;
    }
    ctx.putImageData(img, 0, 0);
  };

  util.stain = function (ctx, x, y, r, col, a) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + col + ',' + a + ')');
    g.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };

  // seamless stain: also draws wrapped copies so the texture tiles with no
  // visible seams (kills the "sectioned" look when a plane repeats the map).
  util.wrapStain = function (ctx, x, y, r, col, a, s) {
    for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) {
      if (ox === 0 && oy === 0) { util.stain(ctx, x, y, r, col, a); continue; }
      // only bother with wrapped copies that can reach across an edge
      if (x + ox * s > -r && x + ox * s < s + r && y + oy * s > -r && y + oy * s < s + r) {
        util.stain(ctx, x + ox * s, y + oy * s, r, col, a);
      }
    }
  };

  // Derive a tangent-space normal map from a height/luminance canvas (Sobel-ish).
  // lum=true uses perceived luminance of a colour canvas as height.
  util.canvasToNormal = function (srcCanvas, strength, lum) {
    var w = srcCanvas.width, h = srcCanvas.height;
    var sd = srcCanvas.getContext('2d').getImageData(0, 0, w, h).data;
    var out = util.makeCanvas(w); out.width = w; out.height = h;
    var octx = out.getContext('2d'), od = octx.createImageData(w, h), o = od.data;
    function H(x, y) {
      x = (x + w) % w; y = (y + h) % h; var i = (y * w + x) * 4;
      return lum ? (sd[i] * 0.299 + sd[i + 1] * 0.587 + sd[i + 2] * 0.114) / 255 : sd[i] / 255;
    }
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var dx = (H(x - 1, y) - H(x + 1, y)) * strength;
      var dy = (H(x, y - 1) - H(x, y + 1)) * strength;
      var len = Math.hypot(dx, dy, 1.0), i = (y * w + x) * 4;
      o[i] = (dx / len * 0.5 + 0.5) * 255;
      o[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      o[i + 2] = (1.0 / len * 0.5 + 0.5) * 255;
      o[i + 3] = 255;
    }
    octx.putImageData(od, 0, 0);
    var t = new THREE.CanvasTexture(out);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = BR.ctx.renderer ? BR.ctx.renderer.capabilities.getMaxAnisotropy() : 1;
    return t;
  };

  BR.util = util;
})(window.BR);
