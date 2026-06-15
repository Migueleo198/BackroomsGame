/* ============================================================
   lighting.js — detailed fluorescent troffer fixtures with a
   FIXED warm point-light per lit fixture (spread across the
   floor, no per-frame snapping). A few tubes flicker, a few
   dark clusters stay unlit so the lantern still matters.
   ============================================================ */
(function (BR) {
  'use strict';
  var T = THREE, L = {};

  var ON_COL = new T.Color(1.0, 0.93, 0.74);
  var DEAD_COL = new T.Color(0.07, 0.065, 0.05);
  var _c = new T.Color();

  // ---------- one-time setup ----------
  L.init = function () {
    var c = BR.cfg, ctx = BR.ctx, WALL_H = c.WALL_H, pan = ctx.panelPos;

    // ---- lantern (casts soft shadows) ----
    var flash = new T.SpotLight(0xffe9c4, 0, 22, Math.PI / 6.0, 0.5, 1.3);
    flash.castShadow = true;
    flash.shadow.mapSize.set(1024, 1024);
    flash.shadow.camera.near = 0.3; flash.shadow.camera.far = 22;
    flash.shadow.bias = -0.0009; flash.shadow.radius = 4;
    ctx.scene.add(flash, flash.target); ctx.flash = flash;

    // ---- fixtures: metal housing + bright frame + prismatic diffuser ----
    var housingMat = new T.MeshStandardMaterial({ color: 0x14130e, roughness: 0.45, metalness: 0.6 });
    var housing = new T.InstancedMesh(new T.BoxGeometry(2.56, 0.18, 0.94), housingMat, pan.length);
    housing.receiveShadow = true;

    var frameMat = new T.MeshStandardMaterial({ color: 0xece2c4, roughness: 0.6, metalness: 0.2, emissive: 0x2a2616, emissiveIntensity: 0.2 });
    var frame = new T.InstancedMesh(new T.BoxGeometry(2.46, 0.06, 0.82), frameMat, pan.length);

    var diffMat = new T.MeshBasicMaterial({ map: BR.tex.lampDiffuser(), color: 0xffffff, fog: true, side: T.DoubleSide });
    diffMat.toneMapped = false;   // stay full-bright so the bloom pass makes them glow
    var diffuser = new T.InstancedMesh(new T.PlaneGeometry(2.3, 0.68), diffMat, pan.length);

    var dummy = new T.Object3D(), i;
    for (i = 0; i < pan.length; i++) {
      dummy.position.set(pan[i][0], WALL_H - 0.05, pan[i][1]); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); housing.setMatrixAt(i, dummy.matrix);
      dummy.position.set(pan[i][0], WALL_H - 0.12, pan[i][1]); dummy.updateMatrix(); frame.setMatrixAt(i, dummy.matrix);
      dummy.position.set(pan[i][0], WALL_H - 0.13, pan[i][1]); dummy.rotation.set(Math.PI / 2, 0, 0); dummy.updateMatrix(); diffuser.setMatrixAt(i, dummy.matrix);
      diffuser.setColorAt(i, ON_COL);
    }
    housing.instanceMatrix.needsUpdate = true;
    frame.instanceMatrix.needsUpdate = true;
    diffuser.instanceMatrix.needsUpdate = true;
    diffuser.instanceColor.needsUpdate = true;
    ctx.scene.add(housing, frame, diffuser);
    ctx.housingMesh = housing; ctx.diffuserMesh = diffuser;

    // ---- a fixed pool of point-lights (bound to specific fixtures per level) ----
    for (i = 0; i < c.POOL; i++) {
      var pl = new T.PointLight(0xffe7b8, 0, c.CELL * 3.4, 2);
      ctx.scene.add(pl); ctx.pool.push(pl);
    }

    // ---- low warm ambient so dark clusters read as dark, lit halls stay cozy ----
    ctx.ambient = new T.AmbientLight(0xfff1cf, 0.26); ctx.scene.add(ctx.ambient);
    ctx.hemi = new T.HemisphereLight(0xd8c79a, 0x4a4128, 0.26); ctx.scene.add(ctx.hemi);
  };

  // ---------- assign lamp states + bind lights (per level) ----------
  L.placeLamps = function () {
    var ctx = BR.ctx, S = BR.S, c = BR.cfg, pan = ctx.panelPos, diff = ctx.diffuserMesh;
    ctx.lamps.length = 0;

    // a couple of dark clusters (grow slowly with depth)
    var nDark = 1 + Math.floor((S.level - 1) / 2);
    var seeds = [];
    for (var sdi = 0; sdi < nDark; sdi++) seeds.push(pan[(Math.random() * pan.length) | 0]);
    var darkR = c.CELL * 2.0;

    var spawnW = BR.world.cellCenter(S.spawnCell[0], S.spawnCell[1]);
    var nearestSpawn = -1, nearestD = 1e9, i;

    for (i = 0; i < pan.length; i++) {
      var x = pan[i][0], z = pan[i][1], state = 'on';
      for (var k = 0; k < seeds.length; k++) {
        if (Math.hypot(x - seeds[k][0], z - seeds[k][1]) < darkR) { state = 'dead'; break; }
      }
      if (state === 'on') {
        var r = Math.random();
        if (r < 0.12) state = 'flicker';
        else if (r < 0.16) state = 'dead';     // the odd broken tube
      }
      ctx.lamps.push({ x: x, z: z, state: state, flick: Math.random() * 10, lit: state !== 'dead' ? 1 : 0, light: null });
      var ds = Math.hypot(x - spawnW[0], z - spawnW[1]);
      if (ds < nearestD) { nearestD = ds; nearestSpawn = i; }
    }
    if (nearestSpawn >= 0) ctx.lamps[nearestSpawn].state = 'on';   // never strand spawn in the dark

    // paint diffusers
    for (i = 0; i < ctx.lamps.length; i++) diff.setColorAt(i, ctx.lamps[i].state === 'dead' ? DEAD_COL : ON_COL);
    diff.instanceColor.needsUpdate = true;

    // bind the fixed light pool to a SPREAD of lit fixtures (row-major stride => even coverage)
    var litIdx = [];
    for (i = 0; i < ctx.lamps.length; i++) if (ctx.lamps[i].state !== 'dead') litIdx.push(i);
    for (i = 0; i < ctx.pool.length; i++) { ctx.pool[i].intensity = 0; ctx.pool[i].userData.lamp = null; }
    var stride = Math.max(1, Math.floor(litIdx.length / ctx.pool.length));
    var used = 0;
    for (i = 0; i < litIdx.length && used < ctx.pool.length; i += stride) {
      var lamp = ctx.lamps[litIdx[i]], P = ctx.pool[used++];
      P.position.set(lamp.x, c.WALL_H - 0.3, lamp.z);
      P.userData.lamp = lamp; lamp.light = P;
    }
  };

  // ---------- per-frame: just flicker, no movement ----------
  L.update = function (dt) {
    var ctx = BR.ctx, S = BR.S, lamps = ctx.lamps, diff = ctx.diffuserMesh, t = S.timeAlive;
    var colorDirty = false, i, lp;
    for (i = 0; i < lamps.length; i++) {
      lp = lamps[i];
      if (lp.state === 'dead') { if (lp.light) lp.light.intensity = 0; continue; }
      var b;
      if (lp.state === 'flicker') {
        b = (Math.random() < 0.11) ? (0.08 + Math.random() * 0.3) : (0.84 + Math.random() * 0.22);
        _c.copy(ON_COL).multiplyScalar(0.4 + b * 0.6);
        diff.setColorAt(i, _c); colorDirty = true;
      } else {
        b = 0.95 + Math.sin(t * 6.5 + lp.flick) * 0.04;   // faint buzz
      }
      lp.lit = b;
      if (lp.light) lp.light.intensity = 1.7 * b;
    }
    if (colorDirty) diff.instanceColor.needsUpdate = true;

    L.updateFlashlight(dt);
  };

  // ---------- lantern ----------
  L.updateFlashlight = function (dt) {
    var ctx = BR.ctx, S = BR.S, cam = ctx.camera, flash = ctx.flash;
    if (S.flashOn) {
      S.battery = Math.max(0, S.battery - BR.cfg.BATTERY_DRAIN * dt);   // lasts a long time now
      if (S.battery <= 0) { S.flashOn = false; BR.ui.toast('The lantern dies.'); }
    }
    var want = S.flashOn ? 2.7 : 0;
    flash.intensity += (want - flash.intensity) * Math.min(1, dt * 12);
    flash.position.copy(cam.position);
    var cp = Math.cos(S.pitch);
    flash.target.position.set(
      cam.position.x + (-Math.sin(S.yaw) * cp) * 4,
      cam.position.y + Math.sin(S.pitch) * 4,
      cam.position.z + (-Math.cos(S.yaw) * cp) * 4
    );
  };

  L.toggleFlash = function () {
    var S = BR.S;
    if (!S.hasFlashlight) { BR.ui.toast('You have no lantern.'); return; }
    if (S.battery <= 0) { BR.ui.toast('The battery is dead. Find a new one.'); return; }
    S.flashOn = !S.flashOn;
    BR.audio.blip(S.flashOn ? 620 : 300, 0.05, 'square', 0.06);
    BR.items.renderHotbar();
  };

  // how lit is this spot? (lantern, or nearest fixture that actually has a light)
  L.litAt = function (x, z) {
    if (BR.S.flashOn) return 1;
    var lamps = BR.ctx.lamps, best = 1e9, CELL = BR.cfg.CELL;
    for (var i = 0; i < lamps.length; i++) {
      var lp = lamps[i];
      if (!lp.light || lp.state === 'dead') continue;
      var d = Math.hypot(lp.x - x, lp.z - z);
      if (d < best) best = d;
    }
    return BR.util.clamp(1 - best / (CELL * 2.4), 0, 1);
  };

  BR.lights = L;
})(window.BR);
