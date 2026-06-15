/* ============================================================
   textures.js — high-definition procedural textures.
   Every surface ships an albedo + a derived normal map (and the
   monster also gets a roughness map) so the lantern rakes across
   real-looking relief. Albedos are 1024px and tagged sRGB.
   ============================================================ */
(function (BR) {
  'use strict';
  var U = BR.util, T = THREE;
  var tex = {};

  function finish(c, srgb) {
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    if (srgb) t.encoding = T.sRGBEncoding;
    t.anisotropy = BR.ctx.renderer ? BR.ctx.renderer.capabilities.getMaxAnisotropy() : 1;
    return t;
  }

  // ---------------- yellow wallpaper ----------------
  tex.wallpaper = function () {
    var s = 1024, c = U.makeCanvas(s), ctx = c.getContext('2d');
    ctx.fillStyle = '#cdb95f'; ctx.fillRect(0, 0, s, s);
    // damask vertical striping (finer at HD)
    for (var x = 0; x < s; x += 16) {
      ctx.fillStyle = (Math.floor(x / 16) % 2 === 0) ? 'rgba(255,245,190,0.05)' : 'rgba(120,104,46,0.06)';
      ctx.fillRect(x, 0, 16, s);
    }
    // subtle damask motif rows
    ctx.globalAlpha = 0.05;
    for (var ry = 32; ry < s; ry += 96) for (var rx = 32; rx < s; rx += 96) {
      ctx.fillStyle = '#fff3c0';
      ctx.beginPath(); ctx.ellipse(rx, ry, 14, 22, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // wallpaper seams
    ctx.fillStyle = 'rgba(90,78,34,0.18)';
    ctx.fillRect(0, 0, 3, s); ctx.fillRect(Math.floor(s / 2), 0, 3, s);
    // age stains (seamless)
    for (var i = 0; i < 22; i++) U.wrapStain(ctx, Math.random() * s, Math.random() * s, 50 + Math.random() * 140, '92,72,30', 0.05 + Math.random() * 0.07, s);
    // grime gradient near the bottom
    var g = ctx.createLinearGradient(0, s * 0.75, 0, s);
    g.addColorStop(0, 'rgba(70,56,24,0)'); g.addColorStop(1, 'rgba(70,56,24,0.22)');
    ctx.fillStyle = g; ctx.fillRect(0, s * 0.75, s, s * 0.25);
    U.noiseOverlay(ctx, s, s, 16);
    return finish(c, true);
  };

  // ---------------- damp carpet (seamless, low-contrast so it doesn't "tile") ----------------
  tex.carpet = function () {
    var s = 1024, c = U.makeCanvas(s), ctx = c.getContext('2d');
    ctx.fillStyle = '#a89544'; ctx.fillRect(0, 0, s, s);
    // dense fibre speckle (inherently tileable)
    for (var i = 0; i < 120000; i++) {
      var x = Math.random() * s, y = Math.random() * s, v = Math.random();
      ctx.fillStyle = v < 0.5 ? 'rgba(60,50,22,0.16)' : 'rgba(210,195,120,0.13)';
      ctx.fillRect(x, y, 1.5, 1.5);
    }
    // damp blotches — seamless + smaller/softer so the repeat isn't obvious
    for (var j = 0; j < 24; j++) U.wrapStain(ctx, Math.random() * s, Math.random() * s, 55 + Math.random() * 120, '54,46,20', 0.06 + Math.random() * 0.08, s);
    U.noiseOverlay(ctx, s, s, 9);
    return finish(c, true);
  };

  // ---------------- acoustic ceiling tiles ----------------
  tex.ceiling = function () {
    var s = 1024, c = U.makeCanvas(s), ctx = c.getContext('2d');
    ctx.fillStyle = '#d6cda4'; ctx.fillRect(0, 0, s, s);
    var half = s / 2;
    for (var tx = 0; tx < 2; tx++) for (var ty = 0; ty < 2; ty++) {
      var ox = tx * half, oy = ty * half;
      for (var i = 0; i < 9000; i++) { ctx.fillStyle = 'rgba(120,112,82,0.16)'; ctx.fillRect(ox + Math.random() * half, oy + Math.random() * half, 1.4, 1.4); }
    }
    ctx.strokeStyle = 'rgba(70,64,44,0.5)'; ctx.lineWidth = 5;
    ctx.strokeRect(2, 2, half - 4, half - 4);
    ctx.strokeRect(half + 2, 2, half - 4, half - 4);
    ctx.strokeRect(2, half + 2, half - 4, half - 4);
    ctx.strokeRect(half + 2, half + 2, half - 4, half - 4);
    for (var k = 0; k < 10; k++) U.wrapStain(ctx, Math.random() * s, Math.random() * s, 50 + Math.random() * 110, '110,92,40', 0.10, s);
    U.noiseOverlay(ctx, s, s, 8);
    return finish(c, true);
  };

  // ---------------- procedural environment (equirectangular) for PMREM ----------------
  // A dim warm-top / dark-bottom gradient so PBR surfaces get believable
  // reflections + ambient without any HDR asset.
  tex.env = function () {
    var w = 256, h = 128, c = U.makeCanvas(w); c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.00, '#2a2418');   // ceiling glow
    g.addColorStop(0.45, '#16130d');
    g.addColorStop(0.55, '#0c0a07');   // horizon
    g.addColorStop(1.00, '#05050a');   // floor
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // a few faint warm lamp smudges near the top
    for (var i = 0; i < 8; i++) U.stain(ctx, Math.random() * w, Math.random() * h * 0.35, 14 + Math.random() * 22, '120,104,60', 0.25);
    var t = new T.CanvasTexture(c);
    t.mapping = T.EquirectangularReflectionMapping;
    return t;
  };

  // ---------------- monster skin ----------------
  function veinStroke(ctx, col, wdt, s) {
    var x = Math.random() * s, y = Math.random() * s, segs = 6 + (Math.random() * 6 | 0);
    ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y);
    var a = Math.random() * Math.PI * 2;
    for (var k = 0; k < segs; k++) {
      a += (Math.random() - 0.5) * 1.4;
      x += Math.cos(a) * (16 + Math.random() * 30); y += Math.sin(a) * (16 + Math.random() * 30);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // grey-brown, sickly, slightly necrotic — matches the reference creature
  tex.skinAlbedo = function () {
    var s = 1024, c = U.makeCanvas(s), ctx = c.getContext('2d');
    ctx.fillStyle = '#8d8579'; ctx.fillRect(0, 0, s, s);              // ashen grey-brown base
    var i;
    for (i = 0; i < 72; i++) {                                       // mottled flesh + decay + dried blood
      var t = ['120,112,100', '92,100,90', '110,72,64', '70,62,55', '86,80,86', '130,120,104'][i % 6];
      U.stain(ctx, Math.random() * s, Math.random() * s, 40 + Math.random() * 150, t, 0.06 + Math.random() * 0.12);
    }
    for (i = 0; i < 52; i++) veinStroke(ctx, 'rgba(60,48,70,' + (0.05 + Math.random() * 0.08) + ')', 1.4 + Math.random() * 3.2, s); // dark veins
    for (i = 0; i < 34; i++) veinStroke(ctx, 'rgba(120,48,44,' + (0.04 + Math.random() * 0.07) + ')', 0.8 + Math.random() * 1.8, s); // capillaries
    for (i = 0; i < 24000; i++) { ctx.fillStyle = 'rgba(48,42,36,' + (0.05 + Math.random() * 0.13) + ')'; ctx.fillRect(Math.random() * s, Math.random() * s, 1.3, 1.3); } // pores
    var g = ctx.createLinearGradient(0, 0, 0, s); g.addColorStop(0, 'rgba(120,116,108,0.10)'); g.addColorStop(1, 'rgba(45,38,34,0.22)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    U.noiseOverlay(ctx, s, s, 12);
    return finish(c, true);
  };

  // raw exposed-flesh texture for the chest wound (wet, dark red)
  tex.wound = function () {
    var s = 256, c = U.makeCanvas(s), ctx = c.getContext('2d');
    ctx.fillStyle = '#4a0f0c'; ctx.fillRect(0, 0, s, s);
    for (var i = 0; i < 30; i++) U.stain(ctx, Math.random() * s, Math.random() * s, 16 + Math.random() * 60, ['120,20,16', '30,4,4', '90,12,28'][i % 3], 0.18 + Math.random() * 0.3);
    for (i = 0; i < 9000; i++) { ctx.fillStyle = 'rgba(20,2,2,' + (0.1 + Math.random() * 0.2) + ')'; ctx.fillRect(Math.random() * s, Math.random() * s, 1.4, 1.4); }
    U.noiseOverlay(ctx, s, s, 16);
    return finish(c, true);
  };

  // grayscale height canvas (consumed by canvasToNormal)
  tex.skinHeightCanvas = function () {
    var s = 1024, c = U.makeCanvas(s), ctx = c.getContext('2d');
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, s, s);
    var i;
    for (i = 0; i < 40; i++) U.stain(ctx, Math.random() * s, Math.random() * s, 70 + Math.random() * 220, '210,210,210', 0.08);
    for (i = 0; i < 100; i++) veinStroke(ctx, 'rgba(225,225,225,0.20)', 1.6 + Math.random() * 3.0, s);
    for (i = 0; i < 150; i++) veinStroke(ctx, 'rgba(40,40,40,0.18)', 0.8 + Math.random() * 2.0, s);
    for (i = 0; i < 26000; i++) { var v = Math.random() < 0.5 ? '30,30,30' : '210,210,210'; ctx.fillStyle = 'rgba(' + v + ',0.18)'; ctx.fillRect(Math.random() * s, Math.random() * s, 1.2, 1.2); }
    U.noiseOverlay(ctx, s, s, 12);
    return c;
  };

  tex.skinRough = function () {
    var s = 512, c = U.makeCanvas(s), ctx = c.getContext('2d');
    ctx.fillStyle = '#c8c8c8'; ctx.fillRect(0, 0, s, s);
    for (var i = 0; i < 60; i++) U.stain(ctx, Math.random() * s, Math.random() * s, 14 + Math.random() * 60, '60,60,60', 0.10 + Math.random() * 0.2);
    U.noiseOverlay(ctx, s, s, 18);
    var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t;
  };

  // additive radial glow used for the monster's eyes (cold white, like the reference)
  tex.eyeGlow = function () {
    var s = 64, c = U.makeCanvas(s), ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.32, 'rgba(210,230,255,0.75)'); g.addColorStop(1, 'rgba(150,190,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    return new T.CanvasTexture(c);
  };

  // ---------------- furniture wood ----------------
  tex.wood = function () {
    var s = 512, c = U.makeCanvas(s), ctx = c.getContext('2d');
    ctx.fillStyle = '#5a4029'; ctx.fillRect(0, 0, s, s);
    // grain: stacked sine bands
    for (var y = 0; y < s; y += 3) {
      var shade = 40 + Math.sin(y * 0.18) * 18 + (Math.random() * 14 - 7);
      ctx.fillStyle = 'rgba(' + (60 + shade) + ',' + (40 + shade * 0.7) + ',' + (24 + shade * 0.4) + ',0.5)';
      ctx.fillRect(0, y, s, 2 + Math.random() * 1.5);
    }
    // long streaks
    for (var i = 0; i < 40; i++) {
      ctx.strokeStyle = 'rgba(30,18,8,' + (0.05 + Math.random() * 0.1) + ')'; ctx.lineWidth = 1 + Math.random() * 2;
      var yy = Math.random() * s; ctx.beginPath(); ctx.moveTo(0, yy);
      for (var x = 0; x < s; x += 20) ctx.lineTo(x, yy + Math.sin(x * 0.05) * 4 + (Math.random() * 4 - 2));
      ctx.stroke();
    }
    U.noiseOverlay(ctx, s, s, 10);
    return finish(c, true);
  };

  // ---------------- fluorescent diffuser panel (prismatic grid) ----------------
  tex.lampDiffuser = function () {
    var s = 256, c = U.makeCanvas(s), ctx = c.getContext('2d');
    ctx.fillStyle = '#fff4d2'; ctx.fillRect(0, 0, s, s);
    // prismatic cell grid
    ctx.strokeStyle = 'rgba(120,108,70,0.28)'; ctx.lineWidth = 2;
    for (var g = 0; g <= s; g += 22) { ctx.beginPath(); ctx.moveTo(g, 0); ctx.lineTo(g, s); ctx.moveTo(0, g); ctx.lineTo(s, g); ctx.stroke(); }
    // faint dead-tube shadow toward one end + speckle
    var gr = ctx.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, 'rgba(255,255,230,0.25)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(150,130,80,0.18)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, s, s);
    U.noiseOverlay(ctx, s, s, 8);
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
  };

  // EXIT sign for the level door
  tex.exitSign = function () {
    var s = 128, c = U.makeCanvas(s), ctx = c.getContext('2d');
    ctx.fillStyle = '#0a1a0a'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#6fff9a'; ctx.font = 'bold 34px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('EXIT', s / 2, s / 2);
    return new T.CanvasTexture(c);
  };

  BR.tex = tex;
})(window.BR);
